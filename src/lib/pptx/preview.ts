import fs from "fs/promises";
import path from "path";
import { config } from "@/lib/config";

const SAFE_SCENE_ID = /^[a-zA-Z0-9_-]+$/;

export function isSafeSceneId(sceneId: string): boolean {
  return SAFE_SCENE_ID.test(sceneId) && sceneId.length <= 128;
}

export async function resolveJobImagePath(
  jobId: string,
  sceneId: string
): Promise<string | null> {
  if (!isSafeSceneId(jobId) || !isSafeSceneId(sceneId)) {
    return null;
  }

  const filePath = path.join(config.dirs.images, jobId, `${sceneId}.png`);
  try {
    await fs.access(filePath);
    return filePath;
  } catch {
    return null;
  }
}

export async function listJobImageSceneIds(jobId: string): Promise<string[]> {
  if (!isSafeSceneId(jobId)) {
    return [];
  }

  const imageDir = path.join(config.dirs.images, jobId);
  try {
    const entries = await fs.readdir(imageDir);
    return entries
      .filter((name) => name.endsWith(".png"))
      .map((name) => name.slice(0, -4))
      .filter(isSafeSceneId)
      .sort();
  } catch {
    return [];
  }
}
