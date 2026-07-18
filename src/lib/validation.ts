import path from "path";
import { ASPECT_DIMENSIONS, config, SUPPORTED_FPS, SUPPORTED_VOICES } from "@/lib/config";
import type { AspectRatio } from "@/lib/config";
import type {
  ChartData,
  JobConfig,
  OutputFormat,
  PresentationData,
  Scene,
} from "@/lib/types";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const SAFE_SCENE_ID = /^[a-zA-Z0-9_-]{1,128}$/;
const SCENE_TYPES = new Set<Scene["type"]>([
  "title",
  "kpi",
  "chart",
  "bullets",
  "comparison",
  "closing",
]);
const CHART_TYPES = new Set<ChartData["type"]>([
  "bar",
  "line",
  "donut",
  "comparison",
]);
const OUTPUT_FORMATS = new Set<OutputFormat>(["video", "pptx", "both"]);

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function fail(message: string): never {
  throw new ValidationError(message);
}

function asObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) {
    fail(`${field} must be a non-empty string`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) fail(`${field} exceeds ${max} characters`);
  return trimmed;
}

function optionalString(
  value: unknown,
  field: string,
  max: number
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") fail(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length > max) fail(`${field} exceeds ${max} characters`);
  return trimmed || undefined;
}

function finiteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${field} must be a finite number`);
  }
  return value;
}

function color(value: unknown, field: string): string {
  const parsed = requiredString(value, field, 7);
  if (!HEX_COLOR.test(parsed)) fail(`${field} must be a six-digit hex color`);
  return parsed;
}

function stringArray(
  value: unknown,
  field: string,
  maxItems: number,
  maxLength: number
): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length > maxItems) {
    fail(`${field} must contain at most ${maxItems} items`);
  }
  return value.map((item, index) =>
    requiredString(item, `${field}[${index}]`, maxLength)
  );
}

function validateChart(value: unknown, field: string): ChartData | undefined {
  if (value === undefined || value === null) return undefined;
  const chart = asObject(value, field);
  if (!CHART_TYPES.has(chart.type as ChartData["type"])) {
    fail(`${field}.type is invalid`);
  }
  if (!Array.isArray(chart.data) || chart.data.length < 1 || chart.data.length > 12) {
    fail(`${field}.data must contain 1-12 points`);
  }

  return {
    type: chart.type as ChartData["type"],
    title: requiredString(chart.title, `${field}.title`, 200),
    data: chart.data.map((rawPoint, index) => {
      const point = asObject(rawPoint, `${field}.data[${index}]`);
      return {
        label: requiredString(point.label, `${field}.data[${index}].label`, 200),
        value: finiteNumber(point.value, `${field}.data[${index}].value`),
        color:
          point.color === undefined
            ? undefined
            : color(point.color, `${field}.data[${index}].color`),
      };
    }),
    unit: optionalString(chart.unit, `${field}.unit`, 20),
  };
}

export function isSafeSceneId(value: string): boolean {
  return SAFE_SCENE_ID.test(value);
}

export function isSafeHexColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

export function validatePresentationData(value: unknown): PresentationData {
  const data = asObject(value, "presentation");
  if (!Array.isArray(data.scenes) || data.scenes.length < 2 || data.scenes.length > 12) {
    fail("presentation.scenes must contain 2-12 scenes");
  }

  const ids = new Set<string>();
  let startTime = 0;
  const scenes = data.scenes.map((rawScene, index): Scene => {
    const field = `presentation.scenes[${index}]`;
    const scene = asObject(rawScene, field);
    const id = requiredString(scene.id, `${field}.id`, 128);
    if (!isSafeSceneId(id)) fail(`${field}.id contains unsafe characters`);
    if (ids.has(id)) fail(`${field}.id must be unique`);
    ids.add(id);

    if (!SCENE_TYPES.has(scene.type as Scene["type"])) {
      fail(`${field}.type is invalid`);
    }
    const duration = finiteNumber(scene.duration, `${field}.duration`);
    if (duration <= 0 || duration > 300) {
      fail(`${field}.duration must be between 0 and 300 seconds`);
    }

    const rawContent = asObject(scene.content, `${field}.content`);
    const parsed: Scene = {
      id,
      startTime,
      duration,
      type: scene.type as Scene["type"],
      content: {
        headline: requiredString(rawContent.headline, `${field}.content.headline`, 300),
        subtext: optionalString(rawContent.subtext, `${field}.content.subtext`, 500),
        bullets: stringArray(rawContent.bullets, `${field}.content.bullets`, 6, 500),
        chart: validateChart(rawContent.chart, `${field}.content.chart`),
        sourceExcerpt: optionalString(
          rawContent.sourceExcerpt,
          `${field}.content.sourceExcerpt`,
          1_000
        ),
        kpiValue: optionalString(rawContent.kpiValue, `${field}.content.kpiValue`, 100),
        kpiLabel: optionalString(rawContent.kpiLabel, `${field}.content.kpiLabel`, 200),
        kpiChange: optionalString(rawContent.kpiChange, `${field}.content.kpiChange`, 100),
        visualDirection: optionalString(
          rawContent.visualDirection,
          `${field}.content.visualDirection`,
          1_000
        ),
      },
      narration: requiredString(scene.narration, `${field}.narration`, 5_000),
    };
    if (scene.transition !== undefined) {
      if (!new Set(["fade", "slide", "zoom"]).has(scene.transition as string)) {
        fail(`${field}.transition is invalid`);
      }
      parsed.transition = scene.transition as Scene["transition"];
    }
    startTime += duration;
    return parsed;
  });

  const palette = asObject(data.colorPalette, "presentation.colorPalette");
  const narrationScript = optionalString(
    data.narrationScript,
    "presentation.narrationScript",
    60_000
  );

  return {
    title: requiredString(data.title, "presentation.title", 200),
    subtitle: optionalString(data.subtitle, "presentation.subtitle", 300),
    sourceAttribution: requiredString(
      data.sourceAttribution,
      "presentation.sourceAttribution",
      500
    ),
    totalDuration: startTime,
    scenes,
    narrationScript: narrationScript ?? scenes.map((scene) => scene.narration).join(" "),
    colorPalette: {
      primary: color(palette.primary, "presentation.colorPalette.primary"),
      secondary: color(palette.secondary, "presentation.colorPalette.secondary"),
      accent: color(palette.accent, "presentation.colorPalette.accent"),
      background: color(palette.background, "presentation.colorPalette.background"),
      text: color(palette.text, "presentation.colorPalette.text"),
    },
  };
}

export function parseContentLength(value: string | null): number {
  if (value === null) fail("Content-Length header is required");
  if (!/^\d+$/.test(value)) fail("Content-Length header is invalid");
  const length = Number(value);
  if (!Number.isSafeInteger(length) || length <= 0) {
    fail("Content-Length header is invalid");
  }
  return length;
}

export function parseAspectRatio(value: FormDataEntryValue | null): AspectRatio {
  if (typeof value !== "string" || !(value in ASPECT_DIMENSIONS)) {
    fail("Aspect ratio is invalid");
  }
  return value as AspectRatio;
}

export function parseFps(value: FormDataEntryValue | null): number {
  if (typeof value !== "string" || !/^\d+$/.test(value)) fail("FPS is invalid");
  const fps = Number(value);
  if (!(SUPPORTED_FPS as readonly number[]).includes(fps)) {
    fail(`FPS must be one of: ${SUPPORTED_FPS.join(", ")}`);
  }
  return fps;
}

export function parseVoice(value: FormDataEntryValue | null): string {
  if (
    typeof value !== "string" ||
    !(SUPPORTED_VOICES as readonly string[]).includes(value)
  ) {
    fail("Voice is invalid");
  }
  return value;
}

export function parseOutputFormat(value: FormDataEntryValue | null): OutputFormat {
  if (typeof value !== "string" || !OUTPUT_FORMATS.has(value as OutputFormat)) {
    fail("Output format is invalid");
  }
  return value as OutputFormat;
}

export function parseDurationMode(
  value: FormDataEntryValue | null
): JobConfig["durationMode"] {
  if (value !== "auto" && value !== "manual") fail("Duration mode is invalid");
  return value;
}

export function parseManualDuration(
  value: FormDataEntryValue | null,
  mode: JobConfig["durationMode"]
): number {
  if (mode === "auto") return config.defaults.duration;
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    fail("Manual duration is invalid");
  }
  const duration = Number(value);
  if (!Number.isInteger(duration) || duration < 15 || duration > 300) {
    fail("Manual duration must be between 15 and 300 seconds");
  }
  return duration;
}

export function validatePrompt(value: FormDataEntryValue | null): string {
  return requiredString(value, "Prompt", config.limits.maxPromptChars);
}

export function validateSourceText(value: FormDataEntryValue | null): string {
  if (value === null) return "";
  if (typeof value !== "string") fail("Source text is invalid");
  if (value.length > config.limits.maxCombinedChars) {
    fail(`Source text exceeds ${config.limits.maxCombinedChars} characters`);
  }
  return value;
}

export function parseBoolean(
  value: FormDataEntryValue | null,
  field: string,
  defaultValue = false
): boolean {
  if (value === null) return defaultValue;
  if (value === "true") return true;
  if (value === "false") return false;
  fail(`${field} must be true or false`);
}

export function validateUploadedFile(value: FormDataEntryValue): File {
  if (!(value instanceof File)) fail("Uploaded file entry is invalid");
  const ext = path.extname(value.name).toLowerCase();
  if (!(config.limits.allowedExtensions as readonly string[]).includes(ext)) {
    fail(`Unsupported file type: "${value.name}"`);
  }
  if (
    value.type &&
    !(config.limits.allowedTypes as readonly string[]).includes(value.type)
  ) {
    fail(`Unsupported MIME type for "${value.name}"`);
  }
  return value;
}
