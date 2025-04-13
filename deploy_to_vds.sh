#!/bin/bash

# Скрипт для деплоя бота на VDS сервер
# Использование: ./deploy_to_vds.sh user@your_server_ip

if [ $# -eq 0 ]; then
    echo "Использование: ./deploy_to_vds.sh user@your_server_ip [порт]"
    exit 1
fi

SERVER=$1
PORT=${2:-22}
APP_DIR="/home/$(echo $SERVER | cut -d@ -f1)/bots/telegram-doc-checker"

echo "Подготовка к деплою на $SERVER..."

# Создаем архив
echo "Создание архива проекта..."
npm run build 2>/dev/null || echo "Сборка не требуется"
git archive --format=tar.gz -o deploy_package.tar.gz HEAD || tar -czf deploy_package.tar.gz --exclude=node_modules --exclude=.git --exclude=temp --exclude=data .

# Копируем на сервер
echo "Копирование архива на сервер..."
scp -P $PORT deploy_package.tar.gz $SERVER:~/ || { echo "Ошибка при копировании файлов"; exit 1; }

# Выполняем установку на сервере
echo "Установка на сервере..."
ssh -p $PORT $SERVER << EOF
  echo "Создание директорий..."
  mkdir -p $APP_DIR/data $APP_DIR/temp
  
  echo "Распаковка архива..."
  tar -xzf ~/deploy_package.tar.gz -C $APP_DIR
  
  echo "Установка зависимостей..."
  cd $APP_DIR
  npm install --production
  
  echo "Создание .env файла, если он не существует..."
  if [ ! -f "$APP_DIR/.env" ]; then
    cp .env.example .env
    echo "Создан .env файл из примера. Не забудьте обновить значения переменных!"
  fi
  
  echo "Настройка PM2..."
  if ! command -v pm2 &> /dev/null; then
    echo "Установка PM2..."
    npm install -g pm2
  fi
  
  echo "Запуск бота через PM2..."
  pm2 describe telegram-doc-checker > /dev/null
  if [ \$? -eq 0 ]; then
    echo "Перезапуск существующего процесса..."
    pm2 reload telegram-doc-checker
  else
    echo "Создание нового процесса..."
    pm2 start src/index.js --name telegram-doc-checker
  fi
  
  echo "Настройка автозапуска..."
  pm2 startup
  pm2 save
  
  echo "Удаление временных файлов..."
  rm ~/deploy_package.tar.gz
EOF

echo "Удаление локального архива..."
rm deploy_package.tar.gz

echo "Деплой завершен!"
echo "Проверьте логи командой: ssh -p $PORT $SERVER 'pm2 logs telegram-doc-checker'"
echo "Для проверки статуса: ssh -p $PORT $SERVER 'pm2 status'" 