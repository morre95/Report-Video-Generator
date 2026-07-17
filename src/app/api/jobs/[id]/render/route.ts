import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/jobs/store";
import fs from "fs/promises";
import { createReadStream } from "fs";
import { Readable } from "stream";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const job = getJob(id);

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
      const stream = createReadStream(job.outputPath, { start, end });

      return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
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

    const stream = createReadStream(job.outputPath);
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
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
