const { testWebhook, checkWebhookEndpoint, printWebhookInstructions } = require('./src/utils/webhook-helper');

async function runWebhookTest() {
  console.log('=== ДИАГНОСТИКА И ТЕСТИРОВАНИЕ WEBHOOK ===\n');
  
  // Выводим инструкции
  printWebhookInstructions();
  
  // Проверяем доступность endpoints
  console.log('\n');
  await checkWebhookEndpoint();
  
  // Тестируем webhook с данными реального пользователя
  console.log('\n');
  await testWebhook('117958330', 'BASIC', 'test-webhook-payment-' + Date.now());
  
  console.log('\n=== ТЕСТИРОВАНИЕ ЗАВЕРШЕНО ===');
  console.log('Если тесты прошли успешно, но платежи все еще не активируют тарифы,');
  console.log('проверьте настройки webhook в личном кабинете ЮКассы.');
}

// Запускаем тест
runWebhookTest().catch(console.error); 