const express = require('express');
const router = express.Router();
const { createPayment, checkPaymentStatus, processNotification, getPaymentUrl } = require('../utils/payment');
const { getUserData, changePlan, updateUserPlanAfterPayment, PLANS } = require('../models/userLimits');
const db = require('../utils/db');
const config = require('../config/config');

/**
 * Обработка успешной оплаты
 */
router.get('/success', async (req, res) => {
  try {
    const { userId, paymentId } = req.query;
    
    if (!userId || !paymentId) {
      console.error('[ERROR] В запросе успешного платежа отсутствуют userId или paymentId');
      return res.status(400).send(`
        <html>
          <head>
            <title>Ошибка платежа</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { 
                font-family: Arial, sans-serif; 
                text-align: center; 
                padding: 20px;
                max-width: 600px;
                margin: 0 auto;
                color: #333;
              }
              .error {
                color: #D32F2F;
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
                margin-top: 20px;
              }
            </style>
          </head>
          <body>
            <h1 class="error">Ошибка обработки платежа</h1>
            <p class="info">
              Отсутствуют необходимые параметры для обработки платежа. Пожалуйста, вернитесь в Telegram и попробуйте оплатить тариф снова.
            </p>
            <a class="button" href="https://t.me/DocCheckerProBot">Вернуться к боту</a>
          </body>
        </html>
      `);
    }

    // Проверяем статус платежа
    const payment = await checkPaymentStatus(paymentId);
    
    if (!payment || !payment.status) {
      console.error(`[ERROR] Ошибка проверки статуса платежа ${paymentId} для пользователя ${userId}`);
      return res.status(400).send(`
        <html>
          <head>
            <title>Ошибка платежа</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { 
                font-family: Arial, sans-serif; 
                text-align: center; 
                padding: 20px;
                max-width: 600px;
                margin: 0 auto;
                color: #333;
              }
              .error {
                color: #D32F2F;
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
                margin-top: 20px;
              }
            </style>
          </head>
          <body>
            <h1 class="error">Ошибка проверки платежа</h1>
            <p class="info">
              Не удалось проверить статус вашего платежа. Пожалуйста, подождите несколько минут и проверьте статус своей подписки в боте.
            </p>
            <a class="button" href="https://t.me/DocCheckerProBot">Вернуться к боту</a>
          </body>
        </html>
      `);
    }

    // Проверяем, что платеж успешен
    if (payment.status === 'succeeded' && payment.paid === true) {
      // Получаем метаданные платежа
      const metadata = payment.metadata || {};
      const planId = metadata.planId;
      
      if (!planId) {
        console.error(`[ERROR] В метаданных платежа ${paymentId} отсутствует planId`);
        return res.status(400).send(`
          <html>
            <head>
              <title>Ошибка платежа</title>
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body { 
                  font-family: Arial, sans-serif; 
                  text-align: center; 
                  padding: 20px;
                  max-width: 600px;
                  margin: 0 auto;
                  color: #333;
                }
                .error {
                  color: #D32F2F;
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
                  margin-top: 20px;
                }
              </style>
            </head>
            <body>
              <h1 class="error">Ошибка активации тарифа</h1>
              <p class="info">
                Не удалось определить тариф для активации. Платеж прошел успешно, но в данных платежа отсутствует информация о выбранном тарифе.
                Пожалуйста, свяжитесь с поддержкой через бот, сообщив ID платежа: <strong>${paymentId}</strong>
              </p>
              <a class="button" href="https://t.me/DocCheckerProBot">Вернуться к боту</a>
            </body>
          </html>
        `);
      }

      // Используем новую функцию для обновления тарифа после оплаты
      const updateResult = await updateUserPlanAfterPayment(userId, planId, paymentId);
      
      if (!updateResult.success) {
        console.error(`[ERROR] Ошибка обновления тарифа ${planId} для пользователя ${userId}: ${updateResult.message}`);
        return res.status(500).send(`
          <html>
            <head>
              <title>Ошибка активации</title>
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body { 
                  font-family: Arial, sans-serif; 
                  text-align: center; 
                  padding: 20px;
                  max-width: 600px;
                  margin: 0 auto;
                  color: #333;
                }
                .error {
                  color: #D32F2F;
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
                  margin-top: 20px;
                }
              </style>
            </head>
            <body>
              <h1 class="error">Ошибка активации тарифа</h1>
              <p class="info">
                Платеж прошел успешно, но возникла ошибка при активации выбранного тарифа. Пожалуйста, свяжитесь с поддержкой через бот,
                сообщив ID платежа: <strong>${paymentId}</strong>
              </p>
              <a class="button" href="https://t.me/DocCheckerProBot">Вернуться к боту</a>
            </body>
          </html>
        `);
      }

      // Успешно обновили тариф - показываем страницу с успешной оплатой
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
                color: #333;
                background-color: #f9f9f9;
              }
              .success {
                color: #4CAF50;
                font-size: 24px;
                margin-bottom: 20px;
              }
              .info {
                margin-bottom: 20px;
                line-height: 1.5;
                background-color: #fff;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              }
              .button {
                display: inline-block;
                background-color: #2196F3;
                color: white;
                padding: 12px 20px;
                text-decoration: none;
                border-radius: 4px;
                font-weight: bold;
                margin-top: 20px;
                transition: background-color 0.3s;
              }
              .button:hover {
                background-color: #1976D2;
              }
              .tariff-details {
                margin: 20px 0;
                padding: 15px;
                background-color: #E8F5E9;
                border-radius: 8px;
                text-align: left;
              }
              .tariff-name {
                font-weight: bold;
                color: #2E7D32;
                font-size: 18px;
              }
              .payment-id {
                font-size: 12px;
                color: #757575;
                margin-top: 20px;
              }
            </style>
          </head>
          <body>
            <h1 class="success">Оплата успешно завершена!</h1>
            <div class="info">
              <p>Ваш тариф успешно активирован и готов к использованию.</p>
              
              <div class="tariff-details">
                <p class="tariff-name">Тариф: ${planId}</p>
                <p>Статус: Активен</p>
                <p>Дата активации: ${new Date().toLocaleDateString()}</p>
              </div>
              
              <p>Теперь вы можете вернуться в Telegram и продолжить использование бота со всеми преимуществами вашего тарифа.</p>
            </div>
            
            <a class="button" href="https://t.me/DocCheckerProBot">Вернуться к боту</a>
            
            <p class="payment-id">ID платежа: ${paymentId}</p>
          </body>
        </html>
      `);
    } else {
      console.error(`[ERROR] Платеж ${paymentId} имеет статус ${payment.status}, ожидался статус succeeded`);
      return res.status(400).send(`
        <html>
          <head>
            <title>Платеж не завершен</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { 
                font-family: Arial, sans-serif; 
                text-align: center; 
                padding: 20px;
                max-width: 600px;
                margin: 0 auto;
                color: #333;
              }
              .warning {
                color: #FF9800;
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
                margin-top: 20px;
              }
              .status {
                font-weight: bold;
                color: #FF5722;
              }
            </style>
          </head>
          <body>
            <h1 class="warning">Платеж не завершен</h1>
            <p class="info">
              Ваш платеж имеет статус <span class="status">${payment.status}</span> и еще не завершен или был отклонен.
              Пожалуйста, проверьте состояние платежа в своем банке и повторите попытку оплаты, если необходимо.
            </p>
            <a class="button" href="https://t.me/DocCheckerProBot">Вернуться к боту</a>
          </body>
        </html>
      `);
    }
  } catch (error) {
    console.error('[ERROR] Ошибка при обработке успешного платежа:', error);
    return res.status(500).send(`
      <html>
        <head>
          <title>Ошибка обработки платежа</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { 
              font-family: Arial, sans-serif; 
              text-align: center; 
              padding: 20px;
              max-width: 600px;
              margin: 0 auto;
              color: #333;
            }
            .error {
              color: #D32F2F;
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
              margin-top: 20px;
            }
          </style>
        </head>
        <body>
          <h1 class="error">Произошла ошибка</h1>
          <p class="info">
            При обработке платежа произошла непредвиденная ошибка. Пожалуйста, вернитесь в бот и свяжитесь с поддержкой или повторите попытку позднее.
          </p>
          <a class="button" href="https://t.me/DocCheckerProBot">Вернуться к боту</a>
        </body>
      </html>
    `);
  }
});

/**
 * Обработка уведомлений от ЮКассы
 */
router.post('/notifications', async (req, res) => {
  try {
    // Проверяем и обрабатываем уведомление
    const notification = await processNotification(req.body);
    
    if (!notification || !notification.success) {
      console.error('[ERROR] Получено невалидное уведомление о платеже:', notification ? notification.message : 'нет данных');
      return res.status(400).json({ success: false, message: 'Невалидное уведомление' });
    }

    // Получаем данные из уведомления
    const { event, paymentId, status, metadata } = notification;
    
    if (event === 'payment.succeeded' && status === 'succeeded') {
      const { userId, planId } = metadata;
      
      if (!userId || !planId) {
        console.error('[ERROR] В метаданных платежа отсутствуют необходимые поля userId или planId');
        return res.status(400).json({ success: false, message: 'Невалидные метаданные платежа' });
      }

      // Используем новую функцию для обновления тарифа после оплаты
      const updateResult = await updateUserPlanAfterPayment(userId, planId, paymentId);
      
      if (!updateResult.success) {
        console.error(`[ERROR] Ошибка обновления тарифа ${planId} для пользователя ${userId} по уведомлению: ${updateResult.message}`);
        return res.status(500).json({ success: false, message: updateResult.message });
      }

      // Сохраняем информацию о платеже в БД
      await db.savePayment({
        userId,
        paymentId,
        planId,
        amount: notification.amount,
        status: notification.status,
        createdAt: new Date().toISOString(),
        metadata
      });

      console.log(`[INFO] Успешно обработано уведомление о платеже ${paymentId} для пользователя ${userId}, тариф ${planId}`);
      return res.status(200).json({ success: true, message: 'Уведомление обработано успешно' });
    }
    
    // Для других событий просто отправляем успешный ответ
    return res.status(200).json({ success: true, message: 'Уведомление получено' });
  } catch (error) {
    console.error('[ERROR] Ошибка при обработке уведомления о платеже:', error);
    return res.status(500).json({ success: false, message: 'Произошла ошибка при обработке уведомления о платеже' });
  }
});

/**
 * Создание нового платежа
 */
router.post('/create', async (req, res) => {
  try {
    const { userId, planId, amount, description } = req.body;
    
    if (!userId || !planId) {
      console.error('[ERROR] Отсутствуют необходимые параметры userId или planId');
      return res.status(400).json({ 
        success: false, 
        message: 'Необходимо указать userId и planId' 
      });
    }
    
    // Проверяем существование тарифа
    const userData = getUserData(userId);
    
    // Создаем платеж
    try {
      // Получаем сумму из тарифа, если не указана явно
      const finalAmount = amount || (PLANS[planId] ? PLANS[planId].price : 0);
      
      if (!finalAmount) {
        return res.status(400).json({ 
          success: false, 
          message: 'Не указана сумма платежа и невозможно определить её из тарифа' 
        });
      }
      
      // Создаем платеж в YooKassa
      const paymentData = await createPayment(
        userId, 
        planId, 
        finalAmount, 
        description || `Оплата тарифа ${planId} для пользователя ${userId}`
      );
      
      if (!paymentData) {
        return res.status(500).json({ 
          success: false, 
          message: 'Ошибка при создании платежа' 
        });
      }
      
      // Получаем URL для оплаты
      const paymentUrl = getPaymentUrl(paymentData);
      
      if (!paymentUrl) {
        return res.status(500).json({ 
          success: false, 
          message: 'Не удалось получить URL для оплаты' 
        });
      }
      
      // Сохраняем информацию о платеже
      await db.savePayment({
        userId,
        planId,
        paymentId: paymentData.id,
        amount: finalAmount,
        status: paymentData.status,
        createdAt: new Date().toISOString(),
        metadata: paymentData.metadata
      });
      
      // Возвращаем данные для перенаправления на страницу оплаты
      return res.status(200).json({
        success: true,
        message: 'Платеж успешно создан',
        payment: {
          id: paymentData.id,
          status: paymentData.status,
          amount: finalAmount,
          paymentUrl: paymentUrl
        }
      });
    } catch (error) {
      console.error('[ERROR] Ошибка при создании платежа:', error);
      return res.status(500).json({ 
        success: false, 
        message: `Ошибка при создании платежа: ${error.message}` 
      });
    }
  } catch (error) {
    console.error('[ERROR] Критическая ошибка при создании платежа:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Произошла ошибка при обработке запроса' 
    });
  }
});

// Маршрут для проверки статуса платежа
router.get('/status/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;
    
    if (!paymentId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Необходимо указать ID платежа' 
      });
    }
    
    // Проверяем статус платежа в YooKassa
    const payment = await checkPaymentStatus(paymentId);
    
    if (!payment) {
      return res.status(404).json({ 
        success: false, 
        message: 'Платеж не найден' 
      });
    }
    
    // Обновляем статус платежа в БД
    await db.updatePaymentStatus(paymentId, payment.status);
    
    // Если платеж успешен, активируем тариф
    if (payment.status === 'succeeded' && payment.paid === true) {
      const metadata = payment.metadata || {};
      const userId = metadata.userId;
      const planId = metadata.planId;
      
      if (userId && planId) {
        // Обновляем тариф пользователя
        await updateUserPlanAfterPayment(userId, planId, paymentId);
      }
    }
    
    return res.status(200).json({
      success: true,
      payment: {
        id: payment.id,
        status: payment.status,
        paid: payment.paid,
        amount: payment.amount,
        createdAt: payment.created_at,
        metadata: payment.metadata
      }
    });
  } catch (error) {
    console.error('[ERROR] Ошибка при проверке статуса платежа:', error);
    return res.status(500).json({ 
      success: false, 
      message: `Ошибка при проверке статуса платежа: ${error.message}` 
    });
  }
});

module.exports = router; 