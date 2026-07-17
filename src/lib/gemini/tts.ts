import {
  getOpenRouterHeaders,
  OPENROUTER_TTS_MODEL,
  openRouterUrl,
  parseOpenRouterError,
  parseOpenRouterResponseError,
} from "@/lib/openrouter/client";
import { config } from "@/lib/config";
import fs from "fs/promises";
import path from "path";

export async function generateVoiceover(
  narrationScript: string,
  jobId: string,
  voice: string = "Charon"
): Promise<{ audioPath: string; durationSeconds: number }> {
  try {
    const ttsResponse = await fetch(
      openRouterUrl("/audio/speech"),
      {
        method: "POST",
        headers: getOpenRouterHeaders(),
        body: JSON.stringify({
          model: OPENROUTER_TTS_MODEL,
          input: narrationScript,
          voice,
          response_format: "pcm",
        }),
      }
    );

    if (!ttsResponse.ok) {
      throw new Error(await parseOpenRouterResponseError(ttsResponse));
    }

    const audioData = Buffer.from(await ttsResponse.arrayBuffer());
    if (audioData.length === 0) {
      throw new Error(
        "OpenRouter TTS completed without returning an audio payload."
      );
    }

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
    throw new Error(
      `Voiceover generation failed: ${parseOpenRouterError(err)}`
    );
  }
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

