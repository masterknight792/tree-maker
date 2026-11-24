@echo off
setlocal EnableExtensions
title Folder Tree Maker - Install libraries and run
cd /d "%~dp0"

echo ==================================================
echo   Folder Tree Maker - install libraries and run
echo ==================================================
echo.

rem ---------- 1) Node.js must exist ----------
where node >nul 2>nul
if errorlevel 1 goto :no_node
where npm >nul 2>nul
if errorlevel 1 goto :no_node

for /f "tokens=1 delims=v." %%a in ('node -v') do set "NODE_MAJOR=%%a"
if %NODE_MAJOR% LSS 20 goto :old_node

echo Node.js found:
node -v
echo.

rem ---------- 2) Install libraries (only when missing) ----------
if exist "node_modules\.bin\electron.cmd" if exist "node_modules\electron\dist\electron.exe" goto :run

echo [1/2] Installing libraries. The first time needs internet and takes a few minutes...
echo.
call npm install --no-fund
if errorlevel 1 goto :install_failed
echo.

:run
echo [2/2] Starting the program...
call npm start
if errorlevel 1 goto :run_failed
exit /b 0

:no_node
echo Node.js is not installed on this computer.
echo.
where winget >nul 2>nul
if errorlevel 1 goto :open_site
choice /c YN /m "Install Node.js LTS automatically now"
if errorlevel 2 goto :open_site
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
echo.
echo Done. Close this window and run this file again.
pause
exit /b 1

:open_site
echo Opening the Node.js download page. Install the LTS version,
echo then run this file again.
start "" "https://nodejs.org/en/download"
pause
exit /b 1

:old_node
echo Your Node.js is too old. Install the current LTS version from
echo https://nodejs.org/en/download then run this file again.
start "" "https://nodejs.org/en/download"
pause
exit /b 1

:install_failed
echo.
echo [ERROR] Installing the libraries failed. Check your internet connection
echo and run this file again. If it keeps failing, delete the folder
echo "node_modules" and try once more.
pause
exit /b 1

:run_failed
echo.
echo [ERROR] The program stopped with an error. Read the lines above.
pause
exit /b 1
