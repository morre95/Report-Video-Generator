import fs from "fs";
import type { Job } from "@/lib/types";
import {
  clearDeletedJobFlag,
  deleteJobArtifacts,
  enqueueJobWrite,
  loadJobsFromDisk,
  sanitizeJobArtifacts,
} from "@/lib/jobs/persist";
import { cancelTrackedJob } from "@/lib/jobs/control";

const jobs = new Map<string, Job>();
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

const TERMINAL_STATUSES = new Set<Job["status"]>(["complete", "error"]);

export function recoverInterruptedJob(job: Job): Job {
  if (TERMINAL_STATUSES.has(job.status)) return job;
  return {
    ...job,
    status: "error",
    error: "Generation was interrupted by a server restart. Start a new job.",
  };
}

function persistAsync(job: Job): void {
  void enqueueJobWrite(job).catch((err) => {
    console.error(`Failed to persist job ${job.id}:`, err);
  });
}

export async function ensureJobsHydrated(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    const diskJobs = await loadJobsFromDisk();
    for (const job of diskJobs) {
      if (!jobs.has(job.id)) {
        const sanitized = sanitizeJobArtifacts(job, (p) => fs.existsSync(p));
        const recovered = recoverInterruptedJob(sanitized);
        jobs.set(job.id, recovered);
        if (recovered !== sanitized) persistAsync(recovered);
      }
    }
    hydrated = true;
  })();

  try {
    await hydratePromise;
  } finally {
    hydratePromise = null;
  }
}

export async function getJob(id: string): Promise<Job | undefined> {
  await ensureJobsHydrated();
  const job = jobs.get(id);
  if (!job) return undefined;
  return sanitizeJobArtifacts(job, (p) => fs.existsSync(p));
}

export function setJob(job: Job): void {
  clearDeletedJobFlag(job.id);
  const stored = { ...job };
  jobs.set(job.id, stored);
  persistAsync(stored);
}

export function updateJob(id: string, updates: Partial<Job>): Job | null {
  const existing = jobs.get(id);
  // Soft no-op when a job was deleted while still processing.
  if (!existing) return null;
  const updated = { ...existing, ...updates };
  jobs.set(id, updated);
  persistAsync(updated);
  return updated;
}

export async function deleteJob(id: string): Promise<boolean> {
  await ensureJobsHydrated();
  await cancelTrackedJob(id);
  const existed = jobs.delete(id);
  await deleteJobArtifacts(id);
  return existed;
}

export async function listJobs(): Promise<Job[]> {
  await ensureJobsHydrated();
  return Array.from(jobs.values())
    .map((job) => sanitizeJobArtifacts(job, (p) => fs.existsSync(p)))
    .sort((a, b) => b.createdAt - a.createdAt);
}
