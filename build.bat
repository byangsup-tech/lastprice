@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   KB 보험료 수집기 - .exe 빌드
echo ============================================
echo.
if not exist ".venv\Scripts\activate.bat" goto NOVENV
call .venv\Scripts\activate.bat
echo - 의존성 설치 중...
pip install -r requirements.txt
pip install pyinstaller
echo.
echo - 패키징 중입니다. 수 분 걸립니다...
pyinstaller kb_collector.spec --noconfirm --clean
echo.
if exist "dist\KBInsuranceCollector\KBInsuranceCollector.exe" goto DONE
echo [실패] 빌드 산출물이 없습니다. 위 로그를 확인하세요.
echo.
pause
exit /b 1

:DONE
echo [완료] dist\KBInsuranceCollector\KBInsuranceCollector.exe
echo   KBInsuranceCollector 폴더를 통째로 옮겨 .exe 를 더블클릭하면 실행됩니다.
echo   대상 PC 에는 Chrome 설치와 KB 접속 가능한 망이 필요합니다.
echo.
pause
exit /b 0

:NOVENV
echo [오류] .venv 가 없습니다. python -m venv .venv 로 가상환경을 먼저 만드세요.
pause
exit /b 1
