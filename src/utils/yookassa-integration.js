/**
 * Интеграция с ЮKassa на основе актуального SDK
 * @a2seven/yoo-checkout
 */
const { YooCheckout } = require('@a2seven/yoo-checkout');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/config');

// Инициализация API ЮKassa
const yooCheckout = new YooCheckout({
  shopId: config.yookassaShopId,
  secretKey: config.yookassaSecretKey
});

/**
 * Создание платежа в ЮKassa
 * 
 * @param {number} amount - Сумма платежа
 * @param {string} description - Описание платежа
 * @param {object} metadata - Метаданные платежа (например, ID пользователя, ID тарифа и т.д.)
 * @returns {Promise<object>} - Объект с данными о созданном платеже
 */
async function createPayment(amount, description, metadata = {}) {
  console.log('=== Создание платежа в ЮKassa ===');
  console.log('- Amount:', amount);
  console.log('- Description:', description);
  console.log('- Metadata:', JSON.stringify(metadata));
  
  try {
    // Проверка обязательных параметров
    if (!amount || isNaN(parseFloat(amount))) {
      throw new Error('Сумма платежа должна быть числом');
    }
    
    // Создание объекта платежа
    const createPayloadObj = {
      amount: {
        value: parseFloat(amount).toFixed(2),
        currency: 'RUB'
      },
      confirmation: {
        type: 'redirect',
        return_url: config.yookassaReturnUrl
      },
      capture: true,
      description: description || 'Оплата услуг',
      metadata: metadata
    };
    
    // Если указан метод по умолчанию (например, sberbank) – добавляем в объект
    if (config.yookassaDefaultMethod) {
      createPayloadObj.payment_method_data = {
        type: config.yookassaDefaultMethod
      };
    }
    
    // Если включен тестовый режим
    if (config.yookassaTestMode) {
      createPayloadObj.test = true;
    }
    
    // Идемпотентный ключ для повторных запросов
    const idempotenceKey = uuidv4();
    
    // Выполнение запроса на создание платежа
    const payment = await yooCheckout.createPayment(
      createPayloadObj,
      idempotenceKey
    );
    
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
 * Получение информации о платеже
 * 
 * @param {string} paymentId - Идентификатор платежа
 * @returns {Promise<object>} - Объект с данными о платеже
 */
async function getPaymentInfo(paymentId) {
  console.log(`=== Получение информации о платеже ${paymentId} ===`);
  
  try {
    if (!paymentId) {
      throw new Error('Не указан идентификатор платежа');
    }
    
    const payment = await yooCheckout.getPayment(paymentId);
    
    console.log('=== Информация о платеже получена ===');
    console.log('- Payment ID:', payment.id);
    console.log('- Status:', payment.status);
    console.log('- Paid:', payment.paid);
    
    return payment;
  } catch (error) {
    console.error(`=== Ошибка при получении информации о платеже ${paymentId} ===`);
    console.error('- Error:', error.message);
    
    if (error.response) {
      console.error('- Status:', error.response.status);
      console.error('- Data:', JSON.stringify(error.response.data));
    }
    
    throw error;
  }
}

/**
 * Подтверждение платежа (capture)
 * Используется для двухстадийных платежей
 * 
 * @param {string} paymentId - Идентификатор платежа
 * @param {number} amount - Сумма для подтверждения (может быть меньше или равна исходной)
 * @returns {Promise<object>} - Объект с данными о подтвержденном платеже
 */
async function capturePayment(paymentId, amount = null) {
  console.log(`=== Подтверждение платежа ${paymentId} ===`);
  
  try {
    if (!paymentId) {
      throw new Error('Не указан идентификатор платежа');
    }
    
    // Получаем информацию о платеже, чтобы проверить его статус
    const paymentInfo = await getPaymentInfo(paymentId);
    
    if (paymentInfo.status !== 'waiting_for_capture') {
      throw new Error(`Невозможно подтвердить платеж в статусе ${paymentInfo.status}`);
    }
    
    const capturePayloadObj = {};
    
    // Если указана сумма для подтверждения
    if (amount) {
      capturePayloadObj.amount = {
        value: parseFloat(amount).toFixed(2),
        currency: 'RUB'
      };
    }
    
    // Идемпотентный ключ для повторных запросов
    const idempotenceKey = uuidv4();
    
    // Выполнение запроса на подтверждение платежа
    const payment = await yooCheckout.capturePayment(
      paymentId,
      capturePayloadObj,
      idempotenceKey
    );
    
    console.log('=== Платеж успешно подтвержден ===');
    console.log('- Payment ID:', payment.id);
    console.log('- Status:', payment.status);
    
    return payment;
  } catch (error) {
    console.error(`=== Ошибка при подтверждении платежа ${paymentId} ===`);
    console.error('- Error:', error.message);
    
    if (error.response) {
      console.error('- Status:', error.response.status);
      console.error('- Data:', JSON.stringify(error.response.data));
    }
    
    throw error;
  }
}

/**
 * Отмена платежа
 * 
 * @param {string} paymentId - Идентификатор платежа
 * @returns {Promise<object>} - Объект с данными об отмененном платеже
 */
async function cancelPayment(paymentId) {
  console.log(`=== Отмена платежа ${paymentId} ===`);
  
  try {
    if (!paymentId) {
      throw new Error('Не указан идентификатор платежа');
    }
    
    // Идемпотентный ключ для повторных запросов
    const idempotenceKey = uuidv4();
    
    // Выполнение запроса на отмену платежа
    const payment = await yooCheckout.cancelPayment(
      paymentId,
      idempotenceKey
    );
    
    console.log('=== Платеж успешно отменен ===');
    console.log('- Payment ID:', payment.id);
    console.log('- Status:', payment.status);
    
    return payment;
  } catch (error) {
    console.error(`=== Ошибка при отмене платежа ${paymentId} ===`);
    console.error('- Error:', error.message);
    
    if (error.response) {
      console.error('- Status:', error.response.status);
      console.error('- Data:', JSON.stringify(error.response.data));
    }
    
    throw error;
  }
}

/**
 * Создание возврата
 * 
 * @param {string} paymentId - Идентификатор платежа
 * @param {number} amount - Сумма для возврата
 * @param {string} description - Описание возврата
 * @returns {Promise<object>} - Объект с данными о созданном возврате
 */
async function createRefund(paymentId, amount, description = '') {
  console.log(`=== Создание возврата для платежа ${paymentId} ===`);
  console.log('- Amount:', amount);
  
  try {
    if (!paymentId) {
      throw new Error('Не указан идентификатор платежа');
    }
    
    if (!amount || isNaN(parseFloat(amount))) {
      throw new Error('Сумма возврата должна быть числом');
    }
    
    // Создание объекта возврата
    const createRefundObj = {
      payment_id: paymentId,
      amount: {
        value: parseFloat(amount).toFixed(2),
        currency: 'RUB'
      }
    };
    
    // Если указано описание
    if (description) {
      createRefundObj.description = description;
    }
    
    // Идемпотентный ключ для повторных запросов
    const idempotenceKey = uuidv4();
    
    // Выполнение запроса на создание возврата
    const refund = await yooCheckout.createRefund(
      createRefundObj,
      idempotenceKey
    );
    
    console.log('=== Возврат успешно создан ===');
    console.log('- Refund ID:', refund.id);
    console.log('- Status:', refund.status);
    
    return refund;
  } catch (error) {
    console.error(`=== Ошибка при создании возврата для платежа ${paymentId} ===`);
    console.error('- Error:', error.message);
    
    if (error.response) {
      console.error('- Status:', error.response.status);
      console.error('- Data:', JSON.stringify(error.response.data));
    }
    
    throw error;
  }
}

/**
 * Обработка уведомления от ЮKassa (webhook)
 * 
 * @param {object} body - Тело запроса от ЮKassa
 * @param {string} signature - Подпись запроса из заголовка Webhook-Signature
 * @returns {Promise<object>} - Обработанные данные уведомления
 */
async function handleNotification(body, signature) {
  console.log('=== Получено уведомление от ЮKassa ===');
  
  try {
    // Проверка подписи запроса
    const eventPayload = await yooCheckout.handleNotificationEvent(body, signature);
    
    // Тип события
    const eventType = eventPayload.event;
    console.log('- Event Type:', eventType);
    
    // Объект платежа или возврата
    const data = eventPayload.object;
    console.log('- Object ID:', data.id);
    console.log('- Object Status:', data.status);
    
    // Обработка события в зависимости от типа
    switch (eventType) {
      case 'payment.succeeded':
        // Платеж успешно оплачен
        console.log('=== Платеж успешно оплачен ===');
        break;
        
      case 'payment.waiting_for_capture':
        // Платеж ожидает подтверждения
        console.log('=== Платеж ожидает подтверждения ===');
        break;
        
      case 'payment.canceled':
        // Платеж отменен
        console.log('=== Платеж отменен ===');
        break;
        
      case 'refund.succeeded':
        // Возврат успешно выполнен
        console.log('=== Возврат успешно выполнен ===');
        break;
        
      default:
        console.log(`=== Получено неизвестное событие ${eventType} ===`);
    }
    
    return {
      success: true,
      event: eventType,
      data: data
    };
  } catch (error) {
    console.error('=== Ошибка при обработке уведомления от ЮKassa ===');
    console.error('- Error:', error.message);
    
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  createPayment,
  getPaymentInfo,
  capturePayment,
  cancelPayment,
  createRefund,
  handleNotification
}; 