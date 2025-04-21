const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/config');

// Класс для работы с API ЮКассы
class YooKassaAPI {
  constructor(shopId, secretKey) {
    this.shopId = shopId;
    this.secretKey = secretKey;
    this.baseURL = 'https://api.yookassa.ru/v3';
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
  }

  /**
   * Создать платеж
   * @param {Object} payload - Данные платежа
   * @param {string} idempotenceKey - Ключ идемпотентности
   * @returns {Promise<Object>} - Ответ от API
   */
  async createPayment(payload, idempotenceKey) {
    try {
      const response = await this.axios.post('/payments', payload, {
        headers: {
          'Idempotence-Key': idempotenceKey
        }
      });
      return response.data;
    } catch (error) {
      console.error('YooKassa API Error:', error.response ? error.response.data : error.message);
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
      const response = await this.axios.get(`/payments/${paymentId}`);
      return response.data;
    } catch (error) {
      console.error('YooKassa API Error:', error.response ? error.response.data : error.message);
      throw error;
    }
  }
}

// Инициализация API ЮКассы
const yooKassa = new YooKassaAPI(
  config.yookassaShopId,
  config.yookassaSecretKey
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
    console.log('Создание платежа в ЮКассе...');
    console.log('ShopID:', config.yookassaShopId);
    console.log('Amount:', amount);
    
    const idempotenceKey = uuidv4();
    
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
      }
    };
    
    console.log('Отправка запроса на создание платежа:', JSON.stringify(paymentData, null, 2));
    
    const payment = await yooKassa.createPayment(paymentData, idempotenceKey);
    console.log('Ответ API ЮКассы:', JSON.stringify(payment, null, 2));
    
    return payment;
  } catch (error) {
    console.error('Ошибка при создании платежа в ЮКассе:', error);
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
    console.log('Проверка статуса платежа:', paymentId);
    const payment = await yooKassa.getPayment(paymentId);
    console.log('Статус платежа:', payment.status);
    return payment;
  } catch (error) {
    console.error('Ошибка при проверке статуса платежа:', error);
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
    console.log('Обработка уведомления от ЮКассы:', JSON.stringify(notification, null, 2));
    
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
    
    console.log('Обработанные данные платежа:', JSON.stringify(result, null, 2));
    
    return result;
  } catch (error) {
    console.error('Ошибка при обработке уведомления:', error);
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