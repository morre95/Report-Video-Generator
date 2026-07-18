import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
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
  // Unique temp name avoids ENOENT when concurrent saves share the same ms.
  const temp = path.join(config.dirs.jobs, `.${job.id}.${randomUUID()}.tmp`);
  const payload = JSON.stringify(job, null, 2);
  await fs.writeFile(temp, payload, "utf-8");
  try {
    await fs.rename(temp, target);
  } catch (err) {
    // Fallback if rename races or temp vanished; still try a direct write.
    try {
      await fs.writeFile(target, payload, "utf-8");
    } finally {
      await fs.rm(temp, { force: true });
    }
    if (!(err instanceof Error && "code" in err && err.code === "ENOENT")) {
      throw err;
    }
  }
}

/** Serialize disk writes per job so rapid updateJob calls do not collide. */
const writeChains = new Map<string, Promise<void>>();

export function enqueueJobWrite(job: Job): Promise<void> {
  const previous = writeChains.get(job.id) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      await writeJobFile(job);
      await pruneJobFiles();
    });

  writeChains.set(job.id, next);
  void next.finally(() => {
    if (writeChains.get(job.id) === next) {
      writeChains.delete(job.id);
    }
  });

  return next;
}

export async function loadJobsFromDisk(): Promise<Job[]> {
  try {
    await fs.mkdir(config.dirs.jobs, { recursive: true });
    const entries = await fs.readdir(config.dirs.jobs);
    const jobs: Job[] = [];

    for (const entry of entries) {
      // Only final job metadata files (not .tmp sidecars).
      if (!/^[0-9a-f-]+\.json$/i.test(entry)) continue;
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
    const jsonFiles = entries.filter((e) => /^[0-9a-f-]+\.json$/i.test(e));
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
