/**
 * 순수 양자 상장사 실시간 시세/밸류에이션 조회.
 *
 * 1순위: Yahoo Finance 공개 엔드포인트(키 불필요, 미국 + 중국 A주 커버).
 * 실패(네트워크 정책 차단 등) 시 quantum-data.ts의 큐레이션 스냅샷으로 폴백한다.
 * 응답에는 source("live"|"snapshot") 와 asOf 를 담아 UI가 출처를 표기할 수 있게 한다.
 */
import {
  CNY_PER_USD,
  QUOTE_SNAPSHOT,
  SNAPSHOT_AS_OF,
  toUsd,
  type QuoteSnapshot,
} from "./quantum-data";

const YF_BASE =
  process.env.STOCK_API_BASE ?? "https://query1.finance.yahoo.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const TTL_MS = 15 * 60 * 1000;

export interface Quote {
  ticker: string;
  currency: string;
  /** 현지 통화 시가총액 (10억 단위) */
  marketCap: number;
  /** USD 정규화 시가총액 (10억 USD) */
  marketCapUsd: number;
  price: number | null;
  /** 주가매출비율 (P/S) */
  priceToSales: number | null;
  /** PER (적자기업은 null) */
  trailingPE: number | null;
  /** 매출 성장률 (전년比, 소수) */
  revenueGrowth: number | null;
  /** 애널리스트 평균 목표주가 대비 상승여력 (소수) */
  targetUpside: number | null;
  /** 라이브 조회 성공 여부 */
  live: boolean;
}

export interface QuotesResult {
  quotes: Quote[];
  source: "live" | "snapshot";
  asOf: string;
}

export interface HistoryPoint {
  /** epoch ms */
  t: number;
  /** 종가 */
  close: number;
}

export interface HistoryResult {
  ticker: string;
  range: string;
  points: HistoryPoint[];
  source: "live" | "snapshot";
}

interface CacheEntry<T> {
  at: number;
  data: T;
}
const quoteCache = new Map<string, CacheEntry<Quote>>();
const historyCache = new Map<string, CacheEntry<HistoryResult>>();

function snapshotToQuote(s: QuoteSnapshot): Quote {
  return {
    ticker: s.ticker,
    currency: s.currency,
    marketCap: s.marketCap,
    marketCapUsd: toUsd(s.marketCap, s.currency),
    price: s.price,
    priceToSales: s.priceToSales,
    trailingPE: s.trailingPE,
    revenueGrowth: s.revenueGrowth,
    targetUpside: s.targetUpside,
    live: false,
  };
}

/** Yahoo quoteSummary 응답의 {raw:number} 형태에서 숫자만 안전 추출 */
function raw(node: unknown): number | null {
  if (node && typeof node === "object" && "raw" in node) {
    const v = (node as { raw: unknown }).raw;
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  return null;
}

async function fetchYahooQuote(ticker: string): Promise<Quote | null> {
  const url =
    `${YF_BASE}/v10/finance/quoteSummary/${encodeURIComponent(ticker)}` +
    `?modules=price,summaryDetail,defaultKeyStatistics,financialData`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as {
    quoteSummary?: { result?: Array<Record<string, Record<string, unknown>>> };
  };
  const r = json.quoteSummary?.result?.[0];
  if (!r) return null;

  const price = r.price ?? {};
  const detail = r.summaryDetail ?? {};
  const fin = r.financialData ?? {};

  const currency = (price.currency as string) ?? "USD";
  const marketCapRaw = raw(price.marketCap);
  if (marketCapRaw == null) return null;
  const marketCap = marketCapRaw / 1e9; // 10억 단위

  const current = raw(fin.currentPrice) ?? raw(price.regularMarketPrice);
  const target = raw(fin.targetMeanPrice);
  const targetUpside =
    current && target && current > 0 ? target / current - 1 : null;

  return {
    ticker,
    currency,
    marketCap,
    marketCapUsd: toUsd(marketCap, currency),
    price: current,
    priceToSales: raw(detail.priceToSalesTrailing12Months),
    trailingPE: raw(detail.trailingPE),
    revenueGrowth: raw(fin.revenueGrowth),
    targetUpside,
    live: true,
  };
}

function freshQuote(ticker: string): Quote | null {
  const e = quoteCache.get(ticker);
  return e && Date.now() - e.at < TTL_MS ? e.data : null;
}

/**
 * 티커 목록의 시세를 조회. 라이브 성공분은 사용하고, 실패분은 스냅샷으로 메운다.
 * 라이브가 하나도 없으면 전체 source는 "snapshot".
 */
export async function getQuotes(tickers: string[]): Promise<QuotesResult> {
  const quotes = await Promise.all(
    tickers.map(async (ticker) => {
      const cached = freshQuote(ticker);
      if (cached) return cached;
      try {
        const q = await fetchYahooQuote(ticker);
        if (q) {
          quoteCache.set(ticker, { at: Date.now(), data: q });
          return q;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[quantum-quotes] ${ticker} 라이브 실패 → 스냅샷:`, msg);
      }
      const snap = QUOTE_SNAPSHOT[ticker];
      return snap ? snapshotToQuote(snap) : null;
    }),
  );

  const list = quotes.filter((q): q is Quote => q !== null);
  const anyLive = list.some((q) => q.live);
  return {
    quotes: list,
    source: anyLive ? "live" : "snapshot",
    asOf: anyLive ? new Date().toISOString() : SNAPSHOT_AS_OF,
  };
}

/** 합성 폴백 시계열: 현재 시총을 기준으로 완만한 우상향 곡선을 생성 */
function snapshotHistory(ticker: string, range: string): HistoryResult {
  const snap = QUOTE_SNAPSHOT[ticker];
  const end = snap?.price ?? 10;
  const months = range === "5y" ? 60 : 12;
  const points: HistoryPoint[] = [];
  // 1년 전 약 40% 수준에서 현재가로 수렴하는 단조 증가 근사 (시드 고정, 난수 미사용)
  const start = end * 0.4;
  const base = SNAPSHOT_DATE_MS;
  for (let i = 0; i <= months; i++) {
    const f = i / months;
    const wobble = 1 + 0.06 * Math.sin(i * 1.3);
    points.push({
      t: base - (months - i) * 30 * 24 * 3600 * 1000,
      close: Math.round((start + (end - start) * f) * wobble * 100) / 100,
    });
  }
  return { ticker, range, points, source: "snapshot" };
}

// SNAPSHOT_AS_OF("2026-06-01")를 ms로. Date.now()/new Date() 시간 의존을 피하기 위해 상수 사용.
const SNAPSHOT_DATE_MS = Date.parse(SNAPSHOT_AS_OF);

async function fetchYahooChart(
  ticker: string,
  range: string,
): Promise<HistoryResult | null> {
  const url =
    `${YF_BASE}/v8/finance/chart/${encodeURIComponent(ticker)}` +
    `?range=${encodeURIComponent(range)}&interval=1wk`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: { quote?: Array<{ close?: Array<number | null> }> };
      }>;
    };
  };
  const r = json.chart?.result?.[0];
  const ts = r?.timestamp;
  const closes = r?.indicators?.quote?.[0]?.close;
  if (!ts || !closes) return null;
  const points: HistoryPoint[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (typeof c === "number" && Number.isFinite(c)) {
      points.push({ t: ts[i] * 1000, close: Math.round(c * 100) / 100 });
    }
  }
  if (points.length === 0) return null;
  return { ticker, range, points, source: "live" };
}

export async function getHistory(
  ticker: string,
  range: string,
): Promise<HistoryResult> {
  const key = `${ticker}:${range}`;
  const cached = historyCache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.data;
  try {
    const live = await fetchYahooChart(ticker, range);
    if (live) {
      historyCache.set(key, { at: Date.now(), data: live });
      return live;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[quantum-quotes] ${ticker} 시계열 실패 → 스냅샷:`, msg);
  }
  return snapshotHistory(ticker, range);
}

export { CNY_PER_USD };
