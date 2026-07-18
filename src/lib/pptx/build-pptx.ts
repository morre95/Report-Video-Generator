import fs from "fs/promises";
import path from "path";
import PptxGenJS from "pptxgenjs";
import { config } from "@/lib/config";
import type { AspectRatio } from "@/lib/config";
import type {
  ChartData,
  PresentationData,
  Scene,
} from "@/lib/types";

export type PptxChartKind = "bar" | "line" | "doughnut";

export function mapChartType(type: ChartData["type"]): PptxChartKind {
  switch (type) {
    case "line":
      return "line";
    case "donut":
      return "doughnut";
    case "bar":
    case "comparison":
    default:
      return "bar";
  }
}

function stripHash(color: string): string {
  return color.replace(/^#/, "");
}

function layoutForAspect(aspectRatio: AspectRatio): {
  name: string;
  width: number;
  height: number;
} {
  switch (aspectRatio) {
    case "4:3":
      return { name: "CUSTOM_4_3", width: 10, height: 7.5 };
    case "9:16":
      return { name: "CUSTOM_9_16", width: 7.5, height: 13.33 };
    case "1:1":
      return { name: "CUSTOM_1_1", width: 10, height: 10 };
    case "16:9":
    default:
      return { name: "LAYOUT_WIDE", width: 13.33, height: 7.5 };
  }
}

export async function buildPptx(
  presentation: PresentationData,
  jobId: string,
  options: {
    aspectRatio?: AspectRatio;
    images?: Record<string, string>;
  } = {}
): Promise<string> {
  const aspectRatio = options.aspectRatio ?? "16:9";
  const images = options.images ?? {};
  const layout = layoutForAspect(aspectRatio);

  const pptx = new PptxGenJS();
  pptx.author = "Report Video Generator";
  pptx.title = presentation.title;
  pptx.subject = presentation.subtitle ?? presentation.title;
  pptx.company = "Presentation Maker";

  if (layout.name === "LAYOUT_WIDE") {
    pptx.layout = "LAYOUT_WIDE";
  } else {
    pptx.defineLayout(layout);
    pptx.layout = layout.name;
  }

  const palette = presentation.colorPalette;
  const bg = stripHash(palette.background || "#0a0a0f");
  const text = stripHash(palette.text || "#ffffff");
  const primary = stripHash(palette.primary || "#1e40af");
  const accent = stripHash(palette.accent || "#22c55e");
  const secondary = stripHash(palette.secondary || "#1e3a5f");

  for (const scene of presentation.scenes) {
    const slide = pptx.addSlide();
    slide.background = { color: bg };
    slide.color = text;
    if (scene.narration?.trim()) {
      slide.addNotes(scene.narration.trim());
    }

    // Accent bar
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: layout.width,
      h: 0.12,
      fill: { color: accent },
      line: { color: accent },
    });

    const imagePath = images[scene.id];
    renderSceneSlide(pptx, slide, scene, presentation, {
      layout,
      text,
      primary,
      accent,
      secondary,
      imagePath,
    });
  }

  const outDir = path.join(config.dirs.pptx, jobId);
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "presentation.pptx");

  const buffer = (await pptx.write({
    outputType: "nodebuffer",
  })) as Buffer;
  await fs.writeFile(outPath, buffer);
  return outPath;
}

function renderSceneSlide(
  pptx: PptxGenJS,
  slide: ReturnType<PptxGenJS["addSlide"]>,
  scene: Scene,
  presentation: PresentationData,
  style: {
    layout: { width: number; height: number };
    text: string;
    primary: string;
    accent: string;
    secondary: string;
    imagePath?: string;
  }
) {
  const { layout, text, primary, accent, secondary, imagePath } = style;
  const content = scene.content;
  const hasImage = !!imagePath;

  switch (scene.type) {
    case "title": {
      slide.addText(content.headline, {
        x: 0.6,
        y: hasImage ? 1.2 : 2.2,
        w: hasImage ? layout.width * 0.5 : layout.width - 1.2,
        h: 1.4,
        fontSize: 36,
        bold: true,
        color: text,
        fontFace: "Arial",
      });
      if (content.subtext) {
        slide.addText(content.subtext, {
          x: 0.6,
          y: hasImage ? 2.7 : 3.7,
          w: hasImage ? layout.width * 0.5 : layout.width - 1.2,
          h: 0.8,
          fontSize: 18,
          color: text,
          transparency: 20,
        });
      }
      slide.addText(presentation.sourceAttribution || "", {
        x: 0.6,
        y: layout.height - 0.7,
        w: layout.width - 1.2,
        h: 0.35,
        fontSize: 11,
        color: text,
        transparency: 35,
      });
      if (imagePath) {
        slide.addImage({
          path: imagePath,
          x: layout.width * 0.55,
          y: 1.0,
          w: layout.width * 0.4,
          h: layout.height - 2.0,
          sizing: { type: "cover", w: layout.width * 0.4, h: layout.height - 2.0 },
        });
      }
      break;
    }

    case "kpi": {
      slide.addText(content.headline, {
        x: 0.6,
        y: 0.5,
        w: layout.width - 1.2,
        h: 0.6,
        fontSize: 20,
        color: text,
        transparency: 15,
      });
      slide.addShape(pptx.ShapeType.roundRect, {
        x: 0.6,
        y: 1.4,
        w: layout.width - 1.2,
        h: 3.2,
        fill: { color: secondary },
        line: { color: secondary },
        rectRadius: 0.15,
      });
      slide.addText(content.kpiValue || "—", {
        x: 0.8,
        y: 1.8,
        w: layout.width - 1.6,
        h: 1.4,
        fontSize: 54,
        bold: true,
        color: accent,
        align: "center",
      });
      slide.addText(content.kpiLabel || "", {
        x: 0.8,
        y: 3.2,
        w: layout.width - 1.6,
        h: 0.4,
        fontSize: 16,
        color: text,
        align: "center",
      });
      if (content.kpiChange) {
        slide.addText(content.kpiChange, {
          x: 0.8,
          y: 3.7,
          w: layout.width - 1.6,
          h: 0.4,
          fontSize: 18,
          bold: true,
          color: accent,
          align: "center",
        });
      }
      break;
    }

    case "chart":
    case "comparison": {
      slide.addText(content.headline, {
        x: 0.5,
        y: 0.4,
        w: layout.width - 1,
        h: 0.55,
        fontSize: 22,
        bold: true,
        color: text,
      });
      if (content.chart?.data?.length) {
        addChartToSlide(pptx, slide, content.chart, {
          x: 0.5,
          y: 1.1,
          w: layout.width - 1,
          h: layout.height - 1.8,
          primary,
          accent,
        });
      }
      break;
    }

    case "bullets": {
      const textWidth = hasImage ? layout.width * 0.52 : layout.width - 1.2;
      slide.addText(content.headline, {
        x: 0.6,
        y: 0.5,
        w: textWidth,
        h: 0.7,
        fontSize: 24,
        bold: true,
        color: text,
      });
      const bullets = (content.bullets || []).slice(0, 6);
      if (bullets.length) {
        slide.addText(
          bullets.map((b) => ({ text: b, options: { bullet: true } })),
          {
            x: 0.7,
            y: 1.4,
            w: textWidth - 0.2,
            h: layout.height - 2.2,
            fontSize: 16,
            color: text,
            paraSpaceAfter: 10,
          }
        );
      }
      if (imagePath) {
        slide.addImage({
          path: imagePath,
          x: layout.width * 0.58,
          y: 1.1,
          w: layout.width * 0.36,
          h: layout.height - 2.0,
          sizing: {
            type: "cover",
            w: layout.width * 0.36,
            h: layout.height - 2.0,
          },
        });
      }
      break;
    }

    case "closing":
    default: {
      slide.addText(content.headline, {
        x: 0.6,
        y: 0.6,
        w: hasImage ? layout.width * 0.5 : layout.width - 1.2,
        h: 0.8,
        fontSize: 28,
        bold: true,
        color: text,
      });
      if (content.subtext) {
        slide.addText(content.subtext, {
          x: 0.6,
          y: 1.5,
          w: hasImage ? layout.width * 0.5 : layout.width - 1.2,
          h: 0.6,
          fontSize: 15,
          color: text,
          transparency: 20,
        });
      }
      const takeaways = (content.bullets || []).slice(0, 3);
      if (takeaways.length) {
        slide.addText(
          takeaways.map((b) => ({ text: b, options: { bullet: true } })),
          {
            x: 0.7,
            y: 2.3,
            w: hasImage ? layout.width * 0.48 : layout.width - 1.4,
            h: 3,
            fontSize: 15,
            color: text,
            paraSpaceAfter: 12,
          }
        );
      }
      if (imagePath) {
        slide.addImage({
          path: imagePath,
          x: layout.width * 0.55,
          y: 1.2,
          w: layout.width * 0.4,
          h: layout.height - 2.2,
          sizing: {
            type: "cover",
            w: layout.width * 0.4,
            h: layout.height - 2.2,
          },
        });
      }
      slide.addText(presentation.sourceAttribution || "", {
        x: 0.6,
        y: layout.height - 0.6,
        w: layout.width - 1.2,
        h: 0.3,
        fontSize: 10,
        color: text,
        transparency: 40,
      });
      break;
    }
  }
}

function addChartToSlide(
  pptx: PptxGenJS,
  slide: ReturnType<PptxGenJS["addSlide"]>,
  chart: ChartData,
  opts: {
    x: number;
    y: number;
    w: number;
    h: number;
    primary: string;
    accent: string;
  }
) {
  const labels = chart.data.map((d) => d.label);
  const values = chart.data.map((d) => d.value);
  const kind = mapChartType(chart.type);
  const chartType =
    kind === "line"
      ? pptx.ChartType.line
      : kind === "doughnut"
        ? pptx.ChartType.doughnut
        : pptx.ChartType.bar;

  const series = [
    {
      name: chart.title || "Series",
      labels,
      values,
    },
  ];

  const chartColors = chart.data.map(
    (d, i) =>
      stripHash(d.color || (i % 2 === 0 ? `#${opts.primary}` : `#${opts.accent}`))
  );

  slide.addChart(chartType, series, {
    x: opts.x,
    y: opts.y,
    w: opts.w,
    h: opts.h,
    showTitle: true,
    title: chart.title,
    showLegend: true,
    legendPos: "b",
    showValue: kind !== "doughnut",
    showPercent: kind === "doughnut",
    chartColors,
    barGrouping: "clustered",
    barDir: "col",
  });
}
