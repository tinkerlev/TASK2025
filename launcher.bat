@echo off
tasklist /FI "IMAGENAME eq task-manager.exe" 2>NUL | find /I /N "task-manager.exe">NUL
if "%ERRORLEVEL%"=="1" (
    start "" /b "task-manager.exe"
    timeout /t 3 /nobreak > NUL
)
start http://127.0.0.1:10000
exit