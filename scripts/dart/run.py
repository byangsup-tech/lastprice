#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""DART OpenAPI 수집기 — 보험지주회사 벤치마킹.

  export DART_API_KEY=...
  python3 scripts/dart/run.py phase0
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config          # noqa: E402
import corpcode        # noqa: E402
import docparse        # noqa: E402
import emit            # noqa: E402
import phase0          # noqa: E402
import phase1          # noqa: E402
import phase2          # noqa: E402
from client import DartClient, FatalDartError  # noqa: E402

DEFAULT_OUT = "./dart_out"


def parse_years(spec, default):
    if not spec:
        return list(default)
    out = []
    for part in spec.split(","):
        part = part.strip()
        if "-" in part:
            a, b = part.split("-", 1)
            out.extend(range(int(a), int(b) + 1))
        elif part:
            out.append(int(part))
    return sorted(set(out))


def build_parser():
    p = argparse.ArgumentParser(
        prog="run.py", description="DART OpenAPI 수집기 (보험지주회사 벤치마킹)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="K-ICS 는 DART 에 없습니다(감독목적 지표). 이 스크립트의 범위 밖입니다.")
    p.add_argument("command", choices=["selftest", "resolve", "phase0", "phase1",
                                       "phase2", "emit", "all"])
    p.add_argument("--out", default=DEFAULT_OUT, help="출력 디렉토리 (기본 ./dart_out)")
    p.add_argument("--delay", type=float, default=0.4, help="호출 간 최소 간격(초)")
    p.add_argument("--max-calls", type=int, default=5000, help="이번 실행의 네트워크 호출 상한")
    p.add_argument("--refresh", action="store_true", help="캐시 무시하고 전부 재조회")
    p.add_argument("--refresh-status", default="", help="이 status 로 캐시된 것만 재조회 (예: 013,020)")
    p.add_argument("--max-age-days", type=int, default=None, help="이보다 오래된 캐시는 재조회")
    p.add_argument("--dry-run", action="store_true", help="호출하지 않고 plan.csv 만 생성")
    p.add_argument("--years", default="", help="사업연도 (예: 2021-2025 또는 2015-2026)")
    p.add_argument("--half-years", default="", help="반기 조회 연도 (예: 2025,2026)")
    p.add_argument("--only", default="", help="법인명 쉼표 구분 (예: 한화생명보험,한화손해보험)")
    p.add_argument("--endpoint", default="", help="엔드포인트 제한 (쉼표 구분)")
    p.add_argument("--max-doc-bytes", type=int, default=docparse.DEFAULT_MAX_DOC_BYTES)
    p.add_argument("--force", action="store_true", help="Phase 0 게이트를 무시하고 진행")
    return p


def make_client(a, require_key=True):
    os.makedirs(a.out, exist_ok=True)
    return DartClient(
        a.out, delay=a.delay, max_calls=a.max_calls, refresh=a.refresh,
        refresh_status=[s.strip() for s in a.refresh_status.split(",") if s.strip()],
        max_age_days=a.max_age_days, dry_run=a.dry_run, require_key=require_key)


def gate_phase0(a):
    p = os.path.join(a.out, "PHASE0_REPORT.md")
    if os.path.exists(p) or a.force or a.dry_run:
        return
    raise SystemExit(
        "\n  Phase 0 보고서가 없습니다: %s\n"
        "  먼저 `python3 scripts/dart/run.py phase0` 을 실행하고 결과를 확인하세요.\n"
        "  (확인을 건너뛰려면 --force)\n" % p)


def main(argv=None):
    a = build_parser().parse_args(argv)
    years = parse_years(a.years, config.DEFAULT_YEARS)
    half = parse_years(a.half_years, config.DEFAULT_HALF_YEARS)
    only = [s.strip() for s in a.only.split(",") if s.strip()]
    eps = [s.strip() for s in a.endpoint.split(",") if s.strip()]
    os.makedirs(a.out, exist_ok=True)

    if a.command == "selftest":
        import selftest
        return selftest.main(a.out)

    if a.command == "emit":
        paths = emit.emit_all(a.out, years, half, a.max_doc_bytes)
        print("  산출물 %d개:" % len(paths))
        for p in paths:
            print("    %s" % p)
        return 0

    client = make_client(a, require_key=not a.dry_run)
    try:
        if a.command == "resolve":
            entries, unresolved, _ = corpcode.resolve(client, a.out)
            corpcode.write_corp_codes(a.out, entries)
            print("  해석 %d / 미해결 %d" % (len(entries), len(unresolved)))
            if unresolved:
                return 2
        elif a.command == "phase0":
            phase0.run(client, a.out)
        elif a.command == "phase1":
            gate_phase0(a)
            phase1.run(client, a.out, years, half, only=only, endpoints=eps)
        elif a.command == "phase2":
            gate_phase0(a)
            phase2.run(client, a.out, base_years=years, only=only)
        elif a.command == "all":
            phase0.run(client, a.out)
            gate_phase0(a)
            phase1.run(client, a.out, years, half, only=only, endpoints=eps)
            phase2.run(client, a.out, base_years=years, only=only)
            for p in emit.emit_all(a.out, years, half, a.max_doc_bytes):
                print("    %s" % p)
    except FatalDartError as e:
        print("\n  ✗ %s" % e, file=sys.stderr)
        print("    이 상태는 캐시되지 않았습니다. 원인 해소 후 같은 명령을 다시 실행하면\n"
              "    받은 것은 캐시에서 읽고 실패 지점부터 이어서 받습니다.", file=sys.stderr)
        return 3
    finally:
        if a.dry_run:
            p = client.write_plan()
            if p:
                print("  호출 계획 %d건 → %s" % (len(client.plan_rows), p))
    return 0


if __name__ == "__main__":
    sys.exit(main())
