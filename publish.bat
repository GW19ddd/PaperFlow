@echo off
chcp 65001>nul 2>&1
setlocal enabledelayedexpansion

REM ==========================================================
REM  PaperFlow 一键打包发布脚本
REM  用法:
REM    publish.bat              -> 同步代码 + 打包 + 上传到最新 tag 的 Release
REM    publish.bat 1.0.0        -> 指定版本号（tag 须为 v1.0.0）
REM    publish.bat --local      -> 只打包，不上传（本地验证用）
REM  打包源（自动选择）:
REM    1) %USERPROFILE%\Desktop\paperflow-desktop-win   桌面副本（含运行时，只同步代码）
REM    2) 仓库工作副本          桌面副本不存在时自动改用，挑选运行时/代码/启动脚本构建
REM  前置条件: 已安装 GitHub CLI (gh) 并登录
REM ==========================================================

set "REPO=%~dp0"
set "TARGET=%USERPROFILE%\Desktop\paperflow-desktop-win"
set "RELEASE_DIR=%REPO%.release"
set "UPLOAD=1"
set "SYNC=1"

REM ---- 解析参数 ----
set "VER=%~1"
if /i "%VER%"=="--local" (
    set "UPLOAD=0"
    set "VER="
)
if "%VER%"=="" (
    for /f %%v in ('git -C "%REPO%" describe --tags --abbrev=0 2^>nul') do set "VER=%%v"
)
if "%VER%"=="" set "VER=1.0.0"
set "VER=%VER:v=%"
set "TAG=v%VER%"
set "STAGE=%RELEASE_DIR%\paperflow-desktop-win-v%VER%"
set "ZIP=%RELEASE_DIR%\paperflow-desktop-win-v%VER%.zip"

echo ============================================
echo  PaperFlow 发布工具  v%VER%
echo ============================================

REM ---- 0. 校验 & 选择打包源 ----
where gh >nul 2>&1 || (echo [错误] 未找到 GitHub CLI，请先安装: winget install GitHub.cli && pause && exit /b 1)
if not exist "%TARGET%" (
    echo [提示] 桌面副本不存在: %TARGET%
    echo        改用仓库工作副本作为打包源
    set "TARGET=%REPO%"
    set "SYNC=0"
)

REM ---- 1. 同步代码（仅桌面副本模式需要）----
if "%SYNC%"=="1" (
    echo [1/4] 同步代码到桌面副本...
    robocopy "%REPO%ui" "%TARGET%ui" /E /XD __pycache__ /NFL /NDL /NJH /NJS
    if !errorlevel! GEQ 8 (echo [错误] 同步 ui 代码失败 && pause && exit /b 1)
    robocopy "%REPO%core\site-packages\pdf2zh" "%TARGET%core\site-packages\pdf2zh" /E /XD __pycache__ /NFL /NDL /NJH /NJS
    if !errorlevel! GEQ 8 (echo [错误] 同步 pdf2zh 代码失败 && pause && exit /b 1)
    robocopy "%REPO%assets" "%TARGET%assets" /E /NFL /NDL /NJH /NJS
    if !errorlevel! GEQ 8 (echo [错误] 同步 assets 失败 && pause && exit /b 1)
    copy /Y "%REPO%_launcher.py" "%TARGET%_launcher.py" >nul
    copy /Y "%REPO%install.bat" "%TARGET%install.bat" >nul
    copy /Y "%REPO%paperflow.bat" "%TARGET%paperflow.bat" >nul
    copy /Y "%REPO%README.md" "%TARGET%README.md" >nul
    copy /Y "%REPO%README_EN.md" "%TARGET%README_EN.md" >nul
    copy /Y "%REPO%updates.json" "%TARGET%updates.json" >nul
    echo        完成
) else (
    echo [1/4] 打包源=仓库工作副本，跳过同步
)

REM ---- 2. 打包 zip ----
echo [2/4] 打包 zip（首次约 2-5 分钟）...
if not exist "%RELEASE_DIR%" mkdir "%RELEASE_DIR%"
if "%SYNC%"=="1" (
    if not exist "%STAGE%" (
        mklink /J "%STAGE%" "%TARGET%" >nul || (echo [错误] 创建 junction 失败 && pause && exit /b 1)
    )
) else (
    echo        从工作副本构建打包目录...
    for %%D in (core ui assets) do (
        robocopy "%REPO%%%D" "%STAGE%\%%D" /E /XD __pycache__ /NFL /NDL /NJH /NJS
        if !errorlevel! GEQ 8 (echo [错误] 复制 %%D 失败 && pause && exit /b 1)
    )
    for %%F in (_launcher.py install.bat uninstall.bat debug_start.bat diagnostic.bat config_manager.bat module_manager.bat paperflow.bat paperflow.vbs paperflow.exe VC_redist.x64.exe README.md README_EN.md INSTALL.md updates.json supporters.txt) do (
        if exist "%REPO%%%F" copy /Y "%REPO%%%F" "%STAGE%\%%F" >nul
    )
)
if exist "%ZIP%" del /Q "%ZIP%"
tar -a -c -f "%ZIP%" ^
    --exclude="logs" --exclude="paperflow_files" --exclude="pdf2zh_files" ^
    --exclude="__pycache__" --exclude="*.pyc" --exclude="*.sqlite" --exclude="*.db" --exclude=".vs" ^
    -C "%RELEASE_DIR%" paperflow-desktop-win-v%VER%
if errorlevel 1 (echo [错误] 打包失败 && pause && exit /b 1)
echo        完成: %ZIP%

REM ---- 3. 上传 Release ----
if "%UPLOAD%"=="0" (
    echo [3/4] 已跳过上传（--local 模式）
    echo [4/4] 全部完成! 本地包: %ZIP%
    pause
    exit /b 0
)
echo [3/4] 上传到 GitHub Release %TAG%...
gh release upload %TAG% "%ZIP%" --clobber
if errorlevel 1 (echo [错误] 上传失败，请检查 Release %TAG% 是否存在 && pause && exit /b 1)
echo [4/4] 全部完成!
echo         在线地址: https://github.com/GW19ddd/PaperFlow/releases/tag/%TAG%
pause
exit /b 0
