@echo off
setlocal
cd /d "%~dp0"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\yerel-site.ps1" -Eylem durdur
if errorlevel 1 (
  echo.
  echo Site kapatilamadi. Hata ayrintisi icin bu pencereyi inceleyin.
  pause
)
