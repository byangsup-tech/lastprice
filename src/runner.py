"""수집 실행 오케스트레이션 — CLI(main.py)와 웹 UI(webapp.py)가 공유한다.

진행 메시지는 print 로 내보낸다. 웹 UI 는 stdout 을 가로채 화면 로그에 표시하고,
CLI 는 그대로 콘솔에 출력한다.
"""
from __future__ import annotations

import sys
from pathlib import Path

from config import BrowserConfig
from src.browser import launch_browser, polite_sleep
from src.excel_writer import write_long_workbook
from src.scrapers.kb_insurance import KBInsuranceScraper


def app_base_dir() -> Path:
    """산출물(output/·debug/)을 둘 기준 폴더.

    PyInstaller .exe 로 패키징되면 실행파일이 있는 폴더, 아니면 리포지토리 루트.
    """
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


OUTPUT_DIR = app_base_dir() / "output"
DEBUG_DIR = app_base_dir() / "debug"


def run_collection(product_code: str, profiles: list[dict], *,
                   headless: bool = False, limit: int = 0) -> dict:
    """계산기를 돌려 long-format 엑셀을 만든다.

    product_code 가 비면 건강보험 후보 전체, 있으면 그 코드 1건. profiles 는
    조건 프로파일 리스트(각 dict: sex_label·age·maturity_label·payYears_label).
    반환: {ok, output_path, error, products, rows}.
    """
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    if not profiles:
        return {"ok": False, "error": "조건이 하나도 없습니다.", "output_path": None}

    cfg = BrowserConfig(headless=headless)
    results = []
    try:
        with launch_browser(cfg, capture_dir=None) as (_browser, _ctx, page):
            scraper = KBInsuranceScraper(
                page=page, debug_dir=DEBUG_DIR / KBInsuranceScraper.company)
            print(f"[{scraper.company}] 상품 목록 수집 시작…")
            metas = scraper.list_health_products(only_code=product_code or None)
            if not metas:
                tgt = f"상품코드 {product_code}" if product_code else "건강보험 상품"
                return {"ok": False, "output_path": None,
                        "error": f"{tgt} 을(를) 목록에서 찾지 못했습니다."}
            if limit:
                metas = metas[:limit]
            for i, meta in enumerate(metas, 1):
                print(f"  [{i}/{len(metas)}] {meta['name']}")
                results.extend(scraper.quote_product_profiles(meta, profiles))
                polite_sleep(cfg)
    except Exception as e:
        return {"ok": False, "output_path": None,
                "error": f"{type(e).__name__}: {e}"}

    out = write_long_workbook(KBInsuranceScraper.company, results, OUTPUT_DIR)
    rows = sum(len(p.riders) for p in results)
    print(f"[완료] {out}")
    return {"ok": True, "output_path": str(out), "error": "",
            "products": len(results), "rows": rows}
