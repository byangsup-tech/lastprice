interface Props {
  lines: string[];
  running?: boolean;
  /** 원본 로그 파일 링크 */
  href?: string;
}

/** 파이프라인 로그 꼬리 — 최근 60줄, 최신 줄이 아래 보이도록 */
export default function LogTail({ lines, running, href }: Props) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-gray-800">로그</h2>
        <span className="text-xs text-gray-400">최근 {lines.length}줄</span>
        {running && (
          <span className="inline-flex items-center gap-1 text-xs text-teal-700">
            <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
            3초마다 갱신
          </span>
        )}
        {href && (
          <a href={href} target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-teal-700 hover:underline">
            전체 로그 ↗
          </a>
        )}
      </div>
      {lines.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-gray-400">아직 로그가 없습니다</p>
      ) : (
        <div className="flex max-h-72 flex-col-reverse overflow-auto bg-gray-950 px-3 py-2">
          <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-gray-200">
            {lines.map((l, i) => (
              <span key={i} className={/실패|오류|error/i.test(l) ? "text-red-300" : /완료|done/i.test(l) ? "text-emerald-300" : undefined}>
                {l}
                {"\n"}
              </span>
            ))}
          </pre>
        </div>
      )}
    </section>
  );
}
