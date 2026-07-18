import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/jobs/store";
import fs from "fs/promises";
import { createReadStream } from "fs";
import type { Readable } from "stream";

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

  if (job.status !== "complete" || !job.outputPath) {
    return NextResponse.json(
      { error: "Render not ready", status: job.status },
      { status: 202 }
    );
  }

  const download = req.nextUrl.searchParams.get("download") === "1";
  const disposition = download
    ? `attachment; filename="report-video.mp4"`
    : `inline; filename="report-video.mp4"`;

  try {
    const stat = await fs.stat(job.outputPath);
    const fileSize = stat.size;
    const range = req.headers.get("range");

    if (range) {
      const parsedRange = parseByteRange(range, fileSize);
      if (!parsedRange) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            "Content-Range": `bytes */${fileSize}`,
          },
        });
      }

      const { start, end } = parsedRange;
      const chunkSize = end - start + 1;
      const nodeStream = createReadStream(job.outputPath, { start, end });

      return new NextResponse(nodeToWebStream(nodeStream, req.signal), {
        status: 206,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(chunkSize),
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Disposition": disposition,
          "Cache-Control": "private, no-store",
        },
      });
    }

    const nodeStream = createReadStream(job.outputPath);
    return new NextResponse(nodeToWebStream(nodeStream, req.signal), {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(fileSize),
        "Accept-Ranges": "bytes",
        "Content-Disposition": disposition,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Output file not found" },
      { status: 404 }
    );
  }
}

/**
 * Convert a Node readable into a Web ReadableStream that tolerates client
 * aborts (video seeking cancels range requests). Readable.toWeb() throws
 * "Controller is already closed" when the consumer disconnects mid-stream.
 */
function nodeToWebStream(
  nodeStream: Readable,
  signal?: AbortSignal
): ReadableStream<Uint8Array> {
  let closed = false;

  const destroySource = () => {
    if (!nodeStream.destroyed) {
      nodeStream.destroy();
    }
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const onData = (chunk: Buffer | string) => {
        if (closed) return;
        const bytes =
          typeof chunk === "string"
            ? new TextEncoder().encode(chunk)
            : new Uint8Array(chunk);
        try {
          controller.enqueue(bytes);
        } catch {
          closed = true;
          destroySource();
        }
      };

      const onEnd = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Consumer already canceled.
        }
      };

      const onError = (error: Error) => {
        if (closed) return;
        closed = true;
        try {
          controller.error(error);
        } catch {
          // Consumer already canceled.
        }
      };

      const onAbort = () => {
        if (closed) return;
        closed = true;
        destroySource();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };

      nodeStream.on("data", onData);
      nodeStream.once("end", onEnd);
      nodeStream.once("error", onError);

      if (signal) {
        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener("abort", onAbort, { once: true });
        }
      }
    },
    cancel() {
      closed = true;
      destroySource();
    },
  });
}

function parseByteRange(
  rangeHeader: string,
  fileSize: number
): { start: number; end: number } | null {
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (!match[1] && !match[2]) || fileSize <= 0) return null;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null;

    return {
      start: Math.max(0, fileSize - suffixLength),
      end: fileSize - 1,
    };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : fileSize - 1;
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(requestedEnd) ||
    start < 0 ||
    requestedEnd < start ||
    start >= fileSize
  ) {
    return null;
  }

  return {
    start,
    end: Math.min(requestedEnd, fileSize - 1),
  };
}
