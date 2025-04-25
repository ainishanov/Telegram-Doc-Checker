require('dotenv').config();

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const config = require('../src/config/config');

// Выводим информацию о конфигурации
console.log('=== ПРОВЕРКА КОНФИГУРАЦИИ YOOKASSA ===');
console.log('- yookassaShopId:', config.yookassaShopId || 'НЕ ОПРЕДЕЛЕН');
console.log('- yookassaSecretKey:', config.yookassaSecretKey ? `${config.yookassaSecretKey.substring(0, 5)}...` : 'НЕ ОПРЕДЕЛЕН');
console.log('- yookassaTestMode:', config.yookassaTestMode);
console.log('- yookassaReturnUrl:', config.yookassaReturnUrl);
console.log('=== КОНЕЦ ПРОВЕРКИ КОНФИГУРАЦИИ ===');

// Метод для создания платежа
async function createTestPayment() {
  try {
    const shopId = config.yookassaShopId;
    const secretKey = config.yookassaSecretKey;
    const auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');
    const idempotenceKey = uuidv4();

    console.log('Отправка запроса на создание платежа');
    console.log('- Idempotence Key:', idempotenceKey);
    console.log('- Authorization:', `Basic ${auth.substring(0, 10)}...`);
    
    const paymentData = {
      amount: {
        value: "1.00",
        currency: "RUB"
      },
      confirmation: {
        type: "redirect",
        return_url: config.yookassaReturnUrl
      },
      capture: true,
      description: "Тестовый платеж",
      test: true // Всегда тестовый платеж
    };
    
    const response = await axios.post('https://api.yookassa.ru/v3/payments', paymentData, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Idempotence-Key': idempotenceKey,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('=== ПЛАТЕЖ УСПЕШНО СОЗДАН ===');
    console.log('- Payment ID:', response.data.id);
    console.log('- Status:', response.data.status);
    console.log('- Confirmation URL:', response.data.confirmation?.confirmation_url);
    
    return response.data;
  } catch (error) {
    console.error('=== ОШИБКА ПРИ СОЗДАНИИ ПЛАТЕЖА ===');
    console.error('- Error:', error.message);
    
    if (error.response) {
      console.error('- Status:', error.response.status);
      console.error('- Data:', JSON.stringify(error.response.data));
    }
    
    throw error;
  }
}

// Метод для проверки соединения с YooKassa
async function checkConnection() {
  try {
    const shopId = config.yookassaShopId;
    const secretKey = config.yookassaSecretKey;
    
    // Проверяем корректность shopId и secretKey
    console.log('=== ПРОВЕРКА ДЕТАЛЕЙ АВТОРИЗАЦИИ YOOKASSA ===');
    console.log('- Shop ID (тип):', typeof shopId, 'значение:', shopId);
    console.log('- Secret Key (тип):', typeof secretKey);
    console.log('- Secret Key (длина):', secretKey.length);
    console.log('- Secret Key (начало):', secretKey.substring(0, 5));
    console.log('- Secret Key (конец):', secretKey.substring(secretKey.length - 5));
    
    // Проверка соответствия формату для тестового или боевого ключа
    if (secretKey.startsWith('test_')) {
      console.log('- Тип ключа: тестовый');
    } else if (secretKey.startsWith('live_')) {
      console.log('- Тип ключа: боевой');
    } else {
      console.log('- Тип ключа: неизвестный формат! Ключ должен начинаться с test_ или live_');
    }
    
    // Проверка, что shopId представляет собой только цифры
    if (/^\d+$/.test(shopId)) {
      console.log('- Shop ID формат: корректный (только цифры)');
    } else {
      console.log('- Shop ID формат: некорректный (должны быть только цифры)');
    }
    
    const auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');
    console.log('- Authorization header (формат):', `Basic ${auth.substring(0, 10)}...`);
    
    console.log('=== ПРОВЕРКА ПОДКЛЮЧЕНИЯ К YOOKASSA ===');
    console.log('- URL запроса: https://api.yookassa.ru/v3/me');
    
    const response = await axios.get('https://api.yookassa.ru/v3/me', {
      headers: {
        'Authorization': `Basic ${auth}`
      }
    });
    
    console.log('=== ПОДКЛЮЧЕНИЕ УСПЕШНО ===');
    console.log('- Shop ID:', response.data.id);
    console.log('- Shop Status:', response.data.status);
    console.log('- Shop Name:', response.data.name);
    console.log('- Shop Test:', response.data.test);
    
    return response.data;
  } catch (error) {
    console.error('=== ОШИБКА ПРИ ПРОВЕРКЕ ПОДКЛЮЧЕНИЯ ===');
    console.error('- Error:', error.message);
    
    if (error.response) {
      console.error('- Status:', error.response.status);
      console.error('- Data:', JSON.stringify(error.response.data));
      console.error('- Headers:', JSON.stringify(error.response.headers));
    }
    
    throw error;
  }
}

// Запускаем проверки
async function runTests() {
  try {
    // Проверяем соединение
    await checkConnection();
    
    // Создаем тестовый платеж
    await createTestPayment();
    
    console.log('=== ВСЕ ТЕСТЫ УСПЕШНО ПРОЙДЕНЫ ===');
  } catch (error) {
    console.error('=== ТЕСТЫ ЗАВЕРШИЛИСЬ С ОШИБКОЙ ===');
    process.exit(1);
  }
}

runTests(); 