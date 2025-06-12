# Настройка Webhook в ЮКассе

## Проблема с автоматической активацией тарифов

Если после оплаты тариф не активируется автоматически, проблема в настройке webhook в личном кабинете ЮКассы.

## Правильный webhook URL

В личном кабинете ЮКассы нужно указать этот URL для уведомлений:

```
https://telegram-doc-checker.onrender.com/payment/notifications
```

## Пошаговая настройка

1. **Войдите в личный кабинет ЮКассы:**
   - Откройте https://yookassa.ru/
   - Войдите в свой аккаунт

2. **Перейдите в настройки HTTP-уведомлений:**
   - Раздел "Интеграция"
   - Пункт "HTTP-уведомления"

3. **Установите URL для уведомлений:**
   ```
   https://telegram-doc-checker.onrender.com/payment/notifications
   ```

4. **Выберите события для уведомлений:**
   - ✅ `payment.succeeded` (платеж успешно завершен)
   - ✅ `payment.canceled` (платеж отменен)
   - ✅ `payment.waiting_for_capture` (платеж ожидает подтверждения)

5. **Сохраните настройки**

## Альтернативный webhook URL

Если основной не работает, можно попробовать:
```
https://telegram-doc-checker.onrender.com/yookassa/webhook
```

## Проверка работы webhook

После настройки сделайте тестовый платеж и проверьте логи сервера:

```bash
# Проверить логи Render
https://dashboard.render.com/web/srv-your-service-id/logs
```

## Тестирование webhook

Вручную отправьте POST запрос на webhook для проверки:

```bash
curl -X POST https://telegram-doc-checker.onrender.com/payment/notifications \
  -H "Content-Type: application/json" \
  -d '{
    "event": "payment.succeeded",
    "object": {
      "id": "test-payment-id",
      "status": "succeeded",
      "amount": {"value": "290.00", "currency": "RUB"},
      "metadata": {
        "userId": "117958330",
        "planId": "BASIC"
      }
    }
  }'
```

## Важные моменты

- Webhook URL должен быть доступен из интернета (HTTPS)
- ЮКасса будет отправлять POST запросы с JSON данными
- При успешной обработке сервер должен вернуть HTTP 200
- Если webhook не отвечает, ЮКасса будет повторять отправку 