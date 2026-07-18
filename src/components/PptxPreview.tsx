"use client";

import { useCallback, useEffect, useState } from "react";

type AspectRatio = "16:9" | "4:3" | "9:16" | "1:1";

interface ChartPoint {
  label: string;
  value: number;
  color?: string;
}

interface SceneContent {
  headline: string;
  subtext?: string;
  bullets?: string[];
  chart?: {
    type: string;
    title?: string;
    data: ChartPoint[];
  };
  kpiValue?: string;
  kpiLabel?: string;
  kpiChange?: string;
}

interface Scene {
  id: string;
  type: "title" | "kpi" | "chart" | "bullets" | "comparison" | "closing";
  content: SceneContent;
  narration: string;
}

interface PresentationData {
  title: string;
  subtitle?: string;
  sourceAttribution: string;
  scenes: Scene[];
  colorPalette: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
}

export interface PptxPreviewProps {
  jobId: string;
  presentation: PresentationData;
  imageSceneIds: string[];
  aspectRatio: AspectRatio;
}

function ChartPreview({
  chart,
  primary,
  accent,
}: {
  chart: NonNullable<SceneContent["chart"]>;
  primary: string;
  accent: string;
}) {
  const data = chart.data ?? [];
  if (!data.length) {
    return (
      <p className="text-sm opacity-60" style={{ color: "inherit" }}>
        No chart data
      </p>
    );
  }

  const max = Math.max(...data.map((d) => d.value), 1);

  if (chart.type === "donut") {
    const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
    const stops = data.reduce<{ css: string[]; offset: number }>(
      (acc, d, i) => {
        const pct = (d.value / total) * 100;
        const start = acc.offset;
        const end = start + pct;
        const color = d.color || (i % 2 === 0 ? primary : accent);
        return {
          offset: end,
          css: [...acc.css, `${color} ${start}% ${end}%`],
        };
      },
      { css: [], offset: 0 }
    ).css;

    return (
      <div className="flex flex-col items-center gap-3 h-full justify-center">
        {chart.title ? (
          <p className="text-xs font-medium opacity-80">{chart.title}</p>
        ) : null}
        <div
          className="rounded-full shrink-0"
          style={{
            width: "min(42%, 160px)",
            aspectRatio: "1",
            background: `conic-gradient(${stops.join(", ")})`,
            mask: "radial-gradient(circle, transparent 42%, black 43%)",
            WebkitMask: "radial-gradient(circle, transparent 42%, black 43%)",
          }}
        />
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
          {data.map((d, i) => (
            <span key={d.label} className="text-[10px] opacity-80 flex items-center gap-1">
              <span
                className="inline-block w-2 h-2 rounded-sm"
                style={{
                  background: d.color || (i % 2 === 0 ? primary : accent),
                }}
              />
              {d.label}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (chart.type === "line") {
    const points = data
      .map((d, i) => {
        const x = (i / Math.max(data.length - 1, 1)) * 100;
        const y = 100 - (d.value / max) * 85 - 5;
        return `${x},${y}`;
      })
      .join(" ");

    return (
      <div className="h-full flex flex-col gap-2">
        {chart.title ? (
          <p className="text-xs font-medium opacity-80">{chart.title}</p>
        ) : null}
        <svg viewBox="0 0 100 100" className="flex-1 w-full min-h-0" preserveAspectRatio="none">
          <polyline
            fill="none"
            stroke={accent}
            strokeWidth="2"
            points={points}
            vectorEffect="non-scaling-stroke"
          />
          {data.map((d, i) => {
            const x = (i / Math.max(data.length - 1, 1)) * 100;
            const y = 100 - (d.value / max) * 85 - 5;
            return (
              <circle key={d.label} cx={x} cy={y} r="1.8" fill={primary} />
            );
          })}
        </svg>
        <div className="flex justify-between gap-1">
          {data.map((d) => (
            <span key={d.label} className="text-[9px] opacity-60 truncate flex-1 text-center">
              {d.label}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-2">
      {chart.title ? (
        <p className="text-xs font-medium opacity-80">{chart.title}</p>
      ) : null}
      <div className="flex-1 flex items-end gap-2 min-h-0 px-1">
        {data.map((d, i) => (
          <div key={d.label} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
            <div
              className="w-full rounded-t-sm transition-all"
              style={{
                height: `${Math.max((d.value / max) * 100, 4)}%`,
                background: d.color || (i % 2 === 0 ? primary : accent),
                minHeight: 4,
              }}
            />
            <span className="text-[9px] opacity-60 truncate w-full text-center">
              {d.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlideBody({
  scene,
  presentation,
  imageUrl,
}: {
  scene: Scene;
  presentation: PresentationData;
  imageUrl?: string;
}) {
  const { colorPalette: palette } = presentation;
  const content = scene.content;
  const hasImage = !!imageUrl;

  switch (scene.type) {
    case "title":
      return (
        <div className="flex h-full gap-4 px-[4.5%] pt-[8%] pb-[6%]">
          <div className={`flex flex-col justify-center ${hasImage ? "w-[52%]" : "w-full"}`}>
            <h3 className="text-[clamp(1.1rem,2.8vw,2rem)] font-bold leading-tight mb-3">
              {content.headline}
            </h3>
            {content.subtext ? (
              <p className="text-[clamp(0.75rem,1.4vw,1rem)] opacity-80 leading-snug">
                {content.subtext}
              </p>
            ) : null}
            {presentation.sourceAttribution ? (
              <p className="text-[clamp(0.6rem,1vw,0.75rem)] opacity-50 mt-auto pt-6">
                {presentation.sourceAttribution}
              </p>
            ) : null}
          </div>
          {imageUrl ? (
            <div className="flex-1 min-w-0 rounded-lg overflow-hidden self-stretch">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
          ) : null}
        </div>
      );

    case "kpi":
      return (
        <div className="h-full flex flex-col px-[4.5%] py-[5%]">
          <p className="text-[clamp(0.8rem,1.5vw,1.1rem)] opacity-75 mb-4">
            {content.headline}
          </p>
          <div
            className="flex-1 rounded-xl flex flex-col items-center justify-center px-4"
            style={{ background: palette.secondary }}
          >
            <p
              className="text-[clamp(2rem,6vw,3.5rem)] font-bold leading-none"
              style={{ color: palette.accent }}
            >
              {content.kpiValue || "—"}
            </p>
            {content.kpiLabel ? (
              <p className="text-[clamp(0.75rem,1.3vw,1rem)] mt-3 opacity-90">
                {content.kpiLabel}
              </p>
            ) : null}
            {content.kpiChange ? (
              <p
                className="text-[clamp(0.85rem,1.4vw,1.1rem)] font-semibold mt-2"
                style={{ color: palette.accent }}
              >
                {content.kpiChange}
              </p>
            ) : null}
          </div>
        </div>
      );

    case "chart":
    case "comparison":
      return (
        <div className="h-full flex flex-col px-[4%] py-[4%]">
          <h3 className="text-[clamp(0.95rem,1.8vw,1.35rem)] font-bold mb-3">
            {content.headline}
          </h3>
          <div className="flex-1 min-h-0">
            {content.chart ? (
              <ChartPreview
                chart={content.chart}
                primary={palette.primary}
                accent={palette.accent}
              />
            ) : null}
          </div>
        </div>
      );

    case "bullets":
      return (
        <div className="flex h-full gap-4 px-[4.5%] py-[5%]">
          <div className={`flex flex-col ${hasImage ? "w-[52%]" : "w-full"}`}>
            <h3 className="text-[clamp(0.95rem,1.8vw,1.4rem)] font-bold mb-4">
              {content.headline}
            </h3>
            <ul className="space-y-2.5 overflow-auto">
              {(content.bullets || []).slice(0, 6).map((bullet) => (
                <li
                  key={bullet}
                  className="text-[clamp(0.7rem,1.25vw,0.95rem)] leading-snug flex gap-2"
                >
                  <span style={{ color: palette.accent }}>•</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>
          {imageUrl ? (
            <div className="flex-1 min-w-0 rounded-lg overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
          ) : null}
        </div>
      );

    case "closing":
    default:
      return (
        <div className="flex h-full gap-4 px-[4.5%] py-[5%]">
          <div className={`flex flex-col ${hasImage ? "w-[52%]" : "w-full"}`}>
            <h3 className="text-[clamp(1rem,2vw,1.5rem)] font-bold mb-2">
              {content.headline}
            </h3>
            {content.subtext ? (
              <p className="text-[clamp(0.7rem,1.2vw,0.9rem)] opacity-75 mb-4">
                {content.subtext}
              </p>
            ) : null}
            <ul className="space-y-2.5 flex-1 overflow-auto">
              {(content.bullets || []).slice(0, 3).map((bullet) => (
                <li
                  key={bullet}
                  className="text-[clamp(0.7rem,1.25vw,0.95rem)] leading-snug flex gap-2"
                >
                  <span style={{ color: palette.accent }}>•</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
            {presentation.sourceAttribution ? (
              <p className="text-[clamp(0.55rem,0.9vw,0.7rem)] opacity-45 mt-4">
                {presentation.sourceAttribution}
              </p>
            ) : null}
          </div>
          {imageUrl ? (
            <div className="flex-1 min-w-0 rounded-lg overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
          ) : null}
        </div>
      );
  }
}

export default function PptxPreview({
  jobId,
  presentation,
  imageSceneIds,
  aspectRatio,
}: PptxPreviewProps) {
  const [index, setIndex] = useState(0);
  const scenes = presentation.scenes;
  const total = scenes.length;
  const scene = scenes[Math.min(index, Math.max(total - 1, 0))];
  const palette = presentation.colorPalette;
  const imageSet = new Set(imageSceneIds);

  const goPrev = useCallback(() => {
    setIndex((i) => (i <= 0 ? total - 1 : i - 1));
  }, [total]);

  const goNext = useCallback(() => {
    setIndex((i) => (i >= total - 1 ? 0 : i + 1));
  }, [total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext]);

  if (!scene || total === 0) {
    return (
      <div
        className="rounded-2xl p-10 text-center"
        style={{
          border: "1px solid var(--border)",
          background: "var(--bg-secondary)",
        }}
      >
        <p style={{ color: "var(--text-secondary)" }}>No slides to preview.</p>
      </div>
    );
  }

  const imageUrl = imageSet.has(scene.id)
    ? `/api/jobs/${jobId}/images/${encodeURIComponent(scene.id)}`
    : undefined;

  return (
    <div className="space-y-3">
      <div
        className="rounded-2xl overflow-hidden shadow-2xl relative"
        style={{
          border: "1px solid var(--border)",
          background: palette.background,
          color: palette.text,
          aspectRatio: aspectRatio.replace(":", "/"),
        }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-1.5 z-10"
          style={{ background: palette.accent }}
        />
        <SlideBody
          scene={scene}
          presentation={presentation}
          imageUrl={imageUrl}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={goPrev}
          className="px-3 py-2 rounded-lg text-xs font-medium transition-all"
          style={{
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
          aria-label="Previous slide"
        >
          ← Prev
        </button>

        <div className="flex flex-col items-center gap-1.5 min-w-0">
          <p
            className="text-xs font-medium truncate max-w-[240px]"
            style={{ color: "var(--text-primary)" }}
          >
            Slide {index + 1} / {total}
            <span className="opacity-50"> · </span>
            <span className="opacity-70 capitalize">{scene.type}</span>
          </p>
          <div className="flex gap-1 flex-wrap justify-center">
            {scenes.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setIndex(i)}
                className="w-2 h-2 rounded-full transition-all"
                style={{
                  background:
                    i === index ? "var(--accent)" : "var(--border)",
                  transform: i === index ? "scale(1.25)" : undefined,
                }}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={goNext}
          className="px-3 py-2 rounded-lg text-xs font-medium transition-all"
          style={{
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
          aria-label="Next slide"
        >
          Next →
        </button>
      </div>

      {scene.narration?.trim() ? (
        <details
          className="rounded-xl px-4 py-3 text-xs"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
          }}
        >
          <summary
            className="cursor-pointer font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            Speaker notes
          </summary>
          <p className="mt-2 leading-relaxed whitespace-pre-wrap">
            {scene.narration.trim()}
          </p>
        </details>
      ) : null}
    </div>
  );
}
