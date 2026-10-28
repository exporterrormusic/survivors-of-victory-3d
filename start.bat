@echo off
setlocal
cd /d "%~dp0"
title NIKKE - Development Server

where node.exe >nul 2>&1
if errorlevel 1 goto missing_node
where npm.cmd >nul 2>&1
if errorlevel 1 goto missing_node

rem Reuse this game's server when it is already running on localhost.
powershell.exe -NoProfile -Command "try { $response = Invoke-WebRequest 'http://localhost:5173/src/app.ts' -UseBasicParsing -TimeoutSec 3; if ($response.StatusCode -eq 200 -and $response.Content.Contains('NIKKE front end')) { exit 0 } } catch {}; exit 1" >nul 2>&1
if not errorlevel 1 (
  start "" "http://localhost:5173/"
  exit /b 0
)

if not exist "node_modules\vite\bin\vite.js" (
  echo Installing project dependencies...
  call npm.cmd ci
  if errorlevel 1 goto failed
)

echo Starting http://localhost:5173/
echo Keep this window open. Press Ctrl+C to stop the server.
call npm.cmd run dev -- --host localhost --port 5173 --strictPort --open
if errorlevel 1 goto failed
exit /b 0

:missing_node
echo Node.js and npm are required. Install Node.js, then run start.bat again.
pause
exit /b 1

:failed
echo.
echo Startup failed. See the error above. If port 5173 is occupied, close its old server first.
pause
exit /b 1
