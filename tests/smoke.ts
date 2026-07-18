import { retimeScenes, estimateWordBudget } from "../src/lib/timing";
import {
  AUTO_DURATION_MAX_SECONDS,
  AUTO_DURATION_MIN_SECONDS,
  estimateAutoDuration,
} from "../src/lib/duration";
import { ensureNarrationScript } from "../src/lib/gemini/analyze";
import {
  splitNarrationForTts,
  TTS_MAX_CHARS,
  TTS_TARGET_CHARS,
} from "../src/lib/gemini/tts";
import { buildCompositionHtml } from "../src/lib/hyperframes/build-composition";
import { mapChartType, buildPptx } from "../src/lib/pptx/build-pptx";
import {
  isSafeSceneId,
  listJobImageSceneIds,
  resolveJobImagePath,
} from "../src/lib/pptx/preview";
import {
  generateSlideImage,
  selectScenesForImages,
} from "../src/lib/openrouter/images";
import {
  jobToHistoryItem,
  sanitizeJobArtifacts,
  isSafeJobId,
  deleteJobArtifacts,
  enqueueJobWrite,
  jobFilePath,
} from "../src/lib/jobs/persist";
import { musicLoopIterations } from "../src/lib/music";
import type { Job, PresentationData, Scene } from "../src/lib/types";
import fs from "fs/promises";
import path from "path";
import { config } from "../src/lib/config";
import {
  parseAspectRatio,
  parseBoolean,
  parseContentLength,
  parseDurationMode,
  parseFps,
  parseManualDuration,
  parseOutputFormat,
  parseVoice,
  validatePresentationData,
  validatePrompt,
  validateSourceText,
} from "../src/lib/validation";
import {
  cancelTrackedJob,
  isJobActive,
  startTrackedJob,
} from "../src/lib/jobs/control";
import { recoverInterruptedJob } from "../src/lib/jobs/store";

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
assert(/\sloop[\s>]/.test(html), "HTML includes native loop attribute");
assert(
  html.includes('id="voiceover" class="clip"'),
  "voiceover is a discoverable Hyperframes clip"
);
assert(
  html.includes('id="background-music" class="clip"'),
  "background music is a discoverable Hyperframes clip"
);

console.log("\npresentation validation and composition safety:");
{
  const wrongStarts = {
    ...mockPresentation,
    scenes: mockPresentation.scenes.map((scene) => ({
      ...scene,
      startTime: 999,
    })),
  };
  const validated = validatePresentationData(wrongStarts);
  assert(validated.scenes[0].startTime === 0, "rebuilds first scene start time");
  assert(
    validated.scenes[1].startTime === validated.scenes[0].duration,
    "rebuilds sequential scene timing"
  );

  let unsafeColorRejected = false;
  try {
    buildCompositionHtml(
      {
        ...mockPresentation,
        colorPalette: {
          ...mockPresentation.colorPalette,
          primary: "red;}</style><script>alert(1)</script><style>",
        },
      },
      { duration: 30, fps: 30, aspectRatio: "16:9" }
    );
  } catch {
    unsafeColorRejected = true;
  }
  assert(unsafeColorRejected, "rejects CSS/script injection in palette values");

  let unsafeIdRejected = false;
  try {
    validatePresentationData({
      ...mockPresentation,
      scenes: [
        { ...mockPresentation.scenes[0], id: "../escape" },
        mockPresentation.scenes[1],
      ],
    });
  } catch {
    unsafeIdRejected = true;
  }
  assert(unsafeIdRejected, "rejects unsafe scene ids");

  let duplicateIdRejected = false;
  try {
    validatePresentationData({
      ...mockPresentation,
      scenes: mockPresentation.scenes.map((scene) => ({ ...scene, id: "same" })),
    });
  } catch {
    duplicateIdRejected = true;
  }
  assert(duplicateIdRejected, "rejects duplicate scene ids");
}

console.log("\nrequest validation:");
assert(parseContentLength("1024") === 1024, "accepts valid content length");
assert(parseAspectRatio("9:16") === "9:16", "accepts configured aspect ratio");
assert(parseFps("60") === 60, "accepts configured FPS");
assert(parseVoice("Charon") === "Charon", "accepts configured voice");
assert(parseOutputFormat("both") === "both", "accepts output format");
assert(parseDurationMode("manual") === "manual", "accepts duration mode");
assert(parseManualDuration("300", "manual") === 300, "accepts max duration");
assert(parseBoolean("false", "test") === false, "parses strict boolean");
assert(validatePrompt("  concise brief  ") === "concise brief", "trims prompt");
assert(validateSourceText("source") === "source", "accepts bounded source text");

for (const [label, action] of [
  ["rejects missing content length", () => parseContentLength(null)],
  ["rejects unsupported aspect ratio", () => parseAspectRatio("3:2")],
  ["rejects unsupported FPS", () => parseFps("120")],
  ["rejects unsupported voice", () => parseVoice("Unknown")],
  ["rejects oversized prompt", () => validatePrompt("x".repeat(4_001))],
  ["rejects oversized source text", () => validateSourceText("x".repeat(200_001))],
] as const) {
  let threw = false;
  try {
    action();
  } catch {
    threw = true;
  }
  assert(threw, label);
}
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

// --- job history helpers ---
console.log("\njob history helpers:");

const historyJob: Job = {
  id: "hist-1",
  status: "complete",
  progress: 100,
  createdAt: Date.now(),
  config: {
    prompt: "Investor update",
    duration: 60,
    durationMode: "auto",
    outputFormat: "both",
    aspectRatio: "16:9",
    fps: 30,
    voice: "Charon",
    backgroundMusic: "lofi7.mp3",
    fileNames: ["report.pdf"],
    allowWebSearch: false,
  },
  presentation: {
    ...mockPresentation,
    title: "Q1 Results",
  },
  outputPath: "/tmp/does-not-exist-video.mp4",
  pptxPath: "/tmp/does-not-exist-deck.pptx",
};

const sanitized = sanitizeJobArtifacts(historyJob, () => false);
assert(!sanitized.outputPath, "missing video artifact clears outputPath");
assert(!sanitized.pptxPath, "missing pptx artifact clears pptxPath");

const roundTrip = JSON.parse(JSON.stringify(historyJob)) as Job;
assert(roundTrip.id === historyJob.id, "job JSON round-trip keeps id");
assert(
  roundTrip.presentation?.title === "Q1 Results",
  "job JSON round-trip keeps presentation title"
);

const item = jobToHistoryItem({
  ...sanitized,
  outputPath: undefined,
  pptxPath: "/real/path.pptx",
});
assert(item.title === "Q1 Results", "history item uses presentation title");
assert(item.hasVideo === false, "history item hasVideo false without path");
assert(item.hasPptx === true, "history item hasPptx true with path");
assert(item.outputFormat === "both", "history item keeps outputFormat");

const untitled = jobToHistoryItem({
  ...historyJob,
  presentation: undefined,
  config: { ...historyJob.config, prompt: "Brief from prompt alone" },
});
assert(
  untitled.title === "Brief from prompt alone",
  "history falls back to prompt when title missing"
);

console.log("\ninterrupted job recovery:");
const recovered = recoverInterruptedJob({
  ...historyJob,
  status: "rendering",
  progress: 75,
});
assert(recovered.status === "error", "processing job becomes an error after restart");
assert(
  recovered.error?.includes("server restart") === true,
  "recovered job explains the interruption"
);
assert(
  recoverInterruptedJob(historyJob) === historyJob,
  "terminal job is unchanged during recovery"
);

console.log("\nensureNarrationScript:");
{
  const withScript = {
    ...mockPresentation,
    narrationScript: "  Keep me.  ",
  };
  ensureNarrationScript(withScript);
  assert(
    withScript.narrationScript === "Keep me.",
    "trims existing narrationScript"
  );

  const fromScenesOnly: PresentationData = {
    ...mockPresentation,
    narrationScript: "",
    scenes: [
      {
        id: "a",
        startTime: 0,
        duration: 5,
        type: "title",
        content: { headline: "A" },
        narration: "Hello there.",
      },
      {
        id: "b",
        startTime: 5,
        duration: 5,
        type: "closing",
        content: { headline: "B" },
        narration: "Goodbye now.",
      },
    ],
  };
  ensureNarrationScript(fromScenesOnly);
  assert(
    fromScenesOnly.narrationScript === "Hello there. Goodbye now.",
    "builds narrationScript from scene narrations"
  );

  let threw = false;
  try {
    ensureNarrationScript({
      ...mockPresentation,
      narrationScript: "",
      scenes: [
        {
          id: "a",
          startTime: 0,
          duration: 5,
          type: "title",
          content: { headline: "A" },
          narration: "",
        },
      ],
    });
  } catch {
    threw = true;
  }
  assert(threw, "throws when no narration is available");
}

console.log("\nsplitNarrationForTts:");
{
  const short = splitNarrationForTts("Hello world. This is fine.");
  assert(short.length === 1, "short script stays one chunk");

  const scenes: Scene[] = [
    {
      id: "1",
      startTime: 0,
      duration: 10,
      type: "title",
      content: { headline: "A" },
      narration: "Opening line one.",
    },
    {
      id: "2",
      startTime: 10,
      duration: 10,
      type: "kpi",
      content: { headline: "B" },
      narration: "Second beat with more detail about growth.",
    },
    {
      id: "3",
      startTime: 20,
      duration: 10,
      type: "closing",
      content: { headline: "C" },
      narration: "Closing thought for the audience.",
    },
  ];
  const fromScenes = splitNarrationForTts("", scenes);
  assert(
    fromScenes.length >= 1 &&
      fromScenes.join(" ").includes("Opening") &&
      fromScenes.join(" ").includes("Closing"),
    "uses scene narrations when script empty"
  );

  const longSentence = "Word ".repeat(500).trim() + ".";
  const longChunks = splitNarrationForTts(longSentence, undefined, {
    targetChars: TTS_TARGET_CHARS,
    maxChars: TTS_MAX_CHARS,
  });
  assert(longChunks.length > 1, "long text splits into multiple chunks");
  assert(
    longChunks.every((c) => c.length <= TTS_MAX_CHARS),
    "no chunk exceeds max chars"
  );

  const fiveMinWords = Array.from({ length: 620 }, (_, i) => `word${i}`).join(
    " "
  );
  const fiveMinChunks = splitNarrationForTts(fiveMinWords);
  assert(
    fiveMinChunks.length >= 3,
    `300s-scale script yields multiple chunks (got ${fiveMinChunks.length})`
  );
}

console.log("\nmusicLoopIterations:");
assert(musicLoopIterations(60, 60) === 0, "same length needs no loop");
assert(musicLoopIterations(90, 60) === 0, "longer track needs no loop");
assert(musicLoopIterations(60, 120) === 1, "2x target needs 1 extra loop");
assert(musicLoopIterations(60, 300) === 4, "5x target needs 4 extra loops");
assert(musicLoopIterations(0, 60) === 0, "invalid source duration is 0");

console.log("\ndeleteJobArtifacts:");
assert(
  isSafeJobId("a1b2c3d4-e5f6-7890-abcd-ef1234567890"),
  "accepts uuid job id"
);
assert(!isSafeJobId("../etc"), "rejects path traversal job id");
assert(!isSafeJobId("smoke-pptx-test"), "rejects non-uuid job id");

void (async () => {
  console.log("\ntracked job cancellation:");
  try {
    const trackedId = "cancel-test";
    let abortObserved = false;
    const trackedPromise = startTrackedJob(trackedId, async (signal) => {
      try {
        await new Promise<void>((_resolve, reject) => {
          if (signal.aborted) {
            reject(signal.reason);
            return;
          }
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      } finally {
        abortObserved = true;
      }
    });
    await Promise.resolve();
    assert(isJobActive(trackedId), "tracks active job");
    assert(await cancelTrackedJob(trackedId), "cancel reports active job");
    await trackedPromise.catch(() => undefined);
    assert(abortObserved, "tracked work observes cancellation");
    assert(!isJobActive(trackedId), "removes canceled job from registry");
  } catch (err) {
    failed++;
    console.error("  FAIL: tracked cancellation threw", err);
  }

  console.log("\nimage artifact path safety:");
  const unsafeImage = await generateSlideImage(
    "unused",
    "b1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "../../../public/escape"
  );
  assert(unsafeImage === null, "rejects traversal before image generation");

  console.log("\njob write rejection handling:");
  const failingId = "c1b2c3d4-e5f6-7890-abcd-ef1234567890";
  const failingTarget = jobFilePath(failingId);
  let unhandled = false;
  const onUnhandled = () => {
    unhandled = true;
  };
  process.on("unhandledRejection", onUnhandled);
  try {
    await fs.mkdir(failingTarget, { recursive: true });
    await enqueueJobWrite({ ...historyJob, id: failingId }).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert(!unhandled, "failed metadata write does not create unhandled rejection");
  } finally {
    process.off("unhandledRejection", onUnhandled);
    await fs.rm(failingTarget, { recursive: true, force: true });
  }

  try {
    const delId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const dirs = [
      path.join(config.dirs.uploads, delId),
      path.join(config.dirs.renders, delId),
      path.join(config.dirs.pptx, delId),
      path.join(config.dirs.images, delId),
      path.join(config.dirs.audio, delId),
      path.join(config.dirs.compositions, delId),
    ];
    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "marker.txt"), "x");
    }
    await fs.mkdir(config.dirs.jobs, { recursive: true });
    await fs.writeFile(
      path.join(config.dirs.jobs, `${delId}.json`),
      JSON.stringify({ id: delId }),
      "utf-8"
    );

    await deleteJobArtifacts(delId);

    for (const dir of dirs) {
      try {
        await fs.access(dir);
        assert(false, `artifact dir removed: ${path.basename(path.dirname(dir))}/${delId}`);
      } catch {
        assert(true, `artifact dir removed: ${path.basename(dir)}`);
      }
    }
    try {
      await fs.access(path.join(config.dirs.jobs, `${delId}.json`));
      assert(false, "job json removed");
    } catch {
      assert(true, "job json removed");
    }
  } catch (err) {
    failed++;
    console.error("  FAIL: deleteJobArtifacts threw", err);
  }

  // --- buildPptx ---
  console.log("\nbuildPptx:");

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

  // --- pptx preview image helpers ---
  console.log("\npptx preview helpers:");
  assert(isSafeSceneId("scene-1"), "accepts hyphenated scene id");
  assert(isSafeSceneId("abc_123"), "accepts underscore scene id");
  assert(!isSafeSceneId("../etc"), "rejects path traversal");
  assert(!isSafeSceneId("a/b"), "rejects slash in scene id");

  try {
    const previewJobId = "smoke-preview-imgs";
    const imageDir = path.join(config.dirs.images, previewJobId);
    await fs.mkdir(imageDir, { recursive: true });
    await fs.writeFile(path.join(imageDir, "title.png"), Buffer.from([1, 2, 3]));
    await fs.writeFile(path.join(imageDir, "closing.png"), Buffer.from([4, 5, 6]));
    await fs.writeFile(path.join(imageDir, "notes.txt"), "ignore");

    const ids = await listJobImageSceneIds(previewJobId);
    assert(
      ids.length === 2 && ids.includes("title") && ids.includes("closing"),
      `lists png scene ids (got ${ids.join(",")})`
    );
    assert(
      (await resolveJobImagePath(previewJobId, "title")) ===
        path.join(imageDir, "title.png"),
      "resolves existing image path"
    );
    assert(
      (await resolveJobImagePath(previewJobId, "missing")) === null,
      "missing image resolves to null"
    );
    assert(
      (await resolveJobImagePath(previewJobId, "../title")) === null,
      "unsafe scene id resolves to null"
    );

    await fs.rm(imageDir, { recursive: true, force: true });
  } catch (err) {
    failed++;
    console.error("  FAIL: pptx preview helpers threw", err);
  }

  console.log(`\n${"=".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
