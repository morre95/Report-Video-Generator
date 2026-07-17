import fs from "fs/promises";
import path from "path";
import { config } from "@/lib/config";

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
