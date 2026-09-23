# -*- mode: python ; coding: utf-8 -*-
import os

# 所有路径基于本 spec 所在目录解析（SPECPATH 由 PyInstaller 在构建时注入），
# 不再写死任何本机绝对路径，换台机器 / 换个目录 clone 都能直接构建。
SPEC_DIR = os.path.abspath(SPECPATH)
APP_ROOT = os.path.normpath(os.path.join(SPEC_DIR, os.pardir))

a = Analysis(
    [os.path.join(SPEC_DIR, '_stub.py')],
    pathex=[SPEC_DIR],
    binaries=[],
    datas=[],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='paperflow',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=[os.path.join(APP_ROOT, 'assets', 'paperflow.ico')],
)
