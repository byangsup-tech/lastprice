/** 덱보드 아티팩트 조립 — rules/*.json + prompts/*.md를 템플릿 슬롯에 주입해 deckboard.jsx 생성.
 *  사용: npm run artifact:build
 *  출력은 결정적(타임스탬프 없음) — 규칙 개정 후 `git diff ppt/artifact/deckboard.jsx`가 드리프트 검출기가 된다. */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PPT = join(HERE, "..");
const J = (rel) => JSON.parse(readFileSync(join(PPT, rel), "utf-8"));
const T = (rel) => readFileSync(join(PPT, rel), "utf-8");

const active = J("rules/active.json");
const org = active.org;
const style = J(`rules/org/${org}/style.json`);
const colors = J(`rules/org/${org}/colors.json`);
const exceptions = J(`rules/org/${org}/exceptions.json`);
const archetypes = J("rules/core/archetypes.json");
const holes = J("rules/core/holes.json");
const relwords = J("rules/core/relwords.json");

// ── 아티팩트가 실제 소비하는 최소 페이로드 (크기 절약 — visual/ladder는 엔진 전용) ──
// colors는 [실험] 브라우저 초안 pptx가 역할색을 쓰기 위해 포함한다 (코드에 hex 직접 기입 금지 조항 준수)
const RULES = {
  version: active.rulesVersion,
  org,
  colors: { font: colors.font, roles: colors.roles },
  style: {
    endings: style.endings,
    headline: style.headline,
    forbidden: {
      parallelSlogan: { patterns: style.forbidden.parallelSlogan.patterns },
      metaphor: { words: style.forbidden.metaphor.words },
      englishLabels: { words: style.forbidden.englishLabels.words },
      hype: { words: style.forbidden.hype.words },
    },
    symbols: { ban: style.symbols.ban, banLinePrefix: style.symbols.banLinePrefix },
  },
  exceptions: { properNouns: exceptions.properNouns },
  archetypes: {
    archetypes: archetypes.archetypes,
    decisionTable: archetypes.decisionTable,
    q1Criteria: archetypes.q1Criteria,
    structurePriority: archetypes.structurePriority,
  },
  holes: { types: holes.types, dispositions: holes.dispositions, termination: holes.termination },
  relwords: {
    templates: relwords.templates,
    derived: relwords.derived,
  },
};

// ── 프롬프트 — 정적 슬롯({{RULES.*}})은 조립 시 치환, 런타임 슬롯({{CHAIN}} 등)은 남긴다 ──
const holesText = holes.types
  .map((t) => `${t.id}. ${t.name} — 테스트: ${t.test} / 보수: ${t.repair}${t.priorDependent ? " [프라이어 의존]" : ""}`)
  .join("\n");
const relText =
  relwords.templates
    .map((t) => `${t.tpl}(${t.name}) | 방아쇠: ${t.triggers.join("·")}${t.quant ? " | 정량(차트형)" : ""} | p: ${JSON.stringify(t.pSpec)}`)
    .join("\n") + `\n(후보는 위 ${relwords.templates.length}종에서만 고른다 — 파생 템플릿은 수동 경로 전용)`;

const PROMPTS = {
  chainDiagnose: T("prompts/chain-diagnose.md"),
  holeScan: T("prompts/hole-scan.md").split("{{RULES.HOLES}}").join(holesText),
  formStudy: T("prompts/form-study.md").split("{{RULES.RELWORDS}}").join(relText),
};

// ── 주입 ──
let src = readFileSync(join(HERE, "src", "deckboard.template.jsx"), "utf-8");
const inject = (marker, endMarker, value) => {
  const re = new RegExp(`/\\*__${marker}__\\*/[\\s\\S]*?/\\*__${endMarker}__\\*/`);
  if (!re.test(src)) throw new Error(`템플릿에서 슬롯 ${marker}을 찾지 못함`);
  src = src.replace(re, JSON.stringify(value));
};
inject("RULES", "END_RULES", RULES);
inject("PROMPTS", "END_PROMPTS", PROMPTS);

const header = `/**
 * 덱보드 (생성 파일 — 직접 수정 금지)
 * 정본: ppt/artifact/src/deckboard.template.jsx + ppt/rules/** + ppt/prompts/** → npm run artifact:build
 * rules v${active.rulesVersion} · org 팩: ${org}
 * 사용: 이 파일 전문을 복사해 claude.ai 대화에 붙여넣고 "이 코드로 아티팩트를 만들어줘" (갱신도 동일)
 */
`;
src = src.replace(/^\/\*\*[\s\S]*?\*\/\n/, header);

writeFileSync(join(HERE, "deckboard.jsx"), src);
const kb = (src.length / 1024).toFixed(1);
console.log(`생성: ppt/artifact/deckboard.jsx (${kb} KB, rules v${active.rulesVersion}, org=${org})`);
console.log("다음: git diff ppt/artifact/deckboard.jsx 로 규칙 반영 확인 → claude.ai 아티팩트에 붙여넣어 갱신");
