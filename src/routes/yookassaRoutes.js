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
 * Обработка уведомлений (webhook) от ЮKassa - альтернативный endpoint
 */
router.post('/webhook', async (req, res) => {
  try {
    console.log('=== ПОЛУЧЕН WEBHOOK НА АЛЬТЕРНАТИВНЫЙ ENDPOINT /yookassa/webhook ===');
    console.log('- Headers:', JSON.stringify(req.headers));
    console.log('- Body:', JSON.stringify(req.body));
    
    // ВСЕГДА отвечаем 200 сначала, чтобы ЮКасса не повторяла запрос
    res.status(200).send({ success: true });

    // Получаем подпись из заголовка
    const signature = req.headers['webhook-signature'];
    
    if (!signature) {
      console.error('[ERROR] Отсутствует подпись запроса');
      return;
    }
    
    // Обрабатываем уведомление
    const result = await handleNotification(req.body, signature);
    
    if (result.success) {
      // Реализация логики в зависимости от типа события
      const { event, data } = result;
      
      console.log(`[INFO] Обработка события ${event} для объекта ${data.id}`);
      
      switch (event) {
        case 'payment.succeeded':
          // Платеж успешно завершен
          console.log('✅ Платеж успешно завершен:', data.id);
          
          // Получаем метаданные для активации тарифа
          const userId = data.metadata?.userId;
          const planId = data.metadata?.planId;
          
          if (userId && planId) {
            console.log(`[INFO] Активация тарифа ${planId} для пользователя ${userId}`);
            
            // Импортируем функцию активации тарифа
            const { updateUserPlanAfterPayment } = require('../models/userLimits');
            
            try {
              const updateResult = await updateUserPlanAfterPayment(userId, planId, data.id);
              
              if (updateResult.success) {
                console.log(`[SUCCESS] ✅ Тариф ${planId} успешно активирован для пользователя ${userId}`);
              } else {
                console.error(`[ERROR] Ошибка активации тарифа: ${updateResult.message}`);
              }
            } catch (activationError) {
              console.error('[ERROR] Критическая ошибка при активации тарифа:', activationError);
            }
          } else {
            console.warn('[WARN] В метаданных платежа отсутствуют userId или planId');
            console.warn('- Metadata:', JSON.stringify(data.metadata));
          }
          break;
          
        case 'payment.waiting_for_capture':
          // Платеж ожидает подтверждения
          console.log('⏳ Платеж ожидает подтверждения:', data.id);
          break;
          
        case 'payment.canceled':
          // Платеж отменен
          console.log('❌ Платеж отменен:', data.id);
          break;
          
        case 'refund.succeeded':
          // Возврат выполнен
          console.log('💰 Возврат выполнен:', data.id);
          
          // Получаем метаданные для деактивации тарифа
          const refundUserId = data.metadata?.userId;
          
          if (refundUserId) {
            console.log(`[INFO] Обработка возврата для пользователя ${refundUserId}, возврат на тариф FREE`);
            
            try {
              // Импортируем функцию для изменения тарифа
              const { changePlan } = require('../models/userLimits');
              
              // Возвращаем пользователя на бесплатный тариф
              const downgradeResult = await changePlan(refundUserId, 'FREE');
              
              if (downgradeResult.success) {
                console.log(`[SUCCESS] ✅ Пользователь ${refundUserId} переведен на тариф FREE после возврата ${data.id}`);
              } else {
                console.error(`[ERROR] Ошибка перевода на FREE тариф: ${downgradeResult.message}`);
              }
            } catch (refundError) {
              console.error('[ERROR] Критическая ошибка при обработке возврата:', refundError);
            }
          } else {
            console.warn('[WARN] В метаданных возврата отсутствует userId');
            console.warn('- Metadata:', JSON.stringify(data.metadata));
          }
          break;
          
        default:
          console.log(`[INFO] Получено событие ${event} - обработка не требуется`);
      }
    } else {
      console.error('[ERROR] Ошибка обработки уведомления:', result.error);
    }
  } catch (error) {
    console.error('[ERROR] Критическая ошибка при обработке webhook:', error.message);
    // Не возвращаем ошибку, так как уже ответили 200
  }
});

module.exports = router; 