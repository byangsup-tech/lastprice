"""KB손해보험 보험가격공시 계산기 스크래퍼 — WebSquare 자동화.

흐름 (라이브 확인 결과 반영):
  목록 CG803000012.ec → 행의 '보험료계산'(openPrice) → 팝업
  팝업: index_ws.jsp → WebSquare 엔진 부팅. 계산기 전체가 'WS_MAIN' frame
  한 문서에 inline 합성으로 렌더된다(하위화면도 iframe 아님).
  컴포넌트 DOM id = 긴 접두사 + 논리 id (접두사에 랜덤 토큰 포함). 끝(suffix)은
  안정적이라 [id$="_<논리id>"] 로 요소를 찾고, WebSquare.util.getComponentById(id)
  로 컴포넌트 객체를 얻어 setValue / getAllJSON 등을 호출한다.

  단계
   ① 조건입력 화면 — 성별/나이/직업/운전형태/심사고지유형/납입면제/플랜/납기/만기
   ② '다음' 버튼(btn_saveText) → 담보 그리드 로드
   ③ 담보 그리드 — 전 담보를 최저가입금액으로
   ④ 보험료 산출 → ⑤ 결과 수집

⚠️ 클라우드에서 KB 접속 불가 → 무검증 작성분. 단계마다 debug/ 에 진단(JSON·PNG)
   을 남기므로, 실행 로그와 conditions_diag.json 으로 보정한다.
"""
from __future__ import annotations

import json
import time
from typing import Optional

from playwright.sync_api import TimeoutError as PWTimeout

from config import QuoteCondition
from src.models import Product, Rider
from src.scrapers.base import BaseScraper

LIST_URL = "https://www.kbinsure.co.kr/CG803000012.ec"

HEALTH_KEYWORDS = ("건강", "암", "CI", "치명", "뇌", "심장", "성인병", "간편")

LIST_SELECTORS = {
    "product_rows": "table tbody tr",
    "calc_button_in_row": "a.btn_white_small, a[onclick*='openPrice']",
}

# 조건입력 화면 고정값 (사용자 예시 스크린샷 기준). select/radio 는 라벨 부분일치로
# 매칭하므로 상품마다 코드가 달라도 동작한다.
CONDITION = {
    "sex_label": "남",                  # cmb_sexCd 옵션 라벨 (남/여)
    "age": "40",                       # ipt_insAge
    "occupation_query": "사무직",       # ipt_ocptCdNm 자동완성 검색어
    "drivType_label": "자가용",         # cmb_drivTdcd
    "uwType_label": "간편심사",         # 심사고지유형
    "waiver_label": "6대 납입면제",      # 납입면제
    "plan_label": "간편심사형",         # 플랜(라디오)
    "payYears_label": "20년",          # 납기(라디오)
    "maturity_label": "100세",         # 만기(라디오)
}

# 모든 evaluate 앞에 붙는 WebSquare 헬퍼.
#   wsEl(sfx)   : id 가 sfx 로 끝나는 DOM 요소
#   wsComp(sfx) : 그 요소의 WebSquare 컴포넌트 객체
#   wsDs(name)  : 데이터셋(DOM 요소 없음) — componentsCache 에서 검색
#   wsMethods(c): 컴포넌트가 가진 함수명 목록 (진단용)
_WS_HELPER = r"""
  function wsEl(sfx){var e=document.querySelectorAll('[id$="'+sfx+'"]');return e.length?e[0]:null;}
  function wsComp(sfx){var e=wsEl(sfx);if(!e)return null;try{return WebSquare.util.getComponentById(e.id);}catch(x){return null;}}
  function wsScope(){
    // 계산기 본화면(CT01_0495M)의 페이지 스코프. 데이터셋 ds_* 와 scwin 이 여기에
    // 있다. 컴포넌트 id 의 '_wfmUrl' 까지가 그 페이지 컴포넌트 id.
    try{
      var any=document.querySelector('[id*="_wfmUrl_"]');
      if(!any)return null;
      var m=any.id.match(/^(.*?_wfmUrl)/);
      if(!m)return null;
      var pc=WebSquare.util.getComponentById(m[1]);
      return (pc&&pc.scope)?pc.scope:null;
    }catch(e){return null;}
  }
  function wsDs(name){
    try{var s=wsScope();if(s&&s[name]&&typeof s[name].getRowCount==='function')return s[name];}catch(e){}
    try{
      var cc=WebSquare.componentsCache;
      var ks=Object.keys(cc).filter(function(k){return k===name||k.slice(-(name.length+1))==='_'+name;});
      for(var i=0;i<ks.length;i++){if(cc[ks[i]]&&typeof cc[ks[i]].getRowCount==='function')return cc[ks[i]];}
    }catch(e){}
    return null;
  }
  function wsMethods(c){var m=[];for(var k in c){try{if(typeof c[k]==='function')m.push(k);}catch(e){}}return m;}
"""


class KBInsuranceScraper(BaseScraper):
    company = "KB손해보험"
    base_url = LIST_URL

    _main_page = None   # 목록 페이지
    _ws_frame = None    # WebSquare 엔진이 사는 frame (WS_MAIN)
    # 담보 개별산출 검증 상한 (0=전체). 무검증 v1 — 우선 소수로 메커니즘 확인.
    CVR_VERIFY_LIMIT = 12

    # ------------------------------------------------------------------ #
    # 상품 목록
    # ------------------------------------------------------------------ #
    def list_health_products(self, only_code: Optional[str] = None) -> list[dict]:
        """장기보험 목록에서 상품을 추린다.

        카테고리(구분) 셀이 그룹 첫 행에만 rowspan 으로 붙어 행마다 td 가 4/3 칸.
        상품코드·상품명·버튼은 항상 끝 3칸. only_code 면 그 코드 1건만(키워드 무관).
        """
        self.page.goto(self.base_url, wait_until="domcontentloaded")
        self.page.wait_for_load_state("networkidle")
        self.snap("01_list_loaded")

        products: list[dict] = []
        rows = self.page.locator(LIST_SELECTORS["product_rows"])
        for i in range(rows.count()):
            row = rows.nth(i)
            if row.locator(LIST_SELECTORS["calc_button_in_row"]).count() == 0:
                continue
            cells = row.locator("td")
            n = cells.count()
            if n < 3:
                continue
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
    # 단일 상품
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
            self._resolve_ws_frame()
            self._wait_conditions_screen()
            self._fill_conditions(product)
            self._click_next()
            self._wait_cvr_grid()
            self._quote_riders()
            self._read_results(product)
        except PWTimeout as e:
            product.error = (product.error + " | " if product.error else "") + f"Timeout: {e}"
            self.snap(f"ERR_timeout_{product.name[:20]}")
        except Exception as e:
            product.error = (product.error + " | " if product.error else "") + f"{type(e).__name__}: {e}"
            self.snap(f"ERR_{product.name[:20]}")
        finally:
            self._close_calculator_if_popup()
        if product.error:
            print(f"    ✗ 오류: {product.error}")
        return product

    # ------------------------------------------------------------------ #
    # 계산기 진입
    # ------------------------------------------------------------------ #
    def _open_calculator_from_list(self, meta: dict) -> None:
        """목록 행의 '보험료계산'(openPrice) 클릭 → 계산기 팝업."""
        if self.page.url.rstrip("/") != self.base_url.rstrip("/"):
            self.page.goto(self.base_url, wait_until="domcontentloaded")
            self.page.wait_for_load_state("networkidle")

        self._main_page = self.page
        self._ws_frame = None
        rows = self.page.locator(LIST_SELECTORS["product_rows"])
        btn = rows.nth(meta["row_index"]).locator(LIST_SELECTORS["calc_button_in_row"]).first
        with self.page.context.expect_page(timeout=20_000) as popup_info:
            btn.click()
        self.page = popup_info.value

    def _close_calculator_if_popup(self) -> None:
        self._ws_frame = None
        if self._main_page is not None and self.page is not self._main_page:
            try:
                self.page.close()
            except Exception:
                pass
            self.page = self._main_page
            self._main_page = None

    def _resolve_ws_frame(self, timeout_ms: int = 60_000) -> None:
        """팝업의 모든 frame 중 WebSquare 엔진이 있는 frame 을 찾는다.

        계산기 전체가 그 frame 한 문서에 렌더된다. 'WebSquare' 전역이 객체이고
        componentsCache 가 있는 frame 으로 식별.
        """
        check = """() => {
            try { return typeof WebSquare !== 'undefined'
                && !!WebSquare.componentsCache
                && !!WebSquare.util && typeof WebSquare.util.getComponentById === 'function'; }
            catch (e) { return false; }
        }"""
        deadline = time.time() + timeout_ms / 1000
        while time.time() < deadline:
            for fr in list(self.page.frames):
                try:
                    if fr.evaluate(check):
                        self._ws_frame = fr
                        print(f"    · WebSquare frame: {fr.url[:70]}")
                        return
                except Exception:
                    continue
            self.page.wait_for_timeout(500)
        raise PWTimeout(f"WebSquare frame 탐색 실패 (팝업 {self.page.url})")

    def _wait_conditions_screen(self, timeout_ms: int = 60_000) -> None:
        """조건입력 화면 렌더 대기 — 성별 콤보(cmb_sexCd)가 나타날 때까지."""
        self._wait_until(
            """() => !!document.querySelector('[id$="_cmb_sexCd"]')""",
            timeout_ms, "조건입력 화면 로드")
        self.snap("03_conditions_screen")

    # ------------------------------------------------------------------ #
    # ① 조건입력
    # ------------------------------------------------------------------ #
    def _fill_conditions(self, product: Product) -> None:
        """성별·나이·직업·운전형태·심사고지유형·납입면제·플랜·납기·만기 입력.

        각 필드를 방어적으로 설정하고 결과를 conditions_diag.json 에 남긴다
        (무검증 작성분이라 어느 필드가 실패했는지 1회 실행으로 보려는 목적).
        select/radio 는 컴포넌트의 옵션을 열거해 라벨 부분일치로 값을 고른다.
        """
        # select/radio 옵션이 비동기로 채워질 시간을 준다
        self.page.wait_for_timeout(3000)
        diag = []
        diag.append(self._fill_combo("성별", CONDITION["sex_label"], suffix="_cmb_sexCd"))
        diag.append(self._fill_age(CONDITION["age"]))
        diag.append(self._fill_combo("운전형태", CONDITION["drivType_label"],
                                     suffix="_cmb_drivTdcd"))
        diag.append(self._fill_combo("심사고지유형", CONDITION["uwType_label"],
                                     row_label="심사고지유형"))
        diag.append(self._fill_combo("납입면제", CONDITION["waiver_label"],
                                     row_label="납입면제"))
        diag.append(self._ws_set_radio("rdo_0001963", CONDITION["payYears_label"], "납기"))
        diag.append(self._ws_set_radio("rdo_0001966", CONDITION["maturity_label"], "만기"))
        diag.append(self._ws_set_radio("", CONDITION["plan_label"], "플랜"))
        diag.append(self._fill_occupation(CONDITION["occupation_query"]))

        (self.debug_dir / "conditions_diag.json").write_text(
            json.dumps(diag, ensure_ascii=False, indent=2), encoding="utf-8")
        ok = sum(1 for d in diag if d.get("ok"))
        print(f"    · 조건입력 {ok}/{len(diag)} 성공 — 상세 conditions_diag.json")
        for d in diag:
            if not d.get("ok"):
                print(f"      ✗ {d.get('field')}: {d.get('detail')}")
        self.snap("04_conditions_filled")
        if ok < len(diag):
            product.error = (product.error + " | " if product.error else "") \
                + f"조건입력 일부 실패 ({len(diag) - ok}건)"

    def _fill_age(self, age: str) -> dict:
        """나이 입력 — ipt_insAge 에 실제 DOM 입력 후 Tab 으로 onviewchange 발생.

        컴포넌트 setValue 만으론 변경 이벤트가 안 떠 ds_ltApcObjDtlDTO 동기화·
        검증통과가 안 된다('나이 필수입력' 경고). 실제 입력 이벤트를 발생시키고,
        데이터셋에 값이 반영됐는지 확인한다.
        """
        r = {"field": "나이"}
        try:
            inp = self._ws_frame.locator('[id$="_ipt_insAge"]').first
            if inp.count() == 0:
                r["ok"], r["detail"] = False, "ipt_insAge 없음"
                return r
            inp.click()
            inp.fill(str(age))
            # 포커스 해제 → change/onviewchange. Tab 은 직업칸으로 포커스가 가서
            # 자동완성 드롭다운이 떠 아래 운전형태 콤보를 가리므로 blur 를 쓴다.
            inp.blur()
            self._ws_frame.wait_for_timeout(800)
            val = self._ws("""() => {
                try {
                    var s = wsScope(), ds = s ? s.ds_ltApcObjDtlDTO : null;
                    return (ds && ds.getRowCount()) ? ds.getCellData(0, 'insAge') : 'no-ds';
                } catch (e) { return 'ERR'; }
            }""")
            r["ok"] = str(val) == str(age)
            r["detail"] = f"ds_ltApcObjDtlDTO.insAge={val}"
        except Exception as e:
            r["ok"], r["detail"] = False, f"{type(e).__name__}: {e}"
        return r

    def _fill_combo(self, field: str, label: str,
                    suffix: Optional[str] = None,
                    row_label: Optional[str] = None) -> dict:
        """select1 minimal 콤보 — 클릭해 열고, 떠오른 옵션목록에서 라벨로 클릭.

        WebSquare select1(minimal)은 옵션을 평소엔 DOM 에 두지 않고 열 때만 부유
        목록으로 렌더한다. suffix(논리 id 끝) 또는 row_label(화면 필드라벨)로 콤보를
        찾아 → 클릭해 열고 → 라벨 텍스트를 가진 보이는 leaf 요소를 클릭한다.
        """
        r = {"field": field, "label": label}
        cid = self._ws("""(a) => {
            if (a.suffix) { var e = wsEl(a.suffix); return e ? e.id : null; }
            var ls = document.querySelectorAll('div.w2textbox, th, span, nobr');
            for (var i = 0; i < ls.length; i++) {
                var tt = (ls[i].innerText || ls[i].textContent || '').trim();
                if (tt.indexOf(a.rowLabel) >= 0 && tt.length <= a.rowLabel.length + 4) {
                    var row = ls[i].closest('tr');
                    var cs = (row || document).querySelectorAll('[role=combobox]');
                    for (var j = 0; j < cs.length; j++)
                        if (ls[i].compareDocumentPosition(cs[j]) & 4) return cs[j].id;
                    if (cs.length) return cs[0].id;
                }
            }
            return null;
        }""", {"suffix": suffix, "rowLabel": row_label})
        if not cid:
            r["ok"] = False
            r["detail"] = "콤보 미발견 (suffix/row_label 둘 다 실패)"
            return r
        r["comboId"] = "…" + cid[-44:]
        try:
            self._ws_frame.locator("#" + cid).click(timeout=5000)
        except Exception as e:
            r["ok"] = False
            r["detail"] = f"콤보 열기 실패: {type(e).__name__}"
            return r
        self._ws_frame.wait_for_timeout(700)
        pick = self._ws("""(a) => {
            var exact = [], partial = [], cand = [];
            document.querySelectorAll('li, td, a, span, div').forEach(function (n) {
                var t = (n.innerText || n.textContent || '').trim();
                if (!t || t.length > 50 || t.indexOf(a.label) < 0) return;
                if (n.querySelector('li, td, a, span, div')) return;   // leaf 만
                if (n.offsetParent === null) return;                   // 보이는 것만
                cand.push({tag: n.tagName, cls: (n.className || '').slice(0, 40), text: t});
                (t === a.label ? exact : partial).push(n);
            });
            var hits = exact.length ? exact : partial;   // 정확일치 우선
            if (hits.length) {
                hits[hits.length - 1].click();
                return {ok: true, picked: hits[hits.length - 1].textContent.trim(),
                        exact: exact.length, partial: partial.length};
            }
            return {ok: false, candidates: cand.slice(0, 20)};
        }""", {"label": label}) or {}
        r["ok"] = bool(pick.get("ok"))
        r["detail"] = (f"선택 {pick.get('picked')}" if r["ok"]
                       else f"열었으나 옵션 '{label}' 미발견 (후보 {pick.get('candidates')})")
        return r

    def _ws_set_radio(self, name_frag: str, label: str, field: str) -> dict:
        """라디오그룹 — name 에 name_frag 가 든 radio 중 라벨 일치 항목을 click.

        WebSquare 라디오그룹은 <input type=radio><label>텍스트</label> 구조라
        라벨 텍스트로 고른다. name_frag 가 '' 이면 화면 전체 라디오가 대상
        (플랜처럼 그룹 id 미상일 때).
        """
        r = self._ws("""(a) => {
            var sel = 'input[type=radio]' + (a.frag ? '[name*="' + a.frag + '"]' : '');
            var rs = document.querySelectorAll(sel), labels = [];
            for (var i = 0; i < rs.length; i++) {
                var lbl = rs[i].nextElementSibling;
                var t = lbl ? (lbl.innerText || lbl.textContent || '').trim() : '';
                if (!t) {
                    var l2 = document.querySelector('label[for="' + rs[i].id + '"]');
                    t = l2 ? (l2.innerText || '').trim() : '';
                }
                labels.push(t);
                if (t && t.indexOf(a.label) >= 0) {
                    rs[i].click();
                    return {field: a.f, ok: true, picked: t, count: rs.length};
                }
            }
            return {field: a.f, ok: false, count: rs.length, labels: labels.slice(0, 40)};
        }""", {"frag": name_frag, "label": label, "f": field}) or {}
        r["ok"] = bool(r.get("ok"))
        r["detail"] = (f"선택 {r.get('picked')}" if r["ok"]
                       else f"라벨 '{label}' 라디오 없음 (라디오 {r.get('count')}개, "
                            f"라벨 {r.get('labels')})")
        return r

    def _fill_occupation(self, query: str) -> dict:
        """직업 자동완성 — ipt_ocptCdNm 에 검색어 입력 → 결과목록 첫 행 선택."""
        frame = self._ws_frame
        r = {"field": "직업", "query": query}
        try:
            inp = frame.locator('[id$="_ipt_ocptCdNm"]').first
            if inp.count() == 0:
                r["ok"] = False
                r["detail"] = "ipt_ocptCdNm 없음"
                return r
            inp.click()
            inp.fill(query)
            frame.wait_for_timeout(2500)  # 자동완성 서비스 응답 대기
            # 결과 그리드 grd_ocptList 의 첫 행 클릭
            opt = frame.locator('[id*="grd_ocptList"] [class*="gridBodyDefault"], '
                                '[id*="grd_ocptList"] td').first
            if opt.count():
                opt.click()
                r["ok"] = True
                r["detail"] = "자동완성 첫 행 선택"
            else:
                r["ok"] = False
                r["detail"] = "자동완성 결과 그리드 미발견 — 직업코드 직접지정 필요"
        except Exception as e:
            r["ok"] = False
            r["detail"] = f"{type(e).__name__}: {e}"
        return r

    def _click_next(self) -> None:
        """'다음' 버튼(btn_saveText) 클릭 → 담보 그리드 단계로."""
        res = self._ws("""() => {
            var c = wsComp('_btn_saveText');
            if (c) { try { c.click(); return {ok: true, via: 'comp'}; } catch (e) {} }
            var el = wsEl('_btn_saveText');
            if (el) { el.click(); return {ok: true, via: 'dom'}; }
            return {ok: false};
        }""") or {}
        if not res.get("ok"):
            raise RuntimeError("'다음' 버튼(btn_saveText) 미발견")
        self.snap("05_next_clicked")

    # ------------------------------------------------------------------ #
    # ③ 담보 그리드
    # ------------------------------------------------------------------ #
    def _wait_cvr_grid(self, timeout_ms: int = 70_000) -> None:
        """담보 그리드 로드 대기 — ds_ltApcCvrInfoDTO 에 행이 채워질 때까지.

        타임아웃 시 grid_diag.json(데이터셋 접근경로·DOM 상태)과 스크린샷을 남긴다.
        """
        try:
            self._wait_until(
                """() => { try { var d = wsDs('ds_ltApcCvrInfoDTO');
                    return !!d && d.getRowCount() > 0; } catch (e) { return false; } }""",
                timeout_ms, "담보 그리드 로드")
        except PWTimeout:
            self._dump_grid_diag()
            raise
        self.snap("06_cvr_grid")

    def _dump_grid_diag(self) -> None:
        """'다음' 클릭 후 담보 그리드 단계 진단을 grid_diag.json 에 덤프."""
        diag = self._ws("""() => {
            var r = {};
            r.grdCvrDom = !!document.querySelector('[id$="_grd_cvr"]');
            r.bodyText = (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 280);
            try {
                var ks = Object.keys(WebSquare.componentsCache);
                r.ccTotal = ks.length;
                r.ccCvrKeys = ks.filter(function (k) { return /ltApcCvrInfoDTO/.test(k); }).slice(0, 6);
            } catch (e) { r.ccErr = '' + e; }
            var sc = wsScope();
            r.scopeFound = !!sc;
            if (sc) {
                try {
                    r.scopeKeys = Object.keys(sc).filter(function (k) {
                        return /ltApc|scwin/i.test(k); }).slice(0, 20);
                } catch (e) {}
                try {
                    var d = sc.ds_ltApcCvrInfoDTO;
                    r.cvrViaScope = d ? ('rows=' + d.getRowCount()) : 'absent';
                } catch (e) { r.cvrViaScope = 'ERR:' + e; }
            }
            r.modelUtilGetById = (typeof WebSquare.ModelUtil !== 'undefined'
                && typeof WebSquare.ModelUtil.getModelByID === 'function');
            return r;
        }""") or {}
        (self.debug_dir / "grid_diag.json").write_text(
            json.dumps(diag, ensure_ascii=False, indent=2), encoding="utf-8")
        try:
            self.page.screenshot(path=str(self.debug_dir / "grid_stage.png"), full_page=True)
        except Exception:
            pass
        print(f"    · 그리드 진단 → grid_diag.json (grd_cvr DOM={diag.get('grdCvrDom')}, "
              f"scope={diag.get('scopeFound')}, cvrViaScope={diag.get('cvrViaScope')})")

    def _quote_riders(self) -> None:
        """담보별 개별 산출 — 한도 로드 → 각 담보를 최저가입금액으로 → calRtimeCvrPrem.

        WebSquare 계산기엔 '전 특약 최저 일괄'이 없어, 한도조회로 가입금액을 받은
        뒤 담보를 하나씩 실시간 산출(LTI0103804)한다. 무검증 v1 이라 우선
        CVR_VERIFY_LIMIT 개만 처리해 메커니즘을 확인한다. 한도 적재 결과는
        limits_diag.json 에 남긴다.
        """
        # 1) 한도 로드 — 남은한도/가입금액 채우는 scwin 함수 호출
        lim = self._ws("""() => {
            var sc = wsScope() ? wsScope().scwin : null;
            if (!sc) return {error: 'no scwin'};
            var called = [];
            ['getBcvrNtrLmtAmtList', 'setAllCvrNtrPsblAmt'].forEach(function (fn) {
                if (typeof sc[fn] === 'function') {
                    try { sc[fn](); called.push(fn); } catch (e) { called.push(fn + ':ERR'); }
                }
            });
            return {called: called};
        }""") or {}
        self.page.wait_for_timeout(7000)

        diag = self._ws("""() => {
            var ds = wsDs('ds_ltApcCvrInfoDTO');
            if (!ds) return {error: 'no ds'};
            var n = ds.getRowCount(), wLow = 0, wPsbl = 0, wAmt = 0, sample = [];
            for (var i = 0; i < n; i++) {
                if (ds.getCellData(i, 'lowstNamt')) wLow++;
                if (ds.getCellData(i, 'ntrPsblAmt')) wPsbl++;
                if (ds.getCellData(i, 'achngCvrTnthwnUnitNtramt')) wAmt++;
                if (sample.length < 8 && ds.getCellData(i, 'ntramtInputYn') === 'Y')
                    sample.push({
                        cvrNm: ds.getCellData(i, 'cvrNm'),
                        lowstNamt: ds.getCellData(i, 'lowstNamt'),
                        bestNamt: ds.getCellData(i, 'bestNamt'),
                        ntrPsblAmt: ds.getCellData(i, 'ntrPsblAmt'),
                        achngCvrTnthwnUnitNtramt: ds.getCellData(i, 'achngCvrTnthwnUnitNtramt'),
                        incrsUnitAmt: ds.getCellData(i, 'incrsUnitAmt')});
            }
            return {rows: n, withLowstNamt: wLow, withNtrPsblAmt: wPsbl,
                    withAmount: wAmt, sample: sample};
        }""") or {}
        (self.debug_dir / "limits_diag.json").write_text(
            json.dumps({"limitCalls": lim, "afterLoad": diag}, ensure_ascii=False, indent=2),
            encoding="utf-8")
        print(f"    · 한도로드 {lim.get('called')} — lowstNamt {diag.get('withLowstNamt')}/"
              f"{diag.get('rows')}, ntrPsblAmt {diag.get('withNtrPsblAmt')}, "
              f"금액 {diag.get('withAmount')}")

        # 2) 담보별 개별 산출 (검증: 앞 CVR_VERIFY_LIMIT 개)
        cap = self.CVR_VERIFY_LIMIT or 99999
        targets = self._ws("""(a) => {
            var ds = wsDs('ds_ltApcCvrInfoDTO');
            if (!ds) return [];
            var n = ds.getRowCount(), out = [];
            for (var i = 0; i < n && out.length < a.cap; i++) {
                if (ds.getCellData(i, 'upCvrCd')) continue;
                if (ds.getCellData(i, 'ntramtInputYn') !== 'Y') continue;
                out.push(i);
            }
            return out;
        }""", {"cap": cap}) or []
        print(f"    · 담보 개별산출 — 대상 {len(targets)}건 "
              f"(상한 {self.CVR_VERIFY_LIMIT or '전체'})")

        quoted = 0
        for idx in targets:
            res = self._ws("""(a) => {
                var ds = wsDs('ds_ltApcCvrInfoDTO');
                var sc = wsScope() ? wsScope().scwin : null;
                if (!ds || !sc || typeof sc.calRtimeCvrPrem !== 'function')
                    return {error: 'no ds/scwin/calRtimeCvrPrem'};
                var i = a.i;
                ds.setCellData(i, 'cvrNtrCkYn', '1');
                var amt = ds.getCellData(i, 'lowstNamt') || ds.getCellData(i, 'ntrPsblAmt')
                    || ds.getCellData(i, 'bestNamt');
                if (amt && Number(amt) > 0)
                    ds.setCellData(i, 'achngCvrTnthwnUnitNtramt',
                                   Math.floor(Number(amt) / 10000));
                try { sc.calRtimeCvrPrem(ds, i); } catch (e) { return {error: '' + e}; }
                return {ok: true};
            }""", {"i": idx}) or {}
            if res.get("ok"):
                quoted += 1
            self.page.wait_for_timeout(1500)  # 실시간 산출(LTI0103804) 응답 대기

        print(f"    · {quoted}/{len(targets)}건 산출 요청 완료")
        self.page.wait_for_timeout(4000)
        self.snap("07_riders_quoted")

    def _read_results(self, product: Product) -> None:
        """ds_ltApcCvrInfoDTO / ds_ltApcPremDTO 를 읽어 product 에 채운다."""
        data = self._ws("""() => {
            var cvr = wsDs('ds_ltApcCvrInfoDTO'), prem = wsDs('ds_ltApcPremDTO');
            return {
                cvr: cvr ? cvr.getAllJSON() : null,
                prem: (prem && prem.getRowCount()) ? prem.getAllJSON()[0] : {}
            };
        }""") or {}
        if not data.get("cvr"):
            raise RuntimeError("결과 ds_ltApcCvrInfoDTO 읽기 실패")

        for row in data["cvr"]:
            if (row.get("upCvrCd") or "").strip():
                continue
            name = (row.get("cvrFullNm") or row.get("cvrNm") or "").strip()
            if not name:
                continue
            min_won = self._to_int(row.get("lowstNamt"))
            max_won = self._to_int(row.get("bestNamt"))
            amt = self._to_int(row.get("achngCvrTnthwnUnitNtramt"))
            rider = Rider(
                name=name,
                min_amount=min_won,
                max_amount=max_won,
                selected_amount=amt * 10_000 if amt is not None else None,
                pay_period=(row.get("pymnPrdValue") or "").strip(),
                maturity=(row.get("insMtrtyValue") or "").strip(),
                premium=self._to_int(row.get("achngCvrPrem")),
                note="주계약" if row.get("basicCvrYn") == "Y" else "",
            )
            product.riders.append(rider)
            if row.get("basicCvrYn") == "Y" and product.main_premium is None:
                product.main_coverage_amount = rider.selected_amount
                product.main_premium = rider.premium

        total = self._to_int((data.get("prem") or {}).get("sumPrem"))
        if not total:
            total = sum(r.premium for r in product.riders if r.premium) or None
        product.total_premium = total
        print(f"    · 담보 {len(product.riders)}건 / 합계 {product.total_premium}원")

    # ------------------------------------------------------------------ #
    # 유틸
    # ------------------------------------------------------------------ #
    def _ws(self, body: str, arg=None):
        """WebSquare frame 에서 헬퍼와 함께 JS 평가. body 는 함수식 '(a)=>{...}'."""
        js = "(arg) => { " + _WS_HELPER + "\n return (" + body + ")(arg); }"
        return (self._ws_frame or self.page).evaluate(js, arg)

    def _wait_until(self, js: str, timeout_ms: int, label: str) -> None:
        target = self._ws_frame or self.page
        wrapped = "() => {" + _WS_HELPER + "\n return (" + js + ")(); }"
        deadline = time.time() + timeout_ms / 1000
        while time.time() < deadline:
            try:
                if target.evaluate(wrapped):
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
        """--inspect 용. WebSquare frame 탐색 + 조건화면 컴포넌트 진단을 덤프."""
        try:
            self._resolve_ws_frame(timeout_ms=50_000)
        except Exception as e:
            print(f"  · WS frame 탐색 실패: {e}")
        out = {"popupUrl": self.page.url,
               "frames": [{"i": i, "url": f.url} for i, f in enumerate(self.page.frames)]}
        if self._ws_frame is not None:
            try:
                self._wait_conditions_screen(timeout_ms=40_000)
            except Exception as e:
                out["conditionsWait"] = str(e)
            out["probe"] = self._ws("""() => {
                function info(sfx){
                    var c = wsComp(sfx), e = wsEl(sfx);
                    return {suffix: sfx, elExists: !!e, comp: !!c,
                            methods: c ? wsMethods(c).slice(0, 30) : []};
                }
                return {
                    sexCd: info('_cmb_sexCd'), insAge: info('_ipt_insAge'),
                    drivTdcd: info('_cmb_drivTdcd'), ocptCdNm: info('_ipt_ocptCdNm'),
                    btnNext: info('_btn_saveText'),
                    comboCount: document.querySelectorAll('[role=combobox]').length,
                    radioCount: document.querySelectorAll('input[type=radio]').length,
                    ccDsKeys: (function(){ try {
                        return Object.keys(WebSquare.componentsCache)
                            .filter(function(k){return /ds_ltApc/.test(k);}).slice(0, 10);
                    } catch(e){ return 'ERR'; } })()
                };
            }""")
        out_path = self.debug_dir / "websquare_probe.json"
        out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
        try:
            self.page.screenshot(path=str(self.debug_dir / "websquare_popup.png"), full_page=True)
        except Exception:
            pass
        print(f"  · 진단 덤프: {out_path}")
