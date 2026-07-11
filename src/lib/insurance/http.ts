/** 외부 수집용 공통 fetch — 타임아웃 + 브라우저 UA (일부 국내 사이트가 비브라우저 UA를 차단) */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export async function fetchText(
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000,
): Promise<string> {
  const res = await fetch(url, {
    ...init,
    headers: { "user-agent": UA, ...init.headers },
    signal: AbortSignal.timeout(timeoutMs),
    // 자체 캐시 계층을 쓰므로 Next fetch 캐시는 끈다
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.text();
}

export async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000,
): Promise<T> {
  const text = await fetchText(url, init, timeoutMs);
  return JSON.parse(text) as T;
}
