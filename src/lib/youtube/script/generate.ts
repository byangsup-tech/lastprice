import { DEFAULT_PROFILE, llmModel, llmProvider } from "../config";
import { writeJsonFile } from "../jobs";
import { buildInitialMetadata } from "../metadata";
import { jobPaths } from "../paths";
import type { CandidateNews, ChannelProfile, Job, LlmProvider, Script, Topic } from "../types";
import { completeJson, type LlmClient } from "./llm";
import { EXPAND_THRESHOLD, buildSystemPrompt, buildUserPrompt, scriptBudget } from "./prompts";
import { SCRIPT_JSON_SCHEMA, charsPerMinute, scriptChars, validateScript } from "./schema";
import { demoScript, templateScript } from "./template";

/**
 * 대본 단계 — job → Script (script.json + metadata.json 저장).
 *
 * - job.demo → demoScript (오프라인 데모, ~1분)
 * - provider "template" → templateScript (키 없이 동작, 절대 던지지 않음)
 * - provider "anthropic" → LLM 구조화 출력 + validateScript, 분량 부족 시 확장 패스 1회
 */

export { buildInitialMetadata };

export interface GenerateScriptOptions {
  provider?: LlmProvider;
  model?: string;
  targetMinutes?: number;
  log?: (line: string) => void;
  /** 테스트용 클라이언트 주입 (anthropic 경로) */
  client?: LlmClient;
}

const noop = () => {};

/** 템플릿 모드는 절대 실패하지 않아야 한다 — 짧은 CTA 등으로 검증이 깨지면 기본 프로필 값으로 보정 */
function safeTemplateScript(topic: Topic, profile: ChannelProfile, log: (l: string) => void): Script {
  try {
    return templateScript({ topic, profile });
  } catch (err) {
    log(`템플릿 대본 검증 실패 — 기본 프로필 값으로 보정: ${err instanceof Error ? err.message : String(err)}`);
    const patched: ChannelProfile = {
      ...profile,
      cta: profile.cta.trim().length >= 15 ? profile.cta : DEFAULT_PROFILE.cta,
      audience: profile.audience.trim() || DEFAULT_PROFILE.audience,
      name: profile.name.trim() || DEFAULT_PROFILE.name,
      keywords: profile.keywords.length ? profile.keywords : DEFAULT_PROFILE.keywords,
    };
    const safeTopic: Topic = { ...topic, title: topic.title.trim() || "오늘의 주제" };
    return templateScript({ topic: safeTopic, profile: patched });
  }
}

interface LlmScriptResult {
  script: Script;
  raw: unknown;
}

async function anthropicScript(
  job: Job,
  opts: GenerateScriptOptions,
  log: (l: string) => void,
): Promise<Script> {
  const { topic, profile } = job;
  const model = opts.model ?? llmModel();
  const targetMinutes = opts.targetMinutes ?? profile.targetMinutes;
  const cpm = charsPerMinute(profile.voiceRate);
  const budget = scriptBudget(targetMinutes, cpm);
  const news: CandidateNews[] = topic.news ?? [];
  const system = buildSystemPrompt(profile);
  const validate = (raw: unknown): LlmScriptResult => ({
    script: validateScript(raw, { topic, profile, generator: "anthropic", model }),
    raw,
  });

  log(
    `LLM 대본 생성 — model=${model}, 목표 ${budget.targetMinutes}분 × ${budget.cpm}자/분 = ${budget.targetChars}자, ` +
      `챕터 ${budget.chapterCount}개 · 장면 약 ${budget.sceneCount}개, 뉴스 ${news.length}건`,
  );

  const first = await completeJson<LlmScriptResult>({
    system,
    user: buildUserPrompt({ topic, profile, targetMinutes, cpm, news }),
    schema: SCRIPT_JSON_SCHEMA as unknown as Record<string, unknown>,
    validate,
    model,
    log,
    client: opts.client,
    // 출력 잘림 → 목표 분량 30% 축소 + 뉴스 헤드라인 절반으로 1회 재시도
    onTruncated: () => {
      const shorterMinutes = Math.max(4, Math.round(targetMinutes * 0.7));
      const halfNews = news.slice(0, Math.ceil(news.length / 2));
      log(`목표 ${targetMinutes}분 → ${shorterMinutes}분, 뉴스 ${news.length} → ${halfNews.length}건으로 축소`);
      return buildUserPrompt({ topic, profile, targetMinutes: shorterMinutes, cpm, news: halfNews });
    },
  });

  let { script, raw } = first.value;
  let total = scriptChars(script);
  log(`1차 대본 — ${script.scenes.length}장면, ${total}자, 예상 ${script.estimatedMinutes}분 (목표 ${budget.targetChars}자)`);

  if (total < budget.targetChars * EXPAND_THRESHOLD) {
    log(`분량 부족 (${total} < ${budget.minChars}자) — 확장 패스 1회`);
    try {
      const expanded = await completeJson<LlmScriptResult>({
        system,
        user: buildUserPrompt({ topic, profile, targetMinutes, cpm, news, expand: { previous: raw, totalChars: total } }),
        schema: SCRIPT_JSON_SCHEMA as unknown as Record<string, unknown>,
        validate,
        model,
        log,
        client: opts.client,
      });
      const expandedChars = scriptChars(expanded.value.script);
      if (expandedChars > total) {
        script = expanded.value.script;
        raw = expanded.value.raw;
        total = expandedChars;
        log(`확장 결과 — ${script.scenes.length}장면, ${total}자, 예상 ${script.estimatedMinutes}분`);
      } else {
        log(`확장 결과가 더 짧음 (${expandedChars}자) — 1차 대본 유지`);
      }
    } catch (err) {
      log(`확장 패스 실패 — 1차 대본 수용: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return script;
}

/**
 * 대본 생성 + 저장. 반환된 Script는 script.json과 동일하며 metadata.json은 buildInitialMetadata(sanitizeMetadata 적용)로 생성.
 */
export async function generateScript(job: Job, opts: GenerateScriptOptions = {}): Promise<Script> {
  const log = opts.log ?? noop;
  const paths = jobPaths(job.id);

  let script: Script;
  if (job.demo) {
    log("데모 작업 — 내장 데모 대본 사용");
    script = demoScript(job.profile);
  } else {
    const provider = opts.provider ?? llmProvider();
    if (provider === "anthropic") {
      script = await anthropicScript(job, opts, log);
    } else {
      log("템플릿 모드 — 키 없이 초안 대본 생성 (ANTHROPIC_API_KEY 설정 시 LLM 대본)");
      script = safeTemplateScript(job.topic, job.profile, log);
    }
  }

  await writeJsonFile(paths.scriptFile, script);
  const metadata = buildInitialMetadata(script);
  await writeJsonFile(paths.metadataFile, metadata);
  log(
    `대본 저장 — "${script.title}" · ${script.chapters.length}챕터 · ${script.scenes.length}장면 · ${scriptChars(script)}자 · 예상 ${script.estimatedMinutes}분 (${script.generator}${script.model ? `/${script.model}` : ""})`,
  );
  return script;
}
