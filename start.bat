@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
  py -3 start.py
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo 请先安装 Python 3.10 或更新版本：https://www.python.org/downloads/
  ) else (
    python start.py
  )
)
pause
