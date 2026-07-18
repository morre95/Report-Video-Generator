import {
  getOpenRouterHeaders,
  OPENROUTER_TTS_MODEL,
  openRouterUrl,
  parseOpenRouterError,
  parseOpenRouterResponseError,
} from "@/lib/openrouter/client";
import { config } from "@/lib/config";
import type { Scene } from "@/lib/types";
import fs from "fs/promises";
import path from "path";
import {
  abortableDelay,
  isAbortError,
  throwIfAborted,
  withTimeout,
} from "@/lib/abort";

/** Stay well under Gemini TTS ~4000-byte text field limit. */
export const TTS_MAX_CHARS = 1800;
/** Target chunk size so each request stays under ~90s of speech. */
export const TTS_TARGET_CHARS = 900;
const TTS_SAMPLE_RATE = 24_000;
const TTS_CHANNELS = 1;
const TTS_BYTES_PER_SAMPLE = 2;
/** Brief pause between chunks so seams feel natural. */
const CHUNK_GAP_SECONDS = 0.2;
const MAX_TTS_ATTEMPTS = 3;

/**
 * Split narration into TTS-safe chunks at sentence boundaries.
 * Prefers per-scene narration when available, merging short scenes.
 */
export function splitNarrationForTts(
  narrationScript: string,
  scenes?: Scene[],
  options: { targetChars?: number; maxChars?: number } = {}
): string[] {
  const targetChars = options.targetChars ?? TTS_TARGET_CHARS;
  const maxChars = options.maxChars ?? TTS_MAX_CHARS;

  const sceneParts = (scenes ?? [])
    .map((scene) => scene.narration?.trim())
    .filter((part): part is string => !!part);

  const seedParts =
    sceneParts.length > 0
      ? sceneParts
      : narrationScript.trim()
        ? [narrationScript.trim()]
        : [];

  if (seedParts.length === 0) {
    throw new Error("Narration script is empty");
  }

  const sentenceParts: string[] = [];
  for (const part of seedParts) {
    if (part.length <= maxChars) {
      sentenceParts.push(part);
      continue;
    }
    sentenceParts.push(...splitLongText(part, maxChars));
  }

  return packChunks(sentenceParts, targetChars, maxChars);
}

function splitLongText(text: string, maxChars: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text];
  const pieces: string[] = [];

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    if (trimmed.length <= maxChars) {
      pieces.push(trimmed);
      continue;
    }

    // Hard-wrap oversized sentences on whitespace.
    let remaining = trimmed;
    while (remaining.length > maxChars) {
      let cut = remaining.lastIndexOf(" ", maxChars);
      if (cut < maxChars * 0.5) cut = maxChars;
      pieces.push(remaining.slice(0, cut).trim());
      remaining = remaining.slice(cut).trim();
    }
    if (remaining) pieces.push(remaining);
  }

  return pieces;
}

function packChunks(
  parts: string[],
  targetChars: number,
  maxChars: number
): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const part of parts) {
    if (!current) {
      current = part;
      continue;
    }

    const joined = `${current} ${part}`;
    if (joined.length <= targetChars) {
      current = joined;
      continue;
    }

    if (joined.length <= maxChars && current.length < targetChars * 0.6) {
      // Still under hard max and current chunk is small — keep packing.
      current = joined;
      continue;
    }

    chunks.push(current);
    current = part;
  }

  if (current) chunks.push(current);
  return chunks;
}

function silencePcm(seconds: number): Buffer {
  const samples = Math.round(seconds * TTS_SAMPLE_RATE);
  return Buffer.alloc(samples * TTS_CHANNELS * TTS_BYTES_PER_SAMPLE);
}

async function synthesizeChunk(
  text: string,
  voice: string,
  signal?: AbortSignal,
  attempt = 1
): Promise<Buffer> {
  throwIfAborted(signal);
  const ttsResponse = await fetch(openRouterUrl("/audio/speech"), {
    method: "POST",
    headers: getOpenRouterHeaders(),
    body: JSON.stringify({
      model: OPENROUTER_TTS_MODEL,
      input: text,
      voice,
      response_format: "pcm",
    }),
    signal: withTimeout(signal, 120_000),
  });

  if (!ttsResponse.ok) {
    const message = await parseOpenRouterResponseError(ttsResponse);
    // Gemini TTS occasionally fails with transient 500s on long jobs.
    if (
      attempt < MAX_TTS_ATTEMPTS &&
      (ttsResponse.status >= 500 || ttsResponse.status === 429)
    ) {
      await abortableDelay(500 * attempt, signal);
      return synthesizeChunk(text, voice, signal, attempt + 1);
    }
    throw new Error(message);
  }

  const audioData = Buffer.from(await ttsResponse.arrayBuffer());
  if (audioData.length === 0) {
    if (attempt < MAX_TTS_ATTEMPTS) {
      await abortableDelay(500 * attempt, signal);
      return synthesizeChunk(text, voice, signal, attempt + 1);
    }
    throw new Error(
      "OpenRouter TTS completed without returning an audio payload."
    );
  }

  return audioData;
}

export async function generateVoiceover(
  narrationScript: string,
  jobId: string,
  voice: string = "Charon",
  scenes?: Scene[],
  signal?: AbortSignal
): Promise<{ audioPath: string; durationSeconds: number; chunkCount: number }> {
  try {
    const chunks = splitNarrationForTts(narrationScript, scenes);
    const pcmParts: Buffer[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const pcm = await synthesizeChunk(chunks[i], voice, signal);
      pcmParts.push(pcm);
      if (i < chunks.length - 1) {
        pcmParts.push(silencePcm(CHUNK_GAP_SECONDS));
      }
    }

    const audioData = Buffer.concat(pcmParts);
    throwIfAborted(signal);
    const audioDir = path.join(config.dirs.audio, jobId);
    await fs.mkdir(audioDir, { recursive: true });
    const audioPath = path.join(audioDir, "voiceover.wav");
    await fs.writeFile(audioPath, wrapPcmInWav(audioData));

    const durationSeconds =
      audioData.length /
      (TTS_SAMPLE_RATE * TTS_BYTES_PER_SAMPLE * TTS_CHANNELS);

    return {
      audioPath,
      durationSeconds,
      chunkCount: chunks.length,
    };
  } catch (err: unknown) {
    if (isAbortError(err)) throw err;
    throw new Error(
      `Voiceover generation failed: ${parseOpenRouterError(err)}`
    );
  }
}

function wrapPcmInWav(pcmData: Buffer): Buffer {
  const sampleRate = TTS_SAMPLE_RATE;
  const channels = TTS_CHANNELS;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcmData.length;
  const headerSize = 44;

  const wav = Buffer.alloc(headerSize + dataSize);

  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataSize, 40);
  pcmData.copy(wav, headerSize);

  return wav;
}
