@echo off
cd /d "%~dp0"
node src\print-done-titles.js
set "EXPORT_EXIT=%ERRORLEVEL%"
echo.
pause
exit /b %EXPORT_EXIT%
