@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-DouK.ps1"
if errorlevel 1 pause
