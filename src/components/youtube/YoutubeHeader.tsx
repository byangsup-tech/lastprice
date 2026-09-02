import Link from "next/link";

interface Props {
  subtitle?: string;
  children?: React.ReactNode;
}

/** /youtube 공통 헤더 — 제목 + 다른 데스크 링크 */
export default function YoutubeHeader({ subtitle, children }: Props) {
  return (
    <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h1 className="text-xl font-bold text-gray-900">
        <Link href="/youtube">🎬 유튜브 롱폼 스튜디오</Link>
      </h1>
      <p className="text-xs text-gray-500">{subtitle ?? "리서치 → 대본 → 음성 → 영상 → 썸네일 → 업로드 자동화"}</p>
      <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-gray-500">
        {children}
        <Link
          href="/insurance"
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 transition-colors hover:border-teal-500 hover:text-teal-700"
        >
          🛡️ 보험 데스크
        </Link>
        <Link
          href="/"
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 transition-colors hover:border-teal-500 hover:text-teal-700"
        >
          🏠 어린이집
        </Link>
      </div>
    </header>
  );
}
