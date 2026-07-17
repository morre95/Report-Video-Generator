import { NextResponse } from "next/server";
import { listBackgroundMusic } from "@/lib/music";

export async function GET() {
  try {
    return NextResponse.json({ files: await listBackgroundMusic() });
  } catch {
    return NextResponse.json(
      { error: "Could not read the background music folder" },
      { status: 500 }
    );
  }
}
