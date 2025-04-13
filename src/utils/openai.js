const OpenAI = require('openai');
const config = require('../config/config');

// Инициализация клиента OpenAI
const openai = new OpenAI({
  apiKey: config.openaiApiKey,
  timeout: 120000 // Увеличиваем таймаут до 2 минут
});

/**
 * Проверка, является ли документ договором
 * @param {string} text - Текст документа
 * @returns {Promise<Object>} - Результат проверки: {result: boolean, reason: string}
 */
async function isContractDocument(text) {
  try {
    console.log('Проверка, является ли документ договором...');
    
    if (!text || text.trim() === '') {
      console.log('Ошибка: пустой текст документа');
      return { 
        result: false, 
        reason: 'Документ не содержит текста'
      };
    }

    // Берем только начало документа для быстрой проверки (примерно 5000 символов)
    const sampleText = text.substring(0, Math.min(text.length, 5000));
    const lowerText = sampleText.toLowerCase();
    
    // Суперлегкая проверка на очевидные признаки счета в первых строках
    if (lowerText.startsWith('счет') || lowerText.startsWith('счёт') ||
        lowerText.includes('счет на оплату') || lowerText.includes('счет-фактура') || 
        lowerText.includes('счет №') || lowerText.includes('счёт №')) {
      console.log('Документ начинается с явных признаков счета. Мгновенная проверка не пройдена.');
      return { 
        result: false, 
        reason: 'Документ является счетом (обнаружены явные признаки в начале документа)'
      };
    }
    
    // Проверка на типичный заголовок счета с номером
    const invoiceHeaderRegex = /счет\s+(?:на\s+оплату)?\s*№\s*\d+/i;
    if (invoiceHeaderRegex.test(lowerText.substring(0, 200))) {
      console.log('Документ содержит заголовок счета с номером. Мгновенная проверка не пройдена.');
      return { 
        result: false, 
        reason: 'Документ является счетом (обнаружен заголовок счета с номером)'
      };
    }
    
    // Проверяем ключевые слова, характерные для счетов и других финансовых документов
    const invoiceKeywords = [
      'счет на оплату', 'счет №', 'счет-фактура', 'оплатить', 'инвойс', 'invoice',
      'итого к оплате', 'банковские реквизиты', 'плательщик', 'получатель платежа',
      'счет выставлен на оплату', 'оплата до', 'цена', 'сумма', 'без ндс', 'с ндс',
      'итого:', 'всего к оплате', 'счет-проформа', 'выставлен счет', 
      'накладная', 'квитанция', 'товарная накладная', 'товарный чек',
      'в т.ч. ндс', 'услуги по счету', 'акт выполненных работ',
      'поставщик', 'номер счета', 'расчетный счет', 'к оплате', 'просим оплатить',
      'оплачено', 'сумма', 'стоимость', 'оплата', 'тариф', 'цена', 'за услуги',
      'наименование товара', 'наименование услуги', 'количество', 'цена за единицу',
      'единица измерения', 'счет должен быть оплачен'
    ];
    
    // Проверяем ключевые фразы, очень характерные для счетов (высокая значимость)
    const strongInvoiceKeywords = [
      'счет на оплату', 'счет №', 'счет-фактура', 'итого к оплате', 
      'всего к оплате', 'сумма к оплате', 'счет должен быть оплачен'
    ];
    
    // Проверяем наличие сильных признаков счета
    const hasStrongInvoiceKeywords = strongInvoiceKeywords.some(keyword => 
      lowerText.includes(keyword.toLowerCase())
    );
    
    // Расширенная проверка на наличие формы счета (более структурированный анализ)
    const hasInvoiceStructure = (
      // Проверка на наличие таблицы с товарами/услугами
      (lowerText.includes('наименование') && (lowerText.includes('количество') || lowerText.includes('цена'))) ||
      // Проверка на структуру с итоговой суммой
      (lowerText.includes('итого') && lowerText.includes('сумма')) ||
      // Проверка на реквизиты для оплаты
      (lowerText.includes('инн') && lowerText.includes('кпп') && lowerText.includes('расчетный счет'))
    );
    
    // Проверка табличной структуры типичной для счетов
    const tableHeaders = ['наименование', 'количество', 'цена', 'сумма', 'ед.', 'изм.', 'ндс', 'стоимость'];
    const hasTableStructure = tableHeaders.filter(header => lowerText.includes(header)).length >= 4;
    
    // Комбинированная проверка структуры документа
    const hasCompleteInvoiceStructure = hasInvoiceStructure || hasTableStructure;
    
    // Проверяем наличие ключевых слов для счетов и других финансовых документов
    const invoiceKeywordsCount = invoiceKeywords.filter(keyword => lowerText.includes(keyword.toLowerCase())).length;
    const contractKeywords = [
      'договор', 'соглашение', 'контракт', 'стороны договорились', 
      'предмет договора', 'обязанности сторон', 'условия договора',
      'настоящий договор', 'обязуется', 'заключили настоящий',
      'далее именуемый', 'реквизиты сторон', 'юридические адреса', 
      'сторона 1', 'сторона 2', 'исполнитель', 'заказчик',
      'ответственность сторон', 'форс-мажор', 'срок действия договора',
      'расторжение договора', 'порядок разрешения споров', 'конфиденциальность',
      'в лице', 'действующего на основании', 'стороны пришли к соглашению'
    ];
    
    // Проверяем наличие ключевых слов для договора
    const contractKeywordsCount = contractKeywords.filter(keyword => lowerText.includes(keyword.toLowerCase())).length;
    
    // Сравниваем, больше ли похож документ на счет, чем на договор
    if ((hasStrongInvoiceKeywords || hasCompleteInvoiceStructure || invoiceKeywordsCount >= 4) && 
        (invoiceKeywordsCount > contractKeywordsCount || contractKeywordsCount < 3)) {
      console.log(`Документ содержит ${invoiceKeywordsCount} признаков счета и ${contractKeywordsCount} признаков договора. ` + 
                 `Сильные признаки счета: ${hasStrongInvoiceKeywords}. Структура счета: ${hasCompleteInvoiceStructure}. Определен как счет.`);
      return { 
        result: false, 
        reason: `Документ похож на счет или другой финансовый документ (найдено ${invoiceKeywordsCount} ключевых слов счета), а не на договор (найдено ${contractKeywordsCount} ключевых слов договора)`
      };
    }
    
    // Проверяем наличие нескольких ключевых слов договора
    if (contractKeywordsCount >= 3) {
      console.log(`Документ содержит ${contractKeywordsCount} ключевых слов договора. Быстрая проверка пройдена.`);
      return { 
        result: true, 
        reason: `Документ содержит характерные признаки договора (найдено ${contractKeywordsCount} ключевых слов)`
      };
    }
    
    console.log('Документ требует более глубокого анализа. Проверяем через API...');
    console.log('Отправка запроса в OpenAI API для проверки типа документа...');
    const startTime = Date.now();
    
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo', // Используем более быструю модель для предварительной проверки
      messages: [
        { 
          role: 'system', 
          content: 'Ты - эксперт по определению типов документов. Твоя задача - точно определить тип документа: договор/контракт/соглашение или иной тип документа (счет, акт, справка и т.д.). Будь предельно внимателен в классификации счетов и договоров. Ты должен четко различать эти типы документов, не путать их.'
        },
        { 
          role: 'user', 
          content: `Определи, что это за документ: договор/контракт/соглашение или иной тип (счет, акт, справка и др.)? 
Если это не договор/контракт/соглашение, укажи конкретный тип документа.
Ответь ТОЛЬКО в формате "Это {тип документа}: {краткое пояснение}"

ВАЖНО! Характерные признаки разных типов документов:

Договор:
- Содержит явные условия сотрудничества, взаимные обязательства сторон
- Присутствуют разделы: предмет договора, права и обязанности сторон, ответственность сторон
- Встречаются фразы: "стороны договорились", "заключили настоящий договор"
- Содержит юридически значимые условия, сроки, порядок разрешения споров
- Обычно содержит реквизиты обеих сторон

Счет:
- Перечень услуг/товаров с ценами и общей суммой к оплате
- Содержит фразы: "счет на оплату", "счет №", "итого к оплате", "оплатить до"
- Есть реквизиты для оплаты, нет взаимных обязательств
- Обычно содержит таблицу с наименованиями, количеством, ценами
- Присутствуют банковские реквизиты получателя платежа

Примеры ответов:
"Это договор: содержит условия сотрудничества между сторонами"
"Это счет: документ на оплату услуг/товаров с указанием сумм"
"Это акт: подтверждает выполнение работ/оказание услуг"

Документ начинается так:
${sampleText}` 
        }
      ],
      temperature: 0.3, // Уменьшаем temperature для более четкой классификации
      max_tokens: 150
    });

    const endTime = Date.now();
    console.log(`Ответ от OpenAI получен за ${(endTime - startTime) / 1000} секунд`);
    
    const answer = response.choices[0].message.content.toLowerCase();
    console.log(`Результат проверки: ${answer}`);
    
    // Анализируем ответ
    if (answer.includes('договор') || answer.includes('контракт') || answer.includes('соглашение') || 
        answer.includes('согласие') || answer.includes('оферта') || answer.includes('меморандум') ||
        answer.includes('партнерское соглашение') || answer.includes('партнерство')) {
      return { 
        result: true, 
        reason: '' 
      };
    } else {
      // Извлекаем тип документа из ответа
      const typeMatch = answer.match(/это\s+([^:]+):/i);
      const type = typeMatch ? typeMatch[1].trim() : 'не договор';
      
      // Извлекаем причину
      const reasonMatch = answer.match(/:[^:]*(.+)/i);
      const reasonText = reasonMatch ? reasonMatch[1].trim() : '';
      
      console.log(`Документ определен как: ${type}. Причина: ${reasonText}`);
      
      return { 
        result: false, 
        reason: `Документ определен как ${type}${reasonText ? ': ' + reasonText : ''}`
      };
    }
  } catch (error) {
    console.error('Ошибка при проверке типа документа:', error);
    // В случае ошибки запрашиваем подтверждение пользователя
    return { 
      result: false, 
      reason: 'Не удалось точно определить тип документа. Если это договор, пожалуйста, укажите это явно в сообщении.' 
    };
  }
}

/**
 * Анализ документа с использованием OpenAI
 * @param {string} text - Текст документа
 * @returns {Promise<Object>} - Результат анализа
 */
async function analyzeDocument(text) {
  try {
    // Проверяем длину текста
    if (!text || text.length === 0) {
      throw new Error('Текст документа пуст');
    }

    // Ограничиваем размер текста для предотвращения превышения контекста
    // GPT-4 имеет ограничение около 8192 токенов, поэтому берем только часть документа
    // Примерная оценка: 1 токен = ~4 символа, максимум ~4500 символов для текста документа
    if (text.length > 4500) {
      console.log(`Документ слишком большой (${text.length} символов), ограничиваем до 4500 символов`);
      text = text.substring(0, 4500) + '... [текст сокращен из-за ограничений размера]';
    }

    console.log('Отправка запроса на анализ документа в OpenAI...');
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `Вы - опытный юрист-эксперт по анализу договоров. Проведите глубокий юридический анализ договора и определите:

1. Стороны договора (их роли и названия)
2. Существенные условия договора:
   - Предмет договора
   - Цена и порядок оплаты
   - Сроки исполнения обязательств
   - Права и обязанности сторон
   - Ответственность сторон
   - Порядок разрешения споров
   - Особые условия (если есть)

3. Потенциальные риски для каждой из сторон:
   - Финансовые риски
   - Юридические риски
   - Операционные риски
   - Риски неисполнения обязательств
   - Риски расторжения договора

4. Рекомендации по улучшению защиты для каждой стороны:
   - Конкретные формулировки для усиления позиции
   - Дополнительные условия для включения в договор
   - Механизмы контроля и обеспечения обязательств
   - Способы минимизации выявленных рисков

5. Общая оценка сбалансированности договора:
   - Какая сторона находится в более защищенной позиции
   - Причины такого распределения прав и обязанностей
   - Рекомендации по балансировке условий

ОЧЕНЬ ВАЖНО: ваш ответ ДОЛЖЕН быть СТРОГО в формате JSON. Проверьте, что JSON валиден и не содержит ошибок. Используйте только двойные кавычки для строк и ключей. Обязательно соблюдайте правильную вложенность скобок и запятые между элементами.

{
  "parties": {
    "party1": {
      "name": "название первой стороны",
      "role": "роль в договоре (например, Заказчик, Исполнитель, Покупатель, Продавец)"
    },
    "party2": {
      "name": "название второй стороны",
      "role": "роль в договоре"
    }
  },
  "terms": [
    "детальное описание каждого существенного условия"
  ],
  "risks": {
    "party1": [
      "подробное описание каждого риска для первой стороны"
    ],
    "party2": [
      "подробное описание каждого риска для второй стороны"
    ]
  },
  "recommendations": {
    "party1": [
      "конкретные рекомендации по улучшению защиты первой стороны"
    ],
    "party2": [
      "конкретные рекомендации по улучшению защиты второй стороны"
    ]
  },
  "more_protected": "party1 или party2",
  "protection_reasons": [
    "причины, по которым одна сторона находится в более выгодной позиции"
  ]
}`
        },
        {
          role: "user",
          content: text
        }
      ],
      temperature: 0.5,
      max_tokens: 2000
    });

    try {
      console.log('Получен ответ от OpenAI, попытка разбора JSON...');
      
      let jsonContent = completion.choices[0].message.content;
      
      // Попытка очистить JSON от потенциальных маркеров и мусора
      // Найдем первую открывающую и последнюю закрывающую скобки
      const firstBrace = jsonContent.indexOf('{');
      const lastBrace = jsonContent.lastIndexOf('}');
      
      if (firstBrace > 0 || lastBrace < jsonContent.length - 1) {
        console.log(`Обнаружен неожиданный текст вокруг JSON. Очищаем...`);
        if (firstBrace >= 0 && lastBrace >= 0) {
          jsonContent = jsonContent.substring(firstBrace, lastBrace + 1);
        }
      }
      
      const analysis = JSON.parse(jsonContent);
      
      // Проверяем структуру ответа
      if (!analysis.parties || !analysis.parties.party1 || !analysis.parties.party2) {
        throw new Error('Некорректная структура ответа: отсутствуют данные о сторонах договора');
      }

      // Проверяем наличие всех необходимых полей
      if (!analysis.terms || !Array.isArray(analysis.terms)) {
        analysis.terms = [];
      }

      if (!analysis.risks || !analysis.risks.party1 || !analysis.risks.party2) {
        analysis.risks = {
          party1: [],
          party2: []
        };
      }

      if (!analysis.recommendations || !analysis.recommendations.party1 || !analysis.recommendations.party2) {
        analysis.recommendations = {
          party1: [
            "Проверьте наличие всех существенных условий договора",
            "Убедитесь в четком определении прав и обязанностей сторон",
            "Пропишите детальный порядок разрешения споров",
            "Добавьте условия о конфиденциальности",
            "Уточните механизмы контроля исполнения обязательств"
          ],
          party2: [
            "Проверьте наличие всех существенных условий договора",
            "Убедитесь в четком определении прав и обязанностей сторон",
            "Пропишите детальный порядок разрешения споров",
            "Добавьте условия о конфиденциальности",
            "Уточните механизмы контроля исполнения обязательств"
          ]
        };
      }

      if (!analysis.protection_reasons || !Array.isArray(analysis.protection_reasons)) {
        analysis.protection_reasons = ["Требуется более детальный анализ для определения причин"];
      }
      
      if (!analysis.more_protected || (analysis.more_protected !== "party1" && analysis.more_protected !== "party2")) {
        // Если не указано, какая сторона более защищена, выбираем по количеству рисков
        analysis.more_protected = analysis.risks.party1.length <= analysis.risks.party2.length ? "party1" : "party2";
      }
      
      return analysis;
    } catch (parseError) {
      console.error('Ошибка при разборе JSON ответа:', parseError);
      
      // Создаем базовый шаблон анализа в случае ошибки парсинга
      return {
        parties: {
          party1: {
            name: "Первая сторона (имя не удалось определить)",
            role: "Сторона 1"
          },
          party2: {
            name: "Вторая сторона (имя не удалось определить)",
            role: "Сторона 2"
          }
        },
        terms: [
          "Не удалось извлечь условия договора из-за технической ошибки"
        ],
        risks: {
          party1: [
            "Рекомендуется внимательно изучить договор на предмет рисков, так как автоматический анализ не удался"
          ],
          party2: [
            "Рекомендуется внимательно изучить договор на предмет рисков, так как автоматический анализ не удался"
          ]
        },
        recommendations: {
          party1: [
            "Проверьте наличие всех существенных условий договора",
            "Убедитесь в четком определении прав и обязанностей сторон",
            "Пропишите детальный порядок разрешения споров",
            "Добавьте условия о конфиденциальности",
            "Обратитесь к юристу для профессионального анализа договора"
          ],
          party2: [
            "Проверьте наличие всех существенных условий договора",
            "Убедитесь в четком определении прав и обязанностей сторон",
            "Пропишите детальный порядок разрешения споров",
            "Добавьте условия о конфиденциальности",
            "Обратитесь к юристу для профессионального анализа договора"
          ]
        },
        more_protected: "party1",
        protection_reasons: [
          "Не удалось определить из-за технической ошибки при анализе"
        ]
      };
    }
  } catch (error) {
    console.error('Ошибка при анализе документа:', error);
    throw error;
  }
}

module.exports = {
  analyzeDocument,
  isContractDocument
}; 