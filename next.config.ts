import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 크롤러가 커밋한 data/ JSON을 서버리스 함수 번들에 포함
  // (키는 picomatch 패턴 — 동적 세그먼트에 [id]가 아닌 *를 써야 매칭됨)
  outputFileTracingIncludes: {
    "/api/daycares/**": ["./data/daycares/*.json", "./data/meta.json"],
    "/api/daycares/*/history": ["./data/history/*.json", "./data/meta.json"],
    // 유튜브 파이프라인 채널 프로필 (서버리스에서도 읽을 수 있게 번들에 포함)
    "/api/youtube/**": ["./content/youtube/channel.json"],
  },
  // 유튜브 파이프라인 산출물·캐시(영상·음성·폰트)와 ffmpeg 바이너리는 서버리스 번들에서 제외
  // (빌드 머신에 .cache/fonts 등이 있으면 트레이서가 함께 담으려 한다)
  outputFileTracingExcludes: {
    "/api/youtube/**": [
      "./content/youtube/jobs/**",
      "./.cache/**",
      "./node_modules/@ffmpeg-installer/**",
      "./node_modules/.cache/**",
    ],
    "/youtube/**": ["./content/youtube/jobs/**", "./.cache/**"],
  },
  // 유튜브 파이프라인의 네이티브/바이너리 의존성은 번들링하지 않고 Node require로 로드
  // (playwright-core는 Next 기본 외부 패키지 목록에 이미 포함)
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg", "msedge-tts"],
};

export default nextConfig;
