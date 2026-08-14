/**
 * 덱보드 — PPT 파이프라인 1~4단계 운영 아티팩트 (정본 소스)
 *
 * ⚠ 이 파일은 정본 템플릿이다. 직접 claude.ai에 붙여넣지 말 것 —
 *   `npm run artifact:build`가 rules/prompts를 주입해 ../deckboard.jsx 를 생성하며, 그 파일을 붙여넣는다.
 *
 * 파이프라인: 정의서 → 체인(+고스트 뷰) → 구멍 검사 → (줄별) 폼 스터디 → 내보내기(deck-spec)
 * 제작(5)·QA(6)는 내보낸 deck-spec을 Claude Code에 붙여넣어 진행 (ppt/CLAUDE.md).
 *
 * 반영된 점검 픽스: F8(assumed 전파), F9(res.ok·타임아웃·재시도 1회·형태 검증·수동 경로),
 * F10(storage v2 — 줄 id·memo/reason·stale·updatedAt), F1(아키타입 결정표), F2(골격 프리셋).
 */
import { useState, useEffect, useRef } from "react";

// ── 조립 시 주입되는 정본 데이터 (rules/*.json + prompts/*.md) ──
const RULES = /*__RULES__*/ null /*__END_RULES__*/;
const PROMPTS = /*__PROMPTS__*/ null /*__END_PROMPTS__*/;

const MODEL = "claude-sonnet-4-6"; // 모델 교체는 이 상수 1곳 (구현 시점 재확인)
const DECKS_KEY = "deckboard:decks:v2";
const RUNS_KEY = "formstudy:runs:v2";
const RUNS_V1_KEY = "formstudy:runs:v1"; // 구 폼 스터디 아티팩트 기록 — v2가 비었을 때 1회 이월
const MIGRATE_CAP = 250; // 이월 상한 — 신규 기록 여유분을 남겨 첫 확정에서 300건 절삭이 터지지 않게 함
const CDN_SRCS = [
  "https://cdnjs.cloudflare.com/ajax/libs/pptxgenjs/4.0.1/pptxgen.bundle.js",
  "https://cdn.jsdelivr.net/npm/pptxgenjs@4.0.1/dist/pptxgen.bundle.js",
  "https://unpkg.com/pptxgenjs@4.0.1/dist/pptxgen.bundle.js",
];

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
  // 행두 접두 금지 — 엔진 textcheck.ts와 판정을 맞춘다 (없으면 덱보드는 통과시키고 deck:validate가 떨어뜨림)
  for (const p of st.symbols.banLinePrefix || []) {
    if (text.split("\n").some((ln) => ln.trimStart().startsWith(p))) issues.push({ sev: "error", msg: `줄머리 "${p.trim()}" 금지` });
  }
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

// ── 템플릿 분류 ──
// AI 후보는 관계어 사전(templates)에서만 — 파생·구조 장은 수동 경로 전용 (프롬프트에도 같은 제약이 주입돼 있다)
const AI_TPLS = new Set(RULES.relwords.templates.map((t) => t.tpl));
// 구조 장(표지·간지)은 본문 장의 폼이 아니다 — 체인 줄에 붙으면 엔진이 chrome·head를 건너뛰어 헤드가 사라진다
const MANUAL_TPLS = [...RULES.relwords.templates, ...RULES.relwords.derived.filter((d) => !d.structural)];
const tplName = (tpl) => (MANUAL_TPLS.find((t) => t.tpl === tpl) || {}).name || tpl;

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
    } else if (f.type === "perfRow[]") {
      // 표 행 — 셀은 string 또는 {t, tone?}, cells 수는 p.cols와 일치 (generic [] 폴백은 이걸 못 잡음)
      const cellOk = (cl) => (typeof cl === "string" ? cl.length > 0 : !!cl && typeof cl.t === "string" && cl.t.length > 0);
      if (!Array.isArray(v) || v.some((r) => !r || typeof r.l !== "string" || !r.l || !Array.isArray(r.cells) || !r.cells.every(cellOk))) return false;
      if (f.min && v.length < f.min) return false;
      if (f.max && v.length > f.max) return false;
      if (Array.isArray(p.cols) && v.some((r) => r.cells.length !== p.cols.length)) return false;
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

/** 폼 스터디 기록 로드 — v2가 비어 있으면 구 아티팩트의 v1을 1회 이월한다.
 *  ts 기준 dedupe라 조건이 깨져도(예: v2만 외부에서 지워짐) 중복이 쌓이지 않는다. */
async function loadRuns(onMigrate) {
  const v2 = (await sGet(RUNS_KEY)) || [];
  if (v2.length) return v2;
  const v1 = await sGet(RUNS_V1_KEY);
  if (!Array.isArray(v1) || !v1.length) return v2;
  const seen = new Set(v2.map((r) => r.ts));
  const add = v1
    .filter((r) => r && r.ts && !seen.has(r.ts))
    .slice(0, MIGRATE_CAP)
    .map((r) => ({
      ts: r.ts, deckId: null, rowId: null,
      msg: r.msg || "", ctx: "",
      rel: r.rel || "", cands: Array.isArray(r.cands) ? r.cands : [],
      pick: r.pick || "",
      p: null,          // v1은 파라미터를 저장하지 않았다 — 제작 지시서 복원 불가
      assumed: null,    // 미상 (false로 단정하지 않는다)
      from: "v1",
    }));
  if (!add.length) return v2;
  const merged = [...v2, ...add];
  await sSet(RUNS_KEY, merged);
  if (onMigrate) onMigrate(add.length);
  return merged;
}

/** 승률 사전 — pick 빈도 상위 N (v1 이월분 포함) */
function pickCounts(runs) {
  const c = {};
  for (const r of runs) if (r.pick) c[r.pick] = (c[r.pick] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]);
}

/** 저장된 덱을 화면이 가정하는 형태로 보정 — 결손 필드로 인한 런타임 크래시(흰 화면) 방지 */
function normalizeDeck(d) {
  if (!d || typeof d !== "object" || !d.id) return null;
  const def = d.definition && typeof d.definition === "object" ? d.definition : {};
  const pr = def.priors && typeof def.priors === "object" ? def.priors : {};
  const chain = Array.isArray(d.chain) ? d.chain : [];
  return {
    ...d,
    schemaVersion: 2,
    title: typeof d.title === "string" && d.title ? d.title : "제목 없는 덱",
    definition: {
      q1: def.q1 || "", q2: def.q2 || "", q3: def.q3 || "", q4: def.q4 || "", q5: def.q5 || "",
      priors: { seen: pr.seen || "", criteria: pr.criteria || "", losers: pr.losers || "" },
    },
    archetype: d.archetype && d.archetype.id ? d.archetype : null,
    chain: chain.filter((r) => r && r.id).map((r) => ({
      id: r.id, label: r.label || "", head: r.head || "", sub: r.sub || "",
      status: ["draft", "msg_ok", "form_ok"].includes(r.status) ? r.status : "draft",
      form: r.form && r.form.tpl ? r.form : null,
    })),
    nextRowId: typeof d.nextRowId === "number" ? d.nextRowId : chain.length + 1,
    holes: (Array.isArray(d.holes) ? d.holes : []).filter((h) => h && h.id).map((h) => ({
      ...h, atIds: Array.isArray(h.atIds) ? h.atIds : [],
      memo: h.memo || "", reason: h.reason || "", stale: !!h.stale,
      disposition: ["apply", "verbal", "reject"].includes(h.disposition) ? h.disposition : null,
    })),
    archivedHoles: Array.isArray(d.archivedHoles) ? d.archivedHoles : [],
    holesRunAt: d.holesRunAt || 0,
  };
}

/** 처분이 룰북 §7의 필수 입력(구두=메모, 기각=사유)까지 채워졌는가 */
const holeSettled = (h) =>
  !!h.disposition &&
  !(h.disposition === "verbal" && !h.memo.trim()) &&
  !(h.disposition === "reject" && !h.reason.trim());

/** 재검토 대상이 아닌(=fresh) 구멍이 하나라도 있는가 — 정의서 수정 시 stale 표시 여부 판정 */
const anyFresh = (holes) => holes.some((h) => !h.stale);

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
function SkOptionTable({ p }) {
  const cr = (p.criteria || []).slice(0, 5), ops = (p.options || []).slice(0, 4);
  const nameW = 110, colW = (330 - 0) / Math.max(cr.length, 1), x0 = 28, y0 = 66, hh = 26, rh = Math.min(40, 160 / Math.max(ops.length, 1));
  const mc = (t) => (t && t.startsWith("○") ? C.teal : t && t.startsWith("✕") ? C.err : C.ink);
  return (<g>
    <rect x={x0} y={y0} width={nameW + cr.length * colW} height={hh} fill={C.ink} />
    <text x={x0 + nameW / 2} y={y0 + 17} fontSize="10" fill="#fff" textAnchor="middle" fontWeight="700">대안</text>
    {cr.map((t, j) => <text key={j} x={x0 + nameW + j * colW + colW / 2} y={y0 + 17} fontSize="10" fill="#fff" textAnchor="middle" fontWeight="700">{trunc(t, 6)}</text>)}
    {ops.map((o, i) => (<g key={i}>
      <rect x={x0} y={y0 + hh + i * rh} width={nameW + cr.length * colW} height={rh} fill={o.hi ? C.tealSoft : i % 2 ? C.grayTint : C.card} stroke={C.line} />
      <text x={x0 + 6} y={y0 + hh + i * rh + rh / 2 + 4} fontSize="10.5" fontWeight="700" fill={o.hi ? C.tealDark : C.ink}>{trunc(o.name, 9)}</text>
      {(o.cells || []).slice(0, cr.length).map((cell, j) => (
        <text key={j} x={x0 + nameW + j * colW + colW / 2} y={y0 + hh + i * rh + rh / 2 + 4} fontSize="10.5" fontWeight="700" fill={mc(cell)} textAnchor="middle">{trunc(cell, 5)}</text>
      ))}
    </g>))}
  </g>);
}
function SkKpi({ p }) {
  const tiles = (p.tiles || []).slice(0, 4), n = Math.max(tiles.length, 1), w = (432 - (n - 1) * 12) / n;
  return (<g>{tiles.map((t, i) => {
    const x = 24 + i * (w + 12);
    return (<g key={i}>
      <rect x={x} y="90" width={w} height="110" rx="8" fill={C.card} stroke={C.line} />
      <text x={x + 10} y="112" fontSize="10" fontWeight="700" fill={C.gray}>{trunc(t.label, 10)}</text>
      <text x={x + 10} y="150" fontSize="24" fontWeight="700" fill={C.ink}>{trunc(String(t.value), 8)}</text>
      {t.delta && <text x={x + 10} y="176" fontSize="11" fontWeight="700" fill={t.tone === "problem" ? C.err : C.teal}>{trunc(t.delta, 12)}</text>}
    </g>);
  })}</g>);
}
function SkRoadmap({ p }) {
  const cols = (p.cols || []).slice(0, 6), lanes = (p.lanes || []).slice(0, 4);
  const nameW = 80, colW = 352 / Math.max(cols.length, 1), x0 = 28, y0 = 70, lh = Math.min(42, 150 / Math.max(lanes.length, 1));
  return (<g>
    {cols.map((t, j) => (<g key={j}>
      <text x={x0 + nameW + j * colW + colW / 2} y={y0} fontSize="10" fontWeight="700" fill={C.gray} textAnchor="middle">{trunc(t, 7)}</text>
      <line x1={x0 + nameW + j * colW} y1={y0 + 8} x2={x0 + nameW + j * colW} y2={y0 + 8 + lanes.length * lh} stroke={C.line} />
    </g>))}
    {lanes.map((l, i) => (<g key={i}>
      <text x={x0} y={y0 + 8 + i * lh + lh / 2 + 4} fontSize="10.5" fontWeight="700" fill={C.ink}>{trunc(l.name, 8)}</text>
      {(l.bars || []).map((b, j) => (
        <rect key={j} x={x0 + nameW + (b.from || 0) * colW + 3} y={y0 + 8 + i * lh + lh / 2 - 8}
          width={Math.max(((b.to ?? b.from ?? 0) - (b.from || 0) + 1) * colW - 6, 10)} height="16" rx="5" fill={C.tealSoft} stroke={C.teal} />
      ))}
    </g>))}
  </g>);
}
function SkWaterfall({ p }) {
  const start = p.start || { l: "", v: 0 }, deltas = (p.deltas || []).slice(0, 6);
  const levels = [start.v || 0];
  deltas.forEach((d) => levels.push(levels[levels.length - 1] + (d.v || 0)));
  const total = levels[levels.length - 1];
  const maxV = Math.max(start.v || 0, total, ...levels, 1);
  const n = deltas.length + 2, slot = 432 / n, bw = Math.min(46, slot * 0.6);
  const Y = (v) => 210 - (v / maxV) * 120;
  const bar = (i, v0, v1, color, label) => {
    const yT = Math.min(Y(v0), Y(v1)), h = Math.max(Math.abs(Y(v1) - Y(v0)), 3), x = 24 + i * slot + (slot - bw) / 2;
    return (<g key={"b" + i}>
      <rect x={x} y={yT} width={bw} height={h} fill={color} />
      <text x={x + bw / 2} y="228" fontSize="9.5" fill={C.ink} textAnchor="middle">{trunc(label, 6)}</text>
    </g>);
  };
  return (<g>
    <line x1="24" y1="210" x2="456" y2="210" stroke={C.gray} strokeWidth="0.8" />
    {bar(0, 0, start.v || 0, C.grayFill, start.l)}
    {deltas.map((d, i) => bar(i + 1, levels[i], levels[i + 1], (d.v || 0) >= 0 ? C.teal : C.gray, d.l))}
    {bar(n - 1, 0, total, C.ink, (p.end || {}).l || "계")}
  </g>);
}
function SkCycle({ p }) {
  const st = (p.steps || []).slice(0, 5), n = Math.max(st.length, 1);
  return (<g>
    {st.map((s, i) => {
      const a = (-90 + (360 / n) * i) * (Math.PI / 180);
      const x = 240 + 150 * Math.cos(a), y = 150 + 72 * Math.sin(a);
      return (<g key={i}>
        <rect x={x - 46} y={y - 15} width="92" height="30" rx="7" fill={C.tealSoft} stroke={C.teal} />
        <text x={x} y={y + 4} fontSize="10.5" fontWeight="700" fill={C.tealDark} textAnchor="middle">{trunc(s, 8)}</text>
      </g>);
    })}
    {p.center && (<g><circle cx="240" cy="150" r="30" fill={C.ink} /><text x="240" y="154" fontSize="11" fontWeight="700" fill="#fff" textAnchor="middle">{trunc(p.center, 5)}</text></g>)}
  </g>);
}
function SkStacked({ p }) {
  const bars = (p.bars || []).slice(0, 4), n = Math.max(bars.length, 1);
  const cols = [C.teal, "#7FB8AD", C.grayFill, C.grayTint, "#D8CFA8"];
  return (<g>
    <line x1="60" y1="218" x2="420" y2="218" stroke={C.gray} strokeWidth="0.8" />
    {bars.map((b, i) => {
      const total = (b.parts || []).reduce((a, x) => a + (x.v || 0), 0) || 1;
      const x = 80 + i * (300 / n);
      let y = 218;
      return (<g key={i}>
        {(b.parts || []).map((pt, j) => {
          const h = ((pt.v || 0) / total) * 130;
          y -= h;
          return <rect key={j} x={x} y={y} width="44" height={h} fill={cols[j % cols.length]} stroke="#fff" strokeWidth="0.8" />;
        })}
        <text x={x + 22} y="234" fontSize="10" fontWeight="700" fill={C.ink} textAnchor="middle">{trunc(b.l, 6)}</text>
      </g>);
    })}
    {(bars[0]?.parts || []).map((pt, j) => (
      <text key={j} x="72" y={100 + j * 14} fontSize="9" fill={C.gray} textAnchor="end">{trunc(pt.name, 7)}</text>
    ))}
  </g>);
}

function SkGridTable({ p, head }) {
  const cols = (p.cols || []).slice(0, 6), rows = (p.rows || []).slice(0, 7);
  const labelW = 96, colW = 330 / Math.max(cols.length, 1), x0 = 28, y0 = 60, hh = 24, rh = Math.min(32, 176 / Math.max(rows.length, 1));
  const cellT = (cl) => (typeof cl === "string" ? cl : (cl || {}).t || "");
  const cellTone = (cl) => (cl && typeof cl === "object" && cl.tone ? cl.tone : null);
  const toneColor = (tone) => (tone === "problem" ? C.err : tone === "legacy" || tone === "legacyDark" ? C.gray : C.tealDark);
  return (<g>
    {p.unit && <text x={x0 + labelW + cols.length * colW} y={y0 - 6} fontSize="9" fill={C.gray} textAnchor="end">{trunc(p.unit, 12)}</text>}
    <rect x={x0} y={y0} width={labelW} height={hh} fill={C.ink} />
    <text x={x0 + labelW / 2} y={y0 + 16} fontSize="10" fill="#fff" textAnchor="middle" fontWeight="700">{head}</text>
    {cols.map((t, j) => (<g key={j}>
      <rect x={x0 + labelW + j * colW} y={y0} width={colW} height={hh} fill={j === p.hiCol ? C.teal : C.ink} />
      <text x={x0 + labelW + j * colW + colW / 2} y={y0 + 16} fontSize="10" fill="#fff" textAnchor="middle" fontWeight="700">{trunc(t, 6)}</text>
    </g>))}
    {rows.map((r, i) => (<g key={i}>
      <rect x={x0} y={y0 + hh + i * rh} width={labelW} height={rh} fill={r.hi ? C.tealSoft : C.grayTint} stroke={C.line} />
      <text x={x0 + 6} y={y0 + hh + i * rh + rh / 2 + 4} fontSize="10" fontWeight="700" fill={r.hi ? C.tealDark : C.ink}>{trunc(r.l, 8)}</text>
      {(r.cells || []).slice(0, cols.length).map((cl, j) => {
        const tone = cellTone(cl);
        return (<g key={j}>
          <rect x={x0 + labelW + j * colW} y={y0 + hh + i * rh} width={colW} height={rh} fill={r.hi || j === p.hiCol ? C.tealSoft : C.card} stroke={C.line} />
          <text x={x0 + labelW + j * colW + colW / 2} y={y0 + hh + i * rh + rh / 2 + 4} fontSize="10" fontWeight={tone ? "700" : "400"} fill={tone ? toneColor(tone) : C.ink} textAnchor="middle">{trunc(cellT(cl), 7)}</text>
        </g>);
      })}
    </g>))}
  </g>);
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
    else if (tpl === "option_table") body = <SkOptionTable p={p} />;
    else if (tpl === "kpi_tiles") body = <SkKpi p={p} />;
    else if (tpl === "roadmap") body = <SkRoadmap p={p} />;
    else if (tpl === "waterfall") body = <SkWaterfall p={p} />;
    else if (tpl === "cycle") body = <SkCycle p={p} />;
    else if (tpl === "stacked") body = <SkStacked p={p} />;
    else if (tpl === "perf_table") body = <SkGridTable p={p} head="지표" />;
    else if (tpl === "compare_table") body = <SkGridTable p={p} head="구분" />;
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
  const deckRef = useRef(deck);
  deckRef.current = deck;

  async function persist(next, opts = {}) {
    const now = Date.now();
    if (!opts.force) {
      const stored = await sGet(`deckboard:deck:${next.id}`);
      if (stored && (stored.updatedAt || 0) !== loadedAtRef.current) { setConflict(true); return; }
    }
    const withMeta = { ...next, schemaVersion: 2, rulesVersion: RULES.version, updatedAt: now };
    const ok = await sSet(`deckboard:deck:${next.id}`, withMeta);
    if (!ok) { say("저장 실패 — storage 사용 불가 환경 (백업 내려받기를 사용하세요)"); return; }
    // 저장 중(await 구간)에 새 편집이 들어왔으면 dirty를 내리지 않는다 —
    // 내리면 다음 디바운스가 "변경 없음"으로 보고 마지막 편집을 조용히 버린다
    if (deckRef.current === next) dirtyRef.current = false;
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
    const raw = await sGet(`deckboard:deck:${id}`);
    const d = normalizeDeck(raw);
    if (!d) { say("덱을 불러오지 못함 (손상되었거나 형식이 다름)"); return; }
    dirtyRef.current = false;
    setDeck(d); setLoadedAt(raw.updatedAt || 0); setConflict(false); setTab("def");
  }

  /** 가져오기·복원 공통 — 목록 state까지 갱신해야 이후 저장이 목록을 덮어쓰며 덱을 지우지 않는다 */
  async function adoptDeck(raw) {
    const d = normalizeDeck(raw);
    if (!d) { say("가져오기 실패 — 덱 형식이 아닙니다"); return; }
    const now = d.updatedAt || Date.now();
    const ok = await sSet(`deckboard:deck:${d.id}`, { ...d, updatedAt: now });
    if (!ok) { say("가져오기 실패 — storage 사용 불가 환경"); return; }
    const cur = decksRef.current || [];
    const list = cur.some((x) => x.id === d.id)
      ? cur.map((x) => (x.id === d.id ? { ...x, title: d.title, updatedAt: now } : x))
      : [{ id: d.id, title: d.title, createdAt: now, updatedAt: now }, ...cur];
    setDecks(list);
    await sSet(DECKS_KEY, list);
    say(`가져왔습니다: ${d.title} (목록에서 열 수 있습니다)`);
  }

  async function newDeck() {
    const id = uid("d");
    const d = {
      id, schemaVersion: 2, rulesVersion: RULES.version, title: "새 덱", updatedAt: Date.now(),
      definition: { q1: "", q2: "", q3: "", q4: "", q5: "", priors: { seen: "", criteria: "", losers: "" } },
      archetype: null, chain: [], nextRowId: 1, holes: [], archivedHoles: [], holesRunAt: 0,
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
            onImport={adoptDeck}
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

function DeckScreen({ deck, tab, setTab, onBack, onChange, onImport, say }) {
  const staleHoles = deck.holes.filter((h) => h.stale).length;
  const undone = deck.holes.filter((h) => !holeSettled(h)).length;
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
      {tab === "export" && <ExportTab deck={deck} say={say} onImport={onImport} />}
    </div>
  );
}

/** 정의서 문항 입력칸 — 반드시 모듈 스코프에 둘 것.
 *  컴포넌트를 부모 본문 안에서 정의하면 렌더마다 타입 정체성이 바뀌어 React가 서브트리를
 *  언마운트·재마운트하고, textarea의 포커스·커서·한글 조합 상태가 글자마다 날아간다.
 *  주의: onChange에 trim·정규화를 넣으면 제어 컴포넌트 커서가 튄다 — 값은 그대로 통과시킬 것. */
function DefField({ value, onChange, label, hint, tall }) {
  return (
    <div className="mb-3">
      <div className="text-xs mb-1" style={{ color: C.gray, fontWeight: 700 }}>{label}</div>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={tall ? 3 : 2}
        placeholder={hint} className="w-full text-sm outline-none resize-none rounded-lg p-3" style={{ background: C.card, border: "1px solid " + C.line, lineHeight: 1.6 }} />
    </div>
  );
}

// ── 탭 1: 정의서 ──
function DefTab({ deck, onChange, say }) {
  const d = deck.definition;
  const [ping, setPing] = useState("");
  const sug = suggestArchetype(d.q1);

  /** 정의서 변경의 단일 통로 — 값이 실제로 바뀔 때만 구멍 검사 결과를 재검토 대상으로 표시한다.
   *  blur가 아니라 변경 시점에 판정하므로 (a) 무변경 포커스 통과로 인한 오탐이 없고
   *  (b) blur 없이 탭을 벗어나도 표시를 놓치지 않는다. */
  const applyDef = (patch, extra = {}) => {
    const changed = Object.entries(patch).some(([k, v]) => d[k] !== v);
    const needStale = changed && anyFresh(deck.holes);
    if (needStale) say("정의서를 고쳤습니다 — 구멍 검사 결과가 재검토 대상이 됩니다");
    if (!changed && !Object.keys(extra).length) return; // 새 객체를 만들지 않음 → 불필요한 저장 방지
    onChange({
      ...deck,
      definition: { ...d, ...patch },
      ...(needStale ? { holes: deck.holes.map((h) => ({ ...h, stale: true })) } : {}),
      ...extra,
    });
  };
  const setPrior = (k, v) => {
    if (d.priors[k] === v) return;
    const needStale = anyFresh(deck.holes);
    if (needStale) say("프라이어를 고쳤습니다 — 구멍 검사 결과가 재검토 대상이 됩니다");
    onChange({
      ...deck,
      definition: { ...d, priors: { ...d.priors, [k]: v } },
      ...(needStale ? { holes: deck.holes.map((h) => ({ ...h, stale: true })) } : {}),
    });
  };
  // 아키타입은 골격·프롬프트 컨텍스트에 들어가므로 정의서 변경에 준해 취급한다
  const pickArch = (id, source) => {
    if (deck.archetype?.id === id && deck.archetype?.source === source) return;
    const needStale = anyFresh(deck.holes);
    onChange({
      ...deck,
      archetype: { id, source },
      ...(needStale ? { holes: deck.holes.map((h) => ({ ...h, stale: true })) } : {}),
    });
  };

  async function testConnection() {
    setPing("확인 중…");
    const r = await callClaude('JSON으로만 답하라: {"ok":true}', { validate: (o) => (o.ok === true ? [] : ["형식 불일치"]), maxTokens: 24, retries: 0 });
    setPing(r.ok ? "정상 — Claude 호출 가능" : `실패: ${r.error} (모델명·네트워크 확인)`);
  }

  const Q = (k, label, hint, tall) => (
    <DefField key={k} value={d[k]} onChange={(v) => applyDef({ [k]: v })} label={label} hint={hint} tall={tall} />
  );

  return (
    <div>
      <div className="rounded-xl p-4 mb-4" style={{ background: C.card, border: "1px solid " + C.line }}>
        <div className="text-xs mb-2" style={{ color: C.gray, fontWeight: 700 }}>Q1. 이 자리가 끝났을 때 방이 무엇을 하기를 원하는가</div>
        <div className="flex flex-wrap gap-2 mb-2">
          {Object.keys(RULES.archetypes.decisionTable).map((k) => (
            <button key={k} onClick={() => {
              const s = suggestArchetype(k);
              const auto = s && (!deck.archetype || deck.archetype.source === "auto");
              // Q1 변경과 아키타입 자동 제안을 한 번에 반영 (두 번 onChange하면 앞의 것이 덮인다)
              applyDef({ q1: k }, auto ? { archetype: { id: s.id, source: "auto" } } : {});
            }}
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
      {Q("q2", "Q2. 그렇게 하려면 그들이 무엇을 믿어야 하는가 (한 문장, governing thought)", "예: 건강 반응형 정기보험은 소규모 파일럿으로 검증할 가치가 있다")}
      {Q("q3", "Q3. 지금 그들이 그걸 믿지 않는 이유는 (저항 순서 = 본론 구간 배열)", "저항 1 → 저항 2 → 저항 3 (순서대로)", true)}
      {Q("q4", "Q4. 각 저항을 무너뜨리는 가장 강한 근거 하나 (저항당 하나, 쌓지 말 것)", "", true)}
      {Q("q5", "Q5. 이번에 다루지 않을 것", "")}
      <div className="rounded-xl p-4 mb-4" style={{ background: C.card, border: "1px solid " + C.line }}>
        <div className="text-xs mb-2" style={{ color: C.gray, fontWeight: 700 }}>오디언스 프라이어 (구멍 검사 ①⑥은 여기 입력한 만큼만 검출됨)</div>
        {[["seen", "ⓐ 이 방이 최근 본 관련 보고·장표"], ["criteria", "ⓑ 이 방의 평가 기준·KPI"], ["losers", "ⓒ 이 안이 통과되면 누가 무엇을 잃는가"]].map(([k, label]) => (
          <div key={k} className="mb-2">
            <div className="text-xs mb-1" style={{ color: C.gray }}>{label}</div>
            <textarea value={d.priors[k]} onChange={(e) => setPrior(k, e.target.value)} rows={2}
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
    const add = arch.skeleton.filter((s) => !rows.some((r) => r.label === s.label)).map((s) => ({ id: "c" + nid++, label: s.label, head: "", sub: "", status: "draft", form: null }));
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
    // 체인 순서는 논증 순서 그 자체 — 링크 기반 구멍(비약·내부 충돌 등)은 재검토 대상이 된다
    setRows(next, deck.holes.length ? { holes: deck.holes.map((h) => ({ ...h, stale: true })) } : {});
  }

  /** 폼 스터디 진입 가드 — 빈 헤드는 차단(널 입력이라 분석 대상이 없음), draft는 모달 안 배너로 경고 후 진행 */
  function openStudy(r) {
    if (!stripHl(r.head).trim()) {
      say("헤드메시지를 먼저 작성하세요 — 폼 스터디는 메시지의 관계어에서 형태를 고릅니다 (룰북 §8)");
      return;
    }
    setStudyRow(r);
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
        {rows.map((r, i) => <ChainRow key={r.id} r={r} i={i} deck={deck} onEdit={editRow} onDel={delRow} onMove={move} onStudy={() => openStudy(r)} />)}
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
  const hasHead = !!stripHl(r.head).trim();
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
        {r.status === "draft" && stripHl(r.head).trim() && !headIssues.some((x) => x.sev === "error") && (
          <button className="text-xs px-2 py-1 rounded" style={{ border: "1px solid " + C.line }} onClick={() => onEdit(r.id, { status: "msg_ok" })}>메시지 확정</button>
        )}
        <button className="text-xs px-2 py-1 rounded" title={hasHead ? "" : "헤드메시지를 먼저 입력하세요"}
          style={{ background: r.form ? C.tealSoft : "transparent", border: "1px solid " + (r.form ? C.teal : C.line), color: r.form ? C.tealDark : C.ink, fontWeight: 700, opacity: hasHead ? 1 : 0.45 }} onClick={onStudy}>
          {r.form ? `폼: ${tplName(r.form.tpl)}` : "폼 스터디"}
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
  const [note, setNote] = useState("");   // 모달 로컬 메시지 — 토스트는 오버레이 뒤에 가려 안 보인다
  const [stats, setStats] = useState(null);

  const msg = stripHl(row.head);
  const ctx = `${deck.title} · ${archName(deck.archetype?.id) || ""}`;

  useEffect(() => {
    // 이미 폼이 확정된 줄은 재진입 시 자동 분석하지 않는다 — 확인만 하려던 클릭이 30초 API 호출이 되던 문제
    if (!row.form) analyze();
    loadRuns((n) => setNote(`구 폼 스터디 기록 ${n}건을 이월했습니다 (파라미터·가정 여부는 미상)`)).then((rs) => setStats(pickCounts(rs)));
    /* eslint-disable-next-line */
  }, []);

  async function analyze() {
    if (busy) return; // 중복 호출 방지 (구 아티팩트에 있던 가드가 이관 중 빠져 있었다)
    setBusy(true); setErr(null); setRun(null);
    const r = await callClaude(fill(PROMPTS.formStudy, { MESSAGE: msg, CONTEXT: ctx }), {
      maxTokens: 2000,
      validate: (o) => {
        if (!Array.isArray(o.cands)) return ["cands 형식"];
        // AI 후보는 관계어 사전 15종으로 제한 — 파생·구조 장은 수동 경로 전용
        const good = o.cands.filter((cd) => cd && cd.tpl && AI_TPLS.has(cd.tpl) && validP(cd.tpl, cd.p));
        if (!good.length) {
          const off = o.cands.filter((cd) => cd?.tpl && !AI_TPLS.has(cd.tpl)).map((cd) => cd.tpl);
          return [off.length ? `사전 외 템플릿만 반환됨: ${off.join(", ")} (파생 템플릿은 수동 경로 전용)` : "유효 후보 없음 (p 형태 검증 실패)"];
        }
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
    const list = await loadRuns();
    list.unshift(rec);
    if (list.length > 300) { list.length = 300; setNote("기록 300건 초과 — 오래된 기록을 정리했습니다"); }
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
    try { p = JSON.parse(mP); } catch { setNote("p JSON 파싱 실패 — 따옴표·쉼표를 확인하세요"); return; }
    if (!validP(mTpl, p)) { setNote(`p가 ${tplName(mTpl)}의 형태 계약(pSpec)에 맞지 않습니다`); return; }
    pick({ tpl: mTpl, p, assumed: false });
  }

  const allTpls = MANUAL_TPLS;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto py-8" style={{ background: "rgba(20,24,28,.5)" }}
      onClick={() => { if (!busy) onClose(); }}>
      <div className="rounded-2xl p-5 w-full" style={{ maxWidth: 720, background: C.paper }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm" style={{ fontWeight: 800 }}>폼 스터디 — {row.id} {row.label}</div>
          <button onClick={onClose} className="text-sm px-2" style={{ color: C.gray }}>닫기 ✕</button>
        </div>
        <div className="text-base mb-3" style={{ fontWeight: 700 }}>{msg}</div>

        {row.status === "draft" && (
          <div className="text-sm px-4 py-2 rounded-lg mb-3" style={{ background: C.warnBg, color: C.warn }}>
            메시지가 아직 확정되지 않은 줄입니다 — 폼을 먼저 고르면 이후 헤드를 수정할 때 폼 확정이 해제됩니다 (파이프라인 §1)
          </div>
        )}
        {note && (
          <div className="text-sm px-4 py-2 rounded-lg mb-3 flex items-center gap-2" style={{ background: C.grayTint, color: C.ink }}>
            <span className="flex-1">{note}</span>
            <button onClick={() => setNote("")} className="text-xs px-2" style={{ color: C.gray }}>✕</button>
          </div>
        )}
        {row.form && !run && !busy && (
          <div className="rounded-xl p-3 mb-3" style={{ background: C.card, border: "1px solid " + C.teal }}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm"><b>현재 폼: {tplName(row.form.tpl)}</b>{row.form.assumed && <span className="text-xs ml-2 px-1.5 rounded" style={{ background: C.warnBg, color: C.warn }}>가정 수치 포함</span>}</div>
              <button onClick={analyze} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: C.teal, color: "#fff", fontWeight: 700 }}>다시 분석 (AI)</button>
            </div>
            <Sketch tpl={row.form.tpl} p={row.form.p} title={msg} />
          </div>
        )}

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
                      <b>{tplName(cd.tpl)}</b>
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

        {stats && stats.length > 0 && (
          <div className="mt-4">
            <div className="text-xs mb-2" style={{ color: C.gray, fontWeight: 700 }}>이기는 형태 — 지금까지의 선택 누적 (승률 사전)</div>
            <div className="grid gap-1">
              {stats.slice(0, 5).map(([tpl, n]) => (
                <div key={tpl} className="flex items-center gap-2 text-xs">
                  <span style={{ width: 96 }}>{tplName(tpl)}</span>
                  <span className="flex-1" style={{ background: C.grayTint, borderRadius: 4, height: 8 }}>
                    <span className="block" style={{ width: `${(n / stats[0][1]) * 100}%`, height: 8, background: C.teal, borderRadius: 4 }} />
                  </span>
                  <span style={{ color: C.gray, width: 18, textAlign: "right" }}>{n}</span>
                </div>
              ))}
            </div>
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
  const [showArch, setShowArch] = useState(false);

  const holes = deck.holes;
  const archived = deck.archivedHoles || [];
  const done = holes.filter(holeSettled).length;
  const typeName = (t) => (RULES.holes.types.find((x) => x.id === t) || {}).name || `유형 ${t}`;
  const rowLabel = (id) => { const r = deck.chain.find((x) => x.id === id); return r ? `${id}(${r.label || "무제"})` : `${id}(삭제된 줄)`; };

  async function scan() {
    if (deck.chain.length < 2) { say("체인을 먼저 작성하세요 (2줄 이상)"); return; }
    setBusy(true); setMissing(null);
    const ids = new Set(deck.chain.map((r) => r.id));
    const r = await callClaude(fill(PROMPTS.holeScan, { DEFINITION: defText(deck), CHAIN: chainText(deck) }), {
      maxTokens: 2000,
      validate: (o) => {
        // 빈 배열은 "프라이어 부족"이 아니다 — []로 통과시키면 아래에서 holes를 통째로 버린다
        if (Array.isArray(o.priorsMissing) && o.priorsMissing.length) return [];
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
    if (r.data.priorsMissing?.length) { setMissing(r.data.priorsMissing); return; }
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
    // 미재현 항목은 처분·메모가 붙어 있을 수 있으므로 덱에 보존한다 (화면 로컬 state면 탭 이동에 소실)
    const dropped = [...oldByKey.values()].filter((h) => h.disposition || h.memo || h.reason);
    onChange({
      ...deck, holes: merged, holesRunAt: Date.now(),
      archivedHoles: [...dropped, ...(deck.archivedHoles || [])].slice(0, 100),
    });
    say(`검출 ${merged.length}건 (처분 이월 ${merged.filter((h) => h.disposition).length}건${dropped.length ? `, 미재현 보관 ${dropped.length}건` : ""})`);
  }

  function setHole(id, patch) {
    onChange({ ...deck, holes: holes.map((h) => (h.id === id ? { ...h, ...patch } : h)) });
  }
  function disposition(h, d) {
    // 필수 입력(구두=메모, 기각=사유)은 클릭 시점이 아니라 holeSettled로 판정한다 —
    // 입력란은 이 클릭으로 비로소 나타나므로 여기서 경고하면 항상 뜨는 무의미한 알림이 된다
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
              {h.disposition && !holeSettled(h) && (
                <span className="text-xs px-2 py-0.5 rounded" style={{ background: C.warnBg, color: C.warn }}>
                  {h.disposition === "verbal" ? "예상 문답 메모 필요 (룰북 §7)" : "기각 사유 필요 (룰북 §7)"}
                </span>
              )}
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
          <button onClick={() => setShowArch(!showArch)} style={{ textDecoration: "underline" }}>이전 검출 {archived.length}건 (재검사에서 미재현, 처분 기록 보존)</button>
          {showArch && archived.map((h, i) => (
            <div key={i} className="mt-1">
              · {typeName(h.type)}: {h.question} {h.disposition ? `[${h.disposition}]` : ""}
              {h.memo ? ` 메모: ${h.memo}` : ""}{h.reason ? ` 사유: ${h.reason}` : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 탭 4: 내보내기 (deck-spec + 백업 + CDN 실험) ──
function ExportTab({ deck, say, onImport }) {
  const [withCover, setWithCover] = useState(true);
  const [coverP, setCoverP] = useState({ eyebrow: "", title: deck.title, subtitle: "", credit: "" });
  const [fileName, setFileName] = useState("");
  const [spec, setSpec] = useState("");
  const [imp, setImp] = useState("");
  const [cdnState, setCdnState] = useState("idle"); // idle | loading | ready | failed
  const [cdnAttempt, setCdnAttempt] = useState(0);
  const cdnTimers = useRef([]);

  const notReady = deck.chain.filter((r) => r.status !== "form_ok");
  // stale(재검토 필요)은 "처분됨"이 아니다 — 제외하면 정의서를 고쳐 전건 stale이 된 순간 경고가 사라진다
  const undone = deck.holes.filter((h) => !holeSettled(h) || h.stale);

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
        // 대시(—)는 문체 규정의 금지 기호 — 넣으면 이 덱보드가 내보낸 스펙이 자기 엔진 검증에서 떨어진다
        s.footnote = "* 수치는 가정(예시), 근거 작성 필요";
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

  // ── [실험] 브라우저 pptx 생성 — 전 CDN 실패 시 조용히 숨김 (주 경로는 Claude Code 빌드) ──
  // 아티팩트 CSP가 어떤 호스트를 허용하는지 확정할 수 없어 순차 폴백한다.
  // cdnjs를 1차로 두되, npm 레이아웃이 확인된 jsdelivr·unpkg가 뒤를 받친다.
  function loadCdn(idx = 0) {
    if (window.PptxGenJS) { setCdnState("ready"); return; }
    if (idx >= CDN_SRCS.length) {
      // 타임아웃으로 넘어간 앞선 시도가 뒤늦게 로드됐을 수 있다 — 전역을 진실의 근원으로 재확인
      setCdnState(window.PptxGenJS ? "ready" : "failed");
      return;
    }
    setCdnAttempt(idx + 1);
    setCdnState("loading");
    const s = document.createElement("script");
    s.src = CDN_SRCS[idx];
    let settled = false;
    // script는 DOM에서 제거해도 진행 중인 로드가 취소되지 않는다 — 태그는 두고 핸들러만 무력화한다
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cdnTimers.current = cdnTimers.current.filter((t) => t !== timer);
      if (window.PptxGenJS) setCdnState("ready");
      else loadCdn(idx + 1);
    };
    const timer = setTimeout(done, 5000);
    cdnTimers.current.push(timer);
    s.onload = done;
    s.onerror = done;
    document.head.appendChild(s);
  }
  useEffect(() => () => { cdnTimers.current.forEach(clearTimeout); }, []);
  async function draftPptx() {
    try {
      const specObj = buildSpec();
      const pres = new window.PptxGenJS();
      pres.layout = "LAYOUT_WIDE";
      // 색은 조직 팩(colors.json)에서 온다 — 코드에 hex를 직접 쓰지 않는다 (ppt/CLAUDE.md 금지 조항)
      const c = RULES.colors.roles;
      const font = RULES.colors.font;
      specObj.slides.forEach((s, i) => {
        const sl = pres.addSlide();
        if (s.template === "cover") {
          sl.background = { color: c.structure };
          sl.addText(s.p.title || "", { x: 0.9, y: 2.8, w: 11.5, h: 1, fontFace: font, fontSize: 44, bold: true, color: c.paper });
          if (s.p.subtitle) sl.addText(s.p.subtitle, { x: 0.9, y: 3.9, w: 11.5, h: 0.5, fontFace: font, fontSize: 16, color: c.coverSub });
          return;
        }
        sl.addText(s.label || "", { x: 0.4, y: 0.36, w: 9.6, h: 0.6, fontFace: font, fontSize: 26, bold: true, color: c.structure });
        sl.addText(s.head.runs.map((r) => r.t).join(""), { x: 0.7, y: 1.3, w: 11.9, h: 0.6, fontFace: font, fontSize: 18, bold: true, color: c.ink });
        if (s.head.sub) sl.addText(s.head.sub, { x: 0.72, y: 1.95, w: 11.9, h: 0.35, fontFace: font, fontSize: 12, color: c.legacyDark });
        sl.addText(`[초안] 폼: ${tplName(s.template)}, 정식 렌더는 Claude Code 빌드(deck:build)에서`, { x: 0.72, y: 3.4, w: 11.9, h: 0.5, fontFace: font, fontSize: 12, color: c.mut, align: "center" });
        sl.addText(String(i + 1), { x: 12.5, y: 7.15, w: 0.5, h: 0.25, fontFace: font, fontSize: 9, color: c.mut, align: "right" });
      });
      await pres.writeFile({ fileName: specObj.meta.fileName.replace(/\.pptx$/, "") + "_초안.pptx" });
      say("초안 pptx 다운로드됨 (레이아웃 없는 미리보기 수준)");
    } catch (e) {
      // 생성 실패는 CDN 로드 실패가 아니다 — 여기서 cdnState를 내리면 정상 로드된 라이브러리까지 숨긴다
      say("브라우저 생성 실패 — Claude Code 빌드 경로를 사용하세요");
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
          let d;
          try { d = JSON.parse(imp); } catch { say("가져오기 실패 — JSON 형식 확인"); return; }
          onImport(d); // 본문·목록·화면 state를 한 번에 맞춘다 (목록 갱신을 빠뜨리면 다음 저장이 덱을 지운다)
        }} className="text-xs px-3 py-1 rounded-lg mt-1" style={{ border: "1px solid " + C.line }}>가져오기</button>
      </div>

      {cdnState !== "failed" && (
        <div className="rounded-xl p-4" style={{ background: C.card, border: "1px dashed " + C.line }}>
          <div className="text-xs mb-2" style={{ color: C.gray, fontWeight: 700 }}>[실험] 브라우저에서 초안 pptx 생성 — 정식 렌더 아님, CDN 차단 환경이면 자동으로 사라짐</div>
          {cdnState === "idle" && <button onClick={() => loadCdn(0)} className="text-sm px-3 py-1.5 rounded-lg" style={{ border: "1px solid " + C.line }}>pptxgenjs 로드 시도</button>}
          {cdnState === "loading" && <span className="text-sm" style={{ color: C.gray }}>로드 중… ({cdnAttempt}/{CDN_SRCS.length})</span>}
          {cdnState === "ready" && <button onClick={draftPptx} className="text-sm px-3 py-1.5 rounded-lg" style={{ background: C.teal, color: "#fff", fontWeight: 700 }}>초안 pptx 다운로드</button>}
        </div>
      )}
    </div>
  );
}
