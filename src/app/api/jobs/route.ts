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
import { generatePresentationImages } from "@/lib/openrouter/images";
import { buildPptx } from "@/lib/pptx/build-pptx";
import { retimeScenes } from "@/lib/timing";
import { setJob, updateJob, getJob, listJobs } from "@/lib/jobs/store";
import { jobToHistoryItem } from "@/lib/jobs/persist";
import { resolveBackgroundMusic } from "@/lib/music";
import type { Job, OutputFormat, PresentationData } from "@/lib/types";

export async function GET() {
  const jobs = await listJobs();
  return NextResponse.json({
    jobs: jobs.map(jobToHistoryItem),
  });
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

function validateFileExtension(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return (config.limits.allowedExtensions as readonly string[]).includes(ext);
}

function parseOutputFormat(value: FormDataEntryValue | null): OutputFormat {
  if (value === "pptx" || value === "both" || value === "video") {
    return value;
  }
  return config.defaults.outputFormat;
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const uploadedFiles = formData.getAll("files") as File[];
  const prompt = (formData.get("prompt") as string) ?? "";
  const durationMode =
    formData.get("durationMode") === "manual" ? "manual" : "auto";
  const requestedDuration = parseInt(
    (formData.get("duration") as string) ?? String(config.defaults.duration),
    10
  );
  const duration =
    durationMode === "manual" ? requestedDuration : config.defaults.duration;
  const outputFormat = parseOutputFormat(formData.get("outputFormat"));
  const aspectRatio = ((formData.get("aspectRatio") as string) ?? "16:9") as AspectRatio;
  const fps = parseInt((formData.get("fps") as string) ?? "30", 10);
  const voice = (formData.get("voice") as string) ?? config.defaults.voice;
  const backgroundMusic =
    (formData.get("backgroundMusic") as string) ?? "";
  const sourceText = (formData.get("sourceText") as string) ?? "";
  const allowWebSearch =
    (formData.get("allowWebSearch") as string) === "true";

  if (uploadedFiles.length === 0 && !sourceText) {
    return NextResponse.json(
      { error: "No files or source text provided" },
      { status: 400 }
    );
  }

  if (!prompt) {
    return NextResponse.json(
      { error: "Prompt is required" },
      { status: 400 }
    );
  }

  if (
    durationMode === "manual" &&
    (!Number.isFinite(requestedDuration) ||
      requestedDuration < 15 ||
      requestedDuration > 300)
  ) {
    return NextResponse.json(
      { error: "Manual duration must be between 15 and 300 seconds" },
      { status: 400 }
    );
  }

  if (uploadedFiles.length > config.limits.maxFileCount) {
    return NextResponse.json(
      { error: `Maximum ${config.limits.maxFileCount} files allowed` },
      { status: 400 }
    );
  }

  let totalSize = 0;
  for (const f of uploadedFiles) {
    if (f.size > config.limits.maxFileSize) {
      return NextResponse.json(
        { error: `File "${f.name}" exceeds the ${config.limits.maxFileSize / 1024 / 1024} MB limit` },
        { status: 400 }
      );
    }
    if (!validateFileExtension(f.name)) {
      return NextResponse.json(
        { error: `Unsupported file type: "${f.name}". Allowed: ${config.limits.allowedExtensions.join(", ")}` },
        { status: 400 }
      );
    }
    totalSize += f.size;
  }
  if (totalSize > config.limits.maxTotalSize) {
    return NextResponse.json(
      { error: `Combined file size exceeds ${config.limits.maxTotalSize / 1024 / 1024} MB` },
      { status: 400 }
    );
  }

  const jobId = uuid();
  const fileNames = uploadedFiles.length > 0
    ? uploadedFiles.map((f) => f.name)
    : ["demo-source.txt"];

  const job: Job = {
    id: jobId,
    status: "uploading",
    progress: 0,
    config: {
      prompt,
      duration,
      durationMode,
      outputFormat,
      aspectRatio,
      fps,
      voice,
      backgroundMusic,
      fileNames,
      allowWebSearch,
    },
    createdAt: Date.now(),
  };
  setJob(job);

  processJob(jobId, uploadedFiles, sourceText).catch((err) => {
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
  files: File[],
  preloadedText: string
) {
  const job = await getJob(jobId);
  if (!job) return;

  const cfg = job.config;
  const wantsVideo = cfg.outputFormat === "video" || cfg.outputFormat === "both";
  const wantsPptx = cfg.outputFormat === "pptx" || cfg.outputFormat === "both";

  if (!updateJob(jobId, { status: "extracting", progress: 10 })) return;

  const sourceParts: { name: string; text: string }[] = [];

  if (preloadedText) {
    sourceParts.push({ name: "demo-source.txt", text: preloadedText });
  }

  if (files.length > 0) {
    const uploadDir = path.join(config.dirs.uploads, jobId);
    await fs.mkdir(uploadDir, { recursive: true });

    for (const file of files) {
      if (!(await getJob(jobId))) return;
      const safeName = sanitizeFileName(file.name);
      const filePath = path.join(uploadDir, safeName);
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(filePath, buffer);
      try {
        const text = await extractText(filePath);
        if (text.trim()) {
          sourceParts.push({ name: file.name, text });
        }
      } catch (err) {
        throw new Error(
          `Failed to extract text from "${file.name}": ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  if (sourceParts.length === 0 || sourceParts.every((p) => !p.text.trim())) {
    throw new Error("Could not extract text from any of the provided documents");
  }

  if (!(await getJob(jobId))) return;

  const text = buildBalancedSourceContext(sourceParts, config.limits.maxCombinedChars);

  if (!updateJob(jobId, { status: "analyzing", progress: 25 })) return;
  const presentation = await analyzeReport(
    text,
    cfg.prompt,
    cfg.duration,
    cfg.allowWebSearch,
    cfg.durationMode
  );

  if (!updateJob(jobId, { presentation, progress: 40 })) return;

  let compositionPath: string | undefined;
  let outputPath: string | undefined;
  let pptxPath: string | undefined;

  if (wantsVideo) {
    if (!(await getJob(jobId))) return;
    await buildVideoOutput(jobId, presentation, cfg);
    const updated = await getJob(jobId);
    if (!updated) return;
    compositionPath = updated.compositionPath;
    outputPath = updated.outputPath;
  }

  if (wantsPptx) {
    if (!(await getJob(jobId))) return;
    pptxPath = await buildPptxOutput(jobId, presentation, cfg.aspectRatio);
  }

  updateJob(jobId, {
    status: "complete",
    progress: 100,
    presentation,
    compositionPath,
    outputPath,
    pptxPath,
  });
}

async function buildVideoOutput(
  jobId: string,
  presentation: PresentationData,
  cfg: Job["config"]
) {
  updateJob(jobId, { status: "generating_tts", progress: 45 });

  const { audioPath, durationSeconds: voiceoverDuration } =
    await generateVoiceover(
      presentation.narrationScript,
      jobId,
      cfg.voice
    );

  const outputDuration = Math.max(
    presentation.totalDuration,
    Math.ceil(voiceoverDuration + 3)
  );

  presentation.scenes = retimeScenes(presentation.scenes, outputDuration);
  presentation.totalDuration = outputDuration;

  updateJob(jobId, { status: "composing", progress: 60, presentation });

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

  updateJob(jobId, { status: "rendering", progress: 75, compositionPath });

  const renderDir = path.join(config.dirs.renders, jobId);
  await fs.mkdir(renderDir, { recursive: true });
  const outputPath = path.join(renderDir, "output.mp4");

  await renderComposition({
    compositionPath,
    outputPath,
    fps: cfg.fps,
    duration: outputDuration,
  });

  updateJob(jobId, { outputPath, compositionPath, presentation });
}

async function buildPptxOutput(
  jobId: string,
  presentation: PresentationData,
  aspectRatio: AspectRatio
): Promise<string> {
  updateJob(jobId, { status: "generating_images", progress: 82 });
  const images = await generatePresentationImages(
    presentation,
    jobId,
    aspectRatio
  );

  updateJob(jobId, { status: "building_pptx", progress: 92 });
  const pptxPath = await buildPptx(presentation, jobId, {
    aspectRatio,
    images,
  });
  updateJob(jobId, { pptxPath });
  return pptxPath;
}

/**
 * Builds a combined source string from multiple documents, allocating the
 * character budget fairly so later files are not discarded.
 */
function buildBalancedSourceContext(
  sources: { name: string; text: string }[],
  maxChars: number
): string {
  if (sources.length === 0) return "";
  if (sources.length === 1) {
    const s = sources[0];
    const trimmed = s.text.slice(0, maxChars);
    return `=== SOURCE: ${s.name} ===\n${trimmed}`;
  }

  const perDoc = Math.floor(maxChars / sources.length);
  const parts = sources.map((s) => {
    const trimmed = s.text.slice(0, perDoc);
    return `=== SOURCE: ${s.name} ===\n${trimmed}`;
  });
  return parts.join("\n\n");
}
