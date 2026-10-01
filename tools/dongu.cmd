@echo off
REM ============================================================
REM  dongu.cmd - Gunluk link tarama dongusu icin Windows sarmalayici
REM  Zamanlayici bu dosyayi cagirir (saatte bir); karar ve is
REM  tools\gunluk-dongu.mjs icindedir. Kurulum: docs/09 -> "Otomatik dongu".
REM ============================================================
setlocal
cd /d "%~dp0.."

if not exist "tools\rapor" mkdir "tools\rapor"
echo.>> "tools\rapor\gunluk-dongu.log"
echo [%DATE% %TIME%] dongu basladi>> "tools\rapor\gunluk-dongu.log"

node --no-warnings tools\gunluk-dongu.mjs %* >> "tools\rapor\gunluk-dongu.log" 2>&1
set KOD=%ERRORLEVEL%

echo [%DATE% %TIME%] dongu bitti - cikis kodu %KOD%>> "tools\rapor\gunluk-dongu.log"
exit /b %KOD%
