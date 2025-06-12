const express = require('express');
const router = express.Router();
const { createPayment, checkPaymentStatus, processNotification, getPaymentUrl } = require('../utils/payment');
const { getUserData, changePlan, updateUserPlanAfterPayment, PLANS } = require('../models/userLimits');
const db = require('../utils/db');
const config = require('../config/config');

/**
 * Обработка успешной оплаты - универсальная страница
 * ЮКасса не передает параметры пользователя в return_url из соображений безопасности
 * Активация тарифа происходит через webhook автоматически
 */
router.get('/success', async (req, res) => {
  try {
    // Логируем параметры для отладки (если они есть)
    console.log('[INFO] Пользователь перенаправлен на страницу успеха платежа');
    console.log('- Query параметры:', JSON.stringify(req.query));
    
    // Показываем универсальную страницу успеха
    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Платеж принят</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta charset="utf-8">
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
              margin: 0;
              padding: 20px;
              color: #333;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .container {
              background: white;
              padding: 40px 30px;
              border-radius: 16px;
              box-shadow: 0 20px 60px rgba(0,0,0,0.2);
              max-width: 500px;
              width: 100%;
              text-align: center;
            }
            .success-icon {
              font-size: 64px;
              margin-bottom: 20px;
              animation: bounce 1s ease-in-out;
            }
            @keyframes bounce {
              0%, 20%, 60%, 100% { transform: translateY(0); }
              40% { transform: translateY(-20px); }
              80% { transform: translateY(-10px); }
            }
            .title {
              color: #4CAF50;
              font-size: 28px;
              font-weight: 600;
              margin-bottom: 16px;
            }
            .subtitle {
              color: #666;
              font-size: 16px;
              line-height: 1.5;
              margin-bottom: 30px;
            }
            .info-box {
              background: #f8f9fa;
              padding: 20px;
              border-radius: 12px;
              margin: 20px 0;
              border-left: 4px solid #4CAF50;
              text-align: left;
            }
            .steps {
              margin: 15px 0;
            }
            .step {
              margin: 10px 0;
              padding: 8px 0;
              border-bottom: 1px solid #eee;
              display: flex;
              align-items: center;
            }
            .step:last-child {
              border-bottom: none;
            }
            .step-number {
              background: #4CAF50;
              color: white;
              width: 24px;
              height: 24px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              margin-right: 12px;
              font-size: 14px;
              font-weight: 600;
              flex-shrink: 0;
            }
            .button {
              display: inline-block;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 16px 32px;
              text-decoration: none;
              border-radius: 25px;
              font-weight: 600;
              font-size: 16px;
              transition: transform 0.2s, box-shadow 0.2s;
              box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
              margin-top: 20px;
            }
            .button:hover {
              transform: translateY(-2px);
              box-shadow: 0 8px 25px rgba(102, 126, 234, 0.6);
            }
            .note {
              color: #666; 
              font-size: 14px; 
              margin: 20px 0;
              line-height: 1.4;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success-icon">✅</div>
            <h1 class="title">Платеж принят!</h1>
            <p class="subtitle">
              Спасибо за покупку! Ваш платеж успешно обработан.
            </p>
            
            <div class="info-box">
              <strong>Что происходит дальше:</strong>
              <div class="steps">
                <div class="step">
                  <span class="step-number">1</span>
                  <span>Платеж обрабатывается платежной системой</span>
                </div>
                <div class="step">
                  <span class="step-number">2</span>
                  <span>Тариф активируется автоматически (1-3 минуты)</span>
                </div>
                <div class="step">
                  <span class="step-number">3</span>
                  <span>Вы получите уведомление в боте о активации</span>
                </div>
              </div>
            </div>
            
            <div class="note">
              Проверить статус подписки: <strong>/tariff</strong><br>
              Если тариф не активировался в течение 10 минут, свяжитесь с поддержкой через бот.
            </div>
            
            <div style="margin-top: 30px;">
              <button class="button" onclick="openTelegram()" style="margin-bottom: 15px; display: block; width: 100%; border: none; cursor: pointer;">
                📱 Открыть в Telegram
              </button>
              
              <div style="text-align: center; margin: 15px 0;">
                <span style="color: #999; font-size: 14px;">или</span>
              </div>
              
              <a class="button secondary" href="https://t.me/dogovobot" target="_blank" style="background: #f5f5f5; color: #333; margin-bottom: 15px; display: block;">
                🌐 Открыть в браузере
              </a>
              
              <div style="background: #f0f8ff; padding: 15px; border-radius: 8px; margin-top: 20px; font-size: 14px; color: #666;">
                💡 <strong>Если кнопки не работают:</strong><br>
                1. Откройте Telegram вручную<br>
                2. Найдите бота: <code style="background: #e8e8e8; padding: 2px 4px; border-radius: 3px;">@dogovobot</code><br>
                3. Введите команду <code style="background: #e8e8e8; padding: 2px 4px; border-radius: 3px;">/tariff</code> для проверки статуса
              </div>
            </div>
            
            <script>
              function openTelegram() {
                // Проверяем, мобильное ли устройство
                const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                
                if (isMobile) {
                  // Пытаемся открыть в приложении Telegram
                  window.location.href = 'tg://resolve?domain=dogovobot';
                  
                  // Через 1.5 секунды, если не открылось, пробуем веб-версию
                  setTimeout(function() {
                    window.open('https://t.me/dogovobot', '_blank');
                  }, 1500);
                } else {
                  // На десктопе сразу открываем веб-версию
                  window.open('https://t.me/dogovobot', '_blank');
                }
              }
              
              // Показываем пользователю подсказку через несколько секунд
              setTimeout(function() {
                console.log('Подсказка: используйте кнопки для возврата к боту');
              }, 3000);
            </script>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('[ERROR] Ошибка на странице успеха платежа:', error);
    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Платеж принят</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta charset="utf-8">
          <style>
            body { 
              font-family: Arial, sans-serif; 
              text-align: center; 
              padding: 20px;
              color: #333;
            }
          </style>
        </head>
        <body>
          <h1 style="color: #4CAF50;">✅ Платеж принят</h1>
          <p>Ваш платеж обрабатывается. Вернитесь в бот и проверьте статус командой /tariff</p>
          
          <div style="margin-top: 20px;">
            <a href="tg://resolve?domain=dogovobot" style="display: inline-block; background: #2196F3; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; margin: 5px;">
              📱 Открыть в Telegram
            </a>
            <br>
            <a href="https://t.me/dogovobot" target="_blank" style="display: inline-block; background: #f5f5f5; color: #333; padding: 12px 20px; text-decoration: none; border-radius: 5px; margin: 5px;">
              🌐 Открыть в браузере
            </a>
          </div>
          
          <p style="margin-top: 20px; font-size: 12px; color: #666;">
            Или найдите бота: @dogovobot
          </p>
        </body>
      </html>
    `);
  }
});

/**
 * Создание платежа
 */
router.post('/create', async (req, res) => {
  try {
    const { userId, planId, amount, description } = req.body;
    
    if (!userId || !planId || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Отсутствуют обязательные параметры'
      });
    }

    const payment = await createPayment({
      userId,
      planId,
      amount,
      description,
      returnUrl: config.yookassaReturnUrl
    });

    if (!payment || !payment.success) {
      return res.status(400).json({
        success: false,
        message: payment ? payment.message : 'Ошибка создания платежа'
      });
    }

    res.json({
      success: true,
      paymentUrl: payment.paymentUrl,
      paymentId: payment.paymentId
    });

  } catch (error) {
    console.error('[ERROR] Ошибка создания платежа:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * Проверка статуса платежа
 */
router.get('/status/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;
    
    if (!paymentId) {
      return res.status(400).json({
        success: false,
        message: 'ID платежа не указан'
      });
    }

    const payment = await checkPaymentStatus(paymentId);
    
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Платеж не найден'
      });
    }

    res.json({
      success: true,
      payment: {
        id: payment.id,
        status: payment.status,
        paid: payment.paid,
        amount: payment.amount,
        description: payment.description
      }
    });

  } catch (error) {
    console.error('[ERROR] Ошибка проверки статуса платежа:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка проверки статуса платежа'
    });
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
      return res.status(200).json({ success: true }); // Всегда отвечаем 200, чтобы ЮКасса не повторяла запросы
    }

    // Получаем данные из уведомления
    const { event, paymentId, status, metadata } = notification;
    
    console.log(`[INFO] Получено уведомление: событие=${event}, платеж=${paymentId}, статус=${status}`);
    console.log(`[INFO] Метаданные:`, JSON.stringify(metadata));
    
    if (event === 'payment.succeeded' && status === 'succeeded') {
      const { userId, planId } = metadata;
      
      if (!userId || !planId) {
        console.error('[ERROR] В метаданных платежа отсутствуют необходимые поля userId или planId');
        console.error('- Полученные метаданные:', JSON.stringify(metadata));
        return res.status(200).json({ success: true });
      }

      console.log(`[INFO] Обработка успешного платежа ${paymentId} для пользователя ${userId}, активация плана ${planId}`);
      
      try {
        // Используем функцию для активации тарифа после оплаты
        const updateResult = await updateUserPlanAfterPayment(userId, planId, paymentId);
        
        if (updateResult.success) {
          console.log(`[SUCCESS] ✅ Успешно обработано уведомление о платеже ${paymentId} для пользователя ${userId}, тариф ${planId} активирован`);
        } else {
          console.error(`[ERROR] Ошибка активации тарифа: ${updateResult.message}`);
        }
      } catch (activationError) {
        console.error('[ERROR] Критическая ошибка при активации тарифа:', activationError);
      }
      
    } else if (event === 'refund.succeeded') {
      // Обработка возврата средств
      const { userId, planId } = metadata;
      
      if (userId) {
        console.log(`[INFO] Обработка возврата для пользователя ${userId}, возврат на тариф FREE`);
        
        try {
          // Импортируем функцию для изменения тарифа
          const { changePlan } = require('../models/userLimits');
          
          // Возвращаем пользователя на бесплатный тариф
          const downgradeResult = await changePlan(userId, 'FREE');
          
          if (downgradeResult.success) {
            console.log(`[SUCCESS] ✅ Пользователь ${userId} переведен на тариф FREE после возврата ${paymentId}`);
          } else {
            console.error(`[ERROR] Ошибка перевода на FREE тариф: ${downgradeResult.message}`);
          }
        } catch (refundError) {
          console.error('[ERROR] Критическая ошибка при обработке возврата:', refundError);
        }
      } else {
        console.warn('[WARN] В метаданных возврата отсутствует userId');
        console.warn('- Metadata:', JSON.stringify(metadata));
      }
    } else {
      console.log(`[INFO] Получено событие ${event} со статусом ${status} - обработка не требуется`);
    }

    // Всегда отвечаем успехом, чтобы ЮКасса прекратила отправку уведомлений
    res.status(200).json({ success: true });
    
  } catch (error) {
    console.error('[ERROR] Критическая ошибка при обработке webhook уведомления:', error);
    // Даже при ошибке отвечаем успехом, чтобы избежать повторных запросов
    res.status(200).json({ success: true });
  }
});

module.exports = router; 