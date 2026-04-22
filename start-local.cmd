@echo off
REM FIRE Calculator — local launcher (Windows)
REM Starts a local HTTP server + opens the dashboard.
REM Required because ES modules don't load from file:// in Chrome/Edge.
REM (See Principle V / feature 005 CLOSEOUT for context.)

cd /d "%~dp0"

REM Pick a free port. Changed from 8000 (common conflict) to 8765.
set PORT=8765

echo.
echo ========================================
echo   FIRE Calculator — local dev server
echo ========================================
echo   http://localhost:%PORT%/FIRE-Dashboard.html         (RR)
echo   http://localhost:%PORT%/FIRE-Dashboard-Generic.html (Generic)
echo.
echo   Press Ctrl+C to stop the server.
echo ========================================
echo.

REM Open the RR dashboard in the default browser AFTER a short delay so the
REM server has time to bind the port.
start "" /B cmd /c "timeout /t 1 /nobreak >nul & start http://localhost:%PORT%/FIRE-Dashboard.html"

REM Run the server (blocks until Ctrl+C).
python -m http.server %PORT%
