const express = require('express');
const router = express.Router();
const { updateUserPlanAfterPayment } = require('../models/userLimits');
const { checkPaymentStatus, processNotification } = require('../utils/payment');

/**
 * Обработка успешной оплаты
 */
router.get('/success', async (req, res) => {
  try {
    const paymentId = req.query.payment_id;
    
    if (!paymentId) {
      return res.status(400).send('Отсутствует ID платежа');
    }
    
    // Проверяем статус платежа
    const payment = await checkPaymentStatus(paymentId);
    
    if (payment.status === 'succeeded' && payment.paid === true) {
      // Получаем данные пользователя из метаданных
      const userId = payment.metadata?.userId;
      const planId = payment.metadata?.planId;
      
      if (userId && planId) {
        // Обновляем тариф пользователя
        await updateUserPlanAfterPayment(userId, planId, payment.id);
        
        return res.send(`
          <html>
            <head>
              <title>Оплата успешно завершена</title>
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body { 
                  font-family: Arial, sans-serif; 
                  text-align: center; 
                  padding: 20px;
                  max-width: 600px;
                  margin: 0 auto;
                }
                .success {
                  color: #4CAF50;
                  font-size: 24px;
                  margin-bottom: 20px;
                }
                .info {
                  margin-bottom: 20px;
                  line-height: 1.5;
                }
                .button {
                  display: inline-block;
                  background-color: #2196F3;
                  color: white;
                  padding: 12px 20px;
                  text-decoration: none;
                  border-radius: 4px;
                  font-weight: bold;
                }
              </style>
            </head>
            <body>
              <h1 class="success">Оплата успешно завершена!</h1>
              <p class="info">
                Ваш тариф успешно активирован. Теперь вы можете вернуться в Telegram и продолжить использование бота.
              </p>
              <a class="button" href="https://t.me/DocCheckerProBot">Вернуться к боту</a>
            </body>
          </html>
        `);
      }
    }
    
    return res.status(400).send('Ошибка при обработке платежа. Пожалуйста, свяжитесь с поддержкой.');
  } catch (error) {
    console.error('Ошибка при обработке успешного платежа:', error);
    res.status(500).send('Произошла ошибка при обработке запроса');
  }
});

/**
 * Обработка уведомлений от ЮКассы
 */
router.post('/notification', express.json(), async (req, res) => {
  try {
    const notification = req.body;
    
    // Проверяем, что это уведомление о платеже
    if (!notification || !notification.event || !notification.object) {
      return res.status(400).json({ error: 'Неверный формат уведомления' });
    }
    
    // Обрабатываем уведомление
    const paymentData = processNotification(notification);
    
    if (notification.event === 'payment.succeeded' && paymentData.paid) {
      // Обновляем тариф пользователя
      await updateUserPlanAfterPayment(
        paymentData.userId,
        paymentData.planId,
        paymentData.paymentId
      );
      
      console.log(`Платеж ${paymentData.paymentId} успешно обработан для пользователя ${paymentData.userId}`);
    } else if (notification.event === 'payment.canceled') {
      console.log(`Платеж ${paymentData.paymentId} отменен для пользователя ${paymentData.userId}`);
    }
    
    // Всегда отправляем HTTP 200, даже при ошибках обработки
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Ошибка при обработке уведомления от ЮКассы:', error);
    
    // Всегда отправляем HTTP 200, чтобы ЮКасса не пыталась повторить запрос
    return res.status(200).json({ success: false, error: error.message });
  }
});

module.exports = router; 