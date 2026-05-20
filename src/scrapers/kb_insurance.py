"""KB손해보험 보험가격공시실 스크래퍼.

대상 URL: https://www.kbinsure.co.kr/CG803000012.ec  (보험가격공시-장기)

⚠️  주의
이 스크래퍼의 셀렉터는 한국 보험사 가격공시실의 일반적 UI 패턴에 근거한 초안이다.
KB손보 사이트는 비-브라우저 요청(WebFetch/curl 등)을 차단하므로 클라우드 환경에서
사전 DOM 확인이 불가능했다. 첫 실행은 반드시 headed 모드(BrowserConfig.headless=False)로
하고, debug/ 디렉터리의 스크린샷·HTML 덤프를 보며 SELECTORS / TEXT_PATTERNS 상수를
실제 사이트 구조에 맞춰 보정해야 한다.

`python -m src.main --inspect` 로 inspection 모드 실행 시
계산기 페이지까지만 이동해 스크린샷·HTML을 남긴 뒤 종료한다.
"""
from __future__ import annotations

import re
from typing import Optional

from playwright.sync_api import Locator, TimeoutError as PWTimeout

from config import QuoteCondition
from src.models import Product, Rider
from src.scrapers.base import BaseScraper

LIST_URL = "https://www.kbinsure.co.kr/CG803000012.ec"

# 건강보험 카테고리 키워드 — 상품명에서 필터링
# (실제 사이트 확인: 장기보험 탭에 "간편건강보험", "초경증 간편건강보험" 등이 들어 있음)
HEALTH_KEYWORDS = ("건강", "암", "CI", "치명", "뇌", "심장", "성인병")

# 1단계 스크린샷에서 확인된 구조:
#   - URL: https://www.kbinsure.co.kr/CG803000012.ec
#   - 탭: "자동차보험" / "장기보험(환급형장기보험)" / "일반보험(소멸성단기보험)"
#   - 테이블 컬럼: 구분 | 상품코드 | 상품명 | [보험료계산] 버튼
#   - 버튼 텍스트는 "보험료계산" (공백 없음)
#   - 상품 상세페이지 없이 행의 버튼 → 바로 계산기 (팝업 추정)
SELECTORS = {
    "tab_long_term": "text=장기보험",           # "장기보험(환급형장기보험)" 부분 매칭
    "product_table": "table",                   # TODO: 보정 (devtools로 id/class 확인)
    "product_rows": "table tbody tr",
    "calc_button_in_row": "button:has-text('보험료계산'), a:has-text('보험료계산')",
    # 계산기 페이지(팝업) 내 셀렉터 — devtools 캡처 받은 뒤 보정
    "gender_male": "input[type=radio][value='M'], label:has-text('남')",
    "gender_female": "input[type=radio][value='F'], label:has-text('여')",
    "age_input": "input[name*='age'], input[id*='age']",
    "insurance_period": "select[name*='insrPrd'], select[id*='insurance']",
    "payment_period": "select[name*='pymPrd'], select[id*='payment']",
    "waiver_checkbox": "input[type=checkbox][name*='waiv'], label:has-text('납입면제')",
    "calculate_button": "button:has-text('보험료계산'), button:has-text('보험료 계산'), input[type=button][value*='계산']",
    "result_table": "table:has(th:has-text('보험료'))",
    "rider_rows": "table.rider tbody tr, table:has(th:has-text('특약')) tbody tr",
}


class KBInsuranceScraper(BaseScraper):
    company = "KB손해보험"
    base_url = LIST_URL

    # ------------------------------------------------------------------ #
    # 상품 목록
    # ------------------------------------------------------------------ #
    def list_health_products(self) -> list[dict]:
        """장기보험 탭에서 건강보험 키워드가 들어간 상품을 추린다.

        스크린샷 확인 결과 테이블 컬럼은 [구분 | 상품코드 | 상품명 | 보험료계산버튼] 구조.
        """
        self.page.goto(self.base_url, wait_until="domcontentloaded")
        self.page.wait_for_load_state("networkidle")
        self.snap("01_list_loaded")

        # 장기보험(환급형장기보험) 탭 선택
        self._click_if_visible(SELECTORS["tab_long_term"])
        self.page.wait_for_load_state("networkidle")
        self.snap("02_long_term_tab")

        products: list[dict] = []
        rows = self.page.locator(SELECTORS["product_rows"])
        n = rows.count()
        for i in range(n):
            row = rows.nth(i)
            cells = row.locator("td")
            if cells.count() < 3:
                continue
            text = (row.inner_text() or "").strip()
            if not any(k in text for k in HEALTH_KEYWORDS):
                continue
            code = (cells.nth(1).inner_text() or "").strip()
            name = (cells.nth(2).inner_text() or "").strip()
            # 행 내 보험료계산 버튼이 있는 행만
            if row.locator(SELECTORS["calc_button_in_row"]).count() == 0:
                continue
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
            self._fill_condition(condition)
            riders_meta = self._set_all_riders_to_min()
            self._click_calculate()
            self._read_premiums_into(product, riders_meta)
            self._close_calculator_if_popup()
        except PWTimeout as e:
            product.error = f"Timeout: {e}"
            self.snap(f"ERR_timeout_{product.name[:20]}")
        except Exception as e:
            product.error = f"{type(e).__name__}: {e}"
            self.snap(f"ERR_{product.name[:20]}")
        return product

    # ------------------------------------------------------------------ #
    # 내부 동작
    # ------------------------------------------------------------------ #
    _main_page = None  # 목록 페이지 참조 (계산기가 팝업으로 뜰 때 복귀용)

    def _open_calculator_from_list(self, meta: dict) -> None:
        """목록 페이지에서 해당 행의 '보험료계산' 버튼 클릭 → 계산기 진입.

        - 새 창(팝업)으로 열리면 self.page 를 팝업으로 교체
        - 같은 탭/모달이면 self.page 유지
        """
        # 매 상품마다 목록을 다시 보장 (이전 상태 영향 방지)
        if self.page.url != self.base_url:
            self.page.goto(self.base_url, wait_until="domcontentloaded")
            self._click_if_visible(SELECTORS["tab_long_term"])
            self.page.wait_for_load_state("networkidle")

        self._main_page = self.page
        rows = self.page.locator(SELECTORS["product_rows"])
        target_btn = rows.nth(meta["row_index"]).locator(SELECTORS["calc_button_in_row"]).first

        try:
            with self.page.context.expect_page(timeout=5000) as popup_info:
                target_btn.click()
            popup = popup_info.value
            popup.wait_for_load_state("domcontentloaded")
            self.page = popup
        except PWTimeout:
            # 팝업이 아니라 모달/같은 탭
            self.page.wait_for_load_state("networkidle")

        self.snap(f"03_calc_open_{meta.get('code') or meta['name'][:15]}")

    def _close_calculator_if_popup(self) -> None:
        if self._main_page is not None and self.page is not self._main_page:
            try:
                self.page.close()
            except Exception:
                pass
            self.page = self._main_page
            self._main_page = None

    def _fill_condition(self, c: QuoteCondition) -> None:
        gender_sel = SELECTORS["gender_male"] if c.gender == "M" else SELECTORS["gender_female"]
        self._click_if_visible(gender_sel)

        age_input = self.page.locator(SELECTORS["age_input"]).first
        if age_input.count():
            age_input.fill(str(c.age))

        self._select_by_text(SELECTORS["insurance_period"], c.insurance_period)
        self._select_by_text(SELECTORS["payment_period"], c.payment_period)

        if c.premium_waiver:
            cb = self.page.locator(SELECTORS["waiver_checkbox"]).first
            if cb.count() and not (cb.is_checked() if self._is_input(cb) else False):
                cb.click()

        self.snap("05_condition_filled")

    def _set_all_riders_to_min(self) -> list[dict]:
        """모든 특약 행을 순회하며 (1) 체크박스 ON, (2) 가입금액을 최저가입금액으로 입력.

        반환: [{'name': str, 'min_amount': int}, ...]
        """
        riders: list[dict] = []
        rider_rows = self.page.locator(SELECTORS["rider_rows"])
        n = rider_rows.count()
        print(f"    · 특약 후보 행 {n}개")

        for i in range(n):
            row = rider_rows.nth(i)
            text = (row.inner_text() or "").strip()
            if not text:
                continue

            name = self._extract_rider_name(row, text)
            min_amount = self._extract_min_amount(text)

            # 체크박스 ON
            cb = row.locator("input[type=checkbox]").first
            if cb.count() and not cb.is_checked():
                try:
                    cb.check()
                except Exception:
                    cb.click()

            # 금액 입력 (최저가입금액 placeholder/hint 값 또는 최저값)
            amt_input = row.locator("input[type=text], input[type=number]").first
            if amt_input.count() and min_amount:
                amt_input.fill(str(min_amount))

            riders.append({"name": name, "min_amount": min_amount, "row_index": i})

        self.snap("06_riders_set_to_min")
        return riders

    def _click_calculate(self) -> None:
        btn = self.page.locator(SELECTORS["calculate_button"]).first
        btn.click()
        self.page.wait_for_load_state("networkidle")
        # 결과 테이블이 나타날 때까지 대기
        try:
            self.page.locator(SELECTORS["result_table"]).first.wait_for(timeout=15_000)
        except PWTimeout:
            pass
        self.snap("07_calculated")

    def _read_premiums_into(self, product: Product, riders_meta: list[dict]) -> None:
        """결과 영역에서 특약별 보험료를 읽어 product 에 채운다.

        결과 표는 보통 [특약명 | 가입금액 | 보험료] 컬럼 구조.
        """
        result_rows = self.page.locator(SELECTORS["rider_rows"])
        total = 0

        for meta in riders_meta:
            row = result_rows.nth(meta["row_index"])
            row_text = (row.inner_text() or "").strip()
            premium = self._extract_premium(row_text)
            rider = Rider(
                name=meta["name"],
                min_amount=meta["min_amount"],
                selected_amount=meta["min_amount"],
                premium=premium,
            )
            product.riders.append(rider)
            if premium:
                total += premium

        # 합계 라벨이 있으면 그쪽 우선
        labeled = self._find_total_premium()
        product.total_premium = labeled if labeled else (total or None)

    # ------------------------------------------------------------------ #
    # 유틸
    # ------------------------------------------------------------------ #
    def _click_if_visible(self, selector: str) -> bool:
        loc = self.page.locator(selector).first
        if loc.count() and loc.is_visible():
            loc.click()
            return True
        return False

    def _select_by_text(self, selector: str, label: str) -> None:
        loc = self.page.locator(selector).first
        if loc.count() == 0:
            return
        try:
            loc.select_option(label=label)
        except Exception:
            # label 매칭 실패 시 부분 매칭 시도
            try:
                opts = loc.locator("option")
                for j in range(opts.count()):
                    txt = (opts.nth(j).inner_text() or "").strip()
                    if label in txt or txt in label:
                        val = opts.nth(j).get_attribute("value")
                        if val is not None:
                            loc.select_option(value=val)
                            return
            except Exception:
                pass

    @staticmethod
    def _is_input(loc: Locator) -> bool:
        try:
            return (loc.evaluate("el => el.tagName") or "").upper() == "INPUT"
        except Exception:
            return False

    @staticmethod
    def _extract_rider_name(row: Locator, fallback_text: str) -> str:
        try:
            label = row.locator("td").nth(0).inner_text().strip()
            if label:
                return label
        except Exception:
            pass
        return fallback_text.split("\n", 1)[0][:80]

    @staticmethod
    def _extract_min_amount(text: str) -> Optional[int]:
        """텍스트에서 '최저 1,000만원', '최저가입금액 500만원' 같은 표현을 추출."""
        m = re.search(r"최저[^0-9]{0,8}([0-9,]+)\s*만원", text)
        if m:
            return int(m.group(1).replace(",", "")) * 10_000
        m = re.search(r"최저[^0-9]{0,8}([0-9,]+)\s*원", text)
        if m:
            return int(m.group(1).replace(",", ""))
        return None

    @staticmethod
    def _extract_premium(text: str) -> Optional[int]:
        """행 텍스트에서 '원' 단위 보험료를 추출 (보통 마지막 컬럼)."""
        nums = re.findall(r"([0-9]{1,3}(?:,[0-9]{3})+)\s*원", text)
        if nums:
            return int(nums[-1].replace(",", ""))
        nums = re.findall(r"([0-9,]+)\s*원", text)
        if nums:
            return int(nums[-1].replace(",", ""))
        return None

    def _find_total_premium(self) -> Optional[int]:
        for kw in ("합계", "합계 보험료", "총 보험료", "월보험료 합계"):
            loc = self.page.locator(f"text={kw}").first
            if loc.count():
                try:
                    near = loc.locator("xpath=ancestor::tr[1]").inner_text()
                    val = self._extract_premium(near)
                    if val:
                        return val
                except Exception:
                    continue
        return None
