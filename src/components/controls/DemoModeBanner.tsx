"use client";

import { useState } from "react";
import type { DataSource } from "@/lib/types";

export default function DemoModeBanner({ source }: { source: DataSource }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || source === "live" || source === "snapshot") return null;

  const message =
    source === "demo"
      ? "데모 데이터(강남/서초)로 표시 중입니다. CHILDCARE_API_KEY를 설정하면 전국 실데이터가 표시됩니다."
      : "일부 최신 데이터를 불러오지 못해 저장된 데이터를 포함해 표시 중입니다.";

  return (
    <div className="pointer-events-auto flex items-start gap-2 rounded-xl bg-amber-50/95 px-3 py-2 text-xs text-amber-800 shadow ring-1 ring-amber-200">
      <span className="mt-px">⚠️</span>
      <p className="flex-1">{message}</p>
      <button
        type="button"
        aria-label="배너 닫기"
        onClick={() => setDismissed(true)}
        className="px-1 font-bold text-amber-600"
      >
        ✕
      </button>
    </div>
  );
}
