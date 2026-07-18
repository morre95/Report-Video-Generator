import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/jobs/store";
import fs from "fs/promises";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const job = await getJob(id);

  if (!job?.compositionPath) {
    return NextResponse.json(
      { error: "Composition not ready", status: job?.status },
      { status: job ? 202 : 404 }
    );
  }

  try {
    const content = await fs.readFile(job.compositionPath, "utf-8");
    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy":
          "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; media-src 'self'; connect-src 'none'",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Composition file not found" },
      { status: 404 }
    );
  }
}
