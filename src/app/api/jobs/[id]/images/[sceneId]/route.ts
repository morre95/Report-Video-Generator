import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import { getJob } from "@/lib/jobs/store";
import { resolveJobImagePath } from "@/lib/pptx/preview";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sceneId: string }> }
) {
  const { id, sceneId } = await params;
  const job = await getJob(id);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const filePath = await resolveJobImagePath(id, sceneId);
  if (!filePath) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  try {
    const data = await fs.readFile(filePath);
    return new NextResponse(data, {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(data.byteLength),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }
}
