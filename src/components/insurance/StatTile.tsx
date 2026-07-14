import Sparkline from "./Sparkline";
import type { StatTileData } from "@/lib/insurance/stats/types";

export default function StatTile({ tile }: { tile: StatTileData }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-gray-200 bg-white px-4 py-3">
      <span className="text-xs text-gray-500">
        {tile.label}
        {tile.asOf && <span className="text-gray-400"> · {tile.asOf} 기준</span>}
      </span>
      <div className="flex items-end justify-between gap-2">
        <span className="text-2xl font-bold text-gray-900">
          {tile.value}
          {tile.unit && (
            <span className="ml-0.5 text-sm font-medium text-gray-500">
              {tile.unit}
            </span>
          )}
        </span>
        {tile.spark && tile.spark.length > 1 && (
          <Sparkline values={tile.spark} className="mb-1 shrink-0" />
        )}
      </div>
      {tile.sub && <span className="text-xs text-gray-400">{tile.sub}</span>}
    </div>
  );
}
