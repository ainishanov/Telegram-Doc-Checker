const fs = require('fs');
const path = require('path');

// Путь к файлу с данными пользователей
const USERS_DATA_FILE = path.join(__dirname, '../../data/users.json');

// Обеспечиваем существование директории data
if (!fs.existsSync(path.join(__dirname, '../../data'))) {
  fs.mkdirSync(path.join(__dirname, '../../data'), { recursive: true });
}

// Инициализируем файл с данными пользователей, если он не существует
if (!fs.existsSync(USERS_DATA_FILE)) {
  fs.writeFileSync(USERS_DATA_FILE, JSON.stringify({}), 'utf8');
}

/**
 * Доступные тарифные планы
 */
const PLANS = {
  FREE: {
    id: 'FREE',
    name: 'Бесплатный',
    price: 0,
    requestLimit: 3,
    duration: 0, // бессрочно
    description: 'Базовый анализ договоров с лимитом 3 документа навсегда.',
    features: [
      '3 проверки договоров бессрочно'
    ]
  },
  BASIC: {
    id: 'BASIC',
    name: 'Базовый',
    price: 290,
    requestLimit: 10,
    duration: 30, // 30 дней
    description: 'Анализ договоров с лимитом 10 документов в месяц.',
    features: [
      '10 проверок договоров в месяц'
    ]
  },
  PRO: {
    id: 'PRO',
    name: 'Профессиональный',
    price: 990,
    requestLimit: 50,
    duration: 30, // 30 дней
    description: 'Анализ договоров с лимитом 50 документов в месяц.',
    features: [
      '50 проверок договоров в месяц'
    ]
  },
  UNLIMITED: {
    id: 'UNLIMITED',
    name: 'Безлимитный',
    price: 4990,
    requestLimit: Infinity,
    duration: 30, // 30 дней
    description: 'Неограниченное количество проверок договоров в месяц.',
    features: [
      'Неограниченное количество проверок договоров в месяц'
    ]
  }
};

/**
 * Получить данные пользователя
 * @param {string} userId - ID пользователя
 * @returns {Object} - Данные пользователя
 */
function getUserData(userId) {
  try {
    // Читаем данные всех пользователей
    const usersData = JSON.parse(fs.readFileSync(USERS_DATA_FILE, 'utf8'));
    
    // Если данных нет, создаем стандартные
    if (!usersData[userId]) {
      const defaultData = {
        userId: userId,
        plan: 'FREE',
        requestsUsed: 0,
        registrationDate: new Date().toISOString(),
        subscriptionData: {
          active: false,
          planId: null,
          startDate: null,
          endDate: null,
          paymentStatus: 'none' // none, pending, paid
        }
      };
      
      usersData[userId] = defaultData;
      // Сохраняем обновленные данные
      fs.writeFileSync(USERS_DATA_FILE, JSON.stringify(usersData, null, 2), 'utf8');
      return defaultData;
    }
    
    return usersData[userId];
  } catch (error) {
    console.error('Ошибка при получении данных пользователя:', error);
    // Возвращаем стандартные данные в случае ошибки
    return {
      userId: userId,
      plan: 'FREE',
      requestsUsed: 0,
      registrationDate: new Date().toISOString(),
      subscriptionData: {
        active: false,
        planId: null,
        startDate: null,
        endDate: null,
        paymentStatus: 'none'
      }
    };
  }
}

/**
 * Сохранить данные пользователя
 * @param {string} userId - ID пользователя
 * @param {Object} data - Новые данные
 * @returns {Object} - Обновленные данные пользователя
 */
function saveUserData(userId, data) {
  try {
    console.log(`[DEBUG] Сохранение данных для пользователя ${userId}: plan=${data.plan}`);
    
    // Читаем данные всех пользователей
    const usersData = JSON.parse(fs.readFileSync(USERS_DATA_FILE, 'utf8'));
    
    // Обновляем данные конкретного пользователя
    // Используем деструктуризацию для создания нового объекта с сохранением существующих данных
    usersData[userId] = { 
      ...usersData[userId] || {}, 
      ...data,
      // Явно указываем важные поля, чтобы убедиться, что они сохранятся
      plan: data.plan
    };
    
    console.log(`[DEBUG] Данные пользователя ${userId} перед сохранением: ${JSON.stringify(usersData[userId])}`);
    
    // Сохраняем обновленные данные в файл
    fs.writeFileSync(USERS_DATA_FILE, JSON.stringify(usersData, null, 2), 'utf8');
    
    // Проверяем, что данные были сохранены
    const verifyData = JSON.parse(fs.readFileSync(USERS_DATA_FILE, 'utf8'))[userId];
    if (verifyData.plan !== data.plan) {
      console.error(`[ERROR] Данные не были корректно сохранены. Ожидалось plan=${data.plan}, получено plan=${verifyData.plan}`);
    }
    
    return usersData[userId];
  } catch (error) {
    console.error(`[ERROR] Ошибка при сохранении данных пользователя ${userId}:`, error);
    return null;
  }
}

/**
 * Получить текущий тариф пользователя
 * @param {string} userId - ID пользователя
 * @returns {Object} - Информация о тарифе
 */
function getUserPlan(userId) {
  const userData = getUserData(userId);
  const planId = userData.plan || 'FREE';
  
  // Возвращаем информацию о текущем тарифе
  return {
    ...PLANS[planId],
    requestsUsed: userData.requestsUsed || 0,
    requestsRemaining: Math.max(0, PLANS[planId].requestLimit - (userData.requestsUsed || 0)),
    subscription: userData.subscriptionData || { active: false }
  };
}

/**
 * Проверить, может ли пользователь делать запросы
 * @param {string} userId - ID пользователя
 * @returns {Object} - Результат проверки
 */
function canUserMakeRequest(userId) {
  const userData = getUserData(userId);
  const planInfo = getUserPlan(userId);
  
  // Для платных тарифов проверяем активность подписки
  if (planInfo.id !== 'FREE' && (!userData.subscriptionData || !userData.subscriptionData.active)) {
    return {
      allowed: false,
      reason: 'subscription_inactive',
      message: 'Ваша подписка неактивна. Пожалуйста, активируйте платный тариф.'
    };
  }
  
  // Проверяем, не исчерпан ли лимит запросов
  if (userData.requestsUsed >= planInfo.requestLimit) {
    return {
      allowed: false,
      reason: 'limit_reached',
      message: 'Вы исчерпали лимит запросов по вашему тарифу. Рассмотрите возможность перехода на более высокий тариф.'
    };
  }
  
  return {
    allowed: true,
    reason: 'ok',
    requestsRemaining: planInfo.requestLimit - userData.requestsUsed
  };
}

/**
 * Зарегистрировать использование запроса
 * @param {string} userId - ID пользователя
 * @returns {Object} - Обновленные данные о запросах
 */
function registerRequestUsage(userId) {
  const userData = getUserData(userId);
  
  // Увеличиваем счетчик использованных запросов
  userData.requestsUsed = (userData.requestsUsed || 0) + 1;
  
  // Сохраняем обновленные данные
  const updatedData = saveUserData(userId, userData);
  
  return {
    requestsUsed: updatedData.requestsUsed,
    planId: updatedData.plan,
    requestsRemaining: Math.max(0, PLANS[updatedData.plan].requestLimit - updatedData.requestsUsed)
  };
}

/**
 * Изменить тариф пользователя
 * @param {string} userId - ID пользователя
 * @param {string} planId - ID нового тарифа
 * @returns {Object} - Результат операции
 */
function changePlan(userId, planId) {
  // Проверяем существование тарифа
  if (!PLANS[planId]) {
    return {
      success: false,
      message: 'Указанный тариф не существует'
    };
  }
  
  const userData = getUserData(userId);
  
  // Создаем данные для обновления
  const newData = {
    ...userData,
    plan: planId
  };
  
  // Если это бесплатный тариф, сбрасываем данные подписки
  if (planId === 'FREE') {
    newData.subscriptionData = {
      active: false,
      planId: null,
      startDate: null,
      endDate: null,
      paymentStatus: 'none'
    };
  } else {
    // Для платных тарифов устанавливаем статус ожидания оплаты
    newData.subscriptionData = {
      active: false,
      planId: planId,
      startDate: null,
      endDate: null,
      paymentStatus: 'pending'
    };
  }
  
  // Сохраняем обновленные данные
  const updatedData = saveUserData(userId, newData);
  
  if (!updatedData) {
    return {
      success: false,
      message: 'Ошибка при обновлении тарифа'
    };
  }
  
  return {
    success: true,
    message: `Тариф успешно изменен на "${PLANS[planId].name}"`,
    plan: PLANS[planId]
  };
}

/**
 * Активировать подписку на платный тариф
 * @param {string} userId - ID пользователя
 * @returns {Object} - Результат операции
 */
function activateSubscription(userId) {
  const userData = getUserData(userId);
  
  console.log(`[DEBUG] Активация подписки для пользователя ${userId}, текущий тариф: ${userData.plan}`);
  
  // Проверяем, что у пользователя выбран платный тариф
  if (!userData.plan || userData.plan === 'FREE') {
    console.log(`[ERROR] Нельзя активировать подписку для бесплатного тарифа у пользователя ${userId}`);
    return {
      success: false,
      message: 'Нельзя активировать подписку для бесплатного тарифа'
    };
  }
  
  // Проверяем существование тарифа
  if (!PLANS[userData.plan]) {
    console.log(`[ERROR] Указанный тариф ${userData.plan} не найден`);
    return {
      success: false,
      message: `Выбранный тариф "${userData.plan}" не найден`
    };
  }
  
  // Рассчитываем даты начала и окончания подписки (1 месяц)
  const startDate = new Date();
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + 1);
  
  // Обновляем данные подписки
  const subscriptionData = {
    active: true,
    planId: userData.plan,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    paymentStatus: 'paid'
  };
  
  console.log(`[DEBUG] Создание подписки для пользователя ${userId}: ${JSON.stringify(subscriptionData)}`);
  
  // Убеждаемся, что сохраняем правильное значение plan и subscriptionData
  const dataToSave = {
    ...userData,
    // Явно указываем plan, чтобы убедиться, что он не потеряется
    plan: userData.plan,
    subscriptionData: subscriptionData
  };
  
  // Сохраняем обновленные данные
  const updatedData = saveUserData(userId, dataToSave);
  
  if (!updatedData) {
    console.log(`[ERROR] Ошибка при сохранении данных подписки для пользователя ${userId}`);
    return {
      success: false,
      message: 'Ошибка при активации подписки'
    };
  }
  
  // Проверяем, что данные действительно обновились
  const verifyData = getUserData(userId);
  if (!verifyData.subscriptionData || !verifyData.subscriptionData.active) {
    console.log(`[ERROR] Данные подписки не были сохранены корректно: ${JSON.stringify(verifyData)}`);
    return {
      success: false,
      message: 'Ошибка при проверке активации подписки'
    };
  }
  
  console.log(`[DEBUG] Подписка успешно активирована для пользователя ${userId}, тариф: ${verifyData.plan}`);
  
  return {
    success: true,
    message: 'Подписка успешно активирована',
    subscription: subscriptionData
  };
}

/**
 * Получить информацию обо всех доступных тарифах
 * @returns {Array} - Массив доступных тарифов
 */
function getAllPlans() {
  return Object.values(PLANS);
}

// Экспортируем функции
module.exports = {
  getUserData,
  saveUserData,
  getUserPlan,
  canUserMakeRequest,
  registerRequestUsage,
  changePlan,
  activateSubscription,
  getAllPlans,
  PLANS
}; 