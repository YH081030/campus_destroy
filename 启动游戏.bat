@echo off
chcp 65001 >nul
start "" "%~dp0index.html"
echo 已启动游戏。若未自动打开，请手动用 Chrome/Edge 打开 index.html
timeout /t 3 >nul
