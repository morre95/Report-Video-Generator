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
import { resolveBackgroundMusic, prepareLoopedBackgroundMusic } from "@/lib/music";
import type { Job, OutputFormat, PresentationData } from "@/lib/types";
import {
  parseAspectRatio,
  parseBoolean,
  parseContentLength,
  parseDurationMode,
  parseFps,
  parseManualDuration,
  parseOutputFormat,
  parseVoice,
  validatePrompt,
  validateSourceText,
  validateUploadedFile,
  ValidationError,
} from "@/lib/validation";
import { isAbortError, throwIfAborted } from "@/lib/abort";
import { startTrackedJob } from "@/lib/jobs/control";

export async function GET() {
  const jobs = await listJobs();
  return NextResponse.json({
    jobs: jobs.map(jobToHistoryItem),
  });
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

export async function POST(req: NextRequest) {
  const declaredLength = req.headers.get("content-length");
  if (declaredLength === null) {
    return NextResponse.json(
      { error: "Content-Length header is required" },
      { status: 411 }
    );
  }

  let contentLength: number;
  try {
    contentLength = parseContentLength(declaredLength);
  } catch (error) {
    return validationResponse(error);
  }
  if (contentLength > config.limits.maxRequestSize) {
    return NextResponse.json(
      { error: `Request body exceeds ${config.limits.maxRequestSize / 1024 / 1024} MB` },
      { status: 413 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 });
  }

  let uploadedFiles: File[];
  let prompt: string;
  let durationMode: Job["config"]["durationMode"];
  let duration: number;
  let outputFormat: OutputFormat;
  let aspectRatio: AspectRatio;
  let fps: number;
  let voice: string;
  let backgroundMusic: string;
  let sourceText: string;
  let allowWebSearch: boolean;

  try {
    uploadedFiles = formData.getAll("files").map(validateUploadedFile);
    prompt = validatePrompt(formData.get("prompt"));
    durationMode = parseDurationMode(formData.get("durationMode"));
    duration = parseManualDuration(formData.get("duration"), durationMode);
    outputFormat = parseOutputFormat(formData.get("outputFormat"));
    aspectRatio = parseAspectRatio(formData.get("aspectRatio"));
    fps = parseFps(formData.get("fps"));
    voice = parseVoice(formData.get("voice"));
    const musicEntry = formData.get("backgroundMusic");
    if (musicEntry !== null && typeof musicEntry !== "string") {
      throw new ValidationError("Background music is invalid");
    }
    backgroundMusic = musicEntry ?? "";
    await resolveBackgroundMusic(backgroundMusic);
    sourceText = validateSourceText(formData.get("sourceText"));
    allowWebSearch = parseBoolean(
      formData.get("allowWebSearch"),
      "Allow web search"
    );
  } catch (error) {
    return validationResponse(error);
  }

  if (uploadedFiles.length === 0 && !sourceText.trim()) {
    return NextResponse.json(
      { error: "No files or source text provided" },
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

  const processPromise = startTrackedJob(jobId, (signal) =>
    processJob(jobId, uploadedFiles, sourceText, signal)
  );
  void processPromise.catch((err) => {
    if (isAbortError(err)) return;
    console.error(`Job ${jobId} failed:`, err);
    updateJob(jobId, {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return NextResponse.json({ jobId, status: "uploading" });
}

function validationResponse(error: unknown): NextResponse {
  const message =
    error instanceof ValidationError || error instanceof Error
      ? error.message
      : "Invalid request";
  return NextResponse.json({ error: message }, { status: 400 });
}

async function processJob(
  jobId: string,
  files: File[],
  preloadedText: string,
  signal: AbortSignal
) {
  throwIfAborted(signal);
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
      throwIfAborted(signal);
      if (!(await getJob(jobId))) return;
      const safeName = sanitizeFileName(file.name);
      const filePath = path.join(uploadDir, safeName);
      const buffer = Buffer.from(await file.arrayBuffer());
      throwIfAborted(signal);
      await fs.writeFile(filePath, buffer);
      try {
        throwIfAborted(signal);
        const text = await extractText(filePath);
        throwIfAborted(signal);
        if (text.trim()) {
          sourceParts.push({ name: file.name, text });
        }
      } catch (err) {
        if (isAbortError(err)) throw err;
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
  throwIfAborted(signal);

  const text = buildBalancedSourceContext(sourceParts, config.limits.maxCombinedChars);

  if (!updateJob(jobId, { status: "analyzing", progress: 25 })) return;
  const presentation = await analyzeReport(
    text,
    cfg.prompt,
    cfg.duration,
    cfg.allowWebSearch,
    cfg.durationMode,
    signal
  );

  if (!updateJob(jobId, { presentation, progress: 40 })) return;

  let compositionPath: string | undefined;
  let outputPath: string | undefined;
  let pptxPath: string | undefined;

  if (wantsVideo) {
    throwIfAborted(signal);
    if (!(await getJob(jobId))) return;
    await buildVideoOutput(jobId, presentation, cfg, signal);
    const updated = await getJob(jobId);
    if (!updated) return;
    compositionPath = updated.compositionPath;
    outputPath = updated.outputPath;
  }

  if (wantsPptx) {
    throwIfAborted(signal);
    if (!(await getJob(jobId))) return;
    pptxPath = await buildPptxOutput(
      jobId,
      presentation,
      cfg.aspectRatio,
      signal
    );
  }

  throwIfAborted(signal);
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
  cfg: Job["config"],
  signal: AbortSignal
) {
  throwIfAborted(signal);
  updateJob(jobId, { status: "generating_tts", progress: 45 });

  const { audioPath, durationSeconds: voiceoverDuration } =
    await generateVoiceover(
      presentation.narrationScript,
      jobId,
      cfg.voice,
      presentation.scenes,
      signal
    );

  // Keep the requested length when speech covers most of it; otherwise
  // shrink the video so the viewer is not left with minutes of silence.
  const closingHold = 3;
  const requested = presentation.totalDuration;
  const speechPlusHold = Math.ceil(voiceoverDuration + closingHold);
  const outputDuration =
    voiceoverDuration >= requested * 0.85
      ? Math.max(requested, speechPlusHold)
      : speechPlusHold;

  if (voiceoverDuration < requested * 0.85) {
    console.warn(
      `Job ${jobId}: voiceover is ${voiceoverDuration.toFixed(1)}s vs requested ${requested}s; fitting video to speech length.`
    );
  }

  presentation.scenes = retimeScenes(presentation.scenes, outputDuration);
  presentation.totalDuration = outputDuration;

  updateJob(jobId, { status: "composing", progress: 60, presentation });
  throwIfAborted(signal);

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
    await prepareLoopedBackgroundMusic(
      configuredMusicPath,
      compositionMusicPath,
      outputDuration,
      signal
    );
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
  throwIfAborted(signal);

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
    signal,
  });

  throwIfAborted(signal);
  updateJob(jobId, { outputPath, compositionPath, presentation });
}

async function buildPptxOutput(
  jobId: string,
  presentation: PresentationData,
  aspectRatio: AspectRatio,
  signal: AbortSignal
): Promise<string> {
  throwIfAborted(signal);
  updateJob(jobId, { status: "generating_images", progress: 82 });
  const images = await generatePresentationImages(
    presentation,
    jobId,
    aspectRatio,
    signal
  );

  throwIfAborted(signal);
  updateJob(jobId, { status: "building_pptx", progress: 92 });
  const pptxPath = await buildPptx(presentation, jobId, {
    aspectRatio,
    images,
  });
  throwIfAborted(signal);
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
