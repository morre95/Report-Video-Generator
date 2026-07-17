import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/jobs/store";
import fs from "fs/promises";

export async function GET(
  _req: NextRequest,
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

  try {
    const content = await fs.readFile(job.outputPath);
    return new NextResponse(new Uint8Array(content), {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(content.byteLength),
        "Content-Disposition": `attachment; filename="report-video.mp4"`,
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
