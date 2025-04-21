require('dotenv').config();

// Используем только модель Anthropic Claude
console.log('Используется модель: Anthropic Claude');

// Загружаем переменные окружения из .env
require('dotenv').config();

// Конфигурации для модуля работы с платежами
const yookassaShopId = process.env.YOOKASSA_SHOP_ID || '';
const yookassaSecretKey = process.env.YOOKASSA_SECRET_KEY || '';
const yookassaReturnUrl = process.env.YOOKASSA_RETURN_URL || 'https://telegram-doc-checker.onrender.com/payment/success';
const yookassaTestMode = process.env.YOOKASSA_TEST_MODE === 'true';

// Конфигурация для сохранения платежей (может использоваться локальное хранилище)
const databaseEnabled = process.env.DATABASE_ENABLED === 'true';
const databaseUrl = process.env.DATABASE_URL || null;

const config = {
  // Telegram
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
  
  // Anthropic
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  
  // Администраторы бота (массив ID)
  adminIds: process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [],
  
  // Настройки по умолчанию
  defaultPrompt: `Ты - опытный юрист, специализирующийся на анализе договоров. 
Твоя задача - проверить договор на наличие рисков, недостатков и подводных камней.
  
Проанализируй следующий договор и предоставь структурированный анализ в таком порядке:

1. *Краткое описание документа* - что это за документ, его основные положения и ключевые условия
2. *Потенциальные риски и недостатки* - выдели опасные моменты в договоре
3. *Отсутствующие важные пункты* - чего не хватает в документе
4. *Юридические несоответствия* - где документ противоречит законодательству  
5. *Рекомендации по улучшению* - как сделать договор лучше и безопаснее

Договор:
`,

  // Robokassa настройки
  robokassa: {
    merchantLogin: process.env.ROBOKASSA_MERCHANT_LOGIN || '',
    password1: process.env.ROBOKASSA_PASSWORD1 || '',     // Для формирования счета
    password2: process.env.ROBOKASSA_PASSWORD2 || '',     // Для проверки результата
    testMode: process.env.ROBOKASSA_TEST_MODE === 'true', // Тестовый режим
    resultUrl: process.env.ROBOKASSA_RESULT_URL || '',    // URL для уведомлений от Robokassa
    successUrl: process.env.ROBOKASSA_SUCCESS_URL || '',  // URL успешной оплаты
    failUrl: process.env.ROBOKASSA_FAIL_URL || ''         // URL неудачной оплаты
  },
  
  // YooKassa (ЮКасса) настройки
  yookassaShopId,
  yookassaSecretKey,
  yookassaTestMode,
  yookassaReturnUrl,
  
  // Настройки для базы данных
  databaseEnabled,
  databaseUrl,
  
  // Настройки для Robokassa (при необходимости)
  robokassaLogin: process.env.ROBOKASSA_LOGIN || '',
  robokassaPassword1: process.env.ROBOKASSA_PASSWORD1 || '',
  robokassaPassword2: process.env.ROBOKASSA_PASSWORD2 || '',
  robokassaTestMode: process.env.ROBOKASSA_TEST_MODE === 'true',
  
  // Настройки для анализа документов
  maxDocumentSize: parseInt(process.env.MAX_DOCUMENT_SIZE || '20971520', 10), // 20MB по умолчанию
  allowedDocumentExtensions: (process.env.ALLOWED_DOCUMENT_EXTENSIONS || 'pdf,doc,docx,txt,rtf').split(','),
  
  // Настройки API
  apiUrl: process.env.API_URL || 'https://api.telegram-doc-checker.com',
  
  // Функция для проверки, все ли необходимые переменные окружения установлены
  validateEnv: function() {
    const requiredVars = [
      { name: 'TELEGRAM_BOT_TOKEN', value: this.telegramToken },
      { name: 'ANTHROPIC_API_KEY', value: this.anthropicApiKey }
    ];
    
    const paymentVars = [
      { name: 'YOOKASSA_SHOP_ID', value: this.yookassaShopId },
      { name: 'YOOKASSA_SECRET_KEY', value: this.yookassaSecretKey },
      { name: 'YOOKASSA_RETURN_URL', value: this.yookassaReturnUrl }
    ];
    
    const missingVars = requiredVars.filter(v => !v.value);
    const missingPaymentVars = paymentVars.filter(v => !v.value);
    
    if (missingVars.length > 0) {
      console.error('Отсутствуют необходимые переменные окружения:', missingVars.map(v => v.name).join(', '));
      return false;
    }
    
    if (missingPaymentVars.length > 0) {
      console.warn('Отсутствуют переменные для работы с платежами:', missingPaymentVars.map(v => v.name).join(', '));
      console.warn('Функционал оплаты будет недоступен');
    }
    
    return true;
  }
};

module.exports = config; 