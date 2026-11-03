@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "PATH=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;%PATH%"
set "LAB_PNPM=pnpm"
where pnpm >nul 2>nul
if errorlevel 1 set "LAB_PNPM=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"
if not exist ".env" copy ".env.example" ".env" >nul
if not exist "node_modules\next" (
  call "%LAB_PNPM%" install --frozen-lockfile
  if errorlevel 1 goto failed
)
call "%LAB_PNPM%" setup
if errorlevel 1 goto failed
echo.
echo 浏览器打开 http://127.0.0.1:3000 即可使用。关闭此窗口会停止服务。
call "%LAB_PNPM%" dev
goto end
:failed
echo 启动未完成，请查看上方提示和 README.md。
pause
:end
endlocal
