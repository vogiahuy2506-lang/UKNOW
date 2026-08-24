@echo off
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0prepare-commit-msg.ps1" %*
