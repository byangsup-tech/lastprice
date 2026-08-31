# -*- coding: utf-8 -*-
"""corpCode.xml → corp_code 해석.

주의: CORPCODE.xml 에는 '현재 상호'만 있고 과거 사명이 전혀 없다. 그래서 상장사는
반드시 stock_code 로 매칭한다 (동명 법인이 실제로 존재한다 — 구/신 우리금융지주).
"""
from __future__ import annotations

import csv
import io
import os
import unicodedata
import xml.etree.ElementTree as ET
import zipfile

import config

OVERRIDES = "corp_code_overrides.csv"
CANDIDATES = "corp_codes_candidates.csv"


def norm(s: str) -> str:
    """매칭 전용 정규화. 출력에는 항상 원문을 쓴다."""
    if not s:
        return ""
    s = unicodedata.normalize("NFKC", s)
    for ch in "ㆍ·・‧":
        s = s.replace(ch, "")
    return "".join(s.split()).replace("(주)", "").replace("주식회사", "").upper()


def load_corp_index(client, phase="resolve"):
    """corpCode.xml 을 받아 [{corp_code, corp_name, stock_code, ...}] 로 돌려준다."""
    res = client.call("corpCode", {}, phase=phase)
    if res.status == "DRY":
        return [], res
    if res.status != "000":
        raise SystemExit("corpCode.xml 조회 실패: status=%s %s" % (res.status, res.message))

    zf = zipfile.ZipFile(io.BytesIO(res.body))
    names = zf.namelist()
    member = next((n for n in names if n.upper().endswith("CORPCODE.XML")), None) \
        or next((n for n in names if n.lower().endswith(".xml")), None)
    if member is None:
        raise SystemExit("corpCode ZIP 안에서 XML 멤버를 찾지 못했습니다: %s" % names)

    rows = []
    # 11~12만 엔트리 — iterparse + clear 로 메모리를 잡아두지 않는다
    with zf.open(member) as fh:
        for _, el in ET.iterparse(fh, events=("end",)):
            if el.tag != "list":
                continue
            rec = {}
            for child in el:
                rec[child.tag] = (child.text or "").strip()  # 비상장 stock_code 는 공백 6칸
            code = rec.get("corp_code", "")
            if len(code) == 8 and code.isdigit():
                rows.append(rec)
            el.clear()
    return rows, res


def _read_overrides(out_dir):
    p = os.path.join(out_dir, OVERRIDES)
    if not os.path.exists(p):
        return {}
    with open(p, encoding="utf-8-sig") as f:
        return {r["label"].strip(): r["corp_code"].strip()
                for r in csv.DictReader(f)
                if r.get("label") and r.get("corp_code")}


def resolve(client, out_dir, verbose=True):
    """17 법인을 전부 해석한다. 모호한 건은 모아서 한 번에 보고한다 (첫 건에서 죽지 않는다)."""
    rows, res = load_corp_index(client, phase="resolve")
    if not rows:
        return [], [], res

    by_stock, by_name = {}, {}
    for r in rows:
        sc = r.get("stock_code", "")
        if sc:
            by_stock.setdefault(sc, []).append(r)
        by_name.setdefault(norm(r.get("corp_name", "")), []).append(r)

    overrides = _read_overrides(out_dir)
    by_code = {r["corp_code"]: r for r in rows}
    resolved, unresolved, claimed = [], [], set()

    # 1차: override·종목코드 — 확정적인 것부터 잡아 claimed 에 넣는다
    pending = []
    for t in config.TARGETS:
        label = t["label"]
        if label in overrides:
            code = overrides[label]
            rec = by_code.get(code)
            if not rec:
                unresolved.append((t, "override 한 corp_code 가 CORPCODE.xml 에 없음: %s" % code, []))
                continue
            resolved.append(_mk(t, rec, "human_override", res))
            claimed.add(code)
            continue
        sc = t.get("stock_code")
        cands = by_stock.get(sc or "", [])
        if sc and len(cands) == 1:
            resolved.append(_mk(t, cands[0], "stock_code", res))
            claimed.add(cands[0]["corp_code"])
        else:
            pending.append(t)

    # 2차: 상호 정확일치. 이미 선점된 corp_code 는 제외 → 구 우리금융지주가 여기서 갈린다.
    for t in pending:
        cands, method = [], ""
        for i, alias in enumerate([t["label"]] + t["aliases"]):
            hit = [r for r in by_name.get(norm(alias), []) if r["corp_code"] not in claimed]
            if hit:
                cands = hit
                method = "corp_name_exact" if i == 0 else "alias:%s" % alias
                break
        if len(cands) == 1:
            if t.get("stock_code"):
                method += "+상장예상이나 종목코드 미일치(상장폐지 가능)"
            resolved.append(_mk(t, cands[0], method, res))
            claimed.add(cands[0]["corp_code"])
        else:
            probe = [norm(a) for a in [t["label"]] + t["aliases"] if norm(a)]
            near = [r for r in rows
                    if any(p in norm(r.get("corp_name", "")) or norm(r.get("corp_name", "")) in p
                           for p in probe)]
            reason = ("동일 상호 후보 %d건 — 사람 확인 필요" % len(cands)) if cands else "상호 일치 없음"
            unresolved.append((t, reason, (cands or near)[:40]))

    if unresolved:
        _write_candidates(out_dir, unresolved)
        _ensure_override_template(out_dir, unresolved)
        if verbose:
            print("\n  corp_code 미해결 %d건 — 확인이 필요합니다.\n" % len(unresolved))
            for t, reason, cands in unresolved:
                print("  [%s] %s" % (t["label"], reason))
                if t.get("note"):
                    print("      메모: %s" % t["note"])
                for c in cands[:12]:
                    print("      %s  %-28s 종목:%-8s 수정일:%s"
                          % (c["corp_code"], c.get("corp_name", "")[:28],
                             c.get("stock_code") or "-", c.get("modify_date", "")))
                print()
            print("  후보 전체: %s" % os.path.join(out_dir, CANDIDATES))
            print("  확정되면 %s 에 label,corp_code 를 적고 다시 실행하세요.\n"
                  % os.path.join(out_dir, OVERRIDES))
    return resolved, unresolved, res


def _mk(t, rec, method, res):
    e = dict(
        label=t["label"], corp_code=rec["corp_code"],
        corp_name_dart=rec.get("corp_name", ""),
        corp_eng_name_dart=rec.get("corp_eng_name", ""),
        stock_code=rec.get("stock_code", ""),
        entity_type=t["entity_type"], group=t["group"],
        status_note=t["status_note"], active_from=t["active_from"] or "",
        active_to=t["active_to"] or "", resolved_by=method,
        identity_verified_by="", identity_check="미검증",
        est_dt="", jurir_no="", acc_mt="", corp_cls="",
        modify_date=rec.get("modify_date", ""),
        tried_aliases="|".join([t["label"]] + t["aliases"]),
        corp_code_hint=t.get("corp_code_hint") or "",
        expect_est_dt=t.get("expect_est_dt") or "",
        note=t.get("note", ""), value_source="api+config",
        corpcode_fetched_at=res.fetched_at)
    e.update(res.provenance())
    return e


def _write_candidates(out_dir, unresolved):
    p = os.path.join(out_dir, CANDIDATES)
    with open(p, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["label", "reason", "corp_code", "corp_name", "corp_eng_name",
                    "stock_code", "modify_date", "note"])
        for t, reason, cands in unresolved:
            if not cands:
                w.writerow([t["label"], reason, "", "", "", "", "", t.get("note", "")])
            for c in cands:
                w.writerow([t["label"], reason, c["corp_code"], c.get("corp_name", ""),
                            c.get("corp_eng_name", ""), c.get("stock_code", ""),
                            c.get("modify_date", ""), t.get("note", "")])


def _ensure_override_template(out_dir, unresolved):
    p = os.path.join(out_dir, OVERRIDES)
    if os.path.exists(p):
        return
    with open(p, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["label", "corp_code", "note"])
        for t, _r, _c in unresolved:
            w.writerow([t["label"], "", "확인한 8자리 corp_code 를 여기에 적으세요"])


def verify_identity(entry, company_result):
    """company.json 으로 '정말 그 법인인가'를 교차검증한다.

    사람이 손으로 적은 8자리가 다른 회사의 재무 이력 전체를 완벽한 출처와 함께
    끌어오는 사고를 막는 유일한 장치다.
    """
    data = company_result.data or {}
    est = str(data.get("est_dt") or "")
    checks, problems = [], []
    expect = entry.get("expect_est_dt")
    if expect:
        if est == expect:
            checks.append("est_dt=%s" % est)
        else:
            problems.append("설립일 불일치: 기대 %s ≠ DART %s" % (expect, est or "(없음)"))
    sc = entry.get("stock_code")
    if sc:
        got = str(data.get("stock_code") or "").strip()
        if got == sc:
            checks.append("stock_code=%s" % sc)
        elif got:
            problems.append("종목코드 불일치: 기대 %s ≠ DART %s" % (sc, got))
    hint = entry.get("corp_code_hint")
    if hint and hint != entry["corp_code"]:
        checks.append("corp_code_hint(미검증 출처) 불일치: %s" % hint)
    if data.get("jurir_no"):
        checks.append("jurir_no=%s" % data["jurir_no"])
    entry["identity_verified_by"] = "; ".join(checks)
    entry["identity_check"] = "불일치" if problems else ("검증됨" if checks else "확인항목없음")
    entry["est_dt"] = est
    entry["jurir_no"] = str(data.get("jurir_no") or "")
    entry["acc_mt"] = str(data.get("acc_mt") or "")
    entry["corp_cls"] = str(data.get("corp_cls") or "")
    return problems


CORP_CODE_COLS = [
    "label", "corp_code", "corp_name_dart", "corp_eng_name_dart", "stock_code",
    "entity_type", "group", "status_note", "active_from", "active_to",
    "est_dt", "jurir_no", "acc_mt", "corp_cls",
    "resolved_by", "identity_check", "identity_verified_by", "modify_date",
    "tried_aliases", "corp_code_hint", "expect_est_dt", "note", "value_source",
    "corpcode_fetched_at", "source_endpoint", "source_params", "rcept_no",
    "rcept_no_source", "fetched_at", "status", "call_id", "raw_path", "raw_sha256",
    "cached", "cache_age_days"]


def write_corp_codes(out_dir, entries):
    if not entries:
        return None
    p = os.path.join(out_dir, "corp_codes.csv")
    with open(p, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CORP_CODE_COLS, extrasaction="ignore")
        w.writeheader()
        for e in entries:
            w.writerow(e)
    return p


def planning_entries(out_dir):
    """--dry-run 전용. 아직 해석 전이라도 호출 매트릭스를 눈으로 검수할 수 있게
    자리표시자 corp_code 로 대상 목록을 만든다. 실제 수집에는 쓰이지 않는다."""
    existing = load_corp_codes(out_dir)
    if existing:
        return existing
    out = []
    for i, t in enumerate(config.TARGETS, 1):
        out.append(dict(label=t["label"], corp_code="<미해석%02d>" % i,
                        corp_name_dart=t["label"], stock_code=t.get("stock_code") or "",
                        entity_type=t["entity_type"], group=t["group"],
                        status_note=t["status_note"], active_from=t["active_from"] or "",
                        active_to=t["active_to"] or "", acc_mt="",
                        resolved_by="dry-run 자리표시자", identity_check="미검증"))
    return out


def load_corp_codes(out_dir):
    """emit 이 네트워크 없이 읽는 경로."""
    p = os.path.join(out_dir, "corp_codes.csv")
    if not os.path.exists(p):
        return []
    with open(p, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))
