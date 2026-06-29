import { SOURCES } from "@/lib/quantum-data";

interface Props {
  /** 시세 출처 (live | snapshot) */
  source: "live" | "snapshot";
  /** 기준 시각 (ISO 또는 날짜) */
  asOf: string;
}

export default function SourcesFooter({ source, asOf }: Props) {
  const asOfLabel =
    source === "live"
      ? new Date(asOf).toLocaleString("ko-KR")
      : `${asOf} 기준 스냅샷`;

  return (
    <footer className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-500 sm:p-6">
      <div className="mb-2 font-semibold text-gray-700">출처 및 면책</div>
      <p className="mb-2">
        시세 데이터: {source === "live" ? "실시간" : "큐레이션 스냅샷"} ·{" "}
        {asOfLabel}
      </p>
      <ul className="mb-3 space-y-1">
        {SOURCES.map((s) => (
          <li key={s.url}>
            ·{" "}
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-gray-700"
            >
              {s.label}
            </a>
            {s.note ? ` — ${s.note}` : ""}
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-gray-400">
        ⚠ 본 대시보드의 수치는 공개 자료 기반 추정치이며 오차가 있을 수 있습니다.
        밸류에이션 판정은 단순 휴리스틱으로 <strong>투자 자문이 아닙니다</strong>.
        투자 판단의 책임은 이용자 본인에게 있습니다.
      </p>
    </footer>
  );
}
