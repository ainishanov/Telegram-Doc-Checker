/**
 * Маршруты для обработки платежей ЮKassa
 */
const express = require('express');
const router = express.Router();
const { 
  createPayment, 
  getPaymentInfo, 
  capturePayment, 
  cancelPayment, 
  createRefund, 
  handleNotification 
} = require('../utils/yookassa-integration');

/**
 * Обработка успешного платежа
 */
router.get('/success', async (req, res) => {
  try {
    const { paymentId } = req.query;
    
    if (!paymentId) {
      return res.status(400).send({
        success: false,
        error: 'Отсутствует идентификатор платежа'
      });
    }
    
    // Получаем актуальную информацию о платеже
    const payment = await getPaymentInfo(paymentId);
    
    if (payment.status === 'succeeded') {
      // Здесь можно обновить статус заказа в базе данных
      // и выполнить другие действия при успешной оплате
      
      return res.status(200).send({
        success: true,
        payment
      });
    } else {
      return res.status(200).send({
        success: false,
        message: 'Платеж не завершен',
        payment
      });
    }
  } catch (error) {
    console.error('Ошибка при обработке успешного платежа:', error.message);
    
    return res.status(500).send({
      success: false,
      error: 'Ошибка сервера при обработке платежа'
    });
  }
});

/**
 * Создание нового платежа
 */
router.post('/create', async (req, res) => {
  try {
    const { amount, description, metadata } = req.body;
    
    if (!amount) {
      return res.status(400).send({
        success: false,
        error: 'Сумма платежа обязательна'
      });
    }
    
    // Создаем платеж в ЮKassa
    const payment = await createPayment(amount, description, metadata);
    
    return res.status(200).send({
      success: true,
      payment
    });
  } catch (error) {
    console.error('Ошибка при создании платежа:', error.message);
    
    return res.status(500).send({
      success: false,
      error: error.message
    });
  }
});

/**
 * Получение информации о платеже
 */
router.get('/info/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;
    
    if (!paymentId) {
      return res.status(400).send({
        success: false,
        error: 'Идентификатор платежа обязателен'
      });
    }
    
    // Получаем информацию о платеже
    const payment = await getPaymentInfo(paymentId);
    
    return res.status(200).send({
      success: true,
      payment
    });
  } catch (error) {
    console.error('Ошибка при получении информации о платеже:', error.message);
    
    return res.status(500).send({
      success: false,
      error: error.message
    });
  }
});

/**
 * Подтверждение платежа (для двухстадийных платежей)
 */
router.post('/capture/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { amount } = req.body;
    
    if (!paymentId) {
      return res.status(400).send({
        success: false,
        error: 'Идентификатор платежа обязателен'
      });
    }
    
    // Подтверждаем платеж
    const payment = await capturePayment(paymentId, amount);
    
    return res.status(200).send({
      success: true,
      payment
    });
  } catch (error) {
    console.error('Ошибка при подтверждении платежа:', error.message);
    
    return res.status(500).send({
      success: false,
      error: error.message
    });
  }
});

/**
 * Отмена платежа
 */
router.post('/cancel/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;
    
    if (!paymentId) {
      return res.status(400).send({
        success: false,
        error: 'Идентификатор платежа обязателен'
      });
    }
    
    // Отменяем платеж
    const payment = await cancelPayment(paymentId);
    
    return res.status(200).send({
      success: true,
      payment
    });
  } catch (error) {
    console.error('Ошибка при отмене платежа:', error.message);
    
    return res.status(500).send({
      success: false,
      error: error.message
    });
  }
});

/**
 * Создание возврата
 */
router.post('/refund', async (req, res) => {
  try {
    const { paymentId, amount, description } = req.body;
    
    if (!paymentId || !amount) {
      return res.status(400).send({
        success: false,
        error: 'Идентификатор платежа и сумма возврата обязательны'
      });
    }
    
    // Создаем возврат
    const refund = await createRefund(paymentId, amount, description);
    
    return res.status(200).send({
      success: true,
      refund
    });
  } catch (error) {
    console.error('Ошибка при создании возврата:', error.message);
    
    return res.status(500).send({
      success: false,
      error: error.message
    });
  }
});

/**
 * Обработка уведомлений (webhook) от ЮKassa
 */
router.post('/webhook', async (req, res) => {
  try {
    // Получаем подпись из заголовка
    const signature = req.headers['webhook-signature'];
    
    if (!signature) {
      return res.status(400).send({
        success: false,
        error: 'Отсутствует подпись запроса'
      });
    }
    
    // Обрабатываем уведомление
    const result = await handleNotification(req.body, signature);
    
    if (result.success) {
      // Реализация логики в зависимости от типа события
      const { event, data } = result;
      
      switch (event) {
        case 'payment.succeeded':
          // Платеж успешно завершен
          console.log('Платеж успешно завершен:', data.id);
          // Обновление статуса заказа в базе данных
          break;
          
        case 'payment.waiting_for_capture':
          // Платеж ожидает подтверждения
          console.log('Платеж ожидает подтверждения:', data.id);
          // Отправка уведомления администратору о необходимости подтверждения
          break;
          
        case 'payment.canceled':
          // Платеж отменен
          console.log('Платеж отменен:', data.id);
          // Обновление статуса заказа в базе данных
          break;
          
        case 'refund.succeeded':
          // Возврат выполнен
          console.log('Возврат выполнен:', data.id);
          // Обновление статуса заказа в базе данных
          break;
      }
      
      // Возвращаем успешный ответ
      return res.status(200).send({ success: true });
    } else {
      return res.status(400).send({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Ошибка при обработке уведомления:', error.message);
    
    return res.status(500).send({
      success: false,
      error: error.message
    });
  }
});

module.exports = router; 