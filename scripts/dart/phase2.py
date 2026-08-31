# -*- coding: utf-8 -*-
"""Phase 2 — 사업보고서 원문 수집.

여기서는 '받기'만 한다. 파싱은 emit 이 raw/ 를 읽어 수행하므로, 파서를 고쳐도
쿼터를 다시 쓰지 않고 재조립할 수 있다.
"""
from __future__ import annotations

import config
import corpcode
import docparse
import emit
import phase1


def _annual(rows):
    out = [r for r in rows
           if "사업보고서" in docparse.normalize_for_match(r.get("report_nm", ""))
           and "정정" not in docparse.normalize_for_match(r.get("report_nm", ""))]
    out.sort(key=lambda r: r.get("rcept_dt", ""))
    return out


def _annual_years(rows):
    """사업보고서가 존재하는 사업연도 집합. 'XX. 사업보고서 (2024.12)' 표기를 우선 신뢰."""
    import re
    ys = set()
    for r in _annual(rows):
        nm = docparse.normalize_for_match(r.get("report_nm", ""))
        m = re.search(r"\((\d{4})\.", nm)
        ys.add(int(m.group(1)) if m else int((r.get("rcept_dt") or "0001")[:4]) - 1)
    return ys


def _audit_for_year(rows, year):
    """해당 사업연도의 감사보고서 1건 (연결감사보고서 우선). 없으면 None."""
    cands = [r for r in rows
             if str(year + 1) == (r.get("rcept_dt") or "")[:4]
             and "감사보고서" in docparse.normalize_for_match(r.get("report_nm", ""))
             and "정정" not in docparse.normalize_for_match(r.get("report_nm", ""))]
    for kw in config.AUDIT_REPORT_KEYWORDS:
        hit = [r for r in cands if kw in docparse.normalize_for_match(r.get("report_nm", ""))]
        if hit:
            hit.sort(key=lambda r: r.get("rcept_dt", ""))
            return hit[0]
    return None


def _match_any(report_nm, keywords):
    nm = docparse.normalize_for_match(report_nm)
    return any(k in nm for k in keywords)


def select_targets(out_dir, entries, base_years=None, verbose=True):
    """(rcept_no, label, 사유) 목록. 근거는 raw/list 에서 직접 읽는다."""
    by_code = {e["corp_code"]: e for e in entries}
    rows_by_label = {}
    for m in emit.scan_raw(out_dir, "list"):
        cc = (m.get("params") or {}).get("corp_code", "")
        e = by_code.get(cc)
        if not e:
            continue
        d = emit.load_json(m) or {}
        rows_by_label.setdefault(e["label"], []).extend(d.get("list") or [])

    base_years = base_years or config.DEFAULT_YEARS
    picks, warnings = {}, []
    for e in entries:
        label = e["label"]
        rows = rows_by_label.get(label, [])
        ann = _annual(rows)

        if ann:
            # 출범 시 계열사 구조 — 지주·선행법인은 첫 사업보고서가 핵심 산출이다.
            # 신한(2001)·KB(2008)·iM(2011)·구 우리금융(2001)은 정형 API 가 2015부터라
            # 이 원문이 출범 구조를 알 수 있는 유일한 경로다.
            if e["group"] in ("지주", "선행법인") or label in config.FIRST_REPORT_EXPECT:
                first = ann[0]
                picks.setdefault(first["rcept_no"], (label, "출범 직후 첫 사업보고서"))
                expect = config.FIRST_REPORT_EXPECT.get(label)
                got_year = int(first.get("rcept_dt", "0000")[:4] or 0)
                if expect and not (expect <= got_year <= expect + 2):
                    warnings.append(
                        "%s: 첫 사업보고서 접수 %s — 기대 사업연도 %s 와 어긋남(경고만, 강제 안 함)"
                        % (label, first.get("rcept_dt"), expect))
            picks.setdefault(ann[-1]["rcept_no"], (label, "최신 사업보고서(현재 계열사 구조)"))
        else:
            warnings.append("%s: 사업보고서 0건 — 감사보고서 원문으로 대체" % label)

        # 사업보고서가 없는 사업연도는 감사보고서 원문으로 메운다.
        have = _annual_years(rows)
        for y in base_years:
            if y in have:
                continue
            af, at = (e.get("active_from") or ""), (e.get("active_to") or "")
            if af and y < int(af[:4]):
                continue
            if at and y > int(at[:4]):
                continue
            aud = _audit_for_year(rows, y)
            if aud:
                picks.setdefault(aud["rcept_no"],
                                 (label, "FY%d 감사보고서(사업보고서 없음): %s"
                                  % (y, aud.get("report_nm", ""))))
            else:
                warnings.append("%s: FY%d 사업보고서·감사보고서 모두 없음" % (label, y))

        # 한화생명 → 한화손보 지분 취득 추적. 대량보유보고는 '피취득(발행) 법인' 코드로
        # 색인되므로 한화손보 쪽에서 찾는다.
        kws = config.STAKE_REPORT_KEYWORDS.get(label)
        if kws:
            for r in rows:
                dt = r.get("rcept_dt", "")
                if not ("2015" <= dt[:4] <= "2017"):
                    continue
                if _match_any(r.get("report_nm", ""), kws):
                    picks.setdefault(r["rcept_no"], (label, "지분취득 추적: %s" % r.get("report_nm", "")))

    if verbose:
        for w in warnings:
            print("    [경고] %s" % w)
    return picks, warnings


def run(client, out_dir, base_years=None, only=None, verbose=True):
    entries = corpcode.load_corp_codes(out_dir)
    if not entries:
        if client.dry_run:
            print("  (dry-run: corp_codes.csv 가 없어 원문 대상을 계획할 수 없습니다)")
            return {}
        raise SystemExit("corp_codes.csv 가 없습니다. 먼저 `run.py phase1` 을 실행하세요.")
    if only:
        keep = set(only)
        entries = [e for e in entries if e["label"] in keep]

    picks, _w = select_targets(out_dir, entries, base_years, verbose=verbose)
    if not picks:
        if client.dry_run:
            print("  (dry-run: 원문 대상은 phase1 의 공시목록에서 정해지므로 아직 계획할 수 없습니다)")
            return {}
        raise SystemExit("원문 대상이 없습니다. phase1 의 공시목록이 비어 있는지 확인하세요.")
    client.preflight(len(picks))
    if verbose:
        print("  원문 대상 %d건" % len(picks))
    ok = fail = 0
    for rcept, (label, why) in sorted(picks.items()):
        r = client.call("document", {"rcept_no": rcept}, phase="phase2", soft_transport=True)
        if r.status == "DRY":
            continue
        if r.status == "000":
            ok += 1
        else:
            fail += 1
        if verbose:
            print("    %-22s %s  %-28s %s"
                  % (label, rcept, why[:28], "OK" if r.status == "000" else r.status))
    if verbose:
        print("  Phase 2 수집 완료: 성공 %d / 실패 %d (파싱은 emit 에서 수행)" % (ok, fail))
    return picks
