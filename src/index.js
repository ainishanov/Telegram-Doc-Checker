const TelegramBot = require('node-telegram-bot-api');
const config = require('./config/config');
const { 
  handleStart, 
  handleHelp, 
  handleAdminUsers, 
  handleAdminStats, 
  handleAdminCallback, 
  handleMenuCommand,
  setupPermanentMenu,
  handleAbout,
  handleActivateUser,
  handleRefundUser
} = require('./handlers/commandHandlers');
const { handleDocument, handlePartySelection, handleTextMessage, handlePhoto, handleForceContract } = require('./handlers/documentHandler');
const {
  handleShowTariff,
  handleShowPlans,
  handleTariffCallback
} = require('./handlers/planHandlers');
const express = require('express');
const dotenv = require('dotenv');
const { logEvent } = require('./utils/eventLogger');

// Проверка наличия необходимых переменных окружения
if (!config.telegramToken) {
  console.error('Не указан токен Telegram бота. Пожалуйста, задайте переменную окружения TELEGRAM_BOT_TOKEN.');
  process.exit(1);
}

// Проверка наличия API ключа Anthropic
if (!config.anthropicApiKey) {
  console.error('Не указан API ключ Anthropic. Пожалуйста, задайте переменную окружения ANTHROPIC_API_KEY.');
  process.exit(1);
}

// Создаем директории для данных и временных файлов
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../data');
const tempDir = path.join(__dirname, '../temp');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('Создана директория для данных:', dataDir);
}

if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
  console.log('Создана директория для временных файлов:', tempDir);
}

// Очищаем временную директорию при запуске
fs.readdir(tempDir, (err, files) => {
  if (err) {
    console.error('Ошибка при чтении временной директории:', err);
    return;
  }
  
  for (const file of files) {
    fs.unlink(path.join(tempDir, file), err => {
      if (err) {
        console.error('Ошибка при удалении временного файла:', err);
      }
    });
  }
  
  console.log('Временная директория очищена');
});

// Глобальное хранилище для временных данных
global.tempStorage = {
  documentAnalysis: {},
  userStates: {}
};

/**
 * Запускает бота в режиме webhook или polling в зависимости от настроек
 */
async function startBot() {
  let bot;
  
  console.log('Запуск бота в режиме webhook на Render');
  // Логируем текущий коммит (Render передаёт переменную RENDER_GIT_COMMIT)
  if (process.env.RENDER_GIT_COMMIT) {
    console.log('Commit SHA:', process.env.RENDER_GIT_COMMIT);
  }
  
  bot = new TelegramBot(config.telegramToken);
  
  // Определяем URL для webhook на Render
  // Получаем имя сервиса из Render
  const serviceName = process.env.RENDER_SERVICE_NAME || 'telegram-doc-checker';
  // Формируем URL с использованием имени сервиса, если RENDER_EXTERNAL_HOSTNAME не задан
  const renderWebhookUrl = process.env.RENDER_EXTERNAL_HOSTNAME 
    ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/webhook/${config.telegramToken}`
    : `https://${serviceName}.onrender.com/webhook/${config.telegramToken}`;
  
  try {
    console.log('Попытка установки webhook по адресу:', renderWebhookUrl);
    await bot.setWebHook(renderWebhookUrl, {
      max_connections: 40,
      drop_pending_updates: true, // Отбрасываем накопившиеся обновления
      allowed_updates: ['message', 'callback_query'] // Принимаем только сообщения и callback_query
    });
    console.log('Webhook успешно установлен:', renderWebhookUrl);
    
    // Проверим информацию о webhook
    try {
      const webhookInfo = await bot.getWebHookInfo();
      console.log('Информация о webhook:', JSON.stringify(webhookInfo));
    } catch (infoError) {
      console.error('Не удалось получить информацию о webhook:', infoError.message);
    }
  } catch (error) {
    console.error('Ошибка при установке webhook:', error);
    console.error('Детали ошибки:', error.message);
    
    // Пробуем еще раз с задержкой
    console.log('Повторная попытка установки webhook через 5 секунд...');
    setTimeout(async () => {
      try {
        await bot.setWebHook(renderWebhookUrl, {
          max_connections: 40,
          drop_pending_updates: true
        });
        console.log('Webhook успешно установлен при повторной попытке:', renderWebhookUrl);
      } catch (retryError) {
        console.error('Ошибка при повторной установке webhook:', retryError.message);
      }
    }, 5000);
    
    // Не завершаем процесс, попробуем продолжить работу
    console.log('Продолжение работы несмотря на ошибку webhook...');
  }
  
  // Создаем Express приложение для обработки webhook
  let app;
  let expressAvailable = true;
  
  try {
    app = express();
    
    // Парсим тело запроса как JSON
    app.use(express.json());
    
    // Добавляем обслуживание статических файлов
    app.use(express.static(path.join(__dirname, 'public')));
    
    // Создаем директорию для публичных файлов, если её нет
    const publicDir = path.join(__dirname, 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
      console.log('Создана директория для публичных файлов:', publicDir);
    }
    
    // Список устаревших токенов, запросы на которые следует игнорировать
    const obsoleteTokens = [
      '118279810:AAHfGqZ3NwKIDLz2vP4zOJ_v2jZgzpOFzu0' // старый токен бота, больше не используется
    ];

    app.use((req, res, next) => {
      // Если это запрос на устаревший webhook – сразу отвечаем 200 без логирования
      if (obsoleteTokens.some((t) => req.path.includes(`/webhook/${t}`))) {
        return res.sendStatus(200);
      }

      console.log(`Получен ${req.method} запрос на ${req.path}`);
      next();
    });
    
    // Обработчик webhook
    app.post(`/webhook/${config.telegramToken}`, (req, res) => {
      try {
        console.log('Получен webhook запрос:', JSON.stringify(req.body).substring(0, 200));
        
        // Проверяем, содержит ли запрос правильный формат данных
        if (!req.body || (!req.body.message && !req.body.callback_query)) {
          console.warn('Получен webhook с неверным форматом данных:', JSON.stringify(req.body));
          return res.sendStatus(200); // Всегда возвращаем 200, чтобы Telegram не пытался повторно отправить
        }
        
        // Извлекаем информацию о пользователе
        const user = req.body.message ? req.body.message.from : 
                     req.body.callback_query ? req.body.callback_query.from : null;
        
        if (user) {
          console.log(`Запрос от пользователя: ${user.first_name} ${user.last_name || ''} (${user.id})`);
        }
        
        // Немедленно возвращаем 200 OK, чтобы Telegram не ждал ответа
        res.sendStatus(200);
        
        // Обрабатываем запрос асинхронно после отправки ответа
        process.nextTick(() => {
          try {
            // Передаем обновление боту для обработки
            bot.processUpdate(req.body);
          } catch (processError) {
            console.error('Ошибка при обработке webhook запроса (асинхронно):', processError);
          }
        });
      } catch (error) {
        console.error('Ошибка при обработке webhook запроса:', error);
        res.sendStatus(200); // Всегда отвечаем 200, чтобы Telegram не повторял запрос
      }
    });

    // Простой ответ для проверки работы сервиса
    app.get('/', (req, res) => {
      res.send('Бот активен и работает в режиме webhook');
    });
    
    // Добавим дополнительный маршрут для проверки
    app.get('/status', (req, res) => {
      res.json({
        status: 'ok',
        mode: 'webhook',
        timestamp: new Date().toISOString()
      });
    });
    
    // Подключаем маршруты для платежей
    const paymentRoutes = require('./routes/paymentRoutes');
    app.use('/payment', paymentRoutes);
    
    // Подключаем маршруты для ЮKassa
    const yookassaRoutes = require('./routes/yookassaRoutes');
    app.use('/yookassa', yookassaRoutes);
    
    // Запускаем сервер
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`Webhook сервер запущен на порту ${port}`);
    });
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      console.log('Express не установлен. Работаем только через Telegram API (без локального сервера)');
      expressAvailable = false;
    } else {
      console.error('Ошибка при создании Express приложения:', error);
    }
  }
  
  // Устанавливаем постоянное меню ОДИН РАЗ при запуске
  setupPermanentMenu(bot);
  
  // Обработчики команд
  bot.onText(/\/start/, (msg) => handleStart(bot, msg));
  bot.onText(/\/help/, (msg) => handleHelp(bot, msg));
  bot.onText(/\/users/, (msg) => handleAdminUsers(bot, msg));
  bot.onText(/\/stats/, (msg) => handleAdminStats(bot, msg));
  bot.onText(/\/about/, (msg) => handleAbout(bot, msg));
  bot.onText(/\/menu/, (msg) => handleMenuCommand(bot, msg));
  bot.onText(/\/tariff/, (msg) => handleShowTariff(bot, msg));
  bot.onText(/\/plans/, (msg) => handleShowPlans(bot, msg));
  bot.onText(/\/activate_user/, (msg) => handleActivateUser(bot, msg));
bot.onText(/\/refund_user/, (msg) => handleRefundUser(bot, msg));
  
  // Обработчик для документов
  bot.on('document', (msg) => handleDocument(bot, msg));

  // Обработчик для фотографий
  bot.on('photo', (msg) => handlePhoto(bot, msg));
  
  // Обработчик для текстовых сообщений
  bot.on('text', (msg) => {
    const isCommand = msg.text && msg.text.startsWith('/');
    const text = msg.text;
    
    // Проверяем, является ли сообщение кнопкой меню
    const isMenuButton = text === '📊 Мой тариф' || 
                        text === '📋 Функции бота' || 
                        text === 'ℹ️ О компании';
    
    console.log(`Получено текстовое сообщение: "${text}", isCommand: ${isCommand}, isMenuButton: ${isMenuButton}`);
    
    if (isMenuButton) {
      // Логируем нажатие кнопки меню
      logEvent({ userId: msg.from.id, step: `menu_button:${text}` });
      // Если это кнопка меню, обрабатываем её с помощью handleMenuCommand
      console.log(`Обработка кнопки меню: ${text}`);
      handleMenuCommand(bot, msg);
    } else if (!isCommand) {
      // Логируем обычный текст пользователя
      logEvent({ userId: msg.from.id, step: 'text_message' });
      // Если это не команда и не кнопка меню, обрабатываем как обычное текстовое сообщение
      handleTextMessage(bot, msg);
    }
  });
  
  // Обработчик для callback_query (кнопок)
  bot.on('callback_query', async (query) => {
    const data = query.data;
    // Логируем callback событие
    logEvent({ userId: query.from.id, step: `callback:${data.split(':')[0]}` });
    
    try {
      console.log('Получен callback_query:', data);
      
      // Исправленная обработка всех типов кнопок
      if (data.startsWith('admin_')) {
        // Административные callback-запросы
        await handleAdminCallback(bot, query);
      } else if (data.startsWith('tariff_') || 
          data === 'show_tariff' || 
          data === 'show_plans' || 
          data === 'back_to_tariff' || 
          data === 'activate_subscription' || 
          data.startsWith('direct_activate_') || 
          data.startsWith('select_plan_') || 
          data.startsWith('confirm_plan_') ||
          data.startsWith('check_payment_')) {
        await handleTariffCallback(bot, query);
      } else if (data.startsWith('party_')) {
        await handlePartySelection(bot, query);
      } else if (data.startsWith('select_party:')) {
        // Обработка выбора стороны договора в новом формате
        console.log('Обработка выбора стороны договора:', data);
        await handlePartySelection(bot, query);
      } else if (data.startsWith('force_contract:')) {
        // Обработка принудительного анализа документа как договора
        console.log('Обработка принудительного анализа документа:', data);
        await handleForceContract(bot, query);
      } else if (data === 'about') {
        // Обработка кнопки "О компании"
        console.log('Обработка кнопки "О компании"');
        await bot.answerCallbackQuery(query.id);
        const msg = { chat: { id: query.message.chat.id }, from: query.from };
        await handleAbout(bot, msg);
      } else if (data === 'tariff') {
        // Обработка кнопки "Мой тариф"
        console.log('Обработка кнопки "Мой тариф"');
        await bot.answerCallbackQuery(query.id);
        const msg = { chat: { id: query.message.chat.id }, from: query.from };
        await handleShowTariff(bot, msg);
      } else if (data === 'plans') {
        // Обработка кнопки "Тарифы"
        console.log('Обработка кнопки "Тарифы"');
        await bot.answerCallbackQuery(query.id);
        const msg = { chat: { id: query.message.chat.id }, from: query.from };
        await handleShowPlans(bot, msg);
      } else {
        // Резервная проверка: если почему-то не сработало основное условие,
        // но строка содержит check_payment_, всё равно обрабатываем тарифный колбэк
        if (data && data.includes('check_payment_')) {
          console.warn('[WARN] Fallback обработка check_payment_');
          await handleTariffCallback(bot, query);
        } else {
          console.log('Неизвестный тип callback_query:', data);
          await bot.answerCallbackQuery(query.id, {
            text: 'Неизвестный тип кнопки'
          });
        }
      }
    } catch (error) {
      console.error('Ошибка при обработке callback_query:', error);
      
      bot.answerCallbackQuery(query.id, {
        text: 'Произошла ошибка при обработке запроса'
      }).catch(err => {
        console.error('Не удалось ответить на callback_query:', err.message);
      });
    }
  });
  
  return bot;
}

// Запускаем бота
startBot().catch(error => {
  console.error('Ошибка при запуске бота:', error);
  process.exit(1);
});

// Обработка выхода
process.on('SIGINT', () => {
  console.log('Получен сигнал завершения. Останавливаем бота...');
  
  try {
    // Здесь можно добавить код для корректного завершения работы
    console.log('Бот остановлен.');
  } catch (error) {
    console.error('Ошибка при остановке бота:', error);
  }
  
  process.exit(0);
});

// Обработка необработанных исключений
process.on('uncaughtException', (error) => {
  console.error('Необработанное исключение:', error);
  // Не завершаем процесс, чтобы бот продолжил работу
});

// Обработка отклонённых промисов
process.on('unhandledRejection', (reason, promise) => {
  console.error('Необработанное отклонение промиса:', reason);
  // Не завершаем процесс, чтобы бот продолжил работу
}); 