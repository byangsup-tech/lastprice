"""엔트리포인트.

사용 예:
  # 정상 수집 (headed 모드 권장)
  python -m src.main

  # 트래픽 캡처 모드: 브라우저만 띄우고, 사용자가 손으로 1회 계산하는 동안
  # 모든 네트워크(HAR)·trace 를 debug/ 에 기록 — Submission XHR 분석용
  python -m src.main --record

  # 셀렉터/프레임 검증 inspection 모드: 계산기까지 열고 debug/ 에 덤프 후 종료
  python -m src.main --inspect

  # headless 운영 모드
  python -m src.main --headless

모든 실행은 debug/ 에 kb.har + trace.zip 을 남긴다.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# config / src.* import 를 위해 프로젝트 루트를 sys.path 에 추가
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config import DEFAULT_BROWSER, BrowserConfig
from src.browser import launch_browser, polite_sleep
from src.excel_writer import write_long_workbook
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
                   help="첫 상품의 계산기 페이지까지 열고 종료. 셀렉터/프레임 검증용.")
    p.add_argument("--record", action="store_true",
                   help="브라우저만 띄우고 사용자가 직접 계산. 트래픽을 HAR 로 캡처.")
    p.add_argument("--limit", type=int, default=0,
                   help="처리할 상품 수 제한 (0=무제한)")
    p.add_argument("--product", default="",
                   help="특정 상품코드 1건만 처리 (예: --product 24950). 키워드 필터 무시.")
    p.add_argument("--delay", type=float, default=DEFAULT_BROWSER.delay_seconds)
    return p.parse_args()


def main() -> int:
    args = parse_args()
    cfg = BrowserConfig(headless=args.headless, delay_seconds=args.delay)
    scraper_cls = SCRAPERS[args.company]

    DEBUG_DIR.mkdir(exist_ok=True)
    OUTPUT_DIR.mkdir(exist_ok=True)

    with launch_browser(cfg, capture_dir=DEBUG_DIR) as (_browser, _ctx, page):
        if args.record:
            url = scraper_cls.base_url
            print(f"[record] {url}")
            print("  브라우저에서 직접: 상품 선택 → '보험료계산' → 조건입력 → 보험료산출")
            print("  까지 정상 사용자처럼 1회 진행하세요. (모든 트래픽이 HAR 로 기록됨)")
            page.goto(url)
            input("  >> 계산을 끝낸 뒤 이 터미널에서 Enter: ")
            print(f"[record] 저장됨 → {DEBUG_DIR}  (kb.har, trace.zip)")
            return 0

        scraper: BaseScraper = scraper_cls(page=page, debug_dir=DEBUG_DIR / scraper_cls.company)
        print(f"[{scraper.company}] 상품 목록 수집 시작…")
        products_meta = scraper.list_health_products(only_code=args.product or None)

        if args.inspect:
            if not products_meta:
                print("  · 상품 목록을 못 잡았습니다. debug/ 의 HTML 을 확인하세요.")
                return 1
            print(f"  · inspect: '{products_meta[0]['name']}' 계산기까지 진입")
            try:
                scraper._open_calculator_from_list(products_meta[0])  # noqa: SLF001
            except Exception as e:
                print(f"  · 계산기 진입 중 예외(진단 덤프는 계속): {e}")
            scraper._dump_websquare_state()  # noqa: SLF001
            print(f"  · debug 산출물: {scraper.debug_dir}")
            return 0

        if args.limit:
            products_meta = products_meta[: args.limit]

        results = []
        for i, meta in enumerate(products_meta, 1):
            print(f"  [{i}/{len(products_meta)}] {meta['name']}")
            results.extend(scraper.quote_product_profiles(meta))
            polite_sleep(cfg)

    out = write_long_workbook(scraper.company, results, OUTPUT_DIR)
    print(f"[OK] {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
