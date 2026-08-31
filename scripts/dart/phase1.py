# -*- coding: utf-8 -*-
"""Phase 1 — 정형 데이터 수집."""
from __future__ import annotations

import config
import corpcode
import grid
from client import FatalDartError, today_kst

LIST_PAGE_COUNT = 100
LIST_MAX_PAGES = 60          # 넘으면 조용히 자르지 않고 시끄럽게 보고한다
LIST_BGN = "19990101"


def fetch_list_all(client, corp_code, phase, bgn=LIST_BGN, end=None):
    """공시목록 전체 페이지.

    corp_code 를 주면 기간 제한이 없으므로 유형 필터(pblntf_ty)를 아예 걸지 않는다.
    A 로 거르면 감사보고서(F)가 안 보여서 '감사보고서만 제출하는가' 라는 질문 자체에
    답할 수 없다. 전부 받아 로컬에서 분류하는 편이 더 싸고 무손실이다.
    last_reprt_at=N: 정정신고를 남긴다 — 정정 이력이 곧 추적성 자산이다.
    """
    end = end or today_kst()
    results, total_counts, page = [], set(), 1
    truncated = False
    while page <= LIST_MAX_PAGES:
        r = client.call("list", {"corp_code": corp_code, "bgn_de": bgn, "end_de": end,
                                 "last_reprt_at": "N", "page_no": str(page),
                                 "page_count": str(LIST_PAGE_COUNT)}, phase=phase)
        if r.status == "DRY":
            return [], set(), False
        results.append(r)
        if r.status != "000":
            break
        d = r.data or {}
        total_counts.add(str(d.get("total_count", "")))
        try:
            total_page = int(d.get("total_page") or 1)
        except (TypeError, ValueError):
            total_page = 1
        if page >= total_page:
            break
        page += 1
    else:
        truncated = True
    return results, total_counts, truncated


def collect_rows(results):
    rows = []
    for r in results:
        rows.extend(r.rows())
    return rows


def run(client, out_dir, years, half_years, only=None, endpoints=None, verbose=True):
    entries, unresolved, _ = corpcode.resolve(client, out_dir, verbose=verbose)
    if client.dry_run and not entries:
        entries, unresolved = corpcode.planning_entries(out_dir), []
    if unresolved:
        raise SystemExit(
            "corp_code 미해결 %d건 — 위 후보를 확인해 %s 에 적고 다시 실행하세요."
            % (len(unresolved), corpcode.OVERRIDES))
    if only:
        keep = set(only)
        entries = [e for e in entries if e["label"] in keep]
        if not entries:
            raise SystemExit("--only 로 남은 대상이 없습니다: %s" % ", ".join(sorted(keep)))

    plan = grid.phase1_grid(entries, years, half_years)
    planned = sum(1 for _e, ep, _p, _n in plan if ep != "_skip")
    if endpoints:
        planned = sum(1 for _e, ep, _p, _n in plan if ep in set(endpoints))
    client.preflight(planned + len(entries) * 3)
    if verbose:
        skipped = sum(1 for _e, ep, _p, _n in plan if ep == "_skip")
        print("  대상 %d 법인 / 예정 호출 %d건 (생존기간 밖 %d칸은 호출하지 않음)"
              % (len(entries), planned, skipped))

    # ── 기업개황 + 정체성 교차검증 ─────────────────────────────────────────
    problems = []
    for e in entries:
        r = client.call("company", {"corp_code": e["corp_code"]}, phase="phase1")
        if r.status == "DRY":
            continue
        if r.status == "000":
            probs = corpcode.verify_identity(e, r)
            if probs:
                problems.append((e["label"], e["corp_code"], probs))
        else:
            e["identity_check"] = "조회실패(%s)" % r.status
    corpcode.write_corp_codes(out_dir, entries)
    if problems:
        lines = ["", "  ✗ 정체성 검증 실패 — 다른 법인의 데이터를 수집할 위험이 있어 중단합니다.", ""]
        for label, cc, probs in problems:
            lines.append("    [%s] corp_code=%s" % (label, cc))
            lines += ["      - %s" % p for p in probs]
        lines += ["",
                  "  corp_codes.csv 를 확인하고, 필요하면 %s 로 corp_code 를 바로잡거나"
                  % corpcode.OVERRIDES,
                  "  config.py 의 expect_est_dt 를 실제 값으로 고치세요.", ""]
        raise SystemExit("\n".join(lines))

    # ── 공시목록 (유형 무필터, 전 기간) ───────────────────────────────────
    for e in entries:
        results, totals, truncated = fetch_list_all(client, e["corp_code"], "phase1")
        rows = collect_rows(results)
        if verbose:
            note = ""
            if len(totals) > 1:
                note = "  [경고] 조회 중 total_count 변동: %s" % sorted(totals)
            if truncated:
                note += "  [경고] %d페이지 상한 도달 — 일부 미수집" % LIST_MAX_PAGES
            expected = next(iter(totals)) if len(totals) == 1 else "?"
            if expected not in ("?", "") and str(len(rows)) != str(expected):
                note += "  [경고] 수집 %d ≠ total_count %s" % (len(rows), expected)
            print("    %-22s 공시 %4d건%s" % (e["label"], len(rows), note))

    # ── 재무제표 + 주요정보 7종 ───────────────────────────────────────────
    want = set(endpoints) if endpoints else None
    done = 0
    for e, ep, params, _note in plan:
        if ep in ("_skip", "company"):
            continue
        if want and ep not in want:
            continue
        client.call(ep, params, phase="phase1")
        done += 1
        if verbose and done % 50 == 0:
            print("    ... %d/%d" % (done, planned))
    if verbose:
        print("  Phase 1 호출 완료 (네트워크 %d건, 캐시 재사용 포함 총 %d건)"
              % (client.network_calls, done))
    return entries
