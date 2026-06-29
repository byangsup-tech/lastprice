/** 대시보드 표시용 포맷 헬퍼 */

/** 10억 USD 단위 시총 → "$9.5B" / "$430M" */
export function fmtUsdB(b: number | null | undefined): string {
  if (b == null || !Number.isFinite(b)) return "—";
  if (b >= 1) return `$${b.toFixed(1)}B`;
  return `$${Math.round(b * 1000)}M`;
}

/** 소수 비율 → "+85%" / "-10%" */
export function fmtPct(v: number | null | undefined, sign = true): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const p = Math.round(v * 100);
  return `${sign && p > 0 ? "+" : ""}${p}%`;
}

/** 배수 → "180x" */
export function fmtX(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${Math.round(v)}x`;
}
