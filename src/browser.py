from __future__ import annotations

import time
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Optional

from playwright.sync_api import Browser, BrowserContext, Page, sync_playwright

from config import BrowserConfig


@contextmanager
def launch_browser(
    cfg: BrowserConfig, capture_dir: Optional[Path] = None
) -> Iterator[tuple[Browser, BrowserContext, Page]]:
    """Playwright 브라우저 실행.

    capture_dir 가 주어지면 그 디렉터리에 네트워크 HAR(kb.har)과 Playwright
    trace(trace.zip)를 함께 기록한다.

    HAR 은 WebSquare Submission XHR 의 엔드포인트·요청 페이로드·응답을 그대로
    담는다. 현재 스크래퍼는 데이터셋을 직접 조작해 보험료를 산출하지만, 더
    견고하고 빠른 목표는 그 백엔드 호출을 httpx 로 직접 재현하는 것이다. HAR
    이 그 1차 근거가 된다. trace.zip 은 `playwright show-trace trace.zip` 로
    네트워크·DOM·이벤트를 오프라인 재생할 수 있다.
    """
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=cfg.headless, slow_mo=cfg.slow_mo_ms)
        ctx_kwargs = dict(
            user_agent=cfg.user_agent,
            viewport={"width": cfg.viewport_width, "height": cfg.viewport_height},
            locale="ko-KR",
        )
        if capture_dir is not None:
            capture_dir.mkdir(parents=True, exist_ok=True)
            ctx_kwargs["record_har_path"] = str(capture_dir / "kb.har")
            ctx_kwargs["record_har_mode"] = "full"
            ctx_kwargs["record_har_content"] = "embed"
        context = browser.new_context(**ctx_kwargs)
        context.set_default_timeout(cfg.timeout_ms)

        if capture_dir is not None:
            context.tracing.start(screenshots=True, snapshots=True, sources=True)

        page = context.new_page()
        try:
            yield browser, context, page
        finally:
            if capture_dir is not None:
                try:
                    context.tracing.stop(path=str(capture_dir / "trace.zip"))
                except Exception as e:
                    print(f"  [trace stop 실패] {e}")
            context.close()  # record_har 은 context.close() 시 파일로 flush 됨
            browser.close()


def polite_sleep(cfg: BrowserConfig) -> None:
    if cfg.delay_seconds > 0:
        time.sleep(cfg.delay_seconds)
