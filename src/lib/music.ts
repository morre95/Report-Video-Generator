import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { config } from "@/lib/config";
import { throwIfAborted } from "@/lib/abort";

const execFileAsync = promisify(execFile);

export async function listBackgroundMusic(): Promise<string[]> {
  await fs.mkdir(config.dirs.publicAudio, { recursive: true });

  const entries = await fs.readdir(config.dirs.publicAudio, {
    withFileTypes: true,
  });

  return entries
    .filter(
      (entry) =>
        entry.isFile() && path.extname(entry.name).toLowerCase() === ".mp3"
    )
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export async function resolveBackgroundMusic(
  fileName: string
): Promise<string | undefined> {
  if (!fileName) return undefined;

  if (
    path.basename(fileName) !== fileName ||
    path.extname(fileName).toLowerCase() !== ".mp3"
  ) {
    throw new Error("Invalid background music selection");
  }

  const available = await listBackgroundMusic();
  if (!available.includes(fileName)) {
    throw new Error(
      `Background music "${fileName}" was not found in public/audio`
    );
  }

  return path.join(config.dirs.publicAudio, fileName);
}

export async function probeAudioDurationSeconds(
  filePath: string,
  signal?: AbortSignal
): Promise<number> {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    { timeout: 30_000, signal }
  );
  const duration = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not read audio duration for ${filePath}`);
  }
  return duration;
}

/**
 * How many stream_loop iterations (-1 = infinite) are needed so ffmpeg
 * can cut a track to at least targetDurationSeconds.
 */
export function musicLoopIterations(
  sourceDurationSeconds: number,
  targetDurationSeconds: number
): number {
  if (
    !Number.isFinite(sourceDurationSeconds) ||
    sourceDurationSeconds <= 0 ||
    !Number.isFinite(targetDurationSeconds) ||
    targetDurationSeconds <= 0
  ) {
    return 0;
  }
  if (sourceDurationSeconds >= targetDurationSeconds - 0.05) {
    return 0;
  }
  return Math.ceil(targetDurationSeconds / sourceDurationSeconds) - 1;
}

/**
 * Write a background track long enough for the video. Short tracks are
 * looped with ffmpeg; already-long tracks are trimmed to the target length.
 */
export async function prepareLoopedBackgroundMusic(
  sourcePath: string,
  outputPath: string,
  targetDurationSeconds: number,
  signal?: AbortSignal
): Promise<void> {
  if (targetDurationSeconds <= 0) {
    throw new Error("Target music duration must be positive");
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  throwIfAborted(signal);
  const sourceDuration = await probeAudioDurationSeconds(sourcePath, signal);
  const loops = musicLoopIterations(sourceDuration, targetDurationSeconds);

  const args = ["-y", "-hide_banner", "-loglevel", "error"];
  if (loops > 0) {
    args.push("-stream_loop", String(loops));
  }
  args.push(
    "-i",
    sourcePath,
    "-t",
    targetDurationSeconds.toFixed(3),
    "-c:a",
    "libmp3lame",
    "-q:a",
    "4",
    outputPath
  );

  await execFileAsync("ffmpeg", args, { timeout: 120_000, signal });
}
