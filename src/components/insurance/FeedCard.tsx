import type { FeedItem } from "@/lib/insurance/types";
import { CATEGORY_LABELS, MARKET_LABELS } from "@/lib/insurance/types";
import { formatRelativeTime } from "@/lib/insurance/format";

interface Props {
  item: FeedItem;
  /** '전체' 탭에서만 카테고리 배지를 보여준다 */
  showCategory: boolean;
  /** 매칭된 관심 키워드 — 있으면 카드 하이라이트 */
  matched?: string[];
  scrapped?: boolean;
  onToggleScrap?: (item: FeedItem) => void;
  onTagClick?: (tag: string) => void;
}

export default function FeedCard({
  item,
  showCategory,
  matched,
  scrapped,
  onToggleScrap,
  onTagClick,
}: Props) {
  const highlighted = !!matched?.length;
  return (
    // 루트가 <a>면 내부 버튼이 중첩 invalid HTML — relative div + 제목 stretched-link 구조
    <div
      className={`relative rounded-xl border bg-white px-4 py-3 transition-colors hover:border-teal-400 hover:bg-teal-50/40 ${
        highlighted ? "border-teal-400 ring-1 ring-teal-200" : "border-gray-200"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
        <span className="font-medium text-teal-700">{item.sourceName}</span>
        {showCategory && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5">
            {CATEGORY_LABELS[item.category]}
          </span>
        )}
        {item.market && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5">
            {MARKET_LABELS[item.market]}
          </span>
        )}
        {item.demo && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">
            예시
          </span>
        )}
        {highlighted && (
          <span className="rounded-full bg-teal-100 px-2 py-0.5 font-medium text-teal-700">
            🔔 {matched!.join(", ")}
          </span>
        )}
        <span className="ml-auto shrink-0">
          {formatRelativeTime(item.publishedAt)}
        </span>
        {onToggleScrap && (
          <button
            onClick={() => onToggleScrap(item)}
            aria-label={scrapped ? "스크랩 해제" : "스크랩"}
            title={scrapped ? "스크랩 해제" : "스크랩"}
            className={`relative z-10 -my-1 shrink-0 rounded p-1 text-sm leading-none transition-colors ${
              scrapped ? "text-amber-500" : "text-gray-300 hover:text-amber-400"
            }`}
          >
            {scrapped ? "★" : "☆"}
          </button>
        )}
      </div>
      <h3 className="mt-1 text-sm font-semibold leading-snug text-gray-900">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="after:absolute after:inset-0"
        >
          {item.titleKo ?? item.title}
        </a>
      </h3>
      {item.titleKo && (
        <p className="mt-0.5 line-clamp-1 text-xs text-gray-400">
          {item.title}
        </p>
      )}
      {item.summary && (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-500">
          {item.summary}
        </p>
      )}
      {item.tags && item.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {item.tags.map((tag) =>
            onTagClick ? (
              <button
                key={tag}
                onClick={() => onTagClick(tag)}
                className="relative z-10 rounded bg-teal-50 px-1.5 py-0.5 text-[11px] font-medium text-teal-700 transition-colors hover:bg-teal-100"
              >
                #{tag}
              </button>
            ) : (
              <span
                key={tag}
                className="rounded bg-teal-50 px-1.5 py-0.5 text-[11px] font-medium text-teal-700"
              >
                #{tag}
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}
