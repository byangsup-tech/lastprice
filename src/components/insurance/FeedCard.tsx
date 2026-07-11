import type { FeedItem } from "@/lib/insurance/types";
import { CATEGORY_LABELS, MARKET_LABELS } from "@/lib/insurance/types";
import { formatRelativeTime } from "@/lib/insurance/format";

interface Props {
  item: FeedItem;
  /** '전체' 탭에서만 카테고리 배지를 보여준다 */
  showCategory: boolean;
}

export default function FeedCard({ item, showCategory }: Props) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-xl border border-gray-200 bg-white px-4 py-3 transition-colors hover:border-teal-400 hover:bg-teal-50/40"
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
        <span className="ml-auto shrink-0">
          {formatRelativeTime(item.publishedAt)}
        </span>
      </div>
      <h3 className="mt-1 text-sm font-semibold leading-snug text-gray-900">
        {item.title}
      </h3>
      {item.summary && (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-500">
          {item.summary}
        </p>
      )}
      {item.tags && item.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {item.tags.map((tag) => (
            <span
              key={tag}
              className="rounded bg-teal-50 px-1.5 py-0.5 text-[11px] font-medium text-teal-700"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </a>
  );
}
