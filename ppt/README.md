# PPT 파이프라인 (덱보드 + 빌드 엔진)

PPT 전문가의 제작 프로세스를 룰북화한 개인용 파이프라인.
사용자는 의사결정만 하고, 생성·분석(체인 진단·구멍 검사·폼 스터디·pptx 제작)은 Claude가 수행한다.

```
[claude.ai 아티팩트 = 덱보드]                    [이 저장소 + Claude Code]
정의서 → 체인(+고스트 뷰) → 구멍 검사 → 폼 스터디  →  deck-spec JSON  →  validate → build(pptx) → 렌더 QA
   (Claude 자동 호출: 키 불요, 구독 과금)              (붙여넣기)          (npm run deck:*)
```

## 구성

| 경로 | 내용 |
|---|---|
| `rulebook/룰북_v0.2.md` | 사람용 규칙 정본 (+CHANGELOG: 개정 이력·조항↔rules 대응표) |
| `rules/` | 기계용 규칙 정본. `core/`=방법론(조직 불변), `org/<팩>/`=조직 색깔(이동 시 교체), `active.json`=활성 팩 |
| `prompts/` | Claude 호출 프롬프트 정본 ({{RULES.*}} 슬롯 — 아티팩트 조립 시 주입) |
| `schema/` | deck-spec JSON 스키마 + 덱보드 storage 스키마 문서 |
| `engine/` | deck-spec → pptx 빌드 엔진 (validate / build / render-qa / extract-text) |
| `artifact/` | 덱보드 아티팩트 — `src/deckboard.template.jsx`(정본) → `deckboard.jsx`(생성물, claude.ai에 붙여넣는 파일) |
| `decks/` | 덱 작업물. `sample-newlife/`는 골든 샘플(회귀 기준) |
| `handoff-v0.1/` | v0.1 핸드오프 원본 보존 (룰북 v0.1·사양·form-study·build_v5r·점검의뢰서) |

## 시작하기

```bash
npm install                                                  # 최초 1회
npm run deck:validate -- ppt/decks/sample-newlife/deck-spec.json
npm run deck:build   -- ppt/decks/sample-newlife/deck-spec.json
npm run artifact:build                                       # rules 수정 후 아티팩트 재조립
```

덱보드 사용: `artifact/deckboard.jsx` 전문을 복사해 claude.ai 대화에서 "이 코드로 아티팩트를 만들어줘"로 게시(갱신도 동일). 이후 파이프라인 1~4단계는 덱보드에서, 5~6단계는 내보낸 deck-spec을 Claude Code에 붙여넣어 진행 (`CLAUDE.md`의 제작 워크플로).

## 반복 보고 루프 (v0.3.1 — 정형 보고용)

같은 포맷에 숫자만 갱신되는 월간·주간 보고는 **스펙과 데이터를 분리**한다:

```
decks/<덱>/deck-spec.json     ← 폼·헤드 (체인에서 확정, 잘 안 바뀜)
decks/<덱>/data/*.tsv         ← 수치 (엑셀에서 범위 복사 → 텍스트 저장)
decks/<덱>/data/sources.json  ← 테이블별 출처·기준일 (label은 실제 자료명)
decks/<덱>/data.map.json      ← 슬라이드 ↔ 테이블 바인딩 (최초 1회 작성)
```

매 주기 절차: `data/*.tsv` 수치 교체 → `npm run deck:data -- decks/<덱>` → `npm run deck:build`.
반입된 장은 source(출처·기준일)와 자동 각주가 기록되고 assumed가 해제된다 — 실데이터는 가정치가 아니다 (룰북 §9).
예제: `decks/sample-monthly/` (kpi_tiles·실적표·비교표·추이 4장, 달성률 파생 열·tone 임계 포함).

## 부서 이동 절차 (조직 팩 교체)

바뀌는 것은 조직 색깔(문체·역할색·시각 파라미터·예외 목록)이고, 방법론(`rules/core/`)과 코드(`engine/`, `artifact/src/`)는 그대로다.

1. **재추출** — 새 부서 벤치마크 덱 3~5건을 Claude Code에 주고 요청: "이 덱들에서 문체 규정(종결어미·금칙·기호)과 역할색·시각 파라미터를 추출해 `rules/org/_template/` 4파일 형식으로 `rules/org/<새팩>/`을 만들어줘. 룰북 §5·§6도 같은 내용으로 개정 초안을 써줘." (pptx는 텍스트 추출 + 색 상수 분석으로 판독)
2. **전환** — `rules/active.json`의 `"org"`를 새 팩 이름으로 변경
3. **룰북 개정** — `rulebook/룰북_v0.2.md` §5·§6을 초안으로 교체, CHANGELOG 기록
4. **아티팩트 재조립** — `npm run artifact:build` → 새 `deckboard.jsx`를 claude.ai에 붙여넣기
5. **회귀 확인** — `npm run deck:build -- ppt/decks/sample-newlife/deck-spec.json` — 골든 스펙이 새 팩의 색·문체 검사로 재판정·재렌더되는지 확인

합계: 신규 4파일 + 수정 2파일 + 자동 재생성 1파일. 과거 팩은 `rules/org/`에 남아 롤백·비교 가능.

## 검증 자산

- **골든 재현**: `decks/sample-newlife/deck-spec.json` 빌드 → `npm run deck:text -- <pptx>` 텍스트 추출 → `expected_text.md` 대조. 룰북 픽스로 원본과 의도적으로 다른 부분은 스펙 파일 상단 `_notes` 참조
- **음성 테스트**: `decks/negative-tests/`의 위반 스펙들을 validate가 전건 검출하는지

## 이력

- v0.1: 실전 덱 1건에서 추출한 핸드오프 (`handoff-v0.1/`)
- 점검: 컨텍스트 교차 검증 → 저장소 루트 `점검결과.md` (치명 2건 포함 픽스 16건 + v0.2 신규 조항 제안)
- v0.2: 픽스 반영 성문화 + rules-as-data 분리 + 본 파이프라인 구현
