"""KB 보험료 수집기 — 로컬 웹 UI (Flask).

UI 는 claude.ai/design 시안(흰 카드 · 네이비 액센트 · 테이블형 조건 그리드 ·
다크 콘솔 로그)을 적용했다. 단일 카드의 상태 클래스(s-idle/s-run/s-ok/s-err)를
폴링 결과에 맞춰 교체한다. 수집은 백그라운드 스레드에서 돌고, run_collection 이
print 로 내보내는 진행 메시지를 stdout 가로채기로 모아 /status 로 전달한다.
한 번에 하나의 수집만 허용한다.
"""
from __future__ import annotations

import os
import subprocess
import sys
import threading
import time
from contextlib import redirect_stdout

from flask import Flask, jsonify, request, send_file

from src.runner import OUTPUT_DIR, run_collection

app = Flask(__name__)

_LOCK = threading.Lock()
_STATE: dict = {"running": False, "finished": False, "log": [], "result": None}


class _LogStream:
    """stdout 을 줄 단위로 _STATE['log'] 에 적재(시각 접두)하고 콘솔에도 출력."""

    def __init__(self) -> None:
        self._buf = ""

    def write(self, s: str) -> None:
        try:
            sys.__stdout__.write(s)
        except Exception:
            pass
        self._buf += s
        while "\n" in self._buf:
            line, self._buf = self._buf.split("\n", 1)
            with _LOCK:
                _STATE["log"].append(time.strftime("%H:%M:%S") + " " + line)

    def flush(self) -> None:
        try:
            sys.__stdout__.flush()
        except Exception:
            pass


def _worker(product_code: str, profiles: list[dict]) -> None:
    stream = _LogStream()
    try:
        with redirect_stdout(stream):
            result = run_collection(product_code, profiles, headless=False)
    except Exception as e:  # noqa: BLE001
        result = {"ok": False, "error": f"{type(e).__name__}: {e}",
                  "output_path": None}
    with _LOCK:
        _STATE["running"] = False
        _STATE["finished"] = True
        _STATE["result"] = result


@app.route("/")
def index():
    return PAGE


@app.route("/run", methods=["POST"])
def run():
    with _LOCK:
        if _STATE["running"]:
            return jsonify({"error": "이미 수집이 진행 중입니다."}), 409
    data = request.get_json(force=True, silent=True) or {}
    product_code = str(data.get("product_code", "")).strip()
    profiles = data.get("profiles") or []
    if not profiles:
        return jsonify({"error": "조건을 1개 이상 추가하세요."}), 400
    with _LOCK:
        _STATE.update(running=True, finished=False, result=None, log=[])
    threading.Thread(target=_worker, args=(product_code, profiles),
                     daemon=True).start()
    return jsonify({"started": True})


@app.route("/status")
def status():
    with _LOCK:
        return jsonify({
            "running": _STATE["running"],
            "finished": _STATE["finished"],
            "log": _STATE["log"],
            "result": _STATE["result"],
        })


@app.route("/open", methods=["POST"])
def open_folder():
    try:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        if sys.platform.startswith("win"):
            os.startfile(OUTPUT_DIR)  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(OUTPUT_DIR)])
        else:
            subprocess.Popen(["xdg-open", str(OUTPUT_DIR)])
        return jsonify({"ok": True})
    except Exception as e:  # noqa: BLE001
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/download")
def download():
    result = _STATE.get("result") or {}
    path = result.get("output_path")
    if not path or not os.path.exists(path):
        return "결과 파일이 아직 없습니다.", 404
    return send_file(path, as_attachment=True)


PAGE = """<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>KB 보험료 수집기</title>
<style>
  :root {
    --bg: #eef0f4; --canvas: #e6e9ee; --card: #ffffff;
    --border: #e3e6eb; --border-strong: #d4d9e0; --row-alt: #fafbfc;
    --text: #0f172a; --text-2: #475569; --text-3: #8b94a3; --text-4: #b3bac4;
    --primary: #1f3a5f; --primary-hover: #16314f;
    --primary-soft: #eaf0f7; --primary-tint: #f3f6fa;
    --success: #15803d; --success-strong: #166534;
    --success-bg: #f0fdf4; --success-border: #bbf7d0;
    --error: #b91c1c; --error-strong: #991b1b;
    --error-bg: #fef2f2; --error-border: #fecaca;
    --warn: #b45309; --warn-bg: #fffbeb; --warn-border: #fde68a;
    --console-bg: #0f1729; --console-text: #cbd5e1; --console-dim: #64748b;
    --console-ok: #4ade80; --console-warn: #fbbf24;
    --console-err: #f87171; --console-info: #93c5fd;
    --radius: 10px; --radius-sm: 6px;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    background:
      radial-gradient(1200px 600px at 50% -200px, #f4f6f9 0%, transparent 60%),
      var(--canvas);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo",
      "Pretendard", "Malgun Gothic", "맑은 고딕", "Noto Sans KR",
      "Helvetica Neue", Arial, sans-serif;
    font-size: 14px; line-height: 1.55;
    -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    font-feature-settings: "tnum" 1, "ss01" 1;
  }
  .page { max-width: 820px; margin: 0 auto; padding: 40px 16px 64px; }
  .hidden { display: none !important; }

  .card {
    background: var(--card); border: 1px solid var(--border);
    border-radius: var(--radius); overflow: hidden; position: relative;
    box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 8px 24px -12px rgba(15,23,42,.08);
  }
  .card::before {
    content: ""; position: absolute; inset: 0 0 auto 0;
    height: 3px; background: var(--primary);
  }
  .card.s-run::before { background: #2563eb; }
  .card.s-ok::before { background: var(--success); }
  .card.s-err::before { background: var(--error); }

  .head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 22px 26px 18px; border-bottom: 1px solid var(--border); gap: 16px;
  }
  .head-l { display: flex; align-items: center; gap: 14px; min-width: 0; }
  .logo {
    width: 36px; height: 36px; border-radius: 8px;
    background: linear-gradient(180deg, #284b78 0%, #1a3252 100%);
    color: #fff; display: inline-flex; align-items: center;
    justify-content: center; font-size: 13px; font-weight: 700;
    letter-spacing: .02em; flex-shrink: 0;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.12);
  }
  .head-text { min-width: 0; }
  .title { font-size: 16.5px; font-weight: 700; letter-spacing: -.01em; }
  .subtitle { font-size: 12.5px; color: var(--text-2); margin-top: 2px; }

  .status-pill {
    display: inline-flex; align-items: center; gap: 6px; height: 26px;
    padding: 0 11px; border-radius: 999px; font-size: 11.5px;
    font-weight: 600; letter-spacing: .02em; flex-shrink: 0;
  }
  .status-pill .dot { width: 6px; height: 6px; border-radius: 50%; }
  .pill-idle { color: #475569; background: #f1f5f9; }
  .pill-idle .dot { background: #94a3b8; }
  .pill-run { color: #1d4ed8; background: #eff6ff; }
  .pill-run .dot { background: #3b82f6; animation: blink 1.4s ease-in-out infinite; }
  .pill-ok { color: var(--success); background: var(--success-bg); }
  .pill-ok .dot { background: var(--success); }
  .pill-err { color: var(--error); background: var(--error-bg); }
  .pill-err .dot { background: var(--error); }
  @keyframes blink {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: .35; transform: scale(.85); }
  }

  .body { padding: 22px 26px 24px; }
  .section + .section { margin-top: 22px; }

  .field-row {
    display: flex; align-items: baseline; justify-content: space-between;
    margin-bottom: 8px;
  }
  .field-label { font-size: 12.5px; font-weight: 600; letter-spacing: -.005em; }
  .field-hint { font-size: 11.5px; color: var(--text-3); }

  input[type="text"], input[type="number"], select {
    height: 36px; padding: 0 12px; border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm); background: #fff; font: inherit;
    color: var(--text); outline: none;
    transition: border-color .15s, box-shadow .15s, background .15s;
  }
  input[type="text"]:hover, input[type="number"]:hover, select:hover {
    border-color: #b6bdc7;
  }
  input[type="text"]:focus, input[type="number"]:focus, select:focus {
    border-color: var(--primary); box-shadow: 0 0 0 3px rgba(31,58,95,.12);
  }
  input:disabled, select:disabled {
    background: #f5f6f8; color: var(--text-3); cursor: not-allowed;
  }
  select {
    appearance: none; -webkit-appearance: none;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='M3 4.75L6 7.75L9 4.75' stroke='%23475569' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>");
    background-repeat: no-repeat; background-position: right 9px center;
    padding-right: 28px; cursor: pointer;
  }
  .product-code {
    width: 220px; font-variant-numeric: tabular-nums; letter-spacing: .04em;
  }

  .cases {
    border: 1px solid var(--border); border-radius: var(--radius);
    overflow: hidden; background: #fff;
  }
  .cases-head, .case-row {
    display: grid; grid-template-columns: 70px 1.1fr 1fr 1fr 36px;
    align-items: center; gap: 10px; padding: 9px 14px;
  }
  .cases-head {
    background: #f6f8fa; border-bottom: 1px solid var(--border);
    font-size: 11.5px; font-weight: 600; color: var(--text-2);
    letter-spacing: .02em;
  }
  .case-row { background: #fff; transition: background .15s; }
  .case-row + .case-row { border-top: 1px solid var(--border); }
  .case-row:hover { background: var(--primary-tint); }
  .case-row select, .case-row input { width: 100%; height: 34px; }

  .age-cell { position: relative; }
  .age-cell input {
    padding-right: 28px; font-variant-numeric: tabular-nums; text-align: left;
  }
  .age-cell .unit {
    position: absolute; right: 11px; top: 50%; transform: translateY(-50%);
    font-size: 12px; color: var(--text-3); pointer-events: none;
  }

  .del-btn {
    width: 28px; height: 28px; border-radius: 6px;
    border: 1px solid transparent; background: transparent;
    color: var(--text-3); cursor: pointer; display: inline-flex;
    align-items: center; justify-content: center; transition: all .15s;
    padding: 0; justify-self: center;
  }
  .del-btn:hover {
    color: var(--error); background: #fef2f2; border-color: var(--error-border);
  }
  .del-btn:disabled { opacity: .3; cursor: not-allowed; }
  .del-btn svg { width: 14px; height: 14px; }

  .add-row { margin-top: 10px; }
  .add-btn {
    height: 34px; padding: 0 14px; border: 1px dashed var(--border-strong);
    background: #fff; border-radius: var(--radius-sm); color: var(--text-2);
    font: inherit; font-size: 12.5px; font-weight: 500; cursor: pointer;
    transition: all .15s; display: inline-flex; align-items: center; gap: 6px;
  }
  .add-btn:hover {
    border-color: var(--primary); border-style: solid;
    color: var(--primary); background: var(--primary-soft);
  }
  .add-btn:disabled { opacity: .45; cursor: not-allowed; }
  .add-btn .plus { font-size: 14px; line-height: 1; font-weight: 600; }

  .run-block { margin-top: 24px; }
  .btn-primary {
    width: 100%; height: 48px; background: var(--primary); color: #fff;
    border: none; border-radius: var(--radius); font: inherit;
    font-size: 15px; font-weight: 600; letter-spacing: -.005em;
    cursor: pointer; transition: background .15s, transform .05s;
    display: inline-flex; align-items: center; justify-content: center;
    gap: 10px; box-shadow: 0 1px 2px rgba(31,58,95,.18);
  }
  .btn-primary:hover { background: var(--primary-hover); }
  .btn-primary:active { transform: translateY(1px); }
  .btn-primary.is-running, .btn-primary[disabled] {
    background: #8794a5; cursor: not-allowed; box-shadow: none;
  }
  .btn-primary.is-running:hover { background: #8794a5; }
  .btn-primary .ico { width: 16px; height: 16px; }
  .spinner {
    width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.35);
    border-top-color: #fff; border-radius: 50%;
    animation: spin .8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .progress-block { margin-top: 20px; }
  .progress-line {
    display: flex; align-items: baseline; justify-content: space-between;
    font-size: 12.5px; margin-bottom: 8px; gap: 12px;
  }
  .progress-line .label {
    font-weight: 600; display: inline-flex; align-items: center; gap: 6px;
  }
  .progress-line .label .sublabel { color: var(--text-3); font-weight: 400; }
  .progress-line .pct {
    font-variant-numeric: tabular-nums; color: var(--text-2); font-weight: 600;
  }
  .progress-track {
    height: 6px; background: #eef1f5; border-radius: 999px;
    overflow: hidden; position: relative;
  }
  .progress-fill {
    height: 100%; background: var(--primary); border-radius: 999px;
    transition: width .3s; position: relative;
  }
  .progress-fill.running {
    background: linear-gradient(90deg, var(--primary) 0%, #3b82f6 50%, var(--primary) 100%);
    background-size: 200% 100%; animation: shimmer 1.6s linear infinite;
  }
  .progress-fill.ok { background: var(--success); }
  .progress-fill.err { background: var(--error); }
  @keyframes shimmer {
    from { background-position: 200% 0; }
    to { background-position: -200% 0; }
  }

  .log-block { margin-top: 18px; }
  .log-head {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 8px;
  }
  .log-head .label { font-size: 12.5px; font-weight: 600; }
  .log-head .meta {
    font-size: 11.5px; color: var(--text-3); font-variant-numeric: tabular-nums;
  }
  .log {
    height: 240px; background: var(--console-bg); border-radius: var(--radius);
    padding: 12px 16px; overflow-y: auto;
    font-family: ui-monospace, "SF Mono", "Menlo", "Consolas", "D2Coding",
      "Cascadia Mono", monospace;
    font-size: 12px; line-height: 1.7; color: var(--console-text);
    border: 1px solid #1e293b;
  }
  .log::-webkit-scrollbar { width: 10px; }
  .log::-webkit-scrollbar-track { background: transparent; }
  .log::-webkit-scrollbar-thumb {
    background: #334155; border-radius: 999px; border: 2px solid var(--console-bg);
  }
  .log .line { white-space: pre-wrap; word-break: break-all; }
  .log .ts { color: var(--console-dim); margin-right: 10px;
             font-variant-numeric: tabular-nums; }
  .log .ok { color: var(--console-ok); }
  .log .warn { color: var(--console-warn); }
  .log .err { color: var(--console-err); }
  .log .info { color: var(--console-info); }
  .log-empty {
    height: 240px; background: #fafbfc;
    border: 1px dashed var(--border-strong); border-radius: var(--radius);
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 6px; color: var(--text-3);
  }
  .log-empty .ic { opacity: .5; }
  .log-empty .t { font-size: 12.5px; font-weight: 500; }
  .log-empty .s { font-size: 11.5px; color: var(--text-4); }

  .result-block { margin-top: 18px; }
  .result-card {
    border: 1px solid var(--success-border); background: var(--success-bg);
    border-radius: var(--radius); padding: 16px 18px;
    display: flex; align-items: flex-start; gap: 14px;
  }
  .result-card.err { border-color: var(--error-border); background: var(--error-bg); }
  .result-icon {
    width: 32px; height: 32px; border-radius: 50%; background: var(--success);
    color: #fff; display: inline-flex; align-items: center;
    justify-content: center; flex-shrink: 0;
    box-shadow: 0 0 0 4px rgba(21,128,61,.12);
  }
  .result-card.err .result-icon {
    background: var(--error); box-shadow: 0 0 0 4px rgba(185,28,28,.12);
  }
  .result-body { flex: 1; min-width: 0; }
  .result-title {
    font-size: 14px; font-weight: 700; color: var(--success-strong);
    letter-spacing: -.005em;
  }
  .result-card.err .result-title { color: var(--error-strong); }
  .result-detail {
    font-size: 12.5px; color: var(--text-2); margin-top: 4px;
    word-break: break-all;
  }
  .result-detail code {
    background: rgba(15,23,42,.05); padding: 1px 6px; border-radius: 4px;
    font-family: ui-monospace, "Consolas", monospace; font-size: 11.5px;
    color: var(--text);
  }
  .result-actions {
    display: flex; align-items: center; gap: 10px; margin-top: 14px;
    flex-wrap: wrap;
  }
  .btn-result {
    height: 32px; padding: 0 14px; border: 1px solid var(--success-border);
    background: #fff; border-radius: 6px; color: var(--success-strong);
    font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px; transition: all .15s;
  }
  .btn-result:hover { background: #ecfdf5; border-color: var(--success); }
  .btn-result .ic { width: 13px; height: 13px; }
  .result-link {
    color: var(--success-strong); font-size: 12.5px; font-weight: 600;
    text-decoration: none; display: inline-flex; align-items: center; gap: 4px;
  }
  .result-link:hover { text-decoration: underline; }

  .foot {
    padding: 14px 26px; border-top: 1px solid var(--border);
    background: #fafbfc; font-size: 11.5px; color: var(--text-3);
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  }
  .foot .ic { width: 12px; height: 12px; opacity: .7; }
  .foot .sep { color: var(--border-strong); }
</style>
</head>
<body>
<div class="page">
  <section class="card s-idle" id="card">
    <header class="head">
      <div class="head-l">
        <div class="logo">KB</div>
        <div class="head-text">
          <div class="title">KB 보험료 수집기</div>
          <div class="subtitle">상품코드와 조건을 정하면 특약별 월보험료를 엑셀로 저장합니다.</div>
        </div>
      </div>
      <span class="status-pill pill-idle" id="statusPill"><span class="dot"></span>대기</span>
    </header>

    <div class="body">
      <div class="section">
        <div class="field-row">
          <label class="field-label" for="productCode">상품코드</label>
          <span class="field-hint">KB손해보험 온라인 계산기 상품번호</span>
        </div>
        <input type="text" id="productCode" class="product-code" value="24950" />
      </div>

      <div class="section">
        <div class="field-row">
          <span class="field-label">조건 <span style="color:var(--text-3);font-weight:400;">— 한 줄 = 한 케이스</span></span>
          <span class="field-hint" id="caseCount">0개 조건</span>
        </div>
        <div class="cases" id="cases">
          <div class="cases-head">
            <div class="col">성별</div>
            <div class="col">연령</div>
            <div class="col">보험기간</div>
            <div class="col">납입기간</div>
            <div class="col"></div>
          </div>
        </div>
        <div class="add-row">
          <button class="add-btn" type="button" id="addBtn"><span class="plus">+</span>조건 추가</button>
        </div>
      </div>

      <div class="run-block">
        <button class="btn-primary" type="button" id="runBtn">
          <svg class="ico" viewBox="0 0 16 16" fill="none"><path d="M4 3l9 5-9 5V3z" fill="currentColor"/></svg>
          <span>수집 시작</span>
        </button>
      </div>

      <div class="progress-block hidden" id="progressBlock">
        <div class="progress-line">
          <span class="label"><span id="progLabel">준비 중</span><span class="sublabel" id="progSub"></span></span>
          <span class="pct" id="progPct">0%</span>
        </div>
        <div class="progress-track"><div class="progress-fill" id="progFill" style="width:0%"></div></div>
      </div>

      <div class="log-block">
        <div class="log-head">
          <span class="label">실행 로그</span>
          <span class="meta" id="logMeta">대기 중</span>
        </div>
        <div class="log-empty" id="logEmpty">
          <svg class="ic" width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.5"/>
            <path d="M7 9h4M7 13h7M7 17h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <div class="t">아직 실행 전입니다</div>
          <div class="s">'수집 시작'을 누르면 로그가 여기에 표시됩니다</div>
        </div>
        <div class="log hidden" id="log"></div>
      </div>

      <div class="result-block hidden" id="resultBlock">
        <div class="result-card" id="resultCard">
          <div class="result-icon" id="resultIcon"></div>
          <div class="result-body">
            <div class="result-title" id="resultTitle"></div>
            <div class="result-detail" id="resultDetail"></div>
            <div class="result-actions" id="resultActions"></div>
          </div>
        </div>
      </div>
    </div>

    <footer class="foot">
      <svg class="ic" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.2"/><path d="M6 3.5v3M6 8.2v.3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
      <span>로컬 PC에서 실행됩니다</span>
      <span class="sep">·</span>
      <span>Chrome 설치 및 KB 접속 가능한 망 필요</span>
    </footer>
  </section>
</div>

<script>
var SEX = ["남","여"], MAT = ["100세","90세","80세","70세"], PAY = ["20년","30년","15년","10년"];
var DEL_SVG = '<svg viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
var PLAY_SVG = '<svg class="ico" viewBox="0 0 16 16" fill="none"><path d="M4 3l9 5-9 5V3z" fill="currentColor"/></svg>';
var CHECK_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3.5 8l3 3 6-6.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var X_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 4.5v4M8 11v.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>';
var FOLDER_SVG = '<svg class="ic" viewBox="0 0 14 14" fill="none"><path d="M2 4.5h4l1 1h5v5.5a1 1 0 01-1 1H2a1 1 0 01-1-1V5.5a1 1 0 011-1z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
var DL_SVG = '<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 2v8m0 0l-3-3m3 3l3-3M2 12h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

var running = false, polling = false;

function opt(list, sel) {
  return list.map(function(v){ return '<option'+(v===sel?' selected':'')+'>'+v+'</option>'; }).join('');
}
function esc(s) {
  return String(s).replace(/[&<>]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]; });
}

function addRow(sex, age, mat, pay) {
  var d = document.createElement('div');
  d.className = 'case-row';
  d.innerHTML =
    '<select class="c-sex">'+opt(SEX, sex||'남')+'</select>'+
    '<div class="age-cell"><input type="number" class="c-age" min="0" max="120" value="'+(age||40)+'"><span class="unit">세</span></div>'+
    '<select class="c-mat">'+opt(MAT, mat||'100세')+'</select>'+
    '<select class="c-pay">'+opt(PAY, pay||'20년')+'</select>'+
    '<button class="del-btn" type="button" aria-label="삭제">'+DEL_SVG+'</button>';
  d.querySelector('.del-btn').onclick = function(){ if(running) return; d.remove(); updateCaseCount(); };
  document.getElementById('cases').appendChild(d);
  updateCaseCount();
}
function updateCaseCount() {
  var n = document.querySelectorAll('#cases .case-row').length;
  document.getElementById('caseCount').textContent = n + '개 조건';
}
function collectProfiles() {
  var out = [];
  document.querySelectorAll('#cases .case-row').forEach(function(r){
    out.push({
      sex_label: r.querySelector('.c-sex').value,
      age: String(r.querySelector('.c-age').value || '').trim(),
      maturity_label: r.querySelector('.c-mat').value,
      payYears_label: r.querySelector('.c-pay').value
    });
  });
  return out;
}

function setState(st) {
  document.getElementById('card').className = 'card s-' + st;
  var map = { idle:['pill-idle','대기'], run:['pill-run','수집 중'],
              ok:['pill-ok','완료'], err:['pill-err','실패'] };
  var pill = document.getElementById('statusPill');
  pill.className = 'status-pill ' + map[st][0];
  pill.innerHTML = '<span class="dot"></span>' + map[st][1];
}
function setRun(st) {
  var b = document.getElementById('runBtn');
  if (st === 'run') {
    b.disabled = true; b.classList.add('is-running');
    b.innerHTML = '<span class="spinner"></span><span>수집 중…</span>';
  } else {
    b.disabled = false; b.classList.remove('is-running');
    b.innerHTML = PLAY_SVG + '<span>' + ((st==='ok'||st==='err') ? '다시 수집' : '수집 시작') + '</span>';
  }
}
function setFormDisabled(dis) {
  document.getElementById('productCode').disabled = dis;
  document.getElementById('addBtn').disabled = dis;
  document.querySelectorAll('#cases select, #cases input, #cases .del-btn')
    .forEach(function(el){ el.disabled = dis; });
}
function setLogMode(showLog) {
  document.getElementById('logEmpty').classList.toggle('hidden', showLog);
  document.getElementById('log').classList.toggle('hidden', !showLog);
}

function lineClass(text) {
  if (/✗|실패|오류|에러|Error|Timeout|ERR/.test(text)) return 'err';
  if (text.indexOf('[완료]') >= 0 || text.indexOf('완료') >= 0) return 'ok';
  if (text.indexOf('[조건') >= 0) return 'info';
  return '';
}
function renderLog(lines) {
  var el = document.getElementById('log');
  var atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 30;
  el.innerHTML = lines.map(function(raw){
    var ts = '', text = raw;
    var m = raw.match(/^(\\d\\d:\\d\\d:\\d\\d) (.*)$/);
    if (m) { ts = m[1]; text = m[2]; }
    var cls = lineClass(text);
    return '<div class="line">' + (ts ? '<span class="ts">'+ts+'</span>' : '') +
           '<span' + (cls ? ' class="'+cls+'"' : '') + '>' + esc(text) + '</span></div>';
  }).join('');
  if (atBottom) el.scrollTop = el.scrollHeight;
  document.getElementById('logMeta').textContent = '줄 ' + lines.length;
}

function renderProgress(st, text) {
  var block = document.getElementById('progressBlock');
  if (st === 'idle') { block.classList.add('hidden'); return; }
  block.classList.remove('hidden');
  var cond = [...text.matchAll(/\\[조건 (\\d+)\\/(\\d+)\\]/g)];
  var pr = [...text.matchAll(/산출 진행 (\\d+)\\/(\\d+)/g)];
  var k = cond.length ? +cond[cond.length-1][1] : 0;
  var n = cond.length ? +cond[cond.length-1][2] : 0;
  var x = pr.length ? +pr[pr.length-1][1] : 0;
  var y = pr.length ? +pr[pr.length-1][2] : 0;
  var p = (st === 'ok') ? 1
        : (n ? Math.min(1, ((k-1) + (y ? x/y : 0)) / n) : 0.02);
  var fill = document.getElementById('progFill');
  fill.style.width = Math.round(p*100) + '%';
  fill.className = 'progress-fill' + (st==='run'?' running':st==='ok'?' ok':st==='err'?' err':'');
  var pct = document.getElementById('progPct');
  pct.textContent = Math.round(p*100) + '%';
  pct.style.color = st==='ok' ? 'var(--success)' : st==='err' ? 'var(--error)' : 'var(--text-2)';
  var lbl = document.getElementById('progLabel'), sub = document.getElementById('progSub');
  if (st === 'ok') { lbl.textContent = '완료'; sub.textContent = y ? (' · 산출 '+x+' / '+y) : ''; }
  else if (st === 'err') { lbl.textContent = '중단'; sub.textContent = n ? (' · 조건 '+k+' / '+n) : ''; }
  else { lbl.textContent = n ? ('조건 '+k+' / '+n) : '준비 중';
         sub.textContent = y ? (' · 산출 진행 '+x+' / '+y) : ''; }
}

function renderResult(st, result) {
  var block = document.getElementById('resultBlock');
  if (st !== 'ok' && st !== 'err') { block.classList.add('hidden'); return; }
  block.classList.remove('hidden');
  result = result || {};
  var card = document.getElementById('resultCard');
  var icon = document.getElementById('resultIcon');
  var title = document.getElementById('resultTitle');
  var detail = document.getElementById('resultDetail');
  var actions = document.getElementById('resultActions');
  if (st === 'ok') {
    card.className = 'result-card';
    icon.innerHTML = CHECK_SVG;
    title.textContent = '수집 완료 · 특약 ' + (result.rows||0) + '행 / 조건 ' + (result.products||0) + '건';
    detail.innerHTML = '저장 위치 <code>' + esc(result.output_path||'') + '</code>';
    actions.innerHTML =
      '<button class="btn-result" type="button" onclick="openFolder()">' + FOLDER_SVG + '결과 폴더 열기</button>' +
      '<a class="result-link" href="/download">' + DL_SVG + '엑셀 다운로드</a>';
  } else {
    card.className = 'result-card err';
    icon.innerHTML = X_SVG;
    title.textContent = '수집 실패';
    detail.textContent = result.error || '원인 미상 — 실행 로그를 확인하세요.';
    actions.innerHTML = '';
  }
}

function start() {
  if (running) return;
  var profiles = collectProfiles();
  if (!profiles.length) { alert('조건을 1개 이상 추가하세요.'); return; }
  for (var i=0;i<profiles.length;i++) {
    if (!profiles[i].age) { alert((i+1)+'번째 조건의 연령을 입력하세요.'); return; }
  }
  running = true;
  setState('run'); setRun('run'); setFormDisabled(true);
  setLogMode(true);
  document.getElementById('log').innerHTML = '';
  document.getElementById('resultBlock').classList.add('hidden');
  renderProgress('run', '');
  fetch('/run', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ product_code: document.getElementById('productCode').value,
                           profiles: profiles }) })
  .then(function(r){ return r.json().then(function(j){ return {s:r.status,j:j}; }); })
  .then(function(x){
    if (x.s !== 200) { alert(x.j.error || '시작 실패'); finishUI('idle', null); return; }
    if (!polling) { polling = true; poll(); }
  })
  .catch(function(e){ alert('요청 실패: '+e); finishUI('idle', null); });
}

function finishUI(st, result) {
  running = false;
  setState(st); setRun(st); setFormDisabled(false);
  renderResult(st, result);
}

function poll() {
  fetch('/status').then(function(r){ return r.json(); }).then(function(s){
    var lines = s.log || [];
    if (lines.length) { setLogMode(true); renderLog(lines); }
    var text = lines.join(' ');
    if (s.running) {
      running = true; polling = true;
      if (document.getElementById('card').className.indexOf('s-run') < 0) {
        setState('run'); setRun('run'); setFormDisabled(true);
      }
      renderProgress('run', text);
      setTimeout(poll, 1000);
    } else if (s.finished) {
      polling = false;
      var ok = !!(s.result && s.result.ok);
      renderProgress(ok ? 'ok' : 'err', text);
      finishUI(ok ? 'ok' : 'err', s.result);
    } else {
      polling = false;
    }
  }).catch(function(){ setTimeout(poll, 1500); });
}

function openFolder() {
  fetch('/open', { method:'POST' }).then(function(r){ return r.json(); })
  .then(function(j){ if (!j.ok) alert('폴더 열기 실패: ' + (j.error||'')); });
}

addRow('남', 40, '100세', '20년');
addRow('여', 50, '100세', '20년');
document.getElementById('addBtn').onclick = function(){ if (!running) addRow(); };
document.getElementById('runBtn').onclick = start;
document.addEventListener('keydown', function(e){
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') start();
});
poll();
</script>
</body>
</html>
"""
