"""브라우저 설정. 산출 조건은 src/scrapers/kb_insurance.py 의
CONDITION / CONDITION_PROFILES 를 편집한다."""

from dataclasses import dataclass


@dataclass(frozen=True)
class BrowserConfig:
    headless: bool = False
    delay_seconds: float = 2.5
    slow_mo_ms: int = 0
    user_agent: str = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
    viewport_width: int = 1440
    viewport_height: int = 900
    timeout_ms: int = 30_000


DEFAULT_BROWSER = BrowserConfig()
