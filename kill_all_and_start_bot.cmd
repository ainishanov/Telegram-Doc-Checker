@echo off
chcp 65001 >nul

cls
echo =====================================================
echo    Telegram Doc Checker - Полная перезагрузка бота
echo =====================================================
echo.
echo [1/5] Поиск и остановка всех процессов Node.js...
taskkill /F /IM node.exe /T 2>nul
timeout /t 3 /nobreak >nul
echo.

echo [2/5] Дополнительная проверка процессов...
tasklist /FI "IMAGENAME eq node.exe" 2>nul | find /i "node.exe" >nul
if not errorlevel 1 (
    echo Обнаружены активные процессы Node.js! Принудительное завершение всех процессов...
    taskkill /F /IM node.exe 2>nul
    timeout /t 3 /nobreak >nul
    
    echo Проверка повторно...
    tasklist /FI "IMAGENAME eq node.exe" 2>nul | find /i "node.exe" >nul
    if not errorlevel 1 (
        echo ВНИМАНИЕ! Не удалось завершить все процессы Node.js.
        echo Пожалуйста, закройте их вручную через диспетчер задач.
        echo Нажмите любую клавишу после ручного завершения процессов...
        pause >nul
    )
)
echo Все процессы Node.js остановлены.
echo.

echo [3/5] Очистка временных файлов...
if exist temp\* (
    del /F /Q temp\* 2>nul
    echo Временные файлы очищены.
)
echo.

echo [4/5] Установка режима production...
set NODE_ENV=production

echo [5/5] Запуск бота в производственном режиме...
echo.
echo =====================================================
echo    БОТ ЗАПУЩЕН! Нажмите Ctrl+C для остановки
echo =====================================================
echo.

node src/index.js
echo.
echo Бот остановлен. Нажмите любую клавишу для выхода...
pause >nul 