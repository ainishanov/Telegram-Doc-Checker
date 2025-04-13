@echo off
echo Запуск Telegram Doc Checker бота в производственном режиме...
echo Останавливаем ранее запущенные экземпляры бота...
taskkill /F /IM node.exe 2>nul
echo Запускаем новый экземпляр бота...

REM Установка переменных окружения для production режима
set NODE_ENV=production

REM Запуск приложения
node src/index.js
pause 