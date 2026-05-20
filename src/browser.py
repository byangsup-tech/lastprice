from __future__ import annotations

import time
from contextlib import contextmanager
from typing import Iterator

from playwright.sync_api import Browser, BrowserContext, Page, sync_playwright

from config import BrowserConfig


@contextmanager
def launch_browser(cfg: BrowserConfig) -> Iterator[tuple[Browser, BrowserContext, Page]]:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=cfg.headless, slow_mo=cfg.slow_mo_ms)
        context = browser.new_context(
            user_agent=cfg.user_agent,
            viewport={"width": cfg.viewport_width, "height": cfg.viewport_height},
            locale="ko-KR",
        )
        context.set_default_timeout(cfg.timeout_ms)
        page = context.new_page()
        try:
            yield browser, context, page
        finally:
            context.close()
            browser.close()


def polite_sleep(cfg: BrowserConfig) -> None:
    if cfg.delay_seconds > 0:
        time.sleep(cfg.delay_seconds)
