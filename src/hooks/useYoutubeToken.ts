"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * 대시보드 쓰기·실행 요청용 공유 토큰 (서버의 YT_DASHBOARD_TOKEN과 같은 값).
 * 브라우저 localStorage에만 저장하며, 설정된 경우 x-yt-token 헤더로 보낸다.
 * useSyncExternalStore로 구독해 effect 안 setState 없이 서버/클라이언트 스냅샷을 맞춘다.
 */
const KEY = "yt-dashboard-token";
const listeners = new Set<() => void>();

export function readDashboardToken(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

/** fetch 헤더에 스프레드 — 토큰이 없으면 빈 객체 */
export function authHeaders(): Record<string, string> {
  const token = typeof window === "undefined" ? "" : readDashboardToken();
  return token ? { "x-yt-token": token } : {};
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

const getServerSnapshot = () => "";

export function useDashboardToken() {
  const token = useSyncExternalStore(subscribe, readDashboardToken, getServerSnapshot);
  const setToken = useCallback((value: string) => {
    try {
      if (value) window.localStorage.setItem(KEY, value);
      else window.localStorage.removeItem(KEY);
    } catch {
      // 저장 불가 환경 — 무시
    }
    for (const l of listeners) l();
  }, []);
  return { token, setToken, hasToken: token.length > 0 };
}
