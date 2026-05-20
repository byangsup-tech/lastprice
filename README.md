# lastprice

국내 보험사 가격공시실에서 건강보험 상품의 모든 특약을 **최저가입금액**으로 설계해
**월 보험료**를 자동 수집하고, 회사별 xlsx 로 저장하는 PoC.

PoC 대상: **KB손해보험 보험가격공시실** (`https://www.kbinsure.co.kr/CG803000012.ec`).

고정 조건 (`config.py`): 남성 / 40세 / 20년납 / 100세만기 / 납입면제 Y

---

## 설치

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install chromium
```

## 실행

```bash
# 트래픽 캡처: 브라우저를 띄워 사용자가 손으로 1회 계산 → HAR/trace 기록
python -m src.main --record

# 셀렉터·프레임 검증: 계산기 팝업까지 열고 debug/ 에 진단 덤프
python -m src.main --inspect

# 정상 수집 (headed)
python -m src.main --limit 1     # 우선 1개 상품으로 검증
python -m src.main               # 전체

# 운영: headless
python -m src.main --headless --delay 3
```

결과: `output/KB손해보험.xlsx` — 상품별 시트, 행마다 특약명/최저가입금액/설계금액/월보험료.
모든 실행은 `debug/kb.har` + `debug/trace.zip` 을 남긴다.

---

## ⚠️ 계산기는 WebSquare SPA — 라이브 1회 검증 필요

KB손보 계산기 팝업은 Inswave **WebSquare SPA** 다 (단순 HTML 폼/테이블이 아님).
`src/scrapers/kb_insurance.py` 는 계산기 실제 화면 소스(CT01_0495M·0928M·1596M·
1598M·0934M·0926M 등)를 분석해 작성했다 — 화면·데이터셋·컴포넌트 이름은 신뢰도가 높다.

다만 KB 계산기 리소스는 `ppa.kbinsure.co.kr:8500` 의 별도 서버라 클라우드에서 실행
확인이 불가능했다. 아래 세 가지는 라이브 `--inspect` 1회로 확인·보정해야 한다:

1. **목록 페이지**(`CG803000012.ec`) 행/‘보험료계산’ 버튼 DOM — `LIST_SELECTORS`
2. **page.evaluate 도달성** — 팝업 최상위 윈도우에서 `scwin`·`ds_*` 전역 접근 여부
3. **기간 코드 해석** — 성별·나이·기간 입력은 CT01_0934M/0926M 으로 매핑 완료.
   단 납입·보험기간 코드를 상품 값목록에서 라벨('20년'·'100세')로 역인덱싱하므로,
   산출 보험료가 사이트 화면과 일치하는지 확인 필요

**첫 실행 절차 (Python·인터넷 되는 PC 에서):**

1. `python -m src.main --record` — 브라우저에서 상품 1개를 손으로 끝까지 계산.
   `debug/kb.har` 에 Submission XHR 이 잡힌다 (아래 'XHR 직호출' 구현의 근거).
2. `python -m src.main --inspect` — 계산기 팝업 진입 후
   `debug/KB손해보험/websquare_probe.json` (frame 트리·데이터셋 도달성) 덤프.
3. 위 두 산출물로 `kb_insurance.py` 의 `LIST_SELECTORS`/`WS`/frame 처리 보정.
4. `--limit 1` 로 첫 상품을 끝까지 돌려 산출 보험료를 사이트 화면과 대조.
5. 전체 수집으로 확장.

`base.py::snap()` 은 각 단계마다 PNG+HTML 을 떨궈서 어디서 깨졌는지 추적하기 쉽다.

---

## 구현 전략 — Playwright 주력, XHR 는 보조

**주력: WebSquare 데이터셋 직접 조작 (`kb_insurance.py`).** 계산기 팝업을 띄우고
WebSquare 런타임 frame 을 찾아 `ds_ltApcCvrInfoDTO` 등 데이터셋을 `evaluate` 로
직접 쓰고 보험료를 산출한다. 브라우저가 WebSquare 의 다단계 상태구성을 대신
굴려주므로 그 복잡함을 그대로 위임할 수 있다.

**Submission XHR 직호출 — 검토했으나 주력으로는 부적합.** `--record` 로 캡처한
`debug/kb.har` 분석 결과:

- 백엔드는 Proframe JSON-POST. 엔드포인트 `ppa.kbinsure.co.kr/po-21/.../WS/v1/`
  `APP_KI/DEVON/LTIxxxxxxx`, 봉투 = `PROHEAD` + `SYSHEAD`(ssotoken 인증) + DTO.
- 담보 카탈로그(`LTI0100403`)는 요청이 작아(상품코드+일자) 재현이 쉽다 — 단
  응답에 최저가입금액·보험료는 비어 있다(별도 한도 서비스 필요).
- 최종 산출(`LTI0100101`)은 수백 개 담보 전체 설계상태(≈800KB)를 통째로 보내며,
  캡처된 호출은 저장검증 오류로 실패. 보험료는 담보별 실시간 호출(`LTI0103804`,
  수백 회)로 들어온다.
- 즉 "1회 캡처 후 치환"이 아니라 WebSquare 클라이언트의 상태구성 로직을 파이썬
  으로 재구현하는 일에 가깝고 KB 의 DTO 변경에 취약하다.

따라서 XHR 직호출은 주력으로 채택하지 않는다. HAR 지식은 ①담보 카탈로그 고속
조회 ②흐름·데이터셋 검증 ③디버깅 레퍼런스로 활용한다. 또한 HAR 에서 "다담보
설계 시 최종 저장이 막힐 수 있음"이 확인돼, `_calculate`/`_read_results` 는 합계
미산출 시 담보별 보험료 합산으로 대체하도록 보강했다.

---

## 다른 회사로 확장

`src/scrapers/base.py::BaseScraper` 를 상속해 `list_health_products()` 와
`quote_product()` 를 구현한 뒤 `src/main.py::SCRAPERS` 에 등록한다. `BaseScraper`
는 결과(상품·특약·보험료)만 추상화하고 특정 프레임워크에 의존하지 않으므로
KB 의 WebSquare 처리 코드는 `KBInsuranceScraper` 안에만 있다.

타사 추가 시 가장 먼저 확인할 것: **어떤 SPA 프레임워크인가**(WebSquare 가 아니라
Nexacro·XPlatform 일 수 있음) → **Submission 류의 백엔드 호출 패턴이 있는가**.
DB손보 / 삼성화재 / 현대해상을 같은 인터페이스로 추가 가능.

## 준수 정책

- 초기: `headless=False`, `delay_seconds=2.5` 로 정상 사용자 페이스 유지
- 안정화 후: `--headless --delay 3` 운영 모드
- 사이트 차단/오류 시 즉시 중단하고 사람이 확인. 우회 패턴 (UA rotation, 프록시) 추가 금지.
