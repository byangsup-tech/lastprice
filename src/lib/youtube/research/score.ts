import type {
  CandidateEvidence,
  CandidateNews,
  ChannelProfile,
  RawSignal,
  ResearchSourceId,
  TopicCandidate,
} from "../types";
import { clamp01, clampText, hashId, normalizeKey } from "../util";

/**
 * 리서치 점수화 — 순수 함수만 (네트워크·파일 없음, 단위 테스트 대상).
 *
 * - tokenize: 한국어 토큰화 (조사 제거 + 불용어 제거), bigrams: 문자 바이그램, jaccard
 * - clusterHeadlines: 뉴스 제목 클러스터링 (바이그램 Jaccard ≥ 0.3 또는 정규화 토큰 공유)
 * - mergeCandidates: 원시 신호를 정규화 제목 기준으로 병합 (완전 일치 + 포함 관계)
 * - scoreCandidate: 0.40 수요 / 0.25 경쟁 / 0.25 적합 / 0.10 신선 → 적합도 게이트·승수, 제외 키워드·오프니치 마커
 */

// ── 토큰화 ───────────────────────────────────────────────────

/** 제목에서 흔히 나오지만 주제를 말해주지 않는 토큰 */
export const STOPWORDS: ReadonlySet<string> = new Set([
  "그리고", "그러나", "하지만", "또한", "또는", "이번", "지난", "오늘", "내일", "올해", "내년", "작년",
  "대한", "위한", "통해", "통한", "관련", "대해", "위해", "이후", "이전", "최근", "가장", "더욱", "다시",
  "모두", "속보", "단독", "종합", "영상", "사진", "포토", "인터뷰", "칼럼", "기자", "뉴스", "오전", "오후",
  "이날", "있다", "없다", "한다", "했다", "된다", "됐다", "밝혔다", "말했다", "나섰다", "따르면", "무엇",
  "어떻게", "이유", "방법", "총정리", "정리", "추천", "비교", "하는", "되는", "있는", "없는", "대비", "예정",
  "이란", "이렇게", "그래서", "때문", "경우", "정도", "이상", "이하", "지금", "당시", "현재", "가운데",
  "그런데", "그냥", "진짜", "정말", "너무", "많이", "여기", "저기", "사람", "우리", "당신", "여러분",
  // 뉴스 제목의 범용 동사·명사 — 주제를 말해주지 않으면서 클러스터를 엮어 버리는 토큰
  "출시", "시행", "개최", "실시", "확대", "도입", "추진", "발표", "강화", "지원", "운영", "마련", "진행",
  "참여", "신설", "체결", "협약", "방문", "열려", "열린", "나서", "나선다", "공개", "선정", "개시", "시작",
  "예고", "논의", "검토", "점검", "행사", "기념", "본격", "잇따라", "속출", "눈길", "주목", "화제",
  "the", "and", "for", "with", "news", "vs",
]);

/** 뒤에 붙는 조사 (긴 것 먼저) */
const PARTICLES = [
  "으로", "에서", "까지", "부터", "이나", "처럼", "보다", "에게", "께서",
  "은", "는", "이", "가", "을", "를", "의", "에", "와", "과", "도", "로", "만",
];

/** 토큰이 3자 이상이면 뒤 조사를 떼어낸다 (남는 부분이 2자 이상일 때만, 최대 2회) */
export function stripParticle(token: string): string {
  let t = token;
  for (let round = 0; round < 2; round++) {
    if (t.length < 3) break;
    const p = PARTICLES.find((x) => t.endsWith(x) && t.length - x.length >= 2);
    if (!p) break;
    t = t.slice(0, t.length - p.length);
  }
  return t;
}

/** 한국어 토큰화 — NFC·소문자, 공백/구두점 분리, 2자 이상, 조사 제거, 불용어 제거, 중복 제거 */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const parts = text
    .normalize("NFC")
    .toLowerCase()
    .split(/[\s\p{P}\p{S}]+/u);
  for (const raw of parts) {
    if (!raw) continue;
    const t = stripParticle(raw);
    if (t.length < 2 || STOPWORDS.has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** 소문자 토큰 → 원문 표기(첫 등장) — 제목 생성 시 'NH농협생명' 같은 대소문자를 살리기 위함 */
export function tokenForms(text: string): Map<string, string> {
  const forms = new Map<string, string>();
  for (const raw of text.normalize("NFC").split(/[\s\p{P}\p{S}]+/u)) {
    if (!raw) continue;
    const orig = stripParticle(raw);
    const lower = orig.toLowerCase();
    if (lower.length < 2 || STOPWORDS.has(lower) || forms.has(lower)) continue;
    forms.set(lower, orig);
  }
  return forms;
}

/** 문자 바이그램 집합 — 2자 이상 토큰 각각의 내부 바이그램 (토큰 경계는 넘지 않음) */
export function bigrams(input: string | string[]): Set<string> {
  const tokens = Array.isArray(input) ? input : tokenize(input);
  const set = new Set<string>();
  for (const t of tokens) {
    if (t.length < 2) continue;
    for (let i = 0; i + 1 < t.length; i++) set.add(t.slice(i, i + 2));
  }
  return set;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

/** 키워드의 바이그램이 텍스트 바이그램에 얼마나 포함되는지 (0..1). 1자 키워드는 포함 여부 */
export function bigramOverlap(keyword: string, textBigrams: Set<string>, textNormalized?: string): number {
  const kw = normalizeKey(keyword);
  if (!kw) return 0;
  if (kw.length < 2) return textNormalized?.includes(kw) ? 1 : 0;
  const kb = bigrams([kw]);
  let hit = 0;
  for (const b of kb) if (textBigrams.has(b)) hit++;
  return kb.size ? hit / kb.size : 0;
}

// ── 채널 적합도 ──────────────────────────────────────────────

export interface FitResult {
  fit: number;
  /** 가장 잘 맞은 프로필 키워드 */
  keyword?: string;
  via: "title" | "news" | "none";
}

/**
 * fit = max over 프로필 키워드 of (제목이 키워드를 포함하면 1, 아니면 제목 바이그램 겹침).
 * 뉴스 제목에서만 걸리는 경우는 0.8 × (키워드를 포함한 헤드라인 비율) — 헤드라인 하나에 '경제'가 스친 연예 검색어가
 * 통과하지 못하게 비율로 본다 (제목 일치가 항상 우선).
 */
export function keywordFit(title: string, newsTitles: string[], keywords: string[]): FitResult {
  const titleNorm = normalizeKey(title);
  const titleBi = bigrams(title);
  const newsNorms = newsTitles.map(normalizeKey).filter(Boolean);
  // 제목이 포함하는 키워드 중 가장 긴 것 ('실손보험' > '보험')
  const included = keywords.filter((kw) => normalizeKey(kw) && titleNorm.includes(normalizeKey(kw))).sort((a, b) => b.length - a.length);
  if (included.length) return { fit: 1, keyword: included[0], via: "title" };
  let best: FitResult = { fit: 0, via: "none" };
  for (const kw of keywords) {
    const k = normalizeKey(kw);
    if (!k) continue;
    const t = bigramOverlap(kw, titleBi, titleNorm);
    if (t > best.fit) best = { fit: t, keyword: kw, via: "title" };
    if (newsNorms.length) {
      const hits = newsNorms.filter((n) => n.includes(k)).length;
      const n = 0.8 * (hits / newsNorms.length);
      if (n > best.fit) best = { fit: n, keyword: kw, via: "news" };
    }
  }
  return { ...best, fit: clamp01(best.fit) };
}

// ── 제외 키워드 · 오프니치 마커 ──────────────────────────────

/** 내장 오프니치 마커 (연예·스포츠·사건). 정규화된(공백 없는) 텍스트에 적용 — 경제 용어 '경기침체' 등은 예외 */
export const OFF_NICHE_MARKERS: { label: string; re: RegExp }[] = [
  { label: "선수", re: /선수(?!금)/ },
  { label: "배우", re: /배우(?!자|다|고|는법|기)/ },
  { label: "아이돌", re: /아이돌/ },
  { label: "걸그룹", re: /걸그룹/ },
  { label: "경기", re: /경기(?!침체|부양|회복|전망|지표|도|둔화|불황|호황|순환|하강|상승|과열|활성화)/ },
  { label: "체포", re: /체포/ },
  { label: "피의자", re: /피의자/ },
  { label: "구속", re: /구속/ },
  { label: "살인", re: /살인/ },
  { label: "열애", re: /열애/ },
  { label: "결혼설", re: /결혼설/ },
];

export interface MarkerHit {
  term: string;
  kind: "avoid" | "off-niche";
  where: "title" | "news";
}

function countMatches(texts: string[], test: (t: string) => boolean): number {
  let n = 0;
  for (const t of texts) if (test(t)) n++;
  return n;
}

/**
 * 제외 키워드/오프니치 마커 검사 — normalizeKey(제목)과 normalizeKey(뉴스 제목 각각)에 적용.
 * 제목에 걸리면 즉시 히트, 뉴스에서만 걸리면 2건 이상(뉴스가 1건뿐이면 그 1건)일 때 히트
 * (금융 기사 한 줄에 '구속' 등이 스치는 경우로 주제를 죽이지 않기 위함).
 */
export function findMarkerHit(title: string, newsTitles: string[], avoid: string[]): MarkerHit | null {
  const t = normalizeKey(title);
  const news = newsTitles.map(normalizeKey);
  const needed = news.length <= 1 ? 1 : 2;
  const checks: { term: string; kind: MarkerHit["kind"]; test: (s: string) => boolean }[] = [];
  for (const a of avoid) {
    const k = normalizeKey(a);
    if (k) checks.push({ term: a, kind: "avoid", test: (s) => s.includes(k) });
  }
  for (const m of OFF_NICHE_MARKERS) {
    checks.push({ term: m.label, kind: "off-niche", test: (s) => m.re.test(s) });
  }
  for (const c of checks) {
    if (c.test(t)) return { term: c.term, kind: c.kind, where: "title" };
  }
  for (const c of checks) {
    if (news.length && countMatches(news, c.test) >= needed) return { term: c.term, kind: c.kind, where: "news" };
  }
  return null;
}

// ── 뉴스 제목 클러스터링 ─────────────────────────────────────

export interface HeadlineItem {
  title: string;
  url: string;
  source?: string;
  publishedAt?: string;
}

export interface HeadlineCluster {
  items: HeadlineItem[];
  /** 클러스터 내 토큰 문서 빈도 (소문자 토큰) */
  tokenDf: Map<string, number>;
  /** 소문자 토큰 → 원문 표기 */
  tokenForm: Map<string, string>;
  /** 최신 발행 시각 */
  latestAt?: string;
}

/** "헤드라인 - 매체" → { title, source } (구글 뉴스 RSS 제목 형식) */
export function splitPublisher(title: string): { title: string; source?: string } {
  const m = title.match(/^(.*\S)\s+[-–|]\s+([^-–|]{1,40})$/);
  if (!m) return { title: title.trim() };
  return { title: m[1].trim(), source: m[2].trim() };
}

function queryTokenSet(query: string | undefined): Set<string> {
  const set = new Set<string>();
  if (!query) return set;
  const q = normalizeKey(query);
  for (const t of tokenize(query)) set.add(t);
  set.add(q);
  return set;
}

/** 두 제목이 같은 이야기인지 — 바이그램 Jaccard ≥ minJaccard 또는 토큰 공유(3자 이상 1개, 또는 2자 2개 이상) */
function related(a: Prepared, b: Prepared, minJaccard: number): boolean {
  if (jaccard(a.bi, b.bi) >= minJaccard) return true;
  let short = 0;
  for (const t of a.shareable) {
    if (!b.shareable.has(t)) continue;
    if (t.length >= 3) return true;
    short++;
    if (short >= 2) return true;
  }
  return false;
}

interface Prepared {
  it: HeadlineItem;
  tokens: string[];
  forms: Map<string, string>;
  /** 검색어 토큰을 뺀 공유 가능 토큰 */
  shareable: Set<string>;
  /** 공유 가능 토큰의 바이그램 (검색어가 있으면 검색어 바이그램은 제외 — 모든 결과가 검색어를 포함하므로) */
  bi: Set<string>;
}

/**
 * 제목 클러스터링 (스타 클러스터링 — 첫 항목이 씨앗):
 * 항목은 씨앗과 관련(바이그램 Jaccard ≥ minJaccard 또는 정규화 토큰 공유)이거나 어느 구성원과 강하게(Jaccard ≥ 0.5)
 * 겹치면 그 클러스터에 들어간다. 단일 연결로 이어 붙이면 범용 토큰 하나로 수십 건이 엮이므로 씨앗 기준을 쓴다.
 * 검색어가 주어지면 검색어 토큰·바이그램은 비교에서 제외한다. 결과는 (크기 desc, 최신순).
 */
export function clusterHeadlines(
  items: HeadlineItem[],
  opts: { query?: string; minJaccard?: number } = {},
): HeadlineCluster[] {
  const minJaccard = opts.minJaccard ?? 0.3;
  const qTokens = queryTokenSet(opts.query);
  const qList = [...qTokens].filter((q) => q.length >= 2);
  const isQueryToken = (t: string) => qTokens.has(t) || qList.some((q) => q.includes(t) || t.includes(q));
  const prepared: Prepared[] = items.map((it) => {
    const tokens = tokenize(it.title);
    const shareable = tokens.filter((t) => !isQueryToken(t));
    return { it, tokens, forms: tokenForms(it.title), shareable: new Set(shareable), bi: bigrams(shareable) };
  });
  type Work = { seed: Prepared; members: Prepared[] };
  const clusters: Work[] = [];
  for (const p of prepared) {
    const home = clusters.find(
      (c) => related(c.seed, p, minJaccard) || c.members.some((m) => m !== c.seed && jaccard(m.bi, p.bi) >= Math.max(0.5, minJaccard)),
    );
    if (home) home.members.push(p);
    else clusters.push({ seed: p, members: [p] });
  }
  const out: HeadlineCluster[] = clusters.map((c) => {
    const tokenDf = new Map<string, number>();
    const tokenForm = new Map<string, string>();
    let latest: string | undefined;
    for (const m of c.members) {
      for (const t of m.tokens) {
        tokenDf.set(t, (tokenDf.get(t) ?? 0) + 1);
        const form = m.forms.get(t);
        if (form && !tokenForm.has(t)) tokenForm.set(t, form);
      }
      const at = m.it.publishedAt;
      if (at && (!latest || at > latest)) latest = at;
    }
    const sorted = [...c.members].sort((a, b) => (b.it.publishedAt ?? "").localeCompare(a.it.publishedAt ?? ""));
    return { items: sorted.map((m) => m.it), tokenDf, tokenForm, latestAt: latest };
  });
  out.sort((a, b) => b.items.length - a.items.length || (b.latestAt ?? "").localeCompare(a.latestAt ?? ""));
  return out;
}

/**
 * 클러스터의 주제 제목: "<검색어> <빈출 토큰 1~2개>" (2건 이상에서 나온 토큰만).
 * 빈출 토큰이 없으면 대표(최신) 헤드라인을 40자로 줄여 사용.
 */
export function clusterTitle(cluster: HeadlineCluster, query?: string): string {
  const qTokens = queryTokenSet(query);
  const qNorm = query ? normalizeKey(query) : "";
  const frequent = [...cluster.tokenDf.entries()]
    .filter(([t, df]) => df >= 2 && !qTokens.has(t) && !(qNorm && (qNorm.includes(t) || t.includes(qNorm))))
    .filter(([t]) => !/^\d+$/.test(t))
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 2)
    .map(([t]) => cluster.tokenForm.get(t) ?? t);
  if (query && frequent.length) return `${query} ${frequent.join(" ")}`;
  const head = cluster.items[0]?.title ?? query ?? "";
  return clampText(splitPublisher(head).title, 40);
}

// ── 수요·신선도 변환 ─────────────────────────────────────────

/** 구글 트렌드 approx_traffic ("200+", "1000+", "10K+") → 0..1 (100→0.3, 1k→0.5, 10k→0.7, 100k→0.9) */
export function trafficToDemand(text: string | undefined): number {
  if (!text) return 0.3;
  const m = text.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*([kKmM]?)/);
  if (!m) return 0.3;
  let n = Number(m[1]);
  if (m[2].toLowerCase() === "k") n *= 1000;
  if (m[2].toLowerCase() === "m") n *= 1_000_000;
  if (!(n > 0)) return 0.3;
  return clamp01(Math.max(0.15, 0.3 + 0.2 * (Math.log10(n) - 2)));
}

/** 위키백과 일 조회수 → 0..1 (1k→0.3, 10k→0.6, 100k→0.9) */
export function countToDemand(count: number): number {
  if (!(count > 0)) return 0.1;
  return clamp01(Math.max(0.1, 0.3 * (Math.log10(count) - 2)));
}

/** 뉴스 클러스터 크기 → 수요 (1건 0.25, 2건 0.45, 4건 0.6, 8건 0.75, 16건 0.9) */
export function clusterSizeToDemand(size: number): number {
  if (size <= 1) return 0.25;
  return clamp01(0.3 + 0.15 * Math.log2(size));
}

/** 발행 시각 → 신선도 (≤48h 1.0, 7일 0.4, 14일 이상 0.1, 모르면 0.5) */
export function freshnessFromDate(iso: string | undefined, now: number = Date.now()): number {
  if (!iso) return 0.5;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0.5;
  const hours = Math.max(0, (now - t) / 3_600_000);
  if (hours <= 48) return 1;
  if (hours <= 168) return 1 - ((hours - 48) / 120) * 0.6; // 48h→1.0, 7d→0.4
  if (hours <= 336) return 0.4 - ((hours - 168) / 168) * 0.3; // 7d→0.4, 14d→0.1
  return 0.1;
}

// ── 후보 병합 ────────────────────────────────────────────────

const SOURCE_PRIORITY: Record<ResearchSourceId, number> = {
  "google-news": 5,
  "naver-news": 4,
  "google-trends": 3,
  wikipedia: 3,
  "youtube-data": 2,
  "suggest-yt": 1,
  "suggest-web": 1,
  "naver-datalab": 1,
  "llm-rerank": 0,
};

interface Acc {
  key: string;
  title: string;
  titlePriority: number;
  sources: CandidateEvidence[];
  news: Map<string, CandidateNews>;
  demand: number[];
  demandSources: Set<ResearchSourceId>;
  competition: number[];
  freshness: number[];
  llmFit?: number;
}

function newAcc(sig: RawSignal): Acc {
  return {
    key: normalizeKey(sig.keyword),
    title: sig.keyword.trim(),
    titlePriority: SOURCE_PRIORITY[sig.source] ?? 0,
    sources: [],
    news: new Map(),
    demand: [],
    demandSources: new Set(),
    competition: [],
    freshness: [],
  };
}

function absorb(acc: Acc, sig: RawSignal): void {
  const prio = SOURCE_PRIORITY[sig.source] ?? 0;
  const title = sig.keyword.trim();
  if (prio > acc.titlePriority || (prio === acc.titlePriority && title.length > acc.title.length && title.length <= 40)) {
    acc.title = title;
    acc.titlePriority = prio;
  }
  acc.sources.push(sig.evidence);
  for (const n of sig.news ?? []) {
    if (n.url && !acc.news.has(n.url)) acc.news.set(n.url, n);
  }
  if (typeof sig.demand === "number") {
    acc.demand.push(clamp01(sig.demand));
    acc.demandSources.add(sig.source);
  }
  if (typeof sig.competition === "number") acc.competition.push(clamp01(sig.competition));
  if (typeof sig.freshness === "number") acc.freshness.push(clamp01(sig.freshness));
  if (typeof sig.fit === "number") acc.llmFit = clamp01(sig.fit);
}

function mergeAcc(into: Acc, from: Acc): void {
  if (from.titlePriority > into.titlePriority || (from.titlePriority === into.titlePriority && from.title.length > into.title.length && from.title.length <= 40)) {
    into.title = from.title;
    into.titlePriority = from.titlePriority;
  }
  into.sources.push(...from.sources);
  for (const [u, n] of from.news) if (!into.news.has(u)) into.news.set(u, n);
  into.demand.push(...from.demand);
  for (const s of from.demandSources) into.demandSources.add(s);
  into.competition.push(...from.competition);
  into.freshness.push(...from.freshness);
  if (from.llmFit !== undefined) into.llmFit = from.llmFit;
}

/**
 * 포함 관계 병합 조건: 짧은 쪽이 4자 이상이고 긴 쪽과 길이 차이가 1자 이하 ('실손보험개편' ⊂ '실손보험개편안').
 * '실손보험' ⊂ '실손보험개편'처럼 2자 이상 붙으면 다른 주제로 보고 합치지 않는다 (짧은 키워드가 모든 하위 주제를 흡수하는 것을 막음).
 */
function containsVariant(shorter: string, longer: string): boolean {
  return shorter.length >= 4 && longer.length - shorter.length <= 1 && longer.includes(shorter);
}

/** 뉴스 제목들에서 자주 나오는 토큰 (키워드 추출용) */
function frequentTokens(titles: string[], limit: number): string[] {
  const df = new Map<string, number>();
  for (const t of titles) for (const tok of tokenize(t)) df.set(tok, (df.get(tok) ?? 0) + 1);
  return [...df.entries()]
    .filter(([tok, n]) => n >= 2 && !/^\d+$/.test(tok))
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, limit)
    .map(([tok]) => tok);
}

/**
 * 원시 신호 → 미채점 후보 (signals: demand/competition/freshness 병합, fit 0, score 0).
 * 병합: normalizeKey(keyword) 완전 일치 → 변형 포함 관계.
 */
export function mergeCandidates(raw: RawSignal[]): TopicCandidate[] {
  const byKey = new Map<string, Acc>();
  for (const sig of raw) {
    const key = normalizeKey(sig.keyword);
    if (!key) continue;
    let acc = byKey.get(key);
    if (!acc) {
      acc = newAcc(sig);
      byKey.set(key, acc);
    }
    absorb(acc, sig);
  }
  // 포함 관계 병합 — 짧은 키부터 확정하고 긴 키는 변형이면 흡수
  const kept: Acc[] = [];
  for (const acc of [...byKey.values()].sort((a, b) => a.key.length - b.key.length)) {
    const host = kept.find((k) => containsVariant(k.key, acc.key));
    if (host) mergeAcc(host, acc);
    else kept.push(acc);
  }
  return kept.map((acc) => {
    // URL이 달라도 제목이 같은 기사(통신사 전재)는 하나만 남긴다
    const seenTitles = new Set<string>();
    const news = [...acc.news.values()]
      .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
      .filter((n) => {
        const key = normalizeKey(n.title.replace(/\s+-\s+[^-]+$/, ""));
        if (!key || seenTitles.has(key)) return false;
        seenTitles.add(key);
        return true;
      })
      .slice(0, 12);
    const demandBase = acc.demand.length ? Math.max(...acc.demand) : 0.3;
    const demand = clamp01(demandBase + 0.05 * Math.max(0, acc.demandSources.size - 1));
    const competition = acc.competition.length ? Math.min(...acc.competition) : 0.5;
    const freshness = acc.freshness.length ? Math.max(...acc.freshness) : 0.5;
    const keywords = [...new Set([...tokenize(acc.title), ...frequentTokens(news.map((n) => n.title), 6)])].slice(0, 8);
    const sources = acc.llmFit !== undefined ? acc.sources : acc.sources.filter((s) => s.source !== "llm-rerank");
    return {
      id: hashId(acc.key),
      title: acc.title,
      keywords,
      sources,
      news,
      signals: { demand, competition, fit: 0, freshness },
      score: 0,
      reasons: [],
    };
  });
}

// ── 점수 ─────────────────────────────────────────────────────

export const WEIGHTS = { demand: 0.4, competition: 0.25, fit: 0.25, freshness: 0.1 } as const;
export const FIT_GATE = 0.3;

const SOURCE_NAMES: Record<ResearchSourceId, string> = {
  "google-trends": "구글 트렌드",
  "google-news": "구글 뉴스",
  "suggest-yt": "유튜브 자동완성",
  "suggest-web": "구글 자동완성",
  wikipedia: "위키백과",
  "youtube-data": "유튜브 데이터",
  "naver-news": "네이버 뉴스",
  "naver-datalab": "네이버 데이터랩",
  "llm-rerank": "LLM 재정렬",
};

export function sourceName(id: ResearchSourceId): string {
  return SOURCE_NAMES[id];
}

/** LLM 재정렬 근거(evidence)에 저장된 적합도 값 */
export function llmFitOf(c: TopicCandidate): number | undefined {
  const ev = c.sources.find((s) => s.source === "llm-rerank" && s.value !== undefined);
  if (!ev || ev.value === undefined) return undefined;
  const n = Number(ev.value);
  return Number.isFinite(n) ? clamp01(n) : undefined;
}

function evidenceReasons(sources: CandidateEvidence[]): string[] {
  const seen = new Set<ResearchSourceId>();
  const out: string[] = [];
  for (const s of sources) {
    if (s.source === "llm-rerank" || seen.has(s.source)) continue;
    seen.add(s.source);
    out.push(`${SOURCE_NAMES[s.source]}: ${s.label}${s.value ? ` (${s.value})` : ""}`);
    if (out.length >= 3) break;
  }
  return out;
}

/**
 * 후보 점수화 (멱등 — 이유 목록은 매번 새로 만든다).
 * - fit = 키워드 적합도, LLM 적합도가 있으면 0.5/0.5 블렌드
 * - base = 100 × (0.40 demand + 0.25 competition + 0.25 fit + 0.10 freshness)
 * - fit < 0.3 이고 LLM 적합도 없음 → 0 ('채널 키워드와 무관'); 아니면 base × (0.3 + 0.7 × fit)
 * - 제외 키워드/오프니치 마커 → 0
 */
export function scoreCandidate(
  c: TopicCandidate,
  profile: ChannelProfile,
  opts: { llmFit?: number } = {},
): TopicCandidate {
  const newsTitles = c.news.map((n) => n.title);
  const kw = keywordFit(c.title, newsTitles, profile.keywords);
  const llmFit = opts.llmFit ?? llmFitOf(c);
  const fit = clamp01(llmFit === undefined ? kw.fit : 0.5 * kw.fit + 0.5 * llmFit);
  const signals = { ...c.signals, fit };
  const reasons: string[] = evidenceReasons(c.sources);

  const hit = findMarkerHit(c.title, newsTitles, profile.avoid);
  if (hit) {
    reasons.unshift(
      hit.kind === "avoid"
        ? `제외 키워드 '${hit.term}' 포함${hit.where === "news" ? " (뉴스 제목)" : ""}`
        : `오프니치 마커 '${hit.term}' 포함${hit.where === "news" ? " (뉴스 제목)" : ""}`,
    );
    return { ...c, signals, score: 0, reasons: reasons.slice(0, 5) };
  }

  if (kw.fit >= FIT_GATE && kw.keyword) {
    reasons.push(
      kw.via === "title"
        ? `채널 키워드 '${kw.keyword}' ${kw.fit >= 1 ? "일치" : `부분 일치 ${kw.fit.toFixed(2)}`}`
        : `뉴스 제목이 채널 키워드 '${kw.keyword}'와 겹침 ${kw.fit.toFixed(2)}`,
    );
  }
  if (llmFit !== undefined) reasons.push(`LLM 적합도 ${llmFit.toFixed(2)}`);

  const base =
    100 *
    (WEIGHTS.demand * signals.demand +
      WEIGHTS.competition * signals.competition +
      WEIGHTS.fit * fit +
      WEIGHTS.freshness * signals.freshness);

  if (kw.fit < FIT_GATE && llmFit === undefined) {
    reasons.unshift("채널 키워드와 무관");
    return { ...c, signals, score: 0, reasons: reasons.slice(0, 5) };
  }
  const score = Math.round(base * (0.3 + 0.7 * fit));
  if (signals.freshness >= 0.99) reasons.push("48시간 내 뉴스");
  if (signals.competition === 0.5 && !c.sources.some((s) => s.source === "youtube-data")) {
    reasons.push("경쟁 데이터 없음 (기본 0.5)");
  }
  return { ...c, signals, score: Math.max(0, Math.min(100, score)), reasons: reasons.slice(0, 5) };
}

/** 후보 목록 점수 계산 + 정렬 (점수 desc → 수요 desc → 제목) */
export function scoreAll(candidates: TopicCandidate[], profile: ChannelProfile): TopicCandidate[] {
  return candidates
    .map((c) => scoreCandidate(c, profile))
    .sort((a, b) => b.score - a.score || b.signals.demand - a.signals.demand || a.title.localeCompare(b.title, "ko"));
}
