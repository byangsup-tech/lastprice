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
    # 산출 조건 (long-format 엑셀 컬럼)
    cond_sex: str = ""               # 성별 "남"/"여"
    cond_age: str = ""               # 연령 "40"
    cond_occupation: str = ""        # 직업
    cond_driving: str = ""           # 운전형태
    cond_underwriting: str = ""      # 심사고지유형
    cond_waiver: str = ""            # 납입면제
    cond_plan: str = ""              # 플랜
    cond_insurance_period: str = ""  # 보험기간(만기) "100세"
    cond_payment_period: str = ""    # 납입기간(납기) "20년"
