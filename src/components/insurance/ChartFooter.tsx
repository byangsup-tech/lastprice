"use client";

import { downloadCsv, downloadSvgAsPng } from "@/lib/insurance/download";

/**
 * OWID식 차트 푸터 — 출처 표기 + PNG/CSV 다운로드.
 * PNG는 같은 <section> 안의 첫 SVG를 캡처한다 (ref 배선 불필요).
 */

interface Props {
  source: string;
  /** 파일명 (확장자 제외) */
  filename: string;
  /** CSV 행 생성 — 첫 행은 헤더 */
  csvRows: () => (string | number)[][];
}

export default function ChartFooter({ source, filename, csvRows }: Props) {
  function onPng(e: React.MouseEvent<HTMLButtonElement>) {
    const svg = e.currentTarget
      .closest("section")
      ?.querySelector<SVGSVGElement>("svg[role='img']");
    if (svg) downloadSvgAsPng(svg, `${filename}.png`);
  }

  return (
    <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-2">
      <span className="min-w-0 flex-1 truncate text-[11px] text-gray-400">
        출처: {source}
      </span>
      <button
        onClick={onPng}
        className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
      >
        ⤓ PNG
      </button>
      <button
        onClick={() => downloadCsv(`${filename}.csv`, csvRows())}
        className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
      >
        ⤓ CSV
      </button>
    </div>
  );
}
