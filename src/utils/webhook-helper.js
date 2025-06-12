/**
 * Утилиты для работы с webhook ЮКассы
 */

/**
 * Проверяет доступность webhook endpoint
 */
async function checkWebhookEndpoint() {
  const axios = require('axios');
  const endpoints = [
    'https://telegram-doc-checker.onrender.com/payment/notifications',
    'https://telegram-doc-checker.onrender.com/yookassa/webhook'
  ];
  
  console.log('=== ПРОВЕРКА ДОСТУПНОСТИ WEBHOOK ENDPOINTS ===');
  
  for (const endpoint of endpoints) {
    try {
      console.log(`Проверка ${endpoint}...`);
      
      // Отправляем GET запрос для проверки доступности
      const response = await axios.get(endpoint.replace(/\/(notifications|webhook)$/, '/status'));
      console.log(`✅ ${endpoint} - доступен (статус: ${response.status})`);
    } catch (error) {
      if (error.response) {
        console.log(`⚠️ ${endpoint} - отвечает с ошибкой (статус: ${error.response.status})`);
      } else {
        console.log(`❌ ${endpoint} - недоступен (${error.message})`);
      }
    }
  }
}

/**
 * Эмулирует webhook от ЮКассы для тестирования
 */
async function testWebhook(userId, planId, paymentId = 'test-payment-id', amount = '290.00') {
  const axios = require('axios');
  
  const webhookData = {
    event: 'payment.succeeded',
    object: {
      id: paymentId,
      status: 'succeeded',
      paid: true,
      amount: {
        value: amount,
        currency: 'RUB'
      },
      created_at: new Date().toISOString(),
      description: `Тестовый платеж для пользователя ${userId}`,
      metadata: {
        userId: userId,
        planId: planId
      },
      confirmation: {
        type: 'redirect',
        return_url: 'https://telegram-doc-checker.onrender.com/payment/success'
      }
    }
  };
  
  const endpoints = [
    'https://telegram-doc-checker.onrender.com/payment/notifications',
    'https://telegram-doc-checker.onrender.com/yookassa/webhook'
  ];
  
  console.log('=== ТЕСТИРОВАНИЕ WEBHOOK ENDPOINTS ===');
  console.log(`Тестовые данные: userId=${userId}, planId=${planId}, paymentId=${paymentId}`);
  
  for (const endpoint of endpoints) {
    try {
      console.log(`\nОтправка тестового webhook на ${endpoint}...`);
      
      const response = await axios.post(endpoint, webhookData, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'YooKassa-Notifications/1.0'
        },
        timeout: 10000
      });
      
      console.log(`✅ ${endpoint} - успешно обработан (статус: ${response.status})`);
      console.log(`Ответ: ${JSON.stringify(response.data)}`);
    } catch (error) {
      if (error.response) {
        console.log(`❌ ${endpoint} - ошибка ${error.response.status}: ${JSON.stringify(error.response.data)}`);
      } else {
        console.log(`❌ ${endpoint} - недоступен: ${error.message}`);
      }
    }
  }
}

/**
 * Выводит рекомендации по настройке webhook в ЮКассе
 */
function printWebhookInstructions() {
  console.log('\n=== ИНСТРУКЦИИ ПО НАСТРОЙКЕ WEBHOOK В ЮКАССЕ ===');
  console.log('1. Войдите в личный кабинет ЮКассы: https://yookassa.ru/');
  console.log('2. Перейдите в раздел "Интеграция" → "HTTP-уведомления"');
  console.log('3. Установите URL для уведомлений:');
  console.log('   https://telegram-doc-checker.onrender.com/payment/notifications');
  console.log('4. Выберите события для уведомлений:');
  console.log('   ✅ payment.succeeded');
  console.log('   ✅ payment.canceled');
  console.log('   ✅ payment.waiting_for_capture');
  console.log('5. Сохраните настройки');
  console.log('\nАльтернативный URL (если основной не работает):');
  console.log('   https://telegram-doc-checker.onrender.com/yookassa/webhook');
  console.log('\n=== ПРОВЕРКА НАСТРОЙКИ ===');
  console.log('Выполните тестовый платеж и проверьте логи сервера в Render Dashboard');
}

module.exports = {
  checkWebhookEndpoint,
  testWebhook,
  printWebhookInstructions
}; 