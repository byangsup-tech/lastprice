# DART OpenAPI 수집기 — 보험지주회사 설립 벤치마킹

국내 금융지주 5곳과 보험 자회사 9곳(+ 선행·휴면 법인 3곳, 총 **17 법인**)의 정량
데이터를 DART 전자공시 OpenAPI 로 수집한다.

**설계의 최우선 원칙은 출처 추적성이다.** 모든 원본을 보관하고, 산출 테이블의 모든
행에 출처를 컬럼으로 남긴다. 추정·보간·삭제를 하지 않는다.

## 빠른 시작

```bash
# 0) (선택) XLSX 를 만들려면
pip install -r scripts/dart/requirements.txt

# 1) 네트워크·키 없이 전 구간 자체 검증
python3 scripts/dart/run.py selftest

# 2) 키 설정  (https://opendart.fss.or.kr 에서 무료 발급, 일 20,000건)
export DART_API_KEY=<40자 키>

# 3) 사전 탐침 → dart_out/PHASE0_REPORT.md 를 읽고 판단
python3 scripts/dart/run.py phase0

# 4) 본 수집
python3 scripts/dart/run.py phase1
python3 scripts/dart/run.py phase2
python3 scripts/dart/run.py emit
```

`phase1` 은 `PHASE0_REPORT.md` 가 없으면 실행을 거부한다(`--force` 로 무시 가능).
"Phase 0 결과를 먼저 확인한다"는 절차를 코드로 강제한 것이다.

## 명령

| 명령 | 하는 일 | 네트워크 | 키 |
|---|---|---|---|
| `selftest` | 픽스처로 collect→emit 전 구간 검증 (68개 단언) | 불필요 | 불필요 |
| `resolve` | 상호·종목코드 → `corp_code` 해석 | 필요 | 필요 |
| `phase0` | 사전 탐침 3종 → `PHASE0_REPORT.md` | 필요 | 필요 |
| `phase1` | 정형 데이터 (약 950~1,100콜) | 필요 | 필요 |
| `phase2` | 사업보고서 원문 ZIP 수집 | 필요 | 필요 |
| `emit` | `raw/` → CSV·XLSX 재조립 | **불필요** | **불필요** |
| `all` | phase0 → phase1 → phase2 → emit | 필요 | 필요 |

주요 플래그: `--out ./dart_out` `--delay 0.4` `--max-calls 5000` `--refresh`
`--refresh-status 013,020` `--max-age-days 30` `--dry-run` `--years 2015-2026`
`--only 한화생명보험,한화손해보험` `--endpoint otrCprInvstmntSttus` `--max-doc-bytes`

`--dry-run` 은 호출하지 않고 `plan.csv`(의도한 호출 1건 = 1행)만 만든다. 키가 없어도 된다.

## 산출물 (`./dart_out/`)

```
raw/                  원본 JSON·ZIP 전부 + .meta.json 사이드카 — 삭제 금지
  _transient/         한도 초과·전송 이상 응답 (감사용, 캐시 아님)
  _quarantine/        sha256 불일치로 격리된 원본 (삭제하지 않음)
text/                 원문 전문·섹션 텍스트·표 XML 조각
call_log.csv          모든 호출 (run_id·마스킹 URL·status·바이트·sha256)
runs.csv              실행 이력      quota_ledger.csv  일자별 쿼터 사용량
corp_codes.csv        상호 ↔ corp_code (+ 미해결 시 corp_codes_candidates.csv)
00_계정과목목록.csv    보험사별 account_nm 고유값 — 매핑은 사람이 결정
01_기업개황  02_공시목록  03_재무제표  03b_재무제표_long
04_타법인출자현황 05_최대주주현황 06_증자감자현황 07_회사채미상환잔액
08_신종자본증권미상환잔액 09_배당 10_직원현황 11_원문추출 12_지분관계
99_미확보목록.csv      status != 000 인 칸 전수 (사유 코드별)
PHASE0_REPORT.md      RUN_REPORT.md      DART_추출결과.xlsx
```

모든 CSV 는 `utf-8-sig`(엑셀 한글 대응)이며 다음 출처 컬럼을 갖는다:

`source_endpoint` `source_params` `rcept_no` `rcept_no_source` `fetched_at`
`status` `call_id` `raw_path` `raw_sha256` `data_age_days`

`raw_path` + `raw_sha256` 로 **디스크의 그 바이트까지** 역추적된다.

## 수집 결과 복원

이 저장소에는 **수집 결과가 압축된 채로 함께 커밋**돼 있습니다. `emit` 이 `raw/` 의 순수
함수라 원본만 있으면 전 산출물을 **네트워크·API 키 없이** 되살릴 수 있습니다.

```bash
tar xzf dart_out/raw.tar.gz -C dart_out/     # 원본 JSON·ZIP 3,096개 (48MB)
gunzip -k dart_out/*.csv.gz                  # 큰 CSV 5종
python3 scripts/dart/run.py emit             # text/ 230MB + XLSX 83MB 까지 복원, 약 4분
```

검증됨: 복원한 CSV 20종이 원본과 **바이트 단위로 일치**합니다.

저장소에 그대로 들어 있어 GitHub 웹에서 바로 볼 수 있는 것: `PHASE0_REPORT.md`,
`RUN_REPORT.md`, `corp_codes.csv`, `12_지분관계.csv`, `99_미확보목록.csv`,
`01_기업개황.csv`, 주요정보 5종(04~10), `call_log.csv`.
`text/` 와 `.xlsx` 는 재생성 가능해 커밋하지 않습니다.

## 설계 원칙 (지키는 불변식)

1. **고정 컬럼 목록을 쓰지 않는다.** 응답 키의 합집합으로 컬럼을 만든다. 그래서
   반기 보고서의 `thstrm_add_amount`·`frmtrm_q_amount` 가 누락되거나, 회사채와
   신종자본증권의 서로 다른 만기구간 컬럼이 섞이는 사고가 구조적으로 불가능하다.
2. **행 정체성에 `rcept_no` 를 포함한다.** 정정신고나 IFRS17 재작성 비교수치가
   원본을 조용히 덮지 않는다.
3. **파생값에 라벨을 붙인다.** `accounting_std_inferred` 는 `inference_rule` 과
   함께 저장된다. `rcept_no_source` 는 API 원본인지 유도값인지 구분한다.
4. **빈칸의 의미를 분리한다.** `parse_status` ∈ ok / key_absent / empty_string /
   dash / unparseable. **절대 0 으로 채우지 않는다.** `△123`·`(123)` 은 음수로 파싱하되
   원문(`amount_raw`)을 함께 남긴다.
5. **미확보 사유를 분리한다.** `reason_code` ∈ api_013 / api_000_empty_list /
   not_applicable_entity_window / not_attempted / fatal_status / transport_failed /
   schema_mismatch / parse_failed.
6. **`emit` 은 `raw/` 의 순수 함수다.** 네트워크도 키도 없이 돌고 멱등하다. 파서를
   고쳐도 쿼터를 다시 쓰지 않는다. 중단된 실행은 "행이 적은 CSV + 전부 설명된
   미확보목록"이 된다 — 중복도 축소도 아니다.

## 안전장치

- **키는 어디에도 남지 않는다.** URL 은 `call()` 안에서만 조립되고, urllib 예외
  (`HTTPError.url` 에 키가 들어 있다)는 감싸서 스크럽 후 재발생한다. 캐시 파일명
  해시는 키를 뺀 뒤 계산하므로 키를 교체해도 전체 재수집이 일어나지 않는다.
- **`020`(한도)·`800`(점검)·키 오류는 캐시하지 않고 즉시 중단**한다. 캐시했다면 한
  번의 한도 초과가 "데이터 없음" 수천 건으로 영구 기록됐을 것이다. 원본은
  `raw/_transient/` 에 감사용으로 남고 `RUN_ABORTED.txt` 에 재개 방법이 적힌다.
- **`013`(데이터 없음)은 오류가 아니라 정상 응답**이므로 재시도하지 않고 캐시한다.
- 원자적 쓰기(`.part` → `rename`) + 사이드카 후행 기록 + 캐시 적중 시 sha256 재검증.
  불일치는 삭제가 아니라 `raw/_quarantine/` 로 격리 후 재조회.
- `quota_ledger.csv` 로 일자별 사용량을 누적해 시작 전에 한도 초과를 예방한다.
- **정체성 교차검증**: 해석된 `corp_code` 를 `company.json` 의 `est_dt`·`stock_code`
  와 대조해 불일치면 중단한다. 손으로 적은 8자리가 다른 회사의 재무 이력 전체를
  완벽한 출처와 함께 끌어오는 사고를 막는다.

## 요청 사양에서 의도적으로 바꾼 것

1. **탐침 ① 의 피험자.** 요청서는 KB금융으로 찍으라고 했지만 KB금융지주는 2008-09
   설립이라 `bsns_year=2008` 의 `013` 은 API 커버리지가 아니라 **법인 존재** 사실이다.
   그대로 하면 경계를 잘못 짚는다. → **신한지주(2001 설립)를 주 피험자**로 하고
   KB금융은 대조군으로 함께 찍는다. 경계 확인을 위해 2016·2017 을 추가했다.
2. **`list.json` 에 `pblntf_ty=A` 를 걸지 않는다.** A 로 거르면 감사보고서(F)가 안
   보여서 "감사보고서만 제출하는가"라는 질문 자체에 답할 수 없다. `corp_code` 를
   주면 기간 제한이 없으므로 전 유형을 받아 로컬에서 분류한다 — 더 싸고 무손실이다.
   `last_reprt_at=N` 으로 **정정신고를 남긴다**(정정 이력이 곧 추적성 자산).
3. **CSV 번호.** 요청서의 "01\_기업개황 ~ 10\_원문추출" 은 Phase 1 엔드포인트 10종 +
   원문 = 11개라 번호가 겹친다. 원문을 `11_원문추출.csv` 로 두고 `12_지분관계.csv`
   (소유 그래프)를 추가했다.
4. **대상 17 법인.** 요청서의 14곳 + 합병으로 사라졌지만 DART 에 별도 `corp_code` 로
   남아 있는 선행법인 3곳(오렌지라이프생명보험, KB생명보험, 구 우리금융지주).

## 조사로 확인한 전제 수정

| 항목 | 요청서 전제 | 실제 |
|---|---|---|
| 캐롯손해보험 | 한화손보 자회사 | **2025-10-01 흡수합병되어 소멸** |
| 동양생명(082640) | 상장 보험사 | 2026-08-11 주식교환 → **2026-08 말 상장폐지** |
| KB라이프 | KB생명+푸르덴셜 합병 | **존속법인은 푸르덴셜생명** → corp_code 는 구 푸르덴셜 것 |
| 신한라이프 | 신한생명+오렌지라이프 합병 | **존속법인은 신한생명** |
| 우리금융지주 | 316140 | DART 에 **동명 corp_code 2개**(구 2014 해산 / 신 2019 설립) |
| iM금융지주 개명 | 2024 | 지주는 **2025-03-26**(iM라이프는 2024-06-05) |
| 한화손해보험 개명 | ~2002 | 인수 2002-12, **개명 2007-01-03** |
| 한화생명 | 지주 5곳 | 금융지주회사법상 지주회사가 **아니다**(보험업법상 자회사 소유) |

`config.py` 의 `TARGETS` 와 `DISCONTINUITY_EVENTS` 에 반영돼 있고, 소멸·휴면 법인의
생존기간 밖 칸은 호출하지 않고 `not_applicable_entity_window` 로 기록한다.

## 범위 밖

- **K-ICS 는 수집하지 않는다.** DART 에 없다. 감독목적 지표라 보험사 경영공시와
  생명보험협회·손해보험협회 공시실이 출처다. 재무제표에서 찾으려 하지 말 것.
- **계정과목 의미 매핑을 하지 않는다.** 보험손익·투자손익에 해당하는 계정은 회사마다
  이름이 다르다. `00_계정과목목록.csv` 에 고유값을 전부 뽑아 두었으니 확인 후
  결정하면 된다.
- **2022 이전과 2023 이후를 하나의 시계열로 잇지 않는다.** IFRS4→IFRS17 단절이다.
  2023년 보고서의 전기 비교수치는 IFRS17 로 재작성된 값이라 2022년 보고서의 당기
  수치와 다르다. `is_comparative`·`comparability_break` 로 표시만 하고 결합은 하지 않는다.
- **표 격자를 추론하지 않는다.** 원문 표는 `rowspan`/`colspan` 을 그대로 실어
  내보낸다. COLSPAN 헤더에서 격자를 잘못 짜면 기말 CSM 이 전기 칸으로 밀린다.
- **단위를 환산하지 않는다.** "(단위: 백만원)" 은 `unit_hint` 에 원문 그대로 담긴다.

## 주석·CSM 에 대해

**DART OpenAPI 에 주석(註釋) 조회 엔드포인트는 존재하지 않는다.** XBRL 주석은 API 가
아니라 웹 일괄다운로드(TSV)로만 제공되고, `fnlttXbrl.xml` 에는 본표만 들어 있다.
`보험계약부채` 같은 재무상태표 집계 계정은 `fnlttSinglAcntAll` 에 잡히지만 **CSM
(계약서비스마진)은 그 부채의 구성요소로 주석 롤포워드 표에만 있다.** 따라서 CSM 은
Phase 2 의 원문 파싱으로만 얻을 수 있다. Phase 0-3 이 이를 실측 확인한다.

깨끗한 CSM 시계열이 필요하다면 보험사 경영공시·협회 공시실이 훨씬 싸다.

## 파일 구성

```
config.py    17개 법인(별칭·생존기간·정체성 단언), 엔드포인트 표, 단절 이벤트
client.py    호출/캐시/원본보관/호출로그/재시도/레이트리밋/키마스킹/쿼터원장
corpcode.py  corpCode.xml 해석 + 정체성 교차검증
grid.py      '무엇을 호출해야 했는가' — phase1 과 emit 이 공유
docparse.py  DART 원문 파서 (인코딩 사다리, SECTION/TITLE/TABLE, TE·TU 셀)
phase0.py phase1.py phase2.py
emit.py      raw/ → CSV·XLSX (순수 함수)
fixtures.py  오프라인 픽스처 생성      selftest.py  68개 단언
run.py       CLI
```
