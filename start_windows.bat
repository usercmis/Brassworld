@echo off
cd /d "%~dp0"
echo Open http://localhost:3000 in your browser after the server starts.
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 serve.py
) else (
  python serve.py
)
pause
