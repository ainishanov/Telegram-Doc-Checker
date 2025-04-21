const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/config');

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
        'Content-Type': 'application/json'
      }
    });
    
    // Добавляем перехватчик для логирования запросов
    this.axios.interceptors.request.use(request => {
      console.log('Исходящий запрос к API ЮКассы:');
      console.log('- Метод:', request.method.toUpperCase());
      console.log('- URL:', request.url);
      console.log('- Заголовки:', JSON.stringify(request.headers));
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
        } else if (error.request) {
          console.error('- Запрос был отправлен, но ответ не получен');
          console.error('- Запрос:', error.request);
        } else {
          console.error('- Ошибка при настройке запроса:', error.message);
        }
        console.error('- Полная ошибка:', error);
        return Promise.reject(error);
      }
    );
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
}

// Инициализация API ЮКассы
const yooKassa = new YooKassaAPI(
  config.yookassaShopId,
  config.yookassaSecretKey,
  config.yookassaTestMode === true
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
      test: config.yookassaTestMode === true // Добавляем флаг тестового платежа
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

module.exports = {
  createPayment,
  checkPaymentStatus,
  processNotification,
  getPaymentUrl
}; 