import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/jobs/store";
import fs from "fs/promises";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const job = await getJob(id);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (!job.pptxPath) {
    return NextResponse.json(
      { error: "PowerPoint not ready", status: job.status },
      { status: 202 }
    );
  }

  try {
    const data = await fs.readFile(job.pptxPath);
    return new NextResponse(data, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Length": String(data.byteLength),
        "Content-Disposition":
          'attachment; filename="report-presentation.pptx"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "PowerPoint file not found" },
      { status: 404 }
    );
  }
}
