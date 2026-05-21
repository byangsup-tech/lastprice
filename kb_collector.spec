# -*- mode: python ; coding: utf-8 -*-
# KB 보험료 수집기 — PyInstaller 스펙 (Windows 에서 빌드)
# 빌드:  build.bat   또는   pyinstaller kb_collector.spec --noconfirm --clean
#
# 시스템에 설치된 Chrome 을 쓰므로 Chromium 은 번들하지 않는다(playwright
# 패키지의 driver 만 collect_all 로 포함). 산출물: dist/KB보험료수집기/.

from PyInstaller.utils.hooks import collect_all

datas, binaries, hiddenimports = [], [], []
for _pkg in ("playwright",):
    _d, _b, _h = collect_all(_pkg)
    datas += _d
    binaries += _b
    hiddenimports += _h

hiddenimports += [
    "flask", "openpyxl", "config", "tkinter", "tkinter.filedialog",
    "src.webapp", "src.runner", "src.excel_writer", "src.browser",
    "src.models", "src.scrapers.base", "src.scrapers.kb_insurance",
]

a = Analysis(
    ["app.py"],
    pathex=["."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name="KBInsuranceCollector",
    console=True,
    disable_windowed_traceback=False,
)
coll = COLLECT(
    exe, a.binaries, a.datas,
    name="KBInsuranceCollector",
)
