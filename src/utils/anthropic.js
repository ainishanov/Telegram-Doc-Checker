const { Anthropic } = require('@anthropic-ai/sdk');
const config = require('../config');

class AnthropicService {
  constructor() {
    this.client = new Anthropic({
      apiKey: config.anthropicApiKey,
    });
  }

  async analyzeDocument(text) {
    try {
      // Используем больший лимит для Claude с контекстом 200K
      if (text.length > 150000) {
        console.log(`Документ слишком большой (${text.length} символов), ограничиваем до 150000 символов`);
        text = text.substring(0, 150000) + '... [текст сокращен из-за ограничений размера]';
      }

      console.log('Отправка запроса на анализ документа в Anthropic Claude...');

      const response = await this.client.messages.create({
        model: "claude-3-opus-20240229",
        max_tokens: 4000,
        system: "Вы - опытный юрист-эксперт по анализу договоров. Ваша задача - проанализировать предоставленный договор и вернуть структурированный JSON-ответ со следующими полями:\n\n" +
                "1. party1 и party2 - объекты с информацией о сторонах договора:\n" +
                "   - name: название/ФИО стороны\n" +
                "   - role: роль в договоре (Заказчик, Исполнитель, etc.)\n\n" +
                "2. mainTerms - объект с основными условиями договора:\n" +
                "   - subject: предмет договора (подробное описание)\n" +
                "   - price: условия оплаты и стоимость\n" +
                "   - duration: срок действия договора\n" +
                "   - responsibilities: основные обязанности сторон\n\n" +
                "3. analysis - объект с анализом для каждой стороны (party1Analysis и party2Analysis):\n" +
                "   - criticalErrors: массив критических ошибок/упущений в договоре\n" +
                "   - risks: массив рисков с указанием пункта договора и описанием последствий\n" +
                "   - improvements: массив необходимых улучшений с конкретными формулировками\n" +
                "   - advantages: массив преимуществ для этой стороны\n" +
                "   - disadvantages: массив недостатков для этой стороны\n\n" +
                "4. conclusion - объект с общим заключением:\n" +
                "   - contractQuality: оценка качества составления (высокий/средний/низкий)\n" +
                "   - balanceOfPower: какая сторона в более выгодном положении\n" +
                "   - mainProblems: основные проблемы договора\n" +
                "   - recommendedActions: рекомендуемые действия\n\n" +
                "Анализ должен быть максимально конкретным, с указанием номеров пунктов договора и предложением точных формулировок для улучшения.",
        messages: [
          {
            role: "user",
            content: `Пожалуйста, проанализируйте следующий договор и верните результат в формате JSON:\n\n${text}`
          }
        ],
      });

      // Парсим JSON из ответа
      const analysisResult = JSON.parse(response.content[0].text);
      
      // Проверяем наличие всех необходимых полей
      if (!analysisResult.party1 || !analysisResult.party2) {
        throw new Error('Не удалось определить стороны договора');
      }

      return {
        party1: analysisResult.party1,
        party2: analysisResult.party2,
        mainTerms: analysisResult.mainTerms || {
          subject: 'Не удалось определить предмет договора',
          price: 'Не удалось определить условия оплаты',
          duration: 'Не удалось определить срок действия',
          responsibilities: 'Не удалось определить обязанности сторон'
        },
        analysis: analysisResult.analysis || {
          party1Analysis: {
            criticalErrors: [],
            risks: [],
            improvements: [],
            advantages: [],
            disadvantages: []
          },
          party2Analysis: {
            criticalErrors: [],
            risks: [],
            improvements: [],
            advantages: [],
            disadvantages: []
          }
        },
        conclusion: analysisResult.conclusion || {
          contractQuality: 'средний',
          balanceOfPower: 'не определено',
          mainProblems: [],
          recommendedActions: []
        }
      };
    } catch (error) {
      console.error('Ошибка при анализе документа через Anthropic:', error);
      throw new Error('Не удалось выполнить анализ документа. Пожалуйста, попробуйте позже.');
    }
  }
}

module.exports = new AnthropicService(); 