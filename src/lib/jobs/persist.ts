import fs from "fs/promises";
import path from "path";
import { config } from "@/lib/config";
import type { Job, OutputFormat } from "@/lib/types";

export interface JobHistoryItem {
  id: string;
  createdAt: number;
  status: Job["status"];
  title: string;
  outputFormat: OutputFormat;
  hasVideo: boolean;
  hasPptx: boolean;
  fileNames: string[];
  error?: string;
  progress: number;
}

/**
 * Drop artifact paths whose files no longer exist on disk.
 * Pure helper (sync checks via provided exists fn) for easy testing.
 */
export function sanitizeJobArtifacts(
  job: Job,
  existsSync: (filePath: string) => boolean
): Job {
  const next = { ...job };
  if (next.outputPath && !existsSync(next.outputPath)) {
    delete next.outputPath;
  }
  if (next.pptxPath && !existsSync(next.pptxPath)) {
    delete next.pptxPath;
  }
  if (next.compositionPath && !existsSync(next.compositionPath)) {
    delete next.compositionPath;
  }
  return next;
}

export function jobToHistoryItem(job: Job): JobHistoryItem {
  const title =
    job.presentation?.title?.trim() ||
    job.config.prompt.trim().slice(0, 80) ||
    "Untitled presentation";

  return {
    id: job.id,
    createdAt: job.createdAt,
    status: job.status,
    title,
    outputFormat: job.config.outputFormat ?? "video",
    hasVideo: !!job.outputPath,
    hasPptx: !!job.pptxPath,
    fileNames: job.config.fileNames ?? [],
    error: job.error,
    progress: job.progress,
  };
}

export function jobFilePath(jobId: string): string {
  return path.join(config.dirs.jobs, `${jobId}.json`);
}

export async function writeJobFile(job: Job): Promise<void> {
  await fs.mkdir(config.dirs.jobs, { recursive: true });
  const target = jobFilePath(job.id);
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(job, null, 2), "utf-8");
  await fs.rename(temp, target);
}

export async function loadJobsFromDisk(): Promise<Job[]> {
  try {
    await fs.mkdir(config.dirs.jobs, { recursive: true });
    const entries = await fs.readdir(config.dirs.jobs);
    const jobs: Job[] = [];

    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(
          path.join(config.dirs.jobs, entry),
          "utf-8"
        );
        const parsed = JSON.parse(raw) as Job;
        if (parsed?.id) jobs.push(parsed);
      } catch {
        // skip corrupt files
      }
    }

    return jobs.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

/**
 * Keep only the newest `maxKeep` job JSON files; delete older metadata.
 * Does not delete render/pptx artifacts.
 */
export async function pruneJobFiles(
  maxKeep: number = config.defaults.maxHistoryJobs
): Promise<void> {
  try {
    const entries = await fs.readdir(config.dirs.jobs);
    const jsonFiles = entries.filter((e) => e.endsWith(".json"));
    if (jsonFiles.length <= maxKeep) return;

    const withStats = await Promise.all(
      jsonFiles.map(async (name) => {
        const full = path.join(config.dirs.jobs, name);
        const stat = await fs.stat(full);
        return { full, mtime: stat.mtimeMs };
      })
    );

    withStats.sort((a, b) => b.mtime - a.mtime);
    const toDelete = withStats.slice(maxKeep);
    await Promise.all(toDelete.map((f) => fs.rm(f.full, { force: true })));
  } catch {
    // ignore prune errors
  }
}
