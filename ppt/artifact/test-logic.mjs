/** 덱보드 순수 로직 회귀 테스트 — `npm run artifact:test`
 *  조립된 deckboard.jsx를 React·window.storage 스텁 위에서 실행해 판정 함수들을 직접 검증한다.
 *  아티팩트는 claude.ai에서만 렌더되므로, 규칙 판정·이월·정규화 같은 순수 로직만이라도
 *  저장소에서 기계적으로 지킨다. 렌더 층위(포커스·배너·모달)는 수동 확인 대상. */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "deckboard.jsx");
const TMP = join(tmpdir(), "deckboard-test.jsx");
const OUT = join(tmpdir(), "deckboard-test.cjs");

let src = readFileSync(SRC, "utf-8");
src = src.replace(/^import .*$/m, "const useState=()=>[],useEffect=()=>{},useRef=()=>({current:null});");
src = src.replace("export default function App()", "function App()");
// 테스트 대상 내부 함수를 밖으로 노출
src += `
export const __t = { RULES, PROMPTS, AI_TPLS, MANUAL_TPLS, tplName, lintText, lintHead, validP, normalizeDeck, holeSettled, anyFresh, loadRuns, pickCounts, parseHead, stripHl, CDN_SRCS, MIGRATE_CAP, RUNS_KEY, RUNS_V1_KEY };
`;
writeFileSync(TMP, src);
execSync(`npx esbuild ${TMP} --loader:.jsx=jsx --jsx=transform --jsx-factory=__h --jsx-fragment=__f --format=cjs --outfile=${OUT}`, { stdio: "pipe" });

globalThis.__h = () => null;
globalThis.__f = () => null;
const store = new Map();
globalThis.window = { storage: { get: async (k) => (store.has(k) ? { value: store.get(k) } : null), set: async (k, v) => void store.set(k, v) } };

const mod = await import(OUT);
const T = mod.__t || mod.default?.__t;
if (!T) { console.error("노출 실패:", Object.keys(mod), Object.keys(mod.default || {})); process.exit(2); }

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "} ${name}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

console.log("\n[P3] AI 후보는 관계어 사전 15종으로 제한 · 파생/구조 장 제외");
eq("AI_TPLS 크기 = templates 수", T.AI_TPLS.size, T.RULES.relwords.templates.length);
eq("AI_TPLS에 파생형(journey) 없음", T.AI_TPLS.has("journey"), false);
eq("AI_TPLS에 구조 장(section) 없음", T.AI_TPLS.has("section"), false);
eq("AI_TPLS에 관계어(option_table) 있음", T.AI_TPLS.has("option_table"), true);

console.log("\n[P6] 수동 선택지에서 구조 장 제외 (파생형은 유지)");
const manual = T.MANUAL_TPLS.map((t) => t.tpl);
eq("수동 목록에 journey 포함", manual.includes("journey"), true);
eq("수동 목록에 compare_rows 포함", manual.includes("compare_rows"), true);
eq("수동 목록에 section 없음", manual.includes("section"), false);
eq("수동 목록에 cover 없음", manual.includes("cover"), false);
eq("tplName이 파생형 이름 해석", T.tplName("journey"), "가입자 여정");

console.log("\n[lint] 엔진 textcheck와 판정 일치 — 행두 접두 금지 추가분");
eq("행두 '- ' 검출", T.lintText("- 항목 하나").some((i) => i.code !== undefined || /줄머리/.test(i.msg)), true);
eq("대시(—) 검출", T.lintText("가정임 — 근거 필요").some((i) => /금지 기호/.test(i.msg)), true);
eq("정상 문장은 무이슈", T.lintText("보험료가 인하됨"), []);
eq("은유 금칙 검출", T.lintText("세 기능의 엔진임").some((i) => /은유/.test(i.msg)), true);

console.log("\n[normalizeDeck] 결손 덱 보정 — 흰 화면 방지 (중간4)");
const nd = T.normalizeDeck({ id: "d1", chain: [{ id: "c1" }, { junk: 1 }] });
eq("definition 생성", nd.definition.q1, "");
eq("priors 생성", nd.definition.priors.seen, "");
eq("holes 배열화", nd.holes, []);
eq("archivedHoles 배열화", nd.archivedHoles, []);
eq("id 없는 줄 제거", nd.chain.length, 1);
eq("status 기본값", nd.chain[0].status, "draft");
eq("nextRowId 보정", nd.nextRowId, 3);
eq("id 없으면 null", T.normalizeDeck({ chain: [] }), null);
eq("객체 아니면 null", T.normalizeDeck("문자열"), null);

console.log("\n[holeSettled] 룰북 §7 필수 입력 강제 (중간6)");
eq("처분 없음 → 미완", T.holeSettled({ disposition: null, memo: "", reason: "" }), false);
eq("반영 → 완료", T.holeSettled({ disposition: "apply", memo: "", reason: "" }), true);
eq("구두+메모 없음 → 미완", T.holeSettled({ disposition: "verbal", memo: "", reason: "" }), false);
eq("구두+공백 메모 → 미완", T.holeSettled({ disposition: "verbal", memo: "   ", reason: "" }), false);
eq("구두+메모 → 완료", T.holeSettled({ disposition: "verbal", memo: "이렇게 답함", reason: "" }), true);
eq("기각+사유 없음 → 미완", T.holeSettled({ disposition: "reject", memo: "", reason: "" }), false);
eq("기각+사유 → 완료", T.holeSettled({ disposition: "reject", memo: "", reason: "층위 다름" }), true);

console.log("\n[anyFresh] 정의서 stale 판정 (P1)");
eq("빈 holes → 표시 불필요", T.anyFresh([]), false);
eq("전건 stale → 표시 불필요", T.anyFresh([{ stale: true }, { stale: true }]), false);
eq("하나라도 fresh → 표시 필요", T.anyFresh([{ stale: true }, { stale: false }]), true);

console.log("\n[P4] formstudy v1 → v2 1회 이월");
store.clear();
store.set(T.RUNS_V1_KEY, JSON.stringify([
  { ts: 100, msg: "구 메시지", rel: "비교", cands: ["bars", "trend"], pick: "bars" },
  { ts: 200, msg: "구 메시지2", rel: "전환", cands: ["before_after"], pick: "before_after" },
]));
let migrated = 0;
const r1 = await T.loadRuns((n) => { migrated = n; });
eq("이월 건수 통보", migrated, 2);
eq("v2에 2건 기록", r1.length, 2);
eq("deckId null", r1[0].deckId, null);
eq("p null (지시서 복원 불가)", r1[0].p, null);
eq("assumed null (미상 — false로 단정 안 함)", r1[0].assumed, null);
eq("ctx 빈 문자열", r1[0].ctx, "");
eq("from 마커", r1[0].from, "v1");
eq("pick 보존", r1[0].pick, "bars");
eq("v2 키에 저장됨", JSON.parse(store.get(T.RUNS_KEY)).length, 2);

migrated = 0;
const r2 = await T.loadRuns((n) => { migrated = n; });
eq("재호출 시 이월 안 함 (1회 보장)", migrated, 0);
eq("중복 안 쌓임", r2.length, 2);

// v2만 외부에서 지워진 경우에도 ts dedupe가 안전망
store.set(T.RUNS_KEY, JSON.stringify([{ ts: 100, pick: "bars", from: "v1" }]));
const r3 = await T.loadRuns();
eq("v2 비어있지 않으면 그대로", r3.length, 1);

console.log("\n[P4] 승률 집계 (이월분 포함)");
eq("pick 빈도 내림차순", T.pickCounts([{ pick: "bars" }, { pick: "flow" }, { pick: "bars" }]), [["bars", 2], ["flow", 1]]);
eq("pick 없는 기록 무시", T.pickCounts([{ pick: "" }, { pick: "bars" }]), [["bars", 1]]);

console.log("\n[P5] CDN 폴백 소스");
eq("3단 폴백", T.CDN_SRCS.length, 3);
eq("cdnjs 1차", /cdnjs\.cloudflare\.com/.test(T.CDN_SRCS[0]), true);
eq("jsdelivr 2차", /jsdelivr/.test(T.CDN_SRCS[1]), true);
eq("unpkg 3차", /unpkg/.test(T.CDN_SRCS[2]), true);
eq("이월 상한 < 300", T.MIGRATE_CAP < 300, true);

console.log("\n[형광 파싱] deck-spec runs 변환");
eq("[[ ]] → hl run", T.parseHead("무사고 [[1단계 하향]]됨"), [{ t: "무사고 " }, { t: "1단계 하향", hl: true }, { t: "됨" }]);
eq("stripHl", T.stripHl("무사고 [[1단계 하향]]됨"), "무사고 1단계 하향됨");

console.log("\n[validP] 폼 파라미터 형태 검증 (렌더 크래시 차단)");
eq("bars 정상", T.validP("bars", { items: [{ l: "A", v: 1 }, { l: "B", v: 2 }] }), true);
eq("bars items가 객체면 거부", T.validP("bars", { items: { a: 1 } }), false);
eq("bars v가 문자열이면 거부", T.validP("bars", { items: [{ l: "A", v: "1" }, { l: "B", v: 2 }] }), false);
eq("필수 필드 누락 거부", T.validP("layer", { items: ["a", "b", "c"] }), false);
eq("min 미달 거부", T.validP("layer", { base: "토대", items: ["a"] }), false);

console.log("\n[M1] 표 템플릿 2종 (rules v0.3.0)");
eq("AI_TPLS 17종", T.AI_TPLS.size, 17);
eq("perf_table 후보 편입", T.AI_TPLS.has("perf_table"), true);
eq("compare_table 후보 편입", T.AI_TPLS.has("compare_table"), true);
eq("tplName 실적표", T.tplName("perf_table"), "실적표");
const tblOk = { cols: ["계획", "실적"], rows: [{ l: "신계약", cells: ["10", { t: "12", tone: "ok" }] }, { l: "손해율", cells: ["80%", "78%"] }] };
eq("perfRow 정상", T.validP("perf_table", tblOk), true);
eq("cells 열 수 불일치 거부", T.validP("perf_table", { cols: ["계획", "실적"], rows: [{ l: "a", cells: ["1"] }, { l: "b", cells: ["1", "2"] }] }), false);
eq("빈 셀 거부", T.validP("perf_table", { cols: ["계획", "실적"], rows: [{ l: "a", cells: ["1", ""] }, { l: "b", cells: ["1", "2"] }] }), false);
eq("행 1개 거부 (min 2)", T.validP("perf_table", { cols: ["계획", "실적"], rows: [{ l: "a", cells: ["1", "2"] }] }), false);
eq("compare_table 6열 허용", T.validP("compare_table", { cols: ["당사", "A", "B", "C", "D", "E"], rows: [{ l: "a", cells: ["1", "2", "3", "4", "5", "6"] }, { l: "b", cells: ["1", "2", "3", "4", "5", "6"] }] }), true);
eq("perf_table 6열 거부 (max 5)", T.validP("perf_table", { cols: ["a", "b", "c", "d", "e", "f"], rows: [{ l: "a", cells: ["1", "2", "3", "4", "5", "6"] }, { l: "b", cells: ["1", "2", "3", "4", "5", "6"] }] }), false);

console.log("\n[M4] 문체 교정 프롬프트 배선 (rules v0.3.2)");
eq("headlineRewrite 존재", typeof T.PROMPTS.headlineRewrite, "string");
eq("정적 슬롯 {{RULES.STYLE}} 해소", T.PROMPTS.headlineRewrite.includes("{{RULES.STYLE}}"), false);
eq("런타임 슬롯 {{HEADLINE}} 잔존", T.PROMPTS.headlineRewrite.includes("{{HEADLINE}}"), true);
eq("런타임 슬롯 {{VIOLATIONS}} 잔존", T.PROMPTS.headlineRewrite.includes("{{VIOLATIONS}}"), true);
eq("종결어미 규정 포함", T.PROMPTS.headlineRewrite.includes("함/됨/임"), true);
eq("금지 기호 규정 포함", T.PROMPTS.headlineRewrite.includes("—"), true);

console.log(`\n${"=".repeat(50)}\n통과 ${pass} / 실패 ${fail}`);
process.exit(fail ? 1 : 0);
