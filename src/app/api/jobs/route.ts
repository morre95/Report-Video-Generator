import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import fs from "fs/promises";
import path from "path";
import { config } from "@/lib/config";
import type { AspectRatio } from "@/lib/config";
import { extractText } from "@/lib/documents/extract";
import { analyzeReport } from "@/lib/gemini/analyze";
import { generateVoiceover } from "@/lib/gemini/tts";
import { buildCompositionHtml } from "@/lib/hyperframes/build-composition";
import { renderComposition } from "@/lib/hyperframes/render";
import { retimeScenes } from "@/lib/timing";
import { setJob, updateJob, getJob, listJobs } from "@/lib/jobs/store";
import { resolveBackgroundMusic } from "@/lib/music";
import type { Job } from "@/lib/types";

export async function GET() {
  return NextResponse.json({ jobs: listJobs() });
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const prompt = (formData.get("prompt") as string) ?? "";
  const duration = parseInt((formData.get("duration") as string) ?? "60", 10);
  const aspectRatio = ((formData.get("aspectRatio") as string) ?? "16:9") as AspectRatio;
  const fps = parseInt((formData.get("fps") as string) ?? "30", 10);
  const voice = (formData.get("voice") as string) ?? config.defaults.voice;
  const backgroundMusic =
    (formData.get("backgroundMusic") as string) ?? "";
  const sourceText = (formData.get("sourceText") as string) ?? "";

  if (!file && !sourceText) {
    return NextResponse.json(
      { error: "No file or source text provided" },
      { status: 400 }
    );
  }

  if (!prompt) {
    return NextResponse.json(
      { error: "Prompt is required" },
      { status: 400 }
    );
  }

  const jobId = uuid();
  const fileName = file?.name ?? "demo-source.txt";

  const job: Job = {
    id: jobId,
    status: "uploading",
    progress: 0,
    config: {
      prompt,
      duration,
      aspectRatio,
      fps,
      voice,
      backgroundMusic,
      fileName,
    },
    createdAt: Date.now(),
  };
  setJob(job);

  processJob(jobId, file, sourceText).catch((err) => {
    console.error(`Job ${jobId} failed:`, err);
    updateJob(jobId, {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return NextResponse.json({ jobId, status: "uploading" });
}

async function processJob(
  jobId: string,
  file: File | null,
  preloadedText: string
) {
  const job = getJob(jobId)!;
  const cfg = job.config;

  // 1. Extract text
  updateJob(jobId, { status: "extracting", progress: 10 });
  let text = preloadedText;

  if (file && !text) {
    const uploadDir = path.join(config.dirs.uploads, jobId);
    await fs.mkdir(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buffer);
    text = await extractText(filePath);
  }

  if (!text.trim()) {
    throw new Error("Could not extract text from the document");
  }

  // 2. Analyze with Gemini
  updateJob(jobId, { status: "analyzing", progress: 25 });
  const presentation = await analyzeReport(text, cfg.prompt, cfg.duration);

  updateJob(jobId, { status: "generating_tts", progress: 45, presentation });

  // 3. Generate voiceover
  const { audioPath, durationSeconds: voiceoverDuration } =
    await generateVoiceover(
      presentation.narrationScript,
      jobId,
      cfg.voice
    );

  // Keep a short visual/music tail after the narrator finishes. If TTS runs
  // longer than requested, extend the render instead of cutting off speech.
  const outputDuration = Math.max(
    cfg.duration,
    Math.ceil(voiceoverDuration + 3)
  );

  // 4. Retime scenes to match the final render duration
  presentation.scenes = retimeScenes(presentation.scenes, outputDuration);
  presentation.totalDuration = outputDuration;

  // 5. Build composition
  updateJob(jobId, { status: "composing", progress: 60 });

  const compDir = path.join(config.dirs.compositions, jobId);
  await fs.mkdir(compDir, { recursive: true });
  const assetsDir = path.join(compDir, "assets");
  await fs.mkdir(assetsDir, { recursive: true });

  const compositionVoiceoverPath = path.join(assetsDir, "voiceover.wav");
  await fs.copyFile(audioPath, compositionVoiceoverPath);

  let compositionMusicSrc: string | undefined;
  const configuredMusicPath = await resolveBackgroundMusic(
    cfg.backgroundMusic
  );
  if (configuredMusicPath) {
    const compositionMusicPath = path.join(assetsDir, "background-music.mp3");
    await fs.copyFile(configuredMusicPath, compositionMusicPath);
    compositionMusicSrc = "assets/background-music.mp3";
  }

  const html = buildCompositionHtml(presentation, {
    duration: outputDuration,
    fps: cfg.fps,
    aspectRatio: cfg.aspectRatio,
    voiceoverPath: "assets/voiceover.wav",
    musicPath: compositionMusicSrc,
    musicVolume: config.defaults.musicVolume,
  });

  const compositionPath = path.join(compDir, "index.html");
  await fs.writeFile(compositionPath, html, "utf-8");

  // 6. Render
  updateJob(jobId, { status: "rendering", progress: 70 });

  const renderDir = path.join(config.dirs.renders, jobId);
  await fs.mkdir(renderDir, { recursive: true });
  const outputPath = path.join(renderDir, "output.mp4");

  await renderComposition({
    compositionPath,
    outputPath,
    fps: cfg.fps,
  });

  updateJob(jobId, {
    status: "complete",
    progress: 100,
    presentation,
    compositionPath,
    outputPath,
  });
}
