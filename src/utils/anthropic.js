const { Anthropic } = require('@anthropic-ai/sdk');
const config = require('../config/config');

class AnthropicService {
  constructor() {
    this.client = new Anthropic({
      apiKey: config.anthropicApiKey,
    });
  }

  /**
   * Анализирует текст документа
   * @param {string} text - Текст документа для анализа
   * @param {string} role - Роль пользователя в договоре (заказчик, исполнитель и т.д.)
   * @param {string} name - Название компании/ИП пользователя
   * @returns {Promise<Object>} - Результат анализа
   */
  async analyzeDocument(text, role, name) {
    console.log(`Отправка документа на анализ в Anthropic (${text.length} символов)`);
    
    // Ограничиваем размер текста для предотвращения превышения контекста
    // Claude 3 может обрабатывать до 200K токенов
    if (text.length > 150000) {
      console.log(`Документ слишком большой (${text.length} символов), ограничиваем до 150000 символов`);
      text = text.substring(0, 150000) + '... [текст сокращен из-за ограничений размера]';
    }

    // Формируем системный промпт для Claude
    let systemPrompt = '';
    
    if (role && name) {
      // Если предоставлены роль и имя, используем расширенный анализ для конкретной стороны
      systemPrompt = `Ты - опытный юрист, специализирующийся на анализе договоров. 
Твоя задача - проверить договор на наличие рисков, недостатков и подводных камней.

Проанализируй договор с точки зрения ${role} (${name}).

В своем анализе учитывай следующее:
1. Интересы ${role} (${name})
2. Юридические риски для ${role}
3. Финансовые риски для ${role}
4. Несправедливые условия договора
5. Отсутствующие важные пункты
6. Защиту интересов ${role}

Твой ответ должен быть структурирован следующим образом:
1. **Краткое описание документа** - что это за документ, стороны, основные положения
2. **Роль пользователя** - кем является ${role} (${name}) в данном договоре
3. **Критические ошибки и риски** - самые опасные пункты договора для ${role}
4. **Потенциальные риски** - возможные проблемы для ${role}
5. **Преимущества договора** - выгодные условия для ${role}
6. **Отсутствующие важные пункты** - что следовало бы добавить для защиты ${role}
7. **Рекомендации по улучшению** - как сделать договор безопаснее для ${role}
8. **Общее заключение** - общая оценка договора с точки зрения безопасности для ${role}`;
    } else {
      // Если роль и имя не предоставлены, используем общий анализ документа
      systemPrompt = `Ты - опытный юрист, специализирующийся на анализе договоров.
Твоя задача - определить тип документа, выделить основные условия и стороны договора.

Проанализируй предоставленный текст и выдели следующую информацию в JSON формате:
{
  "isContract": true/false,
  "party1": {
    "role": "роль (исполнитель/заказчик/продавец/покупатель/etc)",
    "name": "название организации или имя"
  },
  "party2": {
    "role": "роль (исполнитель/заказчик/продавец/покупатель/etc)",
    "name": "название организации или имя"
  },
  "mainTerms": {
    "subject": "предмет договора в 1-2 предложениях",
    "price": "стоимость и условия оплаты в 1-2 предложениях",
    "duration": "срок действия договора",
    "responsibilities": "основные обязанности сторон",
    "special": "особые условия (если есть)"
  },
  "analysis": {
    "party1Analysis": {
      "criticalErrors": ["список критических ошибок для первой стороны"],
      "risks": ["список рисков для первой стороны"],
      "advantages": ["преимущества для первой стороны"],
      "disadvantages": ["недостатки для первой стороны"],
      "improvements": ["предложения по улучшению для первой стороны"]
    },
    "party2Analysis": {
      "criticalErrors": ["список критических ошибок для второй стороны"],
      "risks": ["список рисков для второй стороны"],
      "advantages": ["преимущества для второй стороны"],
      "disadvantages": ["недостатки для второй стороны"],
      "improvements": ["предложения по улучшению для второй стороны"]
    }
  },
  "conclusion": {
    "mainProblems": ["основные проблемы договора"],
    "recommendedActions": ["рекомендуемые действия"]
  }
}

Ограничения:
- Если документ не является договором, просто верни {"isContract": false}
- Списки должны содержать 3-5 наиболее важных пунктов
- Все описания должны быть краткими, по 1-2 предложения
- Используй только информацию из документа
- Формат ответа: строго JSON без дополнительных пояснений`;
    }

    try {
      const response = await this.client.messages.create({
        model: "claude-3-opus-20240229",
        max_tokens: 4000,
        system: systemPrompt,
        messages: [
          { 
            role: "user",
            content: `Вот текст договора для анализа:\n\n${text}`
          }
        ],
      });

      if (role && name) {
        return {
          analysis: response.content[0].text,
          usage: {
            prompt_tokens: 0, // Claude не возвращает точное количество токенов 
            completion_tokens: 0, // Но можно будет добавить оценку, если нужно
            total_tokens: 0
          }
        };
      } else {
        // Если это первичный анализ, пытаемся распарсить JSON из ответа
        try {
          const jsonResponse = JSON.parse(response.content[0].text);
          return jsonResponse;
        } catch (parseError) {
          console.error('Ошибка при разборе JSON ответа:', parseError);
          throw new Error('Не удалось разобрать ответ от API');
        }
      }
    } catch (error) {
      console.error('Ошибка при анализе документа через Anthropic:', error);
      throw error;
    }
  }
}

module.exports = new AnthropicService(); 