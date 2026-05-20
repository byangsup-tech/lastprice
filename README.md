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
# 1단계: 셀렉터 검증 (headed 모드로 계산기 페이지까지 열고 dump)
python -m src.main --inspect

# 2단계: 정상 수집 (headed)
python -m src.main --limit 1     # 우선 1개 상품으로 검증
python -m src.main               # 전체

# 운영: headless
python -m src.main --headless --delay 3
```

결과: `output/KB손해보험.xlsx` — 상품별 시트, 행마다 특약명/최저가입금액/설계금액/월보험료.

---

## ⚠️ 계산기는 WebSquare SPA — 라이브 1회 검증 필요

KB손보 계산기 팝업은 Inswave **WebSquare SPA** 다 (단순 HTML 폼/테이블이 아님).
`src/scrapers/kb_insurance.py` 는 실제 화면 소스(CT01_0495M / CT01_0928M /
CT01_1598M 등)를 분석해 작성했다 — 화면·데이터셋·컴포넌트 이름은 신뢰도가 높다.

다만 KB 사이트는 비-브라우저 요청을 차단해 클라우드에서 사전 확인이 불가능했다.
아래 세 가지는 라이브 `--inspect` 1회로 확인·보정해야 한다:

1. **목록 페이지**(`CG803000012.ec`) 행/‘보험료계산’ 버튼 DOM — `LIST_SELECTORS`
2. **page.evaluate 도달성** — 팝업 최상위 윈도우에서 `scwin`·`ds_*` 전역 접근 여부
3. **피보험자 조건 입력**(성별·나이·기간, 화면 CT01_1596M) — 소스 미확보. 현재는
   계산기에 설정된 모델 조건을 *읽어서 검증만* 한다 (불일치 시 `product.error` 기록)

**첫 실행 절차:**

1. `python -m src.main --inspect` (headed) — 계산기 팝업까지 진입 후
   `debug/KB손해보험/websquare_probe.json` + 스크린샷/HTML 덤프
2. `websquare_probe.json` 으로 `hasScwin` / 데이터셋 행수 / 프레임 트리 확인
3. 위 1~3 항목을 `kb_insurance.py` 의 `LIST_SELECTORS` / `WS` / `_verify_condition`
   에서 보정
4. `--limit 1` 로 첫 상품만 끝까지 돌려 추출 보험료가 화면과 일치하는지 확인
5. 전체 수집으로 확장

`base.py::snap()` 은 각 단계마다 PNG+HTML 을 떨궈서 어디서 깨졌는지 추적하기 쉽다.

---

## 다른 회사로 확장

`src/scrapers/base.py::BaseScraper` 를 상속해 `list_health_products()` 와
`quote_product()` 를 구현한 뒤 `src/main.py::SCRAPERS` 에 등록한다. PoC 검증이 끝나면
DB손보 / 삼성화재 / 현대해상을 같은 인터페이스로 추가 가능.

## 준수 정책

- 초기: `headless=False`, `delay_seconds=2.5` 로 정상 사용자 페이스 유지
- 안정화 후: `--headless --delay 3` 운영 모드
- 사이트 차단/오류 시 즉시 중단하고 사람이 확인. 우회 패턴 (UA rotation, 프록시) 추가 금지.
