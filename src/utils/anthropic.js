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
    try {
      console.log(`Отправка документа на анализ в Anthropic (${text.length} символов)`);
      
      // Проверяем, что текст не пустой
      if (!text || text.trim() === '') {
        console.error('Текст документа пуст');
        throw new Error('Текст документа пуст');
      }
      
      // Ограничиваем размер текста для предотвращения превышения контекста
      // Claude 3 может обрабатывать до 200K токенов
      const MAX_TEXT_LENGTH = 150000;
      if (text.length > MAX_TEXT_LENGTH) {
        console.log(`Документ слишком большой (${text.length} символов), ограничиваем до ${MAX_TEXT_LENGTH} символов`);
        text = text.substring(0, MAX_TEXT_LENGTH) + '... [текст сокращен из-за ограничений размера]';
      }

      // Оценка количества токенов (примерно 4 символа = 1 токен)
      const estimatedTokens = Math.ceil(text.length / 4);
      console.log(`Приблизительное количество токенов: ${estimatedTokens}`);
      
      if (estimatedTokens > 180000) {
        console.error('Документ превышает возможности API по обработке (слишком много токенов)');
        throw new Error('context_length_exceeded');
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

      console.log('Отправка запроса к API Anthropic...');
      const startTime = Date.now();
      
      try {
        const response = await this.client.messages.create({
          model: "claude-3-opus-20240229",
          max_tokens: 4000,
          system: systemPrompt,
          messages: [
            { 
              role: "user",
              content: `проведи анализ договора:\n\n${text}`
            }
          ],
          temperature: 0.3, // Более низкая температура для более предсказуемых результатов
        });
        
        const endTime = Date.now();
        console.log(`Ответ от API Anthropic получен за ${(endTime - startTime) / 1000} секунд`);
  
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
            // Проверяем, что ответ не пустой
            if (!response.content || !response.content[0] || !response.content[0].text) {
              console.error('Получен пустой ответ от API Anthropic');
              throw new Error('Получен пустой ответ от API');
            }
            
            const responseText = response.content[0].text.trim();
            console.log(`Получен ответ от API (${responseText.length} символов)`);
            
            // Пробуем извлечь JSON из ответа
            let jsonStr = responseText;
            
            // Если ответ содержит бэктики (код), извлекаем JSON из них
            if (responseText.includes('```json')) {
              jsonStr = responseText.split('```json')[1].split('```')[0].trim();
            } else if (responseText.includes('```')) {
              jsonStr = responseText.split('```')[1].split('```')[0].trim();
            }
            
            console.log('Попытка парсинга JSON ответа...');
            const jsonResponse = JSON.parse(jsonStr);
            
            // Проверяем, содержит ли ответ необходимые поля
            if (jsonResponse.isContract === undefined) {
              console.error('API вернул JSON без обязательного поля isContract');
              throw new Error('Некорректный формат ответа API: отсутствует поле isContract');
            }
            
            // Проверяем, является ли документ договором
            if (jsonResponse.isContract) {
              // Проверяем наличие информации о сторонах договора
              if (!jsonResponse.party1 || !jsonResponse.party2) {
                console.error('API вернул JSON без информации о сторонах договора');
                
                // Если в тексте есть предупреждение о тексте в виде изображений, создаем шаблон с неполной информацией
                if (text.includes('[ВНИМАНИЕ: Документ содержит текст в виде изображений') || 
                    text.includes('Документ содержит текст в виде изображений')) {
                  console.log('Создаем шаблон с неполной информацией из-за текста в виде изображений');
                  
                  // Возвращаем шаблон с пометкой о неполной информации
                  return {
                    isContract: true,
                    party1: {
                      role: "Первая сторона", 
                      name: "Не удалось определить"
                    },
                    party2: {
                      role: "Вторая сторона",
                      name: "Не удалось определить"
                    },
                    mainTerms: {
                      subject: "Информация не распознана из-за наличия текста в виде изображений",
                      price: "Информация не распознана из-за наличия текста в виде изображений",
                      duration: "Информация не распознана из-за наличия текста в виде изображений",
                      responsibilities: "Информация не распознана из-за наличия текста в виде изображений",
                      special: "Документ содержит текст в виде изображений. Рекомендуется отправить документ в текстовом формате для более точного анализа."
                    },
                    analysis: {
                      party1Analysis: {
                        criticalErrors: ["Невозможно полноценно проанализировать документ с текстом в виде изображений"],
                        risks: ["Невозможно оценить риски из-за неполного распознавания текста"],
                        advantages: ["Не определено"],
                        disadvantages: ["Не определено"],
                        improvements: ["Отправьте документ в текстовом формате для более точного анализа"]
                      },
                      party2Analysis: {
                        criticalErrors: ["Невозможно полноценно проанализировать документ с текстом в виде изображений"],
                        risks: ["Невозможно оценить риски из-за неполного распознавания текста"],
                        advantages: ["Не определено"],
                        disadvantages: ["Не определено"],
                        improvements: ["Отправьте документ в текстовом формате для более точного анализа"]
                      }
                    },
                    conclusion: {
                      mainProblems: ["Документ содержит текст в виде изображений, что затрудняет его анализ"],
                      recommendedActions: [
                        "Отправьте документ в текстовом формате",
                        "Используйте онлайн-сервисы OCR для преобразования документа в текст",
                        "Если возможно, отправьте оригинальную версию документа в формате DOC/DOCX"
                      ]
                    },
                    incomplete: true
                  };
                } else {
                  throw new Error('Не удалось определить стороны договора');
                }
              }
            }
            
            return jsonResponse;
          } catch (parseError) {
            console.error('Ошибка при разборе JSON ответа:', parseError);
            console.error('Текст ответа:', response.content[0].text.substring(0, 500) + '...');
            throw new Error('Не удалось разобрать ответ от API');
          }
        }
      } catch (apiError) {
        console.error('Ошибка при запросе к Anthropic API:', apiError);
        
        // Обработка специфических ошибок API
        if (apiError.status === 400 && apiError.message && apiError.message.includes('context_length_exceeded')) {
          throw new Error('context_length_exceeded');
        } else if (apiError.status === 429) {
          throw new Error('Превышен лимит запросов к API. Пожалуйста, попробуйте позже.');
        } else if (apiError.status >= 500) {
          throw new Error('Ошибка сервера API. Пожалуйста, попробуйте позже.');
        }
        
        // Перебрасываем ошибку дальше
        throw apiError;
      }
    } catch (error) {
      console.error('Общая ошибка при анализе документа через Anthropic:', error);
      throw error;
    }
  }
}

module.exports = new AnthropicService(); 