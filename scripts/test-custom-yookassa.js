require('dotenv').config();

const config = require('../src/config/config');
const { 
  checkConnection, 
  createPayment 
} = require('../src/utils/payment');

// Функция для запуска тестов
async function runTests() {
  try {
    console.log('=== ТЕСТИРОВАНИЕ СОБСТВЕННОЙ РЕАЛИЗАЦИИ YOOKASSA ===');
    
    // Создаем тестовый платеж
    const payment = await createPayment(
      'test-user-id', 
      'test-plan-id', 
      1.00, 
      'Тестовый платеж'
    );
    
    console.log('=== ТЕСТ УСПЕШНО ПРОЙДЕН ===');
    console.log('- Payment ID:', payment.id);
    console.log('- Status:', payment.status);
    console.log('- Payment URL:', payment.confirmation?.confirmation_url);
  } catch (error) {
    console.error('=== ТЕСТ ЗАВЕРШИЛСЯ С ОШИБКОЙ ===');
    console.error('- Error:', error.message);
    process.exit(1);
  }
}

// Запускаем тесты
runTests(); 