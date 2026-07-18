import fs from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { createJobArchive, type ArchiveArtifact } from "@/lib/jobs/archive";
import { getJob } from "@/lib/jobs/store";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const job = await getJob(id);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.status !== "complete") {
    return NextResponse.json(
      { error: "Downloads are not ready", status: job.status },
      { status: 202 }
    );
  }

  const candidates: ArchiveArtifact[] = [];
  if (job.outputPath) {
    candidates.push({
      filePath: job.outputPath,
      archiveName: "report-video.mp4",
    });
  }
  if (job.pptxPath) {
    candidates.push({
      filePath: job.pptxPath,
      archiveName: "report-presentation.pptx",
    });
  }

  const artifacts = (
    await Promise.all(
      candidates.map(async (artifact) => {
        try {
          const stat = await fs.stat(artifact.filePath);
          return stat.isFile() ? artifact : null;
        } catch {
          return null;
        }
      })
    )
  ).filter((artifact): artifact is ArchiveArtifact => artifact !== null);

  if (artifacts.length === 0) {
    return NextResponse.json(
      { error: "No generated files are available" },
      { status: 404 }
    );
  }

  const archive = createJobArchive(artifacts);
  archive.once("warning", (error) => archive.destroy(error));
  const stream = archiveToWebStream(archive, req.signal);
  void archive.finalize().catch((error) => archive.destroy(error));

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="report-package.zip"',
      "Cache-Control": "private, no-store",
    },
  });
}

function archiveToWebStream(
  archive: ReturnType<typeof createJobArchive>,
  signal?: AbortSignal
): ReadableStream<Uint8Array> {
  let closed = false;

  const stop = () => {
    archive.abort();
    if (!archive.destroyed) archive.destroy();
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      archive.on("data", (chunk: Buffer | string) => {
        if (closed) return;
        const bytes =
          typeof chunk === "string"
            ? new TextEncoder().encode(chunk)
            : new Uint8Array(chunk);
        try {
          controller.enqueue(bytes);
        } catch {
          closed = true;
          stop();
        }
      });
      archive.once("end", () => {
        if (closed) return;
        closed = true;
        controller.close();
      });
      archive.once("error", (error) => {
        if (closed) return;
        closed = true;
        controller.error(error);
      });

      const onAbort = () => {
        if (closed) return;
        closed = true;
        stop();
        try {
          controller.close();
        } catch {
          // The consumer may already have canceled the stream.
        }
      };
      if (signal?.aborted) onAbort();
      else signal?.addEventListener("abort", onAbort, { once: true });
    },
    cancel() {
      closed = true;
      stop();
    },
  });
}
