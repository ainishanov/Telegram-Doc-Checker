Write-Host "Запуск Telegram Doc Checker бота..."
Write-Host "Останавливаем ранее запущенные экземпляры бота..."
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "Запускаем новый экземпляр бота..."
node src/index.js 