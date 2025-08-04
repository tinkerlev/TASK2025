@echo off
setlocal enabledelayedexpansion

:: הגדרת כותרת החלון
title Task Manager 2025

:: הצגת לוגו
echo ========================================
echo    Task Manager 2025 - Starting...
echo ========================================
echo.

:: בדיקה אם Node.js מותקן
where node >nul 2>nul
if !errorlevel! neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: הצגת גרסת Node.js
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo [OK] Node.js !NODE_VERSION! detected
echo.

:: מעבר לתיקיית הפרויקט
cd /d "%~dp0"

:: בדיקה והתקנת תלויות
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if !errorlevel! neq 0 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed
    echo.
)

:: יצירת תיקיית config אם לא קיימת
if not exist "config" mkdir config

:: שמירת זמן הפעלה אחרון
echo {"lastRun": "%date% %time%"} > config\last-run.json

:: הגדרת פורט
set PORT=10000
if not "%1"=="" set PORT=%1

:: פתיחת הדפדפן אחרי 3 שניות
echo Opening browser...
start /b cmd /c "timeout /t 3 >nul && start http://localhost:!PORT!"

:: הצגת הודעות
echo.
echo Server starting on port !PORT!...
echo Press Ctrl+C to stop the server
echo.

:: הפעלת השרת
node server.js --port !PORT!

:: במקרה של יציאה
echo.
echo Server stopped.
pause
