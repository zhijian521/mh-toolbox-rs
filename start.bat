@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title 梦幻养老助手 · 开发启动

rem ============================================================
rem  梦幻养老助手（Rust 版）· 开发启动脚本
rem
rem  用法：
rem    start.bat            普通启动
rem    start.bat debug      启动并开 CDP 9222（供 e2e / 实拍）
rem    start.bat --check    只做环境自检，不启动
rem    start.bat --force    端口被占时直接清掉，不询问
rem
rem  ------------------------------------------------------------
rem  【本文件必须保存为 GBK(936) 编码 + CRLF 换行】
rem  用 UTF-8 保存时 cmd 会按双字节切行，中文注释被拆成命令，
rem  报「xxx 不是内部或外部命令」，且报错位置与真实问题无关。
rem  用 VSCode 编辑请确认右下角是 GB 2312 与 CRLF。
rem  ------------------------------------------------------------
rem
rem  为什么需要这个脚本：本机直接 npm run desktop 会链接失败。
rem    1. vcvars64.bat 依赖 reg.exe，被安全策略拦，LIB 补不全 →
rem       报 LNK1181: 无法打开 kernel32.lib；
rem    2. Git Bash 自带的 usr/bin/link.exe 是 Unix 的 link，
rem       会抢在 MSVC 链接器前面被调用。
rem  所以这里手动把 MSVC 的 bin 放到 PATH 最前、把 LIB 写全。
rem ============================================================

set "CHECK_ONLY=0"
set "USE_DEBUG_PORT=0"
set "FORCE=0"

rem 逐个别名判断，不用 for %%a in (%*)：无参数时那个空列表容易出岔子。
if /i "%~1"=="debug" set "USE_DEBUG_PORT=1"
if /i "%~1"=="--debug" set "USE_DEBUG_PORT=1"
if /i "%~1"=="--check" set "CHECK_ONLY=1"
if /i "%~1"=="--force" set "FORCE=1"
if /i "%~2"=="debug" set "USE_DEBUG_PORT=1"
if /i "%~2"=="--debug" set "USE_DEBUG_PORT=1"
if /i "%~2"=="--check" set "CHECK_ONLY=1"
if /i "%~2"=="--force" set "FORCE=1"

echo.
echo   梦幻养老助手  ^(Rust 版^)  ·  开发启动
echo   ---------------------------------------------
echo.

rem ------------------------------------------------------------
rem  1. 定位 MSVC 与 Windows SDK
rem     不写死版本号：装了新 BuildTools 或新 SDK 之后脚本仍然可用。
rem     用一串 if exist 而不是 for 列表——路径里的 (x86) 括号
rem     放进 for 的括号列表容易被 cmd 解析错。
rem ------------------------------------------------------------
set "PF86=%ProgramFiles(x86)%"
set "PF=%ProgramFiles%"
set "MSVC_ROOT="

if not defined MSVC_ROOT if exist "%PF86%\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC" set "MSVC_ROOT=%PF86%\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC"
if not defined MSVC_ROOT if exist "%PF%\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC" set "MSVC_ROOT=%PF%\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC"
if not defined MSVC_ROOT if exist "%PF%\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC" set "MSVC_ROOT=%PF%\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC"
if not defined MSVC_ROOT if exist "%PF%\Microsoft Visual Studio\2022\Professional\VC\Tools\MSVC" set "MSVC_ROOT=%PF%\Microsoft Visual Studio\2022\Professional\VC\Tools\MSVC"
if not defined MSVC_ROOT if exist "%PF%\Microsoft Visual Studio\2022\Enterprise\VC\Tools\MSVC" set "MSVC_ROOT=%PF%\Microsoft Visual Studio\2022\Enterprise\VC\Tools\MSVC"
if not defined MSVC_ROOT goto :no_msvc

rem 版本目录名形如 14.44.35207，倒序排列取第一个即最新。
set "MSVC_VER="
for /f "delims=" %%v in ('dir /b /ad /o-n "%MSVC_ROOT%" 2^>nul') do if not defined MSVC_VER set "MSVC_VER=%%v"
if not defined MSVC_VER goto :no_msvc

set "MSVC_DIR=%MSVC_ROOT%\%MSVC_VER%"
if not exist "%MSVC_DIR%\lib\x64" goto :no_msvc
if not exist "%MSVC_DIR%\bin\Hostx64\x64" goto :no_msvc

set "SDK_LIB_ROOT=%PF86%\Windows Kits\10\Lib"
set "SDK_VER="
for /f "delims=" %%v in ('dir /b /ad /o-n "%SDK_LIB_ROOT%" 2^>nul') do if not defined SDK_VER set "SDK_VER=%%v"
if not defined SDK_VER goto :no_sdk
if not exist "%SDK_LIB_ROOT%\%SDK_VER%\um\x64" goto :no_sdk

set "LIB=%MSVC_DIR%\lib\x64;%SDK_LIB_ROOT%\%SDK_VER%\um\x64;%SDK_LIB_ROOT%\%SDK_VER%\ucrt\x64"
rem System32 要显式提到前面：从 Git Bash 里调用本脚本时，PATH 里混着 Git 的
rem usr/bin，同名的 timeout.exe 会抢在 Windows 的 timeout 前面被调用。
set "PATH=%MSVC_DIR%\bin\Hostx64\x64;%SystemRoot%\System32;%USERPROFILE%\.cargo\bin;%PATH%"

rem 并行度压到 4：本机 rustc 高并发编译时崩过 STATUS_ACCESS_VIOLATION。
set "CARGO_BUILD_JOBS=4"

echo   [环境] MSVC   %MSVC_VER%
echo   [环境] SDK    %SDK_VER%
echo   [环境] 并行度 4

rem ------------------------------------------------------------
rem  2. 依赖检查
rem ------------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 goto :no_node
where cargo >nul 2>nul
if errorlevel 1 goto :no_cargo

if not exist "node_modules\.bin" (
    echo   [依赖] node_modules 缺失，开始 npm install ...
    call npm install --no-audit --no-fund
    if errorlevel 1 goto :npm_failed
)

rem ------------------------------------------------------------
rem  3. 端口预检
rem     vite.config.ts 开了 strictPort：5173 被占时 Vite 不会换端口，
rem     而是直接退出，tauri dev 跟着失败、窗口起不来也没有明确提示。
rem     这里先把上一次残留的 node 清掉，只清 node.exe，别的进程不动。
rem     必须限定 LISTENING：TIME_WAIT 的旧连接也挂着 5173 这个地址，
rem     但它们的 PID 是 0，抓错了就会显示「被 System Idle Process 占用」。
rem ------------------------------------------------------------
set "PORT_PID="
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr /r /c:":5173 .*LISTENING"') do if not defined PORT_PID set "PORT_PID=%%p"

if not defined PORT_PID goto :port_free

rem tasklist 的 /fo csv 是逗号分隔，默认按空格切会切不开，必须指定 delims=,
set "PORT_NAME=unknown"
for /f "tokens=1 delims=," %%n in ('tasklist /fi "PID eq %PORT_PID%" /nh /fo csv 2^>nul') do set "PORT_NAME=%%~n"

echo.
echo   [端口] 5173 已被占用：%PORT_NAME% ^(PID %PORT_PID%^)
echo          大多是上次没退干净的 Vite，不处理会直接启动失败。

if "%CHECK_ONLY%"=="1" (
    echo   [端口] 自检模式，不做处理。
    goto :port_done
)

if /i not "%PORT_NAME%"=="node.exe" (
    echo   [端口] 该进程不是 node.exe，脚本不动它，请自行处理后重试。
    goto :abort
)

if "%FORCE%"=="1" goto :port_kill

choice /c YN /n /m "  结束这个进程并继续？[Y/N] "
if errorlevel 2 goto :abort

:port_kill
taskkill /PID %PORT_PID% /F >nul 2>nul
if errorlevel 1 (
    echo   [端口] 结束失败，可能需要管理员权限。
    goto :abort
)
echo   [端口] 已结束 PID %PORT_PID%
timeout /t 1 /nobreak >nul

:port_free
echo   [端口] 5173 空闲

:port_done
echo.

if "%CHECK_ONLY%"=="1" (
    echo   环境自检通过，未启动窗口。
    endlocal
    exit /b 0
)

rem ------------------------------------------------------------
rem  4. 启动
rem     MH_CDP_PORT 只有 debug 构建会读，发布版不带调试端口。
rem ------------------------------------------------------------
if "%USE_DEBUG_PORT%"=="1" (
    set "MH_CDP_PORT=9222"
    echo   [调试] CDP 端口 9222 ^(仅 debug 构建^)
    echo          连上后可用 Runtime.evaluate / Page.captureScreenshot
    echo.
)

echo   启动 Tauri 开发窗口。首次编译约 1 分钟，之后十几秒。
echo   改 src/ 下的前端文件热更新；改 src-tauri/ 下的 Rust 会自动重编译。
echo   关闭这个窗口即结束应用。
echo.

call npm run desktop
set "CODE=%ERRORLEVEL%"

if not "%CODE%"=="0" (
    echo.
    echo   启动失败，退出码 %CODE%
    pause
)
endlocal
exit /b %CODE%

rem ------------------------------------------------------------
rem  错误出口
rem ------------------------------------------------------------
:no_msvc
echo   [错误] 没找到 MSVC 的 x64 工具链。
echo          需要 Visual Studio 2022 的「使用 C++ 的桌面开发」工作负载。
echo          https://visualstudio.microsoft.com/visual-cpp-build-tools/
goto :abort

:no_sdk
echo   [错误] 没找到 Windows SDK 的 x64 库目录。
echo          在 VS Installer 里勾选 Windows 10/11 SDK 后重试。
goto :abort

:no_node
echo   [错误] PATH 里没有 node，前端起不来。
goto :abort

:no_cargo
echo   [错误] PATH 里没有 cargo，Rust 工具链未安装或未加入 PATH。
echo          cargo 一般在 %USERPROFILE%\.cargo\bin
goto :abort

:npm_failed
echo   [错误] npm install 失败，先单独跑一次看具体报错。
goto :abort

:abort
echo.
pause
endlocal
exit /b 1
