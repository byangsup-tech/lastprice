"""KB 보험료 수집기 — 실행 진입점 (.exe 패키징 대상).

로컬 Flask 서버를 띄우고 기본 브라우저로 UI 페이지를 자동으로 연다.
개발 중 실행: python app.py
"""
from __future__ import annotations

import sys
import threading
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.webapp import app

HOST, PORT = "127.0.0.1", 8765


def main() -> None:
    url = f"http://{HOST}:{PORT}/"
    print("=" * 50)
    print("  KB 보험료 수집기")
    print(f"  브라우저에서 자동으로 열립니다 → {url}")
    print("  이 창을 닫으면 프로그램이 종료됩니다.")
    print("=" * 50)
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    try:
        app.run(host=HOST, port=PORT, threaded=True)
    except OSError as e:
        print(f"\n서버 시작 실패 (포트 {PORT} 가 이미 사용 중일 수 있습니다): {e}")
        input("Enter 키를 누르면 종료합니다… ")


if __name__ == "__main__":
    main()
