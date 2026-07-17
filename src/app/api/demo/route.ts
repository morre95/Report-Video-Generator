import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export async function GET() {
  const demoPath = path.join(process.cwd(), "data/demos/nvidia-q1-fy2027.json");
  try {
    const data = await fs.readFile(demoPath, "utf-8");
    return NextResponse.json(JSON.parse(data));
  } catch {
    return NextResponse.json({ error: "Demo data not found" }, { status: 404 });
  }
}
