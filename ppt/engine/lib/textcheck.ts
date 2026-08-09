/** 문체 lint (룰북 §5 = rules/org/<팩>/style.json) — 순수 함수. 아티팩트의 로컬 lint와 판정 로직을 맞춘다. */
import type { StyleRules } from "./theme";

export interface TextIssue {
  severity: "error" | "warning";
  code: string;
  msg: string;
}

function stripExceptions(text: string, properNouns: string[]): string {
  let t = text;
  for (const p of properNouns) t = t.split(p).join("");
  return t;
}

/** 종결어미 판정용 — 후행 괄호 묶음·공백·따옴표를 벗긴다: "…하향됨 (최대 3·5·5)" → "…하향됨" */
function coreSentence(text: string): string {
  let t = text.trim();
  for (;;) {
    const m = t.match(/\s*\([^()]*\)\s*$/);
    if (!m) break;
    t = t.slice(0, t.length - m[0].length).trimEnd();
  }
  return t.replace(/["'”’]+$/, "").trimEnd();
}

/** 금칙·기호 검사 — 모든 텍스트 층에 적용 (제목·헤드·밴드·p 내부·각주·스탬프) */
export function checkText(text: string, style: StyleRules, properNouns: string[]): TextIssue[] {
  const issues: TextIssue[] = [];
  if (!text) return issues;
  const t = stripExceptions(text, properNouns);

  for (const w of style.forbidden.metaphor.words) {
    if (t.includes(w)) issues.push({ severity: "error", code: "metaphor", msg: `은유 금칙어 "${w}" — 기능·절차 서술로 대체` });
  }
  for (const w of style.forbidden.hype.words) {
    if (t.includes(w)) issues.push({ severity: "error", code: "hype", msg: `과장 수식어 "${w}" 금지` });
  }
  for (const w of style.forbidden.englishLabels.words) {
    if (t.toUpperCase().includes(w)) issues.push({ severity: "error", code: "english-label", msg: `영문 섹션 라벨 "${w}" 금지 (고유명사는 exceptions.json 등재)` });
  }
  for (const pat of style.forbidden.parallelSlogan.patterns) {
    if (new RegExp(pat).test(t)) issues.push({ severity: "error", code: "parallel-slogan", msg: `대구·리듬 슬로건 패턴 "${pat}" 금지` });
  }
  for (const s of style.symbols.ban) {
    if (t.includes(s)) issues.push({ severity: "error", code: "symbol-ban", msg: `금지 기호 "${s}" — 콤마·괄호·콜론 등으로 대체` });
  }
  for (const p of style.symbols.banLinePrefix) {
    for (const line of text.split("\n")) {
      if (line.trimStart().startsWith(p)) issues.push({ severity: "error", code: "line-prefix", msg: `행두 "${p.trim()}" 접두 금지` });
    }
  }
  return issues;
}

/** 헤드메시지(주장문) 전용 — 종결어미 + 길이. isPrimary=true(1문장째)는 종결어미가 error, sub는 warning */
export function checkHeadline(
  text: string,
  style: StyleRules,
  properNouns: string[],
  opts: { isPrimary: boolean },
): TextIssue[] {
  const issues = checkText(text, style, properNouns);
  const core = coreSentence(text);
  const endingOk = style.endings.some((e) => core.endsWith(e));
  if (!endingOk) {
    issues.push({
      severity: opts.isPrimary ? "error" : "warning",
      code: "ending",
      msg: `개조식 종결(${style.endings.join("/")}) 위반: "…${core.slice(-8)}"`,
    });
  }
  const limit = style.headline.maxLen + style.headline.tolerance;
  if (text.length > limit) {
    issues.push({ severity: "warning", code: "headline-length", msg: `헤드 길이 ${text.length}자 > ${style.headline.maxLen}±${style.headline.tolerance}자` });
  }
  return issues;
}

/** 라벨(주제 명사) 전용 — 시나리오 헤더 간이 검사: 종결형 어미·조사로 끝나면 경고 */
export function checkLabel(text: string, style: StyleRules, properNouns: string[]): TextIssue[] {
  const issues = checkText(text, style, properNouns);
  if (/(때|하면|되면|다면|어요|습니다)$/.test(text.trim())) {
    issues.push({ severity: "warning", code: "scenario-label", msg: "시나리오·장면 헤더 의심 — 기능명·주제 명사로" });
  }
  return issues;
}
