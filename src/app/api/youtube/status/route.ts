import { NextResponse } from "next/server";
import { buildEnvStatus } from "@/lib/youtube/status";

export const runtime = "nodejs";

/** 환경·도구 상태 (비밀 값은 포함하지 않음 — has*Key() 불리언만) */
export async function GET() {
  const status = await buildEnvStatus({ ensureFonts: false });
  return NextResponse.json(status, { headers: { "cache-control": "no-store" } });
}
