"""고정 조건값. 추후 다양화가 필요하면 yaml/CLI 인자로 확장."""

from dataclasses import dataclass


@dataclass(frozen=True)
class QuoteCondition:
    gender: str               # "M" / "F"
    age: int                  # 보험나이
    premium_waiver: bool      # 납입면제특약 여부
    insurance_period: str     # 예: "100세만기"
    payment_period: str       # 예: "20년납"


DEFAULT_CONDITION = QuoteCondition(
    gender="M",
    age=40,
    premium_waiver=True,
    insurance_period="100세만기",
    payment_period="20년납",
)


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
