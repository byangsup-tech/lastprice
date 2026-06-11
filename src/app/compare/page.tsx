"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import CompareTable from "@/components/compare/CompareTable";
import type { Daycare } from "@/lib/types";

function CompareContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const idsParam = searchParams.get("ids") ?? "";
  const ids = idsParam.split(",").filter(Boolean).slice(0, 3);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const center =
    Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0
      ? { lat, lng }
      : null;

  const [items, setItems] = useState<Daycare[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ids.length === 0) return; // 빈 선택은 렌더에서 직접 처리
    let cancelled = false;
    (async () => {
      try {
        // 서버 캐시가 비어있을 때(콜드 스타트) 주변 시군구를 불러올 수 있도록 기준 좌표 전달
        const nearQuery = center ? `?lat=${center.lat}&lng=${center.lng}` : "";
        const results = await Promise.all(
          ids.map(async (id) => {
            const res = await fetch(
              `/api/daycares/${encodeURIComponent(id)}${nearQuery}`,
            );
            if (!res.ok) return null;
            const body = await res.json();
            return body.item as Daycare;
          }),
        );
        if (!cancelled) setItems(results.filter((d): d is Daycare => d !== null));
      } catch {
        if (!cancelled) setError("비교 데이터를 불러오지 못했습니다");
      }
    })();
    return () => {
      cancelled = true;
    };
    // ids 배열은 매 렌더 새로 생성되므로 원본 문자열 기준으로 갱신
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsParam]);

  const removeId = (id: string) => {
    const next = ids.filter((x) => x !== id);
    try {
      sessionStorage.setItem("compareIds", JSON.stringify(next));
    } catch {
      // 무시
    }
    if (next.length === 0) {
      router.push("/");
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("ids", next.map(encodeURIComponent).join(","));
    router.replace(`/compare?${params.toString()}`);
  };

  return (
    <div className="mx-auto min-h-dvh max-w-3xl bg-white">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3">
        <Link href="/" className="text-sm font-medium text-blue-600">
          ← 목록으로
        </Link>
        <h1 className="text-base font-bold">어린이집 비교</h1>
      </header>

      {error && (
        <p className="px-4 py-10 text-center text-sm text-red-500">{error}</p>
      )}
      {!error && ids.length > 0 && items === null && (
        <div className="flex justify-center py-10">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        </div>
      )}
      {!error && (ids.length === 0 || (items !== null && items.length === 0)) && (
        <p className="px-4 py-10 text-center text-sm text-gray-400">
          비교할 어린이집이 없습니다.{" "}
          <Link href="/" className="text-blue-600 underline">
            목록에서 선택해주세요
          </Link>
        </p>
      )}
      {!error && items !== null && items.length > 0 && (
        <>
          <p className="px-4 pt-3 text-xs text-gray-400">
            항목별 가장 좋은 값이{" "}
            <span className="rounded bg-green-50 px-1 font-bold text-green-700">
              초록색
            </span>
            으로 표시됩니다
          </p>
          <div className="p-2">
            <CompareTable items={items} center={center} onRemove={removeId} />
          </div>
        </>
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center text-sm text-gray-400">
          불러오는 중…
        </div>
      }
    >
      <CompareContent />
    </Suspense>
  );
}
