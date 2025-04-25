const { getUserSettings, updateUserSettings, resetPrompt } = require('../models/userSettings');
const { PLANS, getUserData } = require('../models/userLimits');
const { handleShowTariff } = require('./planHandlers');
const config = require('../config/config');

// Информация о компании
const COMPANY_INFO = {
  name: "ИП Нишанов Айнур Абдулазизович",
  inn: "164609405227", 
  ogrnip: "314167427200089",
  contacts: {
    email: "ainur.nishanov@gmail.com"
  },
  offerUrl: "https://ainishanov.github.io/Telegram-Doc-Checker/offer.html"
};

/**
 * Создает постоянное меню с кнопками
 * @param {Object} bot - Экземпляр бота
 */
function setupPermanentMenu(bot) {
  const menuButtons = {
    keyboard: [
      [{ text: '📊 Мой тариф' }],
      [{ text: '📋 Функции бота' }],
      [{ text: 'ℹ️ О компании' }]
    ],
    resize_keyboard: true,
    persistent: true
  };

  try {
    bot.setMyCommands([
      { command: '/start', description: 'Начать работу с ботом' },
      { command: '/tariff', description: 'Проверить текущий тариф' },
      { command: '/plans', description: 'Доступные тарифные планы' },
      { command: '/help', description: 'Список функций бота' },
      { command: '/about', description: 'Информация о компании' }
    ]).then(() => {
      console.log('[INFO] Команды бота успешно установлены.');
    }).catch((error) => {
      console.error('[ERROR] Не удалось установить команды бота:', error.message);
    });
  } catch (error) {
    console.error('[ERROR] Ошибка при вызове setMyCommands:', error.message);
  }

  // Возвращаем только разметку клавиатуры для использования в sendMessage
  return { reply_markup: menuButtons };
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
    case 'ℹ️ О компании':
      handleAbout(bot, msg);
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
  
  console.time(`handleStart_${chatId}`); // Начинаем замер времени
  
  // Отправляем сообщение "печатает..." для мгновенного отклика
  bot.sendChatAction(chatId, 'typing').catch(err => {
    console.error(`Ошибка отправки статуса печати: ${err.message}`);
  });
  
  console.time(`getUserData_${chatId}`);
  const userData = getUserData(userId); // Получаем данные
  console.timeEnd(`getUserData_${chatId}`);
  
  // Получаем разметку меню (без установки команд)
  const menuKeyboard = setupPermanentMenu(bot);
  
  const message = `
Привет! Я бот для проверки договоров с помощью искусственного интеллекта.

🔍 Как работать со мной:
1. Просто отправьте мне документ в формате PDF, DOC, DOCX, RTF или TXT
2. Я определю стороны договора и проанализирую его с точки зрения рисков для вашей стороны
3. Получите детальный отчет с рекомендациями в течение нескольких минут

⚠️ Обратите внимание:
• У вас есть 5 проверок договоров бесплатно
• Для получения дополнительных проверок можно приобрести платный тариф
• Анализируются только текстовые данные договора

Используйте кнопки меню для быстрого доступа к функциям бота, просмотра тарифов и получения помощи.
`;
  
  console.time(`sendMessage_${chatId}`);
  try {
    await bot.sendMessage(chatId, message, { 
      parse_mode: 'Markdown',
      ...menuKeyboard // Используем полученную разметку
    });
  } catch (error) {
    console.error(`[ERROR] Не удалось отправить сообщение /start для chatId ${chatId}:`, error.message);
  }
  console.timeEnd(`sendMessage_${chatId}`);
  
  console.timeEnd(`handleStart_${chatId}`); // Заканчиваем замер времени
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
/about - Информация о компании и договор оферты
/tariff - Проверить текущий тариф
/plans - Доступные тарифные планы

📄 *Анализ документов:*
Отправьте документ в формате PDF или DOC/DOCX для анализа.
После загрузки документа выберите свою роль в договоре для получения анализа.
`;

  await bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
};

/**
 * Обработчик команды /about - показывает информацию о компании и договор оферты
 * @param {Object} bot - Экземпляр бота 
 * @param {Object} msg - Сообщение от пользователя
 */
const handleAbout = async (bot, msg) => {
  const chatId = msg.chat.id;

  const aboutText = `
*Информация о компании:*

*${COMPANY_INFO.name}*
ИНН: ${COMPANY_INFO.inn}
ОГРНИП: ${COMPANY_INFO.ogrnip}
Email: ${COMPANY_INFO.contacts.email}

Используя данного бота, вы соглашаетесь с условиями публичной оферты.
[Ознакомиться с договором оферты](${COMPANY_INFO.offerUrl})
`;

  await bot.sendMessage(chatId, aboutText, {
    parse_mode: 'Markdown',
    disable_web_page_preview: false
  });
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
  setupPermanentMenu,
  handleAbout
}; 