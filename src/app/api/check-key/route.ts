import { NextResponse } from "next/server";
import { checkApiKey } from "@/lib/openrouter/client";

export async function GET() {
  const result = await checkApiKey();
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
