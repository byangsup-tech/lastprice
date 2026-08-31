# -*- coding: utf-8 -*-
"""'무엇을 호출해야 했는가' 를 한 곳에서 정의한다.

phase1 은 이걸로 수집하고, emit 은 같은 걸로 '무엇이 비었는가'를 판정한다.
두 쪽이 같은 정의를 쓰기 때문에 미확보목록이 실제 공백을 빠짐없이 설명할 수 있다.
"""
from __future__ import annotations

import config


def _year_in_window(entry, year, reprt_code):
    """법인 생존기간 밖이면 '누락'이 아니라 '해당없음'이다.

    캐롯손해보험은 2025-10-01 소멸이라 FY2025 사업보고서가 애초에 존재하지 않는다.
    """
    af, at = (entry.get("active_from") or ""), (entry.get("active_to") or "")
    if af and year < int(af[:4]):
        return False, "설립(%s) 이전" % af
    if at:
        end_year = int(at[:4])
        if year > end_year:
            return False, "소멸(%s) 이후" % at
        if year == end_year:
            # 소멸 연도의 사업보고서는 통상 제출되지 않는다. 호출은 하되 013 을 정상으로 본다.
            return True, "소멸(%s) 연도 — 미제출 가능" % at
    return True, ""


def phase1_grid(entries, years, half_years):
    """[(entry, endpoint, params, note)] — 실제로 시도할 호출 목록."""
    plan = []
    for e in entries:
        cc = e["corp_code"]
        plan.append((e, "company", {"corp_code": cc}, ""))

        periods = [(y, config.REPRT_ANNUAL) for y in years] + \
                  [(y, config.REPRT_HALF) for y in half_years]
        for year, reprt in periods:
            ok, note = _year_in_window(e, year, reprt)
            if not ok:
                plan.append((e, "_skip", {"bsns_year": str(year), "reprt_code": reprt}, note))
                continue
            for ep in config.REPORT_ENDPOINTS:
                plan.append((e, ep, {"corp_code": cc, "bsns_year": str(year),
                                     "reprt_code": reprt}, note))
            for fs in ("CFS", "OFS"):
                plan.append((e, "fnlttSinglAcntAll",
                             {"corp_code": cc, "bsns_year": str(year),
                              "reprt_code": reprt, "fs_div": fs}, note))
    return plan


def expected_cells(entries, years, half_years):
    """emit 이 공백을 판정할 때 쓰는 (label, corp_code, endpoint, params, skip_reason) 집합."""
    cells = {}
    for e in entries:
        cc = e["corp_code"]
        cells[(e["label"], "company", cc, "", "", "")] = ""
        for year, reprt in [(y, config.REPRT_ANNUAL) for y in years] + \
                           [(y, config.REPRT_HALF) for y in half_years]:
            ok, note = _year_in_window(e, year, reprt)
            reason = "" if ok else "not_applicable_entity_window:%s" % note
            for ep in config.REPORT_ENDPOINTS:
                cells[(e["label"], ep, cc, str(year), reprt, "")] = reason
            for fs in ("CFS", "OFS"):
                cells[(e["label"], "fnlttSinglAcntAll", cc, str(year), reprt, fs)] = reason
    return cells
