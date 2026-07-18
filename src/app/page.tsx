"use client";

import { useState, useCallback, useRef, useEffect } from "react";

type AspectRatio = "16:9" | "4:3" | "9:16" | "1:1";
type DurationMode = "auto" | "manual";
type OutputFormat = "video" | "pptx" | "both";
type JobStatus =
  | "idle"
  | "uploading"
  | "extracting"
  | "analyzing"
  | "generating_tts"
  | "generating_images"
  | "building_pptx"
  | "composing"
  | "rendering"
  | "complete"
  | "error";

interface JobState {
  id: string | null;
  status: JobStatus;
  progress: number;
  error: string | null;
  durationSeconds?: number;
  hasVideo?: boolean;
  hasPptx?: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  idle: "Ready",
  uploading: "Uploading document...",
  extracting: "Extracting text...",
  analyzing: "AI is analyzing your report...",
  generating_tts: "Generating voiceover...",
  generating_images: "Generating slide images...",
  building_pptx: "Building PowerPoint...",
  composing: "Building video composition...",
  rendering: "Rendering MP4...",
  complete: "Complete!",
  error: "Error",
};

const VOICES = [
  { id: "Charon", label: "Charon", desc: "Informative" },
  { id: "Kore", label: "Kore", desc: "Upbeat" },
  { id: "Puck", label: "Puck", desc: "Upbeat" },
  { id: "Zephyr", label: "Zephyr", desc: "Bright" },
  { id: "Aoede", label: "Aoede", desc: "Warm" },
  { id: "Fenrir", label: "Fenrir", desc: "Deep" },
];

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(60);
  const [durationMode, setDurationMode] = useState<DurationMode>("auto");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("video");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [fps, setFps] = useState(30);
  const [voice, setVoice] = useState("Charon");
  const [backgroundMusic, setBackgroundMusic] = useState("lofi7.mp3");
  const [musicFiles, setMusicFiles] = useState<string[]>([]);
  const [isMusicPreviewPlaying, setIsMusicPreviewPlaying] = useState(false);
  const [allowWebSearch, setAllowWebSearch] = useState(false);
  const [job, setJob] = useState<JobState>({
    id: null,
    status: "idle",
    progress: 0,
    error: null,
  });
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [pptxUrl, setPptxUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const musicPreviewRef = useRef<HTMLAudioElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [sourceText, setSourceText] = useState("");
  const [apiKeyStatus, setApiKeyStatus] = useState<{
    checked: boolean;
    ok: boolean;
    error?: string;
  }>({ checked: false, ok: true });

  useEffect(() => {
    fetch("/api/check-key")
      .then((r) => r.json())
      .then((data) =>
        setApiKeyStatus({
          checked: true,
          ok: data.ok,
          error:
            data.error ??
            (data.ok ? undefined : "The OpenRouter API health check failed."),
        })
      )
      .catch(() =>
        setApiKeyStatus({
          checked: true,
          ok: false,
          error: "Could not reach the API key check endpoint.",
        })
      );
  }, []);

  useEffect(() => {
    fetch("/api/music")
      .then((response) => {
        if (!response.ok) throw new Error("Could not load background music");
        return response.json();
      })
      .then((data: { files?: string[] }) => {
        const files = data.files ?? [];
        setMusicFiles(files);
        setBackgroundMusic((current) =>
          files.includes(current)
            ? current
            : files.includes("lofi7.mp3")
              ? "lofi7.mp3"
              : files[0] || ""
        );
      })
      .catch(() => setMusicFiles([]));
  }, []);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    if (arr.length === 0) return;
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => `${f.name}:${f.size}`));
      const deduped = arr.filter((f) => !existing.has(`${f.name}:${f.size}`));
      return [...prev, ...deduped].slice(0, 10);
    });
    setSourceText("");
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const loadDemo = useCallback(async () => {
    setDemoLoading(true);
    try {
      const res = await fetch("/api/demo");
      const data = await res.json();
      setSourceText(data.sourceText);
      setPrompt(data.prompt);
      setDuration(data.config.duration);
      setDurationMode(data.config.durationMode ?? "auto");
      setAspectRatio(data.config.aspectRatio);
      setVoice(data.config.voice);
      setFps(data.config.fps);
      setFiles([]);
    } catch {
      console.error("Failed to load demo");
    } finally {
      setDemoLoading(false);
    }
  }, []);

  const pollJob = useCallback((jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        const data = await res.json();
        setJob({
          id: jobId,
          status: data.status,
          progress: data.progress,
          error: data.error ?? null,
          durationSeconds: data.presentation?.totalDuration,
          hasVideo: !!data.outputPath,
          hasPptx: !!data.pptxPath,
        });

        if (data.status === "complete") {
          if (pollRef.current) clearInterval(pollRef.current);
          setVideoUrl(data.outputPath ? `/api/jobs/${jobId}/render` : null);
          setPptxUrl(data.pptxPath ? `/api/jobs/${jobId}/pptx` : null);
        } else if (data.status === "error") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // retry on next interval
      }
    }, 1500);
  }, []);

  useEffect(() => {
    const musicPreview = musicPreviewRef.current;
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      musicPreview?.pause();
    };
  }, []);

  const toggleMusicPreview = useCallback(async () => {
    const player = musicPreviewRef.current;
    if (!player || !backgroundMusic) return;

    if (player.paused) {
      try {
        await player.play();
        setIsMusicPreviewPlaying(true);
      } catch {
        setIsMusicPreviewPlaying(false);
      }
    } else {
      player.pause();
      setIsMusicPreviewPlaying(false);
    }
  }, [backgroundMusic]);

  const handleSubmit = useCallback(async () => {
    if (files.length === 0 && !sourceText) return;
    if (!prompt.trim()) return;

    setJob({ id: null, status: "uploading", progress: 5, error: null });
    setVideoUrl(null);
    setPptxUrl(null);

    const formData = new FormData();
    for (const f of files) {
      formData.append("files", f);
    }
    if (sourceText) formData.append("sourceText", sourceText);
    formData.append("prompt", prompt);
    formData.append("duration", String(duration));
    formData.append("durationMode", durationMode);
    formData.append("outputFormat", outputFormat);
    formData.append("aspectRatio", aspectRatio);
    formData.append("fps", String(fps));
    formData.append("voice", voice);
    formData.append("backgroundMusic", backgroundMusic);
    formData.append("allowWebSearch", String(allowWebSearch));

    try {
      const res = await fetch("/api/jobs", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setJob({ id: data.jobId, status: "uploading", progress: 10, error: null });
      pollJob(data.jobId);
    } catch (err) {
      setJob({
        id: null,
        status: "error",
        progress: 0,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, [
    files,
    sourceText,
    prompt,
    duration,
    durationMode,
    outputFormat,
    aspectRatio,
    fps,
    voice,
    backgroundMusic,
    allowWebSearch,
    pollJob,
  ]);

  const isProcessing =
    job.status !== "idle" &&
    job.status !== "complete" &&
    job.status !== "error";

  const hasInput = files.length > 0 || !!sourceText;
  const wantsVideo = outputFormat === "video" || outputFormat === "both";
  const wantsPptx = outputFormat === "pptx" || outputFormat === "both";
  const showVideoControls = wantsVideo;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg-primary)" }}>
      {/* Header */}
      <header
        className="border-b px-8 py-5 flex items-center justify-between"
        style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-black text-lg"
            style={{ background: "var(--accent)" }}
          >
            V
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
              Report Video Generator
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
              AI-powered document-to-video presentations
            </p>
          </div>
        </div>
        <button
          onClick={loadDemo}
          disabled={demoLoading || isProcessing}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-40"
          style={{
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--accent)";
            e.currentTarget.style.color = "var(--accent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.color = "var(--text-primary)";
          }}
        >
          {demoLoading ? "Loading..." : "Load NVIDIA Q1 FY2027 Demo"}
        </button>
      </header>

      {/* API key error banner */}
      {apiKeyStatus.checked && !apiKeyStatus.ok && (
        <div
          className="px-8 py-3 text-sm flex items-start gap-3"
          style={{
            background: "rgba(239, 68, 68, 0.08)",
            borderBottom: "1px solid rgba(239, 68, 68, 0.2)",
            color: "var(--error)",
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="flex-shrink-0 mt-0.5"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div>
            <p className="font-semibold">OpenRouter API key issue</p>
            <p className="mt-0.5 opacity-80">{apiKeyStatus.error}</p>
          </div>
        </div>
      )}

      <div className="flex-1 flex">
        {/* Left panel — configuration */}
        <div
          className="w-[480px] flex-shrink-0 border-r overflow-y-auto"
          style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
        >
          <div className="p-6 space-y-6">
            {/* File upload */}
            <div>
              <label
                className="block text-sm font-semibold mb-2"
                style={{ color: "var(--text-primary)" }}
              >
                Source Documents
              </label>
              <div
                className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 ${
                  isDragging ? "scale-[1.01]" : ""
                }`}
                style={{
                  borderColor: isDragging
                    ? "var(--accent)"
                    : hasInput
                      ? "var(--success)"
                      : "var(--border)",
                  background: isDragging
                    ? "rgba(99, 102, 241, 0.05)"
                    : "var(--bg-tertiary)",
                }}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.docx,.txt,.md"
                  multiple
                  onChange={(e) => {
                    if (e.target.files) addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                {sourceText && files.length === 0 ? (
                  <div className="animate-fade-up">
                    <div
                      className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center"
                      style={{ background: "rgba(34, 197, 94, 0.15)" }}
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <p className="font-medium" style={{ color: "var(--text-primary)" }}>
                      Demo source loaded
                    </p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                      {(sourceText.length / 1024).toFixed(1)} KB text
                    </p>
                  </div>
                ) : (
                  <>
                    <div
                      className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center"
                      style={{ background: files.length > 0 ? "rgba(34, 197, 94, 0.15)" : "rgba(99, 102, 241, 0.1)" }}
                    >
                      {files.length > 0 ? (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                      )}
                    </div>
                    <p className="font-medium" style={{ color: "var(--text-primary)" }}>
                      {files.length > 0
                        ? `${files.length} file${files.length > 1 ? "s" : ""} selected`
                        : "Drop your documents here"}
                    </p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                      PDF, DOCX, TXT, or Markdown — up to 10 files, 20 MB each
                    </p>
                  </>
                )}
              </div>

              {files.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {files.map((f, i) => (
                    <li
                      key={`${f.name}-${f.size}`}
                      className="flex items-center justify-between rounded-lg px-3 py-1.5 text-xs"
                      style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}
                    >
                      <span className="truncate mr-2">{f.name}</span>
                      <span className="flex items-center gap-2 flex-shrink-0">
                        <span style={{ color: "var(--text-secondary)" }}>
                          {(f.size / 1024).toFixed(1)} KB
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(i);
                          }}
                          className="hover:opacity-70 transition-opacity"
                          style={{ color: "var(--error)" }}
                          aria-label={`Remove ${f.name}`}
                        >
                          &times;
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Prompt */}
            <div>
              <label
                className="block text-sm font-semibold mb-2"
                style={{ color: "var(--text-primary)" }}
              >
                Presentation Brief
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                placeholder="Describe the presentation you want. E.g.: 'Create an investor update highlighting revenue growth and key product launches...'"
                className="w-full rounded-xl px-4 py-3 text-sm resize-none focus:outline-none transition-all"
                style={{
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = "var(--accent)")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "var(--border)")
                }
              />
            </div>

            {/* Output format */}
            <div>
              <label
                className="block text-sm font-semibold mb-2"
                style={{ color: "var(--text-primary)" }}
              >
                Output
              </label>
              <div
                className="grid grid-cols-3 rounded-lg p-1"
                style={{
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--border)",
                }}
              >
                {(
                  [
                    { id: "video", label: "Video" },
                    { id: "pptx", label: "PowerPoint" },
                    { id: "both", label: "Both" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setOutputFormat(opt.id)}
                    aria-pressed={outputFormat === opt.id}
                    className="rounded-md px-2 py-2 text-xs font-medium transition-all"
                    style={{
                      background:
                        outputFormat === opt.id ? "var(--accent)" : "transparent",
                      color:
                        outputFormat === opt.id ? "#fff" : "var(--text-secondary)",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {wantsPptx && (
                <p
                  className="text-[11px] mt-2 leading-relaxed"
                  style={{ color: "var(--text-secondary)" }}
                >
                  PowerPoint includes native charts and up to{" "}
                  {3} AI slide images (OpenRouter charges apply).
                </p>
              )}
            </div>

            {/* Settings grid */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {wantsVideo ? "Video Duration" : "Story Length"}
                </label>
                <div
                  className="grid grid-cols-2 rounded-lg p-1"
                  style={{
                    background: "var(--bg-tertiary)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {(["auto", "manual"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setDurationMode(mode)}
                      aria-pressed={durationMode === mode}
                      className="rounded-md px-2 py-1.5 text-xs font-medium transition-all"
                      style={{
                        background:
                          durationMode === mode
                            ? "var(--accent)"
                            : "transparent",
                        color:
                          durationMode === mode
                            ? "#fff"
                            : "var(--text-secondary)",
                      }}
                    >
                      {mode === "auto" ? "Auto" : "Manual"}
                    </button>
                  ))}
                </div>
                {durationMode === "manual" ? (
                  <input
                    type="number"
                    min={15}
                    max={300}
                    value={duration}
                    aria-label="Manual video duration in seconds"
                    onChange={(e) =>
                      setDuration(
                        Math.max(
                          15,
                          Math.min(300, parseInt(e.target.value) || 60)
                        )
                      )
                    }
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none mt-2"
                    style={{
                      background: "var(--bg-tertiary)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                    }}
                  />
                ) : (
                  <p
                    className="text-[11px] mt-2 leading-relaxed"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    AI fits the story to 30–180 seconds.
                  </p>
                )}
              </div>

              <div>
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Aspect Ratio
                </label>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                  className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none appearance-none"
                  style={{
                    background: "var(--bg-tertiary)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="16:9">16:9 (Landscape)</option>
                  <option value="4:3">4:3 (Standard)</option>
                  <option value="9:16">9:16 (Portrait)</option>
                  <option value="1:1">1:1 (Square)</option>
                </select>
              </div>

              {showVideoControls && (
                <div>
                  <label
                    className="block text-xs font-medium mb-1.5"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    FPS
                  </label>
                  <select
                    value={fps}
                    onChange={(e) => setFps(parseInt(e.target.value))}
                    className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none appearance-none"
                    style={{
                      background: "var(--bg-tertiary)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <option value="24">24 fps</option>
                    <option value="30">30 fps</option>
                    <option value="60">60 fps</option>
                  </select>
                </div>
              )}

              {showVideoControls && (
                <div>
                  <label
                    className="block text-xs font-medium mb-1.5"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Voice
                  </label>
                  <select
                    value={voice}
                    onChange={(e) => setVoice(e.target.value)}
                    className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none appearance-none"
                    style={{
                      background: "var(--bg-tertiary)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {VOICES.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label} — {v.desc}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {showVideoControls && (
            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                Background Music
              </label>
              <select
                value={backgroundMusic}
                onChange={(e) => {
                  musicPreviewRef.current?.pause();
                  setIsMusicPreviewPlaying(false);
                  setBackgroundMusic(e.target.value);
                }}
                className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none appearance-none"
                style={{
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
              >
                <option value="">No background music</option>
                {musicFiles.map((fileName) => (
                  <option key={fileName} value={fileName}>
                    {fileName}
                  </option>
                ))}
              </select>
              <p
                className="text-xs mt-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                Add MP3 files to public/audio, then reload this page.
              </p>
              {backgroundMusic && (
                <div className="flex items-center gap-3 mt-3">
                  <audio
                    ref={musicPreviewRef}
                    src={`/audio/${encodeURIComponent(backgroundMusic)}`}
                    onEnded={() => setIsMusicPreviewPlaying(false)}
                  />
                  <button
                    type="button"
                    onClick={toggleMusicPreview}
                    className="px-3 py-2 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: "var(--bg-tertiary)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {isMusicPreviewPlaying ? "Pause preview" : "Listen to preview"}
                  </button>
                  <span
                    className="text-xs truncate"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {backgroundMusic}
                  </span>
                </div>
              )}
            </div>
            )}

            {/* Web search opt-in */}
            <div>
              <label
                className="flex items-start gap-3 cursor-pointer select-none"
                style={{ color: "var(--text-primary)" }}
              >
                <input
                  type="checkbox"
                  checked={allowWebSearch}
                  onChange={(e) => setAllowWebSearch(e.target.checked)}
                  className="mt-0.5 accent-[var(--accent)]"
                  style={{ width: 16, height: 16 }}
                />
                <span>
                  <span className="text-sm font-medium">Allow online research</span>
                  <span
                    className="block text-xs mt-0.5 leading-relaxed"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Let the AI search the web for supplementary facts. Uploaded
                    documents remain the primary source. Adds a small OpenRouter
                    web-search charge.
                  </span>
                </span>
              </label>
            </div>

            {/* Generate button */}
            <button
              onClick={handleSubmit}
              disabled={(!hasInput || !prompt.trim()) || isProcessing}
              className="w-full py-3.5 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: isProcessing
                  ? "var(--bg-tertiary)"
                  : "var(--accent)",
                color: "#fff",
              }}
            >
              {isProcessing
                ? STATUS_LABELS[job.status]
                : outputFormat === "pptx"
                  ? "Generate PowerPoint"
                  : outputFormat === "both"
                    ? "Generate Video & PowerPoint"
                    : "Generate Video"}
            </button>

            {/* Progress bar */}
            {isProcessing && (
              <div className="animate-fade-up">
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="text-xs font-medium"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {STATUS_LABELS[job.status]}
                  </span>
                  <span
                    className="text-xs font-mono"
                    style={{ color: "var(--accent)" }}
                  >
                    {job.progress}%
                  </span>
                </div>
                <div
                  className="h-1.5 rounded-full overflow-hidden"
                  style={{ background: "var(--bg-tertiary)" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${job.progress}%`,
                      background:
                        "linear-gradient(90deg, var(--accent), var(--accent-hover))",
                    }}
                  />
                </div>
              </div>
            )}

            {/* Error display */}
            {job.status === "error" && job.error && (
              <div
                className="rounded-xl p-4 text-sm animate-fade-up"
                style={{
                  background: "rgba(239, 68, 68, 0.08)",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                  color: "var(--error)",
                }}
              >
                <p className="font-semibold mb-1">Generation failed</p>
                <p className="opacity-80 leading-relaxed whitespace-pre-wrap break-words">
                  {job.error}
                </p>
                {job.error.includes("openrouter.ai") && (
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{
                      background: "rgba(239, 68, 68, 0.15)",
                      color: "var(--error)",
                    }}
                  >
                    Open OpenRouter Keys &rarr;
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right panel — preview */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-auto">
          {job.status === "complete" && (videoUrl || pptxUrl) ? (
            <div className="w-full max-w-5xl animate-fade-up space-y-6">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2
                  className="text-lg font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {videoUrl ? "Preview" : "Downloads ready"}
                </h2>
                <div className="flex items-center gap-2">
                  {videoUrl && (
                    <a
                      href={`${videoUrl}?download=1`}
                      download="report-video.mp4"
                      className="px-4 py-2 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: "var(--accent)",
                        color: "#fff",
                      }}
                    >
                      Download MP4
                    </a>
                  )}
                  {pptxUrl && (
                    <a
                      href={pptxUrl}
                      download="report-presentation.pptx"
                      className="px-4 py-2 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: videoUrl
                          ? "var(--bg-tertiary)"
                          : "var(--accent)",
                        border: videoUrl ? "1px solid var(--border)" : undefined,
                        color: videoUrl ? "var(--text-primary)" : "#fff",
                      }}
                    >
                      Download PowerPoint
                    </a>
                  )}
                </div>
              </div>

              {videoUrl && (
                <div
                  className="rounded-2xl overflow-hidden shadow-2xl"
                  style={{
                    border: "1px solid var(--border)",
                    background: "#000",
                    aspectRatio: aspectRatio.replace(":", "/"),
                  }}
                >
                  <video
                    key={videoUrl}
                    src={videoUrl}
                    controls
                    playsInline
                    className="w-full h-full"
                    style={{ display: "block", background: "#000" }}
                  >
                    Your browser does not support video playback.
                  </video>
                </div>
              )}

              {!videoUrl && pptxUrl && (
                <div
                  className="rounded-2xl p-10 text-center"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--bg-secondary)",
                  }}
                >
                  <p
                    className="text-lg font-semibold mb-2"
                    style={{ color: "var(--text-primary)" }}
                  >
                    PowerPoint ready
                  </p>
                  <p
                    className="text-sm"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Your deck includes charts, shapes, and AI-generated visuals.
                  </p>
                </div>
              )}

              <p
                className="text-xs text-center"
                style={{ color: "var(--text-secondary)" }}
              >
                {durationMode === "auto" && job.durationSeconds && videoUrl
                  ? `Auto selected ${Math.round(job.durationSeconds)} seconds.`
                  : null}{" "}
                {videoUrl && pptxUrl
                  ? "Play the video or download either file."
                  : videoUrl
                    ? "Play the finished video here, or download the MP4."
                    : "Download the PowerPoint to open it in PowerPoint or Google Slides."}
              </p>
            </div>
          ) : isProcessing ? (
            <div className="text-center animate-fade-up">
              <div className="relative w-20 h-20 mx-auto mb-6">
                <div
                  className="absolute inset-0 rounded-full animate-spin"
                  style={{
                    border: "3px solid var(--border)",
                    borderTopColor: "var(--accent)",
                  }}
                />
                <div
                  className="absolute inset-2 rounded-full"
                  style={{ background: "var(--bg-primary)" }}
                />
                <div
                  className="absolute inset-0 flex items-center justify-center text-2xl font-bold"
                  style={{ color: "var(--accent)" }}
                >
                  {Math.round(job.progress)}
                </div>
              </div>
              <p
                className="text-lg font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {STATUS_LABELS[job.status]}
              </p>
              <p
                className="text-sm mt-2 max-w-md mx-auto"
                style={{ color: "var(--text-secondary)" }}
              >
                {job.status === "analyzing"
                  ? "OpenRouter is analyzing your document and designing the scene layout, charts, and narration script..."
                  : job.status === "generating_tts"
                    ? "Generating professional voiceover narration through OpenRouter..."
                    : job.status === "generating_images"
                      ? "Generating AI slide images for the PowerPoint deck..."
                      : job.status === "building_pptx"
                        ? "Assembling charts, shapes, and images into a PowerPoint file..."
                    : job.status === "composing"
                      ? "Building the Hyperframes HTML composition with animated charts and visuals..."
                      : job.status === "rendering"
                        ? "Rendering frames with Chromium and encoding MP4 with FFmpeg..."
                        : "Processing your document..."}
              </p>
            </div>
          ) : (
            <div className="text-center max-w-lg">
              <div
                className="w-24 h-24 rounded-2xl mx-auto mb-6 flex items-center justify-center"
                style={{ background: "rgba(99, 102, 241, 0.08)" }}
              >
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="23 7 16 12 23 17 23 7" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
              </div>
              <h2
                className="text-2xl font-bold mb-3"
                style={{ color: "var(--text-primary)" }}
              >
                Ready to generate
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Upload a report or load the NVIDIA demo, write a brief describing
                what story the video should tell, and hit Generate. The AI will
                design scenes with charts, KPIs, and a professional voiceover.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
