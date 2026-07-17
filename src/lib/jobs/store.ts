import type { Job } from "@/lib/types";

const jobs = new Map<string, Job>();

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function setJob(job: Job): void {
  jobs.set(job.id, { ...job });
}

export function updateJob(id: string, updates: Partial<Job>): Job {
  const existing = jobs.get(id);
  if (!existing) throw new Error(`Job ${id} not found`);
  const updated = { ...existing, ...updates };
  jobs.set(id, updated);
  return updated;
}

export function listJobs(): Job[] {
  return Array.from(jobs.values()).sort((a, b) => b.createdAt - a.createdAt);
}
