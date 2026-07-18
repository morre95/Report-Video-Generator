import { NextRequest, NextResponse } from "next/server";
import { deleteJob, getJob } from "@/lib/jobs/store";
import { isSafeJobId } from "@/lib/jobs/persist";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  return NextResponse.json(job);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!isSafeJobId(id)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  const job = await getJob(id);
  if (!job) {
    // Still attempt artifact cleanup in case metadata was already gone.
    try {
      await deleteJob(id);
    } catch {
      // ignore
    }
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  await deleteJob(id);
  return NextResponse.json({ ok: true, id });
}
