import fs from "fs/promises";
import path from "path";
import { config } from "@/lib/config";
import type { AspectRatio } from "@/lib/config";
import type { PresentationData, Scene } from "@/lib/types";
import {
  getOpenRouterHeaders,
  OPENROUTER_IMAGE_MODEL,
  openRouterUrl,
  parseOpenRouterError,
  parseOpenRouterResponseError,
} from "@/lib/openrouter/client";
import { isSafeJobId } from "@/lib/jobs/persist";
import { isSafeSceneId } from "@/lib/validation";
import { isAbortError, throwIfAborted, withTimeout } from "@/lib/abort";

export async function generateSlideImage(
  prompt: string,
  jobId: string,
  fileStem: string,
  aspectRatio: AspectRatio = "16:9",
  signal?: AbortSignal
): Promise<string | null> {
  try {
    if (!isSafeJobId(jobId) || !isSafeSceneId(fileStem)) {
      throw new Error("Unsafe image artifact path");
    }
    const response = await fetch(openRouterUrl("/images"), {
      method: "POST",
      headers: getOpenRouterHeaders(),
      body: JSON.stringify({
        model: OPENROUTER_IMAGE_MODEL,
        prompt,
        aspect_ratio: aspectRatio,
        output_format: "png",
        n: 1,
      }),
      signal: withTimeout(signal, 120_000),
    });

    if (!response.ok) {
      console.warn(
        `Slide image generation failed: ${await parseOpenRouterResponseError(response)}`
      );
      return null;
    }

    const result = (await response.json()) as {
      data?: Array<{ b64_json?: string; media_type?: string }>;
    };
    const b64 = result.data?.[0]?.b64_json;
    if (!b64) {
      console.warn("Slide image generation returned no image data");
      return null;
    }

    const imageDir = path.join(config.dirs.images, jobId);
    throwIfAborted(signal);
    await fs.mkdir(imageDir, { recursive: true });
    const filePath = path.resolve(imageDir, `${fileStem}.png`);
    if (!filePath.startsWith(`${path.resolve(imageDir)}${path.sep}`)) {
      throw new Error("Unsafe image artifact path");
    }
    await fs.writeFile(filePath, Buffer.from(b64, "base64"));
    return filePath;
  } catch (error) {
    if (isAbortError(error)) throw error;
    console.warn("Slide image generation error:", parseOpenRouterError(error));
    return null;
  }
}

/**
 * Pick up to maxImages scenes for AI art: title, closing, then one with visualDirection.
 */
export function selectScenesForImages(
  presentation: PresentationData,
  maxImages: number = config.defaults.maxPptxImages
): Scene[] {
  const selected: Scene[] = [];
  const title = presentation.scenes.find((s) => s.type === "title");
  const closing = presentation.scenes.find((s) => s.type === "closing");
  if (title) selected.push(title);
  if (closing && selected.length < maxImages) selected.push(closing);

  if (selected.length < maxImages) {
    const withDirection = presentation.scenes.find(
      (s) =>
        s.content.visualDirection &&
        !selected.some((picked) => picked.id === s.id)
    );
    if (withDirection) selected.push(withDirection);
  }

  return selected.slice(0, maxImages);
}

export async function generatePresentationImages(
  presentation: PresentationData,
  jobId: string,
  aspectRatio: AspectRatio,
  signal?: AbortSignal
): Promise<Record<string, string>> {
  const scenes = selectScenesForImages(presentation);
  const images: Record<string, string> = {};

  for (const scene of scenes) {
    throwIfAborted(signal);
    const prompt = buildImagePrompt(presentation, scene);
    const filePath = await generateSlideImage(
      prompt,
      jobId,
      scene.id,
      aspectRatio === "9:16" || aspectRatio === "1:1" ? aspectRatio : "16:9",
      signal
    );
    if (filePath) {
      images[scene.id] = filePath;
    }
  }

  return images;
}

function buildImagePrompt(presentation: PresentationData, scene: Scene): string {
  const direction = scene.content.visualDirection?.trim();
  const headline = scene.content.headline;
  return [
    "Create a polished presentation slide illustration.",
    "No text, logos, watermarks, or UI chrome in the image.",
    `Presentation topic: ${presentation.title}.`,
    `Slide focus: ${headline}.`,
    direction ? `Art direction: ${direction}.` : "",
    "Professional corporate style, high contrast, clean composition suitable for a business deck.",
  ]
    .filter(Boolean)
    .join(" ");
}
