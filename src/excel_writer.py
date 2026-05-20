from __future__ import annotations

from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from config import QuoteCondition
from src.models import Product

HEADER_FILL = PatternFill("solid", fgColor="305496")
HEADER_FONT = Font(bold=True, color="FFFFFF")
SUB_FILL = PatternFill("solid", fgColor="D9E1F2")
CENTER = Alignment(horizontal="center", vertical="center")


def write_company_workbook(
    company: str,
    products: list[Product],
    condition: QuoteCondition,
    output_dir: Path,
) -> Path:
    """회사당 하나의 xlsx — 상품별 시트."""
    output_dir.mkdir(parents=True, exist_ok=True)
    wb = Workbook()
    wb.remove(wb.active)

    if not products:
        ws = wb.create_sheet("EMPTY")
        ws["A1"] = f"{company}: no products captured"
    else:
        for product in products:
            sheet_name = _safe_sheet_name(product.name)
            ws = wb.create_sheet(sheet_name)
            _write_meta(ws, company, product, condition)
            _write_riders(ws, product)

    out_path = output_dir / f"{_safe_filename(company)}.xlsx"
    wb.save(out_path)
    return out_path


def _safe_sheet_name(name: str) -> str:
    bad = '[]:*?/\\'
    s = "".join("_" if c in bad else c for c in name)[:31]
    return s or "Sheet"


def _safe_filename(name: str) -> str:
    bad = '<>:"/\\|?*'
    return "".join("_" if c in bad else c for c in name).strip() or "company"


def _write_meta(ws, company: str, product: Product, cond: QuoteCondition) -> None:
    meta = [
        ("회사", company),
        ("상품명", product.name),
        ("상품코드", product.code or ""),
        ("성별", cond.gender),
        ("연령", cond.age),
        ("납입면제", "Y" if cond.premium_waiver else "N"),
        ("보험기간", cond.insurance_period),
        ("납입기간", cond.payment_period),
        ("주계약 가입금액", product.main_coverage_amount or ""),
        ("주계약 보험료", product.main_premium or ""),
        ("합계 보험료", product.total_premium or ""),
        ("수집일시", product.captured_at.strftime("%Y-%m-%d %H:%M:%S")),
        ("출처 URL", product.source_url),
    ]
    for row_idx, (k, v) in enumerate(meta, start=1):
        ws.cell(row=row_idx, column=1, value=k).font = Font(bold=True)
        ws.cell(row=row_idx, column=1).fill = SUB_FILL
        ws.cell(row=row_idx, column=2, value=v)
    if product.error:
        err_row = len(meta) + 1
        ws.cell(row=err_row, column=1, value="에러").font = Font(bold=True, color="C00000")
        ws.cell(row=err_row, column=2, value=product.error)


def _write_riders(ws, product: Product) -> None:
    start_row = 16
    headers = ["No", "특약명", "최저가입금액", "설계금액", "월보험료(원)", "비고"]
    for c, h in enumerate(headers, start=1):
        cell = ws.cell(row=start_row, column=c, value=h)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = CENTER

    for i, rider in enumerate(product.riders, start=1):
        r = start_row + i
        ws.cell(row=r, column=1, value=i).alignment = CENTER
        ws.cell(row=r, column=2, value=rider.name)
        ws.cell(row=r, column=3, value=rider.min_amount)
        ws.cell(row=r, column=4, value=rider.selected_amount)
        ws.cell(row=r, column=5, value=rider.premium)
        ws.cell(row=r, column=6, value=rider.note)

    widths = [5, 50, 16, 16, 16, 30]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
