import fs from "fs/promises";
import path from "path";
import { config } from "@/lib/config";
import { isSafeSceneId } from "@/lib/validation";

export { isSafeSceneId } from "@/lib/validation";

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
