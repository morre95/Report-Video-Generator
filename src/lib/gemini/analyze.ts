import {
  getOpenRouterHeaders,
  OPENROUTER_CHAT_MODEL,
  openRouterUrl,
  parseOpenRouterError,
  parseOpenRouterResponseError,
} from "@/lib/openrouter/client";
import { config } from "@/lib/config";
import {
  AUTO_DURATION_MAX_SECONDS,
  AUTO_DURATION_MIN_SECONDS,
  estimateAutoDuration,
  type DurationMode,
} from "@/lib/duration";
import type { PresentationData } from "@/lib/types";

export async function analyzeReport(
  sourceText: string,
  userPrompt: string,
  durationSeconds: number,
  allowWebSearch: boolean = false,
  durationMode: DurationMode = "manual"
): Promise<PresentationData> {
  const wordsPerMinute = 125;
  const endingHoldSeconds = Math.min(4, Math.max(2, durationSeconds * 0.06));
  const narrationDuration = Math.max(8, durationSeconds - endingHoldSeconds);
  const closingDuration = Math.min(
    10,
    Math.max(6, Math.round(durationSeconds * 0.15))
  );
  const targetNarrationWords = Math.round(
    (narrationDuration / 60) * wordsPerMinute
  );
  const sceneCount = Math.max(
    4,
    Math.min(8, Math.round(durationSeconds / 25))
  );
  const autoDuration = durationMode === "auto";
  const sceneGuidance = autoDuration
    ? `Create 4-8 scenes. Choose the number based on how much meaningful, well-supported information the sources contain.`
    : `Create ${sceneCount} scenes that tell a complete story arc: hook, context, key findings, deep dives, a concise recap, and conclusion.`;
  const narrationGuidance = autoDuration
    ? `Choose an appropriate narrative scope between 65 and 360 words based on the source material and brief. Prefer a focused short video over padding, but include enough detail to tell a complete story.`
    : `Keep the full spoken narration to approximately ${targetNarrationWords} words total across all scenes. It must finish naturally before the video ends; do not exceed this budget.`;
  const timingGuidance = autoDuration
    ? `Recommend a totalDuration between ${AUTO_DURATION_MIN_SECONDS} and ${AUTO_DURATION_MAX_SECONDS} seconds that fits the narration and visuals. Scene durations must sum to that recommendation.`
    : `Scene durations must sum to exactly ${durationSeconds}.`;
  const closingGuidance = autoDuration
    ? `The final scene MUST have type "closing", use roughly 10-15% of the recommended duration, and remain on screen after its narration finishes.`
    : `The final scene MUST have type "closing", last approximately ${closingDuration} seconds, and remain on screen after its narration finishes.`;

  const webSearchGuidance = allowWebSearch
    ? `\n- The uploaded documents are your PRIMARY evidence. You may search the web for supplementary context (market comparisons, industry benchmarks, recent events) but never let web results contradict or replace document data.
- If a web source conflicts with the uploaded documents, explicitly note the discrepancy.
- When you use information from the web, include the domain in your sourceAttribution (e.g. "Company Report + reuters.com, nasdaq.com").`
    : "";

  // Put compact top-level fields first so truncation is less likely to drop them.
  const systemPrompt = `You are an expert presentation designer and data analyst. Your job is to transform source documents into compelling, visually rich video presentations.

You MUST return valid JSON matching the schema below. No markdown, no explanation, just JSON.

RULES:
- Extract real numbers, percentages, and facts from the source. Never invent data.
- Every claim should reference the source material.${webSearchGuidance}
- ${sceneGuidance}
- ${narrationGuidance}
- Put each scene's spoken lines ONLY in that scene's "narration" field. Do NOT duplicate a full top-level narrationScript (omit it or leave it empty); it will be assembled from scenes.
- Include charts with real data from the source where appropriate. Use bars for comparisons, lines for trends, donuts for compositions. Keep chart data arrays short (3-6 points).
- ${timingGuidance}
- ${closingGuidance}
- The closing scene must summarize the main conclusion, include 2-3 concise factual takeaways in content.bullets, and end its narration with a complete, conclusive sentence. Do not introduce unsupported facts.
- KPI scenes should highlight a single dramatic metric with year-over-year or quarter-over-quarter change.
- Choose a color palette that fits the brand/topic (financial = deep blues/greens, tech = dark/neon, etc).
- Keep content fields concise so the full JSON fits in one response.

JSON SCHEMA:
{
  "title": "string - compelling title",
  "subtitle": "string - optional subtitle",
  "sourceAttribution": "string - credit line for the source document",
  "totalDuration": ${autoDuration ? `"number between ${AUTO_DURATION_MIN_SECONDS} and ${AUTO_DURATION_MAX_SECONDS}"` : durationSeconds},
  "colorPalette": {
    "primary": "#hex",
    "secondary": "#hex", 
    "accent": "#hex",
    "background": "#hex (dark preferred)",
    "text": "#hex"
  },
  "scenes": [
    {
      "id": "scene-1",
      "startTime": 0,
      "duration": number,
      "type": "title|kpi|chart|bullets|comparison|closing",
      "content": {
        "headline": "string",
        "subtext": "string (optional)",
        "bullets": ["string"] (optional, for bullets type),
        "chart": {
          "type": "bar|line|donut|comparison",
          "title": "string",
          "data": [{"label": "string", "value": number, "color": "#hex (optional)"}],
          "unit": "string (optional, e.g. '$B', '%')"
        } (optional, for chart type),
        "kpiValue": "string (e.g. '$81.6B')" (optional, for kpi type),
        "kpiLabel": "string" (optional),
        "kpiChange": "string (e.g. '+85% YoY')" (optional),
        "sourceExcerpt": "string (brief quote from source)",
        "visualDirection": "string (art direction note)"
      },
      "narration": "string - this scene's narration segment",
      "transition": "fade|slide|zoom"
    }
  ]
}`;

  // Longer videos need more output budget; avoid cutting off mid-JSON.
  const maxTokens = Math.min(
    24_000,
    Math.max(10_000, 6_000 + sceneCount * 1_200 + Math.round(targetNarrationWords * 2))
  );

  let raw: string;
  let citationAnnotations: Array<{ type?: string; url?: string; title?: string }> = [];
  let finishReason: string | undefined;
  try {
    const requestBody: Record<string, unknown> = {
      model: OPENROUTER_CHAT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `${userPrompt}\n\nSOURCE DOCUMENTS:\n\n${sourceText.slice(0, config.limits.maxCombinedChars)}`,
        },
      ],
      response_format: { type: "json_object" },
      plugins: [{ id: "response-healing" }],
      temperature: 0.7,
      max_tokens: maxTokens,
    };

    if (allowWebSearch) {
      requestBody.tools = [{ type: "openrouter:web_search" }];
    }

    const response = await fetch(openRouterUrl("/chat/completions"), {
      method: "POST",
      headers: getOpenRouterHeaders(),
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(await parseOpenRouterResponseError(response));
    }

    const completion = (await response.json()) as {
      choices?: Array<{
        finish_reason?: string | null;
        message?: {
          content?: string | null;
          annotations?: Array<{
            type?: string;
            url?: string;
            title?: string;
          }>;
        };
      }>;
    };
    raw = completion.choices?.[0]?.message?.content ?? "";
    finishReason = completion.choices?.[0]?.finish_reason ?? undefined;
    citationAnnotations = completion.choices?.[0]?.message?.annotations ?? [];
  } catch (err) {
    throw new Error(parseOpenRouterError(err));
  }

  if (!raw.trim()) {
    throw new Error(
      "OpenRouter returned an empty response. This can happen with rate limits or content filtering. Please retry."
    );
  }

  let parsed: PresentationData;
  try {
    parsed = extractJson<PresentationData>(raw);
  } catch (err) {
    if (finishReason === "length" || finishReason === "max_tokens") {
      throw new Error(
        "The presentation JSON was truncated because the response ran out of tokens. Try a shorter duration or retry."
      );
    }
    throw err;
  }

  if (citationAnnotations.length > 0) {
    const domains = new Set<string>();
    for (const ann of citationAnnotations) {
      if (ann.url) {
        try {
          domains.add(new URL(ann.url).hostname.replace(/^www\./, ""));
        } catch {
          // skip malformed URLs
        }
      }
    }
    if (domains.size > 0) {
      const existing = parsed.sourceAttribution || "";
      const domainList = Array.from(domains).slice(0, 5).join(", ");
      parsed.sourceAttribution = existing
        ? `${existing} + ${domainList}`
        : domainList;
    }
  }

  ensureNarrationScript(parsed);

  const finalDuration = autoDuration
    ? estimateAutoDuration(parsed.narrationScript, parsed.scenes.length)
    : durationSeconds;
  validatePresentation(parsed, finalDuration);
  return parsed;
}

/**
 * Extracts a JSON object from a model response that may contain
 * markdown fences, leading text, trailing text, or other wrapping.
 */
function extractJson<T>(raw: string): T {
  // 1. Try parsing the whole thing directly
  try {
    return JSON.parse(raw);
  } catch {
    // continue to fallback strategies
  }

  // 2. Strip markdown code fences (```json ... ``` or ``` ... ```)
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch {
      // continue
    }
  }

  // 3. Find the first { and last } to extract the JSON object
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = raw.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      // continue
    }
  }

  // 4. Log what we got for debugging and throw
  console.error(
    "Failed to extract JSON from OpenRouter response. First 500 chars:",
    raw.slice(0, 500)
  );
  throw new Error(
    "OpenRouter did not return valid JSON. " +
      `Response starts with: "${raw.slice(0, 120).replace(/\n/g, "\\n")}..." — Please retry.`
  );
}

function validatePresentation(data: PresentationData, expectedDuration: number) {
  if (!data.title) throw new Error("Missing presentation title");
  if (!data.scenes || data.scenes.length < 2)
    throw new Error("Need at least 2 scenes");
  ensureNarrationScript(data);

  const totalSceneDuration = data.scenes.reduce(
    (sum, s) => sum + s.duration,
    0
  );

  if (Math.abs(totalSceneDuration - expectedDuration) > 2) {
    const scale = expectedDuration / totalSceneDuration;
    let accumulated = 0;
    data.scenes.forEach((scene) => {
      scene.duration = Math.round(scene.duration * scale);
      scene.startTime = accumulated;
      accumulated += scene.duration;
    });
    const drift = expectedDuration - accumulated;
    if (drift !== 0) {
      data.scenes[data.scenes.length - 1].duration += drift;
    }
  }

  data.totalDuration = expectedDuration;
}

/**
 * Prefer an explicit top-level script; otherwise join per-scene narration.
 * Long videos often omit narrationScript when the JSON is near the token limit.
 */
export function ensureNarrationScript(data: PresentationData): void {
  const existing = data.narrationScript?.trim();
  if (existing) {
    data.narrationScript = existing;
    return;
  }

  const fromScenes = (data.scenes ?? [])
    .map((scene) => scene.narration?.trim())
    .filter((part): part is string => !!part)
    .join(" ")
    .trim();

  if (!fromScenes) {
    throw new Error("Missing narration script");
  }

  data.narrationScript = fromScenes;
}
