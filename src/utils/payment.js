const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/config');

// Настройка для ЮКассы
const { yookassaShopId, yookassaSecretKey, yookassaTestMode } = config;

// Класс для работы с API ЮКассы
class YooKassaAPI {
  constructor(shopId, secretKey, isTestMode = false) {
    this.shopId = shopId;
    this.secretKey = secretKey;
    this.isTestMode = isTestMode;
    this.baseURL = 'https://api.yookassa.ru/v3';
    
    console.log('Инициализация API ЮКассы:');
    console.log('- Shop ID:', this.shopId);
    console.log('- Тестовый режим:', this.isTestMode ? 'Да' : 'Нет');
    console.log('- Base URL:', this.baseURL);
    
    this.axios = axios.create({
      baseURL: this.baseURL,
      auth: {
        username: this.shopId,
        password: this.secretKey
      },
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    
    // Добавляем перехватчик для логирования запросов
    this.axios.interceptors.request.use(request => {
      // Скрываем секретный ключ в логах
      const maskedHeaders = { ...request.headers };
      if (maskedHeaders.authorization) {
        maskedHeaders.authorization = 'Basic ******** (скрыт)';
      }
      
      console.log('Исходящий запрос к API ЮКассы:');
      console.log('- Метод:', request.method.toUpperCase());
      console.log('- URL:', request.baseURL + request.url);
      console.log('- Заголовки:', JSON.stringify(maskedHeaders));
      if (request.data) {
        console.log('- Данные:', JSON.stringify(request.data));
      }
      return request;
    });
    
    // Добавляем перехватчик для логирования ответов
    this.axios.interceptors.response.use(
      response => {
        console.log('Ответ от API ЮКассы:');
        console.log('- Статус:', response.status);
        console.log('- Данные:', JSON.stringify(response.data));
        return response;
      },
      error => {
        console.error('Ошибка при запросе к API ЮКассы:');
        if (error.response) {
          console.error('- Статус:', error.response.status);
          console.error('- Данные:', JSON.stringify(error.response.data));
          
          if (error.response.status === 401) {
            console.error('- ОШИБКА АВТОРИЗАЦИИ: Неверный идентификатор магазина или секретный ключ');
            console.error('- Проверьте настройки YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY в файле .env');
            
            if (this.secretKey.startsWith('test_')) {
              console.error('- У вас используется тестовый ключ (начинается с test_)');
              console.error('- Проверьте, что ваш shopId также является тестовым (должен начинаться с цифры 5)');
              console.error('- Тестовый shopId и тестовый ключ должны быть получены в личном кабинете ЮКассы, раздел "Настройки" → "API" → "Тестовые платежи"');
            } else {
              console.error('- У вас используется боевой ключ');
              console.error('- Убедитесь, что вы используете правильный shopId и secretKey');
            }
          }
        } else if (error.request) {
          console.error('- Запрос был отправлен, но ответ не получен');
          console.error('- Запрос:', error.request);
        } else {
          console.error('- Ошибка при настройке запроса:', error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Проверка подключения к ЮКассе (получение информации о магазине)
   * @returns {Promise<Object>} - Информация о магазине
   */
  async checkConnection() {
    try {
      console.log('Проверка подключения к API ЮКассы (получение информации о магазине)');
      const response = await this.axios.get('/me');
      return response.data;
    } catch (error) {
      console.error('Ошибка при проверке подключения к ЮКассе:');
      if (error.response && error.response.data) {
        console.error('- Детали ошибки:', JSON.stringify(error.response.data));
      }
      throw error;
    }
  }

  /**
   * Создать платеж
   * @param {Object} payload - Данные платежа
   * @param {string} idempotenceKey - Ключ идемпотентности
   * @returns {Promise<Object>} - Ответ от API
   */
  async createPayment(payload, idempotenceKey) {
    try {
      console.log(`Отправка запроса на создание платежа (idempotenceKey: ${idempotenceKey})`);
      
      const response = await this.axios.post('/payments', payload, {
        headers: {
          'Idempotence-Key': idempotenceKey
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Ошибка при создании платежа:');
      
      if (error.response && error.response.data) {
        console.error('- Детали ошибки:', JSON.stringify(error.response.data));
      }
      
      throw error;
    }
  }

  /**
   * Получить информацию о платеже
   * @param {string} paymentId - ID платежа
   * @returns {Promise<Object>} - Ответ от API
   */
  async getPayment(paymentId) {
    try {
      console.log(`Отправка запроса на получение платежа (paymentId: ${paymentId})`);
      
      const response = await this.axios.get(`/payments/${paymentId}`);
      
      return response.data;
    } catch (error) {
      console.error('Ошибка при получении платежа:');
      
      if (error.response && error.response.data) {
        console.error('- Детали ошибки:', JSON.stringify(error.response.data));
      }
      
      throw error;
    }
  }

  /**
   * Создать выплату через ЮКассу
   * @param {Object} payload - данные для создания выплаты
   * @param {string} idempotenceKey - ключ идемпотентности
   * @returns {Promise<Object>} - данные созданной выплаты
   */
  async createPayout(payload, idempotenceKey) {
    try {
      // Добавляем параметр test, если включен тестовый режим
      if (this.isTestMode) {
        payload.test = true;
      }
      
      const response = await this.axios.post('/payouts', payload, {
        headers: {
          'Idempotence-Key': idempotenceKey || uuidv4()
        }
      });
      
      console.log(`[YooKassa] Выплата создана: ${response.data.id}`);
      return response.data;
    } catch (error) {
      console.error(`[YooKassa] Ошибка создания выплаты: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Получает информацию о выплате
   * @param {string} payoutId - ID выплаты
   * @returns {Promise<Object>} - данные выплаты
   */
  async getPayout(payoutId) {
    try {
      const response = await this.axios.get(`/payouts/${payoutId}`);
      console.log(`[YooKassa] Получена информация о выплате: ${payoutId}`);
      return response.data;
    } catch (error) {
      console.error(`[YooKassa] Ошибка получения информации о выплате: ${error.message}`);
      throw error;
    }
  }
}

// Инициализация API ЮКассы
const yooKassa = new YooKassaAPI(
  yookassaShopId,
  yookassaSecretKey,
  yookassaTestMode === true
);

/**
 * Создает платеж в ЮКассе
 * @param {string} userId - ID пользователя
 * @param {string} planId - ID тарифного плана
 * @param {number} amount - Сумма платежа
 * @param {string} description - Описание платежа
 * @returns {Promise<Object>} - Данные о созданном платеже
 */
async function createPayment(userId, planId, amount, description) {
  try {
    console.log('=== Создание платежа в ЮКассе ===');
    console.log('- User ID:', userId);
    console.log('- Plan ID:', planId);
    console.log('- Amount:', amount);
    console.log('- Description:', description);
    console.log('- Return URL:', config.yookassaReturnUrl);
    console.log('- Тестовый режим:', config.yookassaTestMode === true ? 'Да' : 'Нет');
    
    // Проверяем настройки YooKassa
    if (!yookassaShopId || !yookassaSecretKey) {
      console.error('[ERROR] Не указаны обязательные параметры YooKassa (shopId или secretKey)');
      throw new Error('Не настроены параметры платежной системы. Пожалуйста, обратитесь к администратору бота.');
    }
    
    // Проверяем shopId на валидность для тестового режима
    if (yookassaTestMode && !yookassaShopId.toString().startsWith('5')) {
      console.error('[ERROR] Для тестового режима YooKassa shopId должен начинаться с цифры 5');
      console.error('- Текущий shopId:', yookassaShopId);
      console.error('- Для тестовых платежей используйте shopId и secretKey из раздела "Тестовые платежи" в личном кабинете YooKassa');
      throw new Error('Неверная конфигурация тестового режима YooKassa. Пожалуйста, обратитесь к администратору бота.');
    }
    
    // Проверяем secretKey на соответствие тестовому режиму
    if (yookassaTestMode && !yookassaSecretKey.startsWith('test_')) {
      console.error('[ERROR] Для тестового режима YooKassa secretKey должен начинаться с "test_"');
      console.error('- Текущий secretKey начинается с:', yookassaSecretKey.substring(0, 5) + '...');
      console.error('- Для тестовых платежей используйте shopId и secretKey из раздела "Тестовые платежи" в личном кабинете YooKassa');
      throw new Error('Неверная конфигурация тестового режима YooKassa. Пожалуйста, обратитесь к администратору бота.');
    }
    
    if (!yookassaTestMode && yookassaSecretKey.startsWith('test_')) {
      console.error('[ERROR] Для боевого режима YooKassa secretKey не должен начинаться с "test_"');
      console.error('- Вы используете тестовый ключ в боевом режиме');
      console.error('- Установите YOOKASSA_TEST_MODE=true в .env или используйте боевой ключ');
      throw new Error('Неверная конфигурация YooKassa. Пожалуйста, обратитесь к администратору бота.');
    }
    
    // Проверяем, что return_url указан и является валидным URL
    if (!config.yookassaReturnUrl || !config.yookassaReturnUrl.startsWith('http')) {
      console.error('[ERROR] Не указан или неверный формат YOOKASSA_RETURN_URL в настройках');
      console.error('- Текущий return_url:', config.yookassaReturnUrl);
      console.error('- URL должен начинаться с http:// или https://');
      throw new Error('Неверная конфигурация YooKassa return_url. Пожалуйста, обратитесь к администратору бота.');
    }
    
    // Сначала проверим подключение к ЮКассе
    try {
      console.log('=== Проверка подключения к ЮКассе ===');
      const shopInfo = await yooKassa.checkConnection();
      console.log('=== Подключение к ЮКассе успешно ===');
      console.log('- Shop ID:', shopInfo.id);
      console.log('- Shop Name:', shopInfo.name);
      console.log('- Shop Status:', shopInfo.status);
    } catch (error) {
      console.error('=== Ошибка при проверке подключения к ЮКассе ===');
      console.error('- Error:', error.message);
      
      // Проверяем статус ошибки
      if (error.response && error.response.status === 401) {
        // Ошибка авторизации - формируем подробное сообщение
        let errorMessage = 'Ошибка авторизации в платежной системе YooKassa (401 Unauthorized).';
        
        if (yookassaSecretKey.startsWith('test_')) {
          errorMessage += ' Вы используете тестовый ключ. Убедитесь, что shopId также является тестовым (начинается с цифры 5).';
        } else {
          errorMessage += ' Проверьте правильность указанных shopId и secretKey в настройках бота.';
        }
        
        // Добавляем рекомендации по настройке
        errorMessage += ' Настройки могут быть получены в личном кабинете YooKassa, раздел API.';
        
        throw new Error(errorMessage);
      }
      
      // Для других ошибок просто пробрасываем дальше
      throw error;
    }
    
    const idempotenceKey = uuidv4();
    console.log('- Idempotence Key:', idempotenceKey);
    
    const paymentData = {
      amount: {
        value: amount.toFixed(2),
        currency: 'RUB'
      },
      confirmation: {
        type: 'redirect',
        return_url: config.yookassaReturnUrl
      },
      capture: true,
      description: description || `Оплата тарифа ${planId} для пользователя ${userId}`,
      metadata: {
        userId: userId,
        planId: planId
      },
      test: yookassaTestMode === true // Добавляем флаг тестового платежа
    };
    
    const payment = await yooKassa.createPayment(paymentData, idempotenceKey);
    
    console.log('=== Платеж успешно создан ===');
    console.log('- Payment ID:', payment.id);
    console.log('- Status:', payment.status);
    console.log('- Confirmation URL:', payment.confirmation?.confirmation_url);
    
    return payment;
  } catch (error) {
    console.error('=== Ошибка при создании платежа ===');
    console.error('- Error:', error.message);
    
    if (error.response) {
      console.error('- Status:', error.response.status);
      console.error('- Data:', JSON.stringify(error.response.data));
    }
    
    throw error;
  }
}

/**
 * Проверяет статус платежа
 * @param {string} paymentId - ID платежа в ЮКассе
 * @returns {Promise<Object>} - Данные о платеже
 */
async function checkPaymentStatus(paymentId) {
  try {
    console.log('=== Проверка статуса платежа ===');
    console.log('- Payment ID:', paymentId);
    
    const payment = await yooKassa.getPayment(paymentId);
    
    console.log('=== Статус платежа получен ===');
    console.log('- Status:', payment.status);
    console.log('- Paid:', payment.paid);
    
    return payment;
  } catch (error) {
    console.error('=== Ошибка при проверке статуса платежа ===');
    console.error('- Error:', error.message);
    
    if (error.response) {
      console.error('- Status:', error.response.status);
      console.error('- Data:', JSON.stringify(error.response.data));
    }
    
    throw error;
  }
}

/**
 * Обрабатывает уведомление о платеже от ЮКассы
 * @param {Object} notification - Уведомление от ЮКассы
 * @returns {Object} - Данные о платеже
 */
function processNotification(notification) {
  try {
    console.log('=== Обработка уведомления от ЮКассы ===');
    console.log('- Event:', notification.event);
    
    // Проверяем тип уведомления
    if (notification.event !== 'payment.succeeded' && 
        notification.event !== 'payment.waiting_for_capture' &&
        notification.event !== 'payment.canceled') {
      throw new Error(`Неизвестный тип уведомления: ${notification.event}`);
    }
    
    const payment = notification.object;
    
    // Извлекаем данные из метаданных
    const userId = payment.metadata?.userId;
    const planId = payment.metadata?.planId;
    
    if (!userId || !planId) {
      throw new Error('В метаданных платежа отсутствуют userId или planId');
    }
    
    const result = {
      paymentId: payment.id,
      status: payment.status,
      paid: payment.paid,
      amount: payment.amount.value,
      currency: payment.amount.currency,
      description: payment.description,
      userId: userId,
      planId: planId,
      createdAt: payment.created_at
    };
    
    console.log('=== Уведомление обработано ===');
    console.log('- Payment ID:', result.paymentId);
    console.log('- Status:', result.status);
    console.log('- User ID:', result.userId);
    console.log('- Plan ID:', result.planId);
    
    return result;
  } catch (error) {
    console.error('=== Ошибка при обработке уведомления ===');
    console.error('- Error:', error.message);
    throw error;
  }
}

/**
 * Возвращает URL для оплаты
 * @param {Object} payment - Объект платежа от ЮКассы
 * @returns {string|null} - URL для перенаправления на страницу оплаты
 */
function getPaymentUrl(payment) {
  if (payment.confirmation && payment.confirmation.confirmation_url) {
    return payment.confirmation.confirmation_url;
  }
  return null;
}

/**
 * Создает выплату в ЮКассе
 * @param {string} destinationType - Тип получателя выплаты (yoo_money, bank_card и др.)
 * @param {string} accountNumber - Номер счета/карты получателя
 * @param {number} amount - Сумма выплаты
 * @param {string} description - Описание выплаты
 * @param {Object} metadata - Дополнительные данные для выплаты
 * @returns {Promise<Object>} - Данные о созданной выплате
 */
async function createPayout(destinationType, accountNumber, amount, description, metadata = {}) {
  try {
    console.log('=== Создание выплаты в ЮКассе ===');
    console.log('- Destination Type:', destinationType);
    console.log('- Account Number:', accountNumber.substring(0, 4) + '****' + accountNumber.slice(-4));
    console.log('- Amount:', amount);
    console.log('- Description:', description);
    console.log('- Test Mode:', yookassaTestMode === true ? 'Да' : 'Нет');
    
    // Проверяем настройки YooKassa
    if (!yookassaShopId || !yookassaSecretKey) {
      console.error('[ERROR] Не указаны обязательные параметры YooKassa (shopId или secretKey)');
      throw new Error('Не настроены параметры платежной системы. Пожалуйста, обратитесь к администратору бота.');
    }
    
    // Сначала проверим подключение к ЮКассе
    try {
      console.log('=== Проверка подключения к ЮКассе ===');
      await yooKassa.checkConnection();
      console.log('=== Подключение к ЮКассе успешно ===');
    } catch (error) {
      console.error('=== Ошибка при проверке подключения к ЮКассе ===');
      console.error('- Error:', error.message);
      throw error;
    }
    
    const idempotenceKey = uuidv4();
    console.log('- Idempotence Key:', idempotenceKey);
    
    const payoutData = {
      amount: {
        value: amount.toFixed(2),
        currency: 'RUB'
      },
      payout_destination: {
        type: destinationType,
        account_number: accountNumber
      },
      description: description || 'Выплата средств',
      metadata: metadata,
      test: yookassaTestMode === true // Добавляем флаг тестовой выплаты
    };
    
    // Создаем выплату через API ЮКассы
    const response = await yooKassa.axios.post('/payouts', payoutData, {
      headers: {
        'Idempotence-Key': idempotenceKey
      }
    });
    
    const payout = response.data;
    
    console.log('=== Выплата успешно создана ===');
    console.log('- Payout ID:', payout.id);
    console.log('- Status:', payout.status);
    
    return payout;
  } catch (error) {
    console.error('=== Ошибка при создании выплаты ===');
    console.error('- Error:', error.message);
    
    if (error.response) {
      console.error('- Status:', error.response.status);
      console.error('- Data:', JSON.stringify(error.response.data));
    }
    
    throw error;
  }
}

/**
 * Проверяет статус выплаты
 * @param {string} payoutId - ID выплаты в ЮКассе
 * @returns {Promise<Object>} - Данные о выплате
 */
async function checkPayoutStatus(payoutId) {
  try {
    console.log('=== Проверка статуса выплаты ===');
    console.log('- Payout ID:', payoutId);
    
    const response = await yooKassa.axios.get(`/payouts/${payoutId}`);
    const payout = response.data;
    
    console.log('=== Статус выплаты получен ===');
    console.log('- Status:', payout.status);
    
    return payout;
  } catch (error) {
    console.error('=== Ошибка при проверке статуса выплаты ===');
    console.error('- Error:', error.message);
    
    if (error.response) {
      console.error('- Status:', error.response.status);
      console.error('- Data:', JSON.stringify(error.response.data));
    }
    
    throw error;
  }
}

/**
 * Обрабатывает уведомление о выплате от ЮКассы
 * @param {Object} notification - Уведомление от ЮКассы
 * @returns {Object} - Данные о выплате
 */
function processPayoutNotification(notification) {
  try {
    console.log('=== Обработка уведомления о выплате от ЮКассы ===');
    
    if (!notification || !notification.id || !notification.id.startsWith('po-')) {
      throw new Error('Невалидное уведомление о выплате');
    }
    
    console.log('- Payout ID:', notification.id);
    console.log('- Status:', notification.status);
    
    // Извлекаем метаданные
    const metadata = notification.metadata || {};
    
    const result = {
      payoutId: notification.id,
      status: notification.status,
      amount: notification.amount.value,
      currency: notification.amount.currency,
      description: notification.description,
      createdAt: notification.created_at,
      metadata: metadata,
      success: true
    };
    
    console.log('=== Уведомление о выплате обработано ===');
    
    return result;
  } catch (error) {
    console.error('=== Ошибка при обработке уведомления о выплате ===');
    console.error('- Error:', error.message);
    return {
      success: false,
      message: error.message
    };
  }
}

module.exports = {
  createPayment,
  checkPaymentStatus,
  processNotification,
  getPaymentUrl,
  // Экспортируем функции для работы с выплатами
  createPayout,
  checkPayoutStatus,
  processPayoutNotification,
  yooKassa
}; 