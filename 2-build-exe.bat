@echo off
setlocal EnableExtensions
title Folder Tree Maker - Build EXE
cd /d "%~dp0"

echo ==================================================
echo   Folder Tree Maker - build the EXE files
echo ==================================================
echo.

rem ---------- 1) Node.js must exist ----------
where node >nul 2>nul
if errorlevel 1 goto :no_node
where npm >nul 2>nul
if errorlevel 1 goto :no_node

for /f "tokens=1 delims=v." %%a in ('node -v') do set "NODE_MAJOR=%%a"
if %NODE_MAJOR% LSS 20 goto :old_node

rem ---------- 2) Install libraries (only when missing) ----------
if exist "node_modules\.bin\electron-builder.cmd" if exist "node_modules\electron\dist\electron.exe" goto :build

echo [1/2] Installing libraries. The first time needs internet and takes a few minutes...
echo.
call npm install --no-fund
if errorlevel 1 goto :install_failed
echo.

:build
rem No code-signing certificate is used, so do not go looking for one.
set "CSC_IDENTITY_AUTO_DISCOVERY=false"

echo [2/2] Building: installer and portable EXE. Please wait...
echo.
call npm run dist
if not errorlevel 1 goto :done

echo.
echo First attempt failed. Trying again in compatibility mode...
echo.
call npm run dist:safe
if errorlevel 1 goto :build_failed

:done
echo.
echo ==================================================
echo   Done. Your files are in the "dist" folder:
echo     FolderTreeMaker-Setup-x.x.x.exe     (installer)
echo     FolderTreeMaker-Portable-x.x.x.exe  (no install)
echo ==================================================
if exist "dist" start "" "%~dp0dist"
pause
exit /b 0

:no_node
echo Node.js is not installed on this computer.
echo Install the LTS version from https://nodejs.org/en/download
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
echo and run this file again.
pause
exit /b 1

:build_failed
echo.
echo [ERROR] The build failed. Read the lines above.
echo Tip: close any running copy of the program, then try again.
pause
exit /b 1
