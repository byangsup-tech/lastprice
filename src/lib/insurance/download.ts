/** 차트 다운로드 유틸 (클라이언트 전용) — OWID식 출처·다운로드 푸터용 */

function triggerDownload(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  // download 속성은 DOM에 붙은 앵커에서만 일관되게 동작
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** 셀 값의 쉼표·따옴표 이스케이프 */
function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(
  filename: string,
  rows: (string | number)[][],
): void {
  const body = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  // BOM — 엑셀에서 한글 깨짐 방지
  const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  URL.revokeObjectURL(url);
}

/** 섹션 안의 SVG 차트를 2배 해상도 PNG로 저장 (흰 배경) */
export function downloadSvgAsPng(svg: SVGSVGElement, filename: string): void {
  const viewBox = svg.viewBox.baseVal;
  const width = (viewBox?.width || svg.clientWidth || 640) * 2;
  const height = (viewBox?.height || svg.clientHeight || 280) * 2;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  const source = new XMLSerializer().serializeToString(clone);
  const svgUrl = URL.createObjectURL(
    new Blob([source], { type: "image/svg+xml;charset=utf-8" }),
  );

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      triggerDownload(canvas.toDataURL("image/png"), filename);
    }
    URL.revokeObjectURL(svgUrl);
  };
  img.onerror = () => URL.revokeObjectURL(svgUrl);
  img.src = svgUrl;
}
