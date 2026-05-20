"""엔트리포인트.

사용 예:
  # 정상 수집 (headed 모드 권장)
  python -m src.main

  # 셀렉터 검증용 inspection 모드: 계산기 페이지까지 열고 debug/ 에 덤프 후 종료
  python -m src.main --inspect

  # headless 운영 모드
  python -m src.main --headless
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# config / src.* import 를 위해 프로젝트 루트를 sys.path 에 추가
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config import DEFAULT_BROWSER, DEFAULT_CONDITION, BrowserConfig
from src.browser import launch_browser, polite_sleep
from src.excel_writer import write_company_workbook
from src.scrapers.base import BaseScraper
from src.scrapers.kb_insurance import KBInsuranceScraper

OUTPUT_DIR = ROOT / "output"
DEBUG_DIR = ROOT / "debug"

SCRAPERS = {
    "kb": KBInsuranceScraper,
}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--company", default="kb", choices=sorted(SCRAPERS.keys()))
    p.add_argument("--headless", action="store_true", help="headless 모드 (기본: headed)")
    p.add_argument("--inspect", action="store_true",
                   help="첫 상품의 계산기 페이지까지 열고 종료. 셀렉터 검증용.")
    p.add_argument("--limit", type=int, default=0,
                   help="처리할 상품 수 제한 (0=무제한)")
    p.add_argument("--delay", type=float, default=DEFAULT_BROWSER.delay_seconds)
    return p.parse_args()


def main() -> int:
    args = parse_args()
    cfg = BrowserConfig(headless=args.headless, delay_seconds=args.delay)
    scraper_cls = SCRAPERS[args.company]

    DEBUG_DIR.mkdir(exist_ok=True)
    OUTPUT_DIR.mkdir(exist_ok=True)

    with launch_browser(cfg) as (_browser, _ctx, page):
        scraper: BaseScraper = scraper_cls(page=page, debug_dir=DEBUG_DIR / scraper_cls.company)
        print(f"[{scraper.company}] 상품 목록 수집 시작…")
        products_meta = scraper.list_health_products()

        if args.inspect:
            if not products_meta:
                print("  · 상품 목록을 못 잡았습니다. debug/ 의 HTML 을 확인하세요.")
                return 1
            print(f"  · inspect: '{products_meta[0]['name']}' 계산기까지 진입")
            scraper._open_product(products_meta[0])        # noqa: SLF001
            scraper._open_calculator()                     # noqa: SLF001
            print(f"  · debug 산출물: {scraper.debug_dir}")
            return 0

        if args.limit:
            products_meta = products_meta[: args.limit]

        results = []
        for i, meta in enumerate(products_meta, 1):
            print(f"  [{i}/{len(products_meta)}] {meta['name']}")
            product = scraper.quote_product(meta, DEFAULT_CONDITION)
            results.append(product)
            polite_sleep(cfg)

    out = write_company_workbook(scraper.company, results, DEFAULT_CONDITION, OUTPUT_DIR)
    print(f"[OK] {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
