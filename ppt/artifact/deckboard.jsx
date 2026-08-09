/**
 * 덱보드 (생성 파일 — 직접 수정 금지)
 * 정본: ppt/artifact/src/deckboard.template.jsx + ppt/rules/** + ppt/prompts/** → npm run artifact:build
 * rules v0.2.0 · org 팩: default
 * 사용: 이 파일 전문을 복사해 claude.ai 대화에 붙여넣고 "이 코드로 아티팩트를 만들어줘" (갱신도 동일)
 */
import { useState, useEffect, useRef } from "react";

// ── 조립 시 주입되는 정본 데이터 (rules/*.json + prompts/*.md) ──
const RULES = {"version":"0.2.0","org":"default","style":{"endings":["함","됨","임"],"headline":{"maxLen":35,"tolerance":5,"maxPerSlide":2},"forbidden":{"parallelSlogan":{"patterns":["할수록.{0,8}해지는"]},"metaphor":{"words":["엔진","마법","날개","열쇠","지름길","문이 닫히","날아오"]},"englishLabels":{"words":["EXECUTIVE SUMMARY","EXHIBIT","SO WHAT","AGENDA","APPENDIX","KEY TAKEAWAY"]},"hype":{"words":["신개념","혁신적","획기적","최첨단","패러다임"]}},"symbols":{"ban":["—"],"banLinePrefix":["- "]}},"exceptions":{"properNouns":["Transformation","New종신","DP","GA","TM","DB","CSM"]},"archetypes":{"archetypes":[{"id":"decision_request","name":"의사결정 요청형","skeleton":[{"label":"요청사항","seg":"intro"},{"label":"왜 지금","seg":"intro"},{"label":"대안·평가 기준","seg":"body"},{"label":"권고·근거","seg":"body"},{"label":"리스크","seg":"body"},{"label":"다음 단계","seg":"outro"}]},{"id":"concept_proposal","name":"개념 제안형","skeleton":[{"label":"현 구조의 한계","seg":"intro"},{"label":"왜 지금","seg":"intro"},{"label":"개념 한 장","seg":"body"},{"label":"작동 메커니즘","seg":"body"},{"label":"왜 이 시작점","seg":"body"},{"label":"미결 사항","seg":"outro"}]},{"id":"analysis_result","name":"분석 결과형","skeleton":[{"label":"답","seg":"intro"},{"label":"질문·접근","seg":"intro"},{"label":"발견","seg":"body"},{"label":"시사점","seg":"body"},{"label":"한계·다음 검증","seg":"outro"}]},{"id":"status_report","name":"현황 보고형","skeleton":[{"label":"요약","seg":"intro"},{"label":"지표","seg":"body"},{"label":"이슈·대응","seg":"body"},{"label":"결정 필요 사항","seg":"outro"}]},{"id":"info_delivery","name":"정보 전달형","skeleton":[{"label":"맥락","seg":"intro"},{"label":"축 셋","seg":"body"},{"label":"축별 핵심","seg":"body"},{"label":"시사점","seg":"outro"}]}],"decisionTable":{"승인":{"default":"decision_request","branch":null,"alt":null},"방향 확인":{"default":"concept_proposal","branch":"안건에 미검증 신규 개념이 포함되면 개념 제안형, 기존 안건의 검증 결과가 중심이면 분석 결과형","alt":"analysis_result"},"이견 해소":{"default":"analysis_result","branch":"이견의 근원이 사실 판단이면 분석 결과형, 개념 이해 차이면 개념 제안형","alt":"concept_proposal"},"인지":{"default":"status_report","branch":"결정 필요 사항이 있으면 현황 보고형, 없으면 정보 전달형","alt":"info_delivery"}},"q1Criteria":"승인=자원 배분(예산·인력·일정) 결정을 요구하는 자리, 방향 확인=자원 결정 없이 진행 방향 동의만 구하는 자리. 겹치면 '이번 자리에서 결재가 나야 하는가'로 판정","structurePriority":{"rule":"골격은 장의 종류와 뼈대(도입·마무리 포함)를 결정하고, Q3 저항 순서는 본론(body) 구간 내부의 배열을 결정한다. 충돌 시 본론 내에서는 저항 순서가 우선하며 골격의 intro·outro는 고정한다.","merge":"골격 칸 수가 체인 줄 수 제한을 넘으면 body 칸을 병합하되 intro·outro는 유지"}},"holes":{"types":[{"id":1,"key":"frame_conflict","name":"프레임 충돌","test":"이 방이 본 프레임 중 이 주장을 기각하는 것은?","repair":"프레임을 부정하지 말고 확장 — '그 프레임이 맞다, 그런데 ~한 예외가 존재하고 그것이 근거다'","priorDependent":true},{"id":2,"key":"hidden_premise","name":"암묵 전제","test":"이 링크가 참이려면 무엇이 참이어야 하고, 그건 어디서 증명되나?","repair":"전제를 명시하고 증명 위치(장·구두·후속 검토)를 지정","priorDependent":false},{"id":3,"key":"leap","name":"비약","test":"헤드 N→N+1 사이 독자가 메워야 하는 추론 칸이 있는가?","repair":"중간 칸을 채우는 장 추가 또는 인접 헤드 보강","priorDependent":false},{"id":4,"key":"absolute","name":"무방비 절대어","test":"'유일한·최초·모두' 등 반례 하나에 무너지는 표현이 있는가?","repair":"한정어 부여 또는 반례 선제 처리","priorDependent":false},{"id":5,"key":"internal_conflict","name":"내부 충돌","test":"한 장의 주장이 다른 장의 주장·증거를 약화시키는가?","repair":"층위 구분(구조 vs 절차 등) 또는 주장 조정","priorDependent":false},{"id":6,"key":"stake_unaddressed","name":"이해관계 미처리","test":"이 안이 통과되면 방 안의 누가 무엇을 잃는데 체인이 다루지 않는가?","repair":"상실 처리(상한·전환 계획 등)를 덱 또는 구두 대응으로 명시","priorDependent":true}],"dispositions":[{"id":"apply","name":"반영","requires":[]},{"id":"verbal","name":"구두 대응","requires":["memo"],"memoLabel":"예상 문답 메모"},{"id":"reject","name":"기각","requires":["reason"],"reasonLabel":"기각 사유"}],"termination":"6유형 각각의 테스트 질문을 체인의 전 링크(N→N+1)와 전 장에 1회 이상 적용하고, 한 바퀴에서 신규 검출이 0이면 종료"},"relwords":{"templates":[{"tpl":"layer","name":"레이어","triggers":["받친다","토대","전제","기반"],"quant":false,"pSpec":{"base":{"type":"string","req":true},"items":{"type":"string[]","min":3,"max":4,"req":true}}},{"tpl":"hub","name":"허브","triggers":["구동","공급","중심","연결"],"quant":false,"pSpec":{"center":{"type":"string","req":true,"maxLen":5},"spokes":{"type":"string[]","min":3,"max":5,"req":true}}},{"tpl":"before_after","name":"전·후","triggers":["바뀐다","풀리면","활성화","전환"],"quant":false,"pSpec":{"before":{"type":"string","req":true},"after":{"type":"string","req":true},"trigger":{"type":"string","req":true,"maxLen":7},"items":{"type":"string[]","min":3,"max":4,"req":true}}},{"tpl":"flow","name":"플로우","triggers":["단계","순서","프로세스"],"quant":false,"pSpec":{"steps":{"type":"string[]","min":3,"max":5,"req":true},"hi":{"type":"int","req":false}}},{"tpl":"matrix","name":"2×2","triggers":["두 축","갈린다","포지셔닝"],"quant":false,"pSpec":{"xl":{"type":"string","req":true},"xr":{"type":"string","req":true},"yb":{"type":"string","req":true},"yt":{"type":"string","req":true},"q":{"type":"string[]","min":4,"max":4,"req":true},"hi":{"type":"int","req":false}}},{"tpl":"funnel","name":"퍼널","triggers":["좁아진다","걸러진다","전환율"],"quant":false,"pSpec":{"stages":{"type":"string[]","min":3,"max":4,"req":true}}},{"tpl":"bars","name":"막대 비교","triggers":["~보다 크다","격차","순위"],"quant":true,"pSpec":{"items":{"type":"lv[]","min":2,"max":6,"req":true},"hi":{"type":"int","req":false},"unit":{"type":"string","req":false}}},{"tpl":"trend","name":"추세","triggers":["커진다","줄어든다","N년째"],"quant":true,"pSpec":{"pts":{"type":"lv[]","min":4,"max":6,"req":true},"note":{"type":"string","req":false,"maxLen":10}}},{"tpl":"textgrid","name":"구조화 텍스트","triggers":["원칙","기준","정의","요청"],"quant":false,"pSpec":{"items":{"type":"ntd[]","min":3,"max":4,"req":true}}}],"derived":[{"tpl":"compare_rows","name":"비교 행 대비","note":"행 태그 + 기존/당사 셀 대비 — 전·후의 병렬 확장형 (실물 S5에서 추출)","pSpec":{"leftTitle":{"type":"string","req":true},"rightTitle":{"type":"string","req":true},"rows":{"type":"compareRow[]","min":2,"max":3,"req":true},"leftSummary":{"type":"string","req":false},"rightSummary":{"type":"string","req":false}}},{"tpl":"compare_cards","name":"비교 카드 그리드","note":"좌우 2열 카드 대비 + 하단 검토 박스 (실물 S6에서 추출) — compare_rows와 연속 사용 가능한 변주형","pSpec":{"leftTitle":{"type":"string","req":true},"rightTitle":{"type":"string","req":true},"cards":{"type":"sideCard[]","min":2,"max":6,"req":true},"darkRight":{"type":"bool","req":false},"reviewBox":{"type":"titleText","req":false}}},{"tpl":"feature_cards","name":"개요 카드","note":"기능 카드 2~3장 + 결합 스트립 + 대비 문장 (실물 S2에서 추출)","pSpec":{"cards":{"type":"featureCard[]","min":2,"max":3,"req":true},"joiner":{"type":"string","req":false},"strip":{"type":"leadText","req":false},"compareLine":{"type":"string","req":false}}},{"tpl":"journey","name":"가입자 여정","note":"보장 밴드 계단 + 타임라인 노드 (실물 S4에서 추출) — 시간 축 위 상태 변화","pSpec":{"caption":{"type":"string","req":false},"bands":{"type":"journeyBand[]","min":1,"max":4,"req":true},"nodes":{"type":"journeyNode[]","min":2,"max":6,"req":true},"strip":{"type":"string","req":false}}},{"tpl":"cover","name":"표지","pSpec":{"eyebrow":{"type":"string","req":false},"title":{"type":"string","req":true},"subtitle":{"type":"string","req":false},"credit":{"type":"string","req":false}}}]}};
const PROMPTS = {"chainDiagnose":"당신은 보고 덱의 헤드라인 체인 진단기다. 아래 체인(장별 헤드메시지)만 읽고 논리가 서는지 판정한다 — 고스트 덱 테스트: 헤드만 이어 읽어 보고가 성립해야 한다.\n\n정의서 요약:\n{{DEFINITION}}\n\n체인 (id | 라벨 | 헤드메시지):\n{{CHAIN}}\n\n판정 방법: 링크(N→N+1)마다 (1) 독자가 메워야 하는 추론 칸이 있는지, (2) 앞 장이 뒤 장의 전제를 제공하는지 본다. 헤드메시지가 2문장이면 둘 다 읽는다.\n\nJSON만 출력 (마크다운·설명 금지):\n{\"verdict\":\"ok\"|\"break\",\"links\":[{\"fromId\":\"...\",\"toId\":\"...\",\"issue\":\"끊기는 이유 한 문장\",\"severity\":\"치명\"|\"중요\"|\"권장\"}],\"note\":\"전체 한 줄 평\"}\n문제 없으면 links는 빈 배열.\n","holeScan":"당신은 보고 덱 체인의 레드팀 검사기다. 구멍 유형학 6종으로 체인을 검사한다.\n\n유형학 (id | 이름 | 테스트 질문 | 보수 패턴):\n1. 프레임 충돌 — 테스트: 이 방이 본 프레임 중 이 주장을 기각하는 것은? / 보수: 프레임을 부정하지 말고 확장 — '그 프레임이 맞다, 그런데 ~한 예외가 존재하고 그것이 근거다' [프라이어 의존]\n2. 암묵 전제 — 테스트: 이 링크가 참이려면 무엇이 참이어야 하고, 그건 어디서 증명되나? / 보수: 전제를 명시하고 증명 위치(장·구두·후속 검토)를 지정\n3. 비약 — 테스트: 헤드 N→N+1 사이 독자가 메워야 하는 추론 칸이 있는가? / 보수: 중간 칸을 채우는 장 추가 또는 인접 헤드 보강\n4. 무방비 절대어 — 테스트: '유일한·최초·모두' 등 반례 하나에 무너지는 표현이 있는가? / 보수: 한정어 부여 또는 반례 선제 처리\n5. 내부 충돌 — 테스트: 한 장의 주장이 다른 장의 주장·증거를 약화시키는가? / 보수: 층위 구분(구조 vs 절차 등) 또는 주장 조정\n6. 이해관계 미처리 — 테스트: 이 안이 통과되면 방 안의 누가 무엇을 잃는데 체인이 다루지 않는가? / 보수: 상실 처리(상한·전환 계획 등)를 덱 또는 구두 대응으로 명시 [프라이어 의존]\n\n정의서·오디언스 프라이어:\n{{DEFINITION}}\n\n체인 (id | 라벨 | 헤드메시지):\n{{CHAIN}}\n\n절차:\n1. 프라이어 3문항(ⓐ 방이 최근 본 관련 보고 ⓑ 평가 기준·KPI ⓒ 누가 무엇을 잃는가)이 비어 있으면 검사하지 말고 다음만 출력: {\"priorsMissing\":[\"a\",\"b\",\"c\"]} (비어 있는 항목만)\n2. 프라이어가 있으면 6유형 각각의 테스트 질문을 체인의 전 링크(N→N+1)와 전 장에 적용해 검출한다. ①(프레임 충돌)·⑥(이해관계)은 입력된 프라이어 범위에서만 검출한다 — 프라이어에 없는 사실을 지어내지 않는다.\n\nJSON만 출력 (마크다운·설명 금지):\n{\"holes\":[{\"type\":1,\"atIds\":[\"체인 줄 id\"],\"question\":\"방에서 나올 예상 반문 (실제 문장)\",\"fix\":\"최소 보수안 한 문장\"}]}\n검출 0건이면 {\"holes\":[]}.\n","formStudy":"당신은 컨설팅 장표의 폼 스터디 엔진이다. 입력 메시지는 슬라이드의 헤드메시지(주장문)다. 메시지에 담긴 관계를 읽고, 그 관계를 표현할 서로 다른 형태 2~3개를 골라 JSON만 출력한다.\n\n관계어 사전 (tpl | 이름 | 방아쇠 관계어 | p 스키마):\nlayer(레이어) | 방아쇠: 받친다·토대·전제·기반 | p: {\"base\":{\"type\":\"string\",\"req\":true},\"items\":{\"type\":\"string[]\",\"min\":3,\"max\":4,\"req\":true}}\nhub(허브) | 방아쇠: 구동·공급·중심·연결 | p: {\"center\":{\"type\":\"string\",\"req\":true,\"maxLen\":5},\"spokes\":{\"type\":\"string[]\",\"min\":3,\"max\":5,\"req\":true}}\nbefore_after(전·후) | 방아쇠: 바뀐다·풀리면·활성화·전환 | p: {\"before\":{\"type\":\"string\",\"req\":true},\"after\":{\"type\":\"string\",\"req\":true},\"trigger\":{\"type\":\"string\",\"req\":true,\"maxLen\":7},\"items\":{\"type\":\"string[]\",\"min\":3,\"max\":4,\"req\":true}}\nflow(플로우) | 방아쇠: 단계·순서·프로세스 | p: {\"steps\":{\"type\":\"string[]\",\"min\":3,\"max\":5,\"req\":true},\"hi\":{\"type\":\"int\",\"req\":false}}\nmatrix(2×2) | 방아쇠: 두 축·갈린다·포지셔닝 | p: {\"xl\":{\"type\":\"string\",\"req\":true},\"xr\":{\"type\":\"string\",\"req\":true},\"yb\":{\"type\":\"string\",\"req\":true},\"yt\":{\"type\":\"string\",\"req\":true},\"q\":{\"type\":\"string[]\",\"min\":4,\"max\":4,\"req\":true},\"hi\":{\"type\":\"int\",\"req\":false}}\nfunnel(퍼널) | 방아쇠: 좁아진다·걸러진다·전환율 | p: {\"stages\":{\"type\":\"string[]\",\"min\":3,\"max\":4,\"req\":true}}\nbars(막대 비교) | 방아쇠: ~보다 크다·격차·순위 | 정량(차트형) | p: {\"items\":{\"type\":\"lv[]\",\"min\":2,\"max\":6,\"req\":true},\"hi\":{\"type\":\"int\",\"req\":false},\"unit\":{\"type\":\"string\",\"req\":false}}\ntrend(추세) | 방아쇠: 커진다·줄어든다·N년째 | 정량(차트형) | p: {\"pts\":{\"type\":\"lv[]\",\"min\":4,\"max\":6,\"req\":true},\"note\":{\"type\":\"string\",\"req\":false,\"maxLen\":10}}\ntextgrid(구조화 텍스트) | 방아쇠: 원칙·기준·정의·요청 | p: {\"items\":{\"type\":\"ntd[]\",\"min\":3,\"max\":4,\"req\":true}}\n(후보는 위 9종에서만 고른다 — 파생 템플릿은 수동 경로 전용)\n\n스키마:\n{\"analysis\":{\"key\":\"관계를 드러내는 핵심 구절\",\"rel\":\"관계 유형(예: 기반, 활성화, 비교, 추세, 단계, 분류, 선언)\"},\"cands\":[{\"tpl\":\"...\",\"emph\":\"이 형태가 세우는 측면(8자 내)\",\"why\":\"선택 이유 한 문장\",\"assumed\":false,\"p\":{...}}]}\n\n규칙:\n- 항목 라벨은 2~7자로 짧게\n- 메시지에 없는 세부 항목·수치를 채워야 할 때는 그 후보의 assumed를 true로 표시하고, 수치가 드러나는 라벨·주석에 \"(예시)\"를 붙인다. 과장하지 않는다 — 채운 수치가 없으면 assumed는 false\n- 후보는 반드시 서로 다른 템플릿, 적합도 순\n- 메시지 문장에 수치·비교·추세가 명시된 정량 관계면 차트형(bars/trend)을 반드시 하나 포함. 정량 함의만 있고 수치가 없으면 도해 후보 허용\n- 형태 선택의 기준은 '메시지에서 어느 단어가 싸움의 핵심인가'\n- 마크다운·설명 없이 JSON만 출력\n\n메시지: \"{{MESSAGE}}\"\n덱 맥락: \"{{CONTEXT}}\"\n"};

const MODEL = "claude-sonnet-4-6"; // 모델 교체는 이 상수 1곳 (구현 시점 재확인)
const DECKS_KEY = "deckboard:decks:v2";
const RUNS_KEY = "formstudy:runs:v2";

// ── UI 팔레트 (도구 자체의 색 — 덱 역할색과 무관) ──
const C = {
  paper: "#F6F6F3", ink: "#232A33", gray: "#8A9099", line: "#E4E2DC",
  teal: "#0F7A66", tealDark: "#0B5D4F", tealSoft: "#E7F2EE",
  card: "#FFFFFF", grayFill: "#C9CDD3", grayTint: "#EFF0F1",
  warn: "#8A6D1F", warnBg: "#FBF3D9", err: "#8A3B26", errBg: "#FBEFEC",
};

const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const trunc = (s, n) => (!s ? "" : s.length > n ? s.slice(0, n - 1) + "…" : s);

// ── [[형광]] 마킹 파서 — head 텍스트 → deck-spec runs ──
function parseHead(text) {
  const runs = [];
  let rest = text || "";
  for (;;) {
    const m = rest.match(/\[\[(.*?)\]\]/);
    if (!m) break;
    if (m.index > 0) runs.push({ t: rest.slice(0, m.index) });
    runs.push({ t: m[1], hl: true });
    rest = rest.slice(m.index + m[0].length);
  }
  if (rest) runs.push({ t: rest });
  return runs.length ? runs : [{ t: "" }];
}
const stripHl = (text) => (text || "").replace(/\[\[(.*?)\]\]/g, "$1");

// ── 문체 lint (engine/lib/textcheck.ts와 판정 동일 — RULES.style 기반) ──
function coreSentence(text) {
  let t = (text || "").trim();
  for (;;) {
    const m = t.match(/\s*\([^()]*\)\s*$/);
    if (!m) break;
    t = t.slice(0, t.length - m[0].length).trimEnd();
  }
  return t.replace(/["'”’]+$/, "").trimEnd();
}
function lintText(text) {
  const st = RULES.style, issues = [];
  if (!text) return issues;
  let t = text;
  for (const p of RULES.exceptions.properNouns) t = t.split(p).join("");
  for (const w of st.forbidden.metaphor.words) if (t.includes(w)) issues.push({ sev: "error", msg: `은유 "${w}"` });
  for (const w of st.forbidden.hype.words) if (t.includes(w)) issues.push({ sev: "error", msg: `과장 "${w}"` });
  for (const w of st.forbidden.englishLabels.words) if (t.toUpperCase().includes(w)) issues.push({ sev: "error", msg: `영문 라벨 "${w}"` });
  for (const p of st.forbidden.parallelSlogan.patterns) if (new RegExp(p).test(t)) issues.push({ sev: "error", msg: "대구 슬로건" });
  for (const s of st.symbols.ban) if (t.includes(s)) issues.push({ sev: "error", msg: `금지 기호 "${s}"` });
  return issues;
}
function lintHead(text, isPrimary) {
  const st = RULES.style, issues = lintText(text);
  const core = coreSentence(text);
  if (core && !st.endings.some((e) => core.endsWith(e)))
    issues.push({ sev: isPrimary ? "error" : "warn", msg: `종결(${st.endings.join("/")}) 위반` });
  const limit = st.headline.maxLen + st.headline.tolerance;
  if ((text || "").length > limit) issues.push({ sev: "warn", msg: `${text.length}자 > ${st.headline.maxLen}±${st.headline.tolerance}` });
  return issues;
}

// ── 폼 파라미터 형태 검증 (F9 — 렌더 크래시 원천 차단). pSpec: rules/core/relwords.json ──
function pspecOf(tpl) {
  const t = RULES.relwords.templates.find((x) => x.tpl === tpl) || RULES.relwords.derived.find((x) => x.tpl === tpl);
  return t ? t.pSpec : null;
}
function validP(tpl, p) {
  const spec = pspecOf(tpl);
  if (!spec || !p || typeof p !== "object") return false;
  for (const [key, f] of Object.entries(spec)) {
    const v = p[key];
    if (v == null || v === "") { if (f.req) return false; continue; }
    if (f.type === "string") { if (typeof v !== "string") return false; }
    else if (f.type === "int") { if (typeof v !== "number") return false; }
    else if (f.type === "bool") { if (typeof v !== "boolean") return false; }
    else if (f.type === "string[]") {
      if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) return false;
      if (f.min && v.length < f.min) return false;
      if (f.max && v.length > f.max) return false;
    } else if (f.type === "lv[]") {
      if (!Array.isArray(v) || v.some((x) => !x || typeof x.l !== "string" || typeof x.v !== "number")) return false;
      if (f.min && v.length < f.min) return false;
      if (f.max && v.length > f.max) return false;
    } else if (f.type === "ntd[]") {
      if (!Array.isArray(v) || v.some((x) => !x || !x.t || !x.d)) return false;
      if (f.min && v.length < f.min) return false;
      if (f.max && v.length > f.max) return false;
    } else if (f.type.endsWith("[]")) {
      if (!Array.isArray(v)) return false;
      if (f.min && v.length < f.min) return false;
      if (f.max && v.length > f.max) return false;
    }
  }
  return true;
}

// ── Claude 호출 공통 가드 (F9: res.ok · 30s 타임아웃 · 재시도 1회 · 파싱 · 형태 검증) ──
async function callClaude(prompt, { validate, maxTokens = 2000, retries = 1 }) {
  let lastErr = "";
  for (let i = 0; i <= retries; i++) {
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 30000);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctl.signal,
        body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
      });
      clearTimeout(to);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const txt = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
      const clean = txt.replace(/```json|```/g, "").trim();
      const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
      if (s < 0 || e < 0) throw new Error("JSON 없음");
      const parsed = JSON.parse(clean.slice(s, e + 1));
      const errs = validate ? validate(parsed) : [];
      if (errs.length) throw new Error(errs.join("; "));
      return { ok: true, data: parsed };
    } catch (e) {
      lastErr = String(e && e.message ? e.message : e);
    }
  }
  return { ok: false, error: lastErr };
}
const fill = (tpl, map) => Object.entries(map).reduce((t, [k, v]) => t.split(`{{${k}}}`).join(v), tpl);

// ── storage (window.storage — 사용자별 격리) ──
async function sGet(key) {
  try { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : null; } catch { return null; }
}
async function sSet(key, val) {
  try { await window.storage.set(key, JSON.stringify(val)); return true; } catch { return false; }
}

// ── 프롬프트 입력 조립 ──
function defText(deck) {
  const d = deck.definition, pr = d.priors || {};
  return [
    `Q1(방이 할 일): ${d.q1 || "미입력"} / 아키타입: ${archName(deck.archetype?.id) || "미정"}`,
    `Q2(믿어야 할 것): ${d.q2 || "미입력"}`,
    `Q3(믿지 않는 이유·저항): ${d.q3 || "미입력"}`,
    `Q4(저항별 최강 근거): ${d.q4 || "미입력"}`,
    `Q5(다루지 않을 것): ${d.q5 || "미입력"}`,
    `프라이어 ⓐ최근 본 보고: ${pr.seen || "(비어 있음)"}`,
    `프라이어 ⓑ평가 기준: ${pr.criteria || "(비어 있음)"}`,
    `프라이어 ⓒ누가 잃는가: ${pr.losers || "(비어 있음)"}`,
  ].join("\n");
}
const chainText = (deck) => deck.chain.map((r) => `${r.id} | ${r.label || "(라벨 없음)"} | ${stripHl(r.head)}${r.sub ? " / " + r.sub : ""}`).join("\n");
const archName = (id) => (RULES.archetypes.archetypes.find((a) => a.id === id) || {}).name || "";

// ── F1: Q1 → 아키타입 결정표 ──
function suggestArchetype(q1) {
  const row = RULES.archetypes.decisionTable[q1];
  return row ? { id: row.default, branch: row.branch, alt: row.alt } : null;
}

// ═══════════════ 스케치 (시드 9종 — form-study 이식) ═══════════════
// 렌더 크래시 방어는 이중: 후보 수용 전 validP 선차단 + Sketch 내부 try/catch (F9)

function Frame({ title, children }) {
  return (
    <div style={{ background: C.card, border: "1px solid " + C.line, borderRadius: 10, overflow: "hidden" }}>
      <svg viewBox="0 0 480 270" style={{ width: "100%", display: "block" }}>
        <defs>
          <marker id="dbA" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M2 1L8 5L2 9" fill="none" stroke={C.gray} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        </defs>
        <text x="24" y="33" fontSize="13" fontWeight="700" fill={C.ink}>{trunc(title || "", 31)}</text>
        <line x1="24" y1="51" x2="456" y2="51" stroke={C.line} strokeWidth="1" />
        {children}
      </svg>
    </div>
  );
}
function SkLayer({ p }) {
  const items = (p.items || []).slice(0, 4), n = Math.max(items.length, 1), w = (432 - (n - 1) * 10) / n;
  return (<g>
    {items.map((it, i) => (<g key={i}>
      <rect x={24 + i * (w + 10)} y="116" width={w} height="56" rx="6" fill={C.grayTint} stroke={C.line} />
      <text x={24 + i * (w + 10) + w / 2} y="147" fontSize="12" fill={C.ink} textAnchor="middle">{trunc(it, Math.floor(w / 13))}</text>
    </g>))}
    <rect x="24" y="184" width="432" height="38" rx="6" fill={C.teal} />
    <text x="240" y="207" fontSize="12" fontWeight="700" fill="#fff" textAnchor="middle">{trunc(p.base, 30)}</text>
  </g>);
}
function SkHub({ p }) {
  const sp = (p.spokes || []).slice(0, 5);
  const POS = { 3: [[240, 84], [104, 200], [376, 200]], 4: [[126, 92], [354, 92], [126, 212], [354, 212]], 5: [[240, 80], [96, 128], [384, 128], [146, 220], [334, 220]] };
  const pos = POS[sp.length] || POS[3];
  return (<g>
    {sp.map((s, i) => (<line key={"l" + i} x1="240" y1="152" x2={pos[i][0]} y2={pos[i][1]} stroke={C.gray} strokeWidth="1" />))}
    {sp.map((s, i) => (<g key={i}>
      <rect x={pos[i][0] - 50} y={pos[i][1] - 17} width="100" height="34" rx="6" fill={C.card} stroke={C.line} />
      <text x={pos[i][0]} y={pos[i][1] + 4} fontSize="11" fill={C.ink} textAnchor="middle">{trunc(s, 7)}</text>
    </g>))}
    <circle cx="240" cy="152" r="34" fill={C.teal} />
    <text x="240" y="156" fontSize="12" fontWeight="700" fill="#fff" textAnchor="middle">{trunc(p.center, 5)}</text>
  </g>);
}
function SkBeforeAfter({ p }) {
  const items = (p.items || []).slice(0, 4), H = 30, G = 8, y0 = 84;
  return (<g>
    <text x="112" y="72" fontSize="11" fill={C.gray} textAnchor="middle">{trunc(p.before, 14)}</text>
    <text x="372" y="72" fontSize="11" fill={C.teal} fontWeight="700" textAnchor="middle">{trunc(p.after, 14)}</text>
    {items.map((it, i) => (<g key={i}>
      <rect x="28" y={y0 + i * (H + G)} width="168" height={H} rx="5" fill="none" stroke={C.gray} strokeWidth="0.9" strokeDasharray="4 3" />
      <text x="112" y={y0 + i * (H + G) + 19} fontSize="11" fill={C.gray} textAnchor="middle">{trunc(it, 11)}</text>
      <rect x="288" y={y0 + i * (H + G)} width="168" height={H} rx="5" fill={C.tealSoft} stroke={C.teal} strokeWidth="0.9" />
      <text x="372" y={y0 + i * (H + G) + 19} fontSize="11" fill={C.tealDark} fontWeight="600" textAnchor="middle">{trunc(it, 11)}</text>
    </g>))}
    <text x="242" y="142" fontSize="11" fill={C.teal} fontWeight="700" textAnchor="middle">{trunc(p.trigger, 7)}</text>
    <line x1="206" y1="154" x2="278" y2="154" stroke={C.gray} strokeWidth="1.2" markerEnd="url(#dbA)" />
  </g>);
}
function SkFlow({ p }) {
  const st = (p.steps || []).slice(0, 5), n = Math.max(st.length, 1), gap = 26, w = (432 - (n - 1) * gap) / n;
  return (<g>{st.map((s, i) => {
    const x = 24 + i * (w + gap), hot = i === (p.hi ?? -1);
    return (<g key={i}>
      <rect x={x} y="126" width={w} height="52" rx="6" fill={hot ? C.tealSoft : C.grayTint} stroke={hot ? C.teal : C.line} strokeWidth={hot ? 1.2 : 1} />
      <text x={x + w / 2} y="155" fontSize="11" fill={hot ? C.tealDark : C.ink} fontWeight={hot ? 700 : 400} textAnchor="middle">{trunc(s, Math.floor(w / 12))}</text>
      {i < n - 1 && <line x1={x + w + 4} y1="152" x2={x + w + gap - 4} y2="152" stroke={C.gray} strokeWidth="1" markerEnd="url(#dbA)" />}
    </g>);
  })}</g>);
}
function SkMatrix({ p }) {
  const Q = [{ x: 50, y: 64, cx: 145, cy: 112 }, { x: 240, y: 64, cx: 335, cy: 112 }, { x: 50, y: 151, cx: 145, cy: 199 }, { x: 240, y: 151, cx: 335, cy: 199 }];
  const hi = p.hi ?? 3, q = p.q || [];
  return (<g>
    {Q[hi] && <rect x={Q[hi].x} y={Q[hi].y} width="190" height="87" fill={C.tealSoft} />}
    <line x1="240" y1="64" x2="240" y2="238" stroke={C.gray} strokeWidth="1" />
    <line x1="50" y1="151" x2="430" y2="151" stroke={C.gray} strokeWidth="1" />
    <text x="52" y="145" fontSize="10.5" fill={C.gray}>{trunc(p.xl, 8)}</text>
    <text x="428" y="145" fontSize="10.5" fill={C.gray} textAnchor="end">{trunc(p.xr, 8)}</text>
    <text x="248" y="62" fontSize="10.5" fill={C.gray}>{trunc(p.yt, 8)}</text>
    <text x="248" y="248" fontSize="10.5" fill={C.gray}>{trunc(p.yb, 8)}</text>
    {q.slice(0, 4).map((t, i) => (<text key={i} x={Q[i].cx} y={Q[i].cy + 4} fontSize="12" fontWeight={i === hi ? 700 : 400} fill={i === hi ? C.tealDark : C.ink} textAnchor="middle">{trunc(t, 9)}</text>))}
  </g>);
}
function SkFunnel({ p }) {
  const st = (p.stages || []).slice(0, 4), n = st.length;
  return (<g>{st.map((s, i) => {
    const w = Math.max(400 - i * 84, 140), y = 66 + i * 45, last = i === n - 1;
    return (<g key={i}>
      <rect x={240 - w / 2} y={y} width={w} height="34" rx="6" fill={last ? C.tealSoft : C.grayTint} stroke={last ? C.teal : C.line} />
      <text x="240" y={y + 21} fontSize="11" fill={last ? C.tealDark : C.ink} fontWeight={last ? 700 : 400} textAnchor="middle">{trunc(s, 14)}</text>
    </g>);
  })}</g>);
}
function SkBars({ p }) {
  const items = (p.items || []).slice(0, 6), n = Math.max(items.length, 1);
  const max = Math.max(...items.map((d) => (typeof d.v === "number" ? d.v : 0)), 1), slot = 432 / n, bw = Math.min(54, slot * 0.55);
  return (<g>
    {p.unit && <text x="456" y="72" fontSize="10.5" fill={C.gray} textAnchor="end">{trunc(p.unit, 8)}</text>}
    <line x1="24" y1="218" x2="456" y2="218" stroke={C.gray} strokeWidth="0.8" />
    {items.map((d, i) => {
      const h = Math.max(((d.v || 0) / max) * 126, 6), x = 24 + i * slot + (slot - bw) / 2, hot = i === (p.hi ?? 0);
      return (<g key={i}>
        <rect x={x} y={218 - h} width={bw} height={h} rx="3" fill={hot ? C.teal : C.grayFill} />
        <text x={x + bw / 2} y={210 - h} fontSize="11" fontWeight={hot ? 700 : 400} fill={hot ? C.tealDark : C.gray} textAnchor="middle">{d.v}</text>
        <text x={x + bw / 2} y="236" fontSize="11" fill={C.ink} textAnchor="middle">{trunc(d.l, 6)}</text>
      </g>);
    })}
  </g>);
}
function SkTrend({ p }) {
  const pts = (p.pts || []).slice(0, 6), n = pts.length;
  if (n < 2) return null;
  const vs = pts.map((d) => d.v || 0), min = Math.min(...vs), max = Math.max(...vs), span = max - min || 1;
  const X = (i) => 60 + (i * 370) / (n - 1), Y = (v) => 202 - ((v - min) / span) * 108;
  return (<g>
    <line x1="40" y1="218" x2="450" y2="218" stroke={C.gray} strokeWidth="0.8" />
    <polyline points={pts.map((d, i) => `${X(i)},${Y(d.v)}`).join(" ")} fill="none" stroke={C.ink} strokeWidth="1.6" />
    {pts.map((d, i) => (<g key={i}>
      <circle cx={X(i)} cy={Y(d.v)} r={i === n - 1 ? 5 : 3} fill={i === n - 1 ? C.teal : C.grayFill} />
      <text x={X(i)} y="236" fontSize="11" fill={C.ink} textAnchor="middle">{trunc(d.l, 6)}</text>
    </g>))}
    {p.note && <text x={X(n - 1) - 10} y={Y(pts[n - 1].v) - 14} fontSize="11.5" fontWeight="700" fill={C.teal} textAnchor="end">{trunc(p.note, 12)}</text>}
  </g>);
}
function SkTextgrid({ p }) {
  const items = (p.items || []).slice(0, 4);
  return (<g>{items.map((it, i) => {
    const y = 78 + i * 48;
    return (<g key={i}>
      <text x="28" y={y} fontSize="12" fontWeight="700" fill={C.teal} fontFamily="monospace">{it.n || String(i + 1).padStart(2, "0")}</text>
      <text x="66" y={y} fontSize="13" fontWeight="700" fill={C.ink}>{trunc(it.t, 16)}</text>
      <text x="66" y={y + 17} fontSize="11" fill={C.gray}>{trunc(it.d, 34)}</text>
    </g>);
  })}</g>);
}
function Sketch({ tpl, p, title }) {
  let body = null;
  try {
    if (!p) body = null;
    else if (tpl === "layer") body = <SkLayer p={p} />;
    else if (tpl === "hub") body = <SkHub p={p} />;
    else if (tpl === "before_after") body = <SkBeforeAfter p={p} />;
    else if (tpl === "flow") body = <SkFlow p={p} />;
    else if (tpl === "matrix") body = <SkMatrix p={p} />;
    else if (tpl === "funnel") body = <SkFunnel p={p} />;
    else if (tpl === "bars") body = <SkBars p={p} />;
    else if (tpl === "trend") body = <SkTrend p={p} />;
    else if (tpl === "textgrid") body = <SkTextgrid p={p} />;
    else body = <text x="240" y="150" fontSize="12" fill={C.gray} textAnchor="middle">(스케치 없음 — 실물 추출 폼, 정식 렌더는 빌드에서)</text>;
  } catch {
    body = <text x="240" y="150" fontSize="12" fill={C.err} textAnchor="middle">스케치 렌더 실패 — 파라미터 형태 확인</text>;
  }
  return <Frame title={title}>{body}</Frame>;
}

// ═══════════════ 메인 앱 ═══════════════
export default function App() {
  const [decks, setDecks] = useState(null);       // 덱 목록
  const [deck, setDeck] = useState(null);         // 열린 덱 본문
  const [loadedAt, setLoadedAt] = useState(0);    // 열 때의 updatedAt (충돌 감지)
  const [conflict, setConflict] = useState(false);
  const [tab, setTab] = useState("def");
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  const say = (msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  };

  useEffect(() => { sGet(DECKS_KEY).then((v) => setDecks(v || [])); }, []);

  // 저장은 600ms 디바운스 — 키 입력마다 storage 왕복하지 않음. 충돌(다중 탭)은 저장 시점에 감지.
  const dirtyRef = useRef(false);
  const decksRef = useRef(decks);
  decksRef.current = decks;
  const loadedAtRef = useRef(loadedAt);
  loadedAtRef.current = loadedAt;

  async function persist(next, opts = {}) {
    const now = Date.now();
    if (!opts.force) {
      const stored = await sGet(`deckboard:deck:${next.id}`);
      if (stored && (stored.updatedAt || 0) !== loadedAtRef.current) { setConflict(true); return; }
    }
    const withMeta = { ...next, schemaVersion: 2, rulesVersion: RULES.version, updatedAt: now };
    dirtyRef.current = false;
    const ok = await sSet(`deckboard:deck:${next.id}`, withMeta);
    if (!ok) { say("저장 실패 — storage 사용 불가 환경 (백업 내려받기를 사용하세요)"); return; }
    setLoadedAt(now);
    setConflict(false);
    const list = (decksRef.current || []).map((d) => (d.id === next.id ? { ...d, title: next.title, updatedAt: now } : d));
    setDecks(list);
    await sSet(DECKS_KEY, list);
  }

  useEffect(() => {
    if (!deck || !dirtyRef.current) return;
    const t = setTimeout(() => { if (dirtyRef.current) persist(deck); }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck]);

  const changeDeck = (next) => { dirtyRef.current = true; setDeck(next); };

  async function openDeck(id) {
    const d = await sGet(`deckboard:deck:${id}`);
    if (!d) { say("덱을 불러오지 못함"); return; }
    dirtyRef.current = false;
    setDeck(d); setLoadedAt(d.updatedAt || 0); setConflict(false); setTab("def");
  }

  async function newDeck() {
    const id = uid("d");
    const d = {
      id, schemaVersion: 2, rulesVersion: RULES.version, title: "새 덱", updatedAt: Date.now(),
      definition: { q1: "", q2: "", q3: "", q4: "", q5: "", priors: { seen: "", criteria: "", losers: "" } },
      archetype: null, chain: [], nextRowId: 1, holes: [], holesRunAt: 0,
    };
    const list = [{ id, title: d.title, createdAt: Date.now(), updatedAt: d.updatedAt }, ...(decks || [])];
    setDecks(list);
    await sSet(DECKS_KEY, list);
    await sSet(`deckboard:deck:${id}`, d);
    dirtyRef.current = false;
    setDeck(d); setLoadedAt(d.updatedAt); setTab("def");
  }

  async function deleteDeck(id) {
    const list = (decks || []).filter((d) => d.id !== id);
    setDecks(list);
    await sSet(DECKS_KEY, list);
    try { await window.storage.delete(`deckboard:deck:${id}`); } catch { /* 키 삭제 실패는 무해 */ }
    if (deck && deck.id === id) setDeck(null);
  }

  return (
    <div style={{ background: C.paper, minHeight: "100vh", color: C.ink, fontFamily: "'Pretendard','Apple SD Gothic Neo','Malgun Gothic',sans-serif" }}>
      <div className="mx-auto px-4 py-6" style={{ maxWidth: 860 }}>
        <div className="flex items-baseline justify-between mb-1">
          <h1 className="text-xl" style={{ fontWeight: 800 }}>덱보드</h1>
          <span className="text-xs" style={{ color: C.gray }}>rules v{RULES.version} · {RULES.org} 팩 · {MODEL}</span>
        </div>
        <p className="text-sm mb-4" style={{ color: C.gray }}>정의서 → 체인 → 구멍 검사 → 폼 스터디 → deck-spec 내보내기. 제작·QA는 Claude Code에서.</p>

        {toast && <div className="text-sm px-4 py-2 rounded-lg mb-3" style={{ background: C.warnBg, color: C.warn }}>{toast}</div>}
        {conflict && deck && (
          <div className="text-sm px-4 py-3 rounded-lg mb-3 flex items-center gap-3" style={{ background: C.errBg, color: C.err }}>
            <span className="flex-1">다른 탭에서 이 덱이 수정됐습니다. 덮어쓰면 그쪽 변경이 사라집니다.</span>
            <button className="px-3 py-1 rounded" style={{ background: C.err, color: "#fff", fontWeight: 700 }} onClick={() => persist(deck, { force: true })}>덮어쓰기</button>
            <button className="px-3 py-1 rounded" style={{ border: "1px solid " + C.err }} onClick={() => openDeck(deck.id)}>다시 불러오기</button>
          </div>
        )}

        {!deck && <DeckList decks={decks} onOpen={openDeck} onNew={newDeck} onDelete={deleteDeck} />}
        {deck && (
          <DeckScreen
            deck={deck} tab={tab} setTab={setTab} say={say}
            onBack={() => { if (dirtyRef.current) persist(deck); setDeck(null); }}
            onChange={changeDeck}
          />
        )}
      </div>
    </div>
  );
}

function DeckList({ decks, onOpen, onNew, onDelete }) {
  return (
    <div>
      <button onClick={onNew} className="text-sm px-4 py-2 rounded-lg mb-4" style={{ background: C.ink, color: "#fff", fontWeight: 700 }}>+ 새 덱</button>
      {decks === null && <div className="text-sm" style={{ color: C.gray }}>불러오는 중…</div>}
      {decks !== null && decks.length === 0 && <div className="text-sm py-8 text-center" style={{ color: C.gray }}>덱이 없습니다. 새 덱으로 시작하세요.</div>}
      <div className="grid gap-2">
        {(decks || []).map((d) => (
          <div key={d.id} className="rounded-lg flex items-center gap-3 px-4 py-3" style={{ background: C.card, border: "1px solid " + C.line }}>
            <button className="flex-1 text-left" style={{ fontWeight: 700 }} onClick={() => onOpen(d.id)}>{d.title}</button>
            <span className="text-xs" style={{ color: C.gray }}>{new Date(d.updatedAt || d.createdAt).toLocaleDateString("ko-KR")}</span>
            <button className="text-xs px-2 py-1 rounded" style={{ color: C.err, border: "1px solid " + C.line }} onClick={() => { if (window.confirm ? window.confirm(`"${d.title}" 삭제?`) : true) onDelete(d.id); }}>삭제</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TabBtn({ id, cur, set, label, badge }) {
  return (
    <button onClick={() => set(id)} className="text-sm px-1 pb-2" style={{ color: cur === id ? C.ink : C.gray, fontWeight: cur === id ? 700 : 400, borderBottom: cur === id ? "2px solid " + C.ink : "2px solid transparent", background: "none" }}>
      {label}{badge ? <span className="ml-1 text-xs px-1.5 rounded-full" style={{ background: C.warnBg, color: C.warn }}>{badge}</span> : null}
    </button>
  );
}

function DeckScreen({ deck, tab, setTab, onBack, onChange, say }) {
  const staleHoles = deck.holes.filter((h) => h.stale).length;
  const undone = deck.holes.filter((h) => !h.disposition).length;
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <button className="text-sm px-3 py-1.5 rounded-lg" style={{ border: "1px solid " + C.line, background: C.card }} onClick={onBack}>← 목록</button>
        <input value={deck.title} onChange={(e) => onChange({ ...deck, title: e.target.value })} className="flex-1 text-lg outline-none px-2 py-1" style={{ fontWeight: 800, background: "transparent", borderBottom: "1px solid " + C.line }} />
      </div>
      <div className="flex gap-5 mb-5" style={{ borderBottom: "1px solid " + C.line }}>
        <TabBtn id="def" cur={tab} set={setTab} label="1 정의서" />
        <TabBtn id="chain" cur={tab} set={setTab} label="2 체인" badge={deck.chain.length || null} />
        <TabBtn id="holes" cur={tab} set={setTab} label="3 구멍 검사" badge={staleHoles ? `재검토 ${staleHoles}` : undone ? `미처분 ${undone}` : null} />
        <TabBtn id="export" cur={tab} set={setTab} label="4 내보내기" />
      </div>
      {tab === "def" && <DefTab deck={deck} onChange={onChange} say={say} />}
      {tab === "chain" && <ChainTab deck={deck} onChange={onChange} say={say} />}
      {tab === "holes" && <HolesTab deck={deck} onChange={onChange} say={say} />}
      {tab === "export" && <ExportTab deck={deck} say={say} />}
    </div>
  );
}

// ── 탭 1: 정의서 ──
function DefTab({ deck, onChange, say }) {
  const d = deck.definition;
  const [ping, setPing] = useState("");
  const sug = suggestArchetype(d.q1);
  const set = (patch) => onChange({ ...deck, definition: { ...d, ...patch } });
  const setPrior = (k, v) => set({ priors: { ...d.priors, [k]: v } });
  const saveWithStale = (patch) => {
    // 정의서 저장 → 기존 구멍 검사 결과는 재검토 대상 (상태 전이 규칙)
    onChange({ ...deck, definition: { ...d, ...patch }, holes: deck.holes.map((h) => ({ ...h, stale: true })) });
  };
  const pickArch = (id, source) => onChange({ ...deck, archetype: { id, source } });

  async function testConnection() {
    setPing("확인 중…");
    const r = await callClaude('JSON으로만 답하라: {"ok":true}', { validate: (o) => (o.ok === true ? [] : ["형식 불일치"]), maxTokens: 24, retries: 0 });
    setPing(r.ok ? "정상 — Claude 호출 가능" : `실패: ${r.error} (모델명·네트워크 확인)`);
  }

  const Q = ({ k, label, hint, tall }) => (
    <div className="mb-3">
      <div className="text-xs mb-1" style={{ color: C.gray, fontWeight: 700 }}>{label}</div>
      <textarea value={d[k]} onChange={(e) => set({ [k]: e.target.value })} onBlur={() => saveWithStale({})} rows={tall ? 3 : 2}
        placeholder={hint} className="w-full text-sm outline-none resize-none rounded-lg p-3" style={{ background: C.card, border: "1px solid " + C.line, lineHeight: 1.6 }} />
    </div>
  );

  return (
    <div>
      <div className="rounded-xl p-4 mb-4" style={{ background: C.card, border: "1px solid " + C.line }}>
        <div className="text-xs mb-2" style={{ color: C.gray, fontWeight: 700 }}>Q1. 이 자리가 끝났을 때 방이 무엇을 하기를 원하는가</div>
        <div className="flex flex-wrap gap-2 mb-2">
          {Object.keys(RULES.archetypes.decisionTable).map((k) => (
            <button key={k} onClick={() => { set({ q1: k }); const s = suggestArchetype(k); if (s && (!deck.archetype || deck.archetype.source === "auto")) pickArch(s.id, "auto"); }}
              className="text-sm px-3 py-1.5 rounded-full" style={{ border: "1px solid " + (d.q1 === k ? C.teal : C.line), background: d.q1 === k ? C.tealSoft : C.card, color: d.q1 === k ? C.tealDark : C.ink, fontWeight: d.q1 === k ? 700 : 400 }}>{k}</button>
          ))}
        </div>
        <div className="text-xs mb-2" style={{ color: C.gray }}>{RULES.archetypes.q1Criteria}</div>
        {sug && (
          <div className="text-sm rounded-lg px-3 py-2" style={{ background: C.grayTint }}>
            아키타입 제안: <b>{archName(sug.id)}</b>
            {sug.branch && <span style={{ color: C.gray }}> — {sug.branch}</span>}
            <span className="ml-2">
              {[sug.id, sug.alt].filter(Boolean).map((id) => (
                <button key={id} onClick={() => pickArch(id, "manual")} className="text-xs px-2 py-0.5 rounded mr-1"
                  style={{ border: "1px solid " + (deck.archetype?.id === id ? C.teal : C.line), background: deck.archetype?.id === id ? C.tealSoft : "transparent" }}>{archName(id)}</button>
              ))}
              <select value={deck.archetype?.id || ""} onChange={(e) => e.target.value && pickArch(e.target.value, "manual")} className="text-xs px-1 py-0.5 rounded" style={{ border: "1px solid " + C.line, background: C.card }}>
                <option value="">직접 선택…</option>
                {RULES.archetypes.archetypes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </span>
          </div>
        )}
      </div>
      <Q k="q2" label="Q2. 그렇게 하려면 그들이 무엇을 믿어야 하는가 (한 문장 — governing thought)" hint="예: 건강 반응형 정기보험은 소규모 파일럿으로 검증할 가치가 있다" />
      <Q k="q3" label="Q3. 지금 그들이 그걸 믿지 않는 이유는 (저항 순서 = 본론 구간 배열)" hint="저항 1 → 저항 2 → 저항 3 (순서대로)" tall />
      <Q k="q4" label="Q4. 각 저항을 무너뜨리는 가장 강한 근거 하나 (저항당 하나 — 쌓지 말 것)" tall />
      <Q k="q5" label="Q5. 이번에 다루지 않을 것" />
      <div className="rounded-xl p-4 mb-4" style={{ background: C.card, border: "1px solid " + C.line }}>
        <div className="text-xs mb-2" style={{ color: C.gray, fontWeight: 700 }}>오디언스 프라이어 (구멍 검사 ①⑥은 여기 입력한 만큼만 검출됨)</div>
        {[["seen", "ⓐ 이 방이 최근 본 관련 보고·장표"], ["criteria", "ⓑ 이 방의 평가 기준·KPI"], ["losers", "ⓒ 이 안이 통과되면 누가 무엇을 잃는가"]].map(([k, label]) => (
          <div key={k} className="mb-2">
            <div className="text-xs mb-1" style={{ color: C.gray }}>{label}</div>
            <textarea value={d.priors[k]} onChange={(e) => setPrior(k, e.target.value)} onBlur={() => saveWithStale({})} rows={2}
              className="w-full text-sm outline-none resize-none rounded-lg p-2" style={{ background: C.grayTint, border: "1px solid " + C.line, lineHeight: 1.5 }} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 text-xs" style={{ color: C.gray }}>
        <button onClick={testConnection} className="px-3 py-1.5 rounded-lg" style={{ border: "1px solid " + C.line, background: C.card }}>Claude 연결 테스트</button>
        <span>{ping}</span>
      </div>
    </div>
  );
}

// ── 탭 2: 체인 (+고스트 뷰 +폼 스터디 진입) ──
function ChainTab({ deck, onChange, say }) {
  const [ghost, setGhost] = useState(false);
  const [diag, setDiag] = useState(null);
  const [busy, setBusy] = useState(false);
  const [studyRow, setStudyRow] = useState(null);

  const rows = deck.chain;
  const setRows = (chain, extra = {}) => onChange({ ...deck, chain, ...extra });

  function addRow(label = "", head = "") {
    const id = "c" + deck.nextRowId;
    setRows([...rows, { id, label, head, sub: "", status: "draft", form: null }], { nextRowId: deck.nextRowId + 1 });
  }
  function insertSkeleton() {
    const arch = RULES.archetypes.archetypes.find((a) => a.id === deck.archetype?.id);
    if (!arch) { say("정의서에서 아키타입을 먼저 정하세요 (Q1)"); return; }
    let nid = deck.nextRowId;
    const add = arch.skeleton.filter((s) => !rows.some((r) => r.label === s.label)).map((s) => ({ id: "c" + nid++, label: s.label, head: "", sub: "", status: "draft", form: null, seg: s.seg }));
    setRows([...rows, ...add], { nextRowId: nid });
    say(`골격 ${add.length}줄 삽입 — 본론(body) 구간은 저항 순서로 재배열하세요 (intro·outro 고정)`);
  }
  function editRow(id, patch) {
    setRows(rows.map((r) => {
      if (r.id !== id) return r;
      const next = { ...r, ...patch };
      // head 수정 → 폼 확정 강등 + 관련 구멍 재검토 (상태 전이 규칙)
      if ("head" in patch && patch.head !== r.head && r.status === "form_ok") next.status = "msg_ok";
      return next;
    }), "head" in patch ? { holes: deck.holes.map((h) => (h.atIds.includes(id) ? { ...h, stale: true } : h)) } : {});
  }
  function delRow(id) {
    setRows(rows.filter((r) => r.id !== id), { holes: deck.holes.map((h) => (h.atIds.includes(id) ? { ...h, stale: true } : h)) });
  }
  function move(id, dir) {
    const i = rows.findIndex((r) => r.id === id), j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = rows.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
  }

  async function diagnose() {
    if (rows.length < 2) { say("체인이 2줄 이상이어야 진단할 수 있습니다"); return; }
    setBusy(true); setDiag(null);
    const ids = new Set(rows.map((r) => r.id));
    const r = await callClaude(fill(PROMPTS.chainDiagnose, { DEFINITION: defText(deck), CHAIN: chainText(deck) }), {
      maxTokens: 1500,
      validate: (o) => {
        if (o.verdict !== "ok" && o.verdict !== "break") return ["verdict 형식"];
        if (!Array.isArray(o.links)) return ["links 형식"];
        for (const l of o.links) if (!l.fromId || !l.toId || !l.issue || !ids.has(l.fromId)) return ["links 항목 형식"];
        return [];
      },
    });
    setBusy(false);
    setDiag(r.ok ? r.data : { error: r.error });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        <button onClick={() => addRow()} className="text-sm px-3 py-1.5 rounded-lg" style={{ background: C.ink, color: "#fff", fontWeight: 700 }}>+ 줄 추가</button>
        <button onClick={insertSkeleton} className="text-sm px-3 py-1.5 rounded-lg" style={{ border: "1px solid " + C.line, background: C.card }}>아키타입 골격 삽입</button>
        <button onClick={() => setGhost(!ghost)} className="text-sm px-3 py-1.5 rounded-lg" style={{ border: "1px solid " + (ghost ? C.teal : C.line), background: ghost ? C.tealSoft : C.card, color: ghost ? C.tealDark : C.ink }}>고스트 뷰</button>
        <button onClick={diagnose} disabled={busy} className="text-sm px-3 py-1.5 rounded-lg" style={{ background: busy ? C.grayFill : C.teal, color: "#fff", fontWeight: 700 }}>{busy ? "진단 중…" : "체인 진단 (AI)"}</button>
      </div>

      {ghost && (
        <div className="rounded-xl p-5 mb-4" style={{ background: C.ink, color: "#fff" }}>
          <div className="text-xs mb-3" style={{ color: "#9aa4b0", fontWeight: 700 }}>고스트 덱 — 헤드만 이어 읽어 보고가 성립하는가</div>
          {rows.map((r, i) => (
            <div key={r.id} className="mb-2" style={{ lineHeight: 1.6 }}>
              <span className="text-xs mr-2" style={{ color: "#9aa4b0" }}>{i + 1}</span>
              <span style={{ fontWeight: 600 }}>{stripHl(r.head) || "(헤드 없음)"}</span>
              {r.sub && <span className="text-sm" style={{ color: "#c2c9d2" }}> / {r.sub}</span>}
            </div>
          ))}
        </div>
      )}

      {diag && (
        <div className="rounded-xl p-4 mb-4 text-sm" style={{ background: diag.error ? C.errBg : C.card, border: "1px solid " + C.line }}>
          {diag.error ? (
            <span style={{ color: C.err }}>진단 실패: {diag.error} — 재시도하거나 고스트 뷰로 수동 점검 (수동 경로)</span>
          ) : (
            <div>
              <div className="mb-2"><b>진단: {diag.verdict === "ok" ? "논리 성립" : "끊기는 링크 있음"}</b> <span style={{ color: C.gray }}>{diag.note}</span></div>
              {diag.links.map((l, i) => (
                <div key={i} className="mb-1" style={{ color: l.severity === "치명" ? C.err : l.severity === "중요" ? C.warn : C.gray }}>
                  [{l.severity}] {l.fromId}→{l.toId}: {l.issue}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-3">
        {rows.map((r, i) => <ChainRow key={r.id} r={r} i={i} deck={deck} onEdit={editRow} onDel={delRow} onMove={move} onStudy={() => setStudyRow(r)} />)}
      </div>
      {rows.length === 0 && <div className="text-sm py-8 text-center" style={{ color: C.gray }}>줄을 추가하거나 아키타입 골격을 삽입하세요. 한 줄 = 한 장.</div>}

      {studyRow && <FormStudy deck={deck} row={deck.chain.find((r) => r.id === studyRow.id) || studyRow} onClose={() => setStudyRow(null)} onChange={onChange} say={say} />}
    </div>
  );
}

function Badges({ issues }) {
  if (!issues.length) return null;
  return (
    <span className="ml-2">
      {issues.map((iss, k) => (
        <span key={k} className="text-xs px-1.5 py-0.5 rounded mr-1" style={{ background: iss.sev === "error" ? C.errBg : C.warnBg, color: iss.sev === "error" ? C.err : C.warn }}>{iss.msg}</span>
      ))}
    </span>
  );
}

function ChainRow({ r, i, deck, onEdit, onDel, onMove, onStudy }) {
  const headIssues = lintHead(stripHl(r.head), true).concat(r.sub ? lintHead(r.sub, false) : []);
  const labelIssues = r.label ? lintText(r.label) : [];
  const statusLabel = { draft: "초안", msg_ok: "메시지 확정", form_ok: "폼 확정" }[r.status] || r.status;
  const statusColor = r.status === "form_ok" ? C.tealDark : r.status === "msg_ok" ? C.warn : C.gray;
  return (
    <div className="rounded-xl p-3" style={{ background: C.card, border: "1px solid " + C.line }}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs" style={{ color: C.gray, width: 26 }}>{r.id}</span>
        <input value={r.label} onChange={(e) => onEdit(r.id, { label: e.target.value })} placeholder="라벨 (주제 명사)" className="text-sm outline-none px-2 py-1 rounded" style={{ width: 200, background: C.grayTint, fontWeight: 700 }} />
        <Badges issues={labelIssues} />
        <span className="flex-1" />
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ border: "1px solid " + C.line, color: statusColor, fontWeight: 700 }}>{statusLabel}</span>
        <button className="text-xs px-1.5" onClick={() => onMove(r.id, -1)} title="위로">▲</button>
        <button className="text-xs px-1.5" onClick={() => onMove(r.id, +1)} title="아래로">▼</button>
        <button className="text-xs px-1.5" style={{ color: C.err }} onClick={() => onDel(r.id)} title="삭제">✕</button>
      </div>
      <textarea value={r.head} onChange={(e) => onEdit(r.id, { head: e.target.value })} rows={1} placeholder="헤드메시지 — 개조식(함/됨/임), 35자 안팎. [[핵심 구절]]은 형광"
        className="w-full text-base outline-none resize-none px-2 py-1" style={{ fontWeight: 700, background: "transparent", borderBottom: "1px solid " + C.line, lineHeight: 1.5 }} />
      <div className="flex items-center gap-2 mt-1">
        <input value={r.sub || ""} onChange={(e) => onEdit(r.id, { sub: e.target.value })} placeholder="보조 헤드 (선택)" className="flex-1 text-sm outline-none px-2 py-1" style={{ background: "transparent", color: C.ink }} />
        <Badges issues={headIssues} />
        {r.status === "draft" && stripHl(r.head) && !headIssues.some((x) => x.sev === "error") && (
          <button className="text-xs px-2 py-1 rounded" style={{ border: "1px solid " + C.line }} onClick={() => onEdit(r.id, { status: "msg_ok" })}>메시지 확정</button>
        )}
        <button className="text-xs px-2 py-1 rounded" style={{ background: r.form ? C.tealSoft : "transparent", border: "1px solid " + (r.form ? C.teal : C.line), color: r.form ? C.tealDark : C.ink, fontWeight: 700 }} onClick={onStudy}>
          {r.form ? `폼: ${r.form.tpl}` : "폼 스터디"}
        </button>
      </div>
    </div>
  );
}

// ── 폼 스터디 (내부 루프 — form-study 흡수) ──
function FormStudy({ deck, row, onClose, onChange, say }) {
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState(null);
  const [err, setErr] = useState(null);
  const [manual, setManual] = useState(false);
  const [mTpl, setMTpl] = useState("");
  const [mP, setMP] = useState("{}");

  const msg = stripHl(row.head);
  const ctx = `${deck.title} · ${archName(deck.archetype?.id) || ""}`;

  useEffect(() => { analyze(); /* eslint-disable-next-line */ }, []);

  async function analyze() {
    setBusy(true); setErr(null); setRun(null);
    const r = await callClaude(fill(PROMPTS.formStudy, { MESSAGE: msg, CONTEXT: ctx }), {
      maxTokens: 2000,
      validate: (o) => {
        if (!Array.isArray(o.cands)) return ["cands 형식"];
        const good = o.cands.filter((cd) => cd && cd.tpl && validP(cd.tpl, cd.p));
        if (!good.length) return ["유효 후보 없음 (p 형태 검증 실패)"];
        o.cands = good.slice(0, 3);
        return [];
      },
    });
    setBusy(false);
    if (r.ok) setRun({ ts: Date.now(), analysis: r.data.analysis || {}, cands: r.data.cands });
    else setErr(r.error);
  }

  async function persistRun(pick) {
    const rec = {
      ts: Date.now(), deckId: deck.id, rowId: row.id, msg, ctx,
      rel: run?.analysis?.rel || "", cands: (run?.cands || []).map((cd) => cd.tpl),
      pick: pick.tpl, p: pick.p, assumed: !!pick.assumed,
    };
    const list = (await sGet(RUNS_KEY)) || [];
    list.unshift(rec);
    if (list.length > 300) { list.length = 300; say("기록 300건 초과 — 오래된 기록을 정리했습니다"); }
    await sSet(RUNS_KEY, list);
  }

  async function pick(cand) {
    await persistRun(cand);
    onChange({
      ...deck,
      chain: deck.chain.map((r) => (r.id === row.id ? { ...r, status: "form_ok", form: { tpl: cand.tpl, p: cand.p, assumed: !!cand.assumed, pickedAt: Date.now() } } : r)),
    });
    onClose();
  }

  function pickManual() {
    let p;
    try { p = JSON.parse(mP); } catch { say("p JSON 파싱 실패"); return; }
    if (!validP(mTpl, p)) { say(`p가 ${mTpl}의 형태 계약(pSpec)에 맞지 않습니다`); return; }
    pick({ tpl: mTpl, p, assumed: false });
  }

  const allTpls = [...RULES.relwords.templates, ...RULES.relwords.derived.filter((d) => d.tpl !== "cover")];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto py-8" style={{ background: "rgba(20,24,28,.5)" }} onClick={onClose}>
      <div className="rounded-2xl p-5 w-full" style={{ maxWidth: 720, background: C.paper }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm" style={{ fontWeight: 800 }}>폼 스터디 — {row.id} {row.label}</div>
          <button onClick={onClose} className="text-sm px-2" style={{ color: C.gray }}>닫기 ✕</button>
        </div>
        <div className="text-base mb-3" style={{ fontWeight: 700 }}>{msg}</div>

        {busy && <div className="text-sm py-6 text-center" style={{ color: C.gray }}>관계어를 읽고 형태 후보를 고르는 중…</div>}
        {err && (
          <div className="text-sm px-4 py-3 rounded-lg mb-3" style={{ background: C.errBg, color: C.err }}>
            실패: {err}
            <button onClick={analyze} className="ml-3 px-2 py-0.5 rounded" style={{ border: "1px solid " + C.err }}>재실행</button>
            <button onClick={() => setManual(true)} className="ml-2 px-2 py-0.5 rounded" style={{ border: "1px solid " + C.err }}>수동 선택</button>
          </div>
        )}

        {run && (
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
              <span style={{ color: C.gray }}>관계어</span>
              <span className="px-2 py-1 rounded" style={{ background: C.tealSoft, color: C.tealDark, fontFamily: "monospace", fontWeight: 700 }}>{run.analysis.key || "—"}</span>
              <span className="px-2 py-1 rounded" style={{ background: C.grayTint, fontFamily: "monospace" }}>{run.analysis.rel || "—"}</span>
              <button onClick={() => setManual(!manual)} className="ml-auto px-2 py-1 rounded" style={{ border: "1px solid " + C.line }}>수동 선택</button>
            </div>
            <div className="grid gap-4">
              {run.cands.map((cd, i) => (
                <div key={i} className="rounded-xl p-3" style={{ background: C.card, border: "1px solid " + C.line }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm">
                      <b>{(allTpls.find((t) => t.tpl === cd.tpl) || {}).name || cd.tpl}</b>
                      <span className="text-xs ml-2" style={{ color: C.teal, fontWeight: 700 }}>강조 — {cd.emph}</span>
                      {cd.assumed && <span className="text-xs ml-2 px-1.5 rounded" style={{ background: C.warnBg, color: C.warn }}>가정 수치 포함 → 각주 필수</span>}
                    </div>
                    <button onClick={() => pick(cd)} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: C.teal, color: "#fff", fontWeight: 700 }}>이 형태로</button>
                  </div>
                  <Sketch tpl={cd.tpl} p={cd.p} title={msg} />
                  <div className="text-xs mt-2" style={{ color: C.gray, lineHeight: 1.6 }}>{cd.why}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {manual && (
          <div className="rounded-xl p-4 mt-3" style={{ background: C.card, border: "1px solid " + C.line }}>
            <div className="text-xs mb-2" style={{ color: C.gray, fontWeight: 700 }}>수동 경로 — 템플릿을 고르고 p(JSON)를 직접 작성</div>
            <div className="flex gap-2 mb-2">
              <select value={mTpl} onChange={(e) => { setMTpl(e.target.value); const sp = pspecOf(e.target.value); if (sp) setMP(JSON.stringify(Object.fromEntries(Object.entries(sp).map(([k, f]) => [k, f.type.endsWith("[]") ? [] : f.type === "int" ? 0 : f.type === "bool" ? false : ""])), null, 1)); }}
                className="text-sm px-2 py-1 rounded" style={{ border: "1px solid " + C.line, background: C.paper }}>
                <option value="">템플릿…</option>
                {allTpls.map((t) => <option key={t.tpl} value={t.tpl}>{t.name} ({t.tpl})</option>)}
              </select>
              <button onClick={pickManual} disabled={!mTpl} className="text-xs px-3 py-1 rounded-lg" style={{ background: mTpl ? C.ink : C.grayFill, color: "#fff", fontWeight: 700 }}>확정</button>
            </div>
            <textarea value={mP} onChange={(e) => setMP(e.target.value)} rows={6} className="w-full text-xs outline-none resize-none rounded-lg p-2" style={{ fontFamily: "monospace", background: C.grayTint, lineHeight: 1.5 }} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── 탭 3: 구멍 검사 ──
function HolesTab({ deck, onChange, say }) {
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(null);
  const [archived, setArchived] = useState([]);
  const [showArch, setShowArch] = useState(false);

  const holes = deck.holes;
  const done = holes.filter((h) => h.disposition).length;
  const typeName = (t) => (RULES.holes.types.find((x) => x.id === t) || {}).name || `유형 ${t}`;
  const rowLabel = (id) => { const r = deck.chain.find((x) => x.id === id); return r ? `${id}(${r.label || "무제"})` : `${id}(삭제된 줄)`; };

  async function scan() {
    if (deck.chain.length < 2) { say("체인을 먼저 작성하세요 (2줄 이상)"); return; }
    setBusy(true); setMissing(null);
    const ids = new Set(deck.chain.map((r) => r.id));
    const r = await callClaude(fill(PROMPTS.holeScan, { DEFINITION: defText(deck), CHAIN: chainText(deck) }), {
      maxTokens: 2000,
      validate: (o) => {
        if (Array.isArray(o.priorsMissing)) return [];
        if (!Array.isArray(o.holes)) return ["holes 형식"];
        for (const h of o.holes) {
          if (!(h.type >= 1 && h.type <= 6) || !Array.isArray(h.atIds) || !h.question || !h.fix) return ["holes 항목 형식"];
          if (!h.atIds.every((id) => ids.has(id))) return ["atIds가 체인 줄 id가 아님"];
        }
        return [];
      },
    });
    setBusy(false);
    if (!r.ok) { say(`검사 실패: ${r.error} — 재시도하거나 아래 유형학으로 수동 점검`); return; }
    if (r.data.priorsMissing) { setMissing(r.data.priorsMissing); return; }
    // 재검사 병합: (type + atIds) 매칭이면 처분·메모 이월, 미매칭 기존 항목은 보관
    const key = (h) => `${h.type}|${[...h.atIds].sort().join(",")}`;
    const oldByKey = new Map(holes.map((h) => [key(h), h]));
    const merged = r.data.holes.map((h, i) => {
      const old = oldByKey.get(key(h));
      oldByKey.delete(key(h));
      return {
        id: old?.id || "h" + Date.now().toString(36) + i,
        type: h.type, atIds: h.atIds, question: h.question, fix: h.fix,
        disposition: old?.disposition ?? null, memo: old?.memo ?? "", reason: old?.reason ?? "", stale: false,
      };
    });
    setArchived([...oldByKey.values()]);
    onChange({ ...deck, holes: merged, holesRunAt: Date.now() });
    say(`검출 ${merged.length}건 (처분 이월 ${merged.filter((h) => h.disposition).length}건)`);
  }

  function setHole(id, patch) {
    onChange({ ...deck, holes: holes.map((h) => (h.id === id ? { ...h, ...patch } : h)) });
  }
  function disposition(h, d) {
    if (d === "verbal" && !h.memo) { say("구두 대응은 예상 문답 메모가 필수입니다 (룰북 §7)"); }
    if (d === "reject" && !h.reason) { say("기각은 사유 기록이 필수입니다 (룰북 §7)"); }
    setHole(h.id, { disposition: h.disposition === d ? null : d });
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <button onClick={scan} disabled={busy} className="text-sm px-3 py-1.5 rounded-lg" style={{ background: busy ? C.grayFill : C.teal, color: "#fff", fontWeight: 700 }}>{busy ? "검사 중…" : holes.length ? "재검사 (AI)" : "구멍 검사 (AI)"}</button>
        {holes.length > 0 && (
          <span className="text-sm" style={{ color: C.gray }}>
            처분 {done}/{holes.length}
            <span className="inline-block ml-2 align-middle" style={{ width: 90, height: 8, background: C.grayTint, borderRadius: 4 }}>
              <span className="block" style={{ width: `${holes.length ? (done / holes.length) * 100 : 0}%`, height: 8, background: C.teal, borderRadius: 4 }} />
            </span>
          </span>
        )}
        <span className="text-xs ml-auto" style={{ color: C.gray }}>{RULES.holes.termination}</span>
      </div>

      {missing && (
        <div className="rounded-xl p-4 mb-3 text-sm" style={{ background: C.warnBg, color: C.warn }}>
          프라이어가 비어 있어 ①(프레임 충돌)·⑥(이해관계)를 검출할 수 없습니다 — 정의서 탭에서 {missing.map((m) => ({ a: "ⓐ", b: "ⓑ", c: "ⓒ" }[m] || m)).join("·")}를 먼저 채우세요. (룰북 §7: 검출은 프라이어를 입력한 만큼만)
        </div>
      )}

      {holes.length === 0 && !busy && (
        <div className="rounded-xl p-4 text-sm" style={{ background: C.card, border: "1px solid " + C.line, color: C.gray }}>
          <div className="mb-2" style={{ fontWeight: 700 }}>유형학 6종 (수동 점검용)</div>
          {RULES.holes.types.map((t) => <div key={t.id} className="mb-1">{t.id}. <b>{t.name}</b> — {t.test}</div>)}
        </div>
      )}

      <div className="grid gap-3">
        {holes.map((h) => (
          <div key={h.id} className="rounded-xl p-3" style={{ background: C.card, border: "1px solid " + (h.stale ? C.warn : C.line) }}>
            <div className="flex items-center gap-2 mb-1 text-sm">
              <b>{h.type}. {typeName(h.type)}</b>
              <span className="text-xs" style={{ color: C.gray }}>{h.atIds.map(rowLabel).join(", ")}</span>
              {h.stale && <span className="text-xs px-1.5 rounded" style={{ background: C.warnBg, color: C.warn }}>재검토 필요 (상위 단계 수정됨)</span>}
            </div>
            <div className="text-sm mb-1">예상 반문: “{h.question}”</div>
            <div className="text-sm mb-2" style={{ color: C.gray }}>보수안: {h.fix}</div>
            <div className="flex flex-wrap items-center gap-2">
              {RULES.holes.dispositions.map((d) => (
                <button key={d.id} onClick={() => disposition(h, d.id)} className="text-xs px-2.5 py-1 rounded-full"
                  style={{ border: "1px solid " + (h.disposition === d.id ? C.teal : C.line), background: h.disposition === d.id ? C.tealSoft : "transparent", color: h.disposition === d.id ? C.tealDark : C.ink, fontWeight: 700 }}>{d.name}</button>
              ))}
            </div>
            {h.disposition === "verbal" && (
              <textarea value={h.memo} onChange={(e) => setHole(h.id, { memo: e.target.value })} rows={2} placeholder="예상 문답 메모 (필수) — 방에서 이 반문이 나오면 이렇게 답한다"
                className="w-full text-sm outline-none resize-none rounded-lg p-2 mt-2" style={{ background: C.grayTint, lineHeight: 1.5 }} />
            )}
            {h.disposition === "reject" && (
              <textarea value={h.reason} onChange={(e) => setHole(h.id, { reason: e.target.value })} rows={2} placeholder="기각 사유 (필수)"
                className="w-full text-sm outline-none resize-none rounded-lg p-2 mt-2" style={{ background: C.grayTint, lineHeight: 1.5 }} />
            )}
          </div>
        ))}
      </div>

      {archived.length > 0 && (
        <div className="mt-3 text-xs" style={{ color: C.gray }}>
          <button onClick={() => setShowArch(!showArch)} style={{ textDecoration: "underline" }}>이전 검출 {archived.length}건 (재검사에서 미재현)</button>
          {showArch && archived.map((h, i) => <div key={i} className="mt-1">· {typeName(h.type)} — {h.question} {h.disposition ? `[${h.disposition}]` : ""}</div>)}
        </div>
      )}
    </div>
  );
}

// ── 탭 4: 내보내기 (deck-spec + 백업 + CDN 실험) ──
function ExportTab({ deck, say }) {
  const [withCover, setWithCover] = useState(true);
  const [coverP, setCoverP] = useState({ eyebrow: "", title: deck.title, subtitle: "", credit: "" });
  const [fileName, setFileName] = useState("");
  const [spec, setSpec] = useState("");
  const [imp, setImp] = useState("");
  const [cdnState, setCdnState] = useState("idle"); // idle | loading | ready | failed

  const notReady = deck.chain.filter((r) => r.status !== "form_ok");
  const undone = deck.holes.filter((h) => !h.disposition && !h.stale);

  function buildSpec() {
    const slides = [];
    if (withCover) slides.push({ id: "cover", template: "cover", p: { ...coverP, title: coverP.title || deck.title } });
    for (const r of deck.chain) {
      const s = {
        id: r.id,
        template: r.form?.tpl || "textgrid",
        label: r.label,
        head: { runs: parseHead(r.head), ...(r.sub ? { sub: r.sub } : {}) },
        p: r.form?.p || {},
      };
      if (r.form?.assumed) {
        s.assumed = true;
        s.footnote = "* 수치는 가정(예시) — 근거 작성 필요";
      }
      slides.push(s);
    }
    const out = {
      schemaVersion: "deck-spec/1",
      meta: {
        title: deck.title,
        deckLabel: deck.title,
        org: RULES.org,
        ...(deck.archetype?.id ? { archetype: deck.archetype.id } : {}),
        fileName: (fileName || deck.title.replace(/[\\/:*?"<>|\s]+/g, "_")) + ".pptx",
      },
      definition: { ...deck.definition, archetype: deck.archetype?.id },
      slides,
    };
    setSpec(JSON.stringify(out, null, 2));
    return out;
  }

  async function copySpec() {
    const text = spec || JSON.stringify(buildSpec(), null, 2);
    try { await navigator.clipboard.writeText(text); say("복사됨 — Claude Code에 붙여넣고 'npm run deck:build'를 요청하세요"); }
    catch { say("클립보드 실패 — 아래 텍스트를 직접 선택·복사하세요"); }
  }

  function downloadBackup() {
    const blob = new Blob([JSON.stringify(deck, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `deckboard-${deck.title}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  // ── [실험] 브라우저 pptx 생성 — CDN 로드 실패 시 조용히 숨김 (주 경로는 Claude Code 빌드) ──
  function loadCdn() {
    if (window.PptxGenJS) { setCdnState("ready"); return; }
    setCdnState("loading");
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/pptxgenjs@4.0.1/dist/pptxgen.bundle.js";
    const timer = setTimeout(() => { setCdnState("failed"); s.remove(); }, 8000);
    s.onload = () => { clearTimeout(timer); setCdnState(window.PptxGenJS ? "ready" : "failed"); };
    s.onerror = () => { clearTimeout(timer); setCdnState("failed"); };
    document.head.appendChild(s);
  }
  async function draftPptx() {
    try {
      const specObj = buildSpec();
      const pres = new window.PptxGenJS();
      pres.layout = "LAYOUT_WIDE";
      specObj.slides.forEach((s, i) => {
        const sl = pres.addSlide();
        if (s.template === "cover") {
          sl.background = { color: "0F1E5A" };
          sl.addText(s.p.title || "", { x: 0.9, y: 2.8, w: 11.5, h: 1, fontFace: "맑은 고딕", fontSize: 44, bold: true, color: "FFFFFF" });
          if (s.p.subtitle) sl.addText(s.p.subtitle, { x: 0.9, y: 3.9, w: 11.5, h: 0.5, fontFace: "맑은 고딕", fontSize: 16, color: "C7D2DC" });
          return;
        }
        sl.addText(s.label || "", { x: 0.4, y: 0.36, w: 9.6, h: 0.6, fontFace: "맑은 고딕", fontSize: 26, bold: true, color: "0F1E5A" });
        sl.addText(s.head.runs.map((r) => r.t).join(""), { x: 0.7, y: 1.3, w: 11.9, h: 0.6, fontFace: "맑은 고딕", fontSize: 18, bold: true, color: "1F2A44" });
        if (s.head.sub) sl.addText(s.head.sub, { x: 0.72, y: 1.95, w: 11.9, h: 0.35, fontFace: "맑은 고딕", fontSize: 12, color: "5A6472" });
        sl.addText(`[초안] 폼: ${s.template} — 정식 렌더는 Claude Code 빌드(deck:build)에서`, { x: 0.72, y: 3.4, w: 11.9, h: 0.5, fontFace: "맑은 고딕", fontSize: 12, color: "8A93A4", align: "center" });
        sl.addText(String(i + 1), { x: 12.5, y: 7.15, w: 0.5, h: 0.25, fontFace: "맑은 고딕", fontSize: 9, color: "8A93A4", align: "right" });
      });
      await pres.writeFile({ fileName: specObj.meta.fileName.replace(/\.pptx$/, "") + "_초안.pptx" });
      say("초안 pptx 다운로드됨 (레이아웃 없는 미리보기 수준)");
    } catch (e) {
      setCdnState("failed");
      say("브라우저 생성 실패 — Claude Code 경로를 사용하세요");
    }
  }

  return (
    <div>
      {(notReady.length > 0 || undone.length > 0) && (
        <div className="rounded-xl p-3 mb-3 text-sm" style={{ background: C.warnBg, color: C.warn }}>
          {notReady.length > 0 && <div>폼 미확정 {notReady.length}줄: {notReady.map((r) => r.id).join(", ")} — 미확정 줄은 textgrid 자리로 내보내지며 엔진 검증에서 걸립니다</div>}
          {undone.length > 0 && <div>미처분 구멍 {undone.length}건 — 처분(반영/구두/기각) 후 내보내기를 권장 (룰북 §7)</div>}
        </div>
      )}

      <div className="rounded-xl p-4 mb-4" style={{ background: C.card, border: "1px solid " + C.line }}>
        <div className="text-xs mb-2" style={{ color: C.gray, fontWeight: 700 }}>deck-spec 내보내기 — Claude Code 제작 경로 (ppt/CLAUDE.md)</div>
        <div className="flex flex-wrap items-center gap-3 mb-2 text-sm">
          <label className="flex items-center gap-1"><input type="checkbox" checked={withCover} onChange={(e) => setWithCover(e.target.checked)} /> 표지 포함</label>
          <input value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="파일명 (미입력 시 덱 제목)" className="text-sm outline-none px-2 py-1 rounded" style={{ background: C.grayTint, width: 220 }} />
          <button onClick={() => setSpec(JSON.stringify(buildSpec(), null, 2))} className="text-sm px-3 py-1.5 rounded-lg" style={{ border: "1px solid " + C.line }}>생성</button>
          <button onClick={copySpec} className="text-sm px-3 py-1.5 rounded-lg" style={{ background: C.ink, color: "#fff", fontWeight: 700 }}>복사</button>
        </div>
        {withCover && (
          <div className="grid grid-cols-2 gap-2 mb-2">
            {[["eyebrow", "아이브로우 (예: 이니셔티브 | 단계)"], ["title", "표지 제목"], ["subtitle", "부제"], ["credit", "작성 주체 · 연도"]].map(([k, ph]) => (
              <input key={k} value={coverP[k]} onChange={(e) => setCoverP({ ...coverP, [k]: e.target.value })} placeholder={ph} className="text-sm outline-none px-2 py-1 rounded" style={{ background: C.grayTint }} />
            ))}
          </div>
        )}
        {spec && <textarea readOnly value={spec} onFocus={(e) => e.target.select()} rows={12} className="w-full text-xs outline-none resize-none rounded-lg p-3" style={{ fontFamily: "monospace", background: C.grayTint, lineHeight: 1.5 }} />}
        <div className="text-xs mt-2" style={{ color: C.gray }}>
          붙여넣은 뒤 요청: “이 deck-spec으로 <b>npm run deck:validate → deck:build → deck:qa</b>를 실행하고 사다리 QA까지 보고해줘.” 가정 수치(assumed) 줄의 각주는 근거를 채워야 검증을 통과합니다.
        </div>
      </div>

      <div className="rounded-xl p-4 mb-4" style={{ background: C.card, border: "1px solid " + C.line }}>
        <div className="text-xs mb-2" style={{ color: C.gray, fontWeight: 700 }}>덱 백업 (storage는 이 브라우저·계정에 격리 — 중요한 덱은 백업)</div>
        <div className="flex gap-2 mb-2">
          <button onClick={downloadBackup} className="text-sm px-3 py-1.5 rounded-lg" style={{ border: "1px solid " + C.line }}>내려받기 (JSON)</button>
        </div>
        <textarea value={imp} onChange={(e) => setImp(e.target.value)} rows={2} placeholder="가져오기 — 백업 JSON을 붙여넣고 아래 버튼"
          className="w-full text-xs outline-none resize-none rounded-lg p-2" style={{ fontFamily: "monospace", background: C.grayTint }} />
        <button onClick={() => {
          try {
            const d = JSON.parse(imp);
            if (!d.id || !Array.isArray(d.chain)) throw new Error("형식");
            sSet(`deckboard:deck:${d.id}`, d).then(() => say("가져옴 — 목록에서 열 수 있습니다 (같은 id면 덮어씀)"));
            sGet(DECKS_KEY).then((list) => {
              const l = list || [];
              if (!l.some((x) => x.id === d.id)) sSet(DECKS_KEY, [{ id: d.id, title: d.title, createdAt: Date.now(), updatedAt: d.updatedAt || Date.now() }, ...l]);
            });
          } catch { say("가져오기 실패 — JSON 형식 확인"); }
        }} className="text-xs px-3 py-1 rounded-lg mt-1" style={{ border: "1px solid " + C.line }}>가져오기</button>
      </div>

      {cdnState !== "failed" && (
        <div className="rounded-xl p-4" style={{ background: C.card, border: "1px dashed " + C.line }}>
          <div className="text-xs mb-2" style={{ color: C.gray, fontWeight: 700 }}>[실험] 브라우저에서 초안 pptx 생성 — 정식 렌더 아님, CDN 차단 환경이면 자동으로 사라짐</div>
          {cdnState === "idle" && <button onClick={loadCdn} className="text-sm px-3 py-1.5 rounded-lg" style={{ border: "1px solid " + C.line }}>pptxgenjs 로드 시도</button>}
          {cdnState === "loading" && <span className="text-sm" style={{ color: C.gray }}>로드 중…</span>}
          {cdnState === "ready" && <button onClick={draftPptx} className="text-sm px-3 py-1.5 rounded-lg" style={{ background: C.teal, color: "#fff", fontWeight: 700 }}>초안 pptx 다운로드</button>}
        </div>
      )}
    </div>
  );
}
