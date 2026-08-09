/** deck-spec 검증 — 스키마(형태) + 룰북 자동 lint (rules 기반, 전건 결정적).
 *  단독 실행: npm run deck:validate -- <spec.json> [--org=팩]  /  build.ts가 import해 선행 실행 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadRules, type Rules } from "./lib/theme";
import { TEMPLATES } from "./lib/templates/index";
import { checkHeadline, checkLabel, checkText, type TextIssue } from "./lib/textcheck";
import type { DeckSpec } from "./lib/types";

export interface Finding {
  severity: "error" | "warning";
  slideId: string;
  code: string;
  msg: string;
}

const HEX_RE = /^#?[0-9A-Fa-f]{6}$/;

/** p 내부의 모든 문자열 값 수집 (텍스트 lint·hex 검사용). role 계열 키는 hex 검사만 예외적으로 통과 */
function collectStrings(v: unknown, path: string, out: { path: string; key: string; value: string }[]): void {
  if (typeof v === "string") {
    const key = path.split(".").pop() ?? "";
    out.push({ path, key, value: v });
  } else if (Array.isArray(v)) {
    v.forEach((item, i) => collectStrings(item, `${path}[${i}]`, out));
  } else if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v)) collectStrings(val, `${path}.${k}`, out);
  }
}

const ROLE_KEYS = new Set(["role", "fn", "tone", "side", "seg"]);

export function validateSpec(spec: DeckSpec, rules: Rules): Finding[] {
  const F: Finding[] = [];
  const add = (severity: Finding["severity"], slideId: string, code: string, msg: string) =>
    F.push({ severity, slideId, code, msg });
  const style = rules.style;
  const nouns = rules.exceptions.properNouns;
  const roles = rules.colors.roles;

  // ── 스키마 층 ──
  if (spec.schemaVersion !== "deck-spec/1") add("error", "-", "schema", `schemaVersion은 "deck-spec/1" (현재 ${spec.schemaVersion})`);
  if (!spec.meta?.title || !spec.meta?.deckLabel || !spec.meta?.fileName) add("error", "-", "schema", "meta.title·deckLabel·fileName 필수");
  if (spec.meta?.fileName && !spec.meta.fileName.endsWith(".pptx")) add("error", "-", "schema", "meta.fileName은 .pptx로 끝나야 함");
  if (!Array.isArray(spec.slides) || spec.slides.length === 0) {
    add("error", "-", "schema", "slides가 비어 있음");
    return F;
  }
  const ids = new Set<string>();
  for (const s of spec.slides) {
    if (!s.id) add("error", "?", "schema", "slide.id 필수");
    else if (ids.has(s.id)) add("error", s.id, "schema", "slide.id 중복");
    ids.add(s.id);
  }

  const issue2f = (slideId: string, prefix: string) => (iss: TextIssue) =>
    add(iss.severity, slideId, iss.code, `${prefix}: ${iss.msg}`);

  const contentSlides = spec.slides.filter((s) => !TEMPLATES[s.template]?.isCover);

  // ── 장 단위 ──
  let prevTemplate: string | null = null;
  for (const s of spec.slides) {
    const tpl = TEMPLATES[s.template];
    if (!tpl) {
      add("error", s.id, "template", `알 수 없는 템플릿 "${s.template}" (등록: ${Object.keys(TEMPLATES).join(", ")})`);
      continue;
    }
    // 빈 프레임·형태 (F9: 형태 검증)
    for (const e of tpl.minParams(s.p ?? {})) add("error", s.id, "params", e);

    if (!tpl.isCover) {
      // 폼 변주 — 연속 동일 템플릿 금지 (본문 장 기준)
      if (prevTemplate === s.template) add("error", s.id, "form-repeat", `연속 2장 동일 템플릿 "${s.template}" — 폼은 변주 (룰북 §6)`);
      prevTemplate = s.template;

      if (!s.label) add("warning", s.id, "label", "본문 장에 주제 라벨(label) 없음");
      if (!s.head?.runs?.length) add("error", s.id, "head", "본문 장에 헤드메시지(head.runs) 없음 — 주장은 헤드에 삶");
    }

    // 텍스트 lint
    if (s.label) checkLabel(s.label, style, nouns).forEach(issue2f(s.id, "label"));
    if (s.pill) checkText(s.pill, style, nouns).forEach(issue2f(s.id, "pill"));
    if (s.head?.runs?.length) {
      const concat = s.head.runs.map((r) => r.t).join("");
      checkHeadline(concat, style, nouns, { isPrimary: true }).forEach(issue2f(s.id, "head"));
      if (s.head.sub) checkHeadline(s.head.sub, style, nouns, { isPrimary: false }).forEach(issue2f(s.id, "head.sub"));
    }
    if (s.band) {
      checkText(s.band, style, nouns).forEach(issue2f(s.id, "band"));
      const core = s.band.replace(/\s*\([^()]*\)\s*$/, "").trim();
      if (rules.style.endings.some((e) => core.endsWith(e))) {
        add("warning", s.id, "band-conclusion", `밴드 제목이 결론형("…${core.slice(-6)}") — 제목은 서술 라벨, 결론은 헤드 전용 (F14)`);
      }
    }
    if (s.footnote) checkText(s.footnote, style, nouns).forEach(issue2f(s.id, "footnote"));
    for (const st of s.stamps ?? []) {
      checkText(st.text, style, nouns).forEach(issue2f(s.id, "stamp"));
      if (!(st.role in roles)) add("error", s.id, "role", `stamp.role "${st.role}" 미정의 (colors.json)`);
    }

    // p 내부 — 텍스트 lint + hex 금지 + role 실재
    const strings: { path: string; key: string; value: string }[] = [];
    collectStrings(s.p ?? {}, "p", strings);
    for (const { path, key, value } of strings) {
      if (ROLE_KEYS.has(key)) {
        if ((key === "role" || key === "fn" || key === "tone") && !(value in roles)) {
          add("error", s.id, "role", `${path} = "${value}" — colors.json roles에 없음`);
        }
        continue;
      }
      if (HEX_RE.test(value)) {
        add("error", s.id, "hex", `${path} = "${value}" — 스펙에 색 hex 직접 기입 금지, colors.json role만 사용`);
        continue;
      }
      checkText(value, style, nouns).forEach(issue2f(s.id, path));
    }

    // 주석 레이어 — 차트당 1곳, 동시 금지 (V2)
    const pAny = (s.p ?? {}) as Record<string, unknown>;
    if (pAny.callout && pAny.emphasisBox) {
      add("error", s.id, "annotation", "callout과 emphasisBox 동시 사용 — 주석 레이어는 차트당 1곳 (룰북 §6)");
    }

    // 가정 수치 전파 (F8)
    if (s.assumed) {
      const fn = s.footnote ?? "";
      if (!fn.includes("예시") && !fn.includes("가정")) {
        add("error", s.id, "assumed", "assumed=true인데 각주에 가정 근거('예시'/'가정') 없음 — (예시) 전파 의무 (룰북 §6)");
      }
    }
  }

  // ── 덱 단위 ──
  // 형광 시스템: 전 장 적용 또는 전무 (본문 장 기준)
  const withHead = contentSlides.filter((s) => s.head?.runs?.length);
  const withHl = withHead.filter((s) => s.head!.runs.some((r) => r.hl));
  if (withHl.length > 0 && withHl.length < withHead.length) {
    const missing = withHead.filter((s) => !s.head!.runs.some((r) => r.hl)).map((s) => s.id);
    add("warning", "-", "hl-system", `형광이 일부 장에만 적용됨 (미적용: ${missing.join(", ")}) — 전 장 시스템 또는 전무 (룰북 §6)`);
  }

  return F;
}

export function loadSpec(path: string): DeckSpec {
  return JSON.parse(readFileSync(resolve(path), "utf-8")) as DeckSpec;
}

export function printFindings(findings: Finding[]): { errors: number; warnings: number } {
  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");
  for (const f of [...errors, ...warnings]) {
    console.log(`${f.severity === "error" ? "ERROR  " : "warn   "} ${f.slideId.padEnd(6)} [${f.code}] ${f.msg}`);
  }
  console.log(`\n검증 결과: 에러 ${errors.length}건, 경고 ${warnings.length}건`);
  return { errors: errors.length, warnings: warnings.length };
}

// ── CLI ──
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const orgArg = process.argv.slice(2).find((a) => a.startsWith("--org="))?.slice(6);
  if (!args[0]) {
    console.error("사용법: npm run deck:validate -- <spec.json> [--org=팩]");
    process.exit(2);
  }
  const spec = loadSpec(args[0]);
  const rules = loadRules(orgArg || spec.meta?.org);
  console.log(`spec: ${args[0]}  |  org 팩: ${rules.org}  |  rules v${rules.rulesVersion}\n`);
  const { errors } = printFindings(validateSpec(spec, rules));
  process.exit(errors > 0 ? 1 : 0);
}
