/** 초소형 추세선 — 스탯 타일·키워드 카드 공용 (축·라벨 없음, 끝점 강조만) */

const W = 96;
const H = 24;
const PAD = 3;

interface Props {
  values: number[];
  color?: string;
  className?: string;
}

export default function Sparkline({
  values,
  color = "#2a78d6",
  className,
}: Props) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const xOf = (i: number) => PAD + (i / (values.length - 1)) * (W - PAD * 2);
  const yOf = (v: number) => PAD + (1 - (v - min) / span) * (H - PAD * 2);
  const d = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`)
    .join(" ");
  const last = values[values.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className={className}
      aria-hidden="true"
    >
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" opacity="0.85" />
      <circle cx={xOf(values.length - 1)} cy={yOf(last)} r="2" fill={color} />
    </svg>
  );
}
