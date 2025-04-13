const { getUserSettings, updateUserSettings, resetPrompt } = require('../models/userSettings');
const { getUserLimits, PLANS, getUserData } = require('../models/userLimits');
const { handleStatus, handleUpgrade, handleDowngrade, handleShowTariff } = require('./planHandlers');
const config = require('../config/config');

/**
 * Создает постоянное меню с кнопками
 * @param {Object} bot - Экземпляр бота
 */
function setupPermanentMenu(bot) {
  const menuButtons = {
    keyboard: [
      [{ text: '📊 Мой тариф' }],
      [{ text: '📋 Функции бота' }]
    ],
    resize_keyboard: true,
    persistent: true
  };

  bot.setMyCommands([
    { command: '/start', description: 'Начать работу с ботом' },
    { command: '/tariff', description: 'Проверить текущий тариф' },
    { command: '/plans', description: 'Доступные тарифные планы' },
    { command: '/help', description: 'Список функций бота' }
  ]);

  return menuButtons;
}

/**
 * Обработчик текстовых команд из меню
 * @param {Object} bot - Экземпляр бота
 * @param {Object} msg - Сообщение от пользователя
 */
function handleMenuCommand(bot, msg) {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  switch (text) {
    case '📊 Мой тариф':
      handleShowTariff(bot, msg);
      break;
    case '📋 Функции бота':
      handleHelp(bot, msg);
      break;
  }
}

/**
 * Обработчик команды /start
 * @param {Object} bot - Экземпляр бота 
 * @param {Object} msg - Сообщение от пользователя
 */
const handleStart = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const userData = getUserData(userId);
  
  const menuButtons = setupPermanentMenu(bot);
  
  const message = `
Привет! Я бот для проверки договоров с помощью искусственного интеллекта.

Отправьте или перешлите мне документ, и я проанализирую его на наличие рисков, недостатков и подводных камней.

*Важно:* У вас есть 3 проверки договоров бесплатно. Для получения дополнительных проверок вы можете приобрести платный тариф.

Используйте кнопки меню для быстрого доступа к функциям бота.
`;
  
  await bot.sendMessage(chatId, message, { 
    parse_mode: 'Markdown',
    reply_markup: menuButtons
  });
};

/**
 * Обработчик команды /help
 * @param {Object} bot - Экземпляр бота 
 * @param {Object} msg - Сообщение от пользователя
 */
const handleHelp = async (bot, msg) => {
  const helpText = `
🤖 *Команды бота:*

/start - Начать работу с ботом
/help - Показать это сообщение
/users - Показать список пользователей (только для админов)

📄 *Анализ документов:*
Отправьте документ в формате PDF или DOC/DOCX для анализа.
После загрузки документа выберите свою роль в договоре для получения анализа.
`;

  await bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
};

/**
 * Обработчик команды /users
 * @param {Object} bot - Экземпляр бота 
 * @param {Object} msg - Сообщение от пользователя
 */
const handleUsers = async (bot, msg) => {
  const chatId = msg.chat.id;
  
  // Проверяем, является ли пользователь администратором
  if (!config.adminIds.includes(msg.from.id.toString())) {
    await bot.sendMessage(chatId, 'У вас нет прав для выполнения этой команды.');
    return;
  }
  
  try {
    // Получаем данные о настройках пользователей
    const fs = require('fs');
    const path = require('path');
    const USER_SETTINGS_FILE = path.join(__dirname, '../../data/userSettings.json');
    const USER_LIMITS_FILE = path.join(__dirname, '../../data/userLimits.json');
    
    let userSettings = {};
    let userLimits = {};
    
    // Загружаем данные о настройках
    if (fs.existsSync(USER_SETTINGS_FILE)) {
      userSettings = JSON.parse(fs.readFileSync(USER_SETTINGS_FILE, 'utf8'));
    }
    
    // Загружаем данные о лимитах
    if (fs.existsSync(USER_LIMITS_FILE)) {
      userLimits = JSON.parse(fs.readFileSync(USER_LIMITS_FILE, 'utf8'));
    }
    
    // Собираем статистику
    const userIds = new Set([...Object.keys(userSettings), ...Object.keys(userLimits)]);
    const totalUsers = userIds.size;
    
    // Считаем пользователей по тарифам
    let planCounts = {
      FREE: 0,
      BASIC: 0,
      PRO: 0,
      UNLIMITED: 0
    };
    
    // Считаем статусы оплаты
    let paymentStatuses = {
      none: 0,
      pending: 0,
      paid: 0
    };
    
    // Общее количество запросов
    let totalRequests = 0;
    
    // Собираем статистику по пользователям
    for (const userId of userIds) {
      const userLimit = userLimits[userId];
      
      if (userLimit) {
        // Считаем пользователей по тарифам
        const plan = userLimit.plan || 'FREE';
        planCounts[plan] = (planCounts[plan] || 0) + 1;
        
        // Считаем статусы оплаты
        const paymentStatus = userLimit.paymentStatus || 'none';
        paymentStatuses[paymentStatus] = (paymentStatuses[paymentStatus] || 0) + 1;
        
        // Считаем общее количество запросов
        totalRequests += userLimit.requestsUsed || 0;
      }
    }
    
    // Формируем сообщение со статистикой
    const message = `
*Статистика пользователей бота:*

Всего пользователей: ${totalUsers}

*Пользователи по тарифам:*
• Бесплатный: ${planCounts.FREE}
• Базовый: ${planCounts.BASIC}
• Профи: ${planCounts.PRO}
• Безлимит: ${planCounts.UNLIMITED}

*Статусы оплаты:*
• Без оплаты: ${paymentStatuses.none}
• Ожидание оплаты: ${paymentStatuses.pending}
• Оплачено: ${paymentStatuses.paid}

*Запросов обработано:* ${totalRequests}
`;
    
    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Ошибка при получении статистики пользователей:', error);
    await bot.sendMessage(chatId, 'Произошла ошибка при получении статистики пользователей.');
  }
};

module.exports = {
  handleStart,
  handleHelp,
  handleUsers,
  handleMenuCommand,
  setupPermanentMenu
}; 