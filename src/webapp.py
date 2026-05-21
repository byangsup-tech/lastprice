"""KB 보험료 수집기 — 로컬 웹 UI (Flask).

단일 페이지 + 폴링 방식. 수집은 백그라운드 스레드에서 돌고, run_collection 이
print 로 내보내는 진행 메시지를 stdout 가로채기로 모아 /status 로 전달한다.
한 번에 하나의 수집만 허용한다.
"""
from __future__ import annotations

import os
import subprocess
import sys
import threading
from contextlib import redirect_stdout

from flask import Flask, jsonify, request, send_file

from src.runner import OUTPUT_DIR, run_collection

app = Flask(__name__)

_LOCK = threading.Lock()
_STATE: dict = {"running": False, "finished": False, "log": [], "result": None}


class _LogStream:
    """stdout 을 줄 단위로 _STATE['log'] 에 적재하고 실제 콘솔에도 그대로 출력."""

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
                _STATE["log"].append(line)

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


PAGE = """<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KB 보험료 수집기</title>
<style>
* { box-sizing: border-box; }
body { margin:0; font-family:'Malgun Gothic','Segoe UI',sans-serif;
       background:#eef1f5; color:#1f2937; }
.wrap { max-width:760px; margin:30px auto; padding:0 16px; }
.card { background:#fff; border-radius:12px; box-shadow:0 2px 14px rgba(0,0,0,.09);
        overflow:hidden; }
.head { background:#305496; color:#fff; padding:18px 22px; }
.head h1 { margin:0; font-size:19px; }
.head p { margin:4px 0 0; font-size:12px; opacity:.82; }
.body { padding:22px; }
.row { margin-bottom:18px; }
.lbl { display:block; font-weight:600; font-size:13px; margin-bottom:7px; }
input,select { font-size:14px; padding:6px 8px; border:1px solid #cbd5e1;
               border-radius:6px; background:#fff; }
input:focus,select:focus { outline:2px solid #305496; }
.cond { display:flex; align-items:center; gap:6px; margin-bottom:8px; }
.cond .age { width:60px; }
.u { font-size:13px; color:#64748b; margin-right:4px; }
button { font-family:inherit; cursor:pointer; border:none; border-radius:6px; }
.btn-add { background:#e2e8f0; color:#334155; padding:6px 12px; font-size:13px; }
.btn-del { background:#fde2e2; color:#b91c1c; padding:6px 10px; font-size:13px; }
.btn-run { background:#305496; color:#fff; font-size:15px; font-weight:600;
           padding:11px 0; width:100%; }
.btn-run:disabled { background:#94a3b8; cursor:default; }
.statusline { font-size:13px; color:#475569; margin:14px 0 4px; }
.bar { height:10px; background:#e2e8f0; border-radius:5px; overflow:hidden; }
.bar > div { height:100%; background:#305496; width:0%; transition:width .35s; }
pre.log { background:#0f172a; color:#cbd5e1; font-size:12px; line-height:1.5;
          padding:12px; border-radius:8px; height:260px; overflow:auto;
          white-space:pre-wrap; margin:12px 0 0; }
.result { margin-top:14px; padding:12px 14px; border-radius:8px; font-size:14px;
          display:none; }
.result.ok { background:#dcfce7; color:#166534; display:block; }
.result.err { background:#fee2e2; color:#b91c1c; display:block; }
.result button { background:#305496; color:#fff; padding:6px 12px; font-size:13px;
                 margin-right:8px; margin-top:8px; }
.result a { color:#166534; font-weight:600; }
.foot { font-size:11px; color:#94a3b8; padding:12px 22px; border-top:1px solid #eef1f5; }
</style>
</head>
<body>
<div class="wrap"><div class="card">
  <div class="head">
    <h1>KB 보험료 수집기</h1>
    <p>상품코드와 조건(성별·연령·보험기간·납입기간)을 정하고 수집하면 특약별 월보험료를 엑셀로 받습니다.</p>
  </div>
  <div class="body">
    <div class="row">
      <span class="lbl">상품코드</span>
      <input id="product" type="text" value="24950" style="width:160px">
    </div>
    <div class="row">
      <span class="lbl">조건 (한 줄 = 한 케이스)</span>
      <div id="conds"></div>
      <button class="btn-add" type="button" onclick="addRow()">+ 조건 추가</button>
    </div>
    <button id="runbtn" class="btn-run" type="button" onclick="start()">수집 시작</button>
    <div class="statusline" id="statusline">대기 중</div>
    <div class="bar"><div id="barfill"></div></div>
    <pre class="log" id="log"></pre>
    <div class="result" id="result"></div>
  </div>
  <div class="foot">로컬 PC에서 실행됩니다. Chrome 설치 + KB 접속 가능한 망이 필요합니다.</div>
</div></div>
<script>
var SEX = ["남","여"], MAT = ["100세","90세","80세","70세"], PAY = ["20년","30년","15년","10년"];
function opts(list, sel){ return list.map(function(v){
  return '<option'+(v===sel?' selected':'')+'>'+v+'</option>'; }).join(''); }

function addRow(sex, age, mat, pay){
  sex = sex||"남"; age = age||40; mat = mat||"100세"; pay = pay||"20년";
  var d = document.createElement("div");
  d.className = "cond";
  d.innerHTML =
    '<select class="sex">'+opts(SEX,sex)+'</select>'+
    '<input type="number" class="age" min="0" max="120" value="'+age+'"><span class="u">세</span>'+
    '<select class="mat">'+opts(MAT,mat)+'</select>'+
    '<select class="pay">'+opts(PAY,pay)+'</select>'+
    '<button class="btn-del" type="button">삭제</button>';
  d.querySelector(".btn-del").onclick = function(){ d.remove(); };
  document.getElementById("conds").appendChild(d);
}

function collectProfiles(){
  var out = [];
  document.querySelectorAll("#conds .cond").forEach(function(d){
    out.push({
      sex_label: d.querySelector(".sex").value,
      age: String(d.querySelector(".age").value || "").trim(),
      maturity_label: d.querySelector(".mat").value,
      payYears_label: d.querySelector(".pay").value
    });
  });
  return out;
}

var polling = false;
function start(){
  var profiles = collectProfiles();
  if(!profiles.length){ alert("조건을 1개 이상 추가하세요."); return; }
  for(var i=0;i<profiles.length;i++){
    if(!profiles[i].age){ alert((i+1)+"번째 조건의 연령을 입력하세요."); return; }
  }
  setRunning(true);
  document.getElementById("result").className = "result";
  document.getElementById("log").textContent = "";
  fetch("/run", {method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({product_code: document.getElementById("product").value,
                          profiles: profiles})})
  .then(function(r){ return r.json().then(function(j){ return {s:r.status,j:j}; }); })
  .then(function(x){
    if(x.s !== 200){ alert(x.j.error || "시작 실패"); setRunning(false); return; }
    if(!polling){ polling = true; poll(); }
  })
  .catch(function(e){ alert("요청 실패: "+e); setRunning(false); });
}

function setRunning(on){
  var b = document.getElementById("runbtn");
  b.disabled = on;
  b.textContent = on ? "수집 중…" : "수집 시작";
}

function progress(text, finished){
  if(finished) return 1;
  var cond = [...text.matchAll(/\\[조건 (\\d+)\\/(\\d+)\\]/g)];
  if(!cond.length) return 0.02;
  var last = cond[cond.length-1], k = +last[1], n = +last[2];
  var pr = [...text.matchAll(/산출 진행 (\\d+)\\/(\\d+)/g)];
  var frac = 0;
  if(pr.length){ var p = pr[pr.length-1]; frac = (+p[1])/(+p[2]); }
  return Math.min(1, ((k-1) + frac) / n);
}

function poll(){
  fetch("/status").then(function(r){ return r.json(); }).then(function(s){
    var text = (s.log || []).join("\\n");
    var logEl = document.getElementById("log");
    var atBottom = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 30;
    logEl.textContent = text;
    if(atBottom) logEl.scrollTop = logEl.scrollHeight;

    var p = progress(text, s.finished);
    document.getElementById("barfill").style.width = Math.round(p*100)+"%";

    var cond = [...text.matchAll(/\\[조건 (\\d+)\\/(\\d+)\\]/g)];
    var cn = cond.length ? ("조건 "+cond[cond.length-1][1]+"/"+cond[cond.length-1][2]) : "";

    if(s.running){
      setRunning(true);
      document.getElementById("statusline").textContent = "수집 중…  "+cn;
      setTimeout(poll, 1000);
    } else if(s.finished){
      polling = false;
      setRunning(false);
      document.getElementById("statusline").textContent = "완료";
      document.getElementById("barfill").style.width = "100%";
      showResult(s.result);
    } else {
      polling = false;
      setRunning(false);
      document.getElementById("statusline").textContent = "대기 중";
    }
  }).catch(function(){ setTimeout(poll, 1500); });
}

function showResult(res){
  var el = document.getElementById("result");
  if(!res){ el.className = "result"; return; }
  if(res.ok){
    el.className = "result ok";
    el.innerHTML = "✅ 수집 완료 — 특약 "+(res.rows||0)+"행 / 상품·조건 "+(res.products||0)+"건<br>"+
      "<button type='button' onclick='openFolder()'>결과 폴더 열기</button>"+
      "<a href='/download'>엑셀 다운로드</a>";
  } else {
    el.className = "result err";
    el.textContent = "❌ 실패 — " + (res.error || "원인 미상. 로그를 확인하세요.");
  }
}

function openFolder(){
  fetch("/open", {method:"POST"}).then(function(r){ return r.json(); })
  .then(function(j){ if(!j.ok) alert("폴더 열기 실패: "+(j.error||"")); });
}

addRow("남", 40, "100세", "20년");
addRow("여", 50, "100세", "20년");
poll();   // 페이지를 새로 열어도 진행 중이면 이어서 표시
</script>
</body>
</html>
"""
