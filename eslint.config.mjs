import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // PPT 파이프라인: v0.1 핸드오프 아카이브(원본 보존)와 아티팩트(claude.ai 런타임 대상)는 린트 제외.
    // ppt/engine은 tsc(-p ppt)로 타입체크. 아티팩트 구문 검증은 artifact:build + esbuild.
    "ppt/handoff-v0.1/**",
    "ppt/artifact/**",
  ]),
]);

export default eslintConfig;
