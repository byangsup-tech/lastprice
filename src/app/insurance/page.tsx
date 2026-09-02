"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import DailyBriefing from "@/components/insurance/DailyBriefing";
import FeedCard from "@/components/insurance/FeedCard";
import KeywordManager from "@/components/insurance/KeywordManager";
import KeywordTrendCards from "@/components/insurance/KeywordTrendCards";
import SourceStatusStrip from "@/components/insurance/SourceStatusStrip";
import { useInsuranceFeed } from "@/hooks/useInsuranceFeed";
import { useKeywords, useScraps } from "@/hooks/useInsurancePrefs";
import { useKeywordTrends } from "@/hooks/useKeywordTrends";
import {
  briefingByCategory,
  dailyTopPicks,
  matchedKeywords,
} from "@/lib/insurance/daily";
import { formatRelativeTime } from "@/lib/insurance/format";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  MARKETS,
  MARKET_LABELS,
  type CategoryKey,
  type FeedItem,
  type Market,
} from "@/lib/insurance/types";

type Tab = "all" | CategoryKey | "scraps";
type MarketFilter = "all" | Market;

export default function InsuranceDashboardPage() {
  const { data, loading, error, reload } = useInsuranceFeed();
  const [tab, setTab] = useState<Tab>("all");
  const [market, setMarket] = useState<MarketFilter>("all");
  const [q, setQ] = useState("");
  const [onlyKeywords, setOnlyKeywords] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const { keywords, add: addKeyword, remove: removeKeyword } = useKeywords();
  const { scraps, has: isScrapped, toggle: toggleScrap } = useScraps();
  const keywordTrends = useKeywordTrends(keywords);

  const matchesOf = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!keywords.length) return map;
    for (const it of data?.items ?? []) {
      const m = matchedKeywords(it, keywords);
      if (m.length) map.set(it.id, m);
    }
    return map;
  }, [data, keywords]);

  const matchCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const matched of matchesOf.values()) {
      for (const kw of matched) counts.set(kw, (counts.get(kw) ?? 0) + 1);
    }
    return counts;
  }, [matchesOf]);

  const items = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    const matchQ = (it: FeedItem) =>
      !keyword ||
      `${it.title} ${it.titleKo ?? ""} ${it.summary ?? ""} ${it.sourceName} ${(it.tags ?? []).join(" ")}`
        .toLowerCase()
        .includes(keyword);

    // 스크랩 탭: 저장된 스냅샷 기준 (피드에서 사라진 항목도 표시), 검색만 적용
    if (tab === "scraps") {
      return scraps.map((s) => s.item).filter(matchQ);
    }
    if (!data) return [];
    return data.items.filter((it) => {
      if (tab !== "all" && it.category !== tab) return false;
      // 시장 필터는 신상품 탭에서만 적용
      if (tab === "new-products" && market !== "all" && it.market !== market)
        return false;
      if (onlyKeywords && !matchesOf.has(it.id)) return false;
      if (activeTag && !(it.tags ?? []).includes(activeTag)) return false;
      return matchQ(it);
    });
  }, [data, scraps, tab, market, q, onlyKeywords, activeTag, matchesOf]);

  const briefing = useMemo(
    () => (data ? briefingByCategory(data.items) : []),
    [data],
  );
  const briefingPicks = useMemo(
    () => (data ? dailyTopPicks(data.items, keywords) : []),
    [data, keywords],
  );

  const countByCategory = useMemo(() => {
    const counts = new Map<CategoryKey, number>();
    for (const it of data?.items ?? []) {
      counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
    }
    return counts;
  }, [data]);

  const demoCategories = useMemo(
    () =>
      [
        ...new Set(
          (data?.sources ?? [])
            .filter((s) => s.status === "demo")
            .map((s) => CATEGORY_LABELS[s.category]),
        ),
      ],
    [data],
  );
  const noKeyCount =
    data?.sources.filter((s) => s.status === "no-key").length ?? 0;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-bold text-gray-900">
          🛡️ 보험 상품개발 데스크
        </h1>
        <p className="text-xs text-gray-500">
          뉴스 · 정책 · 신상품 · 리서치 통합 피드
        </p>
        <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
          {data && <span>{formatRelativeTime(data.generatedAt)} 갱신</span>}
          <Link
            href="/insurance/stats"
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 transition-colors hover:border-teal-500 hover:text-teal-700"
          >
            📊 위험률 통계
          </Link>
          <Link
            href="/youtube"
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 transition-colors hover:border-teal-500 hover:text-teal-700"
          >
            🎬 유튜브 스튜디오
          </Link>
          <button
            onClick={() => void reload()}
            disabled={loading}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 transition-colors hover:border-teal-500 hover:text-teal-700 disabled:opacity-50"
          >
            {loading ? "불러오는 중…" : "새로고침"}
          </button>
        </div>
      </header>

      {demoCategories.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
          <strong>예시 데이터 표시 중:</strong> {demoCategories.join(", ")} —
          외부 피드 수집이 실패했거나 API 키가 없는 카테고리입니다.
          {noKeyCount > 0 && (
            <>
              {" "}
              <code className="rounded bg-amber-100 px-1">
                NAVER_CLIENT_ID/SECRET
              </code>
              , <code className="rounded bg-amber-100 px-1">DART_API_KEY</code>
              를 <code className="rounded bg-amber-100 px-1">.env.local</code>에
              설정하면 실데이터로 전환됩니다.
            </>
          )}
        </div>
      )}

      {data?.translation === "no-key" && (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs leading-relaxed text-gray-500">
          🌐 <code className="rounded bg-gray-100 px-1">DEEPL_API_KEY</code>를
          설정하면 일본어·중국어 제목이 한국어로 자동 번역됩니다 (무료 월 50만 자).
        </div>
      )}

      {tab !== "scraps" && briefingPicks.length > 0 && (
        <DailyBriefing
          picks={briefingPicks}
          entries={briefing}
          onSelectCategory={(category) => setTab(category)}
        />
      )}

      <KeywordManager
        keywords={keywords}
        onAdd={addKeyword}
        onRemove={removeKeyword}
      />

      {tab !== "scraps" && keywords.length > 0 && keywordTrends && (
        <KeywordTrendCards
          data={keywordTrends}
          matchCounts={matchCounts}
          onSelectKeyword={(kw) => setQ(kw)}
        />
      )}

      {data && <SourceStatusStrip sources={data.sources} />}

      <nav className="flex gap-1.5 overflow-x-auto pb-1" aria-label="카테고리">
        {(["all", ...CATEGORIES, "scraps"] as Tab[]).map((key) => {
          const active = tab === key;
          const label =
            key === "all"
              ? "전체"
              : key === "scraps"
                ? "⭐ 스크랩"
                : CATEGORY_LABELS[key as CategoryKey];
          const count =
            key === "all"
              ? (data?.items.length ?? 0)
              : key === "scraps"
                ? scraps.length
                : (countByCategory.get(key as CategoryKey) ?? 0);
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "bg-teal-700 text-white"
                  : "border border-gray-300 bg-white text-gray-600 hover:border-teal-500"
              }`}
            >
              {label}
              {data && <span className="ml-1 opacity-60">{count}</span>}
            </button>
          );
        })}
      </nav>

      {tab === "new-products" && (
        <nav className="flex gap-1.5 overflow-x-auto" aria-label="시장">
          {(["all", ...MARKETS] as MarketFilter[]).map((key) => {
            const active = market === key;
            const label = key === "all" ? "전체 시장" : MARKET_LABELS[key];
            return (
              <button
                key={key}
                onClick={() => setMarket(key)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "bg-gray-800 text-white"
                    : "border border-gray-300 bg-white text-gray-600 hover:border-gray-500"
                }`}
              >
                {label}
              </button>
            );
          })}
        </nav>
      )}

      {tab !== "scraps" && (keywords.length > 0 || activeTag) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {keywords.length > 0 && (
            <button
              onClick={() => setOnlyKeywords((v) => !v)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                onlyKeywords
                  ? "bg-teal-700 text-white"
                  : "border border-teal-300 bg-teal-50 text-teal-700 hover:border-teal-500"
              }`}
            >
              🔔 내 키워드만
            </button>
          )}
          {activeTag && (
            <button
              onClick={() => setActiveTag(null)}
              className="rounded-full bg-gray-800 px-3 py-1 text-xs font-medium text-white"
            >
              #{activeTag} ×
            </button>
          )}
        </div>
      )}

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="제목·요약·태그 검색 (예: 실손, CSM, 간병, 배타적사용권)"
        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-teal-500"
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          피드를 불러오지 못했습니다: {error}
          <button
            onClick={() => void reload()}
            className="ml-2 font-medium underline"
          >
            다시 시도
          </button>
        </div>
      )}

      {loading && !data && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl border border-gray-200 bg-white"
            />
          ))}
        </div>
      )}

      <section className="flex flex-col gap-2" aria-label="피드">
        {items.map((item) => (
          <FeedCard
            key={item.id}
            item={item}
            showCategory={tab === "all" || tab === "scraps"}
            matched={matchesOf.get(item.id)}
            scrapped={isScrapped(item.id)}
            onToggleScrap={toggleScrap}
            onTagClick={(tag) =>
              setActiveTag((cur) => (cur === tag ? null : tag))
            }
          />
        ))}
        {(data || tab === "scraps") && items.length === 0 && (
          <p className="py-12 text-center text-sm text-gray-400">
            {tab === "scraps"
              ? "스크랩한 항목이 없습니다 — 카드의 ☆ 버튼으로 저장하세요"
              : "조건에 맞는 항목이 없습니다"}
          </p>
        )}
      </section>

      <footer className="mt-4 border-t border-gray-200 pt-4 text-center text-xs leading-relaxed text-gray-400">
        RSS·공개 API·게시판 수집 · 15분 캐시 · 규제 레이더(분쟁조정례·규정변경예고·의안) 포함
        <br />
        다음 확장 후보: 경쟁사 CSM/VNB 패널 · 배타적사용권 아카이브 표 · 유지율(FISIS)
      </footer>
    </main>
  );
}
