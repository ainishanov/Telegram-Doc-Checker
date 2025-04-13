# Telegram Договор Чекер

Телеграм-бот для автоматического анализа юридических документов и контрактов с использованием ИИ.

## Функциональность

- **Анализ документов:** Загрузите любой документ (PDF, DOCX) и получите юридический анализ его содержимого
- **Определение рисков:** Выявление потенциальных рисков и проблемных пунктов в контрактах
- **Роли сторон:** Определение роли пользователя в договоре (заказчик, исполнитель и т.д.)
- **Тарифные планы:** Система подписок с различными уровнями доступа
- **Ограничение запросов:** Контроль количества запросов в зависимости от тарифа пользователя

## Технологии

- Node.js
- Telegram Bot API
- OpenAI API (GPT-4)
- Обработка документов (PDF, DOCX)

## Установка и настройка

1. Клонировать репозиторий:
   ```
   git clone https://github.com/yourusername/telegram-doc-checker.git
   cd telegram-doc-checker
   ```

2. Установить зависимости:
   ```
   npm install
   ```

3. Создать файл `.env` на основе `.env.example`:
   ```
   TELEGRAM_BOT_TOKEN=your_bot_token
   OPENAI_API_KEY=your_openai_api_key
   ```

4. Запустить бот:
   ```
   npm start
   ```

## Запуск в Windows

Для удобства запуска в Windows можно использовать:
- `start_bot.bat` - запуск в стандартном режиме
- `kill_and_start_bot.cmd` - остановка предыдущих экземпляров и запуск

## Структура проекта

- `/src` - Исходный код
  - `/handlers` - Обработчики команд и документов
  - `/models` - Модели данных
  - `/utils` - Утилиты и интеграции с API
- `/data` - Хранение данных пользователей (создается автоматически)

## Лицензия

MIT

## Автор

Ainur Nishanov

## Возможности

- Проверка документов через пересылку в бота
- Настройка промпта для ChatGPT
- Гибкая настройка параметров проверки
- Поддержка форматов PDF, DOC, DOCX, RTF, TXT
- Анализ договоров и юридических документов
- Выявление рисков и подводных камней
- Настройка промпта для анализа
- Система тарифных планов с ограничением запросов
- Интеграция с Robokassa для приема платежей

## Настройка Robokassa

Для работы с системой оплаты Robokassa необходимо выполнить следующие шаги:

1. Зарегистрируйтесь в [Robokassa](https://www.robokassa.ru/)
2. Получите логин магазина и пароли для формирования подписи
3. Настройте в личном кабинете URL для получения уведомлений о платежах
4. Заполните соответствующие переменные окружения в файле `.env`:
   ```
   ROBOKASSA_MERCHANT_LOGIN=ваш_логин_магазина
   ROBOKASSA_PASSWORD1=пароль_1
   ROBOKASSA_PASSWORD2=пароль_2
   ROBOKASSA_TEST_MODE=true  # true для тестового режима, false для боевого
   ROBOKASSA_RESULT_URL=URL для уведомлений от Robokassa
   ROBOKASSA_SUCCESS_URL=URL для перенаправления после успешной оплаты
   ROBOKASSA_FAIL_URL=URL для перенаправления после неудачной оплаты
   ```

## Работа с платежами

1. Когда пользователь выбирает тариф и нажимает на кнопку оплаты, бот генерирует ссылку для перехода на страницу оплаты Robokassa
2. После завершения оплаты пользователь возвращается в бот и нажимает кнопку "Проверить оплату"
3. Бот делает запрос к API Robokassa для проверки статуса платежа
4. Если платеж подтвержден, бот активирует выбранный тариф

Для полноценной работы с уведомлениями необходимо настроить веб-сервер, который будет принимать уведомления от Robokassa. Это требует наличия публичного домена с SSL-сертификатом.

## Пример настройки уведомлений для Robokassa

Создайте обработчик для URL-а, указанного в `ROBOKASSA_RESULT_URL`. Этот обработчик должен:

1. Проверять подпись уведомления
2. Обновлять статус платежа в базе данных
3. Возвращать "OK" в случае успешной обработки

```javascript
// Пример обработчика уведомлений от Robokassa
app.post('/robokassa/result', (req, res) => {
  const { OutSum, InvId, SignatureValue } = req.body;
  
  // Проверка подписи
  const signature = crypto.createHash('md5')
    .update(`${OutSum}:${InvId}:${process.env.ROBOKASSA_PASSWORD2}`)
    .digest('hex');
  
  if (signature.toLowerCase() !== SignatureValue.toLowerCase()) {
    return res.status(400).send('Invalid signature');
  }
  
  // Обработка платежа
  // ...
  
  res.send('OK');
});
```

## Деплой в облаке (24/7)

### Вариант 1: Render (бесплатно)

1. Создайте аккаунт на [Render](https://render.com)
2. Создайте новый Web Service и подключите репозиторий
3. Укажите тип "Web Service"
4. Укажите следующие настройки:
   - Build Command: `npm install`
   - Start Command: `node src/index.js`
5. Добавьте переменные окружения:
   - `TELEGRAM_BOT_TOKEN`
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL`: gpt-4-turbo
   - `NODE_ENV`: production
   - `APP_URL`: URL вашего сервиса (будет доступен после деплоя)
6. Нажмите "Create Web Service"
7. После деплоя скопируйте URL вашего сервиса и добавьте его в переменную окружения `APP_URL`

### Вариант 2: Heroku

1. Установите [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)
2. Войдите в аккаунт: `heroku login`
3. Создайте новое приложение: `heroku create`
4. Задайте переменные окружения:
   ```
   heroku config:set TELEGRAM_BOT_TOKEN=your_token
   heroku config:set OPENAI_API_KEY=your_key
   heroku config:set OPENAI_MODEL=gpt-4-turbo
   heroku config:set NODE_ENV=production
   ```
5. Деплой: `git push heroku main`
6. Получите URL: `heroku info -s | grep web_url`
7. Установите URL для WebHook:
   ```
   heroku config:set APP_URL=your_app_url
   ```

### Вариант 3: VPS/VDS 

1. Арендуйте VPS/VDS сервер (от 1-2$ в месяц, например на Selectel, Time Web, DigitalOcean)
2. Установите Node.js: `curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs`
3. Клонируйте репозиторий
4. Установите PM2: `npm install -g pm2`
5. Создайте `.env` файл
6. Запустите бота через PM2: `pm2 start src/index.js --name telegram-doc-checker`
7. Настройте автозапуск: `pm2 startup && pm2 save`

## Использование

1. Начните чат с ботом в Telegram
2. Отправьте команду `/start` для начала работы
3. Используйте `/help` для получения списка команд
4. Используйте `/settings` для настройки промпта и параметров проверки
5. Пересылайте документы, которые нужно проверить

## Команды

- `/start` - Начать работу с ботом
- `/help` - Показать список команд
- `/settings` - Настройка параметров проверки и промпта
- `/resetprompt` - Сбросить промпт на стандартный
- `/showprompt` - Показать текущий промпт #   t e l e g r a m - d o c - c h e c k e r  
 