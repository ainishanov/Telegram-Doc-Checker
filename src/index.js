const TelegramBot = require('node-telegram-bot-api');
const config = require('./config/config');
const { 
  handleStart, 
  handleHelp,
  handleUsers,
  handleMenuCommand,
  setupPermanentMenu,
  handleAbout
} = require('./handlers/commandHandlers');
const { handleDocument, handlePartySelection } = require('./handlers/documentHandler');
const {
  handleShowTariff,
  handleShowPlans,
  handleTariffCallback
} = require('./handlers/planHandlers');

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
  
  // Определяем режим работы бота
  if (config.webhookUrl && process.env.NODE_ENV === 'production') {
    // Webhook режим для production
    console.log('Запуск бота в режиме webhook (production)');
    
    bot = new TelegramBot(config.telegramToken);
    
    // Настраиваем webhook
    try {
      await bot.setWebHook(config.webhookUrl);
      console.log('Webhook успешно установлен:', config.webhookUrl);
    } catch (error) {
      console.error('Ошибка при установке webhook:', error);
      process.exit(1);
    }
    
    // Создаем Express приложение для обработки webhook
    const express = require('express');
    const app = express();
    
    // Парсим тело запроса как JSON
    app.use(express.json());
    
    // Обработчик webhook
    app.post(`/webhook/${config.telegramToken}`, (req, res) => {
      bot.handleUpdate(req.body);
      res.sendStatus(200);
    });
    
    // Запускаем сервер
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`Webhook сервер запущен на порту ${port}`);
    });
  } else {
    // Polling режим для локальной разработки
    console.log('Запуск бота в режиме polling (локальная разработка)');
    
    // Используем clean=true для удаления всех ожидающих обновлений
    // и отключения вебхука перед запуском поллинга
    bot = new TelegramBot(config.telegramToken, { 
      polling: {
        interval: 300,
        params: {
          timeout: 10
        },
        autoStart: true
      },
      filepath: false
    });
    
    // Отключение вебхука для режима поллинга
    try {
      await bot.deleteWebHook({ drop_pending_updates: true });
      console.log('Вебхук отключен для режима поллинга');
    } catch (error) {
      console.error('Ошибка при отключении вебхука:', error);
    }
  }
  
  // Устанавливаем постоянное меню
  const menuButtons = setupPermanentMenu(bot);
  
  // Обработчики команд
  bot.onText(/\/start/, (msg) => handleStart(bot, msg));
  bot.onText(/\/help/, (msg) => handleHelp(bot, msg));
  bot.onText(/\/users/, (msg) => handleUsers(bot, msg));
  bot.onText(/\/tariff/, (msg) => handleShowTariff(bot, msg));
  bot.onText(/\/plans/, (msg) => handleShowPlans(bot, msg));
  bot.onText(/\/about/, (msg) => handleAbout(bot, msg));
  
  // Обработчик текстовых сообщений для меню
  bot.on('text', (msg) => {
    // Проверяем, является ли сообщение командой из меню
    if (msg.text.startsWith('/')) return; // Пропускаем обычные команды
    handleMenuCommand(bot, msg);
  });
  
  // Обработчик документов
  bot.on('document', (msg) => handleDocument(bot, msg));
  
  // Обработчик callback-запросов
  bot.on('callback_query', async (query) => {
    try {
      const data = query.data;
      
      // Обработка выбора стороны договора
      if (data.startsWith('select_party:')) {
        await handlePartySelection(bot, query);
        return;
      }
      
      // Обработка callback-запросов для тарифов
      await handleTariffCallback(bot, query);
    } catch (error) {
      console.error('Ошибка при обработке callback_query:', error);
      try {
        await bot.answerCallbackQuery(query.id, { 
          text: 'Произошла ошибка при обработке запроса',
          show_alert: true 
        });
      } catch (err) {
        console.error('Ошибка при отправке ответа на callback_query:', err);
      }
    }
  });
  
  // Обработка ошибок
  bot.on('error', (error) => {
    console.error('Ошибка в работе Telegram бота:', error);
  });
  
  // Обработка polling_error
  bot.on('polling_error', (error) => {
    console.error('Ошибка polling:', error);
  });
  
  // Обработка webhook_error
  bot.on('webhook_error', (error) => {
    console.error('Ошибка webhook:', error);
  });
  
  console.log('Бот запущен в режиме', process.env.NODE_ENV || 'development', process.env.NODE_ENV === 'production' ? '(webhook)' : '(polling)');
  console.log('Отправьте команду /start для начала работы');
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