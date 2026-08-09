import { useState, useEffect } from "react";

const C = {
  paper: "#F6F6F3",
  ink: "#232A33",
  gray: "#8A9099",
  line: "#E4E2DC",
  teal: "#0F7A66",
  tealDark: "#0B5D4F",
  tealSoft: "#E7F2EE",
  card: "#FFFFFF",
  grayFill: "#C9CDD3",
  grayTint: "#EFF0F1",
};

const KEY = "formstudy:runs:v1";

const TPL = {
  layer: { name: "레이어", trig: "받친다 · 토대 · 전제 · 기반" },
  hub: { name: "허브", trig: "구동 · 공급 · 중심 · 연결" },
  before_after: { name: "전·후", trig: "바뀐다 · 풀리면 · 활성화 · 전환" },
  flow: { name: "플로우", trig: "단계 · 순서 · 프로세스 · 거친다" },
  matrix: { name: "2×2", trig: "두 축 · 갈린다 · 포지셔닝" },
  funnel: { name: "퍼널", trig: "좁아진다 · 걸러진다 · 전환율" },
  bars: { name: "막대 비교", trig: "~보다 크다 · 격차 · 순위" },
  trend: { name: "추세", trig: "커진다 · 줄어든다 · 3년째" },
  textgrid: { name: "구조화 텍스트", trig: "원칙 · 기준 · 정의 · 요청" },
};

const SAMPLES = {
  layer: { base: "DP — 시점 재산정", items: ["중도부가", "보장전환", "리밸런싱"] },
  hub: { center: "DP", spokes: ["중도부가", "보장전환", "리밸런싱"] },
  before_after: { before: "가입가 고정", after: "DP 작동", trigger: "재산정", items: ["중도부가", "보장전환", "리밸런싱"] },
  flow: { steps: ["가입", "무사고 입증", "등급 하향", "보험료 인하"], hi: 3 },
  matrix: { xl: "환급 낮음", xr: "환급 높음", yb: "보장 고정", yt: "보장 가변", q: ["상속종신", "선지급종신", "저해지", "New종신"], hi: 3 },
  funnel: { stages: ["DB 접촉", "설명 청취", "청약 전환", "13회차 유지"] },
  bars: { items: [{ l: "GA", v: 90 }, { l: "전속", v: 40 }, { l: "TM", v: 48 }, { l: "방카", v: 34 }], hi: 0, unit: "억원" },
  trend: { pts: [{ l: "'23", v: 62 }, { l: "'24", v: 71 }, { l: "'25", v: 83 }, { l: "'26", v: 97 }], note: "연 +16%" },
  textgrid: { items: [{ n: "01", t: "시점·대상·재원", d: "세 가지 모두 고객이 선택" }, { n: "02", t: "적립금 상한 내", d: "회사 리스크는 준비금으로 제한" }, { n: "03", t: "고지의무 유지", d: "부가 시점에 다시 고지" }] },
};

const SAMPLE_MSGS = [
  "DP는 네 번째 기능이 아니라 세 기능을 작동시키는 엔진이다",
  "무사고 전환 고객일수록 13회차 유지율이 높다",
  "보장전환은 신규 가입이 아니라 적립금의 용도 변경이다",
];

const trunc = (s, n) => {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
};

const wrap2 = (t, n) => {
  if (!t) return [""];
  if (t.length <= n) return [t];
  const rest = t.slice(n);
  return [t.slice(0, n), rest.length > n ? rest.slice(0, n - 1) + "…" : rest];
};

function SlideFrame({ title, children }) {
  const lines = wrap2(title || "", 31);
  return (
    <div style={{ background: C.card, border: "1px solid " + C.line, borderRadius: 10, overflow: "hidden" }}>
      <svg viewBox="0 0 480 270" style={{ width: "100%", display: "block" }}>
        <defs>
          <marker id="fsA" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M2 1L8 5L2 9" fill="none" stroke={C.gray} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        </defs>
        <text x="24" y={lines.length > 1 ? 27 : 33} fontSize="13" fontWeight="700" fill={C.ink}>{lines[0]}</text>
        {lines.length > 1 && <text x="24" y="43" fontSize="13" fontWeight="700" fill={C.ink}>{lines[1]}</text>}
        <line x1="24" y1="51" x2="456" y2="51" stroke={C.line} strokeWidth="1" />
        {children}
      </svg>
    </div>
  );
}

function BodyLayer({ p }) {
  const items = (p.items || []).slice(0, 4);
  const n = Math.max(items.length, 1);
  const w = (432 - (n - 1) * 10) / n;
  return (
    <g>
      {items.map((it, i) => {
        const x = 24 + i * (w + 10);
        return (
          <g key={i}>
            <rect x={x} y="116" width={w} height="56" rx="6" fill={C.grayTint} stroke={C.line} />
            <text x={x + w / 2} y="147" fontSize="12" fill={C.ink} textAnchor="middle">{trunc(it, Math.floor(w / 13))}</text>
          </g>
        );
      })}
      <rect x="24" y="184" width="432" height="38" rx="6" fill={C.teal} />
      <text x="240" y="207" fontSize="12" fontWeight="700" fill="#fff" textAnchor="middle">{trunc(p.base, 30)}</text>
    </g>
  );
}

function BodyHub({ p }) {
  const sp = (p.spokes || []).slice(0, 5);
  const POS = {
    3: [[240, 84], [104, 200], [376, 200]],
    4: [[126, 92], [354, 92], [126, 212], [354, 212]],
    5: [[240, 80], [96, 128], [384, 128], [146, 220], [334, 220]],
  };
  const pos = POS[sp.length] || POS[3];
  return (
    <g>
      {sp.map((s, i) => (
        <line key={"l" + i} x1="240" y1="152" x2={pos[i][0]} y2={pos[i][1]} stroke={C.gray} strokeWidth="1" />
      ))}
      {sp.map((s, i) => (
        <g key={i}>
          <rect x={pos[i][0] - 50} y={pos[i][1] - 17} width="100" height="34" rx="6" fill={C.card} stroke={C.line} />
          <text x={pos[i][0]} y={pos[i][1] + 4} fontSize="11" fill={C.ink} textAnchor="middle">{trunc(s, 7)}</text>
        </g>
      ))}
      <circle cx="240" cy="152" r="34" fill={C.teal} />
      <text x="240" y="156" fontSize="12" fontWeight="700" fill="#fff" textAnchor="middle">{trunc(p.center, 5)}</text>
    </g>
  );
}

function BodyBeforeAfter({ p }) {
  const items = (p.items || []).slice(0, 4);
  const H = 30, G = 8;
  const y0 = 84;
  return (
    <g>
      <text x="112" y="72" fontSize="11" fill={C.gray} textAnchor="middle">{trunc(p.before, 14)}</text>
      <text x="372" y="72" fontSize="11" fill={C.teal} fontWeight="700" textAnchor="middle">{trunc(p.after, 14)}</text>
      {items.map((it, i) => (
        <g key={i}>
          <rect x="28" y={y0 + i * (H + G)} width="168" height={H} rx="5" fill="none" stroke={C.gray} strokeWidth="0.9" strokeDasharray="4 3" />
          <text x="112" y={y0 + i * (H + G) + 19} fontSize="11" fill={C.gray} textAnchor="middle">{trunc(it, 11)}</text>
          <rect x="288" y={y0 + i * (H + G)} width="168" height={H} rx="5" fill={C.tealSoft} stroke={C.teal} strokeWidth="0.9" />
          <text x="372" y={y0 + i * (H + G) + 19} fontSize="11" fill={C.tealDark} fontWeight="600" textAnchor="middle">{trunc(it, 11)}</text>
        </g>
      ))}
      <text x="242" y="142" fontSize="11" fill={C.teal} fontWeight="700" textAnchor="middle">{trunc(p.trigger, 7)}</text>
      <line x1="206" y1="154" x2="278" y2="154" stroke={C.gray} strokeWidth="1.2" markerEnd="url(#fsA)" />
    </g>
  );
}

function BodyFlow({ p }) {
  const st = (p.steps || []).slice(0, 5);
  const n = Math.max(st.length, 1);
  const gap = 26;
  const w = (432 - (n - 1) * gap) / n;
  return (
    <g>
      {st.map((s, i) => {
        const x = 24 + i * (w + gap);
        const hot = i === (p.hi ?? -1);
        return (
          <g key={i}>
            <rect x={x} y="126" width={w} height="52" rx="6" fill={hot ? C.tealSoft : C.grayTint} stroke={hot ? C.teal : C.line} strokeWidth={hot ? 1.2 : 1} />
            <text x={x + w / 2} y="155" fontSize="11" fill={hot ? C.tealDark : C.ink} fontWeight={hot ? 700 : 400} textAnchor="middle">{trunc(s, Math.floor(w / 12))}</text>
            {i < n - 1 && <line x1={x + w + 4} y1="152" x2={x + w + gap - 4} y2="152" stroke={C.gray} strokeWidth="1" markerEnd="url(#fsA)" />}
          </g>
        );
      })}
    </g>
  );
}

function BodyMatrix({ p }) {
  const Q = [
    { x: 50, y: 64, cx: 145, cy: 112 },
    { x: 240, y: 64, cx: 335, cy: 112 },
    { x: 50, y: 151, cx: 145, cy: 199 },
    { x: 240, y: 151, cx: 335, cy: 199 },
  ];
  const hi = p.hi ?? 3;
  const q = p.q || [];
  return (
    <g>
      {Q[hi] && <rect x={Q[hi].x} y={Q[hi].y} width="190" height="87" fill={C.tealSoft} />}
      <line x1="240" y1="64" x2="240" y2="238" stroke={C.gray} strokeWidth="1" />
      <line x1="50" y1="151" x2="430" y2="151" stroke={C.gray} strokeWidth="1" />
      <text x="52" y="145" fontSize="10.5" fill={C.gray}>{trunc(p.xl, 8)}</text>
      <text x="428" y="145" fontSize="10.5" fill={C.gray} textAnchor="end">{trunc(p.xr, 8)}</text>
      <text x="248" y="62" fontSize="10.5" fill={C.gray}>{trunc(p.yt, 8)}</text>
      <text x="248" y="248" fontSize="10.5" fill={C.gray}>{trunc(p.yb, 8)}</text>
      {q.slice(0, 4).map((t, i) => (
        <text key={i} x={Q[i].cx} y={Q[i].cy + 4} fontSize="12" fontWeight={i === hi ? 700 : 400} fill={i === hi ? C.tealDark : C.ink} textAnchor="middle">{trunc(t, 9)}</text>
      ))}
    </g>
  );
}

function BodyFunnel({ p }) {
  const st = (p.stages || []).slice(0, 4);
  const n = st.length;
  return (
    <g>
      {st.map((s, i) => {
        const w = Math.max(400 - i * 84, 140);
        const y = 66 + i * 45;
        const last = i === n - 1;
        return (
          <g key={i}>
            <rect x={240 - w / 2} y={y} width={w} height="34" rx="6" fill={last ? C.tealSoft : C.grayTint} stroke={last ? C.teal : C.line} />
            <text x="240" y={y + 21} fontSize="11" fill={last ? C.tealDark : C.ink} fontWeight={last ? 700 : 400} textAnchor="middle">{trunc(s, 14)}</text>
          </g>
        );
      })}
    </g>
  );
}

function BodyBars({ p }) {
  const items = (p.items || []).slice(0, 6);
  const n = Math.max(items.length, 1);
  const max = Math.max(...items.map((d) => d.v || 0), 1);
  const slot = 432 / n;
  const bw = Math.min(54, slot * 0.55);
  return (
    <g>
      {p.unit && <text x="456" y="72" fontSize="10.5" fill={C.gray} textAnchor="end">{trunc(p.unit, 8)}</text>}
      <line x1="24" y1="218" x2="456" y2="218" stroke={C.gray} strokeWidth="0.8" />
      {items.map((d, i) => {
        const h = Math.max(((d.v || 0) / max) * 126, 6);
        const x = 24 + i * slot + (slot - bw) / 2;
        const hot = i === (p.hi ?? 0);
        return (
          <g key={i}>
            <rect x={x} y={218 - h} width={bw} height={h} rx="3" fill={hot ? C.teal : C.grayFill} />
            <text x={x + bw / 2} y={210 - h} fontSize="11" fontWeight={hot ? 700 : 400} fill={hot ? C.tealDark : C.gray} textAnchor="middle">{d.v}</text>
            <text x={x + bw / 2} y="236" fontSize="11" fill={C.ink} textAnchor="middle">{trunc(d.l, 6)}</text>
          </g>
        );
      })}
    </g>
  );
}

function BodyTrend({ p }) {
  const pts = (p.pts || []).slice(0, 6);
  const n = pts.length;
  if (n < 2) return null;
  const vs = pts.map((d) => d.v || 0);
  const min = Math.min(...vs), max = Math.max(...vs);
  const span = max - min || 1;
  const X = (i) => 60 + (i * 370) / (n - 1);
  const Y = (v) => 202 - ((v - min) / span) * 108;
  const path = pts.map((d, i) => `${X(i)},${Y(d.v)}`).join(" ");
  return (
    <g>
      <line x1="40" y1="218" x2="450" y2="218" stroke={C.gray} strokeWidth="0.8" />
      <polyline points={path} fill="none" stroke={C.ink} strokeWidth="1.6" />
      {pts.map((d, i) => (
        <g key={i}>
          <circle cx={X(i)} cy={Y(d.v)} r={i === n - 1 ? 5 : 3} fill={i === n - 1 ? C.teal : C.grayFill} />
          <text x={X(i)} y="236" fontSize="11" fill={C.ink} textAnchor="middle">{trunc(d.l, 6)}</text>
        </g>
      ))}
      {p.note && <text x={X(n - 1) - 10} y={Y(pts[n - 1].v) - 14} fontSize="11.5" fontWeight="700" fill={C.teal} textAnchor="end">{trunc(p.note, 12)}</text>}
    </g>
  );
}

function BodyTextgrid({ p }) {
  const items = (p.items || []).slice(0, 4);
  return (
    <g>
      {items.map((it, i) => {
        const y = 78 + i * 48;
        return (
          <g key={i}>
            <text x="28" y={y} fontSize="12" fontWeight="700" fill={C.teal} fontFamily="monospace">{it.n || String(i + 1).padStart(2, "0")}</text>
            <text x="66" y={y} fontSize="13" fontWeight="700" fill={C.ink}>{trunc(it.t, 16)}</text>
            <text x="66" y={y + 17} fontSize="11" fill={C.gray}>{trunc(it.d, 34)}</text>
          </g>
        );
      })}
    </g>
  );
}

function SketchBody({ tpl, p }) {
  if (!p) return null;
  if (tpl === "layer") return <BodyLayer p={p} />;
  if (tpl === "hub") return <BodyHub p={p} />;
  if (tpl === "before_after") return <BodyBeforeAfter p={p} />;
  if (tpl === "flow") return <BodyFlow p={p} />;
  if (tpl === "matrix") return <BodyMatrix p={p} />;
  if (tpl === "funnel") return <BodyFunnel p={p} />;
  if (tpl === "bars") return <BodyBars p={p} />;
  if (tpl === "trend") return <BodyTrend p={p} />;
  if (tpl === "textgrid") return <BodyTextgrid p={p} />;
  return null;
}

const PROMPT = (msg, ctx) => `당신은 컨설팅 장표의 폼 스터디 엔진이다. 입력 메시지는 슬라이드의 액션 타이틀(주장문)이다. 메시지에 담긴 관계를 읽고, 그 관계를 표현할 서로 다른 형태 2~3개를 골라 JSON만 출력한다.

스키마:
{"analysis":{"key":"관계를 드러내는 핵심 구절","rel":"관계 유형(예: 기반, 활성화, 상관, 추세, 비교, 단계, 분류, 선언)"},"cands":[{"tpl":"...","emph":"이 형태가 세우는 측면(8자 내)","why":"선택 이유 한 문장","p":{...}}]}

템플릿 id와 p 스키마:
layer(기반·토대): {"base":"토대 라벨","items":["위 요소 3~4개"]}
hub(구동·공급): {"center":"중심(5자 내)","spokes":["3~5개"]}
before_after(변화·활성화): {"before":"이전 상태","after":"이후 상태","trigger":"전환 계기(7자 내)","items":["공통 요소 3~4개"]}
flow(단계·순서): {"steps":["3~5개"],"hi":강조 인덱스}
matrix(두 축 분류): {"xl":"x좌","xr":"x우","yb":"y하","yt":"y상","q":["좌상","우상","좌하","우하"],"hi":강조 사분면 인덱스}
funnel(좁아짐·전환): {"stages":["3~4개"]}
bars(항목 비교): {"items":[{"l":"라벨","v":수치}],"hi":강조 인덱스,"unit":"단위"}
trend(시간 추세): {"pts":[{"l":"라벨","v":수치}4~6개],"note":"핵심 주석(10자 내)"}
textgrid(원칙·기준·선언): {"items":[{"n":"01","t":"라벨(14자 내)","d":"한 줄 설명(30자 내)"}3~4개]}

규칙: 항목 라벨은 2~7자로 짧게. 메시지에 없는 세부 항목·수치는 한국 보험업 상식으로 그럴듯한 예시를 채우되 과장하지 않는다. 후보는 반드시 서로 다른 템플릿, 적합도 순. 정량 관계면 차트형(bars/trend)을 반드시 하나 포함. 마크다운·설명 없이 JSON만 출력.

메시지: "${msg}"${ctx ? `\n덱 맥락: "${ctx}"` : ""}`;

const LOADING = ["관계어를 읽는 중", "형태 후보를 고르는 중", "스케치 파라미터를 채우는 중"];

export default function App() {
  const [tab, setTab] = useState("study");
  const [msg, setMsg] = useState("");
  const [ctx, setCtx] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadIdx, setLoadIdx] = useState(0);
  const [err, setErr] = useState(null);
  const [run, setRun] = useState(null);
  const [picked, setPicked] = useState(null);
  const [saved, setSaved] = useState(false);
  const [runs, setRuns] = useState(null);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setLoadIdx((i) => (i + 1) % LOADING.length), 1400);
    return () => clearInterval(t);
  }, [busy]);

  useEffect(() => {
    if (tab === "log" && runs === null) loadRuns();
  }, [tab]);

  async function loadRuns() {
    try {
      const r = await window.storage.get(KEY);
      setRuns(r ? JSON.parse(r.value) : []);
    } catch (e) {
      setRuns([]);
    }
  }

  async function persist(r) {
    let list = [];
    try {
      const g = await window.storage.get(KEY);
      list = g ? JSON.parse(g.value) : [];
    } catch (e) {}
    const i = list.findIndex((x) => x.ts === r.ts);
    if (i >= 0) list[i] = r; else list.unshift(r);
    list = list.slice(0, 300);
    try {
      await window.storage.set(KEY, JSON.stringify(list));
      setRuns(list);
      return true;
    } catch (e) {
      return false;
    }
  }

  async function analyze() {
    const m = msg.trim();
    if (!m || busy) return;
    setBusy(true);
    setErr(null);
    setRun(null);
    setPicked(null);
    setSaved(false);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{ role: "user", content: PROMPT(m, ctx.trim()) }],
        }),
      });
      const data = await res.json();
      const txt = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
      const clean = txt.replace(/```json|```/g, "").trim();
      const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
      const parsed = JSON.parse(clean.slice(s, e + 1));
      const cands = (parsed.cands || []).filter((c) => TPL[c.tpl] && c.p).slice(0, 3);
      if (!cands.length) throw new Error("empty");
      setRun({ ts: Date.now(), msg: m, ctx: ctx.trim(), analysis: parsed.analysis || {}, cands });
    } catch (e) {
      setErr("분석에 실패했습니다. 다시 실행하거나, 사전 탭에서 형태를 직접 골라도 됩니다.");
    }
    setBusy(false);
  }

  async function pick(i) {
    if (!run) return;
    setPicked(i);
    const r = { ts: run.ts, msg: run.msg, rel: run.analysis?.rel || "", cands: run.cands.map((c) => c.tpl), pick: run.cands[i].tpl };
    const ok = await persist(r);
    setSaved(ok);
  }

  const spec = run && picked !== null
    ? `[폼 스터디 결과]\n메시지: ${run.msg}\n선택 형태: ${TPL[run.cands[picked].tpl].name} (${run.cands[picked].tpl})\n파라미터: ${JSON.stringify(run.cands[picked].p, null, 1)}\n→ 이 스펙으로 슬라이드 제작 요청`
    : "";

  const counts = (runs || []).reduce((a, r) => {
    if (r.pick) a[r.pick] = (a[r.pick] || 0) + 1;
    return a;
  }, {});
  const countMax = Math.max(...Object.values(counts), 1);

  const tabBtn = (id, label) => (
    <button
      onClick={() => setTab(id)}
      className="text-sm px-1 pb-2"
      style={{
        color: tab === id ? C.ink : C.gray,
        fontWeight: tab === id ? 700 : 400,
        borderBottom: tab === id ? "2px solid " + C.ink : "2px solid transparent",
        background: "none",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ background: C.paper, minHeight: "100vh", color: C.ink, fontFamily: "'Pretendard','Apple SD Gothic Neo','Malgun Gothic',sans-serif" }}>
      <div className="mx-auto px-4 py-8" style={{ maxWidth: 780 }}>
        <div className="flex items-baseline justify-between mb-1">
          <h1 className="text-xl" style={{ fontWeight: 800, letterSpacing: "-0.01em" }}>폼 스터디</h1>
          <span className="text-xs" style={{ color: C.gray }}>v0 · 시드 템플릿 9종</span>
        </div>
        <p className="text-sm mb-5" style={{ color: C.gray }}>메시지 한 문장을 주면, 표현할 형태 후보를 스케치로 보여줍니다.</p>

        <div className="flex gap-5 mb-6" style={{ borderBottom: "1px solid " + C.line }}>
          {tabBtn("study", "스터디")}
          {tabBtn("dict", "템플릿 사전")}
          {tabBtn("log", "기록")}
        </div>

        {tab === "study" && (
          <div>
            <div style={{ background: C.card, border: "1px solid " + C.line, borderRadius: 12, padding: "20px 22px 16px" }}>
              <div className="text-xs mb-2" style={{ color: C.gray, letterSpacing: "0.06em", fontWeight: 700 }}>이 장의 메시지 — 액션 타이틀</div>
              <textarea
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                rows={2}
                placeholder="무사고 전환 고객일수록 13회차 유지율이 높다"
                className="w-full resize-none outline-none"
                style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.45, color: C.ink, background: "transparent", borderBottom: "1px solid " + C.line, paddingBottom: 10 }}
              />
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <input
                  value={ctx}
                  onChange={(e) => setCtx(e.target.value)}
                  placeholder="덱 맥락 (선택) — 예: 본부장 컨셉 보고"
                  className="flex-1 text-sm outline-none py-1"
                  style={{ color: C.ink, background: "transparent", minWidth: 200 }}
                />
                <button
                  onClick={analyze}
                  disabled={busy || !msg.trim()}
                  className="text-sm px-4 py-2 rounded-lg"
                  style={{ background: busy || !msg.trim() ? C.grayFill : C.ink, color: "#fff", fontWeight: 700 }}
                >
                  {busy ? "분석 중" : "폼 스터디 실행"}
                </button>
              </div>
            </div>

            {!run && !busy && (
              <div className="flex flex-wrap gap-2 mt-3">
                {SAMPLE_MSGS.map((s, i) => (
                  <button key={i} onClick={() => setMsg(s)} className="text-xs px-3 py-1.5 rounded-full" style={{ border: "1px solid " + C.line, color: C.gray, background: C.card }}>
                    {trunc(s, 24)}
                  </button>
                ))}
              </div>
            )}

            {busy && (
              <div className="mt-8 text-center">
                <div className="text-sm" style={{ color: C.gray }}>{LOADING[loadIdx]}…</div>
                <div className="mt-4 mx-auto" style={{ width: 42, height: 3, background: C.line, borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: "40%", height: "100%", background: C.teal, borderRadius: 2 }} />
                </div>
              </div>
            )}

            {err && (
              <div className="mt-5 text-sm px-4 py-3 rounded-lg" style={{ background: "#FBEFEC", color: "#8A3B26" }}>{err}</div>
            )}

            {run && (
              <div className="mt-6">
                <div className="flex flex-wrap items-center gap-2 mb-4 text-xs">
                  <span style={{ color: C.gray }}>관계어</span>
                  <span className="px-2 py-1 rounded" style={{ background: C.tealSoft, color: C.tealDark, fontFamily: "monospace", fontWeight: 700 }}>{run.analysis.key || "—"}</span>
                  <span className="px-2 py-1 rounded" style={{ background: C.grayTint, color: C.ink, fontFamily: "monospace" }}>{run.analysis.rel || "—"}</span>
                </div>

                <div className="grid gap-5">
                  {run.cands.map((c, i) => (
                    <div key={i} className="rounded-xl" style={{ background: C.card, border: picked === i ? "2px solid " + C.teal : "1px solid " + C.line, padding: 14 }}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm" style={{ fontWeight: 800 }}>{TPL[c.tpl].name}</span>
                          <span className="text-xs" style={{ color: C.teal, fontWeight: 700 }}>강조 — {c.emph}</span>
                        </div>
                        <button
                          onClick={() => pick(i)}
                          className="text-xs px-3 py-1.5 rounded-lg"
                          style={{ background: picked === i ? C.teal : "transparent", color: picked === i ? "#fff" : C.ink, border: "1px solid " + (picked === i ? C.teal : C.line), fontWeight: 700 }}
                        >
                          {picked === i ? "선택됨" : "이 형태로"}
                        </button>
                      </div>
                      <SlideFrame title={run.msg}>
                        <SketchBody tpl={c.tpl} p={c.p} />
                      </SlideFrame>
                      <div className="text-xs mt-3" style={{ color: C.gray, lineHeight: 1.6 }}>{c.why}</div>
                    </div>
                  ))}
                </div>

                {picked !== null && (
                  <div className="mt-5 rounded-xl" style={{ background: C.card, border: "1px solid " + C.line, padding: 16 }}>
                    <div className="text-xs mb-2" style={{ color: C.gray, fontWeight: 700 }}>
                      제작 지시서 — 복사해서 Claude에게 붙여넣으면 이 스펙으로 제작합니다{saved ? " · 기록 저장됨" : ""}
                    </div>
                    <textarea
                      readOnly
                      value={spec}
                      onFocus={(e) => e.target.select()}
                      rows={7}
                      className="w-full text-xs outline-none resize-none rounded-lg p-3"
                      style={{ fontFamily: "monospace", background: C.grayTint, color: C.ink, lineHeight: 1.6 }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "dict" && (
          <div className="grid gap-5">
            <p className="text-sm" style={{ color: C.gray }}>메시지 속 관계어가 형태를 결정합니다. 각 형태의 방아쇠 단어와 예시 스케치입니다.</p>
            {Object.keys(TPL).map((id) => (
              <div key={id} className="rounded-xl" style={{ background: C.card, border: "1px solid " + C.line, padding: 14 }}>
                <div className="flex items-baseline justify-between mb-3">
                  <span className="text-sm" style={{ fontWeight: 800 }}>{TPL[id].name}</span>
                  <span className="text-xs" style={{ color: C.gray, fontFamily: "monospace" }}>{TPL[id].trig}</span>
                </div>
                <SlideFrame title={"예시 — " + TPL[id].name + " 형태"}>
                  <SketchBody tpl={id} p={SAMPLES[id]} />
                </SlideFrame>
              </div>
            ))}
          </div>
        )}

        {tab === "log" && (
          <div>
            {runs === null && <div className="text-sm" style={{ color: C.gray }}>불러오는 중…</div>}
            {runs !== null && runs.length === 0 && (
              <div className="text-sm py-10 text-center" style={{ color: C.gray }}>
                아직 기록이 없습니다. 스터디에서 형태를 선택하면 여기 쌓이고,<br />어떤 형태가 자주 이기는지가 곧 우리의 사전이 됩니다.
              </div>
            )}
            {runs !== null && runs.length > 0 && (
              <div>
                <div className="rounded-xl mb-5" style={{ background: C.card, border: "1px solid " + C.line, padding: 16 }}>
                  <div className="text-xs mb-3" style={{ color: C.gray, fontWeight: 700 }}>이기는 형태 — 선택 누적</div>
                  <div className="grid gap-2">
                    {Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
                      <div key={t} className="flex items-center gap-3 text-xs">
                        <span style={{ width: 84, fontWeight: 700 }}>{TPL[t] ? TPL[t].name : t}</span>
                        <div className="flex-1" style={{ background: C.grayTint, borderRadius: 4, height: 10 }}>
                          <div style={{ width: (n / countMax) * 100 + "%", background: C.teal, height: 10, borderRadius: 4 }} />
                        </div>
                        <span style={{ color: C.gray, width: 20, textAlign: "right" }}>{n}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid gap-2">
                  {runs.map((r) => (
                    <div key={r.ts} className="rounded-lg text-xs flex items-center gap-3 px-3 py-2.5" style={{ background: C.card, border: "1px solid " + C.line }}>
                      <span className="flex-1" style={{ lineHeight: 1.5 }}>{trunc(r.msg, 44)}</span>
                      {r.pick && <span className="px-2 py-0.5 rounded" style={{ background: C.tealSoft, color: C.tealDark, fontWeight: 700, whiteSpace: "nowrap" }}>{TPL[r.pick] ? TPL[r.pick].name : r.pick}</span>}
                      <span style={{ color: C.gray, whiteSpace: "nowrap" }}>{new Date(r.ts).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <p className="text-xs mt-8" style={{ color: C.gray }}>
          기록은 이 아티팩트를 여는 사용자별로 저장됩니다. 스케치는 형태 결정용 초안이며, 제작은 지시서를 채팅에 붙여넣어 진행합니다.
        </p>
      </div>
    </div>
  );
}
