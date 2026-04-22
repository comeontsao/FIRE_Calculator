@echo off
REM FIRE Calculator — Generic (public) local launcher (Windows)
REM Starts a local HTTP server + opens the GENERIC dashboard.
REM Required because ES modules don't load from file:// in Chrome/Edge.
REM (See Principle V / feature 005 CLOSEOUT for context.)
REM
REM This is the launcher for the public-facing dashboard. The RR launcher
REM (start-local.cmd) uses port 8765 so you can run both side-by-side.

cd /d "%~dp0"

REM Port 8766 so this doesn't collide with start-local.cmd (RR) on 8765
REM or anything pinned to 8000.
set PORT=8766

echo.
echo ========================================
echo   FIRE Calculator — Generic (public)
echo ========================================
echo   http://localhost:%PORT%/FIRE-Dashboard-Generic.html
echo.
echo   Press Ctrl+C to stop the server.
echo ========================================
echo.

REM Open the Generic dashboard in the default browser AFTER a short delay so
REM the server has time to bind the port.
start "" /B cmd /c "timeout /t 1 /nobreak >nul & start http://localhost:%PORT%/FIRE-Dashboard-Generic.html"

REM Run the server (blocks until Ctrl+C).
python -m http.server %PORT%
