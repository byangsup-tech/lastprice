# -*- mode: python ; coding: utf-8 -*-
# KB 보험료 수집기 — PyInstaller 스펙.
# 빌드: build.bat (Windows) 또는 .github/workflows 의 build-app (Windows·macOS).
#       pyinstaller kb_collector.spec --noconfirm --clean
#
# 시스템에 설치된 Chrome 을 쓰므로 Chromium 은 번들하지 않는다(playwright
# 패키지의 driver 만 collect_all 로 포함). macOS 에서는 .app 번들도 생성.

import sys

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

# macOS 에서는 더블클릭 가능한 .app 번들로 한 번 더 감싼다.
if sys.platform == "darwin":
    app_bundle = BUNDLE(
        coll,
        name="KBInsuranceCollector.app",
        bundle_identifier="com.kbinsurance.collector",
    )
