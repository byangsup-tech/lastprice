/** rules 로더 — active.json → org 팩 + core를 읽어 Theme·Rules로 조립 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** ppt/ 디렉터리 절대 경로 */
export const PPT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function readJson<T>(rel: string): T {
  return JSON.parse(readFileSync(join(PPT_ROOT, rel), "utf-8")) as T;
}

export interface StyleRules {
  packName: string;
  endings: string[];
  headline: { maxLen: number; tolerance: number; maxPerSlide: number };
  forbidden: {
    parallelSlogan: { desc: string; patterns: string[] };
    metaphor: { desc: string; words: string[] };
    customerQuote: { desc: string };
    englishLabels: { desc: string; words: string[] };
    hype: { desc: string; words: string[] };
  };
  symbols: { allow: string[]; ban: string[]; banLinePrefix: string[]; minusRule: string };
}

export interface ColorRules {
  font: string;
  roles: Record<string, string>;
  semantics: Record<string, string>;
}

export interface VisualRules {
  conventions: { repeat: string[]; formVariation: { rule: string; scope: string; primaryTest: string } };
  numbersPerClaim: { required: boolean; assumedMark: string; assumedFootnote: string; aiPropagation: string };
  accentLimit: { chromaticPerSlide: number; note: string };
  hlSystem: string;
  annotationLayer: { maxPerChart: number; kinds: string[]; simultaneous: boolean };
  chart: Record<string, string>;
}

export interface Rules {
  rulesVersion: string;
  org: string;
  style: StyleRules;
  colors: ColorRules;
  visual: VisualRules;
  exceptions: { properNouns: string[] };
  archetypes: Record<string, unknown>;
  holes: Record<string, unknown>;
  relwords: {
    templates: { tpl: string; name: string; triggers: string[]; quant: boolean; pSpec: Record<string, PSpecField> }[];
    derived: { tpl: string; name: string; pSpec?: Record<string, PSpecField> }[];
  };
  ladder: Record<string, unknown>;
}

export interface PSpecField {
  type: string; // "string" | "string[]" | "int" | "bool" | "lv[]" | "ntd[]" | "compareRow[]" ...
  req: boolean;
  min?: number;
  max?: number;
  maxLen?: number;
}

export function loadRules(orgOverride?: string): Rules {
  const active = readJson<{ org: string; rulesVersion: string }>("rules/active.json");
  const org = orgOverride || active.org;
  return {
    rulesVersion: active.rulesVersion,
    org,
    style: readJson(`rules/org/${org}/style.json`),
    colors: readJson(`rules/org/${org}/colors.json`),
    visual: readJson(`rules/org/${org}/visual.json`),
    exceptions: readJson(`rules/org/${org}/exceptions.json`),
    archetypes: readJson("rules/core/archetypes.json"),
    holes: readJson("rules/core/holes.json"),
    relwords: readJson("rules/core/relwords.json"),
    ladder: readJson("rules/core/ladder.json"),
  };
}

/** 엔진 템플릿이 참조하는 색·폰트 토큰 — hex는 여기서만 풀린다 */
export interface Theme {
  font: string;
  c: Record<string, string>;
}

export function themeOf(rules: Rules): Theme {
  return { font: rules.colors.font, c: rules.colors.roles };
}

/** role 키 → hex. 미정의 role은 즉시 에러 (스펙 오타 방지) */
export function roleColor(theme: Theme, role: string): string {
  const hex = theme.c[role];
  if (!hex) throw new Error(`정의되지 않은 역할색 role: "${role}" — rules/org/<팩>/colors.json 확인`);
  return hex;
}
