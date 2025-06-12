const { 
  getUserData, 
  getUserPlan, 
  canUserMakeRequest, 
  changePlan, 
  activateSubscription, 
  getAllPlans,
  PLANS
} = require('../models/userLimits');

/**
 * Отображает текущий тариф и статус пользователя
 * @param {Object} bot - Экземпляр Telegram бота 
 * @param {Object} msg - Сообщение от пользователя
 */
async function handleShowTariff(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  // Получаем информацию о текущем тарифе пользователя
  const planInfo = getUserPlan(userId);
  const userData = getUserData(userId);
  
  // Формируем сообщение о текущем тарифе
  let message = `*Ваш текущий тариф: ${planInfo.name}*\n\n`;
  
  // Информация о количестве проверок договоров
  if (planInfo.requestLimit >= Number.MAX_SAFE_INTEGER) {
    message += '📊 *Количество проверок договоров:* Неограниченно\n';
  } else {
    message += `📊 *Использовано проверок:* ${planInfo.requestsUsed} из ${planInfo.requestLimit}\n`;
    message += `📈 *Осталось проверок:* ${planInfo.requestsRemaining}\n`;
  }
  
  // Для платных тарифов показываем информацию о подписке
  if (planInfo.id !== 'FREE') {
    if (userData.subscriptionData && userData.subscriptionData.active) {
      const endDate = new Date(userData.subscriptionData.endDate);
      const formattedDate = endDate.toLocaleDateString('ru-RU');
      message += `\n💳 *Статус подписки:* Активна\n`;
      message += `📅 *Действует до:* ${formattedDate}\n`;
    } else {
      message += `\n⚠️ *Статус подписки:* Не активирована\n`;
      message += `Для активации тарифа нажмите кнопку "Активировать тариф" ниже.\n`;
    }
  }
  
  // Формируем клавиатуру с кнопками действий
  const keyboard = {
    inline_keyboard: []
  };
  
  // Кнопка смены тарифа
  keyboard.inline_keyboard.push([
    { text: '📋 Сменить тариф', callback_data: 'show_plans' }
  ]);
  
  // Отправляем сообщение с информацией о тарифе
  await bot.sendMessage(chatId, message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

/**
 * Отображает список доступных тарифов
 * @param {Object} bot - Экземпляр Telegram бота 
 * @param {Object} msg - Сообщение от пользователя
 */
async function handleShowPlans(bot, msg) {
  const chatId = msg.chat.id;
  
  // Получаем список всех доступных тарифов
  const plans = getAllPlans();
  
  // Формируем сообщение со списком тарифов
  let message = '*Доступные тарифы:*\n\n';
  message += '*Все тарифы имеют одинаковый функционал анализа, отличие только в количестве проверок!*\n\n';
  
  // Добавляем информацию о тарифах
  for (const plan of plans) {
    message += `*${plan.name}*`;
    
    if (plan.id !== 'FREE') {
      message += ` - ${plan.price} ₽/мес`;
    }
    
    message += '\n';
    
    // Информация о количестве договоров
    if (plan.requestLimit >= Number.MAX_SAFE_INTEGER) {
      message += '• Неограниченное количество проверок договоров\n';
    } else {
      if (plan.id === 'FREE') {
        message += `• ${plan.requestLimit} проверок договоров бесплатно навсегда\n`;
      } else {
        message += `• ${plan.requestLimit} проверок договоров в месяц\n`;
      }
    }
    
    message += '\n';
  }
  
  message += 'Выберите тариф, который вам подходит:';
  
  // Формируем клавиатуру с кнопками выбора тарифа
  const keyboard = {
    inline_keyboard: [
      [
        { text: 'Бесплатный', callback_data: 'select_plan_FREE' }
      ],
      [
        { text: `Базовый - ${PLANS.BASIC.price} ₽`, callback_data: 'select_plan_BASIC' }
      ],
      [
        { text: `Профи - ${PLANS.PRO.price} ₽`, callback_data: 'select_plan_PRO' }
      ],
      [
        { text: `Безлимитный - ${PLANS.UNLIMITED.price} ₽`, callback_data: 'select_plan_UNLIMITED' }
      ],
      [
        { text: '« Назад', callback_data: 'back_to_tariff' }
      ]
    ]
  };
  
  // Отправляем сообщение со списком тарифов
  await bot.sendMessage(chatId, message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

/**
 * Показывает детали выбранного тарифа
 * @param {Object} bot - Экземпляр Telegram бота
 * @param {string} planId - ID выбранного тарифа
 * @param {Object} msg - Сообщение от пользователя
 */
async function handleShowPlanDetails(bot, planId, msg) {
  const chatId = msg.chat.id;
  const plan = PLANS[planId];
  
  if (!plan) {
    await bot.sendMessage(chatId, '❌ Тариф не найден');
    return;
  }
  
  let message = `*Тариф "${plan.name}"*\n\n`;
  message += `💰 Стоимость: *${plan.price} ₽*\n`;
  message += `⏱ Период: *${plan.duration} дней*\n\n`;
  
  if (plan.requestLimit >= Number.MAX_SAFE_INTEGER) {
    message += `📊 Количество проверок договоров: *Неограниченно*\n\n`;
  } else {
    message += `📊 Количество проверок договоров: *${plan.requestLimit} в месяц*\n\n`;
  }
  
  message += plan.description;
  
  // Создаем кнопки (отличаются в зависимости от типа тарифа)
  let keyboard;
  
  if (planId === 'FREE') {
    // Для бесплатного тарифа - сразу активировать
    keyboard = {
      inline_keyboard: [
        [
          { text: '✅ Активировать бесплатный тариф', callback_data: `direct_activate_${planId}` }
        ],
        [
          { text: '« Назад к тарифам', callback_data: 'show_plans' }
        ]
      ]
    };
  } else {
    // Для платных тарифов - кнопка оплаты
    keyboard = {
      inline_keyboard: [
        [
          { text: '💳 Оплатить', callback_data: `direct_activate_${planId}` }
        ],
        [
          { text: '« Назад к тарифам', callback_data: 'show_plans' }
        ]
      ]
    };
  }
  
  // Отправляем сообщение с описанием тарифа и кнопками
  await bot.sendMessage(chatId, message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

/**
 * Обработчик выбора тарифа пользователем
 * @param {Object} bot - Экземпляр Telegram бота 
 * @param {string} planId - ID выбранного тарифа
 * @param {Object} msg - Сообщение от пользователя
 */
async function handleSelectPlan(bot, planId, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  // Меняем тариф пользователя
  const result = changePlan(userId, planId);
  
  if (!result.success) {
    await bot.sendMessage(chatId, `❌ Ошибка: ${result.message}`);
    return;
  }
  
  // Формируем сообщение об успешной смене тарифа
  let message = `✅ *Тариф успешно изменен!*\n\n`;
  message += `Вы выбрали тариф *${result.plan.name}*\n\n`;
  
  // Для бесплатного тарифа сразу активируем его
  if (planId === 'FREE') {
    message += 'Бесплатный тариф сразу доступен для использования.\n';
    message += `У вас есть ${result.plan.requestLimit} проверок договоров навсегда.\n`;
    
    // Формируем клавиатуру
    const keyboard = {
      inline_keyboard: [
        [
          { text: 'Просмотреть мой тариф', callback_data: 'show_tariff' }
        ]
      ]
    };
    
    // Отправляем сообщение
    await bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    return;
  }
  
  // Для платных тарифов предлагаем активировать подписку
  message += `Для активации тарифа необходимо оплатить подписку.\n\n`;
  message += `Стоимость: *${result.plan.price} ₽* за месяц\n`;
  
  if (result.plan.requestLimit >= Number.MAX_SAFE_INTEGER) {
    message += `Количество договоров: *Безлимитно*\n\n`;
  } else {
    message += `Количество договоров: *${result.plan.requestLimit} в месяц*\n\n`;
  }
  
  message += 'Нажмите кнопку "Активировать" для имитации оплаты (это демо-версия).';
  
  // Формируем клавиатуру
  const keyboard = {
    inline_keyboard: [
      [
        { text: 'Активировать позже', callback_data: 'show_tariff' }
      ]
    ]
  };
  
  // Отправляем сообщение
  await bot.sendMessage(chatId, message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

/**
 * Прямая активация платного тарифа - изменение тарифа и активация подписки за один шаг
 * @param {Object} bot - Экземпляр Telegram бота 
 * @param {string} planId - ID выбранного тарифа
 * @param {Object} msg - Сообщение от пользователя
 */
async function handleDirectActivation(bot, planId, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  console.log(`[DEBUG] Начало прямой активации тарифа ${planId} для пользователя ${userId}`);
  
  // Проверка на бесплатный тариф
  if (planId === 'FREE') {
    console.log(`[DEBUG] Активация бесплатного тарифа для пользователя ${userId}`);
    await handleSelectPlan(bot, planId, msg);
    return;
  }
  
  // Проверка существования тарифа
  if (!PLANS[planId]) {
    console.log(`[ERROR] Тариф ${planId} не найден`);
    await bot.sendMessage(chatId, `❌ Ошибка: Указанный тариф не найден`);
    return;
  }
  
  try {
    // Сообщаем о начале процесса
    await bot.sendMessage(chatId, 
      `*Активация тарифа "${PLANS[planId].name}"*\n\nПодготовка платежа...`,
      { parse_mode: 'Markdown' }
    );
    
    // Интеграция с ЮКассой - создание платежа
    try {
      const payment = require('../utils/payment');
      const amount = PLANS[planId].price;
      const description = `Оплата тарифа "${PLANS[planId].name}" для бота Doc Checker Pro`;
      
      // Шаг 1: Меняем тариф пользователя
      console.log(`[DEBUG] Изменение тарифа пользователя ${userId} на ${planId}`);
      const changeResult = changePlan(userId, planId);
      
      if (!changeResult.success) {
        console.log(`[ERROR] Ошибка изменения тарифа: ${changeResult.message}`);
        await bot.sendMessage(chatId, `❌ Ошибка: ${changeResult.message}`);
        return;
      }
      
      // Создаем платеж в ЮКассе
      console.log(`[DEBUG] Создание платежа в ЮКассе для пользователя ${userId}, тариф ${planId}, сумма ${amount}`);
      const paymentData = await payment.createPayment(userId, planId, amount, description);
      
      // Получаем URL для оплаты
      const paymentUrl = payment.getPaymentUrl(paymentData);
      
      if (!paymentUrl) {
        throw new Error('Не удалось получить URL для оплаты');
      }
      
      // Формируем сообщение для пользователя
      let message = `*Тариф "${PLANS[planId].name}"*\n\n`;
      message += `💰 Стоимость: *${PLANS[planId].price} ₽*\n`;
      message += `📅 Период: *${PLANS[planId].duration} дней*\n\n`;
      
      if (PLANS[planId].requestLimit >= Number.MAX_SAFE_INTEGER) {
        message += `📊 Количество проверок договоров: *Неограниченно*\n\n`;
      } else {
        message += `📊 Количество проверок договоров: *${PLANS[planId].requestLimit} в месяц*\n\n`;
      }
      
      message += `Для оплаты тарифа нажмите кнопку "Оплатить" ниже и следуйте инструкциям на странице оплаты.\n\n`;
      message += `После успешной оплаты вернитесь в бот и нажмите "Проверить статус оплаты".`;
      
      // Формируем клавиатуру с кнопками
      const keyboard = {
        inline_keyboard: [
          [
            { text: '💳 Оплатить', url: paymentUrl }
          ],
          [
            { text: '🔄 Проверить статус оплаты', callback_data: `check_payment_${paymentData.id}` }
          ],
          [
            { text: '« Назад', callback_data: 'show_tariff' }
          ]
        ]
      };
      
      // Отправляем сообщение с инструкциями по оплате
      await bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
      
      console.log(`[DEBUG] Создана ссылка на оплату для пользователя ${userId}, тариф ${planId}, payment_id=${paymentData.id}`);
      
    } catch (error) {
      console.error(`[ERROR] Ошибка при создании платежа: ${error.message}`);
      await bot.sendMessage(chatId, `❌ Ошибка при создании платежа: ${error.message}`);
    }
  } catch (error) {
    console.error(`[ERROR] Общая ошибка при обработке платежа: ${error.message}`);
    await bot.sendMessage(chatId, `❌ Произошла ошибка: ${error.message}`);
  }
}

/**
 * Обработчик callback-запросов связанных с тарифами
 * @param {Object} bot - Экземпляр Telegram бота
 * @param {Object} query - Callback-запрос
 */
async function handleTariffCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;
  
  try {
    // Сначала отвечаем на запрос, чтобы убрать индикатор загрузки
    await bot.answerCallbackQuery(query.id);
    
    // Показать текущий тариф
    if (data === 'show_tariff') {
      await bot.deleteMessage(chatId, messageId);
      await handleShowTariff(bot, query.message);
      return;
    }
    
    // Показать список доступных тарифов
    if (data === 'show_plans') {
      await bot.deleteMessage(chatId, messageId);
      await handleShowPlans(bot, query.message);
      return;
    }
    
    // Вернуться к информации о тарифе
    if (data === 'back_to_tariff') {
      await bot.deleteMessage(chatId, messageId);
      await handleShowTariff(bot, query.message);
      return;
    }
    
    // Прямая активация тарифа (одновременно выбор и активация)
    if (data.startsWith('direct_activate_')) {
      const planId = data.replace('direct_activate_', '');
      await bot.deleteMessage(chatId, messageId);
      await handleDirectActivation(bot, planId, query.message);
      return;
    }
    
    // Выбор тарифа из списка
    if (data.startsWith('select_plan_')) {
      const planId = data.replace('select_plan_', '');
      await bot.deleteMessage(chatId, messageId);
      await handleShowPlanDetails(bot, planId, query.message);
      return;
    }
    
    // Подтверждение выбора тарифа
    if (data.startsWith('confirm_plan_')) {
      const planId = data.replace('confirm_plan_', '');
      await bot.deleteMessage(chatId, messageId);
      await handleSelectPlan(bot, planId, query.message);
      return;
    }
    
  } catch (error) {
    console.error('Ошибка при обработке запроса:', error);
    await bot.sendMessage(chatId, 'Произошла ошибка при обработке запроса. Попробуйте еще раз.');
  }
}

module.exports = {
  handleShowTariff,
  handleShowPlans,
  handleTariffCallback
}; 