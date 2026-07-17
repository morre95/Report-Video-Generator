import type { PresentationData, Scene, ChartData } from "@/lib/types";
import type { AspectRatio } from "@/lib/config";
import { ASPECT_DIMENSIONS } from "@/lib/config";

interface CompositionConfig {
  duration: number;
  fps: number;
  aspectRatio: AspectRatio;
  voiceoverPath?: string;
  musicPath?: string;
  musicVolume?: number;
}

export function buildCompositionHtml(
  data: PresentationData,
  cfg: CompositionConfig
): string {
  const dims = ASPECT_DIMENSIONS[cfg.aspectRatio];
  const { primary, secondary, accent, background, text } = data.colorPalette;

  const scenesHtml = data.scenes
    .map((scene, index) => renderScene(scene, data, index, data.scenes.length))
    .join("\n");

  const audioTags = buildAudioTags(cfg);
  const timelineJs = buildTimeline(data.scenes);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escHtml(data.title)}</title>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"><\/script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;700&display=swap');

    :root {
      --primary: ${primary};
      --secondary: ${secondary};
      --accent: ${accent};
      --bg: ${background};
      --text: ${text};
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    html, body {
      width: ${dims.w}px;
      height: ${dims.h}px;
      overflow: hidden;
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', sans-serif;
    }

    #stage {
      position: relative;
      width: ${dims.w}px;
      height: ${dims.h}px;
      overflow: hidden;
    }

    .scene {
      position: absolute;
      inset: 0;
      opacity: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .scene-content {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 80px;
    }

    .scene-bg {
      position: absolute;
      inset: 0;
      z-index: 0;
    }

    .scene-fg {
      position: relative;
      z-index: 1;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 24px;
    }

    .scene-chrome {
      position: absolute;
      inset: 44px 52px;
      z-index: 3;
      pointer-events: none;
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 28px;
    }

    .scene-chrome::before,
    .scene-chrome::after {
      content: '';
      position: absolute;
      width: 72px;
      height: 3px;
      top: -2px;
      background: linear-gradient(90deg, var(--accent), transparent);
    }

    .scene-chrome::before { left: 38px; }
    .scene-chrome::after {
      right: 38px;
      transform: scaleX(-1);
    }

    .scene-counter {
      position: absolute;
      top: 62px;
      left: 76px;
      z-index: 4;
      display: flex;
      align-items: center;
      gap: 14px;
      font: 700 18px 'JetBrains Mono', monospace;
      letter-spacing: 0.12em;
      color: var(--accent);
    }

    .scene-counter::before {
      content: '';
      width: 34px;
      height: 2px;
      background: currentColor;
      box-shadow: 0 0 16px currentColor;
    }

    .scene-ghost-number {
      position: absolute;
      right: 60px;
      bottom: 18px;
      z-index: 0;
      font: 900 260px/1 'Inter', sans-serif;
      letter-spacing: -0.08em;
      color: transparent;
      -webkit-text-stroke: 2px rgba(255,255,255,0.035);
      pointer-events: none;
    }

    /* Title scene */
    .title-scene .headline {
      font-size: 84px;
      font-weight: 900;
      line-height: 1.05;
      text-align: center;
      letter-spacing: -2px;
      background: linear-gradient(135deg, var(--primary), var(--accent));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      max-width: 85%;
    }

    .title-scene .subtitle {
      font-size: 36px;
      font-weight: 300;
      opacity: 0.7;
      text-align: center;
      margin-top: 16px;
    }

    .title-scene .attribution {
      font-size: 20px;
      font-weight: 400;
      opacity: 0.4;
      margin-top: 40px;
      font-family: 'JetBrains Mono', monospace;
    }

    .title-orbits {
      position: absolute;
      width: 680px;
      height: 680px;
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 50%;
      z-index: 0;
    }

    .title-orbits::before,
    .title-orbits::after {
      content: '';
      position: absolute;
      border-radius: 50%;
      border: 1px solid rgba(255,255,255,0.06);
    }

    .title-orbits::before { inset: 90px; }
    .title-orbits::after { inset: 190px; }

    .orbit-node {
      position: absolute;
      width: 14px;
      height: 14px;
      top: 50%;
      left: -7px;
      border-radius: 50%;
      background: var(--accent);
      box-shadow: 0 0 28px var(--accent);
    }

    /* KPI scene */
    .kpi-scene .kpi-value {
      font-size: 160px;
      font-weight: 900;
      letter-spacing: -4px;
      color: var(--accent);
      line-height: 1;
    }

    .kpi-scene .kpi-label {
      font-size: 36px;
      font-weight: 400;
      opacity: 0.7;
      margin-top: 12px;
    }

    .kpi-scene .kpi-change {
      font-size: 48px;
      font-weight: 700;
      color: #22c55e;
      margin-top: 20px;
      font-family: 'JetBrains Mono', monospace;
    }

    .kpi-scene .headline {
      font-size: 44px;
      font-weight: 700;
      text-align: center;
      margin-bottom: 40px;
    }

    .metric-frame {
      position: relative;
      min-width: 720px;
      padding: 64px 100px;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 32px;
      background:
        linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.015)),
        radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--accent) 20%, transparent), transparent 56%);
      box-shadow: 0 40px 100px rgba(0,0,0,0.35);
      text-align: center;
      overflow: hidden;
    }

    .metric-frame::before {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      top: 0;
      height: 4px;
      background: linear-gradient(90deg, transparent, var(--accent), transparent);
      box-shadow: 0 0 24px var(--accent);
    }

    .metric-spark {
      position: absolute;
      inset: auto 0 0;
      width: 100%;
      height: 110px;
      opacity: 0.22;
    }

    .metric-spark polyline {
      fill: none;
      stroke: var(--accent);
      stroke-width: 4;
      vector-effect: non-scaling-stroke;
      stroke-dasharray: 1;
      stroke-dashoffset: 0;
    }

    /* Chart scene */
    .chart-scene .headline {
      font-size: 44px;
      font-weight: 700;
      text-align: center;
      margin-bottom: 24px;
    }

    .chart-container {
      width: 80%;
      height: 55%;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      gap: 32px;
      padding: 40px 20px 60px;
      position: relative;
      border-bottom: 1px solid rgba(255,255,255,0.14);
      background-image: linear-gradient(
        to top,
        rgba(255,255,255,0.045) 1px,
        transparent 1px
      );
      background-size: 100% 25%;
      border-radius: 24px 24px 0 0;
    }

    .bar-group {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      flex: 1;
      max-width: 120px;
      height: 100%;
      gap: 12px;
    }

    .bar {
      width: 100%;
      border-radius: 8px 8px 0 0;
      min-height: 4px;
      transform-origin: bottom;
      flex-shrink: 0;
      box-shadow: 0 0 32px color-mix(in srgb, currentColor 35%, transparent);
      position: relative;
      overflow: hidden;
    }

    .bar-shine {
      position: absolute;
      inset: 0;
      background: linear-gradient(
        100deg,
        transparent 20%,
        rgba(255,255,255,0.28) 48%,
        transparent 74%
      );
      pointer-events: none;
    }

    .bar-label {
      font-size: 18px;
      font-weight: 500;
      opacity: 0.7;
      text-align: center;
      white-space: nowrap;
    }

    .bar-value {
      font-size: 22px;
      font-weight: 700;
      font-family: 'JetBrains Mono', monospace;
    }

    /* Donut chart */
    .donut-container {
      width: 400px;
      height: 400px;
      position: relative;
      filter: drop-shadow(0 24px 40px rgba(0,0,0,0.35));
    }

    .donut-container svg {
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
    }

    .donut-label-center {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
    }

    .donut-legend {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-left: 60px;
    }

    .donut-legend-item {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 22px;
      padding: 12px 18px;
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 12px;
      background: rgba(255,255,255,0.035);
    }

    .donut-legend-swatch {
      width: 20px;
      height: 20px;
      border-radius: 4px;
    }

    /* Bullets scene */
    .bullets-scene .headline {
      font-size: 52px;
      font-weight: 700;
      text-align: center;
      margin-bottom: 40px;
    }

    .bullet-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 28px;
      max-width: 75%;
      counter-reset: insight;
    }

    .bullet-list li {
      font-size: 32px;
      font-weight: 400;
      line-height: 1.4;
      padding-left: 36px;
      position: relative;
      padding: 22px 28px 22px 76px;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      background: linear-gradient(90deg, rgba(255,255,255,0.055), transparent);
      counter-increment: insight;
    }

    .bullet-list li::before {
      content: counter(insight, decimal-leading-zero);
      position: absolute;
      left: 22px;
      top: 50%;
      width: auto;
      height: auto;
      transform: translateY(-50%);
      border-radius: 0;
      background: transparent;
      color: var(--accent);
      font: 700 18px 'JetBrains Mono', monospace;
    }

    /* Comparison scene */
    .comparison-scene .headline {
      font-size: 44px;
      font-weight: 700;
      text-align: center;
      margin-bottom: 32px;
    }

    .comparison-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 24px;
      width: 80%;
    }

    .comparison-card {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      padding: 32px;
      text-align: center;
      position: relative;
      overflow: hidden;
      box-shadow: 0 24px 50px rgba(0,0,0,0.18);
    }

    .comparison-card::after {
      content: '';
      position: absolute;
      left: 20%;
      right: 20%;
      bottom: 0;
      height: 3px;
      background: var(--accent);
      box-shadow: 0 0 18px var(--accent);
    }

    .comparison-card .card-value {
      font-size: 56px;
      font-weight: 800;
      color: var(--accent);
      font-family: 'JetBrains Mono', monospace;
    }

    .comparison-card .card-label {
      font-size: 22px;
      margin-top: 8px;
      opacity: 0.6;
    }

    /* Closing scene */
    .closing-scene .headline {
      font-size: 64px;
      font-weight: 800;
      text-align: center;
      background: linear-gradient(135deg, var(--primary), var(--accent));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .closing-scene .subtext {
      font-size: 28px;
      opacity: 0.65;
      margin-top: 8px;
      text-align: center;
      max-width: 900px;
    }

    .closing-takeaways {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 18px;
      width: min(1120px, 82%);
      margin-top: 28px;
    }

    .closing-takeaway {
      padding: 22px 24px;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      background: rgba(255,255,255,0.045);
      font-size: 22px;
      line-height: 1.35;
      text-align: left;
    }

    .closing-takeaway::before {
      content: '✓';
      display: block;
      margin-bottom: 10px;
      color: var(--accent);
      font: 700 18px 'JetBrains Mono', monospace;
    }

    .closing-pulse {
      position: absolute;
      width: 560px;
      height: 560px;
      border: 2px solid color-mix(in srgb, var(--accent) 35%, transparent);
      border-radius: 50%;
      box-shadow:
        0 0 0 80px color-mix(in srgb, var(--accent) 5%, transparent),
        0 0 0 160px color-mix(in srgb, var(--accent) 3%, transparent);
      z-index: 0;
    }

    /* Source badge */
    .source-badge {
      position: absolute;
      bottom: 40px;
      right: 60px;
      font-size: 16px;
      opacity: 0.3;
      font-family: 'JetBrains Mono', monospace;
    }

    /* Background decorations */
    .grid-overlay {
      position: absolute;
      inset: 0;
      background-image: 
        linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
      background-size: 60px 60px;
      pointer-events: none;
      opacity: 0.75;
    }

    .glow-orb {
      position: absolute;
      border-radius: 50%;
      filter: blur(120px);
      opacity: 0.15;
      pointer-events: none;
    }

    .ambient-lines {
      position: absolute;
      inset: 0;
      pointer-events: none;
      opacity: 0.28;
      overflow: hidden;
    }

    .ambient-line {
      position: absolute;
      left: -20%;
      width: 140%;
      height: 1px;
      background: linear-gradient(
        90deg,
        transparent,
        color-mix(in srgb, var(--accent) 55%, transparent),
        transparent
      );
      transform: rotate(-8deg);
    }

    .ambient-line:nth-child(1) { top: 20%; }
    .ambient-line:nth-child(2) { top: 55%; opacity: 0.55; }
    .ambient-line:nth-child(3) { top: 82%; opacity: 0.3; }

    .data-stream {
      position: absolute;
      inset: 0;
      pointer-events: none;
      overflow: hidden;
    }

    .data-dot {
      position: absolute;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--accent);
      box-shadow: 0 0 18px var(--accent);
      opacity: 0.5;
    }

    .end-fade {
      position: absolute;
      inset: 0;
      z-index: 20;
      pointer-events: none;
      opacity: 0;
      background: var(--bg);
    }

    /* Line chart */
    .line-chart-container {
      width: 80%;
      height: 50%;
      position: relative;
    }

    .line-chart-container svg {
      width: 100%;
      height: 100%;
      overflow: visible;
      filter: drop-shadow(0 14px 24px rgba(0,0,0,0.28));
    }

    .line-chart-grid {
      stroke: rgba(255,255,255,0.08);
      stroke-width: 1;
    }

    .line-chart-path {
      stroke-dasharray: 1;
      stroke-dashoffset: 0;
    }

    .chart-axis-label {
      font-size: 16px;
      opacity: 0.5;
      font-family: 'JetBrains Mono', monospace;
    }
  </style>
</head>
<body>
  <div id="stage" data-composition-id="report-video" data-start="0" data-width="${dims.w}" data-height="${dims.h}" data-duration="${cfg.duration}" data-fps="${cfg.fps}">
    <div class="grid-overlay"></div>
    <div class="ambient-lines">
      <div class="ambient-line"></div>
      <div class="ambient-line"></div>
      <div class="ambient-line"></div>
    </div>
    <div class="data-stream">
      <i class="data-dot" style="left:8%;top:22%"></i>
      <i class="data-dot" style="left:28%;top:76%"></i>
      <i class="data-dot" style="left:61%;top:16%"></i>
      <i class="data-dot" style="left:84%;top:68%"></i>
      <i class="data-dot" style="left:94%;top:35%"></i>
    </div>
    <div class="glow-orb orb-a" style="width: 600px; height: 600px; background: var(--primary); top: -200px; right: -100px;"></div>
    <div class="glow-orb orb-b" style="width: 500px; height: 500px; background: var(--accent); bottom: -150px; left: -100px;"></div>

${scenesHtml}

    <div class="source-badge">${escHtml(data.sourceAttribution)}</div>
    <div class="end-fade"></div>

${audioTags}
  </div>

  <script>
${timelineJs}
  <\/script>
</body>
</html>`;
}

function renderScene(
  scene: Scene,
  data: PresentationData,
  index: number,
  totalScenes: number
): string {
  const c = scene.content;
  const sceneNumber = String(index + 1).padStart(2, "0");
  const totalNumber = String(totalScenes).padStart(2, "0");
  let inner = "";

  switch (scene.type) {
    case "title":
      inner = `
      <div class="title-orbits"><i class="orbit-node"></i></div>
      <div class="scene-fg">
        <div class="headline">${escHtml(c.headline)}</div>
        ${c.subtext ? `<div class="subtitle">${escHtml(c.subtext)}</div>` : ""}
        <div class="attribution">${escHtml(data.sourceAttribution)}</div>
      </div>`;
      break;

    case "kpi":
      inner = `
      <div class="scene-fg">
        <div class="headline">${escHtml(c.headline)}</div>
        <div class="metric-frame">
          <svg class="metric-spark" viewBox="0 0 720 110" preserveAspectRatio="none">
            <polyline pathLength="1" points="0,92 80,80 145,88 220,58 290,68 370,38 445,52 530,22 610,34 720,8"></polyline>
          </svg>
          <div class="kpi-value">${escHtml(c.kpiValue ?? "")}</div>
          <div class="kpi-label">${escHtml(c.kpiLabel ?? "")}</div>
          ${c.kpiChange ? `<div class="kpi-change">${escHtml(c.kpiChange)}</div>` : ""}
        </div>
      </div>`;
      break;

    case "chart":
      inner = `
      <div class="scene-fg">
        <div class="headline">${escHtml(c.headline)}</div>
        ${c.chart ? renderChart(c.chart, data.colorPalette) : ""}
      </div>`;
      break;

    case "bullets":
      inner = `
      <div class="scene-fg">
        <div class="headline">${escHtml(c.headline)}</div>
        <ul class="bullet-list">
          ${(c.bullets ?? []).map((b) => `<li>${escHtml(b)}</li>`).join("\n          ")}
        </ul>
      </div>`;
      break;

    case "comparison":
      inner = `
      <div class="scene-fg">
        <div class="headline">${escHtml(c.headline)}</div>
        <div class="comparison-grid">
          ${(c.chart?.data ?? [])
            .map(
              (d) => `
          <div class="comparison-card">
            <div class="card-value">${escHtml(String(d.value))}${c.chart?.unit ? escHtml(c.chart.unit) : ""}</div>
            <div class="card-label">${escHtml(d.label)}</div>
          </div>`
            )
            .join("")}
        </div>
      </div>`;
      break;

    case "closing":
      inner = `
      <div class="closing-pulse"></div>
      <div class="scene-fg">
        <div class="headline">${escHtml(c.headline)}</div>
        ${c.subtext ? `<div class="subtext">${escHtml(c.subtext)}</div>` : ""}
        ${
          c.bullets?.length
            ? `<div class="closing-takeaways">${c.bullets
                .slice(0, 3)
                .map(
                  (bullet) =>
                    `<div class="closing-takeaway">${escHtml(bullet)}</div>`
                )
                .join("")}</div>`
            : ""
        }
      </div>`;
      break;
  }

  return `    <div id="${escHtml(scene.id)}" class="scene ${scene.type}-scene clip" data-start="${scene.startTime}" data-duration="${scene.duration}" data-track-index="0">
      <div class="scene-chrome"></div>
      <div class="scene-counter">${sceneNumber} / ${totalNumber}</div>
      <div class="scene-ghost-number">${sceneNumber}</div>
      <div class="scene-content">${inner}
      </div>
    </div>`;
}

function renderChart(
  chart: ChartData,
  palette: PresentationData["colorPalette"]
): string {
  const defaultColors = [
    palette.accent,
    palette.primary,
    palette.secondary,
    "#f59e0b",
    "#10b981",
    "#8b5cf6",
    "#ec4899",
    "#06b6d4",
  ];

  switch (chart.type) {
    case "bar":
      return renderBarChart(chart, defaultColors);
    case "line":
      return renderLineChart(chart, defaultColors);
    case "donut":
      return renderDonutChart(chart, defaultColors);
    case "comparison":
      return renderBarChart(chart, defaultColors);
    default:
      return renderBarChart(chart, defaultColors);
  }
}

function renderBarChart(chart: ChartData, colors: string[]): string {
  const maxVal = Math.max(...chart.data.map((d) => d.value));

  const bars = chart.data
    .map((d, i) => {
      const heightPct = maxVal > 0 ? (d.value / maxVal) * 78 : 0;
      const color = d.color ?? colors[i % colors.length];
      const displayVal =
        chart.unit === "$B"
          ? `$${d.value}B`
          : chart.unit === "%"
            ? `${d.value}%`
            : chart.unit
              ? `${d.value}${chart.unit}`
              : String(d.value);
      return `
      <div class="bar-group">
        <div class="bar-value">${escHtml(displayVal)}</div>
        <div class="bar" style="height: ${heightPct}%; background: ${color};"><i class="bar-shine"></i></div>
        <div class="bar-label">${escHtml(d.label)}</div>
      </div>`;
    })
    .join("");

  return `<div class="chart-container">${bars}</div>`;
}

function renderLineChart(chart: ChartData, colors: string[]): string {
  const maxVal = Math.max(...chart.data.map((d) => d.value));
  const w = 1200;
  const h = 400;
  const padding = 40;
  const usableW = w - padding * 2;
  const usableH = h - padding * 2;

  const points = chart.data.map((d, i) => {
    const x = padding + (i / Math.max(1, chart.data.length - 1)) * usableW;
    const y = padding + usableH - (maxVal > 0 ? (d.value / maxVal) * usableH : 0);
    return `${x},${y}`;
  });

  const color = colors[0];
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p}`).join(" ");

  const labels = chart.data
    .map((d, i) => {
      const x = padding + (i / Math.max(1, chart.data.length - 1)) * usableW;
      return `<text x="${x}" y="${h - 5}" text-anchor="middle" fill="currentColor" class="chart-axis-label">${escHtml(d.label)}</text>`;
    })
    .join("");

  const dots = chart.data
    .map((d, i) => {
      const x = padding + (i / Math.max(1, chart.data.length - 1)) * usableW;
      const y = padding + usableH - (maxVal > 0 ? (d.value / maxVal) * usableH : 0);
      return `<circle cx="${x}" cy="${y}" r="6" fill="${color}" />`;
    })
    .join("");

  const gridLines = [0, 1, 2, 3, 4]
    .map((i) => {
      const y = padding + (i / 4) * usableH;
      return `<line class="line-chart-grid" x1="${padding}" y1="${y}" x2="${w - padding}" y2="${y}" />`;
    })
    .join("");

  return `<div class="line-chart-container">
    <svg viewBox="0 0 ${w} ${h}">
      ${gridLines}
      <path class="line-chart-path" pathLength="1" d="${pathD}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
      ${dots}
      ${labels}
    </svg>
  </div>`;
}

function renderDonutChart(chart: ChartData, colors: string[]): string {
  const total = chart.data.reduce((s, d) => s + d.value, 0);
  const r = 150;
  const cx = 200;
  const cy = 200;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  const circles = chart.data.map((d, i) => {
    const pct = total > 0 ? d.value / total : 0;
    const len = pct * circumference;
    const color = d.color ?? colors[i % colors.length];
    const circle = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="50" stroke-dasharray="${len} ${circumference - len}" stroke-dashoffset="${-offset}" />`;
    offset += len;
    return circle;
  });

  const legendItems = chart.data
    .map((d, i) => {
      const color = d.color ?? colors[i % colors.length];
      const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : "0";
      return `<div class="donut-legend-item"><div class="donut-legend-swatch" style="background:${color}"></div>${escHtml(d.label)} (${pct}%)</div>`;
    })
    .join("");

  return `<div style="display:flex;align-items:center;justify-content:center;gap:40px;">
    <div class="donut-container">
      <svg viewBox="0 0 400 400">${circles.join("")}</svg>
    </div>
    <div class="donut-legend">${legendItems}</div>
  </div>`;
}

function buildAudioTags(cfg: CompositionConfig): string {
  const tags: string[] = [];

  if (cfg.voiceoverPath) {
    tags.push(
      `    <audio id="voiceover" class="clip" src="${cfg.voiceoverPath}" data-start="0" data-duration="${cfg.duration}" data-track-index="1" data-volume="1.0"></audio>`
    );
  }

  if (cfg.musicPath) {
    const vol = cfg.musicVolume !== undefined ? dbToLinear(cfg.musicVolume) : 0.05;
    tags.push(
      `    <audio id="background-music" class="clip" src="${cfg.musicPath}" data-start="0" data-duration="${cfg.duration}" data-track-index="2" data-volume="${vol.toFixed(3)}" data-loop="true" data-fade-in="2" data-fade-out="3"></audio>`
    );
  }

  return tags.join("\n");
}

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

function buildChartAnimation(
  scene: Scene,
  selector: string,
  startTime: number,
  duration: number
): string {
  const type = scene.content.chart?.type ?? "bar";
  const base = `
    tl.from("${selector} .scene-chrome", { scale: 0.96, autoAlpha: 0, duration: ${duration}, ease: "power2.out" }, ${startTime});
    tl.from("${selector} .scene-counter", { x: -24, autoAlpha: 0, duration: 0.6, ease: "power3.out" }, ${startTime + 0.1});
    tl.from("${selector} .headline", { y: 30, autoAlpha: 0, duration: ${duration * 0.7}, ease: "power3.out" }, ${startTime + 0.2});`;

  if (type === "line") {
    return `${base}
    tl.from("${selector} .line-chart-path", { strokeDashoffset: 1, duration: 1.4, ease: "power2.inOut" }, ${startTime + 0.4});
    tl.from("${selector} circle", { scale: 0, autoAlpha: 0, duration: 0.4, stagger: 0.08, transformOrigin: "center" }, ${startTime + 0.75});`;
  }

  if (type === "donut") {
    return `${base}
    tl.from("${selector} .donut-container circle", { scale: 0, autoAlpha: 0, duration: 0.55, stagger: 0.1, transformOrigin: "center" }, ${startTime + 0.45});
    tl.from("${selector} .donut-legend-item", { x: 20, autoAlpha: 0, duration: 0.4, stagger: 0.1 }, ${startTime + 0.8});`;
  }

  return `${base}
    tl.from("${selector} .bar", { scaleY: 0, autoAlpha: 0, duration: ${duration}, ease: "power3.out", stagger: 0.1 }, ${startTime + 0.5});
    tl.from("${selector} .bar-value", { autoAlpha: 0, y: -10, duration: 0.4, stagger: 0.1 }, ${startTime + 1.0});
    tl.from("${selector} .bar-label", { autoAlpha: 0, duration: 0.3, stagger: 0.1 }, ${startTime + 1.2});
    tl.fromTo("${selector} .bar-shine", { xPercent: -150 }, { xPercent: 300, duration: 1.4, stagger: 0.08, ease: "power2.inOut" }, ${startTime + 1.2});`;
}

function buildTimeline(scenes: Scene[]): string {
  const totalDuration = scenes.reduce(
    (max, scene) => Math.max(max, scene.startTime + scene.duration),
    0
  );
  const animations = scenes
    .map((scene) => {
      const sel = `.scene[data-start='${scene.startTime}']`;
      const t = scene.startTime;
      const d = Math.min(scene.duration, 1.2);

      let anim = "";
      switch (scene.type) {
        case "title":
          anim = `
    tl.from("${sel} .scene-chrome", { scale: 0.96, autoAlpha: 0, duration: ${d}, ease: "power2.out" }, ${t});
    tl.from("${sel} .scene-counter", { x: -24, autoAlpha: 0, duration: 0.6, ease: "power3.out" }, ${t + 0.1});
    tl.from("${sel} .title-orbits", { scale: 0.7, rotation: -25, autoAlpha: 0, duration: ${d * 1.2}, ease: "power3.out" }, ${t});
    tl.to("${sel} .title-orbits", { rotation: 18, duration: ${Math.max(0.4, scene.duration - d * 1.2)}, ease: "none" }, ${t + d * 1.2});
    tl.from("${sel} .headline", { y: 60, autoAlpha: 0, duration: ${d}, ease: "power3.out" }, ${t + 0.2});
    tl.from("${sel} .subtitle", { y: 40, autoAlpha: 0, duration: ${d * 0.8}, ease: "power3.out" }, ${t + 0.6});
    tl.from("${sel} .attribution", { autoAlpha: 0, duration: ${d * 0.6}, ease: "power2.out" }, ${t + 1.0});`;
          break;
        case "kpi":
          anim = `
    tl.from("${sel} .scene-chrome", { scale: 0.96, autoAlpha: 0, duration: ${d}, ease: "power2.out" }, ${t});
    tl.from("${sel} .scene-counter", { x: -24, autoAlpha: 0, duration: 0.6, ease: "power3.out" }, ${t + 0.1});
    tl.from("${sel} .headline", { y: 30, autoAlpha: 0, duration: ${d * 0.7}, ease: "power3.out" }, ${t + 0.2});
    tl.from("${sel} .metric-frame", { y: 35, scale: 0.94, autoAlpha: 0, duration: ${d}, ease: "power3.out" }, ${t + 0.25});
    tl.from("${sel} .kpi-value", { scale: 0.5, autoAlpha: 0, duration: ${d}, ease: "back.out(1.7)" }, ${t + 0.4});
    tl.from("${sel} .kpi-label", { y: 20, autoAlpha: 0, duration: ${d * 0.6} }, ${t + 0.8});
    tl.from("${sel} .kpi-change", { x: -30, autoAlpha: 0, duration: ${d * 0.6} }, ${t + 1.0});
    tl.from("${sel} .metric-spark polyline", { strokeDashoffset: 1, duration: ${Math.min(2, scene.duration * 0.35)}, ease: "power2.out" }, ${t + 0.5});`;
          break;
        case "chart":
          anim = buildChartAnimation(scene, sel, t, d);
          break;
        case "bullets":
          anim = `
    tl.from("${sel} .scene-chrome", { scale: 0.96, autoAlpha: 0, duration: ${d}, ease: "power2.out" }, ${t});
    tl.from("${sel} .scene-counter", { x: -24, autoAlpha: 0, duration: 0.6, ease: "power3.out" }, ${t + 0.1});
    tl.from("${sel} .headline", { y: 30, autoAlpha: 0, duration: ${d * 0.7}, ease: "power3.out" }, ${t + 0.2});
    tl.from("${sel} .bullet-list li", { x: -40, autoAlpha: 0, duration: 0.5, ease: "power3.out", stagger: 0.15 }, ${t + 0.5});`;
          break;
        case "comparison":
          anim = `
    tl.from("${sel} .scene-chrome", { scale: 0.96, autoAlpha: 0, duration: ${d}, ease: "power2.out" }, ${t});
    tl.from("${sel} .scene-counter", { x: -24, autoAlpha: 0, duration: 0.6, ease: "power3.out" }, ${t + 0.1});
    tl.from("${sel} .headline", { y: 30, autoAlpha: 0, duration: ${d * 0.7}, ease: "power3.out" }, ${t + 0.2});
    tl.from("${sel} .comparison-card", { scale: 0.8, autoAlpha: 0, duration: 0.6, ease: "back.out(1.4)", stagger: 0.12 }, ${t + 0.4});`;
          break;
        case "closing":
          anim = `
    tl.from("${sel} .scene-chrome", { scale: 0.96, autoAlpha: 0, duration: ${d}, ease: "power2.out" }, ${t});
    tl.from("${sel} .scene-counter", { x: -24, autoAlpha: 0, duration: 0.6, ease: "power3.out" }, ${t + 0.1});
    tl.from("${sel} .closing-pulse", { scale: 0.55, autoAlpha: 0, duration: ${d * 1.2}, ease: "power3.out" }, ${t});
    tl.to("${sel} .closing-pulse", { scale: 1.12, rotation: 12, duration: ${Math.max(0.4, scene.duration - d * 1.2)}, ease: "none" }, ${t + d * 1.2});
    tl.from("${sel} .headline", { scale: 0.9, autoAlpha: 0, duration: ${d}, ease: "power3.out" }, ${t + 0.3});
    tl.from("${sel} .subtext", { y: 20, autoAlpha: 0, duration: ${d * 0.7} }, ${t + 0.8});
    tl.from("${sel} .closing-takeaway", { y: 24, autoAlpha: 0, duration: 0.55, stagger: 0.14, ease: "power3.out" }, ${t + 1.1});`;
          break;
      }
      return anim;
    })
    .join("\n");

  return `    const tl = gsap.timeline({ paused: true });
    tl.to(".grid-overlay", { backgroundPosition: "120px 60px", duration: ${totalDuration}, ease: "none" }, 0);
    tl.to(".orb-a", { x: -170, y: 110, scale: 1.18, duration: ${totalDuration}, ease: "sine.inOut" }, 0);
    tl.to(".orb-b", { x: 190, y: -90, scale: 1.12, duration: ${totalDuration}, ease: "sine.inOut" }, 0);
    tl.to(".ambient-line", { x: 180, stagger: 0.35, duration: ${totalDuration}, ease: "none" }, 0);
    tl.to(".data-dot", { y: -180, x: 70, stagger: 0.7, duration: ${Math.max(4, totalDuration * 0.55)}, ease: "sine.inOut" }, 0);
    tl.to(".end-fade", { opacity: 1, duration: 1.5, ease: "power2.inOut" }, ${Math.max(0, totalDuration - 1.5)});
${animations}

    window.__timelines = window.__timelines || {};
    window.__timelines["report-video"] = tl;`;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
