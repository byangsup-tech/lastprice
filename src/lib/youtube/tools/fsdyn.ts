import * as fs from "fs";

/**
 * 동적 디렉터리 스캔 헬퍼.
 * Next 번들 트레이서(NFT)는 `readdirSync(변수)` 를 보면 프로젝트 전체를 서버리스 번들에 포함시키므로,
 * 폰트·브라우저 탐색처럼 경로가 런타임에 정해지는 스캔은 이 간접 호출을 쓴다.
 */
const dyn = fs as unknown as Record<string, unknown>;

export function listDir(dir: string): string[] {
  try {
    const fn = dyn["readdir" + "Sync"] as (d: string) => string[];
    return fn(dir);
  } catch {
    return [];
  }
}
