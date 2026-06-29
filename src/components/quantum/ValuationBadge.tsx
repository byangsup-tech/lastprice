import { VERDICT_CLASS, type Verdict } from "@/lib/valuation";

export default function ValuationBadge({ verdict }: { verdict: Verdict }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${VERDICT_CLASS[verdict]}`}
    >
      {verdict}
    </span>
  );
}
