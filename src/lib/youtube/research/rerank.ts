import { hasAnthropicKey } from "../config";
import { completeJson, hasLlm, type LlmClient } from "../script/llm";
import { buildRerankPrompts, MAX_RERANK_CANDIDATES, validateRerank, type RerankItem } from "../script/prompts";
import type { ChannelProfile, ResearchReport, TopicCandidate } from "../types";
import { clampText } from "../util";
import { scoreCandidate } from "./score";

/**
 * LLM 재정렬 — 상위 30개 후보를 Anthropic에 보내 fit/angle/suggestedTitle을 받아 병합한다.
 * - 템플릿 모드(YT_LLM_PROVIDER=template)면 "off", 키가 없으면 "no-key", 호출 실패는 "error" (후보는 그대로)
 * - LLM 적합도는 evidence(source "llm-rerank", value=fit)로 저장 → scoreCandidate가 0.5/0.5 블렌드, selectAutoTopic이 llmFit ≥ 0.5 검사
 */

export const GATE_REASON = "채널 키워드와 무관";
export const RERANK_MAX_TOKENS = 8_000;

export interface RerankResult {
  candidates: TopicCandidate[];
  status: ResearchReport["llmRerank"];
  /** 병합된 후보 수 */
  merged: number;
  model?: string;
  error?: string;
}

/** LLM을 쓸 수 없을 때의 상태 — 명시적 템플릿 모드는 off, 그 외(키 없음)는 no-key */
export function rerankStatusWithoutLlm(): "off" | "no-key" {
  return hasAnthropicKey() || process.env.YT_LLM_PROVIDER?.trim() === "template" ? "off" : "no-key";
}

/** 재정렬 입력: 점수 > 0 후보 우선, 부족하면 키워드 게이트로 0점이 된 후보(제외 키워드 히트는 제외)로 채움 */
export function pickRerankInput(candidates: TopicCandidate[], max = MAX_RERANK_CANDIDATES): TopicCandidate[] {
  const scored = candidates.filter((c) => c.score > 0);
  const gated = candidates.filter((c) => c.score === 0 && c.reasons[0] === GATE_REASON);
  return [...scored, ...gated].slice(0, max);
}

/** 재정렬 결과를 후보에 병합하고 재채점 (순수 함수) */
export function mergeRerank(candidates: TopicCandidate[], items: RerankItem[], profile: ChannelProfile): { candidates: TopicCandidate[]; merged: number } {
  const byId = new Map(items.map((it) => [it.id, it]));
  let merged = 0;
  const out = candidates.map((c) => {
    const it = byId.get(c.id);
    if (!it) return c;
    merged++;
    const sources = [
      ...c.sources.filter((s) => s.source !== "llm-rerank"),
      { source: "llm-rerank" as const, label: it.reason || "LLM 평가", value: it.fit.toFixed(2) },
    ];
    const next: TopicCandidate = {
      ...c,
      sources,
      angle: it.angle ? clampText(it.angle, 120) : c.angle,
      suggestedTitle: it.suggestedTitle ? clampText(it.suggestedTitle, 100) : c.suggestedTitle,
    };
    return scoreCandidate(next, profile, { llmFit: it.fit });
  });
  out.sort((a, b) => b.score - a.score || b.signals.demand - a.signals.demand || a.title.localeCompare(b.title, "ko"));
  return { candidates: out, merged };
}

export async function rerankCandidates(
  candidates: TopicCandidate[],
  profile: ChannelProfile,
  opts: { log?: (line: string) => void; client?: LlmClient; model?: string } = {},
): Promise<RerankResult> {
  const log = opts.log ?? (() => {});
  if (!opts.client && !hasLlm()) {
    return { candidates, status: rerankStatusWithoutLlm(), merged: 0 };
  }
  const input = pickRerankInput(candidates);
  if (!input.length) return { candidates, status: "on", merged: 0 };
  const ids = input.map((c) => c.id);
  const prompts = buildRerankPrompts(input, profile);
  try {
    log(`LLM 재정렬 요청 — 후보 ${input.length}개`);
    const res = await completeJson<RerankItem[]>({
      system: prompts.system,
      user: prompts.user,
      schema: prompts.schema,
      validate: (raw) => validateRerank(raw, ids),
      maxTokens: RERANK_MAX_TOKENS,
      model: opts.model,
      client: opts.client,
      log,
    });
    const { candidates: merged, merged: count } = mergeRerank(candidates, res.value, profile);
    log(`LLM 재정렬 완료 — ${count}개 병합 (model ${res.model})`);
    return { candidates: merged, status: "on", merged: count, model: res.model };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`LLM 재정렬 실패 — ${message}`);
    return { candidates, status: "error", merged: 0, error: message };
  }
}
