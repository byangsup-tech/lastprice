# -*- coding: utf-8 -*-
"""오프라인 셀프테스트 — 네트워크도 API 키도 없이 collect→emit 전 구간을 검증한다."""
from __future__ import annotations

import csv
import glob
import json
import os
import shutil
import sys

import client as C
import config
import corpcode
import emit
import fixtures
import phase0
import phase1
import phase2

FAKE_KEY = "FAKEKEY_0123456789abcdef0123456789abcdef0000"
PASS, FAIL = [], []


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print("    %s %s%s" % ("✓" if cond else "✗", name, ("  — " + detail) if detail and not cond else ""))
    return cond


def read_csv(path):
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def mkclient(out, transport=None, **kw):
    kw.setdefault("delay", 0.0)
    return C.DartClient(out, transport=transport, require_key=False, **kw)


# ── 전송 계층 단위 테스트 ─────────────────────────────────────────────────
def transport_cases(out_root):
    print("\n  [1] 전송·상태 처리")
    out = os.path.join(out_root, "t_transport")
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out)

    def body(b):
        return lambda url, timeout: (200, b if isinstance(b, bytes) else b.encode(), {})

    # 013 은 정상 응답이다 — 재시도하지 않고 캐시한다
    calls = {"n": 0}

    def t013(url, timeout):
        calls["n"] += 1
        return 200, b'{"status":"013","message":"\xec\xa1\xb0\xed\x9a\x8c\xeb\x90\x9c \xeb\x8d\xb0\xec\x9d\xb4\xed\x83\x80\xea\xb0\x80 \xec\x97\x86\xec\x8a\xb5\xeb\x8b\x88\xeb\x8b\xa4."}', {}
    c = mkclient(out, t013)
    r = c.call("empSttus", {"corp_code": "00100001", "bsns_year": "2021", "reprt_code": "11011"})
    check("013 은 재시도하지 않는다", calls["n"] == 1, "호출 %d회" % calls["n"])
    check("013 은 캐시된다", os.path.exists(os.path.join(out, "raw/empSttus/00100001_2021_11011.json")))
    c2 = mkclient(out, t013)
    r2 = c2.call("empSttus", {"corp_code": "00100001", "bsns_year": "2021", "reprt_code": "11011"})
    check("013 재실행은 캐시 적중", r2.cached and calls["n"] == 1)
    check("캐시 적중 시 최초 조회시각 유지", r2.fetched_at == r.fetched_at)

    # 020 은 캐시되면 안 된다 — 한 번의 한도 초과가 '데이터 없음' 수천 건이 되는 걸 막는다
    out2 = os.path.join(out_root, "t_020")
    shutil.rmtree(out2, ignore_errors=True); os.makedirs(out2)
    c = mkclient(out2, body('{"status":"020","message":"요청 제한을 초과하였습니다."}'))
    try:
        c.call("empSttus", {"corp_code": "00100001", "bsns_year": "2021", "reprt_code": "11011"})
        ok = False
    except C.FatalDartError as e:
        ok = e.status == "020"
    check("020 은 즉시 중단", ok)
    check("020 은 캐시 경로에 쓰이지 않는다",
          not os.path.exists(os.path.join(out2, "raw/empSttus/00100001_2021_11011.json")))
    check("020 원본은 _transient 에 감사용으로 남는다",
          bool(glob.glob(os.path.join(out2, "raw/_transient/empSttus/*"))))
    check("RUN_ABORTED.txt 로 재개 방법을 남긴다",
          os.path.exists(os.path.join(out2, "RUN_ABORTED.txt")))

    # .json 인데 HTML/잘린 JSON
    for nm, payload in (("WAF HTML", "<html><body>blocked</body></html>"),
                        ("잘린 JSON", '{"status":"000","list":[{"a"')):
        o = os.path.join(out_root, "t_" + nm.split()[0])
        shutil.rmtree(o, ignore_errors=True); os.makedirs(o)
        c = mkclient(o, body(payload))
        try:
            c.call("empSttus", {"corp_code": "1", "bsns_year": "2021", "reprt_code": "11011"})
            ok = False
        except C.FatalDartError:
            ok = True
        check("%s 는 파싱하지 않고 중단" % nm, ok)

    # ZIP 자리에 XML 오류 본문
    o = os.path.join(out_root, "t_zipxml")
    shutil.rmtree(o, ignore_errors=True); os.makedirs(o)
    c = mkclient(o, body('<?xml version="1.0"?><result><status>014</status>'
                         '<message>파일이 존재하지 않습니다.</message></result>'))
    r = c.call("document", {"rcept_no": "20200101000001"})
    check("ZIP 자리의 XML 오류 본문에서 status 를 읽는다", r.status == "014", r.status)

    # status 000 인데 list 키가 없는 응답
    o = os.path.join(out_root, "t_nolist")
    shutil.rmtree(o, ignore_errors=True); os.makedirs(o)
    c = mkclient(o, body('{"status":"000","message":"정상"}'))
    r = c.call("empSttus", {"corp_code": "1", "bsns_year": "2021", "reprt_code": "11011"})
    check("000 + list 키 없음을 이상으로 기록", r.anomaly == "empty_list_on_000", r.anomaly)

    # sha256 불일치 → 격리 후 재조회
    o = os.path.join(out_root, "t_corrupt")
    shutil.rmtree(o, ignore_errors=True); os.makedirs(o)
    c = mkclient(o, body('{"status":"000","message":"정상","list":[{"a":"1"}]}'))
    c.call("empSttus", {"corp_code": "1", "bsns_year": "2021", "reprt_code": "11011"})
    p = os.path.join(o, "raw/empSttus/1_2021_11011.json")
    with open(p, "wb") as f:
        f.write(b'{"status":"000","message":"tampered","list":[]}')
    c2 = mkclient(o, body('{"status":"000","message":"정상","list":[{"a":"1"}]}'))
    r = c2.call("empSttus", {"corp_code": "1", "bsns_year": "2021", "reprt_code": "11011"})
    check("변조된 캐시는 격리하고 재조회", (not r.cached) and len(r.rows()) == 1)
    check("격리본은 삭제하지 않고 보관",
          bool(glob.glob(os.path.join(o, "raw/_quarantine/empSttus/*.corrupt"))))

    # 사이드카 없는 반쪽 파일은 캐시 미스
    o = os.path.join(out_root, "t_partial")
    shutil.rmtree(o, ignore_errors=True); os.makedirs(o)
    os.makedirs(os.path.join(o, "raw/empSttus"))
    with open(os.path.join(o, "raw/empSttus/1_2021_11011.json"), "wb") as f:
        f.write(b'{"status":"000"')
    c = mkclient(o, body('{"status":"000","message":"정상","list":[{"a":"1"}]}'))
    r = c.call("empSttus", {"corp_code": "1", "bsns_year": "2021", "reprt_code": "11011"})
    check("사이드카 없는 잔해는 캐시 미스로 처리", not r.cached)

    # Content-Length 불일치는 전송 오류
    o = os.path.join(out_root, "t_clen")
    shutil.rmtree(o, ignore_errors=True); os.makedirs(o)
    c = mkclient(o, lambda u, t: (200, b'{"status":"000","list":[]}', {"Content-Length": "9999"}))
    try:
        c.call("empSttus", {"corp_code": "1", "bsns_year": "2021", "reprt_code": "11011"})
        ok = False
    except C.FatalDartError:
        ok = True
    check("Content-Length 불일치는 응답으로 받지 않는다", ok)


# ── 전 구간 ───────────────────────────────────────────────────────────────
def pipeline(out_root):
    print("\n  [2] 픽스처 전 구간 (resolve → phase0 → phase1 → phase2 → emit)")
    out = os.path.join(out_root, "pipeline")
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out)
    fx = os.path.join(out_root, "_fixtures")
    shutil.rmtree(fx, ignore_errors=True)
    fixtures.build(fx)
    os.environ["DART_FIXTURE_DIR"] = fx
    os.environ["DART_API_KEY"] = FAKE_KEY
    try:
        c = mkclient(out)
        phase0.run(c, out, verbose=False)
        check("PHASE0_REPORT.md 생성", os.path.exists(os.path.join(out, "PHASE0_REPORT.md")))
        rep = open(os.path.join(out, "PHASE0_REPORT.md"), encoding="utf-8").read()
        check("탐침 ① 이 경계연도 2015 를 집어낸다", "= **2015**" in rep,
              rep[rep.find("**결론**"):][:200] if "**결론**" in rep else "")
        check("탐침 ② 가 감사보고서만 내는 법인을 짚는다",
              "신한이지손해보험" in rep and "**없음**" in rep)
        check("탐침 ③ 이 CSM 원문 필요를 결론낸다", "Phase 2 원문 파싱이 필요하다" in rep)

        entries = corpcode.load_corp_codes(out)
        check("17개 법인 전부 해석", len(entries) == 17, "해석 %d" % len(entries))
        wm = [e for e in entries if e["label"] == "우리금융지주(구)"]
        wn = [e for e in entries if e["label"] == "우리금융지주"]
        check("동명 우리금융지주 2건이 서로 다른 corp_code 로 갈린다",
              bool(wm) and bool(wn) and wm[0]["corp_code"] != wn[0]["corp_code"])
        check("신 우리금융지주는 종목코드로 매칭", wn and wn[0]["resolved_by"] == "stock_code")
        check("정체성 교차검증 통과",
              all(e["identity_check"] in ("검증됨", "확인항목없음") for e in entries),
              ",".join("%s=%s" % (e["label"], e["identity_check"]) for e in entries
                       if e["identity_check"] not in ("검증됨", "확인항목없음")))

        c = mkclient(out)
        phase1.run(c, out, config.DEFAULT_YEARS, config.DEFAULT_HALF_YEARS, verbose=False)
        c = mkclient(out)
        phase2.run(c, out, verbose=False)
        paths = emit.emit_all(out, config.DEFAULT_YEARS, config.DEFAULT_HALF_YEARS)
        check("산출물 생성", len(paths) >= 14, "%d개" % len(paths))
    finally:
        os.environ.pop("DART_FIXTURE_DIR", None)
    return out


def assertions(out):
    print("\n  [3] 산출물 불변식")
    req = ["source_endpoint", "source_params", "rcept_no", "fetched_at", "status"]
    for p in sorted(glob.glob(os.path.join(out, "[0-9][0-9]*.csv"))):
        rows = read_csv(p)
        if not rows:
            continue
        missing = [c for c in req if c not in rows[0]]
        check("필수 출처 컬럼: %s" % os.path.basename(p), not missing, "누락 %s" % missing)

    fs = read_csv(os.path.join(out, "03_재무제표.csv"))
    check("union-of-keys 로 예상 밖 필드도 보존",
          bool(fs) and "unexpected_new_field" in fs[0])
    check("모든 재무 행에 raw_sha256", all(r.get("raw_sha256") for r in fs))
    check("accounting_std 는 추론임을 라벨링",
          bool(fs) and "accounting_std_inferred" in fs[0] and "inference_rule" in fs[0])
    y2022 = [r for r in fs if r["bsns_year"] == "2022"]
    y2023 = [r for r in fs if r["bsns_year"] == "2023"]
    check("IFRS4/IFRS17 이 보고서 연도로 갈린다",
          all(r["accounting_std_inferred"] == "IFRS4" for r in y2022)
          and all(r["accounting_std_inferred"] == "IFRS17" for r in y2023))

    lg = read_csv(os.path.join(out, "03b_재무제표_long.csv"))
    terms = {r["term_code"] for r in lg}
    check("분기·누적 term 키를 잃지 않는다",
          {"thstrm", "thstrm_add", "frmtrm", "frmtrm_q", "bfefrmtrm"} <= terms,
          "관측 %s" % sorted(terms))
    st = {r["parse_status"] for r in lg}
    check("빈칸의 의미를 분리 (dash/key_absent/ok)",
          {"ok", "dash", "key_absent"} <= st, "관측 %s" % sorted(st))
    neg = [r for r in lg if r["amount_raw"].startswith("△")]
    check("△ 표기를 음수로 파싱", bool(neg) and neg[0]["amount"].startswith("-"),
          neg[0]["amount"] if neg else "없음")
    paren = [r for r in lg if r["amount_raw"].startswith("(")]
    check("괄호 표기를 음수로 파싱", bool(paren) and paren[0]["amount"].startswith("-"))
    check("비교표시 플래그", {"Y", "N"} <= {r["is_comparative"] for r in lg})
    check("합병·회계 단절을 표시", any(r["comparability_break"] == "Y" for r in lg))

    b1 = read_csv(os.path.join(out, "07_회사채미상환잔액.csv"))
    b2 = read_csv(os.path.join(out, "08_신종자본증권미상환잔액.csv"))
    check("회사채와 신종자본증권의 만기구간 컬럼이 서로 다르다",
          bool(b1) and bool(b2)
          and ("yy1_excess_yy2_below" in b1[0]) and ("yy1_excess_yy2_below" not in b2[0])
          and ("yy20_excess_yy30_below" in b2[0]))

    own = read_csv(os.path.join(out, "12_지분관계.csv"))
    hw = [r for r in own if r["child_name"] == "한화손해보험"]
    check("지분 그래프에 부모-자식과 지분율", bool(hw) and hw[0]["trmend_qota_rt"] == "51.36")
    check("미매칭 자회사는 unmatched 로 라벨",
          any(r["child_match_method"] == "unmatched" for r in own))

    doc = read_csv(os.path.join(out, "11_원문추출.csv"))
    csm = [r for r in doc if "계약서비스마진" in r.get("cell_text", "")]
    check("원문에서 CSM 표 셀 추출", bool(csm))
    check("표마다 단위 표기를 원문 그대로 포착",
          bool(csm) and csm[0]["unit_hint"] == "(단위: 억원)", csm[0]["unit_hint"] if csm else "")
    check("rowspan/colspan 을 격자 추론 없이 보존",
          any(r.get("colspan") == "2" for r in doc))
    check("TE/TU 셀 태그 인식", {"te", "tu"} <= {r.get("cell_tag") for r in doc})
    check("섹션 매칭 실패에 대비해 문서 전문 보관",
          bool(glob.glob(os.path.join(out, "text/*/_full.txt"))))
    check("지분취득 추적 원문(주요사항보고서) 수집",
          os.path.exists(os.path.join(out, "raw/document/20160415000777.zip")))

    ms = read_csv(os.path.join(out, "99_미확보목록.csv"))
    codes = {r["reason_code"] for r in ms}
    check("미확보 사유를 코드로 분리", "api_013" in codes, "관측 %s" % sorted(codes))
    carrot = [r for r in ms if r["corp_label"] == "캐롯손해보험"
              and r["reason_code"] == "not_applicable_entity_window"]
    check("소멸 법인의 기간 밖 칸은 '누락'이 아니라 '해당없음'", bool(carrot))

    acc = read_csv(os.path.join(out, "00_계정과목목록.csv"))
    check("계정과목 고유값 목록 생성", bool(acc) and "years_seen" in acc[0])
    check("비표준 account_id 를 표시",
          any(r["account_id_is_standard"] == "N" for r in acc))
    check("보험사 계정(보험계약부채)이 목록에 있다",
          any(r["account_nm"] == "보험계약부채" for r in acc))

    print("\n  [4] 키 유출·멱등성")
    leaked = []
    for p in glob.glob(os.path.join(out, "**", "*"), recursive=True):
        if not os.path.isfile(p) or p.endswith((".zip", ".xlsx")):
            continue
        try:
            with open(p, encoding="utf-8", errors="ignore") as f:
                if FAKE_KEY in f.read():
                    leaked.append(os.path.relpath(p, out))
        except Exception:
            pass
    check("API 키가 어떤 산출물에도 남지 않는다", not leaked, ", ".join(leaked[:5]))
    log = read_csv(os.path.join(out, "call_log.csv"))
    check("call_log 의 URL 이 마스킹됨",
          bool(log) and all("crtfc_key=***" in r["url_redacted"] or not r["url_redacted"]
                            for r in log))
    check("call_log 에 run_id·script_sha 기록", bool(log) and log[0].get("run_id"))

    before = {}
    for p in glob.glob(os.path.join(out, "[0-9][0-9]*.csv")):
        before[p] = open(p, "rb").read()
    emit.emit_all(out, config.DEFAULT_YEARS, config.DEFAULT_HALF_YEARS)
    same = all(open(p, "rb").read() == b for p, b in before.items())
    check("emit 은 멱등 (두 번 돌려도 같은 결과)", same)


def main(out_dir):
    root = os.path.join(os.path.abspath(out_dir), "_selftest")
    shutil.rmtree(root, ignore_errors=True)
    os.makedirs(root)
    print("  셀프테스트 (네트워크·API 키 불필요)  작업경로: %s" % root)
    transport_cases(root)
    out = pipeline(root)
    assertions(out)
    print("\n  결과: 통과 %d / 실패 %d" % (len(PASS), len(FAIL)))
    if FAIL:
        print("  실패 항목:")
        for f in FAIL:
            print("    - %s" % f)
        return 1
    print("  전부 통과.")
    return 0
