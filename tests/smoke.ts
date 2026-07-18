import { retimeScenes, estimateWordBudget } from "../src/lib/timing";
import {
  AUTO_DURATION_MAX_SECONDS,
  AUTO_DURATION_MIN_SECONDS,
  estimateAutoDuration,
} from "../src/lib/duration";
import { buildCompositionHtml } from "../src/lib/hyperframes/build-composition";
import { mapChartType, buildPptx } from "../src/lib/pptx/build-pptx";
import { selectScenesForImages } from "../src/lib/openrouter/images";
import type { PresentationData, Scene } from "../src/lib/types";
import fs from "fs/promises";
import path from "path";
import { config } from "../src/lib/config";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${label}`);
  } else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}

// --- retimeScenes ---
console.log("\nretimeScenes:");

const scenes: Scene[] = [
  {
    id: "s1",
    startTime: 0,
    duration: 10,
    type: "title",
    content: { headline: "A" },
    narration: "test",
  },
  {
    id: "s2",
    startTime: 10,
    duration: 15,
    type: "kpi",
    content: { headline: "B", kpiValue: "1", kpiLabel: "L" },
    narration: "test2",
  },
  {
    id: "s3",
    startTime: 25,
    duration: 5,
    type: "closing",
    content: { headline: "C" },
    narration: "test3",
  },
];

const retimed = retimeScenes(scenes, 60);

const totalDuration = retimed.reduce((s, sc) => s + sc.duration, 0);
assert(
  Math.abs(totalDuration - 60) < 0.5,
  `total duration is 60 (got ${totalDuration})`
);

assert(retimed[0].startTime === 0, "first scene starts at 0");
assert(retimed.length === 3, "preserves scene count");

for (let i = 1; i < retimed.length; i++) {
  assert(
    Math.abs(retimed[i].startTime - (retimed[i - 1].startTime + retimed[i - 1].duration)) < 0.2,
    `scene ${i} startTime aligns with previous scene end`
  );
}

// --- estimateWordBudget ---
console.log("\nestimateWordBudget:");

assert(estimateWordBudget(60) === 140, "60s at 140wpm = 140 words");
assert(estimateWordBudget(120) === 280, "120s at 140wpm = 280 words");
assert(estimateWordBudget(30, 200) === 100, "30s at 200wpm = 100 words");

// --- estimateAutoDuration ---
console.log("\nestimateAutoDuration:");

assert(
  estimateAutoDuration("", 0) === AUTO_DURATION_MIN_SECONDS,
  "empty narration uses the 30-second minimum"
);
assert(
  estimateAutoDuration("word ".repeat(130), 6) === 73,
  "130 words plus six-scene visual buffer produces 73 seconds"
);
assert(
  estimateAutoDuration("word ".repeat(1_000), 10) ===
    AUTO_DURATION_MAX_SECONDS,
  "long narration is capped at 180 seconds"
);
assert(
  estimateAutoDuration("word ".repeat(65), 4) >=
    AUTO_DURATION_MIN_SECONDS,
  "short presentations remain within the automatic range"
);

// --- buildCompositionHtml ---
console.log("\nbuildCompositionHtml:");

const mockPresentation: PresentationData = {
  title: "Test Report",
  subtitle: "Q1 2027",
  sourceAttribution: "Source: Test Corp",
  totalDuration: 30,
  narrationScript: "This is a test narration.",
  colorPalette: {
    primary: "#1e40af",
    secondary: "#1e3a5f",
    accent: "#22c55e",
    background: "#0a0a0f",
    text: "#ffffff",
  },
  scenes: [
    {
      id: "s1",
      startTime: 0,
      duration: 10,
      type: "title",
      content: {
        headline: "Test Report",
        subtext: "Subtitle",
      },
      narration: "Welcome",
      transition: "fade",
    },
    {
      id: "s2",
      startTime: 10,
      duration: 10,
      type: "kpi",
      content: {
        headline: "Revenue",
        kpiValue: "$81.6B",
        kpiLabel: "Total Revenue",
        kpiChange: "+85% YoY",
      },
      narration: "Revenue grew",
      transition: "slide",
    },
    {
      id: "s3",
      startTime: 20,
      duration: 10,
      type: "chart",
      content: {
        headline: "Revenue Breakdown",
        chart: {
          type: "bar",
          title: "Revenue by Segment",
          data: [
            { label: "Data Center", value: 75.2 },
            { label: "Gaming", value: 3.8 },
            { label: "Auto", value: 1.1 },
          ],
          unit: "$B",
        },
      },
      narration: "Data center led",
      transition: "fade",
    },
  ],
};

const html = buildCompositionHtml(mockPresentation, {
  duration: 30,
  fps: 30,
  aspectRatio: "16:9",
  voiceoverPath: "assets/voiceover.wav",
  musicPath: "assets/lofi7.mp3",
  musicVolume: -26,
});

assert(html.includes("data-duration=\"30\""), "HTML includes duration");
assert(html.includes("data-width=\"1920\""), "HTML includes width 1920");
assert(html.includes("data-height=\"1080\""), "HTML includes height 1080");
assert(html.includes("data-fps=\"30\""), "HTML includes fps");
assert(html.includes("Test Report"), "HTML includes title");
assert(html.includes("$81.6B"), "HTML includes KPI value");
assert(html.includes("+85% YoY"), "HTML includes KPI change");
assert(html.includes("gsap.timeline"), "HTML includes GSAP timeline");
assert(html.includes("data-composition-id"), "HTML includes composition ID");
assert(html.includes('id="s1"'), "scene clips have stable IDs");
assert(html.includes("Revenue by Segment") || html.includes("Revenue Breakdown"), "HTML includes chart");
assert(html.includes("data-volume"), "HTML includes music audio with volume");
assert(html.includes("data-loop"), "HTML includes music loop attribute");
assert(
  html.includes('id="voiceover" class="clip"'),
  "voiceover is a discoverable Hyperframes clip"
);
assert(
  html.includes('id="background-music" class="clip"'),
  "background music is a discoverable Hyperframes clip"
);
assert(
  !html.includes('<html lang="en" data-duration'),
  "timing metadata is only on the composition root"
);
assert(html.includes("Source: Test Corp"), "HTML includes source attribution");

// 4:3 aspect ratio
const html43 = buildCompositionHtml(mockPresentation, {
  duration: 30,
  fps: 30,
  aspectRatio: "4:3",
});
assert(html43.includes("data-width=\"1440\""), "4:3 uses width 1440");
assert(html43.includes("data-height=\"1080\""), "4:3 uses height 1080");

// --- buildBalancedSourceContext ---
console.log("\nbuildBalancedSourceContext:");

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

assert(
  buildBalancedSourceContext([], 1000) === "",
  "empty sources → empty string"
);

assert(
  buildBalancedSourceContext([{ name: "a.pdf", text: "hello" }], 1000).includes("=== SOURCE: a.pdf ==="),
  "single source has header"
);

const twoSources = buildBalancedSourceContext(
  [
    { name: "a.pdf", text: "A".repeat(100) },
    { name: "b.docx", text: "B".repeat(100) },
  ],
  120
);
assert(twoSources.includes("=== SOURCE: a.pdf ==="), "two sources: first header present");
assert(twoSources.includes("=== SOURCE: b.docx ==="), "two sources: second header present");

const longText = "X".repeat(500);
const trimmed = buildBalancedSourceContext(
  [
    { name: "big.txt", text: longText },
    { name: "small.txt", text: "tiny" },
  ],
  200
);
assert(
  trimmed.length <= 300,
  `budget is respected (got ${trimmed.length} chars, headers add overhead but body ≤ 200)`
);

assert(
  !buildBalancedSourceContext(
    [
      { name: "a.txt", text: "A".repeat(200) },
      { name: "b.txt", text: "B".repeat(200) },
    ],
    100
  ).includes("A".repeat(100)),
  "each source limited to fair share"
);

// --- file dedup logic ---
console.log("\nfile dedup logic:");

function deduplicateFiles(
  prev: { name: string; size: number }[],
  incoming: { name: string; size: number }[]
): { name: string; size: number }[] {
  const existing = new Set(prev.map((f) => `${f.name}:${f.size}`));
  const deduped = incoming.filter((f) => !existing.has(`${f.name}:${f.size}`));
  return [...prev, ...deduped].slice(0, 10);
}

const files1 = [{ name: "a.pdf", size: 100 }];
const files2 = [{ name: "a.pdf", size: 100 }, { name: "b.pdf", size: 200 }];
const merged = deduplicateFiles(files1, files2);
assert(merged.length === 2, "dedup removes duplicate a.pdf");
assert(merged[1].name === "b.pdf", "new file b.pdf is appended");

const tooMany = Array.from({ length: 12 }, (_, i) => ({ name: `f${i}.pdf`, size: i }));
assert(deduplicateFiles([], tooMany).length === 10, "max 10 files enforced");

// --- OpenRouter web search request shape ---
console.log("\nOpenRouter request shape:");

function buildRequestBody(allowWebSearch: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: "google/gemini-3.5-flash",
    messages: [],
    response_format: { type: "json_object" },
    plugins: [{ id: "response-healing" }],
    temperature: 0.7,
    max_tokens: 10_000,
  };
  if (allowWebSearch) {
    body.tools = [{ type: "openrouter:web_search" }];
  }
  return body;
}

const withSearch = buildRequestBody(true);
assert(
  Array.isArray(withSearch.tools) &&
    (withSearch.tools as Array<{ type: string }>)[0].type === "openrouter:web_search",
  "web search enabled → tools array present"
);

const withoutSearch = buildRequestBody(false);
assert(withoutSearch.tools === undefined, "web search disabled → no tools key");

// --- PPTX chart mapping ---
console.log("\nmapChartType:");

assert(mapChartType("bar") === "bar", "bar → bar");
assert(mapChartType("line") === "line", "line → line");
assert(mapChartType("donut") === "doughnut", "donut → doughnut");
assert(mapChartType("comparison") === "bar", "comparison → bar");

// --- selectScenesForImages ---
console.log("\nselectScenesForImages:");

const imagePickPresentation: PresentationData = {
  ...mockPresentation,
  scenes: [
    {
      id: "title",
      startTime: 0,
      duration: 5,
      type: "title",
      content: { headline: "Title" },
      narration: "intro",
    },
    {
      id: "chart",
      startTime: 5,
      duration: 10,
      type: "chart",
      content: {
        headline: "Chart",
        visualDirection: "abstract data viz",
        chart: {
          type: "bar",
          title: "Revenue",
          data: [{ label: "A", value: 1 }],
        },
      },
      narration: "chart",
    },
    {
      id: "closing",
      startTime: 15,
      duration: 5,
      type: "closing",
      content: { headline: "Close", bullets: ["a", "b"] },
      narration: "end",
    },
  ],
};

const picked = selectScenesForImages(imagePickPresentation, 3);
assert(picked.some((s) => s.type === "title"), "selects title scene");
assert(picked.some((s) => s.type === "closing"), "selects closing scene");
assert(
  picked.some((s) => s.id === "chart"),
  "selects visualDirection scene when capacity remains"
);
assert(selectScenesForImages(imagePickPresentation, 1).length === 1, "respects maxImages");

// --- buildPptx ---
console.log("\nbuildPptx:");

void (async () => {
  try {
    const pptxJobId = "smoke-pptx-test";
    const pptxPath = await buildPptx(mockPresentation, pptxJobId, {
      aspectRatio: "16:9",
      images: {},
    });
    const pptxStat = await fs.stat(pptxPath);
    assert(pptxStat.isFile(), "pptx file was written");
    assert(pptxStat.size > 1_000, `pptx has content (${pptxStat.size} bytes)`);
    assert(
      path.dirname(pptxPath) === path.join(config.dirs.pptx, pptxJobId),
      "pptx written under runtime pptx dir"
    );
    await fs.rm(path.join(config.dirs.pptx, pptxJobId), {
      recursive: true,
      force: true,
    });
  } catch (err) {
    failed++;
    console.error("  FAIL: buildPptx threw", err);
  }

  console.log(`\n${"=".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
