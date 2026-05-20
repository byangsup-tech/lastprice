"""KB손해보험 보험가격공시실 스크래퍼 — WebSquare 계산기 기반 재작성.

대상 목록: https://www.kbinsure.co.kr/CG803000012.ec  (보험가격공시-장기)
각 상품 행의 '보험료계산' 버튼(onclick=openPrice) → 계산기 팝업.

계산기 팝업은 Inswave WebSquare SPA 다. 업로드된 실제 화면 소스로 확인한 구조:

  CT01_0495M  장기_가격공시(PPA 셸) ── 팝업 최상위 윈도우
   │  · #ipt_pdcd       상품코드 입력(5자리)  → scwin.onchangeIptPdcd(code)
   │  · #cal_insBgdt    보험시작일자          → scwin.btn_today_onclick
   │  · #div_tabContent 상품 로드 후 표시
   │  · tab_content/content1 ▼ (iframe)
   └─ CT01_0928M  가입설계
       │  · #btn_save     '저장(보험료산출)' → scwin.main.btnSaveOnclick()
       │  · #ipt_sumPrem  합계보험료
       ├─ wfm_contMater ▼  CT01_1596M (계약사항 컨테이너)
       │   ├─ CT01_0934M  피보험자 — cmb_sexCd(성별) / ipt_insAge(나이)
       │   └─ CT01_0926M  계약형태 — cmb_0001963(납입기간) / cmb_0001966(보험기간)
       └─ tab_ntrDesign/content2 ▼  CT01_1598M  담보 — #grd_cvr 그리드(가상스크롤)

   데이터셋 (전부 최상위 CT01_0495M 윈도우 소유 — 하위 iframe 은 alias 로 참조):
     ds_ltApcCvrInfoDTO  전체 담보목록. 주요 컬럼:
        cvrCd/cvrNm/cvrFullNm  담보 코드·명
        cvrNtrCkYn             가입체크('1'=가입)
        ntramtInputYn          가입금액 입력가능('Y')
        achngCvrTnthwnUnitNtramt  설계 가입금액(만원 단위)
        lowstNamt              최저가입금액(원 단위)  ← 본 PoC 의 목표값
        bestNamt               최고가입금액(원)
        achngCvrPrem           담보 보험료(원)
        basicCvrYn             주계약 여부, upCvrCd  상위담보(하위담보 행 식별)
     ds_ltApcPremDTO     보험료 합계 — sumPrem/guarntPrem/acprm/dcPrem ...
     ds_lngtrmPrdtCmpsInfoDTO  상품정보 — prdtNm/prdtClcd
     ds_ltApcObjDtlDTO       피보험자 — sexCd('1'남/'2'여) / insAge(보험나이)
     ds_ltApcContCndtnDTO    계약형태 — pymnPrdYrcntCd(납입) / insMtrtyYrcntCd(만기)
     ds_lngtrmContCndtnVlvalInfoDTO  계약형태 값목록 — pdcrtItmId/contCndtnItmval/Nm
                            (납입기간 pdcrtItmId=0001963, 보험기간=0001966)

핵심 설계 결정
  WebSquare 그리드는 보이는 행만 그리는 가상스크롤 캔버스라 셀 DOM 스크래핑이
  깨지기 쉽다. 그래서 그리드 DOM 대신 WebSquare 데이터셋 API 를 page.evaluate 로
  직접 호출한다. 그리드는 ds_ltApcCvrInfoDTO 의 '뷰'일 뿐이고, 진짜 데이터·조작
  대상은 데이터셋이다. 상품 로드/보험료 산출도 scwin 함수를 직접 부른다.

⚠️ 라이브 1회 검증 필요  (클라우드에서 KB 사이트 직접 접근이 막혀 사전 확인 불가)
  화면/데이터셋/컴포넌트 이름은 실제 소스 기준이라 신뢰도가 높지만, 아래는
  `python -m src.main --inspect` 로 debug/ 덤프를 보고 확인해야 한다:
   1. CG803000012.ec 목록 행/‘보험료계산’ 버튼 DOM (LIST_SELECTORS) — 목록 화면
      소스는 미확보. 기존 추정값 유지.
   2. 계산기 팝업에서 page.evaluate 가 scwin·ds_* 전역에 도달하는지 (_dump 가 보고).
   3. 성별·나이·기간 입력은 CT01_0934M/CT01_0926M 으로 매핑 완료. _apply_condition()
      이 ds_ltApcObjDtlDTO(sexCd/insAge)·ds_ltApcContCndtnDTO(납입/만기)에 직접 쓰고
      재계산 함수를 호출한다. 단 기간 코드는 상품마다 다를 수 있어(예: '100세'가
      '100' 또는 'A0') 상품 값목록에서 라벨로 역인덱싱한다 — 라이브에서 산출
      보험료가 화면과 일치하는지 확인할 것.
"""
from __future__ import annotations

import json
import re
import time
from typing import Optional

from playwright.sync_api import TimeoutError as PWTimeout

from config import QuoteCondition
from src.models import Product, Rider
from src.scrapers.base import BaseScraper

LIST_URL = "https://www.kbinsure.co.kr/CG803000012.ec"

# 건강보험 카테고리 키워드 — 상품명 필터
HEALTH_KEYWORDS = ("건강", "암", "CI", "치명", "뇌", "심장", "성인병", "간편")

# 목록 페이지(CG803000012.ec) DOM — 목록 화면 소스 미확보, 라이브 검증 대상.
LIST_SELECTORS = {
    "product_rows": "table tbody tr",
    "calc_button_in_row": "a.btn_white_small, a[onclick*='openPrice']",
}

# 계산기(WebSquare) — 컴포넌트 DOM id 와 데이터셋 이름. 실제 소스 기준.
WS = {
    "product_code_input": "#ipt_pdcd",         # CT01_0495M 최상위 윈도우
    "product_name_input": "#ipt_prdtNm",
    "tab_content": "#div_tabContent",
    "save_button": "#btn_save",                # CT01_0928M iframe 내
    "ds_cvr": "ds_ltApcCvrInfoDTO",
    "ds_prem": "ds_ltApcPremDTO",
    "ds_prdt": "ds_lngtrmPrdtCmpsInfoDTO",
    "ds_obj": "ds_ltApcObjDtlDTO",
    "ds_cont": "ds_ltApcContCndtnDTO",
}

# ds_ltApcCvrInfoDTO 컬럼 매핑
CVR = {
    "code": "cvrCd",
    "name": "cvrNm",
    "full_name": "cvrFullNm",
    "checked": "cvrNtrCkYn",                   # '1' = 가입
    "amount_input": "ntramtInputYn",           # 'Y' = 가입금액 입력 담보
    "amount": "achngCvrTnthwnUnitNtramt",      # 설계 가입금액(만원)
    "min_amount": "lowstNamt",                 # 최저가입금액(원)
    "premium": "achngCvrPrem",                 # 담보 보험료(원)
    "basic": "basicCvrYn",
    "up_code": "upCvrCd",                      # 값이 있으면 하위담보 행
}

# 계산기 팝업이 WebSquare 로 준비됐는지: 최상위 윈도우에 scwin·핵심 데이터셋 존재.
_JS_WS_READY = """() => {
    try {
        return typeof scwin !== 'undefined'
            && typeof ds_ltApcCvrInfoDTO !== 'undefined'
            && typeof ds_ltApcPremDTO !== 'undefined';
    } catch (e) { return false; }
}"""

# 담보목록 로드 완료: ds_ltApcCvrInfoDTO 에 행이 채워짐.
_JS_CVR_LOADED = """() => {
    try { return ds_ltApcCvrInfoDTO.getRowCount() > 0; } catch (e) { return false; }
}"""


class KBInsuranceScraper(BaseScraper):
    company = "KB손해보험"
    base_url = LIST_URL

    _main_page = None  # 목록 페이지 (계산기가 팝업으로 뜰 때 복귀용)

    # ------------------------------------------------------------------ #
    # 상품 목록
    # ------------------------------------------------------------------ #
    def list_health_products(self) -> list[dict]:
        """장기보험 목록에서 건강 관련 키워드가 든 상품을 추린다.

        테이블 컬럼: [구분 | 상품코드 | 상품명 | 보험료계산버튼].
        목록 화면 소스는 미확보 — LIST_SELECTORS 는 라이브 검증 대상이다.
        """
        self.page.goto(self.base_url, wait_until="domcontentloaded")
        self.page.wait_for_load_state("networkidle")
        self.snap("01_list_loaded")

        products: list[dict] = []
        rows = self.page.locator(LIST_SELECTORS["product_rows"])
        for i in range(rows.count()):
            row = rows.nth(i)
            cells = row.locator("td")
            if cells.count() < 4:
                continue
            name = (cells.nth(2).inner_text() or "").strip()
            if not any(k in name for k in HEALTH_KEYWORDS):
                continue
            if row.locator(LIST_SELECTORS["calc_button_in_row"]).count() == 0:
                continue
            code = (cells.nth(1).inner_text() or "").strip()
            products.append({"name": name, "code": code, "url": self.base_url, "row_index": i})

        print(f"  └ KB 건강보험 후보 {len(products)}건")
        return products

    # ------------------------------------------------------------------ #
    # 단일 상품 계산
    # ------------------------------------------------------------------ #
    def quote_product(self, product_meta: dict, condition: QuoteCondition) -> Product:
        product = Product(
            company=self.company,
            name=product_meta["name"],
            code=product_meta.get("code", ""),
            source_url=product_meta.get("url", ""),
        )
        try:
            self._open_calculator_from_list(product_meta)
            self._load_product(product_meta.get("code", ""))
            self._apply_begin_date()
            self._apply_condition(product, condition)
            self._set_all_riders_to_min()
            self._calculate()
            self._read_results(product)
            self._close_calculator_if_popup()
        except PWTimeout as e:
            product.error = (product.error + " | " if product.error else "") + f"Timeout: {e}"
            self.snap(f"ERR_timeout_{product.name[:20]}")
            self._close_calculator_if_popup()
        except Exception as e:
            product.error = (product.error + " | " if product.error else "") + f"{type(e).__name__}: {e}"
            self.snap(f"ERR_{product.name[:20]}")
            self._close_calculator_if_popup()
        return product

    # ------------------------------------------------------------------ #
    # 계산기 진입 / 종료
    # ------------------------------------------------------------------ #
    def _open_calculator_from_list(self, meta: dict) -> None:
        """목록 행의 '보험료계산' 버튼(onclick=openPrice) 클릭 → 계산기 팝업.

        팝업이 WebSquare SPA(CT01_0495M) 로 준비될 때까지 대기한다.
        """
        if self.page.url.rstrip("/") != self.base_url.rstrip("/"):
            self.page.goto(self.base_url, wait_until="domcontentloaded")
            self.page.wait_for_load_state("networkidle")

        self._main_page = self.page
        rows = self.page.locator(LIST_SELECTORS["product_rows"])
        target_btn = rows.nth(meta["row_index"]).locator(
            LIST_SELECTORS["calc_button_in_row"]).first

        with self.page.context.expect_page(timeout=15_000) as popup_info:
            target_btn.click()
        popup = popup_info.value
        popup.wait_for_load_state("domcontentloaded")
        self.page = popup

        self._wait_websquare_ready()
        self.snap(f"03_calc_open_{meta.get('code') or meta['name'][:15]}")

    def _close_calculator_if_popup(self) -> None:
        if self._main_page is not None and self.page is not self._main_page:
            try:
                self.page.close()
            except Exception:
                pass
            self.page = self._main_page
            self._main_page = None

    def _wait_websquare_ready(self, timeout_ms: int = 40_000) -> None:
        """계산기 팝업이 WebSquare 로 렌더링되고 scwin·데이터셋이 준비될 때까지 대기."""
        self._wait_until(_JS_WS_READY, timeout_ms, "WebSquare 계산기 준비")

    # ------------------------------------------------------------------ #
    # 계산기 흐름
    # ------------------------------------------------------------------ #
    def _load_product(self, code: str) -> None:
        """상품코드를 입력해 담보목록을 로드한다.

        팝업이 URL 파라미터(key1=상품코드)로 이미 자동 로드된 경우 입력을 건너뛴다.
        """
        if self.page.evaluate(_JS_CVR_LOADED):
            return  # 이미 로드됨

        inp = self.page.locator(WS["product_code_input"])
        if code and inp.count():
            inp.first.fill(code)
            # oneditkeyup → onchangeIptPdcd 와 동일 경로를 직접 호출
            self._ws(f"async () => {{ try {{ return await scwin.onchangeIptPdcd({json.dumps(code)}); }}"
                     f" catch (e) {{ return {{error: String(e)}}; }} }}")

        self._wait_until(_JS_CVR_LOADED, 40_000, "상품 담보목록 로드")
        self.snap("04_product_loaded")

    def _apply_begin_date(self) -> None:
        """보험시작일자를 오늘로 설정. btn_today_onclick 이 날짜 세팅+재계산을 처리."""
        self._ws("""() => {
            try {
                if (typeof scwin !== 'undefined' && scwin.btn_today_onclick) {
                    scwin.btn_today_onclick();
                    return {ok: true};
                }
                return {ok: false, reason: 'no btn_today_onclick'};
            } catch (e) { return {error: String(e)}; }
        }""")

    def _apply_condition(self, product: Product, c: QuoteCondition) -> None:
        """피보험자 성별·나이와 납입·보험기간을 계산기에 설정한 뒤 검증.

        성별·나이는 CT01_0934M 의 cmb_sexCd / ipt_insAge → ds_ltApcObjDtlDTO,
        납입·보험기간은 CT01_0926M 의 cmb_0001963 / cmb_0001966 → ds_ltApcContCndtnDTO
        에 바인딩돼 있고, 두 데이터셋 모두 최상위 윈도우 소유라 page.evaluate 로
        직접 쓴다. 기간 코드는 상품마다 다를 수 있어('100세'가 '100'·'A0' 등)
        하드코딩 대신 상품 값목록(ds_lngtrmContCndtnVlvalInfoDTO)에서 라벨로
        역인덱싱한다. 쓴 뒤 재계산 함수를 호출하고 다시 읽어 검증한다.
        납입면제특약은 별도 입력이 아니라 담보 행이므로 _set_all_riders_to_min 이 처리.
        """
        sex_cd = "1" if c.gender == "M" else "2"
        mtrty_num = re.sub(r"[^0-9]", "", c.insurance_period)  # "100세만기" → "100"
        pymn_num = re.sub(r"[^0-9]", "", c.payment_period)     # "20년납"   → "20"

        js = """(p) => {
            try {
                if (typeof ds_ltApcObjDtlDTO !== 'undefined' && ds_ltApcObjDtlDTO.getRowCount()) {
                    ds_ltApcObjDtlDTO.setCellData(0, 'sexCd', p.sexCd);
                    ds_ltApcObjDtlDTO.setCellData(0, 'insAge', p.age);
                }
                function resolveCode(itmId, numLabel) {
                    if (typeof ds_lngtrmContCndtnVlvalInfoDTO === 'undefined') return null;
                    var rows = ds_lngtrmContCndtnVlvalInfoDTO.getAllJSON();
                    for (var i = 0; i < rows.length; i++) {
                        if (rows[i].pdcrtItmId !== itmId) continue;
                        var nm = String(rows[i].contCndtnItmvalNm || '');
                        if (nm.replace(/[^0-9]/g, '') === numLabel) return rows[i].contCndtnItmval;
                    }
                    return null;
                }
                var pymnCd = resolveCode('0001963', p.pymnNum);
                var mtrtyCd = resolveCode('0001966', p.mtrtyNum);
                if (typeof ds_ltApcContCndtnDTO !== 'undefined' && ds_ltApcContCndtnDTO.getRowCount()) {
                    if (pymnCd != null) ds_ltApcContCndtnDTO.setCellData(0, 'pymnPrdYrcntCd', pymnCd);
                    if (mtrtyCd != null) ds_ltApcContCndtnDTO.setCellData(0, 'insMtrtyYrcntCd', mtrtyCd);
                }
                // 재계산 — 실제 onviewchange 핸들러가 호출하는 top scwin 함수들
                if (typeof scwin !== 'undefined') {
                    scwin.setAutoOcpCd && scwin.setAutoOcpCd();
                    scwin.setLtigenCdFiltered && scwin.setLtigenCdFiltered();
                    scwin.setCmbStrtRsrvAgeList && scwin.setCmbStrtRsrvAgeList(true);
                    scwin.setContCndtn && scwin.setContCndtn('0001963');
                    scwin.setContCndtn && scwin.setContCndtn('0001966');
                    scwin.setContCndtnEnable && scwin.setContCndtnEnable();
                }
                var o = (typeof ds_ltApcObjDtlDTO !== 'undefined' && ds_ltApcObjDtlDTO.getRowCount())
                        ? ds_ltApcObjDtlDTO.getAllJSON()[0] : {};
                var k = (typeof ds_ltApcContCndtnDTO !== 'undefined' && ds_ltApcContCndtnDTO.getRowCount())
                        ? ds_ltApcContCndtnDTO.getAllJSON()[0] : {};
                return {
                    sexCd: o.sexCd || '', insAge: o.insAge || '',
                    pymnPrdYrcntCd: k.pymnPrdYrcntCd || '', insMtrtyYrcntCd: k.insMtrtyYrcntCd || '',
                    resolvedPymn: pymnCd, resolvedMtrty: mtrtyCd
                };
            } catch (e) { return {error: String(e)}; }
        }"""
        actual = self.page.evaluate(js, {
            "sexCd": sex_cd, "age": str(c.age),
            "pymnNum": pymn_num, "mtrtyNum": mtrty_num,
        }) or {}

        if actual.get("error"):
            msg = f"조건설정 실패: {actual['error']}"
            product.error = (product.error + " | " if product.error else "") + msg
            print(f"    · ⚠️  {msg}")
            return

        print(f"    · 조건적용 sexCd={actual.get('sexCd')} insAge={actual.get('insAge')} "
              f"납입={actual.get('pymnPrdYrcntCd')} 만기={actual.get('insMtrtyYrcntCd')}")

        problems = []
        if str(actual.get("sexCd")) != sex_cd:
            problems.append(f"성별({sex_cd}≠{actual.get('sexCd')})")
        if str(actual.get("insAge")) != str(c.age):
            problems.append(f"나이({c.age}≠{actual.get('insAge')})")
        if actual.get("resolvedPymn") is None:
            problems.append(f"납입기간 '{c.payment_period}' 코드 미해석")
        if actual.get("resolvedMtrty") is None:
            problems.append(f"보험기간 '{c.insurance_period}' 코드 미해석")
        if problems:
            msg = "조건 적용 확인 필요: " + ", ".join(problems)
            product.error = (product.error + " | " if product.error else "") + msg
            print(f"    · ⚠️  {msg}")

    def _set_all_riders_to_min(self) -> None:
        """모든 담보를 가입체크하고 가입금액을 최저가입금액(lowstNamt)으로 설정.

        ds_ltApcCvrInfoDTO(마스터 데이터셋)에 직접 쓴다. 최종 보험료는 _calculate()
        의 btnSaveOnclick 이 데이터셋 상태 기준으로 재산출한다.
        납입면제특약도 담보 행의 하나라 함께 가입 처리된다.
        만원 단위: achngCvrTnthwnUnitNtramt = lowstNamt / 10000.
        """
        result = self._ws("""() => {
            try {
                var ds = ds_ltApcCvrInfoDTO, n = ds.getRowCount();
                var checked = 0, amounted = 0;
                for (var i = 0; i < n; i++) {
                    var isSub = ds.getCellData(i, 'upCvrCd');
                    if (!isSub && ds.getCellData(i, 'cvrNtrCkYn') !== '1') {
                        ds.setCellData(i, 'cvrNtrCkYn', '1');
                        checked++;
                    }
                    var low = ds.getCellData(i, 'lowstNamt');
                    if (ds.getCellData(i, 'ntramtInputYn') === 'Y'
                            && low != null && low !== '' && Number(low) > 0) {
                        ds.setCellData(i, 'achngCvrTnthwnUnitNtramt',
                                       Math.floor(Number(low) / 10000));
                        amounted++;
                    }
                }
                return {rows: n, checked: checked, amounted: amounted};
            } catch (e) { return {error: String(e)}; }
        }""") or {}
        if result.get("error"):
            raise RuntimeError(f"담보 최저가입금액 설정 실패: {result['error']}")
        print(f"    · 담보 {result.get('rows')}행 — 가입 {result.get('checked')} / "
              f"금액설정 {result.get('amounted')}")
        self.snap("06_riders_set_to_min")

    def _calculate(self) -> None:
        """'저장(보험료산출)' 실행 → 합계보험료가 채워질 때까지 대기.

        최상위 scwin.btnSaveOnclick() 직접 호출. 실패 시 CT01_0928M iframe 의
        #btn_save 클릭으로 폴백.
        """
        res = self._ws("""async () => {
            try {
                if (typeof scwin !== 'undefined' && scwin.btnSaveOnclick) {
                    await scwin.btnSaveOnclick();
                    return {ok: true};
                }
                return {ok: false, reason: 'no btnSaveOnclick'};
            } catch (e) { return {error: String(e)}; }
        }""") or {}

        if not res.get("ok"):
            # 폴백: 가입설계 iframe 의 저장 버튼 클릭
            for fr in self.page.frames:
                if "CT01_0928M" in (fr.url or ""):
                    btn = fr.locator(WS["save_button"])
                    if btn.count():
                        btn.first.click()
                    break

        # 합계보험료(ds_ltApcPremDTO.sumPrem) 가 산출될 때까지 대기
        self._wait_until(
            """() => { try {
                var v = ds_ltApcPremDTO.getCellData(0, 'sumPrem');
                return v != null && v !== '' && Number(v) > 0;
            } catch (e) { return false; } }""",
            45_000, "보험료 산출")
        self.snap("07_calculated")

    def _read_results(self, product: Product) -> None:
        """ds_ltApcCvrInfoDTO / ds_ltApcPremDTO 를 읽어 product 에 채운다."""
        data = self._ws("""() => {
            try {
                return {
                    cvr: ds_ltApcCvrInfoDTO.getAllJSON(),
                    prem: ds_ltApcPremDTO.getRowCount() ? ds_ltApcPremDTO.getAllJSON()[0] : {},
                    prdt: (typeof ds_lngtrmPrdtCmpsInfoDTO !== 'undefined'
                           && ds_lngtrmPrdtCmpsInfoDTO.getRowCount())
                          ? ds_lngtrmPrdtCmpsInfoDTO.getAllJSON()[0] : {}
                };
            } catch (e) { return {error: String(e)}; }
        }""") or {}
        if data.get("error"):
            raise RuntimeError(f"결과 데이터셋 읽기 실패: {data['error']}")

        prdt = data.get("prdt") or {}
        if prdt.get("prdtNm"):
            product.name = prdt["prdtNm"]

        for row in data.get("cvr") or []:
            if (row.get(CVR["up_code"]) or "").strip():
                continue  # 하위담보 행은 상위담보에 합산되므로 별도 행 생략
            name = (row.get(CVR["full_name"]) or row.get(CVR["name"]) or "").strip()
            if not name:
                continue
            min_won = self._to_int(row.get(CVR["min_amount"]))
            amt_won = self._to_int(row.get(CVR["amount"]))
            if amt_won is not None:
                amt_won *= 10_000  # 만원 단위 → 원
            rider = Rider(
                name=name,
                min_amount=min_won,
                selected_amount=amt_won,
                premium=self._to_int(row.get(CVR["premium"])),
                note=("주계약" if row.get(CVR["basic"]) == "Y" else "")
                + ("" if row.get(CVR["checked"]) == "1" else " 미가입"),
            )
            product.riders.append(rider)
            if row.get(CVR["basic"]) == "Y" and product.main_premium is None:
                product.main_coverage_amount = amt_won
                product.main_premium = rider.premium

        prem = data.get("prem") or {}
        product.total_premium = self._to_int(prem.get("sumPrem"))
        print(f"    · 담보 {len(product.riders)}건 / 합계보험료 {product.total_premium}원")

    # ------------------------------------------------------------------ #
    # WebSquare / 유틸
    # ------------------------------------------------------------------ #
    def _ws(self, js: str):
        """계산기 팝업 최상위 윈도우에서 JS 평가 (page.evaluate 래퍼)."""
        return self.page.evaluate(js)

    def _wait_until(self, js_bool: str, timeout_ms: int, label: str) -> None:
        """js_bool 이 true 를 반환할 때까지 폴링."""
        deadline = time.time() + timeout_ms / 1000
        while time.time() < deadline:
            try:
                if self.page.evaluate(js_bool):
                    return
            except Exception:
                pass
            self.page.wait_for_timeout(500)
        raise PWTimeout(f"{label}: {timeout_ms}ms 초과")

    @staticmethod
    def _to_int(val) -> Optional[int]:
        if val is None or val == "":
            return None
        try:
            return int(round(float(str(val).replace(",", ""))))
        except (ValueError, TypeError):
            return None

    def _dump_websquare_state(self) -> None:
        """--inspect 용. 계산기 팝업의 WebSquare 도달성·프레임·데이터셋 표본을 덤프.

        라이브 1회 실행으로 남은 가정(전역 도달성, 프레임 중첩, 컬럼값)을 한 번에
        확인하기 위한 진단 산출물.
        """
        probe = self.page.evaluate("""() => {
            var out = {hasScwin: false, datasets: {}, fns: {}};
            try { out.hasScwin = (typeof scwin !== 'undefined'); } catch (e) {}
            ['ds_ltApcCvrInfoDTO', 'ds_ltApcPremDTO', 'ds_lngtrmPrdtCmpsInfoDTO',
             'ds_ltApcObjDtlDTO', 'ds_ltApcContCndtnDTO', 'ds_ltApcComnDTO'].forEach(function (n) {
                try { out.datasets[n] = window[n] ? window[n].getRowCount() : 'undefined'; }
                catch (e) { out.datasets[n] = 'ERR:' + e; }
            });
            ['onchangeIptPdcd', 'btn_today_onclick', 'btnSaveOnclick'].forEach(function (n) {
                try { out.fns[n] = (typeof scwin !== 'undefined' && typeof scwin[n] === 'function'); }
                catch (e) { out.fns[n] = 'ERR'; }
            });
            try {
                out.cvrSample = (window.ds_ltApcCvrInfoDTO && ds_ltApcCvrInfoDTO.getRowCount())
                    ? ds_ltApcCvrInfoDTO.getAllJSON().slice(0, 3) : [];
            } catch (e) { out.cvrSample = 'ERR:' + e; }
            return out;
        }""")
        probe["frames"] = [{"url": f.url, "name": f.name} for f in self.page.frames]

        out_path = self.debug_dir / "websquare_probe.json"
        out_path.write_text(json.dumps(probe, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  · WebSquare 진단 덤프: {out_path}")
        print(f"    hasScwin={probe['hasScwin']} datasets={probe['datasets']}")
