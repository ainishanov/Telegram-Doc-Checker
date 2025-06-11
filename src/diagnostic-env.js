#!/usr/bin/env node

// Диагностический скрипт для проверки переменных окружения
console.log('=== ДИАГНОСТИКА ПЕРЕМЕННЫХ ОКРУЖЕНИЯ ===');
console.log('NODE_ENV:', process.env.NODE_ENV || 'не определен');
console.log('RENDER:', process.env.RENDER || 'не определен');
console.log('');

console.log('=== ПЕРЕМЕННЫЕ YOOKASSA ===');
console.log('YOOKASSA_SHOP_ID:', process.env.YOOKASSA_SHOP_ID || 'НЕ ОПРЕДЕЛЕН');
console.log('YOOKASSA_SECRET_KEY:', process.env.YOOKASSA_SECRET_KEY ? 
  `${process.env.YOOKASSA_SECRET_KEY.substring(0, 10)}...` : 'НЕ ОПРЕДЕЛЕН');
console.log('YOOKASSA_RETURN_URL:', process.env.YOOKASSA_RETURN_URL || 'НЕ ОПРЕДЕЛЕН');
console.log('YOOKASSA_TEST_MODE:', process.env.YOOKASSA_TEST_MODE || 'НЕ ОПРЕДЕЛЕН');
console.log('YOOKASSA_DEFAULT_METHOD:', process.env.YOOKASSA_DEFAULT_METHOD || 'НЕ ОПРЕДЕЛЕН');
console.log('');

console.log('=== ДРУГИЕ ПЕРЕМЕННЫЕ ===');
console.log('TELEGRAM_BOT_TOKEN:', process.env.TELEGRAM_BOT_TOKEN ? 
  `${process.env.TELEGRAM_BOT_TOKEN.substring(0, 10)}...` : 'НЕ ОПРЕДЕЛЕН');
console.log('ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 
  `${process.env.ANTHROPIC_API_KEY.substring(0, 10)}...` : 'НЕ ОПРЕДЕЛЕН');
console.log('');

console.log('=== ТЕСТ ЗАГРУЗКИ КОНФИГА ===');
try {
  const config = require('./config/config');
  console.log('✅ Конфиг загружен успешно');
  console.log('- yookassaShopId:', config.yookassaShopId || 'НЕ ОПРЕДЕЛЕН');
  console.log('- yookassaSecretKey:', config.yookassaSecretKey ? 
    `${config.yookassaSecretKey.substring(0, 10)}...` : 'НЕ ОПРЕДЕЛЕН');
  console.log('- yookassaReturnUrl:', config.yookassaReturnUrl || 'НЕ ОПРЕДЕЛЕН');
  console.log('- yookassaTestMode:', config.yookassaTestMode);
  console.log('- yookassaDefaultMethod:', config.yookassaDefaultMethod || 'НЕ ОПРЕДЕЛЕН');
} catch (error) {
  console.error('❌ Ошибка загрузки конфига:', error.message);
}

console.log('=== КОНЕЦ ДИАГНОСТИКИ ==='); 