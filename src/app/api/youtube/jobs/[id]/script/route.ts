import { NextResponse } from "next/server";
import {
  loadJob,
  loadScript,
  lockHolder,
  resetStagesAfter,
  setStage,
  writeJsonFile,
} from "@/lib/youtube/jobs";
import { buildInitialMetadata } from "@/lib/youtube/metadata";
import { isValidJobId, jobPaths } from "@/lib/youtube/paths";
import { ScriptValidationError, scriptChars, validateScript } from "@/lib/youtube/script/schema";
import type { Script } from "@/lib/youtube/types";
import {
  isServerless,
  jsonError,
  readJsonBody,
  requireDashboardToken,
  looksLikeScript,
  scriptToLlmOutput,
  SERVERLESS_WRITE_ERROR,
} from "../../../_shared/http";

export const runtime = "nodejs";

/**
 * 대본 승인·편집 저장: body { script } (Script 또는 LlmScriptOutput 형태)
 * → validateScript → script.json + metadata.json(buildInitialMetadata = sanitizeMetadata 적용)
 * → script 단계 done, 이후 단계 pending으로 리셋. 실행 중이면 409.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidJobId(id)) return jsonError("잘못된 작업 id", 400);
  if (isServerless()) return jsonError(SERVERLESS_WRITE_ERROR, 403);
  const denied = requireDashboardToken(req);
  if (denied) return denied;
  const job = await loadJob(id);
  if (!job) return jsonError("작업을 찾을 수 없습니다", 404);
  const holder = await lockHolder(id);
  if (holder) return jsonError(`실행 중에는 대본을 저장할 수 없습니다 (pid ${holder})`, 409, { pid: holder });

  const bodyRead = await readJsonBody(req);
  if (!bodyRead.ok) return jsonError(bodyRead.error, bodyRead.status);
  const body = bodyRead.value as { script?: unknown } | null;
  const raw = body?.script;
  if (!raw || typeof raw !== "object") return jsonError("script 객체가 필요합니다", 400);

  const previous = await loadScript(id);
  let script: Script;
  try {
    const input = looksLikeScript(raw) ? scriptToLlmOutput(raw) : raw;
    script = validateScript(input, {
      topic: job.topic,
      profile: job.profile,
      generator: previous?.generator ?? "template",
      model: previous?.model,
    });
  } catch (err) {
    if (err instanceof ScriptValidationError) {
      return jsonError("대본 검증 실패", 400, { reasons: err.reasons });
    }
    return jsonError(err instanceof Error ? err.message : "대본 검증 실패", 400);
  }

  const p = jobPaths(id);
  await writeJsonFile(p.scriptFile, script);
  await writeJsonFile(p.metadataFile, buildInitialMetadata(script));
  job.outputs.scriptPath = p.scriptFile;
  job.outputs.metadataPath = p.metadataFile;
  await setStage(job, "script", {
    status: "done",
    note: `대시보드에서 편집·저장 — ${script.scenes.length}장면 · ${scriptChars(script)}자 · 예상 ${script.estimatedMinutes}분`,
  });
  const updated = await resetStagesAfter(job, "script");
  return NextResponse.json({ job: updated, script });
}
