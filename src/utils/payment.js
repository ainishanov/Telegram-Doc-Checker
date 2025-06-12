const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/config');

// Настройка для ЮКассы
const { yookassaShopId, yookassaSecretKey, yookassaTestMode } = config;

// Отладочный вывод параметров платежной системы
console.log('=== ДИАГНОСТИКА YOOKASSA ===');
console.log('- ID Магазина:', yookassaShopId ? yookassaShopId : 'НЕ УСТАНОВЛЕН');
console.log('- Секретный ключ:', yookassaSecretKey ? 'Установлен (начинается с ' + yookassaSecretKey.substring(0, 5) + '...)' : 'НЕ УСТАНОВЛЕН');
console.log('- Тестовый режим:', yookassaTestMode === true ? 'Да' : 'Нет');
console.log('- Возвратный URL:', config.yookassaReturnUrl || 'НЕ УСТАНОВЛЕН');
console.log('=== КОНЕЦ ДИАГНОСТИКИ ===');

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
      console.log(`[YooKassa] Запрос на создание выплаты (idempotenceKey: ${idempotenceKey || 'автогенерация'})`);
      
      // Валидация обязательных полей
      if (!payload.amount || !payload.amount.value || !payload.amount.currency) {
        throw new Error('Не указаны обязательные параметры amount.value или amount.currency');
      }
      
      if (!payload.payout_destination || !payload.payout_destination.type) {
        throw new Error('Не указан тип получателя выплаты (payout_destination.type)');
      }
      
      // Добавляем параметр test, если включен тестовый режим
      if (this.isTestMode) {
        payload.test = true;
        console.log('[YooKassa] Выплата создается в тестовом режиме');
      }
      
      // Генерируем idempotenceKey если не передан
      const key = idempotenceKey || uuidv4();
      
      const response = await this.axios.post('/payouts', payload, {
        headers: {
          'Idempotence-Key': key
        }
      });
      
      console.log(`[YooKassa] Выплата успешно создана: ${response.data.id}`);
      console.log(`[YooKassa] Статус выплаты: ${response.data.status}`);
      console.log(`[YooKassa] Сумма выплаты: ${response.data.amount.value} ${response.data.amount.currency}`);
      
      return response.data;
    } catch (error) {
      console.error(`[YooKassa] Ошибка создания выплаты: ${error.message}`);
      
      if (error.response) {
        const errorData = error.response.data;
        console.error(`[YooKassa] HTTP статус: ${error.response.status}`);
        
        if (errorData && errorData.code) {
          console.error(`[YooKassa] Код ошибки: ${errorData.code}`);
          console.error(`[YooKassa] Описание: ${errorData.description || 'Нет описания'}`);
          
          // Специфические рекомендации в зависимости от кода ошибки
          switch (errorData.code) {
            case 'invalid_credentials':
              console.error('[YooKassa] Ошибка авторизации. Проверьте shopId и secretKey');
              break;
            case 'insufficient_funds':
              console.error('[YooKassa] Недостаточно средств для выплаты');
              break;
            case 'invalid_destination':
              console.error('[YooKassa] Неверно указаны данные получателя платежа');
              break;
            case 'forbidden':
              console.error('[YooKassa] Выполнение операции запрещено. Возможно, ваш магазин не имеет прав на выплаты. Проверьте настройки в личном кабинете ЮКассы');
              break;
          }
        }
      }
      
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
      console.log(`[YooKassa] Запрос информации о выплате: ${payoutId}`);
      
      // Проверка формата ID выплаты
      if (!payoutId || !payoutId.startsWith('po-')) {
        throw new Error(`Неверный формат ID выплаты: ${payoutId}. ID должен начинаться с "po-"`);
      }
      
      const response = await this.axios.get(`/payouts/${payoutId}`);
      
      console.log(`[YooKassa] Получена информация о выплате: ${payoutId}`);
      console.log(`[YooKassa] Статус выплаты: ${response.data.status}`);
      console.log(`[YooKassa] Сумма выплаты: ${response.data.amount.value} ${response.data.amount.currency}`);
      
      return response.data;
    } catch (error) {
      console.error(`[YooKassa] Ошибка получения информации о выплате: ${error.message}`);
      
      if (error.response) {
        const errorData = error.response.data;
        console.error(`[YooKassa] HTTP статус: ${error.response.status}`);
        
        if (error.response.status === 404) {
          console.error(`[YooKassa] Выплата с ID ${payoutId} не найдена`);
        }
        
        if (errorData && errorData.code) {
          console.error(`[YooKassa] Код ошибки: ${errorData.code}`);
          console.error(`[YooKassa] Описание: ${errorData.description || 'Нет описания'}`);
        }
      }
      
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
    
    // Повторная проверка загрузки конфигурации из-за возможного повреждения данных в памяти
    console.log('=== ПРОВЕРКА КОНФИГУРАЦИИ YOOKASSA ПРИ СОЗДАНИИ ПЛАТЕЖА ===');
    console.log('- yookassaShopId:', yookassaShopId || 'НЕ ОПРЕДЕЛЕН');
    console.log('- yookassaSecretKey:', yookassaSecretKey ? `${yookassaSecretKey.substring(0, 5)}...` : 'НЕ ОПРЕДЕЛЕН');
    console.log('- yookassaTestMode:', yookassaTestMode);
    console.log('- yookassaReturnUrl:', config.yookassaReturnUrl);
    console.log('=== КОНЕЦ ПРОВЕРКИ КОНФИГУРАЦИИ ===');
    
    console.log('- Return URL:', config.yookassaReturnUrl);
    console.log('- Тестовый режим:', config.yookassaTestMode === true ? 'Да' : 'Нет');
    
    // Проверяем настройки YooKassa
    if (!yookassaShopId || !yookassaSecretKey) {
      console.error('[ERROR] Не указаны обязательные параметры YooKassa (shopId или secretKey)');
      throw new Error('Не настроены параметры платежной системы. Пожалуйста, обратитесь к администратору бота.');
    }
    
    // Проверяем shopId на валидность для тестового режима
    /* Отключаем эту проверку, т.к. формат тестового shopId может отличаться
    if (yookassaTestMode && !yookassaShopId.toString().startsWith('5')) {
      console.error('[ERROR] Для тестового режима YooKassa shopId должен начинаться с цифры 5');
      console.error('- Текущий shopId:', yookassaShopId);
      console.error('- Для тестовых платежей используйте shopId и secretKey из раздела "Тестовые платежи" в личном кабинете YooKassa');
      throw new Error('Неверная конфигурация тестового режима YooKassa. Пожалуйста, обратитесь к администратору бота.');
    }
    */
    // Проверка соответствия shopId и тестового режима, с учетом, что формат ID может быть любой
    console.log(`[INFO] Используется shopId ${yookassaShopId} в ${yookassaTestMode ? 'тестовом' : 'боевом'} режиме`);
    
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
      receipt: {
        customer: {
          email: 'nishanov.ainur@gmail.com' // Используем email компании в качестве email покупателя
        },
        items: [
          {
            description: description || `Оплата тарифа ${planId}`,
            amount: {
              value: amount.toFixed(2),
              currency: 'RUB'
            },
            vat_code: 1, // НДС не облагается
            quantity: '1'
          }
        ]
      }
    };

    // Добавляем флаг тестового платежа только для тестового режима
    if (yookassaTestMode === true) {
      paymentData.test = true;
    }

    // Если указан метод по умолчанию (например, sberbank), добавляем его в payment_method_data
    if (config.yookassaDefaultMethod) {
      paymentData.payment_method_data = {
        type: config.yookassaDefaultMethod
      };
    }
    
    console.log('=== ДАННЫЕ ЗАПРОСА НА СОЗДАНИЕ ПЛАТЕЖА ===');
    console.log('- Полные данные запроса:', JSON.stringify(paymentData, null, 2));
    console.log('=== ОТПРАВКА ЗАПРОСА В ЮКАССУ ===');
    
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
    
    // Маскируем номер карты/счета в логах для безопасности
    const maskedAccount = accountNumber ? 
      (accountNumber.length > 8 ? accountNumber.substring(0, 4) + '****' + accountNumber.slice(-4) : '****' + accountNumber.slice(-4)) : 
      'Не указан';
    
    console.log('- Account Number:', maskedAccount);
    console.log('- Amount:', amount);
    console.log('- Description:', description);
    console.log('- Test Mode:', yookassaTestMode === true ? 'Да' : 'Нет');
    
    // Проверки входных данных
    if (!destinationType) {
      throw new Error('Не указан тип получателя выплаты (destinationType)');
    }
    
    if (!accountNumber) {
      throw new Error('Не указан номер счета/карты получателя (accountNumber)');
    }
    
    if (!amount || amount <= 0) {
      throw new Error('Сумма выплаты должна быть положительным числом');
    }
    
    // Валидация типа получателя
    const validTypes = ['yoo_money', 'bank_card', 'sbp', 'bank_account'];
    if (!validTypes.includes(destinationType)) {
      console.warn(`[WARN] Нестандартный тип получателя: ${destinationType}. Ожидаемые типы: ${validTypes.join(', ')}`);
    }
    
    // Валидация формата счета в зависимости от типа
    if (destinationType === 'bank_card' && !/^\d{16,19}$/.test(accountNumber)) {
      console.warn('[WARN] Номер карты должен содержать от 16 до 19 цифр');
    } else if (destinationType === 'yoo_money' && !/^\d{11,33}$/.test(accountNumber)) {
      console.warn('[WARN] Номер кошелька YooMoney должен содержать от 11 до 33 цифр');
    }
    
    // Проверяем настройки YooKassa
    if (!yookassaShopId || !yookassaSecretKey) {
      console.error('[ERROR] Не указаны обязательные параметры YooKassa (shopId или secretKey)');
      throw new Error('Не настроены параметры платежной системы. Пожалуйста, обратитесь к администратору бота.');
    }
    
    // Сначала проверим подключение к ЮКассе
    try {
      console.log('=== Проверка подключения к ЮКассе ===');
      const shopInfo = await yooKassa.checkConnection();
      console.log('=== Подключение к ЮКассе успешно ===');
      console.log('- Shop ID:', shopInfo.id);
      console.log('- Shop Name:', shopInfo.name);
      console.log('- Shop Status:', shopInfo.status);
      
      // Проверяем наличие прав на проведение выплат
      const payoutBalanceEnabled = shopInfo.status === 'enabled' && 
                                  shopInfo.fiscal_enabled !== false &&
                                  shopInfo.payout_balance;
                                  
      if (!payoutBalanceEnabled) {
        console.warn('[WARN] Возможно, у магазина отсутствуют права на проведение выплат');
        console.warn('Проверьте настройки в личном кабинете ЮКассы, раздел "Настройки интеграции" → "Выплаты"');
      }
    } catch (error) {
      console.error('=== Ошибка при проверке подключения к ЮКассе ===');
      console.error('- Error:', error.message);
      
      if (error.response && error.response.status === 401) {
        throw new Error('Ошибка авторизации в ЮКассе. Проверьте shopId и secretKey в настройках.');
      }
      
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
    
    // Если тип назначения - банковский счет, нужны дополнительные параметры
    if (destinationType === 'bank_account') {
      if (!metadata.first_name || !metadata.last_name || !metadata.bic) {
        console.error('[ERROR] Для выплат на банковский счет необходимы дополнительные данные');
        throw new Error('Для выплат на банковский счет требуются ФИО получателя и БИК банка. Добавьте их в поле metadata.');
      }
      
      // Добавляем данные для банковского счета
      payoutData.payout_destination.bank_name = metadata.bank_name || '';
      payoutData.payout_destination.bic = metadata.bic;
      payoutData.payout_destination.recipient = {
        first_name: metadata.first_name,
        last_name: metadata.last_name,
        middle_name: metadata.middle_name || '',
        inn: metadata.inn || ''
      };
    }
    
    // Добавляем self_employed если это выплата самозанятому
    if (metadata.self_employed === true) {
      payoutData.self_employed = {
        confirmed: true
      };
    }
    
    // Создаем выплату через метод класса YooKassaAPI
    const payout = await yooKassa.createPayout(payoutData, idempotenceKey);
    
    console.log('=== Выплата успешно создана ===');
    console.log('- Payout ID:', payout.id);
    console.log('- Status:', payout.status);
    console.log('- Amount:', `${payout.amount.value} ${payout.amount.currency}`);
    console.log('- Created At:', payout.created_at);
    
    return payout;
  } catch (error) {
    console.error('=== Ошибка при создании выплаты ===');
    console.error('- Error:', error.message);
    
    if (error.response) {
      console.error('- Status:', error.response.status);
      console.error('- Data:', JSON.stringify(error.response.data));
      
      // Анализируем ошибку и выводим понятное сообщение
      if (error.response.status === 403) {
        throw new Error('Нет прав на создание выплат. Проверьте настройки магазина в личном кабинете ЮКассы.');
      } else if (error.response.status === 400) {
        const errorData = error.response.data;
        if (errorData && errorData.code === 'invalid_request') {
          throw new Error(`Ошибка в запросе: ${errorData.description || 'Проверьте формат данных'}`);
        } else if (errorData && errorData.code === 'insufficient_funds') {
          throw new Error('Недостаточно средств на балансе для совершения выплаты.');
        }
      }
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
    
    // Проверяем формат ID выплаты
    if (!payoutId) {
      throw new Error('Не указан ID выплаты');
    }
    
    if (!payoutId.startsWith('po-')) {
      console.warn(`[WARN] Нестандартный формат ID выплаты: ${payoutId}. ID выплаты должен начинаться с "po-"`);
    }
    
    // Используем метод класса YooKassaAPI для получения информации о выплате
    const payout = await yooKassa.getPayout(payoutId);
    
    console.log('=== Статус выплаты получен ===');
    console.log('- Status:', payout.status);
    console.log('- Amount:', `${payout.amount.value} ${payout.amount.currency}`);
    console.log('- Created At:', payout.created_at);
    
    // Информативное сообщение о статусе
    switch (payout.status) {
      case 'pending':
        console.log('- Выплата находится в обработке, статус ещё не известен');
        break;
      case 'succeeded':
        console.log('- Выплата успешно зачислена получателю');
        break;
      case 'canceled':
        console.log('- Выплата отменена');
        if (payout.cancellation_details && payout.cancellation_details.reason) {
          console.log(`- Причина отмены: ${payout.cancellation_details.reason}`);
          console.log(`- Описание: ${payout.cancellation_details.party || 'Не указано'}`);
        }
        break;
      default:
        console.log(`- Неизвестный статус выплаты: ${payout.status}`);
    }
    
    return payout;
  } catch (error) {
    console.error('=== Ошибка при проверке статуса выплаты ===');
    console.error('- Error:', error.message);
    
    if (error.response) {
      console.error('- Status:', error.response.status);
      console.error('- Data:', JSON.stringify(error.response.data));
      
      if (error.response.status === 404) {
        throw new Error(`Выплата с ID ${payoutId} не найдена`);
      } else if (error.response.status === 401) {
        throw new Error('Ошибка авторизации. Проверьте настройки API ЮКассы');
      }
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
    console.log('- Notification Type:', notification.event || 'Не указан');
    
    // Проверяем структуру уведомления
    if (!notification || !notification.event) {
      throw new Error('Невалидное уведомление: отсутствует поле event');
    }
    
    // Проверяем тип уведомления
    if (notification.event !== 'payout.succeeded' && 
        notification.event !== 'payout.canceled') {
      console.warn(`[WARN] Неожиданный тип уведомления: ${notification.event}`);
    }
    
    // Проверяем наличие объекта выплаты
    if (!notification.object || !notification.object.id) {
      throw new Error('Невалидное уведомление: отсутствует объект выплаты');
    }
    
    const payout = notification.object;
    console.log('- Payout ID:', payout.id);
    console.log('- Status:', payout.status);
    
    // Извлекаем метаданные
    const metadata = payout.metadata || {};
    
    const result = {
      payoutId: payout.id,
      status: payout.status,
      amount: payout.amount.value,
      currency: payout.amount.currency,
      description: payout.description,
      createdAt: payout.created_at,
      metadata: metadata,
      success: payout.status === 'succeeded',
      canceled: payout.status === 'canceled',
      cancellationDetails: payout.cancellation_details || null
    };
    
    // Дополнительная информация, если выплата была отменена
    if (payout.status === 'canceled' && payout.cancellation_details) {
      console.log('- Причина отмены:', payout.cancellation_details.reason || 'Не указана');
      console.log('- Инициатор отмены:', payout.cancellation_details.party || 'Не указан');
    }
    
    console.log('=== Уведомление о выплате обработано ===');
    console.log('- Результат:', payout.status === 'succeeded' ? 'Успешно' : 'Не успешно');
    
    return result;
  } catch (error) {
    console.error('=== Ошибка при обработке уведомления о выплате ===');
    console.error('- Error:', error.message);
    return {
      success: false,
      message: error.message,
      error: true,
      raw: notification // Сохраняем исходное уведомление для отладки
    };
  }
}

// Функция для получения баланса выплат
async function getPayoutBalance() {
  try {
    console.log('=== Запрос баланса для выплат ===');
    
    // Проверка подключения и получение информации о магазине
    const shopInfo = await yooKassa.checkConnection();
    
    // Проверяем наличие информации о балансе выплат
    if (!shopInfo.payout_balance) {
      console.warn('[WARN] Информация о балансе выплат отсутствует в ответе API');
      return {
        available: false,
        message: 'Баланс выплат недоступен. Возможно, функция выплат не подключена для вашего магазина'
      };
    }
    
    const payoutBalance = shopInfo.payout_balance;
    
    console.log('=== Баланс для выплат получен ===');
    console.log('- Доступный баланс:', `${payoutBalance.amount} ${payoutBalance.currency}`);
    
    return {
      available: true,
      amount: payoutBalance.amount,
      currency: payoutBalance.currency
    };
  } catch (error) {
    console.error('=== Ошибка при получении баланса для выплат ===');
    console.error('- Error:', error.message);
    
    if (error.response) {
      console.error('- Status:', error.response.status);
      console.error('- Data:', JSON.stringify(error.response.data));
    }
    
    throw error;
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
  getPayoutBalance,
  yooKassa
}; 