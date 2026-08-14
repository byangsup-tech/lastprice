/** deck-spec/1 타입 정의 — 정본 문서는 ppt/schema/deck-spec.schema.json */

export interface DeckMeta {
  title: string;
  /** chrome 좌상단 러닝 헤더 (예: "New종신 컨셉 보고") */
  deckLabel: string;
  author?: string;
  date?: string;
  /** rules/org 팩 이름 — 생략 시 rules/active.json */
  org?: string;
  archetype?: string;
  /** 판형 (v0.3.0 예약) — 생략 또는 "wide". 다른 값은 미지원으로 검증 실패 */
  layout?: string;
  /** 출력 파일명 (.pptx) — 스펙 파일과 같은 디렉터리에 생성 */
  fileName: string;
}

export interface HeadRun {
  t: string;
  /** 헤드 키워드 형광 (전 장 시스템) */
  hl?: boolean;
}

export interface StampSpec {
  mark: string; // "✕" | "○" 등
  role: "ours" | "problem" | "legacy";
  text: string;
}

export interface SlideSpec {
  id: string;
  template: string;
  /** 상단 큰 제목 — 주제 라벨 (표지는 생략) */
  label?: string;
  /** 우상단 캡슐 */
  pill?: string;
  head?: { runs: HeadRun[]; sub?: string };
  /** 본문 밴드 제목 — 서술 라벨 (결론은 헤드메시지 전용, F14) */
  band?: string;
  /** 템플릿별 파라미터 — 색은 role 키만, hex 금지 */
  p: Record<string, unknown>;
  /** 실데이터 출처 (v0.3.1 — deck:data가 기록). assumed와 상호 배타 — 실데이터는 가정치가 아님 */
  source?: { label: string; file?: string; asOf?: string };
  stamps?: StampSpec[];
  /** AI·도구가 채운 가정 수치 포함 여부 — true면 footnote에 가정 명기 의무 (F8) */
  assumed?: boolean;
  footnote?: string;
  /** 발표자 노트 — 서사 강등 목적지 */
  notes?: string;
}

export interface DeckSpec {
  schemaVersion: "deck-spec/1";
  meta: DeckMeta;
  /** 정의서 추적용 (선택) */
  definition?: Record<string, unknown>;
  slides: SlideSpec[];
  /** 원본과의 의도적 차이 등 메모 */
  _notes?: string[];
}
