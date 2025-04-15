const express = require('express');
const config = require('./config/config');

console.log('--- Запуск УПРОЩЕННОЙ версии для теста ---');

const app = express();
const port = process.env.PORT || 3000;

try {
  // Проверка статуса
  app.get('/status', (req, res) => {
    console.log('Запрос /status получен');
    res.json({
      status: 'ok_simple',
      timestamp: new Date().toISOString()
    });
  });

  // Обработчик webhook (просто логируем)
  app.post(`/webhook/${config.telegramToken}`, (req, res) => {
    console.log('!!! Webhook POST запрос получен !!!');
    res.sendStatus(200); // Просто отвечаем OK
  });

  // Корневой маршрут
  app.get('/', (req, res) => {
    console.log('Запрос / получен');
    res.send('Упрощенный бот активен (только /status и webhook)');
  });

  app.listen(port, () => {
    console.log(`Упрощенный сервер запущен на порту ${port}`);
    console.log(`Webhook должен быть настроен на /webhook/${config.telegramToken}`);
  });

} catch (error) {
  console.error('--- КРИТИЧЕСКАЯ ОШИБКА ПРИ ЗАПУСКЕ EXPRESS ---');
  console.error(error);
  process.exit(1); // Завершаем процесс при ошибке запуска сервера
}

// Добавляем обработчики для отлова необработанных ошибок
process.on('uncaughtException', (error, origin) => {
  console.error('--- НЕОБРАБОТАННОЕ ИСКЛЮЧЕНИЕ ---');
  console.error(error);
  console.error('Источник:', origin);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('--- НЕОБРАБОТАННЫЙ REJECTION ПРОМИСА ---');
  console.error('Причина:', reason);
  console.error('Промис:', promise);
  process.exit(1);
});

console.log('--- Упрощенная версия настроена, ожидание запуска сервера ---'); 