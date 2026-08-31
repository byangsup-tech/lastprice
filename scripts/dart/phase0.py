# -*- coding: utf-8 -*-
"""Phase 0 — 사전 탐침 3종. 결과를 PHASE0_REPORT.md 로 낸다.

요청서의 탐침 ① 설계를 한 군데 고쳤다: KB금융지주는 2008-09 설립이라 bsns_year=2008
의 013 은 'API 커버리지'가 아니라 '법인 존재' 사실이다. 그대로 하면 경계를 잘못 짚는다.
→ 신한지주(2001 설립)를 주 피험자로 쓰고 KB금융은 대조군으로 함께 찍는다.
"""
from __future__ import annotations

import os

import config
import corpcode
import docparse
import phase1
from client import ts_kst

PROBE_YEARS = [2008, 2012, 2015, 2016, 2017, 2018]
PROBE_ENDPOINTS = ["otrCprInvstmntSttus", "irdsSttus"]
PROBE_SUBJECTS = ["신한지주", "KB금융"]   # 주 피험자 / 대조군
CSM_KEYWORDS = ["보험계약부채", "계약서비스마진", "CSM", "재보험계약", "투자계약부채"]
CSM_PROBE = ("동양생명보험", 2024)


def _fmt(res):
    n = len(res.rows())
    return "%s(%d행)" % (res.status, n) if res.status == "000" else res.status


def run(client, out_dir, verbose=True):
    entries, unresolved, _ = corpcode.resolve(client, out_dir, verbose=verbose)
    if client.dry_run and not entries:
        entries, unresolved = corpcode.planning_entries(out_dir), []
    by_label = {e["label"]: e for e in entries}
    client.preflight(60)

    # 기업개황으로 정체성부터 확인 (설립일이 탐침 ① 해석의 전제다)
    for e in entries:
        r = client.call("company", {"corp_code": e["corp_code"]}, phase="phase0")
        if r.status == "000":
            corpcode.verify_identity(e, r)
    corpcode.write_corp_codes(out_dir, entries)

    # ── 탐침 ① 제공 시작연도 ──────────────────────────────────────────────
    probe1 = {}
    for label in PROBE_SUBJECTS:
        e = by_label.get(label)
        if not e:
            continue
        for ep in PROBE_ENDPOINTS:
            for y in PROBE_YEARS:
                r = client.call(ep, {"corp_code": e["corp_code"], "bsns_year": str(y),
                                     "reprt_code": config.REPRT_ANNUAL}, phase="phase0")
                probe1[(label, ep, y)] = r

    # ── 탐침 ② 비상장 보험사 공시 ─────────────────────────────────────────
    subs = [e for e in entries if e["group"] == "보험자회사"]
    probe2 = {}
    for e in subs:
        results, totals, truncated = phase1.fetch_list_all(client, e["corp_code"], "phase0")
        rows = phase1.collect_rows(results)
        kinds = {}
        for r in rows:
            nm = docparse.normalize_for_match(r.get("report_nm", ""))
            for key in ("사업보고서", "반기보고서", "분기보고서", "연결감사보고서",
                        "감사보고서", "증권신고서", "주요사항보고서"):
                if key in nm:
                    kinds[key] = kinds.get(key, 0) + 1
                    break
            else:
                kinds["기타"] = kinds.get("기타", 0) + 1
        annual = [r for r in rows if "사업보고서" in docparse.normalize_for_match(r.get("report_nm", ""))]
        annual.sort(key=lambda r: r.get("rcept_dt", ""))
        fs = client.call("fnlttSinglAcntAll",
                         {"corp_code": e["corp_code"], "bsns_year": "2024",
                          "reprt_code": config.REPRT_ANNUAL, "fs_div": "CFS"}, phase="phase0")
        probe2[e["label"]] = dict(
            total=len(rows), kinds=kinds, truncated=truncated, total_counts=sorted(totals),
            first=annual[0] if annual else None, last=annual[-1] if annual else None,
            fs_status=fs.status, fs_rows=len(fs.rows()), status_note=e["status_note"])

    # ── 탐침 ③ 주석·CSM 커버리지 ──────────────────────────────────────────
    label, year = CSM_PROBE
    e = by_label.get(label)
    probe3 = {"label": label, "year": year, "fs": {}, "xbrl": None, "doc": None, "hits": {}}
    if e:
        for fs_div in ("CFS", "OFS"):
            r = client.call("fnlttSinglAcntAll",
                            {"corp_code": e["corp_code"], "bsns_year": str(year),
                             "reprt_code": config.REPRT_ANNUAL, "fs_div": fs_div}, phase="phase0")
            hits = {}
            for row in r.rows():
                nm = str(row.get("account_nm") or "")
                for kw in CSM_KEYWORDS:
                    if kw in nm:
                        hits.setdefault(kw, set()).add("%s|%s" % (row.get("sj_div"), nm))
            probe3["fs"][fs_div] = dict(status=r.status, rows=len(r.rows()),
                                        hits={k: sorted(v) for k, v in hits.items()})
        # 해당 연도 사업보고서 rcept_no
        results, _t, _tr = phase1.fetch_list_all(client, e["corp_code"], "phase0")
        rows = phase1.collect_rows(results)
        cands = [r for r in rows
                 if "사업보고서" in docparse.normalize_for_match(r.get("report_nm", ""))
                 and r.get("rcept_dt", "").startswith(str(year + 1))]
        if cands:
            rcept = cands[0]["rcept_no"]
            probe3["rcept_no"] = rcept
            xr = client.call("fnlttXbrl", {"rcept_no": rcept, "reprt_code": config.REPRT_ANNUAL},
                             phase="phase0", soft_transport=True)
            probe3["xbrl"] = dict(status=xr.status, bytes=len(xr.body or b""))
            dr = client.call("document", {"rcept_no": rcept}, phase="phase0", soft_transport=True)
            if dr.status == "000":
                info = docparse.read_zip(dr.body, rcept)
                text = info.get("text") or ""
                probe3["doc"] = dict(status="000", member=info.get("member_selected"),
                                     encoding=info.get("encoding_used"),
                                     chars=len(text), truncated=info.get("truncated"))
                probe3["hits"] = {kw: text.count(kw) for kw in CSM_KEYWORDS}
            else:
                probe3["doc"] = dict(status=dr.status)

    if client.dry_run:
        if verbose:
            print("  (dry-run: PHASE0_REPORT.md 는 쓰지 않습니다 — 게이트를 우회시키지 않기 위해)")
        return None
    path = write_report(out_dir, entries, unresolved, probe1, probe2, probe3)
    if verbose:
        print("\n  Phase 0 완료 → %s\n" % path)
    return path


def write_report(out_dir, entries, unresolved, probe1, probe2, probe3):
    L = ["# DART Phase 0 사전 탐침 결과", "",
         "생성: %s (KST)" % ts_kst(), "",
         "> 이 보고서는 본 수집(Phase 1~3) 전에 확인해야 할 3가지에 대한 **실측** 결과다.", ""]

    # ① ----------------------------------------------------------------
    L += ["## ① 정기보고서 주요정보의 데이터 제공 시작연도", "",
          "요청서는 KB금융으로 찍으라고 했지만 **KB금융지주는 2008-09 설립**이라 "
          "`bsns_year=2008` 의 `013` 은 API 커버리지가 아니라 법인 존재 사실이다. "
          "그래서 **신한지주(2001 설립)를 주 피험자**로 하고 KB금융을 대조군으로 함께 찍었다.", ""]
    if probe1:
        header = "| 사업연도 | " + " | ".join(
            "%s / %s" % (lb, ep) for lb in PROBE_SUBJECTS for ep in PROBE_ENDPOINTS) + " |"
        L += [header, "|" + "---|" * (1 + len(PROBE_SUBJECTS) * len(PROBE_ENDPOINTS))]
        for y in PROBE_YEARS:
            cells = []
            for lb in PROBE_SUBJECTS:
                for ep in PROBE_ENDPOINTS:
                    r = probe1.get((lb, ep, y))
                    cells.append(_fmt(r) if r else "-")
            L.append("| %d | %s |" % (y, " | ".join(cells)))
        L.append("")
        firsts = []
        for lb in PROBE_SUBJECTS:
            for ep in PROBE_ENDPOINTS:
                ok = [y for y in PROBE_YEARS
                      if probe1.get((lb, ep, y)) and probe1[(lb, ep, y)].status == "000"]
                firsts.append("- **%s / %s**: 관측된 최초 `000` = **%s**"
                              % (lb, ep, min(ok) if ok else "없음"))
        L += ["**결론**", ""] + firsts
        L += ["", "> 문서상 표기는 \"2015년 이후 부터 정보제공\" 이다. 위 값은 *관측된* 최초 "
              "`000` 이며, 해당 연도에 그 법인이 그 항목을 공시하지 않았을 수도 있으므로 "
              "\"데이터가 YYYY년부터 제공된다\" 로 단정하지 않는다.", ""]

    # ② ----------------------------------------------------------------
    L += ["## ② 비상장 보험사의 정기보고서 제출 여부", "",
          "`list.json` 을 **공시유형 무필터**로 조회했다. `pblntf_ty=A` 로 거르면 "
          "감사보고서(F)가 보이지 않아 이 질문 자체에 답할 수 없기 때문이다. "
          "`corp_code` 를 주면 기간 제한이 없어 전 기간을 한 번에 받을 수 있다.", "",
          "| 법인 | 상태 | 총 공시 | 사업보고서 | 감사보고서 | 최초 사업보고서 | 최신 사업보고서 | 재무API(2024) |",
          "|---|---|---|---|---|---|---|---|"]
    for label, d in probe2.items():
        k = d["kinds"]
        aud = k.get("감사보고서", 0) + k.get("연결감사보고서", 0)
        first = "%s (%s)" % (d["first"]["rcept_dt"], d["first"]["rcept_no"]) if d["first"] else "**없음**"
        last = "%s (%s)" % (d["last"]["rcept_dt"], d["last"]["rcept_no"]) if d["last"] else "**없음**"
        L.append("| %s | %s | %d | %d | %d | %s | %s | %s (%d행) |"
                 % (label, d["status_note"], d["total"], k.get("사업보고서", 0), aud,
                    first, last, d["fs_status"], d["fs_rows"]))
    L += ["", "**결론**", ""]
    no_annual = [lb for lb, d in probe2.items() if not d["kinds"].get("사업보고서")]
    no_fs = [lb for lb, d in probe2.items() if d["fs_status"] != "000"]
    L += ["- 사업보고서가 **한 건도 없는** 법인: %s" % (", ".join(no_annual) if no_annual else "없음"),
          "- `fnlttSinglAcntAll`(2024) 이 `000` 이 **아닌** 법인: %s"
          % (", ".join(no_fs) if no_fs else "없음"),
          "- 위 두 목록에 있는 법인은 정형 재무 API 로는 커버되지 않으므로 원문/감사보고서 경로가 필요하다.", ""]
    trunc = [lb for lb, d in probe2.items() if d["truncated"] or len(d["total_counts"]) > 1]
    if trunc:
        L += ["- ⚠ 페이징 이상(상한 도달 또는 total_count 변동): %s" % ", ".join(trunc), ""]

    # ③ ----------------------------------------------------------------
    L += ["## ③ 주석 조회 API 의 보험계약부채·CSM 커버리지", "",
          "**사전 조사 결론: DART OpenAPI 에 주석(註釋) 조회 엔드포인트는 존재하지 않는다.** "
          "XBRL 주석은 API 가 아니라 웹 일괄다운로드(TSV)로만 제공되고"
          "(`opendart.fss.or.kr/disclosureinfo/fnltt/xbrlnote/main.do`), "
          "`fnlttXbrl.xml` 에는 본표만 들어 있다. 아래는 %s %d년으로 이를 실측 확인한 것이다."
          % (probe3["label"], probe3["year"]), ""]
    for fs_div, d in (probe3.get("fs") or {}).items():
        L.append("- `fnlttSinglAcntAll` **%s**: status=%s, %d행" % (fs_div, d["status"], d["rows"]))
        if d["hits"]:
            for kw, names in d["hits"].items():
                L.append("  - `%s` 매칭 %d건: %s" % (kw, len(names), ", ".join(names[:5])))
        else:
            L.append("  - 키워드 매칭 없음")
    if probe3.get("xbrl"):
        L.append("- `fnlttXbrl.xml`: status=%s (%d bytes)"
                 % (probe3["xbrl"]["status"], probe3["xbrl"]["bytes"]))
    if probe3.get("doc"):
        d = probe3["doc"]
        L.append("- 사업보고서 원문(`document.xml`): status=%s%s"
                 % (d["status"], ", %d자, 인코딩 %s" % (d.get("chars", 0), d.get("encoding"))
                    if d["status"] == "000" else ""))
    if probe3.get("hits"):
        L.append("- 원문 전문 키워드 출현 횟수: "
                 + ", ".join("`%s`=%d" % (k, v) for k, v in probe3["hits"].items()))
    csm_in_api = any("계약서비스마진" in d["hits"] or "CSM" in d["hits"]
                     for d in (probe3.get("fs") or {}).values())
    L += ["", "**결론**", "",
          "- 보험계약부채(재무상태표 집계 계정)는 정형 API 로 %s"
          % ("확인됨" if any("보험계약부채" in d["hits"] for d in (probe3.get("fs") or {}).values())
             else "확인되지 않음"),
          "- CSM(계약서비스마진)은 정형 API 에서 %s → **Phase 2 원문 파싱이 필요하다**"
          % ("확인됨(예상 밖)" if csm_in_api else "확인되지 않음(예상대로)"), ""]

    # 부록 ------------------------------------------------------------
    L += ["## 부록 A — corp_code 해석 결과", "",
          "| 법인 | corp_code | DART 상호 | 종목 | 해석근거 | 정체성검증 | 설립일 |",
          "|---|---|---|---|---|---|---|"]
    for e in entries:
        L.append("| %s | %s | %s | %s | %s | %s | %s |"
                 % (e["label"], e["corp_code"], e.get("corp_name_dart", ""),
                    e.get("stock_code") or "-", e.get("resolved_by", ""),
                    e.get("identity_check", ""), e.get("est_dt", "")))
    if unresolved:
        L += ["", "### 미해결 (사람 확인 필요)", ""]
        for t, reason, cands in unresolved:
            L.append("- **%s** — %s" % (t["label"], reason))
            for c in cands[:8]:
                L.append("  - `%s` %s (종목 %s, 수정 %s)"
                         % (c["corp_code"], c.get("corp_name", ""),
                            c.get("stock_code") or "-", c.get("modify_date", "")))
    L += ["", "## 다음 단계", "",
          "위 결과를 확인한 뒤 Phase 1~3 을 진행한다:", "",
          "```bash", "python3 scripts/dart/run.py phase1",
          "python3 scripts/dart/run.py phase2", "python3 scripts/dart/run.py emit", "```", ""]

    path = os.path.join(out_dir, "PHASE0_REPORT.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(L))
    return path
