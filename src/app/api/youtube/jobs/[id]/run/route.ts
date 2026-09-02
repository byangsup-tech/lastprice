import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { localRunAllowed } from "@/lib/youtube/config";
import { loadJob, lockHolder } from "@/lib/youtube/jobs";
import { isValidJobId, jobPaths } from "@/lib/youtube/paths";
import { buildRunArgs, jsonError, readJsonBody, requireDashboardToken } from "../../../_shared/http";

export const runtime = "nodejs";

/**
 * 파이프라인을 분리된 자식 프로세스로 실행 (로컬 전용).
 * body { from?, to?, force?, upload?, privacy?, publishAt? } — 검증된 값만 CLI 인자로 전달.
 * 셸을 거치지 않고 process.execPath + tsx cli.mjs 를 직접 spawn 한다.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidJobId(id)) return jsonError("잘못된 작업 id", 400);
  const denied = requireDashboardToken(req);
  if (denied) return denied;
  if (!localRunAllowed()) {
    return jsonError(
      `로컬 환경에서만 실행할 수 있습니다 — CLI를 사용하세요: npm run yt -- run --job ${id}`,
      403,
    );
  }
  const job = await loadJob(id);
  if (!job) return jsonError("작업을 찾을 수 없습니다", 404);

  const bodyRead = await readJsonBody(req, 64 * 1024);
  if (!bodyRead.ok) return jsonError(bodyRead.error, bodyRead.status);
  const parsed = buildRunArgs(bodyRead.value);
  if (!parsed.ok) return jsonError(parsed.error, 400);

  const holder = await lockHolder(id);
  if (holder) return jsonError(`이미 실행 중입니다 (pid ${holder})`, 409, { pid: holder });

  const cli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  if (!fs.existsSync(cli)) return jsonError("tsx 실행기를 찾을 수 없습니다 (node_modules/tsx)", 500);

  const p = jobPaths(id);
  const args = [cli, "scripts/youtube.ts", "run", "--job", id, ...parsed.args];
  let fd: number;
  try {
    fs.mkdirSync(p.logsDir, { recursive: true });
    fs.appendFileSync(
      p.spawnLog,
      `\n[${new Date().toISOString()}] spawn: ${["node", ...args.slice(1)].join(" ")}\n`,
    );
    fd = fs.openSync(p.spawnLog, "a");
  } catch (err) {
    return jsonError(`로그 파일을 열 수 없습니다: ${err instanceof Error ? err.message : String(err)}`, 500);
  }

  try {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      detached: true,
      windowsHide: true,
      stdio: ["ignore", fd, fd],
      // 개발 서버의 NODE_OPTIONS(인스펙터 등)가 자식에 전파되지 않도록 비움
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    child.on("error", (err) => {
      try {
        fs.appendFileSync(p.spawnLog, `[${new Date().toISOString()}] spawn 실패: ${err.message}\n`);
      } catch {
        // 무시
      }
    });
    child.unref();
    return NextResponse.json(
      { started: true, pid: child.pid ?? null, request: parsed.request, log: "logs/pipeline.out" },
      { status: 202 },
    );
  } catch (err) {
    return jsonError(`실행 시작 실패: ${err instanceof Error ? err.message : String(err)}`, 500);
  } finally {
    fs.closeSync(fd);
  }
}
