import { config } from "@/lib/config";
import { parseGeminiError } from "@/lib/gemini/client";
import fs from "fs/promises";
import path from "path";

export async function generateVoiceover(
  narrationScript: string,
  jobId: string,
  voice: string = "Charon"
): Promise<{ audioPath: string; durationSeconds: number }> {
  const prompt = `You are a professional documentary narrator delivering a financial/technology report summary. 
Speak in a clear, authoritative, measured pace. Use a warm but informative tone.
Pause briefly between sections. Emphasize key numbers and percentages.`;

  try {
    const ttsResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        headers: {
          "x-goog-api-key": config.geminiApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-3.1-flash-tts-preview",
          input: `${prompt}\n\n${narrationScript}`,
          response_format: { type: "audio" },
          generation_config: {
            speech_config: [{ voice }],
          },
        }),
      }
    );

    if (!ttsResponse.ok) {
      const errText = await ttsResponse.text();
      throw new Error(`TTS API error ${ttsResponse.status}: ${errText}`);
    }

    const ttsResult: unknown = await ttsResponse.json();
    const b64Audio = extractAudioData(ttsResult);
    if (!b64Audio) {
      throw new Error(
        "Gemini TTS completed without returning an audio payload."
      );
    }
    const audioData = Buffer.from(b64Audio, "base64");

    const audioDir = path.join(config.dirs.audio, jobId);
    await fs.mkdir(audioDir, { recursive: true });
    const audioPath = path.join(audioDir, "voiceover.wav");
    const wavBuffer = wrapPcmInWav(audioData);
    await fs.writeFile(audioPath, wavBuffer);

    const sampleRate = 24000;
    const bytesPerSample = 2;
    const channels = 1;
    const durationSeconds =
      audioData.length / (sampleRate * bytesPerSample * channels);

    return { audioPath, durationSeconds };
  } catch (err: unknown) {
    throw new Error(`Voiceover generation failed: ${parseGeminiError(err)}`);
  }
}

function extractAudioData(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;

  const response = result as {
    output_audio?: { data?: unknown };
    audioContent?: unknown;
    steps?: Array<{
      content?: Array<{ type?: unknown; data?: unknown }>;
    }>;
  };

  if (typeof response.output_audio?.data === "string") {
    return response.output_audio.data;
  }
  if (typeof response.audioContent === "string") {
    return response.audioContent;
  }

  for (const step of response.steps ?? []) {
    for (const content of step.content ?? []) {
      if (content.type === "audio" && typeof content.data === "string") {
        return content.data;
      }
    }
  }

  return undefined;
}

function wrapPcmInWav(pcmData: Buffer): Buffer {
  const sampleRate = 24000;
  const channels = 1;
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

