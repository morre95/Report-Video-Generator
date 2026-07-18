import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { isAbortError, throwIfAborted } from "@/lib/abort";

const execFileAsync = promisify(execFile);
const hyperframesCli = path.join(
  process.cwd(),
  "node_modules/hyperframes/bin/hyperframes.mjs"
);

interface RenderOptions {
  compositionPath: string;
  outputPath: string;
  fps?: number;
  duration?: number;
  width?: number;
  height?: number;
  signal?: AbortSignal;
}

interface ProbeResult {
  streams?: Array<{
    codec_type?: string;
    width?: number;
    height?: number;
    duration?: string;
    nb_read_frames?: string;
  }>;
  format?: {
    duration?: string;
    size?: string;
  };
}

export async function renderComposition(
  opts: RenderOptions
): Promise<string> {
  const { compositionPath, outputPath, fps = 30, duration, signal } = opts;

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const failures: string[] = [];

  for (let attempt = 1; attempt <= 2; attempt++) {
    throwIfAborted(signal);
    await fs.rm(outputPath, { force: true });

    try {
      const { stderr } = await execFileAsync(
        process.execPath,
        [
          hyperframesCli,
          "render",
          path.dirname(compositionPath),
          "--output",
          outputPath,
          "--fps",
          String(fps),
          "--workers",
          "1",
          "--low-memory-mode",
        ],
        {
          cwd: process.cwd(),
          timeout: 600_000,
          maxBuffer: 50 * 1024 * 1024,
          signal,
        }
      );

      if (stderr && !stderr.toLowerCase().includes("warn")) {
        console.error("Render stderr:", stderr);
      }

      await validateRenderedVideo(outputPath, duration, signal);
      return outputPath;
    } catch (err: unknown) {
      if (isAbortError(err)) throw err;
      const message = err instanceof Error ? err.message : String(err);
      failures.push(`attempt ${attempt}: ${message}`);

      if (attempt < 2) {
        console.warn(
          `Render validation failed; retrying in low-memory mode (${message})`
        );
      }
    }
  }

  await fs.rm(outputPath, { force: true });
  throw new Error(`Render failed after 2 attempts: ${failures.join("; ")}`);
}

export async function validateRenderedVideo(
  outputPath: string,
  expectedDuration?: number,
  signal?: AbortSignal
): Promise<void> {
  throwIfAborted(signal);
  const stat = await fs.stat(outputPath);
  const minimumSize = 1_024;

  if (!stat.isFile() || stat.size < minimumSize) {
    throw new Error(
      `Rendered MP4 is incomplete (${stat.size} bytes; expected at least ${minimumSize})`
    );
  }

  const ffprobe = process.env.HYPERFRAMES_FFPROBE_PATH?.trim() || "ffprobe";
  const { stdout } = await execFileAsync(
    ffprobe,
    [
      "-v",
      "error",
      "-count_frames",
      "-show_entries",
      "stream=codec_type,width,height,duration,nb_read_frames:format=duration,size",
      "-of",
      "json",
      outputPath,
    ],
    {
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
      signal,
    }
  );

  let probe: ProbeResult;
  try {
    probe = JSON.parse(stdout) as ProbeResult;
  } catch {
    throw new Error("ffprobe returned invalid metadata for the rendered MP4");
  }

  const videoStream = probe.streams?.find(
    (stream) => stream.codec_type === "video"
  );
  if (!videoStream || !videoStream.width || !videoStream.height) {
    throw new Error("Rendered MP4 does not contain a valid video stream");
  }

  const decodedFrames = Number(videoStream.nb_read_frames);
  if (!Number.isFinite(decodedFrames) || decodedFrames < 1) {
    throw new Error("Rendered MP4 does not contain readable video frames");
  }

  const actualDuration = Number(
    probe.format?.duration ?? videoStream.duration
  );
  if (!Number.isFinite(actualDuration) || actualDuration <= 0) {
    throw new Error("Rendered MP4 has no readable duration");
  }

  if (expectedDuration) {
    const tolerance = Math.max(2, expectedDuration * 0.05);
    if (actualDuration < expectedDuration - tolerance) {
      throw new Error(
        `Rendered MP4 is too short (${actualDuration.toFixed(2)}s; expected about ${expectedDuration}s)`
      );
    }
  }
}

export async function checkHyperframesDeps(): Promise<{
  ok: boolean;
  message: string;
}> {
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [hyperframesCli, "doctor"],
      { timeout: 30_000 }
    );
    return { ok: true, message: stdout };
  } catch {
    return {
      ok: false,
      message:
        "Hyperframes dependencies missing. Run: npm install hyperframes && ensure FFmpeg is installed.",
    };
  }
}
