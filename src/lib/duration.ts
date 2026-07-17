export type DurationMode = "auto" | "manual";

export const AUTO_DURATION_MIN_SECONDS = 30;
export const AUTO_DURATION_MAX_SECONDS = 180;
export const AUTO_DURATION_WORDS_PER_MINUTE = 130;

export function estimateAutoDuration(
  narration: string,
  sceneCount: number
): number {
  const wordCount = narration.trim()
    ? narration.trim().split(/\s+/).length
    : 0;
  const narrationSeconds =
    (wordCount / AUTO_DURATION_WORDS_PER_MINUTE) * 60;
  const visualBufferSeconds = Math.max(1, sceneCount) * 1.5;
  const closingHoldSeconds = 4;
  const estimatedSeconds = Math.ceil(
    narrationSeconds + visualBufferSeconds + closingHoldSeconds
  );

  return Math.min(
    AUTO_DURATION_MAX_SECONDS,
    Math.max(AUTO_DURATION_MIN_SECONDS, estimatedSeconds)
  );
}
