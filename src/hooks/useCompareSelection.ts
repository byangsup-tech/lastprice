"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "compareIds";
export const COMPARE_MAX = 3;

export function useCompareSelection() {
  const [ids, setIds] = useState<string[]>([]);

  // sessionStorage는 SSR/hydration 중 접근 불가 → 마운트 후 복원
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // eslint-disable-next-line react-hooks/set-state-in-effect -- 외부 저장소(sessionStorage)와의 1회 동기화
          setIds(parsed.slice(0, COMPARE_MAX));
        }
      }
    } catch {
      // 무시 — 비교 선택은 비필수 상태
    }
  }, []);

  const persist = (next: string[]) => {
    setIds(next);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 무시
    }
  };

  /** 선택 토글. 최대 개수 초과로 추가 불가하면 false 반환 */
  const toggle = (id: string): boolean => {
    if (ids.includes(id)) {
      persist(ids.filter((x) => x !== id));
      return true;
    }
    if (ids.length >= COMPARE_MAX) return false;
    persist([...ids, id]);
    return true;
  };

  const remove = (id: string) => persist(ids.filter((x) => x !== id));
  const clear = () => persist([]);

  return { ids, toggle, remove, clear };
}
