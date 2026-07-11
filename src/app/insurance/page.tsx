"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import FeedCard from "@/components/insurance/FeedCard";
import SourceStatusStrip from "@/components/insurance/SourceStatusStrip";
import { useInsuranceFeed } from "@/hooks/useInsuranceFeed";
import { formatRelativeTime } from "@/lib/insurance/format";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type CategoryKey,
} from "@/lib/insurance/types";

type Tab = "all" | CategoryKey;

export default function InsuranceDashboardPage() {
  const { data, loading, error, reload } = useInsuranceFeed();
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");

  const items = useMemo(() => {
    if (!data) return [];
    const keyword = q.trim().toLowerCase();
    return data.items.filter((it) => {
      if (tab !== "all" && it.category !== tab) return false;
      if (!keyword) return true;
      return `${it.title} ${it.summary ?? ""} ${it.sourceName}`
        .toLowerCase()
        .includes(keyword);
    });
  }, [data, tab, q]);

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

      {data && <SourceStatusStrip sources={data.sources} />}

      <nav className="flex gap-1.5 overflow-x-auto pb-1" aria-label="카테고리">
        {(["all", ...CATEGORIES] as Tab[]).map((key) => {
          const active = tab === key;
          const label =
            key === "all" ? "전체" : CATEGORY_LABELS[key as CategoryKey];
          const count =
            key === "all"
              ? (data?.items.length ?? 0)
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

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="제목·요약·소스 검색 (예: 실손, CSM, 배타적사용권)"
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
          <FeedCard key={item.id} item={item} showCategory={tab === "all"} />
        ))}
        {data && items.length === 0 && (
          <p className="py-12 text-center text-sm text-gray-400">
            조건에 맞는 항목이 없습니다
          </p>
        )}
      </section>

      <footer className="mt-4 border-t border-gray-200 pt-4 text-center text-xs leading-relaxed text-gray-400">
        RSS·공개 API·게시판 수집 · 15분 캐시 · 배타적사용권(생보/손보협회) 포함
        <br />
        다음 확장 후보: 금감원 분쟁조정례 · 보험업법 의안 추적 · 경쟁사 CSM/VNB 패널
      </footer>
    </main>
  );
}
