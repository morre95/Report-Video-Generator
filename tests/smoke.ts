import { retimeScenes, estimateWordBudget } from "../src/lib/timing";
import { buildCompositionHtml } from "../src/lib/hyperframes/build-composition";
import type { PresentationData, Scene } from "../src/lib/types";

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

// --- Summary ---
console.log(`\n${"=".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
