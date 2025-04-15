require('dotenv').config();

// Используем только модель Anthropic Claude
console.log('Используется модель: Anthropic Claude');

const config = {
  // Telegram
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  
  // Anthropic
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  
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
  }
};

module.exports = config; 