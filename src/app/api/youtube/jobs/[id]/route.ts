import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import {
  isRunning,
  loadJob,
  loadMetadata,
  loadScript,
  loadTimeline,
  readLogTail,
} from "@/lib/youtube/jobs";
import { isValidJobId, jobPaths } from "@/lib/youtube/paths";
import type { JobDetailResponse } from "@/lib/youtube/types";
import { jsonError } from "../../_shared/http";

export const runtime = "nodejs";

/** 파일 라우트로 서빙 가능한 산출물 중 실제로 존재하는 것만 {name,size}로 */
async function listFiles(jobId: string): Promise<{ name: string; size: number }[]> {
  const p = jobPaths(jobId);
  const fixed = [
    "final.mp4",
    "thumbnail.png",
    "thumbnail.jpg",
    "subtitles.srt",
    "script.json",
    "metadata.json",
    "logs/pipeline.log",
    "logs/render.log",
    "logs/pipeline.out",
  ];
  let frames: string[] = [];
  try {
    frames = (await fs.readdir(p.framesDir))
      .filter((f) => /^scene-\d{3}\.png$/.test(f))
      .sort()
      .map((f) => `frames/${f}`);
  } catch {
    // 프레임 없음
  }
  const names = [...fixed, ...frames];
  const stats = await Promise.all(
    names.map(async (name) => {
      try {
        const st = await fs.stat(path.join(p.root, name));
        return st.isFile() && st.size > 0 ? { name, size: st.size } : null;
      } catch {
        return null;
      }
    }),
  );
  return stats.filter((f): f is { name: string; size: number } => !!f);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidJobId(id)) return jsonError("잘못된 작업 id", 400);
  const job = await loadJob(id);
  if (!job) return jsonError("작업을 찾을 수 없습니다", 404);
  // isRunning은 죽은 잠금을 정리하며 running 단계를 failed로 되돌릴 수 있으므로 먼저 실행
  const running = await isRunning(id);
  const fresh = (await loadJob(id)) ?? job;
  const [script, metadata, timeline, logTail, files] = await Promise.all([
    loadScript(id),
    loadMetadata(id),
    loadTimeline(id),
    readLogTail(id, 60),
    listFiles(id),
  ]);
  const body: JobDetailResponse = { job: fresh, script, metadata, timeline, logTail, files, running };
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}
