import { readFileSync } from "fs";
import path from "path";
import { parseDotenv } from "./util";

/**
 * .env.local → .env 순으로 읽어 미설정 변수만 채운다.
 * tsx 스크립트(CLI) 전용 — Next 라우트는 프레임워크가 .env.local을 로드하므로 여기를 import하지 않는다
 * (동적 파일 읽기가 라우트 번들 트레이싱에 걸리는 것을 막기 위해 config.ts에서 분리).
 */

let loaded = false;

export function loadDotenvOnce(cwd = process.cwd()): void {
  if (loaded) return;
  loaded = true;
  for (const name of [".env.local", ".env"]) {
    try {
      const file = path.join(/*turbopackIgnore: true*/ cwd, name);
      const parsed = parseDotenv(readFileSync(file, "utf-8"));
      for (const [k, v] of Object.entries(parsed)) {
        if (process.env[k] === undefined) process.env[k] = v;
      }
    } catch {
      // 파일 없음 — 정상
    }
  }
}
