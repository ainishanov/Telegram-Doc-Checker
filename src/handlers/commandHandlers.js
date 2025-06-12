const { getUserSettings, updateUserSettings, resetPrompt } = require('../models/userSettings');
const { PLANS, getUserData, saveUserData } = require('../models/userLimits');
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
    // Команды для обычных пользователей
    const userCommands = [
      { command: '/start', description: 'Начать работу с ботом' },
      { command: '/tariff', description: 'Проверить текущий тариф' },
      { command: '/plans', description: 'Доступные тарифные планы' },
      { command: '/help', description: 'Список функций бота' },
      { command: '/about', description: 'Информация о компании' }
    ];

    // Команды для администраторов (включают административные)
    const adminCommands = [
      ...userCommands,
      { command: '/users', description: 'Список пользователей (админ)' },
      { command: '/stats', description: 'Статистика бота (админ)' },
      { command: '/activate_user', description: 'Активация подписки пользователя (админ)' },
      { command: '/refund_user', description: 'Перевод пользователя на FREE после возврата (админ)' }
    ];

    // Устанавливаем команды для обычных пользователей (по умолчанию)
    bot.setMyCommands(userCommands).then(() => {
      console.log('[INFO] Команды для пользователей успешно установлены.');
    }).catch((error) => {
      console.error('[ERROR] Не удалось установить команды для пользователей:', error.message);
    });

    // Устанавливаем команды для каждого администратора
    config.adminIds.forEach(adminId => {
      bot.setMyCommands(adminCommands, { scope: { type: 'chat', chat_id: adminId } }).then(() => {
        console.log(`[INFO] Административные команды установлены для админа ${adminId}.`);
      }).catch((error) => {
        console.error(`[ERROR] Не удалось установить команды для админа ${adminId}:`, error.message);
      });
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
  
  console.log(`[DEBUG] handleMenuCommand вызван с текстом "${text}" для чата ${chatId}`);
  
  switch (text) {
    case '📊 Мой тариф':
      console.log(`[DEBUG] Попытка вызова handleShowTariff для чата ${chatId}`);
      console.log(`[DEBUG] handleShowTariff существует: ${typeof handleShowTariff === 'function'}`);
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
  
  // Проверяем, является ли пользователь администратором
  const isAdmin = config.adminIds.includes(userId);
  if (isAdmin) {
    console.log(`[ADMIN] Администратор ${userId} запустил бота, устанавливаем административные команды`);
    // Устанавливаем административные команды для этого пользователя
    setupAdminCommands(bot, userId);
  }
  
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

🎁 *У вас есть 1 БЕСПЛАТНАЯ проверка!*
Попробуйте прямо сейчас - просто отправьте договор.

Для дополнительных проверок выберите тариф с помощью команды /plans.

Анализируются только текстовые данные договора. Используйте кнопки меню для быстрого доступа к функциям бота.
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
  const userId = msg.from.id.toString();
  const isAdmin = config.adminIds.includes(userId);
  
  let helpText = `
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

  // Убираем административные команды из текста - админы увидят их в списке команд бота
  // if (isAdmin) {
  //   helpText += `
  // 
  // 🛠 *Административные команды:*
  // /users - Показать список последних пользователей
  // /stats - Показать подробную статистику пользователей и тарифов
  // `;
  // }

  const inlineKeyboard = [
    [
      { text: '📊 Мой тариф', callback_data: 'tariff' },
      { text: '💎 Тарифы', callback_data: 'plans' }
    ],
    [
      { text: 'ℹ️ О компании', callback_data: 'about' }
    ]
  ];

  // Добавляем административные кнопки только для админов
  if (isAdmin) {
    inlineKeyboard.push([
      { text: '👥 Пользователи', callback_data: 'admin_users' },
      { text: '📈 Статистика', callback_data: 'admin_stats' }
    ]);
  }

  await bot.sendMessage(msg.chat.id, helpText, { 
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: inlineKeyboard
    }
  });
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
 * Обработчик команды /stats - показывает статистику пользователей (только для админов)
 * @param {Object} bot - Экземпляр бота 
 * @param {Object} msg - Сообщение от пользователя
 */
const handleAdminStats = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  // Проверяем, является ли пользователь администратором
  if (!config.adminIds.includes(userId)) {
    await bot.sendMessage(chatId, '❌ У вас нет прав для выполнения этой команды.');
    return;
  }
  
  try {
    console.log(`[ADMIN] Администратор ${userId} запросил статистику пользователей`);
    
    // Импортируем функции для работы с пользовательскими данными
    const { getUserData, getAllPlans, PLANS } = require('../models/userLimits');
    const fs = require('fs');
    const path = require('path');
    
    // Получаем список всех пользователей из файла
    const USERS_DATA_FILE = path.join(__dirname, '../../data/users.json');
    
    let allUsersData = {};
    if (fs.existsSync(USERS_DATA_FILE)) {
      allUsersData = JSON.parse(fs.readFileSync(USERS_DATA_FILE, 'utf8'));
    }
    
    const totalUsers = Object.keys(allUsersData).length;
    
    // Считаем пользователей по тарифам
    let planCounts = {
      FREE: 0,
      BASIC: 0,
      PRO: 0,
      UNLIMITED: 0
    };
    
    // Считаем статусы подписок
    let subscriptionStatuses = {
      noSubscription: 0,    // Бесплатный тариф
      inactive: 0,          // Платный тариф, но подписка неактивна
      active: 0,            // Активная подписка
      pending: 0            // Ожидает оплаты
    };
    
    // Считаем доходы по тарифам
    let revenue = {
      BASIC: 0,
      PRO: 0,
      UNLIMITED: 0,
      total: 0
    };
    
    // Общее количество запросов и статистика использования
    let totalRequests = 0;
    let usersWithActivity = 0;
    
    // Анализируем каждого пользователя
    for (const [userId, userData] of Object.entries(allUsersData)) {
      // Считаем пользователей по тарифам
      const plan = userData.plan || 'FREE';
      planCounts[plan]++;
      
      // Считаем запросы
      const requestsUsed = userData.requestsUsed || 0;
      totalRequests += requestsUsed;
      
      if (requestsUsed > 0) {
        usersWithActivity++;
      }
      
      // Анализируем статус подписки
      if (plan === 'FREE') {
        subscriptionStatuses.noSubscription++;
      } else {
        const subscription = userData.subscriptionData;
        if (subscription) {
          if (subscription.active) {
            subscriptionStatuses.active++;
            // Считаем доход от активных подписок
            revenue[plan] += PLANS[plan].price;
            revenue.total += PLANS[plan].price;
          } else if (subscription.paymentStatus === 'pending') {
            subscriptionStatuses.pending++;
          } else {
            subscriptionStatuses.inactive++;
          }
        } else {
          subscriptionStatuses.inactive++;
        }
      }
    }
    
    // Формируем подробное сообщение со статистикой
    const currentDate = new Date().toLocaleDateString('ru-RU');
    
    let message = `📊 *АДМИНИСТРАТИВНАЯ ПАНЕЛЬ*\n`;
    message += `📅 Дата: ${currentDate}\n\n`;
    
    message += `👥 *ОБЩАЯ СТАТИСТИКА:*\n`;
    message += `• Всего пользователей: *${totalUsers}*\n`;
    message += `• Активных пользователей: *${usersWithActivity}* (${totalUsers > 0 ? ((usersWithActivity/totalUsers)*100).toFixed(1) : 0}%)\n`;
    message += `• Всего запросов: *${totalRequests}*\n`;
    message += `• Среднее запросов на пользователя: *${totalUsers > 0 ? (totalRequests/totalUsers).toFixed(1) : 0}*\n\n`;
    
    message += `💼 *РАСПРЕДЕЛЕНИЕ ПО ТАРИФАМ:*\n`;
    for (const [planId, count] of Object.entries(planCounts)) {
      const planName = PLANS[planId].name;
      const percentage = totalUsers > 0 ? ((count/totalUsers)*100).toFixed(1) : 0;
      message += `• ${planName}: *${count}* (${percentage}%)\n`;
    }
    message += `\n`;
    
    message += `💳 *СТАТУС ПОДПИСОК:*\n`;
    message += `• Бесплатные пользователи: *${subscriptionStatuses.noSubscription}*\n`;
    message += `• Активные подписки: *${subscriptionStatuses.active}*\n`;
    message += `• Неактивные подписки: *${subscriptionStatuses.inactive}*\n`;
    message += `• Ожидают оплаты: *${subscriptionStatuses.pending}*\n\n`;
    
    message += `💰 *ДОХОДЫ (активные подписки):*\n`;
    message += `• Базовый тариф: *${revenue.BASIC}* ₽\n`;
    message += `• Профессиональный: *${revenue.PRO}* ₽\n`;
    message += `• Безлимитный: *${revenue.UNLIMITED}* ₽\n`;
    message += `• **ИТОГО: ${revenue.total} ₽**\n\n`;
    
    // Добавляем кнопки для дополнительных действий
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🔄 Обновить статистику', callback_data: 'admin_refresh_stats' },
          { text: '📈 Детальная статистика', callback_data: 'admin_detailed_stats' }
        ]
      ]
    };
    
    await bot.sendMessage(chatId, message, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard 
    });
    
    console.log(`[ADMIN] Статистика отправлена администратору ${userId}`);
    
  } catch (error) {
    console.error('[ERROR] Ошибка при получении статистики пользователей:', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка при получении статистики пользователей.');
  }
};

/**
 * Обработчик команды /users - показывает список последних пользователей (только для админов)
 * @param {Object} bot - Экземпляр бота 
 * @param {Object} msg - Сообщение от пользователя
 */
const handleAdminUsers = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  // Проверяем, является ли пользователь администратором
  if (!config.adminIds.includes(userId)) {
    await bot.sendMessage(chatId, '❌ У вас нет прав для выполнения этой команды.');
    return;
  }
  
  try {
    console.log(`[ADMIN] Администратор ${userId} запросил список пользователей`);
    
    const fs = require('fs');
    const path = require('path');
    const { PLANS } = require('../models/userLimits');
    
    // Получаем данные пользователей
    const USERS_DATA_FILE = path.join(__dirname, '../../data/users.json');
    
    let allUsersData = {};
    if (fs.existsSync(USERS_DATA_FILE)) {
      allUsersData = JSON.parse(fs.readFileSync(USERS_DATA_FILE, 'utf8'));
    }
    
    const users = Object.entries(allUsersData);
    
    if (users.length === 0) {
      await bot.sendMessage(chatId, '📝 Пользователей пока нет.');
      return;
    }
    
    // Сортируем пользователей по дате регистрации (новые сначала)
    users.sort((a, b) => {
      const dateA = new Date(a[1].registrationDate || 0);
      const dateB = new Date(b[1].registrationDate || 0);
      return dateB - dateA;
    });
    
    // Показываем только последних 10 пользователей
    const recentUsers = users.slice(0, 10);
    
    let message = `👥 *ПОСЛЕДНИЕ ПОЛЬЗОВАТЕЛИ (${recentUsers.length} из ${users.length}):*\n\n`;
    
    recentUsers.forEach(([ userId, userData ], index) => {
      const regDate = userData.registrationDate 
        ? new Date(userData.registrationDate).toLocaleDateString('ru-RU')
        : 'Неизвестно';
      
      const plan = PLANS[userData.plan || 'FREE'];
      const requestsUsed = userData.requestsUsed || 0;
      
      let subscriptionStatus = '🔴 Неактивна';
      if (userData.plan === 'FREE') {
        subscriptionStatus = '🆓 Бесплатная';
      } else if (userData.subscriptionData?.active) {
        subscriptionStatus = '🟢 Активна';
      } else if (userData.subscriptionData?.paymentStatus === 'pending') {
        subscriptionStatus = '🟡 Ожидает оплаты';
      }
      
      message += `*${index + 1}.* ID: \`${userId}\`\n`;
      message += `   📅 Регистрация: ${regDate}\n`;
      message += `   💼 Тариф: ${plan.name}\n`;
      message += `   📊 Запросов: ${requestsUsed}\n`;
      message += `   💳 Статус: ${subscriptionStatus}\n\n`;
    });
    
    if (users.length > 10) {
      message += `... и еще ${users.length - 10} пользователей\n\n`;
    }
    
    // Добавляем кнопки управления
    const keyboard = {
      inline_keyboard: [
        [
          { text: '📊 Статистика', callback_data: 'admin_stats' },
          { text: '🔄 Обновить список', callback_data: 'admin_refresh_users' }
        ]
      ]
    };
    
    await bot.sendMessage(chatId, message, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard 
    });
    
  } catch (error) {
    console.error('[ERROR] Ошибка при получении списка пользователей:', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка при получении списка пользователей.');
  }
};

/**
 * Обработчик callback-запросов для административных функций
 * @param {Object} bot - Экземпляр Telegram бота
 * @param {Object} query - Callback-запрос
 */
async function handleAdminCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;
  const userId = query.from.id.toString();
  
  // Проверяем, является ли пользователь администратором
  if (!config.adminIds.includes(userId)) {
    await bot.answerCallbackQuery(query.id, { text: 'У вас нет прав доступа', show_alert: true });
    return;
  }
  
  try {
    // Сначала отвечаем на запрос, чтобы убрать индикатор загрузки
    await bot.answerCallbackQuery(query.id);
    
    if (data === 'admin_refresh_stats' || data === 'admin_stats') {
      await bot.deleteMessage(chatId, messageId);
      await handleAdminStats(bot, query.message);
      return;
    }
    
    if (data === 'admin_refresh_users') {
      await bot.deleteMessage(chatId, messageId);
      await handleAdminUsers(bot, query.message);
      return;
    }
    
    if (data === 'admin_detailed_stats') {
      await bot.deleteMessage(chatId, messageId);
      await handleDetailedStats(bot, query.message);
      return;
    }
    
  } catch (error) {
    console.error('[ERROR] Ошибка в обработке административного callback:', error);
    await bot.answerCallbackQuery(query.id, { text: 'Произошла ошибка', show_alert: true });
  }
}

/**
 * Детальная статистика для администраторов
 * @param {Object} bot - Экземпляр Telegram бота 
 * @param {Object} msg - Сообщение от пользователя
 */
async function handleDetailedStats(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  // Проверяем, является ли пользователь администратором
  if (!config.adminIds.includes(userId)) {
    await bot.sendMessage(chatId, '❌ У вас нет прав для выполнения этой команды.');
    return;
  }
  
  try {
    const fs = require('fs');
    const path = require('path');
    const { PLANS } = require('../models/userLimits');
    
    // Получаем данные пользователей
    const USERS_DATA_FILE = path.join(__dirname, '../../data/users.json');
    
    let allUsersData = {};
    if (fs.existsSync(USERS_DATA_FILE)) {
      allUsersData = JSON.parse(fs.readFileSync(USERS_DATA_FILE, 'utf8'));
    }
    
    // Анализируем активность пользователей по дням
    const today = new Date();
    const week = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const month = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    let newUsersWeek = 0;
    let newUsersMonth = 0;
    let activeUsersWeek = 0;
    let requestsWeek = 0;
    
    // Анализируем по дням недели активность
    const dayStats = {};
    
    for (const [userId, userData] of Object.entries(allUsersData)) {
      const regDate = new Date(userData.registrationDate || 0);
      
      // Считаем новых пользователей
      if (regDate >= week) newUsersWeek++;
      if (regDate >= month) newUsersMonth++;
      
      // Анализируем активность (предполагаем что есть поле lastActivity)
      if (userData.lastActivity) {
        const lastActivity = new Date(userData.lastActivity);
        if (lastActivity >= week) {
          activeUsersWeek++;
        }
      }
      
      // Запросы за неделю (упрощенно - считаем все запросы)
      if (userData.requestsUsed > 0) {
        requestsWeek += userData.requestsUsed;
      }
    }
    
    // Рассчитываем конверсии
    const totalUsers = Object.keys(allUsersData).length;
    const paidUsers = Object.values(allUsersData).filter(u => 
      u.plan !== 'FREE' && u.subscriptionData?.active
    ).length;
    
    const conversionRate = totalUsers > 0 ? ((paidUsers / totalUsers) * 100).toFixed(2) : 0;
    
    let message = `📈 *ДЕТАЛЬНАЯ СТАТИСТИКА*\n\n`;
    
    message += `📊 *ДИНАМИКА РОСТА:*\n`;
    message += `• Новых за неделю: *${newUsersWeek}*\n`;
    message += `• Новых за месяц: *${newUsersMonth}*\n`;
    message += `• Активных за неделю: *${activeUsersWeek}*\n\n`;
    
    message += `💰 *КОНВЕРСИЯ:*\n`;
    message += `• Платящих пользователей: *${paidUsers}* из *${totalUsers}*\n`;
    message += `• Коэффициент конверсии: *${conversionRate}%*\n\n`;
    
    message += `📋 *АКТИВНОСТЬ:*\n`;
    message += `• Запросов за неделю: *${requestsWeek}*\n`;
    message += `• Среднее запросов на активного: *${activeUsersWeek > 0 ? (requestsWeek/activeUsersWeek).toFixed(1) : 0}*\n\n`;
    
    // Добавляем кнопку возврата
    const keyboard = {
      inline_keyboard: [
        [
          { text: '« Назад к основной статистике', callback_data: 'admin_stats' }
        ]
      ]
    };
    
    await bot.sendMessage(chatId, message, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard 
    });
    
  } catch (error) {
    console.error('[ERROR] Ошибка при получении детальной статистики:', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка при получении детальной статистики.');
  }
};

/**
 * Устанавливает административные команды для конкретного пользователя
 * @param {Object} bot - Экземпляр бота
 * @param {string} userId - ID пользователя
 */
async function setupAdminCommands(bot, userId) {
  try {
    const adminCommands = [
      { command: '/start', description: 'Начать работу с ботом' },
      { command: '/tariff', description: 'Проверить текущий тариф' },
      { command: '/plans', description: 'Доступные тарифные планы' },
      { command: '/help', description: 'Список функций бота' },
      { command: '/about', description: 'Информация о компании' },
      { command: '/users', description: 'Список пользователей (админ)' },
      { command: '/stats', description: 'Статистика бота (админ)' },
      { command: '/activate_user', description: 'Активация подписки пользователя (админ)' },
      { command: '/refund_user', description: 'Перевод пользователя на FREE после возврата (админ)' }
    ];

    await bot.setMyCommands(adminCommands, { scope: { type: 'chat', chat_id: userId } });
    console.log(`[INFO] Административные команды установлены для админа ${userId}.`);
  } catch (error) {
    console.error(`[ERROR] Не удалось установить команды для админа ${userId}:`, error.message);
  }
}

/**
 * Обработчик команды /activate_user - ручная активация подписки (только для админов)
 * Использование: /activate_user USER_ID PLAN_ID
 * @param {Object} bot - Экземпляр бота 
 * @param {Object} msg - Сообщение от пользователя
 */
const handleActivateUser = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  // Проверяем, является ли пользователь администратором
  if (!config.adminIds.includes(userId)) {
    await bot.sendMessage(chatId, '❌ У вас нет прав для выполнения этой команды.');
    return;
  }
  
  try {
    const commandArgs = msg.text.split(' ').slice(1); // Убираем /activate_user
    
    if (commandArgs.length < 2) {
      await bot.sendMessage(chatId, `
📋 *Команда ручной активации подписки*

*Использование:* \`/activate_user USER_ID PLAN_ID\`

*Доступные планы:*
• \`BASIC\` - Базовый (290 руб, 10 запросов в месяц)
• \`PRO\` - Профессиональный (990 руб, 50 запросов в месяц)  
• \`UNLIMITED\` - Безлимитный (4990 руб, неограниченно)

*Пример:* \`/activate_user 117958330 BASIC\`
      `, { parse_mode: 'Markdown' });
      return;
    }
    
    const targetUserId = commandArgs[0];
    const planId = commandArgs[1].toUpperCase();
    
    // Проверяем, что план существует
    const { PLANS, getUserData, saveUserData } = require('../models/userLimits');
    
    if (!PLANS[planId]) {
      await bot.sendMessage(chatId, `❌ Неизвестный план: ${planId}\n\nДоступные планы: BASIC, PRO, UNLIMITED`);
      return;
    }
    
    // Получаем данные пользователя
    const userData = getUserData(targetUserId);
    const plan = PLANS[planId];
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + plan.duration);
    
    // Обновляем данные пользователя
    userData.plan = planId;
    userData.requestsUsed = 0; // Сбрасываем счетчик запросов при активации нового тарифа
    userData.subscriptionData = {
      active: true,
      planId: planId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      paymentStatus: 'paid',
      paymentId: `admin-activation-${Date.now()}`,
      activatedAt: new Date().toISOString(),
      activatedManually: true,
      activatedBy: userId // ID администратора, который активировал
    };
    
    // Сохраняем обновленные данные
    saveUserData(targetUserId, userData);
    
    // Отправляем подтверждение администратору
    await bot.sendMessage(chatId, `
✅ *Подписка успешно активирована!*

👤 **Пользователь:** ${targetUserId}
📦 **План:** ${plan.name}
💰 **Цена:** ${plan.price} руб.
📊 **Лимит запросов:** ${plan.requestLimit >= Number.MAX_SAFE_INTEGER ? 'Неограниченно' : plan.requestLimit + ' в месяц'}
📅 **Период:** ${startDate.toLocaleDateString('ru-RU')} - ${endDate.toLocaleDateString('ru-RU')} (${plan.duration} дней)

Пользователь может начать использовать платный функционал.
    `, { parse_mode: 'Markdown' });
    
    console.log(`[ADMIN] Администратор ${userId} вручную активировал план ${planId} для пользователя ${targetUserId}`);
    
  } catch (error) {
    console.error('Ошибка при ручной активации подписки:', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка при активации подписки.');
  }
};

/**
 * Обработчик команды /refund_user - перевод пользователя на FREE после возврата (только для админов)
 * Использование: /refund_user USER_ID
 * @param {Object} bot - Экземпляр бота 
 * @param {Object} msg - Сообщение от пользователя
 */
const handleRefundUser = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  // Проверяем, является ли пользователь администратором
  if (!config.adminIds.includes(userId)) {
    await bot.sendMessage(chatId, '❌ У вас нет прав для выполнения этой команды.');
    return;
  }
  
  try {
    const commandArgs = msg.text.split(' ').slice(1); // Убираем /refund_user
    
    if (commandArgs.length < 1) {
      await bot.sendMessage(chatId, `
💰 *Команда перевода на FREE тариф после возврата*

*Использование:* \`/refund_user USER_ID\`

*Что делает команда:*
• Переводит пользователя на бесплатный тариф
• Деактивирует платную подписку
• Сбрасывает лимиты до бесплатных
• Записывает информацию о возврате

*Пример:* \`/refund_user 117958330\`
      `, { parse_mode: 'Markdown' });
      return;
    }
    
    const targetUserId = commandArgs[0];
    
    // Импортируем функции для работы с пользовательскими данными
    const { getUserData, saveUserData, PLANS } = require('../models/userLimits');
    
    // Получаем данные пользователя
    const userData = getUserData(targetUserId);
    
    // Сохраняем информацию о старом тарифе для логирования
    const oldPlan = userData.plan;
    const oldSubscription = userData.subscriptionData;
    
    // Переводим на FREE тариф
    userData.plan = 'FREE';
    userData.requestsUsed = 0; // Сбрасываем счетчик запросов 
    userData.subscriptionData = {
      active: false,
      planId: 'FREE',
      endDate: null,
      paymentStatus: 'refunded',
      refundedAt: new Date().toISOString(),
      refundedBy: userId, // ID администратора, который сделал возврат
      previousPlan: oldPlan,
      previousSubscription: oldSubscription
    };
    
    // Сохраняем обновленные данные
    saveUserData(targetUserId, userData);
    
    // Отправляем подтверждение администратору
    await bot.sendMessage(chatId, `
💰 *Возврат успешно обработан!*

👤 **Пользователь:** ${targetUserId}
🔄 **Действие:** Переведен на тариф FREE
📦 **Предыдущий план:** ${oldPlan}
📅 **Дата возврата:** ${new Date().toLocaleDateString('ru-RU')}

Подписка деактивирована, пользователь переведен на бесплатный тариф.
    `, { parse_mode: 'Markdown' });
    
    console.log(`[ADMIN] Администратор ${userId} обработал возврат для пользователя ${targetUserId}, план ${oldPlan} -> FREE`);
    
  } catch (error) {
    console.error('Ошибка при обработке возврата:', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка при обработке возврата.');
  }
};

module.exports = {
  handleStart,
  handleHelp,
  handleAdminUsers,
  handleAdminStats,
  handleAdminCallback,
  handleMenuCommand,
  setupPermanentMenu,
  setupAdminCommands,
  handleAbout,
  handleActivateUser,
  handleRefundUser
}; 