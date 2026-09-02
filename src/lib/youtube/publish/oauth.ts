import http from "http";
import { TOKEN_URL, type FetchImpl } from "./youtube-upload";

/**
 * OAuth 헬퍼 (`npm run yt -- auth`) — Desktop app 클라이언트 전제.
 * 127.0.0.1 루프백 서버를 띄워 동의 화면 → /callback?code= → 토큰 교환 → refresh_token 출력.
 * redirect_uri는 동의 URL과 토큰 교환에 정확히 같은 값을 쓴다 (다르면 redirect_uri_mismatch).
 */

export const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const DEFAULT_OAUTH_PORT = 8484;
export const CALLBACK_PATH = "/callback";
export const OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.force-ssl",
];
export const DEFAULT_OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

export function redirectUriFor(port: number): string {
  return `http://127.0.0.1:${port}${CALLBACK_PATH}`;
}

/** 동의 화면 URL — scope는 공백 구분, access_type=offline + prompt=consent 로 refresh_token 강제 발급 */
export function buildConsentUrl(opts: { clientId: string; redirectUri: string; state?: string }): string {
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_id", opts.clientId);
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", OAUTH_SCOPES.join(" "));
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  if (opts.state) u.searchParams.set("state", opts.state);
  return u.toString();
}

export type CallbackParse =
  | { kind: "code"; code: string; state?: string }
  | { kind: "error"; error: string; description?: string }
  | { kind: "ignore"; reason: string };

/** 콜백 요청 URL(경로+쿼리) 파싱 — 경로가 다르면 ignore, error= 면 error, code= 면 code */
export function parseCallbackUrl(rawUrl: string | undefined, expectedPath = CALLBACK_PATH): CallbackParse {
  if (!rawUrl) return { kind: "ignore", reason: "URL 없음" };
  let u: URL;
  try {
    u = new URL(rawUrl, "http://127.0.0.1");
  } catch {
    return { kind: "ignore", reason: "URL 파싱 실패" };
  }
  if (u.pathname !== expectedPath) return { kind: "ignore", reason: `경로 불일치 (${u.pathname})` };
  const error = u.searchParams.get("error");
  if (error) {
    return { kind: "error", error, description: u.searchParams.get("error_description") ?? undefined };
  }
  const code = u.searchParams.get("code");
  if (!code) return { kind: "error", error: "missing_code", description: "code 파라미터가 없습니다" };
  const state = u.searchParams.get("state") ?? undefined;
  return { kind: "code", code, state };
}

export interface ExchangeInput {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}

export interface ExchangeResult {
  refreshToken: string;
  accessToken?: string;
  scope?: string;
}

/** 인가 코드 → 토큰 교환 (redirect_uri는 동의 URL과 동일해야 함) */
export async function exchangeCode(input: ExchangeInput, fetchImpl: FetchImpl = globalThis.fetch): Promise<ExchangeResult> {
  const form = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    code: input.code,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const text = await res.text();
  let parsed: { refresh_token?: string; access_token?: string; scope?: string; error?: string; error_description?: string } = {};
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    // 아래에서 처리
  }
  if (!res.ok) {
    if (parsed.error === "redirect_uri_mismatch") {
      throw new Error(
        `토큰 교환 실패: redirect_uri_mismatch — Google Cloud 콘솔의 OAuth 클라이언트 유형이 '데스크톱 앱'인지 확인하세요 (redirect ${input.redirectUri})`,
      );
    }
    throw new Error(`토큰 교환 실패 (HTTP ${res.status}): ${parsed.error ?? ""} ${parsed.error_description ?? text.slice(0, 200)}`.trim());
  }
  if (!parsed.refresh_token) {
    throw new Error(
      "토큰 응답에 refresh_token이 없습니다 — https://myaccount.google.com/permissions 에서 이 앱의 접근 권한을 삭제한 뒤 다시 실행하세요 (prompt=consent가 무시된 경우)",
    );
  }
  return { refreshToken: parsed.refresh_token, accessToken: parsed.access_token, scope: parsed.scope };
}

export interface StartLocalOAuthOptions {
  clientId: string;
  clientSecret: string;
  /** 기본 8484 (0이면 OS 임의 포트 — 테스트용) */
  port?: number;
  log?: (line: string) => void;
  /** 기본 5분 */
  timeoutMs?: number;
  /** 테스트 주입용 — 코드 교환 함수 */
  exchange?: (input: ExchangeInput) => Promise<ExchangeResult>;
  /** 서버가 열린 뒤 호출 (실제 포트·동의 URL 전달) */
  onReady?: (info: { port: number; consentUrl: string; redirectUri: string }) => void;
}

function htmlPage(title: string, body: string): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:80px auto;padding:0 20px;color:#0f172a}h1{font-size:22px}p{line-height:1.6}</style>
</head><body><h1>${title}</h1><p>${body}</p></body></html>`;
}

/**
 * 루프백 OAuth 흐름. 동의 URL을 로그로 출력하고, 콜백에서 코드를 받아 refresh_token을 돌려준다.
 * 5분 안에 완료되지 않으면 reject. 서버는 어떤 경우에도 닫는다.
 */
export async function startLocalOAuth(opts: StartLocalOAuthOptions): Promise<{ refreshToken: string }> {
  const log = opts.log ?? ((l: string) => console.log(l));
  const requestedPort = opts.port ?? DEFAULT_OAUTH_PORT;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_OAUTH_TIMEOUT_MS;
  const exchange = opts.exchange ?? ((input: ExchangeInput) => exchangeCode(input));
  const state = Math.random().toString(36).slice(2, 12);

  if (!opts.clientId || !opts.clientSecret) {
    throw new Error("YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET이 필요합니다 — Google Cloud 콘솔에서 '데스크톱 앱' OAuth 클라이언트를 만들어 .env.local에 넣으세요");
  }

  return new Promise<{ refreshToken: string }>((resolve, reject) => {
    let settled = false;
    let redirectUri = "";
    const server = http.createServer();
    const timer = setTimeout(() => {
      finish(new Error(`${Math.round(timeoutMs / 60000)}분 안에 인증이 완료되지 않았습니다 — npm run yt -- auth 를 다시 실행하세요`));
    }, timeoutMs);

    function finish(err: Error | null, result?: { refreshToken: string }) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close();
      // 열려 있는 keep-alive 연결 때문에 close 콜백이 늦어질 수 있어 즉시 정리
      server.closeAllConnections?.();
      if (err) reject(err);
      else if (result) resolve(result);
    }

    server.on("error", (e) => {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "EADDRINUSE") {
        finish(new Error(`포트 ${requestedPort}이(가) 사용 중입니다 — 다른 프로세스를 종료하거나 --port 로 바꾸세요`));
      } else finish(e);
    });

    server.on("request", (req, res) => {
      const parsed = parseCallbackUrl(req.url);
      if (parsed.kind === "ignore") {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("not found");
        return;
      }
      if (parsed.kind === "error") {
        res.writeHead(400, { "content-type": "text/html; charset=utf-8" });
        res.end(htmlPage("인증 실패", `${parsed.error}${parsed.description ? ` — ${parsed.description}` : ""}. 터미널로 돌아가 다시 시도하세요.`));
        finish(new Error(`Google 인증 거부/실패: ${parsed.error}${parsed.description ? ` — ${parsed.description}` : ""}`));
        return;
      }
      if (parsed.state && parsed.state !== state) {
        res.writeHead(400, { "content-type": "text/html; charset=utf-8" });
        res.end(htmlPage("인증 실패", "state 값이 일치하지 않습니다. 터미널에서 다시 시도하세요."));
        finish(new Error("OAuth state 불일치 — 다시 시도하세요"));
        return;
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(htmlPage("인증 완료", "터미널로 돌아가세요. 이 창은 닫아도 됩니다."));
      log("인가 코드 수신 — 토큰 교환 중…");
      exchange({ clientId: opts.clientId, clientSecret: opts.clientSecret, code: parsed.code, redirectUri })
        .then((r) => {
          log("");
          log("✅ 리프레시 토큰 발급 완료. .env.local에 추가하세요:");
          log(`YOUTUBE_REFRESH_TOKEN=${r.refreshToken}`);
          log("");
          log("참고: OAuth 동의 화면이 '테스트' 상태(게시 전)라면 리프레시 토큰은 7일 뒤 만료됩니다 — 만료되면 auth를 다시 실행하거나 앱을 '프로덕션'으로 게시하세요.");
          finish(null, { refreshToken: r.refreshToken });
        })
        .catch((e: unknown) => finish(e instanceof Error ? e : new Error(String(e))));
    });

    server.listen(requestedPort, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : requestedPort;
      redirectUri = redirectUriFor(port);
      const consentUrl = buildConsentUrl({ clientId: opts.clientId, redirectUri, state });
      log("── YouTube 업로드 OAuth 인증 ──────────────────────────────");
      log("사전 준비 (Google Cloud 콘솔):");
      log("  1) YouTube Data API v3 사용 설정");
      log("  2) OAuth 클라이언트 ID 생성 — 애플리케이션 유형은 반드시 '데스크톱 앱' (루프백 리디렉션 허용)");
      log("  3) OAuth 동의 화면 → 테스트 사용자에 업로드할 Google 계정 추가 (게시 전 앱은 등록된 계정만 로그인 가능)");
      log(`  4) 요청 범위: ${OAUTH_SCOPES.join(", ")}`);
      log("");
      log("아래 URL을 브라우저에서 열어 채널 계정으로 로그인·동의하세요 (5분 제한):");
      log(consentUrl);
      log("");
      log(`콜백 대기 중: ${redirectUri}`);
      opts.onReady?.({ port, consentUrl, redirectUri });
    });
  });
}
