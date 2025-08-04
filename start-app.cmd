@echo off
cls
echo ========================================
echo    Task Manager 2025 - Starting...
echo ========================================
echo.

:: בדיקת Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit
)

echo Node.js is installed
echo.

:: מעבר לתיקייה
cd /d %~dp0

:: בדיקת תלויות
if not exist node_modules (
    echo Installing dependencies...
    npm install
    echo.
)

echo Starting server in background
start /b cmd /c "node server.js >nul 2>&1"

echo Waiting for server to start...
ping 127.0.0.1 -n 2 >nul

:: הפעלת הדפדפן
echo Opening browser...
ping 127.0.0.1 -n 3 >nul
start http://localhost:10000

:: הפעלת השרת
echo.
echo Starting server...
echo Press Ctrl+C to stop
echo.
node server.js

ing 172.0.0.1 -n 1 >nul
exit
