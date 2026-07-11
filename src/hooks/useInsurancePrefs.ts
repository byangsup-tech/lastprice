"use client";

import { useEffect, useState } from "react";
import type { FeedItem } from "@/lib/insurance/types";

/**
 * 관심 키워드·스크랩 — localStorage 기반 개인 설정.
 * useCompareSelection과 같은 패턴: SSR/hydration 중 접근 불가 → 마운트 후 1회 복원.
 */

const KEYWORDS_KEY = "insurance.keywords";
const SCRAPS_KEY = "insurance.scraps";
/** 스크랩 상한 — localStorage quota 보호 */
const SCRAPS_MAX = 300;

function useLocalJson<T>(storageKey: string, initial: T, validate: (v: unknown) => v is T) {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (validate(parsed)) {
          // eslint-disable-next-line react-hooks/set-state-in-effect -- 외부 저장소(localStorage)와의 1회 동기화
          setValue(parsed);
        }
      }
    } catch {
      // 무시 — 개인 설정은 비필수 상태
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 1회만
  }, []);

  const persist = (next: T) => {
    setValue(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // 무시 (quota/프라이빗 모드)
    }
  };

  return [value, persist] as const;
}

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

export function useKeywords() {
  const [keywords, persist] = useLocalJson<string[]>(
    KEYWORDS_KEY,
    [],
    isStringArray,
  );

  const add = (raw: string) => {
    const kw = raw.trim();
    if (!kw || keywords.includes(kw)) return;
    persist([...keywords, kw]);
  };
  const remove = (kw: string) => persist(keywords.filter((k) => k !== kw));

  return { keywords, add, remove };
}

export interface Scrap {
  /** 피드에서 사라져도 볼 수 있도록 아이템 전체를 스냅샷으로 저장 */
  item: FeedItem;
  scrappedAt: string;
}

const isScrapArray = (v: unknown): v is Scrap[] =>
  Array.isArray(v) &&
  v.every(
    (x) =>
      typeof x === "object" &&
      x !== null &&
      typeof (x as Scrap).scrappedAt === "string" &&
      typeof (x as Scrap).item === "object",
  );

export function useScraps() {
  const [scraps, persist] = useLocalJson<Scrap[]>(SCRAPS_KEY, [], isScrapArray);

  const has = (id: string) => scraps.some((s) => s.item.id === id);

  const toggle = (item: FeedItem) => {
    if (has(item.id)) {
      persist(scraps.filter((s) => s.item.id !== item.id));
    } else {
      const next = [{ item, scrappedAt: new Date().toISOString() }, ...scraps];
      persist(next.slice(0, SCRAPS_MAX));
    }
  };

  return { scraps, has, toggle };
}
