require('dotenv').config();

module.exports = {
  telegramToken: process.env.TELEGRAM_TOKEN,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  useAnthropicModel: true,
  robokassa: {
    merchantLogin: process.env.ROBOKASSA_MERCHANT_LOGIN,
    password1: process.env.ROBOKASSA_PASSWORD1,
    password2: process.env.ROBOKASSA_PASSWORD2,
    testMode: process.env.ROBOKASSA_TEST_MODE === 'true'
  }
}; 