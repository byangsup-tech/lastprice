/** 폼 템플릿 레지스트리 — relwords.json(시드 9종) + 실물 추출 파생(비교 2형·개요 카드·여정·표지) */
import type { SlideCtx } from "../chrome";
import type { SlideSpec } from "../types";

import { layer } from "./layer";
import { hub } from "./hub";
import { beforeAfter } from "./before-after";
import { flow } from "./flow";
import { matrix } from "./matrix";
import { funnel } from "./funnel";
import { bars } from "./bars";
import { trend } from "./trend";
import { textgrid } from "./textgrid";
import { compareRows } from "./compare-rows";
import { compareCards } from "./compare-cards";
import { featureCards } from "./feature-cards";
import { journey } from "./journey";
import { cover } from "./cover";

export interface FormTemplate {
  id: string;
  /** 표지 여부 — 크롬(제목·헤드·쪽번호 프레임) 생략 + 폼 변주·형광 판정 제외 */
  isCover?: boolean;
  /** 빈 프레임·형태 검사 — 문제 목록 반환 (빈 배열 = 통과). validate와 아티팩트가 공유하는 계약 */
  minParams(p: Record<string, unknown>): string[];
  /** 본문 영역 렌더 — chrome/head/band는 엔진이 선처리 */
  render(ctx: SlideCtx, spec: SlideSpec): void;
}

export const TEMPLATES: Record<string, FormTemplate> = {
  layer,
  hub,
  before_after: beforeAfter,
  flow,
  matrix,
  funnel,
  bars,
  trend,
  textgrid,
  compare_rows: compareRows,
  compare_cards: compareCards,
  feature_cards: featureCards,
  journey,
  cover,
};

/** 형태 검사 공용 헬퍼 */
export function arr(p: Record<string, unknown>, key: string, min: number, max: number): string[] {
  const v = p[key];
  if (!Array.isArray(v)) return [`p.${key}: 배열이어야 함 (${min}~${max}개)`];
  if (v.length < min || v.length > max) return [`p.${key}: ${min}~${max}개 필요 (현재 ${v.length})`];
  return [];
}

export function str(p: Record<string, unknown>, key: string, req = true): string[] {
  const v = p[key];
  if (v == null || v === "") return req ? [`p.${key}: 필수 문자열`] : [];
  if (typeof v !== "string") return [`p.${key}: 문자열이어야 함`];
  return [];
}
