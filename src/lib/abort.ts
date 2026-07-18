export class JobCancelledError extends Error {
  constructor(message = "Job was canceled") {
    super(message);
    this.name = "JobCancelledError";
  }
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new JobCancelledError();
}

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof JobCancelledError ||
    (error instanceof Error &&
      (error.name === "AbortError" || error.name === "JobCancelledError"))
  );
}

export function withTimeout(
  signal: AbortSignal | undefined,
  timeoutMs: number
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function abortableDelay(
  milliseconds: number,
  signal?: AbortSignal
): Promise<void> {
  throwIfAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(signal?.reason instanceof Error ? signal.reason : new JobCancelledError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
