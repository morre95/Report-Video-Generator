import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/jobs/store";
import { listJobImageSceneIds } from "@/lib/pptx/preview";

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

  if (!job.presentation) {
    return NextResponse.json(
      { error: "Presentation not ready", status: job.status },
      { status: 202 }
    );
  }

  const imageSceneIds = await listJobImageSceneIds(id);

  return NextResponse.json({
    presentation: job.presentation,
    imageSceneIds,
    aspectRatio: job.config.aspectRatio ?? "16:9",
    hasPptx: !!job.pptxPath,
  });
}
