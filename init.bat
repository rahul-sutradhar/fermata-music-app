@echo off

:: 1. Always activate the local virtual environment for EVERY terminal tab
if exist "%~dp0.venv\Scripts\activate.bat" (
    call "%~dp0.venv\Scripts\activate.bat"
)

:: 2. Check if local Port 8000 is already occupied/listening
netstat -ano | findstr :8001 | findstr LISTENING >nul
if %errorlevel% equ 0 (
    :: Port is active! Skip running Uvicorn and leave a clean prompt
    goto :eof
)

:: 3. Port is completely free - fire up the development server
echo ====================================================
echo Starting Uvicorn Dev Server (.venv active)
echo ====================================================
call uvicorn app.main:app --port 8001 --reload

:eof
