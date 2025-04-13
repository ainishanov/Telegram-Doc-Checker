require('dotenv').config();

module.exports = {
  telegramToken: process.env.TELEGRAM_TOKEN,
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  useAnthropicModel: process.env.USE_ANTHROPIC_MODEL === 'true' || false,
  robokassa: {
    merchantLogin: process.env.ROBOKASSA_MERCHANT_LOGIN,
    password1: process.env.ROBOKASSA_PASSWORD1,
    password2: process.env.ROBOKASSA_PASSWORD2,
    testMode: process.env.ROBOKASSA_TEST_MODE === 'true'
  }
}; 