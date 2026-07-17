import path from "path";

const ROOT = process.cwd();

export const config = {
  openRouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
  dirs: {
    uploads: path.join(ROOT, ".runtime/uploads"),
    compositions: path.join(ROOT, ".runtime/compositions"),
    audio: path.join(ROOT, ".runtime/audio"),
    renders: path.join(ROOT, ".runtime/renders"),
    publicAudio: path.join(ROOT, "public/audio"),
  },
  defaults: {
    duration: 60,
    fps: 30,
    width: 1920,
    height: 1080,
    aspectRatio: "16:9" as const,
    voice: "Charon",
    musicVolume: -26,
  },
  limits: {
    maxFileSize: 20 * 1024 * 1024, // 20 MB
    maxFileCount: 10,
    maxTotalSize: 50 * 1024 * 1024, // 50 MB
    maxCombinedChars: 200_000,
    allowedTypes: [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/markdown",
    ],
    allowedExtensions: [".pdf", ".docx", ".txt", ".md"],
  },
} as const;

export type AspectRatio = "16:9" | "4:3" | "9:16" | "1:1";

export const ASPECT_DIMENSIONS: Record<AspectRatio, { w: number; h: number }> =
  {
    "16:9": { w: 1920, h: 1080 },
    "4:3": { w: 1440, h: 1080 },
    "9:16": { w: 1080, h: 1920 },
    "1:1": { w: 1080, h: 1080 },
  };
