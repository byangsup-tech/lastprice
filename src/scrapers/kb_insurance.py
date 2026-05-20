"""KB손해보험 보험가격공시실 스크래퍼 — WebSquare 계산기 기반 재작성.

대상 목록: https://www.kbinsure.co.kr/CG803000012.ec  (보험가격공시-장기)
상품 행의 '보험료계산'(openPrice) → named popup('preview')으로 loading.html 을
띄운 뒤 ppa.kbinsure.co.kr:8500/ppa/index_ws.jsp 로 전환, 상품코드를 form-POST 로
넘겨 WebSquare 엔진을 부팅한다(클릭한 상품이 자동 로드됨).

계산기 팝업은 Inswave WebSquare SPA 다. 업로드된 실제 화면 소스로 확인한 구조:

  CT01_0495M  장기_가격공시(PPA 셸) ── 계산기 최상위 화면
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

   데이터셋 (전부 CT01_0495M 윈도우 소유 — 하위 iframe 은 alias 로 참조):
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
  깨지기 쉽다. 그래서 그리드 DOM 대신 WebSquare 데이터셋 API 를 런타임 frame 의
  evaluate 로 직접 호출한다. 그리드는 ds_ltApcCvrInfoDTO 의 '뷰'일 뿐이고, 진짜
  데이터·조작 대상은 데이터셋이다. 상품 로드/보험료 산출도 scwin 함수를 직접 부른다.

⚠️ 라이브 1회 검증 필요  (KB 계산기는 ppa.kbinsure.co.kr:8500 별도 서버라 사전확인 불가)
  화면/데이터셋/컴포넌트 이름은 실제 소스 기준이라 신뢰도가 높지만, 아래는
  `python -m src.main --inspect` 의 debug/websquare_probe.json 으로 확인한다:
   1. CG803000012.ec 목록 행/‘보험료계산’ 버튼 DOM (LIST_SELECTORS) — 목록 화면
      소스는 미확보. 기존 추정값 유지.
   2. WebSquare 런타임 frame 위치. index_ws.jsp 가 엔진 iframe 을 만들 수 있어
      scwin·ds_* 가 팝업 최상위가 아닐 수 있다 → _wait_websquare_ready() 가 모든
      frame 을 탐색해 마스터 데이터셋(ds_ltApcCvrInfoDTO)을 가진 frame 을 _ws_frame
      에 잡고, 이후 모든 evaluate 는 그 frame 기준으로 실행한다.
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
    "product_code_input": "#ipt_pdcd",         # CT01_0495M 화면
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

# WebSquare 런타임 frame 식별: 마스터 데이터셋(CT01_0495M 윈도우 소유)이 있는 frame.
# 하위 화면(CT01_0928M 등)은 alias(ads_*)만 가지므로 ds_ltApcCvrInfoDTO 로 구별된다.
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

# WebSquare 런타임 frame 깊은 진단 — 데이터셋(ds_ltApcCvrInfoDTO)에 닿는 경로를
# 모든 후보(componentsCache / modelControl / scwin.form / $p ...)로 시도해 보고한다.
# --inspect 의 websquare_probe.json 에 deepProbe 로 들어가 _ws 접근방식 확정에 쓴다.
_DEEP_PROBE_JS = r"""() => {
    function safe(f) { try { return f(); } catch (e) { return 'ERR:' + String(e).slice(0, 100); } }
    function dsInfo(o) {
        if (!o) return 'null/absent';
        if (typeof o.getRowCount === 'function')
            return 'DATASET rows=' + safe(function () { return o.getRowCount(); });
        return 'type=' + (typeof o);
    }
    var T = 'ds_ltApcCvrInfoDTO', out = {};
    out.cc_total = safe(function () { return Object.keys(WebSquare.componentsCache).length; });
    out.cc_dsKeys = safe(function () {
        return Object.keys(WebSquare.componentsCache)
            .filter(function (k) { return /ltApcCvrInfoDTO/.test(k); }).slice(0, 8); });
    out.cc_direct = safe(function () { return dsInfo(WebSquare.componentsCache[T]); });
    out.modelControl_type = safe(function () { return typeof WebSquare.modelControl; });
    out.modelControl_keys = safe(function () {
        return Object.keys(WebSquare.modelControl).slice(0, 25); });
    out.ModelUtil_keys = safe(function () { return Object.keys(WebSquare.ModelUtil).slice(0, 25); });
    out.Model_keys = safe(function () { return Object.keys(WebSquare.Model).slice(0, 25); });
    out.p_keys = safe(function () { return Object.keys($p).slice(0, 60); });
    out.scwin_keys = safe(function () { return Object.keys(scwin).slice(0, 80); });
    out.scwin_form_type = safe(function () { return typeof scwin.form; });
    out.scwin_form_ds = safe(function () { return dsInfo(scwin.form && scwin.form[T]); });
    out.scwin_form_keys = safe(function () {
        return scwin.form ? Object.keys(scwin.form).slice(0, 60) : 'no-form'; });
    out.scwin_direct_ds = safe(function () { return dsInfo(scwin[T]); });
    out.SC_keys = safe(function () { return Object.keys(SC).slice(0, 40); });
    return out;
}"""


class KBInsuranceScraper(BaseScraper):
    company = "KB손해보험"
    base_url = LIST_URL

    _main_page = None  # 목록 페이지 (계산기가 팝업으로 뜰 때 복귀용)
    _ws_frame = None   # WebSquare 런타임(CT01_0495M)이 사는 frame

    # ------------------------------------------------------------------ #
    # 상품 목록
    # ------------------------------------------------------------------ #
    def list_health_products(self, only_code: Optional[str] = None) -> list[dict]:
        """장기보험 목록에서 상품을 추린다.

        테이블 컬럼: [구분 | 상품코드 | 상품명 | 보험료계산버튼].
        only_code 가 주어지면 그 상품코드 1건만(키워드 무관), 아니면 건강 관련
        키워드가 든 상품들을 반환한다. 목록 화면 소스는 미확보 — LIST_SELECTORS
        는 라이브 검증 대상이다.
        """
        self.page.goto(self.base_url, wait_until="domcontentloaded")
        self.page.wait_for_load_state("networkidle")
        self.snap("01_list_loaded")

        products: list[dict] = []
        rows = self.page.locator(LIST_SELECTORS["product_rows"])
        for i in range(rows.count()):
            row = rows.nth(i)
            # 상품행 식별: '보험료계산'(openPrice) 버튼이 있는 행만 (헤더행 제외).
            if row.locator(LIST_SELECTORS["calc_button_in_row"]).count() == 0:
                continue
            cells = row.locator("td")
            n = cells.count()
            if n < 3:
                continue
            # 카테고리(구분) 셀은 그룹 첫 행에만 rowspan 으로 붙어, 행마다 td 수가
            # 4(첫 행) 또는 3(나머지) 이다. 상품코드·상품명·버튼은 항상 끝 3칸.
            code = (cells.nth(n - 3).inner_text() or "").strip()
            name = (cells.nth(n - 2).inner_text() or "").strip()
            if only_code is not None:
                if code != only_code:
                    continue
            elif not any(k in name for k in HEALTH_KEYWORDS):
                continue
            products.append({"name": name, "code": code, "url": self.base_url, "row_index": i})

        label = f"상품코드 {only_code}" if only_code else "건강보험 후보"
        print(f"  └ KB {label} {len(products)}건")
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
        """목록 행의 '보험료계산' 버튼(openPrice) 클릭 → 계산기 팝업.

        openPrice() 는 named popup('preview')을 loading.html 로 띄운 뒤
        ppa.kbinsure.co.kr:8500/ppa/index_ws.jsp 로 전환, 상품코드를 form-POST 로
        넘겨 WebSquare 엔진을 부팅한다(클릭한 상품이 자동 로드됨). WebSquare
        런타임은 index_ws.jsp 의 자식 iframe 안에 있을 수 있어
        _wait_websquare_ready() 가 frame 을 탐색한다.
        """
        if self.page.url.rstrip("/") != self.base_url.rstrip("/"):
            self.page.goto(self.base_url, wait_until="domcontentloaded")
            self.page.wait_for_load_state("networkidle")

        self._main_page = self.page
        self._ws_frame = None
        rows = self.page.locator(LIST_SELECTORS["product_rows"])
        target_btn = rows.nth(meta["row_index"]).locator(
            LIST_SELECTORS["calc_button_in_row"]).first

        with self.page.context.expect_page(timeout=20_000) as popup_info:
            target_btn.click()
        # 팝업: loading.html → index_ws.jsp → form-POST → WebSquare 부팅.
        # frame 탐색 폴링이 이 네비게이션 단계를 모두 흡수한다.
        self.page = popup_info.value
        self._wait_websquare_ready()
        self.snap(f"03_calc_open_{meta.get('code') or meta['name'][:15]}")

    def _close_calculator_if_popup(self) -> None:
        self._ws_frame = None
        if self._main_page is not None and self.page is not self._main_page:
            try:
                self.page.close()
            except Exception:
                pass
            self.page = self._main_page
            self._main_page = None

    def _wait_websquare_ready(self, timeout_ms: int = 60_000) -> None:
        """팝업의 모든 frame 을 탐색해 WebSquare 런타임 frame 을 _ws_frame 에 저장.

        WebSquare 엔진은 index_ws.jsp 내부에서 iframe 을 만들 수 있어 scwin·ds_*
        가 팝업 최상위가 아닐 수 있다. 마스터 데이터셋 ds_ltApcCvrInfoDTO 는
        CT01_0495M 윈도우에만 있으므로(하위 화면은 alias) 그것으로 식별한다.
        """
        deadline = time.time() + timeout_ms / 1000
        while time.time() < deadline:
            for fr in list(self.page.frames):
                try:
                    if fr.evaluate(_JS_WS_READY):
                        self._ws_frame = fr
                        return
                except Exception:
                    continue  # 네비게이션 중 컨텍스트 파괴 등은 무시
            self.page.wait_for_timeout(500)
        raise PWTimeout(
            f"WebSquare 계산기 준비: {timeout_ms}ms 초과 (팝업 URL={self.page.url})")

    # ------------------------------------------------------------------ #
    # 계산기 흐름
    # ------------------------------------------------------------------ #
    def _load_product(self, code: str) -> None:
        """담보목록이 로드될 때까지 대기.

        팝업은 클릭한 상품을 form-POST 로 자동 로드하므로 보통 대기만 한다.
        자동 로드가 안 된 예외 상황에서만 상품코드를 직접 입력한다.
        """
        if self._ws(_JS_CVR_LOADED):
            return  # form-POST 로 이미 자동 로드됨

        frame = self._ws_frame or self.page
        inp = frame.locator(WS["product_code_input"])
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
        에 바인딩돼 있고, 두 데이터셋 모두 CT01_0495M 윈도우 소유라 런타임 frame
        에서 직접 쓴다. 기간 코드는 상품마다 다를 수 있어('100세'가 '100'·'A0' 등)
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
                // 재계산 — 실제 onviewchange 핸들러가 호출하는 scwin 함수들
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
        actual = self._ws(js, {
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

        scwin.btnSaveOnclick() 직접 호출. 실패 시 CT01_0928M iframe 의
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

        # 합계보험료(ds_ltApcPremDTO.sumPrem) 산출 대기.
        # HAR 분석: 담보를 대량 설계하면 최종 저장(LTI0100101)이 검증오류로 막혀
        # sumPrem 이 안 채워질 수 있다. 그래도 담보별 실시간 보험료(achngCvrPrem)는
        # 이미 산출돼 있으므로, 하드 실패시키지 않고 best-effort 로만 대기한다.
        try:
            self._wait_until(
                """() => { try {
                    var v = ds_ltApcPremDTO.getCellData(0, 'sumPrem');
                    return v != null && v !== '' && Number(v) > 0;
                } catch (e) { return false; } }""",
                30_000, "합계보험료 산출")
        except PWTimeout:
            print("    · 합계보험료 미산출 — 담보별 보험료 합산으로 대체")
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
        total = self._to_int(prem.get("sumPrem"))
        if not total:
            # 합계 미산출 시 담보별 보험료 합산 (HAR: 다담보 설계는 저장검증이 막힐 수 있음)
            total = sum(r.premium for r in product.riders if r.premium) or None
        product.total_premium = total
        print(f"    · 담보 {len(product.riders)}건 / 합계보험료 {product.total_premium}원")

    # ------------------------------------------------------------------ #
    # WebSquare / 유틸
    # ------------------------------------------------------------------ #
    def _ws(self, js: str, arg=None):
        """WebSquare 런타임 frame 에서 JS 평가 (미해결 시 팝업 최상위)."""
        return (self._ws_frame or self.page).evaluate(js, arg)

    def _wait_until(self, js_bool: str, timeout_ms: int, label: str) -> None:
        """js_bool 이 true 를 반환할 때까지 WebSquare frame 에서 폴링."""
        target = self._ws_frame or self.page
        deadline = time.time() + timeout_ms / 1000
        while time.time() < deadline:
            try:
                if target.evaluate(js_bool):
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
        """--inspect 용. 팝업의 모든 frame 에서 WebSquare 접근경로를 전수 진단.

        `scwin`/`ds_*` 가 frame window 전역으로 노출되는지, 아니면 WebSquare 엔진
        API(WebSquare.getComponentById 등)·`$p`·`SC` 로만 닿는지를 frame 별로 찍어
        websquare_probe.json 에 남긴다. 이 결과로 _JS_WS_READY 와 _ws 의 접근
        방식을 확정한다. (현재 evaluate 가 데이터셋에 못 닿아 _wait_websquare_ready
        가 timeout 나는 원인을 한 번에 가려내기 위한 진단.)
        """
        probe_js = """() => {
            function tryf(f) { try { return f(); } catch (e) { return 'ERR:' + e; } }
            var r = { url: location.href };
            r.WebSquare = typeof WebSquare;
            r.SC = typeof SC;
            r.$p = typeof $p;
            r.scwin = typeof scwin;
            r.bareDs = tryf(function () { return typeof ds_ltApcCvrInfoDTO; });
            r.windowDs = tryf(function () {
                return window.ds_ltApcCvrInfoDTO ? 'object' : 'absent'; });
            if (typeof WebSquare !== 'undefined' && WebSquare) {
                r.webSquareApi = tryf(function () {
                    return Object.keys(WebSquare).filter(function (k) {
                        return /component|model|dataset|getComp|getCtrl|find/i.test(k);
                    }).slice(0, 25);
                });
                r.getComponentById = tryf(function () {
                    if (!WebSquare.getComponentById) return 'no-fn';
                    return WebSquare.getComponentById('ds_ltApcCvrInfoDTO') ? 'FOUND' : 'null';
                });
            }
            r.wsGlobals = tryf(function () {
                return Object.keys(window).filter(function (k) {
                    return /^(ds_|fds_|ads_|scwin|grd_|cmb_|ipt_)/.test(k);
                }).slice(0, 40);
            });
            r.windowKeyCount = tryf(function () { return Object.keys(window).length; });
            return r;
        }"""
        frames = []
        for i, fr in enumerate(self.page.frames):
            try:
                info = fr.evaluate(probe_js)
            except Exception as e:
                info = {"error": str(e), "url": fr.url}
            info["frameIndex"] = i
            frames.append(info)

        # WebSquare 런타임 frame(scwin 보유)에 깊은 진단 — 데이터셋 접근경로 확정용
        deep = None
        for info in frames:
            if info.get("scwin") == "object":
                try:
                    deep = self.page.frames[info["frameIndex"]].evaluate(_DEEP_PROBE_JS)
                except Exception as e:
                    deep = {"error": str(e)}
                deep["frameIndex"] = info["frameIndex"]
                break

        out = {
            "popupUrl": self.page.url,
            "frameCount": len(frames),
            "wsFrameResolved": self._ws_frame.url if self._ws_frame else None,
            "frames": frames,
            "deepProbe": deep,
        }
        out_path = self.debug_dir / "websquare_probe.json"
        out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

        # 팝업 스크린샷 + WebSquare frame HTML 저장.
        # 계산기 본화면(담보 그리드) 전에 기초정보 입력화면(성별/나이/기간)이 먼저
        # 뜨는데 그 화면 소스가 없어서, 실제 모습·컴포넌트를 확보하기 위함.
        try:
            self.page.screenshot(path=str(self.debug_dir / "websquare_popup.png"),
                                 full_page=True)
        except Exception as e:
            print(f"  [screenshot 실패] {e}")
        for info in frames:
            if info.get("WebSquare") == "object" or info.get("scwin") == "object":
                idx = info["frameIndex"]
                try:
                    html = self.page.frames[idx].content()
                    (self.debug_dir / f"ws_frame_{idx}.html").write_text(
                        html, encoding="utf-8")
                except Exception as e:
                    print(f"  [frame {idx} html 실패] {e}")

        print(f"  · WebSquare 진단 덤프: {out_path}")
        print(f"    popupUrl={out['popupUrl']}  frames={out['frameCount']}")
        for f in frames:
            print(f"    [{f.get('frameIndex')}] WebSquare={f.get('WebSquare')} "
                  f"scwin={f.get('scwin')} bareDs={f.get('bareDs')}")
        if deep:
            print(f"    deepProbe (frame {deep.get('frameIndex')}):")
            for k in ("cc_direct", "cc_dsKeys", "scwin_form_ds", "scwin_direct_ds",
                      "modelControl_type", "modelControl_keys"):
                print(f"      {k} = {deep.get(k)}")
