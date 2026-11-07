@echo off
cd /d "%~dp0"
node src\cli.js %*
set "WORKER_EXIT=%ERRORLEVEL%"
echo.
echo Exit code: %WORKER_EXIT%
pause
exit /b %WORKER_EXIT%
