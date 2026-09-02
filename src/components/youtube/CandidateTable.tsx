import type { ResearchSourceId, TopicCandidate } from "@/lib/youtube/types";

export const SOURCE_SHORT: Record<ResearchSourceId, string> = {
  "google-trends": "트렌드",
  "google-news": "뉴스",
  "suggest-yt": "YT추천",
  "suggest-web": "웹추천",
  wikipedia: "위키",
  "youtube-data": "YT데이터",
  "naver-news": "네이버",
  "naver-datalab": "데이터랩",
  "llm-rerank": "LLM",
};

const SIGNALS: { key: keyof TopicCandidate["signals"]; label: string; bar: string }[] = [
  { key: "demand", label: "수요", bar: "bg-teal-500" },
  { key: "competition", label: "경쟁", bar: "bg-sky-500" },
  { key: "fit", label: "적합", bar: "bg-violet-500" },
  { key: "freshness", label: "신선", bar: "bg-amber-500" },
];

function scoreTone(score: number): string {
  if (score >= 60) return "bg-emerald-500";
  if (score >= 40) return "bg-teal-500";
  if (score > 0) return "bg-amber-400";
  return "bg-gray-300";
}

function pct(v: number): number {
  return Math.round(Math.min(1, Math.max(0, v)) * 100);
}

interface Props {
  candidates: TopicCandidate[];
  onCreate: (candidate: TopicCandidate) => void;
  /** 생성 요청 중인 후보 id */
  creatingId?: string | null;
  /** 작업 생성 불가 (서버리스) */
  disabled?: boolean;
}

/** 리서치 후보 목록 — 점수 바 + 4개 신호 미니바 + 소스 배지 + 뉴스 링크 + 작업 생성 */
export default function CandidateTable({ candidates, onCreate, creatingId, disabled }: Props) {
  if (candidates.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-400">
        후보가 없습니다 — 새로고침하거나 채널 프로필 키워드(content/youtube/channel.json)를 확인하세요
      </p>
    );
  }
  return (
    <ol className="flex flex-col gap-2" aria-label="주제 후보">
      {candidates.map((c, i) => {
        const sources = [...new Set(c.sources.map((s) => s.source))];
        const news = c.news.slice(0, 2);
        const creating = creatingId === c.id;
        return (
          <li
            key={c.id}
            className="rounded-xl border border-gray-200 bg-white px-4 py-3 transition-colors hover:border-teal-400"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-gray-400">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold leading-snug text-gray-900">{c.title}</h3>
                    {c.suggestedTitle && c.suggestedTitle !== c.title && (
                      <p className="mt-0.5 text-xs text-teal-700">🎯 {c.suggestedTitle}</p>
                    )}
                    {c.angle && <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{c.angle}</p>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      {sources.map((s) => (
                        <span
                          key={s}
                          className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600"
                        >
                          {SOURCE_SHORT[s] ?? s}
                        </span>
                      ))}
                      {c.keywords.slice(0, 4).map((k) => (
                        <span key={k} className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700">
                          #{k}
                        </span>
                      ))}
                    </div>
                    {news.length > 0 && (
                      <ul className="mt-1.5 flex flex-col gap-0.5">
                        {news.map((n) => (
                          <li key={n.url} className="truncate text-xs text-gray-500">
                            <a
                              href={n.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-teal-700 hover:underline"
                            >
                              📰 {n.title}
                            </a>
                            {n.source && <span className="ml-1 text-gray-400">· {n.source}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                    {c.reasons.length > 0 && (
                      <p className="mt-1 line-clamp-1 text-[11px] text-gray-400" title={c.reasons.join(" · ")}>
                        {c.reasons.join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-3 pl-8 sm:w-56 sm:flex-col sm:items-stretch sm:gap-2 sm:pl-0">
                <div className="flex-1">
                  <div className="flex items-center justify-between text-[11px] text-gray-500">
                    <span>점수</span>
                    <span className="font-semibold tabular-nums text-gray-800">{Math.round(c.score)}</span>
                  </div>
                  <div className="mt-0.5 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full ${scoreTone(c.score)}`}
                      style={{ width: `${Math.min(100, Math.max(0, c.score))}%` }}
                    />
                  </div>
                  <div className="mt-1.5 grid grid-cols-4 gap-1">
                    {SIGNALS.map((s) => {
                      const v = pct(c.signals[s.key]);
                      return (
                        <div key={s.key} title={`${s.label} ${v}%`}>
                          <div className="h-1 w-full overflow-hidden rounded-full bg-gray-100">
                            <div className={`h-full rounded-full ${s.bar}`} style={{ width: `${v}%` }} />
                          </div>
                          <div className="mt-0.5 text-center text-[10px] leading-none text-gray-400">{s.label}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <button
                  onClick={() => onCreate(c)}
                  disabled={disabled || !!creatingId}
                  title={disabled ? "서버리스 환경에서는 작업을 만들 수 없습니다 — CLI: npm run yt -- new --candidate <id>" : undefined}
                  className="shrink-0 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-teal-800 disabled:opacity-50"
                >
                  {creating ? "생성 중…" : "작업 생성"}
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
