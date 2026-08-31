# -*- coding: utf-8 -*-
"""'무엇을 호출해야 했는가' 를 한 곳에서 정의한다.

phase1 은 이걸로 수집하고, emit 은 같은 걸로 '무엇이 비었는가'를 판정한다.
두 쪽이 같은 정의를 쓰기 때문에 미확보목록이 실제 공백을 빠짐없이 설명할 수 있다.
"""
from __future__ import annotations

import config

API_FIRST_YEAR = config.DOCUMENTED_FIRST_YEAR   # 2015 — Phase 0 에서 실측 확인됨


def _year_in_window(entry, year):
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
            return True, "소멸(%s) 연도 — 미제출 가능" % at
    return True, ""


def years_for(entry, base_years):
    """법인별 사업연도. 지주는 출범 구조 파악을 위해 API 최저연도까지 백필한다."""
    ys = set(base_years)
    # 지주: 출범 시 계열사 구조 파악용 백필.
    # 선행법인: 존재 자체가 '통합 전' 비교용이라 소멸 이전 구간이 없으면 의미가 없다
    #   (오렌지라이프는 2021-07 소멸이라 2021~ 만 보면 통째로 빈다).
    if entry.get("group") in ("지주", "선행법인"):
        ys |= set(config.HOLDING_BACKFILL_YEARS)
    t = config.TARGETS_BY_LABEL.get(entry.get("label"), {})
    ys |= set(t.get("extra_years") or [])
    # API 가 닿지 않는 연도는 계획에 넣지 않는다 (호출해봐야 전부 013).
    return sorted(y for y in ys if y >= API_FIRST_YEAR)


def periods_for(entry, base_years, half_years):
    """[(bsns_year, reprt_code, skip_note)] — 법인별 실제 조회 대상 기간."""
    out = []
    for y in years_for(entry, base_years):
        ok, note = _year_in_window(entry, y)
        out.append((y, config.REPRT_ANNUAL, note if ok else "SKIP:%s" % note))
    for y in half_years:
        if y < API_FIRST_YEAR:
            continue
        ok, note = _year_in_window(entry, y)
        out.append((y, config.REPRT_HALF, note if ok else "SKIP:%s" % note))
    return out


def phase1_grid(entries, years, half_years):
    """[(entry, endpoint, params, note)] — 실제로 시도할 호출 목록."""
    plan = []
    for e in entries:
        cc = e["corp_code"]
        plan.append((e, "company", {"corp_code": cc}, ""))
        for year, reprt, note in periods_for(e, years, half_years):
            if note.startswith("SKIP:"):
                plan.append((e, "_skip", {"bsns_year": str(year), "reprt_code": reprt},
                             note[5:]))
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
    """emit 이 공백을 판정할 때 쓰는 (label, endpoint, corp_code, year, reprt, fs) 집합."""
    cells = {}
    for e in entries:
        cc = e["corp_code"]
        cells[(e["label"], "company", cc, "", "", "")] = ""
        for year, reprt, note in periods_for(e, years, half_years):
            reason = ("not_applicable_entity_window:%s" % note[5:]) if note.startswith("SKIP:") else ""
            for ep in config.REPORT_ENDPOINTS:
                cells[(e["label"], ep, cc, str(year), reprt, "")] = reason
            for fs in ("CFS", "OFS"):
                cells[(e["label"], "fnlttSinglAcntAll", cc, str(year), reprt, fs)] = reason
    return cells
