@echo off
REM KB 보험료 수집기 — 실행 런처 (Windows)
REM 더블클릭하면: 최초 1회는 실행 환경을 준비하고, 그 다음부터는 바로 앱을 띄운다.
REM 이 PC 에 파이썬이 설치돼 있어야 한다(라이브러리는 이 파일이 자동 설치).
chcp 65001 >nul
cd /d "%~dp0"
title KB 보험료 수집기

echo ============================================
echo   KB 보험료 수집기
echo ============================================
echo.

python --version >nul 2>&1
if errorlevel 1 goto NOPYTHON

if exist ".venv\.ready" goto RUN

echo [최초 실행] 실행 환경을 준비합니다. 몇 분 걸릴 수 있습니다...
echo.
python -m venv .venv
if errorlevel 1 goto VENVFAIL
call ".venv\Scripts\activate.bat"
python -m pip install --upgrade pip
pip install -r requirements.txt
if errorlevel 1 goto PIPFAIL
echo ready>".venv\.ready"
echo.
echo [준비 완료]
echo.
goto LAUNCH

:RUN
call ".venv\Scripts\activate.bat"

:LAUNCH
echo 잠시 후 브라우저에서 화면이 열립니다. 이 검은 창은 닫지 마세요.
echo (작업을 마치려면 화면의 '종료' 버튼을 누르세요.)
echo.
python app.py
goto END

:NOPYTHON
echo [오류] 이 PC 에 파이썬이 설치돼 있지 않습니다.
echo.
echo   https://www.python.org/downloads/  에서 파이썬을 내려받아 설치하세요.
echo   설치 첫 화면에서 'Add python.exe to PATH' 를 꼭 체크하세요.
echo   설치 후 이 파일을 다시 더블클릭하면 됩니다.
goto END

:VENVFAIL
echo [오류] 가상환경(.venv) 생성에 실패했습니다. 파이썬 설치 상태를 확인하세요.
goto END

:PIPFAIL
echo [오류] 라이브러리 설치에 실패했습니다.
echo   인터넷 연결을 확인하고, .venv 폴더를 삭제한 뒤 다시 실행하세요.
goto END

:END
echo.
pause
