@echo off
cls
echo =====================================================
echo    Telegram Doc Checker - Перезапуск бота
echo =====================================================
echo.
echo [1/4] Поиск и остановка всех процессов Node.js...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul
echo.

echo [2/4] Проверка остановленных процессов...
tasklist /FI "IMAGENAME eq node.exe" 2>nul | find /i "node.exe" >nul
if not errorlevel 1 (
    echo Обнаружены активные процессы Node.js! Повторная попытка завершения...
    taskkill /F /IM node.exe /T 2>nul
    timeout /t 2 /nobreak >nul
)
echo Все процессы Node.js остановлены.
echo.

echo [3/4] Установка режима production...
set NODE_ENV=production

echo [4/4] Запуск бота в производственном режиме...
echo.
echo =====================================================
echo    БОТ ЗАПУЩЕН! Нажмите Ctrl+C для остановки
echo =====================================================
echo.

node src/index.js
echo.
echo Бот остановлен. Нажмите любую клавишу для выхода...
pause >nul 