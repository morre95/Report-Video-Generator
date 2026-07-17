import type { Scene } from "@/lib/types";

/**
 * Adjusts scene start times and durations so the total exactly
 * matches targetDuration, proportionally rescaling each scene.
 */
export function retimeScenes(
  scenes: Scene[],
  targetDuration: number
): Scene[] {
  if (scenes.length === 0) return scenes;

  const currentTotal = scenes.reduce((sum, s) => sum + s.duration, 0);
  if (currentTotal <= 0) {
    const each = targetDuration / scenes.length;
    let acc = 0;
    return scenes.map((s) => {
      const updated = { ...s, startTime: acc, duration: each };
      acc += each;
      return updated;
    });
  }

  const scale = targetDuration / currentTotal;
  let accumulated = 0;
  const retimed = scenes.map((scene, i) => {
    const duration =
      i === scenes.length - 1
        ? targetDuration - accumulated
        : Math.round(scene.duration * scale * 10) / 10;
    const updated = {
      ...scene,
      startTime: Math.round(accumulated * 10) / 10,
      duration,
    };
    accumulated += duration;
    return updated;
  });

  return retimed;
}

/**
 * Estimates narration word count given a target duration
 * at a standard pacing of ~140 words per minute.
 */
export function estimateWordBudget(
  durationSeconds: number,
  wpm: number = 140
): number {
  return Math.round((durationSeconds / 60) * wpm);
}
