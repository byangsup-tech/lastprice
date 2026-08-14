# 룰북 개정 이력

## v0.3.1 (2026-08-14)

경영관리 MVP 2차 — 데이터 반입 경로. 숫자를 손으로 옮겨 적는 한 반복 보고는 불성립한다.

- §9 실데이터 반입 신설: `decks/<덱>/data/*.tsv|csv` + `sources.json`(출처·기준일) + `data.map.json`(바인딩) → `npm run deck:data`가 p 주입·source 기록·출처 각주 생성·assumed 해제. 도구는 계산(달성률 파생·tone 임계)만 하고 수치를 창작하지 않음. 멱등 — 반복 보고 = 데이터 교체 → deck:data → deck:build
- deck-spec에 `slides[].source {label(필수), file?, asOf?}` 추가 (additive — deck-spec/1 유지)
- validate 신설: **source+assumed 동시 지정 error**(실데이터/가정치 이분법), source.label 누락 error, 정량 장(quant 템플릿)에 source·assumed·각주 전무 시 warning
- 지원 변환 5종: perf_table·compare_table(cols 선택·파생 열·tone 임계·sub·hiRow), kpi_tiles(고정 열), bars·trend(labelCol·valueCol)
- 검증 덱: `decks/sample-monthly/`(반복 보고 픽스처 — 가상 데이터, sources label에 테스트용 명기), 음성 neg-5(이분법 2건 검출)
- 규칙 소비자: 엔진 validate·deck:data. 덱보드는 무변경(데이터·제작은 Claude Code 단계 — 역할 분담 유지)

## v0.3.0 (2026-08-14)

경영관리 보고장표 대비 MVP 1차 — 표 폼 세트. (MVP 전체 계획: 표 → 데이터 반입 → 팩 추출 도구 → 문체 교정 배선)

- §8 관계어 2종 추가: **실적표**(perf_table — 계획 대비·달성률·전년 대비·증감), **비교표**(compare_table — 계열사·사별·항목별 비교). 둘 다 정량(차트형). 증감 착색은 셀 tone(role)만으로 하고 수치 표기는 입력 그대로 — 도구는 수치를 만들지 않는다
- §6 역할색 추가: **녹색 = 달성·개선·정상 상태** (`ok`/`okBg` — 실물 승인 덱 「New종신 PoC 상정」 유래). 파랑=당사 **주체** 지목과 구분되는 **상태** 지목. 당사 열 강조는 여전히 oursBg
- 판형 예약: `visual.json`에 `canvas` 블록 신설(정본화), `meta.layout` 필드 예약 — 현재 "wide"만 지원, 그 외는 validate가 거부 (A4 세로는 백로그)
- rules 쌍 개정: `core/relwords.json`(templates 17종 + typeDefs perfRow), `org/{default,_template}/colors.json`(ok·okBg), `org/{default,_template}/visual.json`(canvas)
- 엔진: 공용 표 그리드 `engine/lib/table.ts` 신설(후속 판정표 재사용 예정), 템플릿 등록 23종. 아티팩트: 스케치 SkGridTable, validP perfRow 검사(cells 열 수 일치)
- 검증 덱: showcase에 표 2장 추가(s7·s8), 음성 테스트 neg-4(cells 불일치·hiCol 범위·미지원 판형 — 에러 3건 기대)
- 실물급 템플릿 4종 백로그를 `rulebook/BACKLOG-v0.3.md`로 반입 (좌표 분해 기록 — 첫 실안건 요구 시 착수)

## v0.2.2 (2026-08-09)

덱보드 아티팩트 실사용 패치. 규칙 변경은 1건이고 나머지는 도구 결함 수정이다.

- **rules 변경**: `core/relwords.json`의 구조 장(`cover`·`section`)에 `structural: true` 부여 — 표지·간지는 본문 장의 폼이 아니므로 폼 스터디 후보·수동 선택지에서 제외된다. 체인 줄에 붙으면 엔진이 chrome·head를 건너뛰어 **헤드메시지가 조용히 사라진 슬라이드**가 만들어지던 누수를 막는다 (룰북 §8 구조 장 문단에 반영)
- 아티팩트 수정(규칙 무변경): 정의서 입력 리마운트로 인한 포커스 유실, 정의서 stale 판정을 blur→값 변경 시점으로 이동(오탐·미탐 동시 제거), 폼 스터디 진입 가드·재진입 시 자동 분석 방지, AI 후보를 관계어 사전 15종으로 제한, `formstudy:runs:v1` 1회 이월 + 승률 표시, CDN 3단 폴백, 저장 경쟁으로 인한 마지막 편집 유실, `priorsMissing: []`로 구멍 검사 결과가 버려지던 문제, 가져오기 시 덱 목록 미갱신, 처분 필수 입력(메모·사유) 미강제, 내보내기 각주의 금지 기호(대시)
- 문서: `schema/deckboard-storage.md` 이월 규칙·상태 전이 표·`archivedHoles`·`holeSettled` 정의 개정

## v0.2.1 (2026-08-09)

관계어 사전 확장 — 아키타입 골격이 요구하는데 형태가 없던 장을 채움.

- §8 관계어 템플릿 6종 추가: 대안 비교 표(의사결정 요청형 '대안·평가 기준'), 지표 타일(현황 보고형 '지표'), 로드맵('다음 단계'), 워터폴(요인 분해), 순환(작동 메커니즘), 구성비
- §8 구조 장 추가: 간지(section) — 표지류로 "전 장" 판정 제외
- §5 문장부호: △를 표의 평가 기호로 허용 목록에 등재 (변화량 표기 금지는 유지)
- rules 쌍 개정: `core/relwords.json`(템플릿 15종 + 파생 6종), `org/default/style.json`(△ allow)
- 엔진 렌더 7종 신설 + 아티팩트 스케치 6종 + 검증 쇼케이스 덱(`decks/template-showcase/`)

## v0.2 (2026-08-09)

컨텍스트 교차 검증(`/점검결과.md`)의 픽스 반영. 원본 v0.1은 `ppt/handoff-v0.1/룰북_v0.1.md`.

### 반영된 픽스

| 픽스 | 내용 | 조항 |
|---|---|---|
| F1 (치명) | Q1 답→아키타입 결정표 + 타이브레이커 신설 | §3 |
| F2 (치명) | 구조 결정 우선순위 (골격=뼈대, 저항 순서=본론 내부 배열) | §3 |
| F3 | 문장부호 확장 — `*` `\|` 원문자 허용 명시 (V7 성문화) | §5 |
| F5 | 화해 조항 보강 — 가정 수치의 지위·구조적 프레임·반복 예외 판정 | §4 |
| F8 | AI·도구 생성 수치의 (예시)/assumed 전파 의무 | §6·§9 |
| F11 | 용어 확정 — "전 장"·"폼 동일"·"35자 안팎 ±5자"·"덩어리" | §5·§6·§10 |
| F12 | 말풍선 금칙 명확화 — 금지 대상은 내용(고객 대사)이지 도형이 아님 | §5 |
| F13 | 구멍 검사 적용 단위·종료 조건 | §7 |
| F14 | 차트·밴드 제목 = 서술 라벨, 결론은 헤드메시지 전용 (실물 관행 기준 확정) | §6 |
| F15 | 출처 규정을 타사 사실 주장으로 확장 | §5 |
| V2 | 주석 레이어 — 콜아웃·강조 박스 동시 사용 금지 명시 | §6 |
| V3 | 역할색 표에 기능 구분색(시안·라벤더) 등재, 빨강의 당사 측 사용 금지 명시 | §6 |
| 신규 10 | "강제"의 운영 정의 — 건너뛰기 금지 ≠ 수정 금지, 도구는 경고로 구현 가능 | §1 |
| 신규 11 | §0 상태표에 의존성 열 추가 (확정→가설 의존 명시) | §0 |
| — | Q1 승인/방향 확인 선택 기준 (드라이런 A1) | §2 |
| — | 정량 판정은 메시지 문장 기준 (드라이런 A3) | §8 |
| — | 헤드 2문장 시 체인 테스트는 둘 다 (드라이런 A2) | §5 |
| — | deck-spec 역할색 원칙(hex 금지), 조직 팩 개념 | §9·§10 |

### 조항 ↔ rules 대응표 (개정 시 쌍으로 고칠 것)

| 룰북 조항 | rules 파일 | 소비자 |
|---|---|---|
| §1 파이프라인·강제 운영 정의 | (문서 전용 — 상태 전이는 덱보드 storage 규칙) | 덱보드 |
| §2 정의서·Q1 기준 | `core/archetypes.json` (q1Criteria) | 덱보드 정의서 탭 |
| §3 아키타입·결정표·우선순위 | `core/archetypes.json` | 덱보드(자동 제안·골격 프리셋) |
| §4 사다리·화해 조항 | `core/ladder.json` | Claude Code QA 절차 |
| §5 문체 전체 | `org/<팩>/style.json` (+exceptions.json) | validate·textcheck·덱보드 lint 배지 |
| §6 역할색 | `org/<팩>/colors.json` | 엔진 theme·전 템플릿 |
| §6 시각 파라미터 | `org/<팩>/visual.json` | validate·덱보드 |
| §7 구멍 유형학 | `core/holes.json` | 덱보드 구멍 탭·hole-scan 프롬프트 |
| §8 관계어 사전 | `core/relwords.json` | 덱보드 폼 스터디·form-study 프롬프트·validate(p 형태) |
| §9 제작 규칙 | `schema/deck-spec.schema.json` + `ppt/CLAUDE.md` | 엔진·Claude Code |

**개정 절차**: 룰북 조항 수정 → 대응 rules 파일 수정 → `npm run artifact:build` → `git diff ppt/artifact/deckboard.jsx`로 반영 확인 → 골든 재빌드(`npm run deck:build -- ppt/decks/sample-newlife/deck-spec.json`)로 회귀 확인 → 이 CHANGELOG에 기록.

## v0.1 (핸드오프)

실전 덱 1건(생보 파일럿 컨셉 보고, 2회 개정)에서 추출된 최초 성문화본. `ppt/handoff-v0.1/` 보존.
