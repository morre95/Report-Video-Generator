import { config } from "@/lib/config";

export const OPENROUTER_CHAT_MODEL = "google/gemini-3.5-flash";
export const OPENROUTER_TTS_MODEL =
  "google/gemini-3.1-flash-tts-preview";
export const OPENROUTER_IMAGE_MODEL = "google/gemini-2.5-flash-image";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export function getOpenRouterHeaders(): Record<string, string> {
  if (!config.openRouterApiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Add it to .env.local — get one at https://openrouter.ai/keys"
    );
  }

  return {
    Authorization: `Bearer ${config.openRouterApiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "http://localhost:3000",
    "X-OpenRouter-Title": "Report Video Generator",
  };
}

export function openRouterUrl(pathname: string): string {
  return `${OPENROUTER_BASE_URL}${pathname}`;
}

export async function parseOpenRouterResponseError(
  response: Response
): Promise<string> {
  let message = response.statusText || "Unknown OpenRouter error";

  try {
    const body = (await response.json()) as {
      error?: { code?: number | string; message?: string };
      message?: string;
    };
    message = body.error?.message ?? body.message ?? message;
  } catch {
    // The response was not JSON; use its status text.
  }

  if (response.status === 401 || response.status === 403) {
    return (
      "OpenRouter rejected the API key. Create a valid key at " +
      "https://openrouter.ai/keys, update OPENROUTER_API_KEY in .env.local, " +
      "and restart the dev server."
    );
  }

  if (response.status === 402) {
    return "OpenRouter has insufficient credits. Add credits at https://openrouter.ai/credits.";
  }

  if (response.status === 429) {
    return "OpenRouter rate limit exceeded. Wait briefly and try again.";
  }

  if (response.status === 404 || message.toLowerCase().includes("model")) {
    return `OpenRouter model unavailable: ${message}`;
  }

  return `OpenRouter API error ${response.status}: ${message}`;
}

export function parseOpenRouterError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw || "Unknown OpenRouter error";
}

export async function checkApiKey(): Promise<{
  ok: boolean;
  error?: string;
}> {
  if (!config.openRouterApiKey) {
    return {
      ok: false,
      error: "OPENROUTER_API_KEY is not set in .env.local",
    };
  }

  try {
    const response = await fetch(openRouterUrl("/key"), {
      headers: getOpenRouterHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        ok: false,
        error: await parseOpenRouterResponseError(response),
      };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: parseOpenRouterError(error) };
  }
}
