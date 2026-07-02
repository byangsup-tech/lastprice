import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 크롤러가 커밋한 data/ JSON을 서버리스 함수 번들에 포함
  // (키는 picomatch 패턴 — 동적 세그먼트에 [id]가 아닌 *를 써야 매칭됨)
  outputFileTracingIncludes: {
    "/api/daycares/**": ["./data/daycares/*.json", "./data/meta.json"],
    "/api/daycares/*/history": ["./data/history/*.json", "./data/meta.json"],
  },
};

export default nextConfig;
