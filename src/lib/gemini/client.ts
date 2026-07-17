import { GoogleGenAI } from "@google/genai";
import { config } from "@/lib/config";

let _client: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!_client) {
    if (!config.geminiApiKey) {
      throw new Error(
        "GEMINI_API_KEY is not set. Add it to .env.local — get one at https://aistudio.google.com/apikey"
      );
    }
    _client = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }
  return _client;
}

export function parseGeminiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);

  if (raw.includes("API_KEY_SERVICE_BLOCKED")) {
    return (
      "Your Gemini API key is blocked from accessing the Generative Language API. " +
      "Fix: go to https://aistudio.google.com/apikey and create a NEW API key " +
      "(the new key will be an 'auth key' that works automatically). " +
      "Then paste it into .env.local as GEMINI_API_KEY and restart the dev server."
    );
  }

  if (raw.includes("API_KEY_INVALID") || raw.includes("invalid")) {
    return (
      "Invalid Gemini API key. Get a valid key at https://aistudio.google.com/apikey " +
      "and set it in .env.local as GEMINI_API_KEY."
    );
  }

  if (raw.includes("PERMISSION_DENIED")) {
    return (
      "Permission denied. Your API key may not have the Generative Language API enabled. " +
      "Create a fresh key at https://aistudio.google.com/apikey and update .env.local."
    );
  }

  if (raw.includes("RESOURCE_EXHAUSTED") || raw.includes("429")) {
    return "Rate limit exceeded. Wait a moment and try again, or upgrade your Gemini API quota.";
  }

  if (raw.includes("no longer available") || (raw.includes("model") && raw.includes("not found"))) {
    return (
      "The Gemini model is no longer available. The app has been updated to use gemini-3.5-flash. " +
      "Restart the dev server to pick up the change."
    );
  }

  return raw;
}

export async function checkApiKey(): Promise<{
  ok: boolean;
  error?: string;
}> {
  if (!config.geminiApiKey) {
    return {
      ok: false,
      error: "GEMINI_API_KEY is not set in .env.local",
    };
  }

  try {
    const client = getGeminiClient();
    await client.models.countTokens({
      model: "gemini-3.5-flash",
      contents: "API health check",
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: parseGeminiError(err) };
  }
}
