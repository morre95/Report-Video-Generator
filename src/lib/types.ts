export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

export interface ChartData {
  type: "bar" | "line" | "donut" | "comparison";
  title: string;
  data: ChartDataPoint[];
  unit?: string;
}

export interface SceneContent {
  headline: string;
  subtext?: string;
  bullets?: string[];
  chart?: ChartData;
  sourceExcerpt?: string;
  kpiValue?: string;
  kpiLabel?: string;
  kpiChange?: string;
  visualDirection?: string;
}

export interface Scene {
  id: string;
  startTime: number;
  duration: number;
  type: "title" | "kpi" | "chart" | "bullets" | "comparison" | "closing";
  content: SceneContent;
  narration: string;
  transition?: "fade" | "slide" | "zoom";
}

export interface PresentationData {
  title: string;
  subtitle?: string;
  sourceAttribution: string;
  totalDuration: number;
  scenes: Scene[];
  narrationScript: string;
  colorPalette: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
}

export type JobStatus =
  | "uploading"
  | "extracting"
  | "analyzing"
  | "generating_tts"
  | "composing"
  | "rendering"
  | "complete"
  | "error";

export interface Job {
  id: string;
  status: JobStatus;
  progress: number;
  error?: string;
  config: JobConfig;
  presentation?: PresentationData;
  compositionPath?: string;
  outputPath?: string;
  createdAt: number;
}

export interface JobConfig {
  prompt: string;
  duration: number;
  durationMode: "auto" | "manual";
  aspectRatio: "16:9" | "4:3" | "9:16" | "1:1";
  fps: number;
  voice: string;
  backgroundMusic: string;
  fileNames: string[];
  allowWebSearch: boolean;
}
