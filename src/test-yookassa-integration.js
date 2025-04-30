/**
 * Тестовый скрипт для проверки интеграции с ЮKassa
 */
require('dotenv').config();
const { 
  createPayment, 
  getPaymentInfo, 
  capturePayment, 
  cancelPayment, 
  createRefund 
} = require('./utils/yookassa-integration');

// Для хранения id созданного платежа
let paymentId = '';

/**
 * Тест создания платежа
 */
async function testCreatePayment() {
  console.log('=== ТЕСТ СОЗДАНИЯ ПЛАТЕЖА ===');
  
  try {
    const payment = await createPayment(1.00, 'Тестовый платеж', {
      test_id: '123',
      user_id: 'test_user'
    });
    
    paymentId = payment.id;
    
    console.log('- Платеж создан успешно');
    console.log('- ID платежа:', payment.id);
    console.log('- Статус:', payment.status);
    console.log('- URL для оплаты:', payment.confirmation?.confirmation_url);
    
    return payment;
  } catch (error) {
    console.error('- Ошибка при создании платежа:', error.message);
    throw error;
  }
}

/**
 * Тест получения информации о платеже
 */
async function testGetPaymentInfo(id) {
  console.log(`\n=== ТЕСТ ПОЛУЧЕНИЯ ИНФОРМАЦИИ О ПЛАТЕЖЕ ${id} ===`);
  
  try {
    const payment = await getPaymentInfo(id);
    
    console.log('- Информация получена успешно');
    console.log('- ID платежа:', payment.id);
    console.log('- Статус:', payment.status);
    console.log('- Оплачен:', payment.paid);
    
    return payment;
  } catch (error) {
    console.error('- Ошибка при получении информации о платеже:', error.message);
    throw error;
  }
}

/**
 * Тест подтверждения платежа
 */
async function testCapturePayment(id) {
  console.log(`\n=== ТЕСТ ПОДТВЕРЖДЕНИЯ ПЛАТЕЖА ${id} ===`);
  
  try {
    const payment = await capturePayment(id);
    
    console.log('- Платеж подтвержден успешно');
    console.log('- ID платежа:', payment.id);
    console.log('- Статус:', payment.status);
    
    return payment;
  } catch (error) {
    console.error('- Ошибка при подтверждении платежа:', error.message);
    throw error;
  }
}

/**
 * Тест отмены платежа
 */
async function testCancelPayment(id) {
  console.log(`\n=== ТЕСТ ОТМЕНЫ ПЛАТЕЖА ${id} ===`);
  
  try {
    const payment = await cancelPayment(id);
    
    console.log('- Платеж отменен успешно');
    console.log('- ID платежа:', payment.id);
    console.log('- Статус:', payment.status);
    
    return payment;
  } catch (error) {
    console.error('- Ошибка при отмене платежа:', error.message);
    throw error;
  }
}

/**
 * Тест создания возврата
 */
async function testCreateRefund(id) {
  console.log(`\n=== ТЕСТ СОЗДАНИЯ ВОЗВРАТА ДЛЯ ПЛАТЕЖА ${id} ===`);
  
  try {
    const refund = await createRefund(id, 0.50, 'Тестовый возврат');
    
    console.log('- Возврат создан успешно');
    console.log('- ID возврата:', refund.id);
    console.log('- ID платежа:', refund.payment_id);
    console.log('- Статус:', refund.status);
    
    return refund;
  } catch (error) {
    console.error('- Ошибка при создании возврата:', error.message);
    throw error;
  }
}

/**
 * Запуск всех тестов
 */
async function runTests() {
  try {
    // 1. Создаем платеж
    const payment = await testCreatePayment();
    
    // 2. Получаем информацию о платеже
    await testGetPaymentInfo(payment.id);
    
    // Для выполнения остальных тестов платеж должен быть оплачен
    // Пользователю нужно перейти по ссылке payment.confirmation.confirmation_url
    // и выполнить оплату. После этого можно раскомментировать код ниже:
    
    // console.log('\n!!! ВНИМАНИЕ !!!');
    // console.log('Для продолжения тестов необходимо оплатить платеж по ссылке выше.');
    // console.log('После оплаты раскомментируйте код в функции runTests() и запустите скрипт повторно.');
    // console.log('ID платежа:', payment.id);
    
    // Для раскомментирования при повторном запуске:
    // const paymentId = '22e12f66-000f-5000-8000-18db351245c7'; // Замените на ID созданного платежа
    // await testGetPaymentInfo(paymentId);
    // await testCapturePayment(paymentId); // Только для двухстадийных платежей
    // await testCreateRefund(paymentId);
    // await testCancelPayment(paymentId);
    
    console.log('\n=== ВСЕ ТЕСТЫ ЗАВЕРШЕНЫ УСПЕШНО ===');
  } catch (error) {
    console.error('\n=== ТЕСТЫ ЗАВЕРШЕНЫ С ОШИБКОЙ ===');
    console.error(error);
  }
}

// Запускаем тесты
runTests(); 