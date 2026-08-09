const pptxgen = require("pptxgenjs");

const KF = "맑은 고딕";
const INK = "1F2A44", NAVY = "0F1E5A", BLUE = "1743E0", GRAY = "6B7280";
const LINE = "D8DDE6", BG = "F2F4F7", W = "FFFFFF";
const GBAR = "C3C9D4", CELLG = "ECEFF3", GDARK = "5A6472";
const RED = "C6392E", REDBG = "FDF1EF";
const CYAN = "4FC8DF", CYANBG = "DFF6FA", LAV = "7C86F5", LAVBG = "ECEEFD";
const BLUEBG = "E9EFFD", HL = "FFF04D", YEL = "FFF9D6", YELB = "E7C93C";
const MUT = "8A93A4";

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.author = "상품개발팀";

function chrome(s, num, title, pill) {
  s.background = { color: BG };
  s.addText("New종신 컨셉 보고", { x: 0.4, y: 0.1, w: 4, h: 0.22, margin: 0, fontFace: KF, fontSize: 8, color: MUT, align: "left" });
  s.addText(title, { x: 0.4, y: 0.36, w: 9.6, h: 0.56, margin: 0, fontFace: KF, fontSize: 27, bold: true, color: NAVY, align: "left", valign: "middle" });
  if (pill) {
    s.addShape(pres.ShapeType.roundRect, { x: 10.3, y: 0.44, w: 2.66, h: 0.44, rectRadius: 0.22, fill: { color: CYAN }, line: { type: "none" } });
    s.addText(pill, { x: 10.3, y: 0.44, w: 2.66, h: 0.44, margin: 0, fontFace: KF, fontSize: 13, bold: true, color: NAVY, align: "center", valign: "middle" });
  }
  s.addShape(pres.ShapeType.roundRect, { x: 0.36, y: 1.1, w: 12.61, h: 6.06, rectRadius: 0.06, fill: { color: W }, line: { color: LINE, width: 1 } });
  s.addText(String(num), { x: 12.55, y: 7.2, w: 0.5, h: 0.22, margin: 0, fontFace: KF, fontSize: 9, color: MUT, align: "right" });
}

function head(s, parts, sub) {
  s.addShape(pres.ShapeType.rect, { x: 0.72, y: 1.36, w: 0.07, h: 0.5, fill: { color: NAVY }, line: { type: "none" } });
  const runs = parts.map(p => ({ text: p.t, options: p.h ? { highlight: HL } : {} }));
  s.addText(runs, { x: 0.94, y: 1.3, w: 11.6, h: 0.6, margin: 0, fontFace: KF, fontSize: 19, bold: true, color: INK, align: "left", valign: "middle" });
  if (sub) s.addText(sub, { x: 0.96, y: 1.96, w: 11.5, h: 0.3, margin: 0, fontFace: KF, fontSize: 13, color: GDARK, align: "left", valign: "middle" });
}

function band(s, x, y, w, txt, bgc, fgc) {
  s.addShape(pres.ShapeType.rect, { x, y, w, h: 0.4, fill: { color: bgc }, line: { type: "none" } });
  s.addText(txt, { x, y, w, h: 0.4, margin: 0, fontFace: KF, fontSize: 13, bold: true, color: fgc, align: "center", valign: "middle" });
}

/* ================= S1 표지 ================= */
const s1 = pres.addSlide();
s1.background = { color: NAVY };
s1.addText("상품구조 Transformation  |  파일럿 컨셉", { x: 0.9, y: 2.1, w: 8, h: 0.3, margin: 0, fontFace: KF, fontSize: 12, color: CYAN, align: "left" });
s1.addShape(pres.ShapeType.rect, { x: 0.92, y: 2.55, w: 0.55, h: 0.045, fill: { color: CYAN }, line: { type: "none" } });
s1.addText("New종신", { x: 0.88, y: 2.8, w: 9, h: 0.95, margin: 0, fontFace: KF, fontSize: 46, bold: true, color: W, align: "left" });
s1.addText("보험기간 중 요율 재산정과 담보 변경이 가능한 간편고지 종신보험", { x: 0.9, y: 3.85, w: 11, h: 0.4, margin: 0, fontFace: KF, fontSize: 18, color: "C7D2DC", align: "left" });
s1.addText("상품개발팀  ·  2026", { x: 0.9, y: 6.7, w: 5, h: 0.3, margin: 0, fontFace: KF, fontSize: 11, color: "8FA0C4", align: "left" });

/* ================= S2 상품 개요 ================= */
const s2 = pres.addSlide();
chrome(s2, 2, "상품 개요", "상품 컨셉");
head(s2,
  [{ t: "보험기간 중 " }, { t: "요율 재산정", h: 1 }, { t: "과 " }, { t: "담보 변경", h: 1 }, { t: "이 가능한 간편고지 종신보험임" }],
  "간편고지 3·1·5~3·5·5 종신 + 통합한도 건강담보 1종, 해지·재가입 없이 한 계약 내에서 변경함");

function card2(x, title, bodyRuns, chipTxt, chipBg, chipFg) {
  s2.addShape(pres.ShapeType.rect, { x, y: 2.5, w: 5.55, h: 0.52, fill: { color: NAVY }, line: { type: "none" } });
  s2.addText(title, { x, y: 2.5, w: 5.55, h: 0.52, margin: 0, fontFace: KF, fontSize: 15, bold: true, color: W, align: "center", valign: "middle" });
  s2.addShape(pres.ShapeType.rect, { x, y: 3.02, w: 5.55, h: 1.52, fill: { color: W }, line: { color: LINE, width: 0.75 } });
  s2.addText(bodyRuns, { x: x + 0.2, y: 3.02, w: 5.15, h: 1.52, margin: 0, fontFace: KF, align: "center", valign: "middle", lineSpacingMultiple: 1.25 });
  s2.addShape(pres.ShapeType.rect, { x, y: 4.62, w: 5.55, h: 0.55, fill: { color: chipBg }, line: { type: "none" } });
  s2.addText(chipTxt, { x, y: 4.62, w: 5.55, h: 0.55, margin: 0, fontFace: KF, fontSize: 14, bold: true, color: chipFg, align: "center", valign: "middle" });
}
card2(0.72, "무사고 전환 (리밸런싱)",
  [{ text: "무사고 1년마다 요율등급 1단계 하향", options: { fontSize: 13, color: INK, breakLine: true } },
   { text: "최대 3·5·5  ·  해지 없이 전환  ·  정산금 지급", options: { fontSize: 10.5, color: GRAY } }],
  "보험료 인하", CYANBG, "0E6D80");
card2(7.07, "중도부가 · 보장전환",
  [{ text: "보험기간 중 담보 추가", options: { fontSize: 13, color: INK, breakLine: true } },
   { text: "재원: 추가 보험료(중도부가) · 적립금(보장전환)", options: { fontSize: 10.5, color: GRAY, breakLine: true } },
   { text: "대상 담보 동일  ·  니즈 시점에 결정", options: { fontSize: 10.5, color: GRAY } }],
  "담보 추가", LAVBG, "3A44B5");
s2.addText("+", { x: 6.35, y: 3.35, w: 0.64, h: 0.7, margin: 0, fontFace: KF, fontSize: 34, bold: true, color: GBAR, align: "center", valign: "middle" });
s2.addShape(pres.ShapeType.rect, { x: 0.72, y: 5.42, w: 11.9, h: 0.6, fill: { color: NAVY }, line: { type: "none" } });
s2.addText([
  { text: "다이나믹 프라이싱:  ", options: { bold: true } },
  { text: "위 두 기능의 작동 전제로 모든 변경 시점에 그 시점 건강으로 재산정, 거절 없는 인수", options: {} },
], { x: 0.72, y: 5.42, w: 11.9, h: 0.6, margin: 0, fontFace: KF, fontSize: 13, color: W, align: "center", valign: "middle" });
s2.addText("타사 유사 기능은 대상·금액·시점이 가입 시점에 확정됨(삼성·DB·신한 동일), New종신은 보험기간 중 변경 가능함",
  { x: 0.72, y: 6.28, w: 11.9, h: 0.36, margin: 0, fontFace: KF, fontSize: 13, bold: true, color: BLUE, align: "center", valign: "middle" });
s2.addText("* 3·1·5: 3개월 치료이력 · 1년 입원수술 · 5년 중대질병 고지, 뒤로 갈수록 완화된 등급",
  { x: 0.72, y: 6.72, w: 11.9, h: 0.22, margin: 0, fontFace: KF, fontSize: 8.5, color: MUT, align: "left" });

/* ================= S3 무사고 전환 ================= */
const s3 = pres.addSlide();
chrome(s3, 3, "1. 무사고 전환 (리밸런싱)", "➊ 요율등급 하향");
head(s3,
  [{ t: "무사고 1년마다 요율등급이 " }, { t: "1단계 하향", h: 1 }, { t: "됨 (최대 3·5·5)" }],
  "해지 없이 전환되어 면책·감액 기간 미발생, 등급 간 준비금 차액은 정산금으로 지급됨");

band(s3, 0.72, 2.48, 11.9, "무사고 기간 경과에 따른 보험료 추이  (예시)", NAVY, W);
s3.addShape(pres.ShapeType.rect, { x: 0.72, y: 2.88, w: 11.9, h: 3.5, fill: { color: "FBFCFE" }, line: { color: LINE, width: 0.75 } });
s3.addText("보험료 지수 (가입 = 100)", { x: 0.95, y: 3.0, w: 2.5, h: 0.22, margin: 0, fontFace: KF, fontSize: 9, color: GRAY, align: "left" });
// 범례
s3.addShape(pres.ShapeType.rect, { x: 8.7, y: 3.02, w: 0.18, h: 0.18, fill: { color: GBAR }, line: { type: "none" } });
s3.addText("기존 간편고지", { x: 8.92, y: 3.0, w: 1.3, h: 0.22, margin: 0, fontFace: KF, fontSize: 9, color: GRAY });
s3.addShape(pres.ShapeType.rect, { x: 10.3, y: 3.02, w: 0.18, h: 0.18, fill: { color: BLUE }, line: { type: "none" } });
s3.addText("New종신", { x: 10.52, y: 3.0, w: 1.1, h: 0.22, margin: 0, fontFace: KF, fontSize: 9, color: GRAY });

const BASE = 5.55, HMAX = 1.88;
const grpX = [2.39, 4.57, 6.75, 8.93, 11.11];
const grades = ["3·1·5", "3·2·5", "3·3·5", "3·4·5", "3·5·5"];
const vals = [100, 94, 88, 83, 78];
const xlab = ["가입", "+1년", "+2년", "+3년", "+4년"];
// 100 가이드 점선
s3.addShape(pres.ShapeType.line, { x: 1.35, y: BASE - HMAX, w: 10.9, h: 0, line: { color: GBAR, width: 0.75, dashType: "dash" } });
s3.addText("가입 시점 100", { x: 1.4, y: BASE - HMAX - 0.24, w: 1.4, h: 0.2, margin: 0, fontFace: KF, fontSize: 8, color: MUT });
for (let i = 0; i < 5; i++) {
  const gx = grpX[i] - 0.68, bx = grpX[i] + 0.06;
  s3.addShape(pres.ShapeType.rect, { x: gx, y: BASE - HMAX, w: 0.62, h: HMAX, fill: { color: GBAR }, line: { type: "none" } });
  const bh = HMAX * vals[i] / 100;
  s3.addShape(pres.ShapeType.rect, { x: bx, y: BASE - bh, w: 0.62, h: bh, fill: { color: BLUE }, line: { type: "none" } });
  s3.addText(grades[i], { x: bx - 0.14, y: BASE - bh - 0.26, w: 0.9, h: 0.22, margin: 0, fontFace: KF, fontSize: 9.5, bold: true, color: BLUE, align: "center" });
  s3.addText(String(vals[i]), { x: bx, y: BASE - 0.28, w: 0.62, h: 0.22, margin: 0, fontFace: KF, fontSize: 9, bold: true, color: W, align: "center" });
  s3.addText(xlab[i], { x: grpX[i] - 0.75, y: BASE + 0.08, w: 1.5, h: 0.22, margin: 0, fontFace: KF, fontSize: 10, color: INK, align: "center" });
}
s3.addShape(pres.ShapeType.line, { x: 1.35, y: BASE, w: 10.9, h: 0, line: { color: GDARK, width: 1 } });
// 강조 박스 (+4년)
s3.addShape(pres.ShapeType.roundRect, { x: 10.33, y: 3.52, w: 1.6, h: 2.32, rectRadius: 0.05, fill: { color: W, transparency: 100 }, line: { color: RED, width: 1.25, dashType: "dash" } });
s3.addText("4등급 하향 · 보험료 22% 인하 (예시)", { x: 9.4, y: 5.9, w: 3.1, h: 0.24, margin: 0, fontFace: KF, fontSize: 10.5, bold: true, color: RED, align: "center" });
// 말풍선
s3.addShape(pres.ShapeType.roundRect, { x: 4.6, y: 2.98, w: 3.9, h: 0.46, rectRadius: 0.1, fill: { color: YEL }, line: { color: YELB, width: 1 } });
s3.addText("등급 하향 시 준비금 차액을 정산금으로 지급", { x: 4.6, y: 2.98, w: 3.9, h: 0.46, margin: 0, fontFace: KF, fontSize: 10.5, bold: true, color: INK, align: "center", valign: "middle" });
s3.addShape(pres.ShapeType.triangle, { x: 4.95, y: 3.43, w: 0.22, h: 0.15, rotate: 180, fill: { color: YEL }, line: { color: YELB, width: 1 } });
// ✕ / ○
s3.addText("✕  기존: 인하 수단은 해지 후 재가입  →  보장 공백", { x: 0.9, y: 6.48, w: 5.8, h: 0.28, margin: 0, fontFace: KF, fontSize: 12, bold: true, color: RED, align: "left" });
s3.addText("○  New종신: 해지 없이 전환 · 정산금 지급 · 공백 없음", { x: 6.9, y: 6.48, w: 5.7, h: 0.28, margin: 0, fontFace: KF, fontSize: 12, bold: true, color: BLUE, align: "left" });
s3.addText("* 보험료 지수는 예시 가정(등급당 5~6%)이며 실제 요율은 산출 결과에 따름", { x: 0.9, y: 6.86, w: 11.5, h: 0.2, margin: 0, fontFace: KF, fontSize: 8.5, color: MUT });

/* ================= S4 중도부가·보장전환 — 여정 익시빗 ================= */
const s4 = pres.addSlide();
chrome(s4, 4, "2. 중도부가 · 보장전환", "➋ 담보 추가");
head(s4,
  [{ t: "보험기간 중 담보를 추가할 수 있음, 시점·재원은 " }, { t: "고객이 선택", h: 1 }, { t: "함" }],
  "재원은 추가 보험료(중도부가) 또는 적립금(보장전환), 대상 담보는 동일함");

band(s4, 0.72, 2.48, 11.9, "가입자 여정 (30세 가입 예시)", NAVY, W);
s4.addShape(pres.ShapeType.rect, { x: 0.72, y: 2.88, w: 11.9, h: 3.42, fill: { color: "FBFCFE" }, line: { color: LINE, width: 0.75 } });
// 보장 밴드 (계단)
s4.addShape(pres.ShapeType.rect, { x: 1.1, y: 4.08, w: 11.2, h: 0.52, fill: { color: BLUEBG }, line: { color: BLUE, width: 0.75 } });
s4.addText("종신사망 (주계약)", { x: 1.3, y: 4.08, w: 3, h: 0.52, margin: 0, fontFace: KF, fontSize: 11, bold: true, color: BLUE, align: "left", valign: "middle" });
s4.addShape(pres.ShapeType.rect, { x: 6.6, y: 3.68, w: 5.7, h: 0.36, fill: { color: CYANBG }, line: { color: "2FA8C0", width: 0.75 } });
s4.addText("정기특약(사망보장 증액)", { x: 6.75, y: 3.68, w: 3.6, h: 0.36, margin: 0, fontFace: KF, fontSize: 10, bold: true, color: "0E6D80", align: "left", valign: "middle" });
s4.addShape(pres.ShapeType.rect, { x: 9.6, y: 3.3, w: 2.7, h: 0.34, fill: { color: LAVBG }, line: { color: LAV, width: 0.75 } });
s4.addText("월렛 특약(통합한도 건강)", { x: 9.72, y: 3.3, w: 2.55, h: 0.34, margin: 0, fontFace: KF, fontSize: 10, bold: true, color: "3A44B5", align: "left", valign: "middle" });
s4.addText("보장 구성", { x: 1.1, y: 3.06, w: 1.5, h: 0.22, margin: 0, fontFace: KF, fontSize: 9, color: GRAY });
// 점선 가이드
s4.addShape(pres.ShapeType.line, { x: 6.6, y: 3.68, w: 0, h: 1.62, line: { color: GBAR, width: 0.75, dashType: "dash" } });
s4.addShape(pres.ShapeType.line, { x: 9.6, y: 3.3, w: 0, h: 2.0, line: { color: GBAR, width: 0.75, dashType: "dash" } });
// 타임라인
s4.addShape(pres.ShapeType.line, { x: 1.1, y: 5.3, w: 11.2, h: 0, line: { color: NAVY, width: 1.5 } });
const nodes = [
  { x: 1.7, age: "30세", ev: "가입", sub: "종신사망만", c: GDARK },
  { x: 4.4, age: "35세", ev: "무사고 전환", sub: "3·1·5→3·2·5 · 정산금 (예시)", c: "0E9CB8" },
  { x: 6.6, age: "36세", ev: "정기특약 중도부가", sub: "", c: BLUE, chip: "재원: 추가 보험료", chipC: BLUE },
  { x: 9.6, age: "55세", ev: "월렛 보장전환", sub: "", c: "3A44B5", chip: "재원: 적립금", chipC: "3A44B5" },
];
nodes.forEach(n => {
  s4.addShape(pres.ShapeType.ellipse, { x: n.x - 0.08, y: 5.22, w: 0.16, h: 0.16, fill: { color: n.c }, line: { color: W, width: 1.5 } });
  s4.addText(n.age, { x: n.x - 0.75, y: 5.44, w: 1.5, h: 0.24, margin: 0, fontFace: KF, fontSize: 11, bold: true, color: INK, align: "center" });
  s4.addText(n.ev, { x: n.x - 1.05, y: 5.68, w: 2.1, h: 0.22, margin: 0, fontFace: KF, fontSize: 10, bold: true, color: n.c, align: "center" });
  if (n.sub) s4.addText(n.sub, { x: n.x - 1.35, y: 5.9, w: 2.7, h: 0.2, margin: 0, fontFace: KF, fontSize: 8.5, color: GRAY, align: "center" });
  if (n.chip) {
    s4.addShape(pres.ShapeType.roundRect, { x: n.x - 0.85, y: 5.92, w: 1.7, h: 0.26, rectRadius: 0.13, fill: { color: W }, line: { color: n.chipC, width: 0.75 } });
    s4.addText(n.chip, { x: n.x - 0.85, y: 5.92, w: 1.7, h: 0.26, margin: 0, fontFace: KF, fontSize: 8.5, bold: true, color: n.chipC, align: "center", valign: "middle" });
  }
});
s4.addShape(pres.ShapeType.triangle, { x: 12.28, y: 5.22, w: 0.16, h: 0.16, rotate: 90, fill: { color: NAVY }, line: { type: "none" } });
// DP 스트립
s4.addShape(pres.ShapeType.rect, { x: 0.72, y: 6.42, w: 11.9, h: 0.36, fill: { color: NAVY }, line: { type: "none" } });
s4.addText("다이나믹 프라이싱: 모든 변경 시점에 그 시점 건강으로 재산정, 악화 시에도 거절 없음", { x: 0.72, y: 6.42, w: 11.9, h: 0.36, margin: 0, fontFace: KF, fontSize: 11, bold: true, color: W, align: "center", valign: "middle" });
s4.addText("* 여정·연령은 예시, 중도부가·보장전환의 대상 담보는 동일하며 재원만 상이함", { x: 0.9, y: 6.88, w: 11.5, h: 0.2, margin: 0, fontFace: KF, fontSize: 8.5, color: MUT });

/* ================= S5 다이나믹 프라이싱 ================= */
const s5 = pres.addSlide();
chrome(s5, 5, "3. 다이나믹 프라이싱", "➌ 요율 재산정");
head(s5,
  [{ t: "모든 변경 시점에 그 시점 건강으로 " }, { t: "요율을 재산정", h: 1 }, { t: "함" }],
  "간편고지 3문항 · 무조건 인수, 무사고 전환·중도부가·보장전환 모두 이 재산정을 전제로 작동함");

band(s5, 4.0, 2.62, 4.05, "기존 간편고지 종신", GDARK, W);
band(s5, 8.35, 2.62, 4.27, "New종신", BLUE, W);
function rowTag(y, main, sub) {
  s5.addShape(pres.ShapeType.roundRect, { x: 0.9, y: y + 0.22, w: 2.5, h: 0.5, rectRadius: 0.25, fill: { color: NAVY }, line: { type: "none" } });
  s5.addText(main, { x: 0.9, y: y + 0.22, w: 2.5, h: 0.5, margin: 0, fontFace: KF, fontSize: 13, bold: true, color: W, align: "center", valign: "middle" });
  s5.addText(sub, { x: 0.9, y: y + 0.76, w: 2.5, h: 0.24, margin: 0, fontFace: KF, fontSize: 9.5, color: GRAY, align: "center" });
}
function cell(x, y, w, mark, main, sub, neg) {
  s5.addShape(pres.ShapeType.rect, { x, y, w, h: 1.22, fill: { color: neg ? REDBG : BLUEBG }, line: { color: neg ? RED : BLUE, width: 0.75 } });
  s5.addText([
    { text: mark + "  " + main, options: { fontSize: 13.5, bold: true, color: neg ? RED : BLUE, breakLine: true } },
    { text: sub, options: { fontSize: 10.5, color: GDARK } },
  ], { x: x + 0.2, y, w: w - 0.4, h: 1.22, margin: 0, fontFace: KF, align: "center", valign: "middle", lineSpacingMultiple: 1.3 });
}
rowTag(3.28, "건강 개선", "무사고 4년");
cell(4.0, 3.4, 4.05, "✕", "보험료 변동 없음", "가입 요율로 만기까지 지수 100 유지", true);
cell(8.35, 3.4, 4.27, "○", "3·5·5 인하 + 정산금", "보험료 지수 100 → 78 (예시)", false);
rowTag(4.78, "건강 악화", "고혈압 진단 (예시)");
cell(4.0, 4.9, 4.05, "✕", "거절 또는 부담보", "보장을 추가할 수 없음", true);
cell(8.35, 4.9, 4.27, "○", "3·4·5 인수 · 거절 없음", "그 시점 등급으로 요율 반영", false);
s5.addText("개선·악화 모두 미반영됨", { x: 4.0, y: 6.32, w: 4.05, h: 0.3, margin: 0, fontFace: KF, fontSize: 12, bold: true, color: RED, align: "center" });
s5.addText("개선·악화 모두 그 시점 요율로 반영됨", { x: 8.35, y: 6.32, w: 4.27, h: 0.3, margin: 0, fontFace: KF, fontSize: 12, bold: true, color: BLUE, align: "center" });
s5.addText("* 지수는 등급당 5~6% 가정 예시, 재산정 발생 시점은 무사고 전환·중도부가·보장전환", { x: 0.9, y: 6.86, w: 11.5, h: 0.2, margin: 0, fontFace: KF, fontSize: 8.5, color: MUT });

/* ================= S6 기대 효과 및 검토 필요 사항 ================= */
const s6 = pres.addSlide();
chrome(s6, 6, "4. 기대 효과 및 검토 필요 사항", "기대 효과");
head(s6,
  [{ t: "건강 변화·니즈 발생 시점의 " }, { t: "고객 결과가 개선", h: 1 }, { t: "됨" }],
  "파일럿 대상: 사망담보(요율 고정 기간 최장, 담보 수 최소로 기능 검증 가능)");

band(s6, 0.72, 2.5, 5.3, "기존 종신", GDARK, W);
band(s6, 7.32, 2.5, 5.3, "New종신", BLUE, W);
function outCard(x, y, w, mark, l1, l2, neg, darkFill) {
  const fill = darkFill ? NAVY : CELLG;
  const c1 = darkFill ? W : (neg ? RED : BLUE);
  const c2 = darkFill ? "C7D2DC" : GDARK;
  s6.addShape(pres.ShapeType.roundRect, { x, y, w, h: 1.3, rectRadius: 0.06, fill: { color: fill }, line: darkFill ? { type: "none" } : { color: LINE, width: 0.75 } });
  s6.addText([
    { text: mark + "  " + l1, options: { fontSize: 13, bold: true, color: neg && !darkFill ? RED : c1, breakLine: true } },
    { text: l2, options: { fontSize: 10.5, color: c2 } },
  ], { x: x + 0.25, y, w: w - 0.5, h: 1.3, margin: 0, fontFace: KF, align: "center", valign: "middle", lineSpacingMultiple: 1.3 });
}
outCard(1.0, 3.16, 4.75, "✕", "건강 개선 시", "요율 변동 없음, 인하 수단은 해지·재가입뿐", true, false);
outCard(1.0, 4.66, 4.75, "✕", "보장 니즈 발생 시", "추가 불가, 악화 시 신규 가입도 거절·부담보", true, false);
outCard(7.6, 3.16, 4.75, "○", "건강 개선 시", "요율등급 하향(최대 22% 인하 예시) + 정산금 지급", false, true);
outCard(7.6, 4.66, 4.75, "○", "보장 니즈 발생 시", "중도부가·보장전환으로 추가, 거절 없음", false, true);
s6.addShape(pres.ShapeType.rightArrow, { x: 6.25, y: 4.35, w: 0.55, h: 0.44, fill: { color: BLUE }, line: { type: "none" } });
s6.addShape(pres.ShapeType.roundRect, { x: 0.72, y: 6.3, w: 11.9, h: 0.66, rectRadius: 0.05, fill: { color: W }, line: { color: LINE, width: 0.75 } });
s6.addText([
  { text: "검토 필요 사항 (병행 진행 중)", options: { fontSize: 10.5, bold: true, color: NAVY, breakLine: true } },
  { text: "① 계리: 무사고·사망률 상관 검증, 정산금 구조      ② 규제: 중도부가 분류, 정산금 법적 성격      ③ 채널: 수수료 구조 정합성", options: { fontSize: 10, color: GDARK } },
], { x: 0.95, y: 6.3, w: 11.5, h: 0.66, margin: 0, fontFace: KF, align: "left", valign: "middle", lineSpacingMultiple: 1.25 });

pres.writeFile({ fileName: "decks/v5_rebuild.pptx" }).then(() => console.log("saved v5_rebuild.pptx"));
