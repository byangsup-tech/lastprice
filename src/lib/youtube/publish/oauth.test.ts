import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTH_URL,
  OAUTH_SCOPES,
  buildConsentUrl,
  exchangeCode,
  parseCallbackUrl,
  redirectUriFor,
  startLocalOAuth,
  type ExchangeInput,
} from "./oauth";
import { TOKEN_URL, type FetchImpl } from "./youtube-upload";

test("buildConsentUrl — 스코프·offline·consent 파라미터", () => {
  const redirectUri = redirectUriFor(8484);
  assert.equal(redirectUri, "http://127.0.0.1:8484/callback");
  const url = new URL(buildConsentUrl({ clientId: "cid.apps.googleusercontent.com", redirectUri, state: "st1" }));
  assert.equal(`${url.origin}${url.pathname}`, AUTH_URL);
  assert.equal(url.searchParams.get("client_id"), "cid.apps.googleusercontent.com");
  assert.equal(url.searchParams.get("redirect_uri"), redirectUri);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(
    url.searchParams.get("scope"),
    "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl",
  );
  assert.deepEqual(url.searchParams.get("scope")?.split(" "), OAUTH_SCOPES);
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.equal(url.searchParams.get("state"), "st1");
});

test("parseCallbackUrl — code / error / 경로 불일치", () => {
  assert.deepEqual(parseCallbackUrl("/callback?code=4%2FabcDEF&state=xyz&scope=x"), {
    kind: "code",
    code: "4/abcDEF",
    state: "xyz",
  });
  assert.deepEqual(parseCallbackUrl("/callback?error=access_denied&error_description=User%20denied"), {
    kind: "error",
    error: "access_denied",
    description: "User denied",
  });
  assert.equal(parseCallbackUrl("/callback").kind, "error");
  assert.equal(parseCallbackUrl("/favicon.ico").kind, "ignore");
  assert.equal(parseCallbackUrl(undefined).kind, "ignore");
  assert.equal(parseCallbackUrl("/other?code=1").kind, "ignore");
});

test("exchangeCode — authorization_code 폼 + redirect_uri, refresh_token 누락 안내", async () => {
  const calls: { url: string; body: string }[] = [];
  const okFetch: FetchImpl = async (url, init) => {
    calls.push({ url, body: String(init?.body) });
    return new Response(JSON.stringify({ access_token: "at", refresh_token: "rt-1", scope: "x" }), { status: 200 });
  };
  const r = await exchangeCode({ clientId: "c", clientSecret: "s", code: "code1", redirectUri: "http://127.0.0.1:8484/callback" }, okFetch);
  assert.equal(r.refreshToken, "rt-1");
  assert.equal(calls[0].url, TOKEN_URL);
  const form = new URLSearchParams(calls[0].body);
  assert.equal(form.get("grant_type"), "authorization_code");
  assert.equal(form.get("redirect_uri"), "http://127.0.0.1:8484/callback");
  assert.equal(form.get("code"), "code1");

  const noRefresh: FetchImpl = async () => new Response(JSON.stringify({ access_token: "at" }), { status: 200 });
  await assert.rejects(
    exchangeCode({ clientId: "c", clientSecret: "s", code: "x", redirectUri: "r" }, noRefresh),
    /refresh_token이 없습니다/,
  );
  const mismatch: FetchImpl = async () => new Response(JSON.stringify({ error: "redirect_uri_mismatch" }), { status: 400 });
  await assert.rejects(exchangeCode({ clientId: "c", clientSecret: "s", code: "x", redirectUri: "r" }, mismatch), /데스크톱 앱/);
});

test("startLocalOAuth — 루프백 콜백 수신 → 가짜 교환 → refreshToken", async () => {
  const exchanged: ExchangeInput[] = [];
  const logs: string[] = [];
  let ready: { port: number; consentUrl: string; redirectUri: string } | null = null;
  const promise = startLocalOAuth({
    clientId: "cid",
    clientSecret: "sec",
    port: 0,
    log: (l) => logs.push(l),
    exchange: async (input) => {
      exchanged.push(input);
      return { refreshToken: "rt-fake" };
    },
    onReady: (info) => {
      ready = info;
    },
  });
  // 서버가 열릴 때까지 대기
  for (let i = 0; i < 100 && !ready; i++) await new Promise((r) => setTimeout(r, 10));
  assert.ok(ready, "onReady 호출됨");
  const info = ready as { port: number; consentUrl: string; redirectUri: string };
  const consent = new URL(info.consentUrl);
  assert.equal(consent.searchParams.get("redirect_uri"), info.redirectUri);
  const state = consent.searchParams.get("state");
  assert.ok(state);

  // 잘못된 경로는 404, 흐름에 영향 없음
  const nf = await fetch(`http://127.0.0.1:${info.port}/favicon.ico`);
  assert.equal(nf.status, 404);

  const cb = await fetch(`http://127.0.0.1:${info.port}/callback?code=CODE123&state=${state}`);
  assert.equal(cb.status, 200);
  assert.match(await cb.text(), /인증 완료/);
  const r = await promise;
  assert.equal(r.refreshToken, "rt-fake");
  assert.equal(exchanged.length, 1);
  assert.equal(exchanged[0].code, "CODE123");
  assert.equal(exchanged[0].redirectUri, info.redirectUri);
  assert.ok(logs.some((l) => l.includes("데스크톱 앱")));
  assert.ok(logs.some((l) => l.includes("테스트 사용자")));
  assert.ok(logs.some((l) => l.includes("7일")));
  assert.ok(logs.some((l) => l.startsWith("YOUTUBE_REFRESH_TOKEN=rt-fake")));
});

test("startLocalOAuth — error 콜백이면 reject, 서버 종료", async () => {
  let ready: { port: number } | null = null;
  const promise = startLocalOAuth({
    clientId: "cid",
    clientSecret: "sec",
    port: 0,
    log: () => {},
    exchange: async () => ({ refreshToken: "never" }),
    onReady: (info) => {
      ready = info;
    },
  });
  // reject 핸들러를 먼저 붙여 unhandledRejection을 막는다
  const rejection = assert.rejects(promise, /access_denied/);
  for (let i = 0; i < 100 && !ready; i++) await new Promise((r) => setTimeout(r, 10));
  const port = (ready as { port: number } | null)?.port;
  assert.ok(port);
  const res = await fetch(`http://127.0.0.1:${port}/callback?error=access_denied`);
  assert.equal(res.status, 400);
  await rejection;
  await assert.rejects(fetch(`http://127.0.0.1:${port}/callback?code=x`));
});

test("startLocalOAuth — 시간 초과 reject", async () => {
  await assert.rejects(
    startLocalOAuth({ clientId: "cid", clientSecret: "sec", port: 0, timeoutMs: 50, log: () => {}, exchange: async () => ({ refreshToken: "x" }) }),
    /인증이 완료되지 않았습니다/,
  );
});

test("startLocalOAuth — 클라이언트 정보 없으면 즉시 reject", async () => {
  await assert.rejects(startLocalOAuth({ clientId: "", clientSecret: "", log: () => {} }), /YOUTUBE_CLIENT_ID/);
});
