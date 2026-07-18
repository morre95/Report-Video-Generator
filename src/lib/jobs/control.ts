import { JobCancelledError } from "@/lib/abort";

interface ActiveJob {
  controller: AbortController;
  promise: Promise<void>;
}

const activeJobs = new Map<string, ActiveJob>();

export function startTrackedJob(
  jobId: string,
  work: (signal: AbortSignal) => Promise<void>
): Promise<void> {
  if (activeJobs.has(jobId)) {
    throw new Error(`Job ${jobId} is already running`);
  }

  const controller = new AbortController();
  const promise = Promise.resolve().then(() => work(controller.signal));
  const active = { controller, promise };
  activeJobs.set(jobId, active);

  const cleanup = () => {
    if (activeJobs.get(jobId) === active) activeJobs.delete(jobId);
  };
  void promise.then(cleanup, cleanup);
  return promise;
}

export async function cancelTrackedJob(jobId: string): Promise<boolean> {
  const active = activeJobs.get(jobId);
  if (!active) return false;

  active.controller.abort(new JobCancelledError());
  await active.promise.catch(() => undefined);
  return true;
}

export function isJobActive(jobId: string): boolean {
  return activeJobs.has(jobId);
}
