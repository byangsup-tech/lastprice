"use client";

import { useEffect, useMemo, useState } from "react";
import type { DaycaresResponse, SortKey } from "@/lib/types";

export interface DaycareFilters {
  types: string[];
  bus: boolean;
  cctv: boolean;
  avail: boolean;
}

export const EMPTY_FILTERS: DaycareFilters = {
  types: [],
  bus: false,
  cctv: false,
  avail: false,
};

export function useDaycares(
  center: { lat: number; lng: number },
  radius: number,
  filters: DaycareFilters,
  sort: SortKey,
) {
  const [data, setData] = useState<DaycaresResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      lat: center.lat.toFixed(6),
      lng: center.lng.toFixed(6),
      radius: String(radius),
      sort,
    });
    if (filters.types.length > 0) params.set("type", filters.types.join(","));
    if (filters.bus) params.set("bus", "1");
    if (filters.cctv) params.set("cctv", "1");
    if (filters.avail) params.set("avail", "1");
    return params.toString();
  }, [center.lat, center.lng, radius, sort, filters]);

  useEffect(() => {
    const controller = new AbortController();
    // 핀 드래그/반경 변경 연타 시 요청 폭주 방지 (300ms 디바운스)
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/daycares?${queryString}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? "어린이집 정보를 불러오지 못했습니다");
        }
        setData(await res.json());
        setError(null);
        setLoading(false);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "알 수 없는 오류");
        setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [queryString]);

  return { data, loading, error };
}
