from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path

from playwright.sync_api import Page

from config import QuoteCondition
from src.models import Product


class BaseScraper(ABC):
    company: str = "UNKNOWN"
    base_url: str = ""

    def __init__(self, page: Page, debug_dir: Path) -> None:
        self.page = page
        self.debug_dir = debug_dir
        self.debug_dir.mkdir(parents=True, exist_ok=True)

    @abstractmethod
    def list_health_products(self) -> list[dict]:
        """건강보험(암/CI/뇌·심) 상품 목록 — [{'name': str, 'code': str, 'url': str}, ...]"""

    @abstractmethod
    def quote_product(self, product_meta: dict, condition: QuoteCondition) -> Product:
        """단일 상품에 대해 조건 입력 → 모든 특약을 최저가입금액으로 설계 → 보험료 계산 → 결과 반환."""

    def snap(self, label: str) -> None:
        """디버그용 스크린샷 + HTML 덤프."""
        from datetime import datetime
        stamp = datetime.now().strftime("%H%M%S")
        safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in label)[:60]
        png = self.debug_dir / f"{stamp}_{safe}.png"
        html = self.debug_dir / f"{stamp}_{safe}.html"
        try:
            self.page.screenshot(path=str(png), full_page=True)
            html.write_text(self.page.content(), encoding="utf-8")
        except Exception as e:
            print(f"  [snap fail] {label}: {e}")
