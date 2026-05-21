from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class Rider:
    """특약."""
    name: str
    min_amount: Optional[int] = None       # 최저가입금액 (원)
    max_amount: Optional[int] = None       # 최고가입금액 (원)
    selected_amount: Optional[int] = None  # 실제 설계 시 입력한 금액 (원)
    pay_period: str = ""                   # 납기 (예: "20년")
    maturity: str = ""                     # 만기 (예: "100세")
    premium: Optional[int] = None          # 산출된 월 보험료 (원)
    note: str = ""


@dataclass
class Product:
    """상품."""
    company: str
    name: str
    code: Optional[str] = None
    main_coverage_amount: Optional[int] = None  # 주계약 가입금액
    main_premium: Optional[int] = None
    riders: list[Rider] = field(default_factory=list)
    total_premium: Optional[int] = None
    captured_at: datetime = field(default_factory=datetime.now)
    source_url: str = ""
    error: str = ""
