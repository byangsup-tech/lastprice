"""CLI 엔트리포인트.

  python -m src.main                  # 기본 조건으로 건강보험 후보 전체 수집
  python -m src.main --product 24950  # 특정 상품코드 1건
  python -m src.main --record         # 브라우저만 띄워 트래픽 HAR 캡처
  python -m src.main --inspect        # 계산기 진입까지만 하고 진단 덤프

웹 UI 로 쓰려면 `python app.py` (또는 패키징된 .exe).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config import BrowserConfig
from src.browser import launch_browser
from src.runner import DEBUG_DIR, run_collection
from src.scrapers.kb_insurance import CONDITION_PROFILES, KBInsuranceScraper


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--headless", action="store_true", help="headless 모드 (기본: headed)")
    p.add_argument("--inspect", action="store_true",
                   help="첫 상품의 계산기 페이지까지 열고 종료. 셀렉터/프레임 검증용.")
    p.add_argument("--record", action="store_true",
                   help="브라우저만 띄우고 사용자가 직접 계산. 트래픽을 HAR 로 캡처.")
    p.add_argument("--limit", type=int, default=0, help="처리할 상품 수 제한 (0=무제한)")
    p.add_argument("--product", default="",
                   help="특정 상품코드 1건만 처리 (예: --product 24950)")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    if args.record or args.inspect:
        return _dev_mode(args)

    res = run_collection(product_code=args.product, profiles=CONDITION_PROFILES,
                         headless=args.headless, limit=args.limit)
    if res["ok"]:
        print(f"[OK] {res['output_path']}")
        return 0
    print(f"[실패] {res['error']}")
    return 1


def _dev_mode(args: argparse.Namespace) -> int:
    """--record / --inspect — 개발·진단 전용 (HAR·trace·WebSquare 덤프)."""
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    cfg = BrowserConfig(headless=args.headless)
    with launch_browser(cfg, capture_dir=DEBUG_DIR) as (_browser, _ctx, page):
        if args.record:
            url = KBInsuranceScraper.base_url
            print(f"[record] {url}")
            print("  브라우저에서 직접: 상품 선택 → '보험료계산' → 조건입력 → 보험료산출")
            page.goto(url)
            input("  >> 계산을 끝낸 뒤 이 터미널에서 Enter: ")
            print(f"[record] 저장됨 → {DEBUG_DIR}  (kb.har, trace.zip)")
            return 0
        # --inspect
        scraper = KBInsuranceScraper(
            page=page, debug_dir=DEBUG_DIR / KBInsuranceScraper.company)
        metas = scraper.list_health_products(only_code=args.product or None)
        if not metas:
            print("  · 상품 목록을 못 잡았습니다. debug/ 의 HTML 을 확인하세요.")
            return 1
        print(f"  · inspect: '{metas[0]['name']}' 계산기까지 진입")
        try:
            scraper._open_calculator_from_list(metas[0])  # noqa: SLF001
        except Exception as e:  # noqa: BLE001
            print(f"  · 계산기 진입 중 예외(진단 덤프는 계속): {e}")
        scraper._dump_websquare_state()  # noqa: SLF001
        print(f"  · debug 산출물: {scraper.debug_dir}")
        return 0


if __name__ == "__main__":
    sys.exit(main())
