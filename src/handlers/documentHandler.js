const { downloadTelegramFile, extractTextFromDocument } = require('../utils/documentParser');
const anthropicService = require('../utils/anthropic');
const { getUserSettings } = require('../models/userSettings');
const { canMakeRequest, registerRequest, getPlansInfo, PLANS } = require('../models/userLimits');
const path = require('path');
const axios = require('axios');
const config = require('../config');

/**
 * Обработчик документов
 * @param {Object} bot - Экземпляр бота 
 * @param {Object} msg - Сообщение от пользователя с документом
 * @param {Object} options - Дополнительные опции
 * @param {boolean} options.forceContract - Принудительно обработать как договор
 */
async function handleDocument(bot, msg, options = {}) {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const fileId = msg.document.file_id;
  const fileName = msg.document.file_name || 'неизвестный файл';
  const fileExt = path.extname(fileName).toLowerCase();
  const forceContract = options.forceContract || msg._isForceContract;
  
  // Проверяем, если документ отправлен с подписью, содержащей ключевое слово "договор" или "контракт"
  const hasForceKeyword = msg.caption && 
    (/договор|контракт|соглашение|анализ/i).test(msg.caption.toLowerCase());
  const hasContractInName = (/договор|соглашение|контракт/i).test(fileName.toLowerCase());
  
  // Если в подписи или имени файла есть указание на договор, устанавливаем флаг принудительной обработки
  const shouldForceContract = forceContract || hasForceKeyword || hasContractInName;
  
  // Проверяем возможность проверки документа (доступность лимитов)
  const verificationCheck = canMakeRequest(userId);
  
  if (!verificationCheck.allowed) {
    if (verificationCheck.reason === 'payment_required') {
      // Требуется оплата
      bot.sendMessage(
        chatId,
        '⚠️ *Требуется оплата*\n\nВаш тариф еще не оплачен. Используйте команду /payment для оплаты или /downgrade для возврата к бесплатному тарифу.',
        { parse_mode: 'Markdown' }
      );
      return;
    } else if (verificationCheck.reason === 'limit_reached') {
      // Превышен лимит запросов
      bot.sendMessage(
        chatId,
        `⚠️ *Превышен лимит запросов*\n\nВы достигли лимита проверок документов для вашего тарифа.\n\nИспользуйте команду /plans для просмотра и выбора тарифа с большим количеством проверок.`,
        { parse_mode: 'Markdown' }
      );
      return;
    }
  }
  
  // Проверку лимитов для полного анализа проведем после определения типа документа
  const limitCheck = canMakeRequest(userId);
  
  // Проверяем поддерживаемые форматы
  const supportedFormats = ['.txt', '.pdf', '.doc', '.docx', '.rtf', '.html', '.htm'];
  if (!supportedFormats.includes(fileExt)) {
    bot.sendMessage(
      chatId,
      `Формат файла "${fileExt}" не поддерживается. Пожалуйста, отправьте документ в одном из следующих форматов: TXT, PDF, DOC, DOCX, RTF, HTML.`
    );
    return;
  }
  
  try {
    console.log(`Начало обработки документа: ${fileName} (${fileExt})`);
    
    // Отправляем сообщение о начале обработки
    const processingMsg = await bot.sendMessage(
      chatId, 
      `Обрабатываю документ "${fileName}" (${fileExt.replace('.', '')}), это может занять некоторое время...`
    );
    
    // Таймаут для загрузки файла
    const downloadTimeout = setTimeout(() => {
      bot.editMessageText(
        `Загрузка документа "${fileName}" занимает больше времени, чем обычно. Пожалуйста, подождите...`, 
        {
          chat_id: chatId,
          message_id: processingMsg.message_id
        }
      ).catch(err => console.error('Ошибка при обновлении сообщения о таймауте загрузки:', err));
    }, 10000); // 10 секунд
    
    // Загружаем файл
    const filePath = await downloadTelegramFile(fileId, bot);
    clearTimeout(downloadTimeout);
    
    console.log(`Файл загружен: ${filePath}`);
    
    // Обновляем сообщение
    await bot.editMessageText(
      `Извлекаю текст из документа "${fileName}"...`, 
      {
        chat_id: chatId,
        message_id: processingMsg.message_id
      }
    );
    
    // Таймаут для извлечения текста
    const extractTimeout = setTimeout(() => {
      bot.editMessageText(
        `Извлечение текста из документа "${fileName}" занимает больше времени, чем обычно. Для больших документов это нормально, пожалуйста, подождите...`, 
        {
          chat_id: chatId,
          message_id: processingMsg.message_id
        }
      ).catch(err => console.error('Ошибка при обновлении сообщения о таймауте извлечения текста:', err));
    }, 15000); // 15 секунд
    
    // Извлекаем текст из документа
    const documentText = await extractTextFromDocument(filePath);
    clearTimeout(extractTimeout);
    
    console.log(`Текст извлечен, длина: ${documentText ? documentText.length : 0} символов`);
    
    if (!documentText) {
      bot.sendMessage(
        chatId, 
        `Не удалось извлечь текст из документа "${fileName}". Пожалуйста, убедитесь, что файл не поврежден и содержит текст.`
      );
      return;
    }
    
    // Получаем настройки пользователя
    const userSettings = getUserSettings(userId);
    
    // Предварительная проверка, является ли документ договором, если не задан forceContract
    if (!shouldForceContract) {
      await bot.editMessageText(
        `Проверяю, является ли документ "${fileName}" договором...`, 
        {
          chat_id: chatId,
          message_id: processingMsg.message_id
        }
      );
      
      // Проверка на договор
      const isContract = await isContractDocument(documentText);
      
      if (!isContract.result) {
        // Проверяем, есть ли в названии файла указание на договор
        const hasContractInName = (/договор|соглашение|контракт/i).test(fileName.toLowerCase());
        
        if (hasContractInName) {
          console.log(`В имени файла "${fileName}" обнаружено указание на договор, обрабатываем как договор несмотря на проверку`);
          // Продолжаем обработку, так как в имени файла есть указание на договор
        } else {
          try {
            // Создаём короткий идентификатор вне зависимости от длины file_id
            // Это гарантирует, что callback_data всегда будет короткой
            const shortId = `d${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
            
            // Сохраняем file_id в глобальной переменной
            if (!global.tempFileIdStorage) {
              global.tempFileIdStorage = {};
            }
            global.tempFileIdStorage[shortId] = fileId;
            
            console.log(`Создан временный идентификатор для документа: ${shortId} -> fileId (${fileId.length} символов)`);
            
            // Используем короткий идентификатор в callback_data
            const callbackData = `force_contract:${shortId}`;
            
            // Предлагаем пользователю подтвердить, что это договор
            const keyboard = {
              inline_keyboard: [
                [
                  { text: '✅ Да, это договор', callback_data: callbackData }
                ]
              ]
            };
            
            // Формируем сообщение с учетом причины определения документа
            let rejectMessage = `⚠️ *Документ не похож на договор*\n\n${isContract.reason}`;
            
            // Добавляем дополнительные инструкции
            if (isContract.reason.toLowerCase().includes('счет')) {
              rejectMessage += '\n\nЭтот бот предназначен для анализа договоров, а не счетов или финансовых документов.';
            }
            
            rejectMessage += '\n\nЕсли это всё же договор, нажмите кнопку ниже или отправьте документ заново с подписью, содержащей слово "договор".';
            
            await bot.editMessageText(
              rejectMessage, 
              {
                chat_id: chatId,
                message_id: processingMsg.message_id,
                parse_mode: 'Markdown',
                reply_markup: keyboard
              }
            );
          } catch (error) {
            console.error('Ошибка при создании клавиатуры для подтверждения договора:', error);
            // В случае ошибки отправляем сообщение без кнопки
            await bot.editMessageText(
              `⚠️ *Документ не похож на договор*\n\n${isContract.reason}\n\nОтправьте документ заново с подписью, содержащей слово "договор", чтобы обработать его как договор.`, 
              {
                chat_id: chatId,
                message_id: processingMsg.message_id,
                parse_mode: 'Markdown'
              }
            );
          }
          return;
        }
      }
    } else {
      console.log('Принудительная обработка документа как договор');
    }
    
    // Документ определен как договор или принудительно обрабатывается, проверяем лимиты перед полным анализом
    if (!limitCheck.allowed) {
      let message = '';
      
      if (limitCheck.reason === 'limit_exceeded') {
        const plansInfo = getPlansInfo();
        const basicPlan = plansInfo.BASIC;
        
        message = `
⚠️ *Достигнут лимит бесплатных запросов*

Документ определен как договор, но вы использовали все доступные запросы на бесплатном тарифе (${PLANS.FREE.requestLimit} запросов).

Чтобы продолжить использование бота, выберите один из платных тарифов:

*Базовый* - ${basicPlan.price} руб/мес
• До ${basicPlan.requestLimit} запросов в месяц
• ${basicPlan.description}

Для перехода на платный тариф используйте команду /upgrade
`;
      } else if (limitCheck.reason === 'payment_required') {
        message = '⚠️ *Требуется оплата*\n\nДокумент определен как договор, но ваш тариф еще не оплачен. Используйте команду /payment для оплаты или /downgrade для возврата к бесплатному тарифу.';
      }
      
      await bot.editMessageText(
        message,
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
          parse_mode: 'Markdown'
        }
      );
      return;
    }
    
    // Таймаут для большого документа
    if (documentText.length > 30000) {
      await bot.editMessageText(
        `Документ "${fileName}" очень большой (${Math.round(documentText.length / 1000)} КБ). Анализ может занять продолжительное время. Пожалуйста, не отменяйте процесс.`, 
        {
          chat_id: chatId,
          message_id: processingMsg.message_id
        }
      );
      
      // Даем пользователю время прочитать сообщение
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Отправляем сообщение о процессе анализа
    await bot.editMessageText(
      shouldForceContract 
        ? `Анализирую документ "${fileName}" как договор...\nЭто может занять до 2 минут.`
        : `Документ определен как договор. Анализирую...\nЭто может занять до 2 минут.`, 
      {
        chat_id: chatId,
        message_id: processingMsg.message_id
      }
    );
    
    // Таймаут для анализа
    const analysisTimeout = setTimeout(() => {
      bot.editMessageText(
        `Анализ документа "${fileName}" занимает больше времени, чем обычно. Обрабатываем большие объемы текста. Пожалуйста, подождите...`, 
        {
          chat_id: chatId,
          message_id: processingMsg.message_id
        }
      ).catch(err => console.error('Ошибка при обновлении сообщения о таймауте анализа:', err));
    }, 45000); // 45 секунд
    
    // Анализируем документ
    const analysis = await analyzeDocumentWithSelectedModel(documentText);
    clearTimeout(analysisTimeout);
    
    console.log('Анализ завершен, формирую ответ...');
    
    // Регистрируем использование запроса
    registerRequest(userId);
    
    // Получаем обновленные данные о лимитах
    const updatedLimits = canMakeRequest(userId);
    let limitInfo = '';
    
    if (updatedLimits.remainingRequests === 0) {
      limitInfo = '\n\n⚠️ Это был ваш последний бесплатный запрос. Для продолжения использования бота приобретите платный тариф с помощью команды /upgrade.';
    } else if (updatedLimits.remainingRequests <= 2 && PLANS.FREE.requestLimit <= 3) {
      limitInfo = `\n\n⚠️ У вас осталось ${updatedLimits.remainingRequests} бесплатных запросов.`;
    }

    // Сохраняем результаты анализа
    if (!global.tempStorage) {
      global.tempStorage = {};
    }
    global.tempStorage[userId] = {
      analysis,
      documentId: fileId
    };

    // Создаем клавиатуру для выбора стороны
    const keyboard = {
      inline_keyboard: [
        [
          { 
            text: `${analysis.party1.role} (${analysis.party1.name})`, 
            callback_data: `select_party:${userId}:party1` 
          }
        ],
        [
          { 
            text: `${analysis.party2.role} (${analysis.party2.name})`, 
            callback_data: `select_party:${userId}:party2` 
          }
        ]
      ]
    };

    // Формируем сообщение с результатами анализа
    const message = 
      `📄 *Анализ договора завершен*\n\n` +
      `*Определены стороны договора:*\n` +
      `1️⃣ ${analysis.party1.role}: *${analysis.party1.name}*\n` +
      `2️⃣ ${analysis.party2.role}: *${analysis.party2.name}*\n\n` +
      `Выберите, какой стороной договора вы являетесь:${limitInfo}\n\n` +
      `❗️ _Обратите внимание: данный анализ не является юридической консультацией и представляет собой автоматизированный информационный обзор документа._`;

    // Отправляем результат
    await bot.editMessageText(message, {
      chat_id: chatId,
      message_id: processingMsg.message_id,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
    console.log('Ответ отправлен пользователю. Обработка документа завершена успешно.');
  } catch (error) {
    console.error('Ошибка при обработке документа:', error);
    
    // Формируем понятное сообщение об ошибке для пользователя
    let errorMessage = 'Произошла ошибка при обработке документа.';
    
    if (error.message.includes('Текст документа пуст')) {
      errorMessage = 'Не удалось извлечь текст из документа. Пожалуйста, убедитесь, что документ содержит текст и не является изображением.';
    } else if (error.message.includes('Не удалось определить стороны договора')) {
      errorMessage = 'Не удалось определить стороны договора. Пожалуйста, убедитесь, что документ является договором и содержит информацию о сторонах.';
    } else if (error.message.includes('Не удалось разобрать ответ')) {
      errorMessage = 'Произошла ошибка при анализе документа. Пожалуйста, попробуйте еще раз или отправьте документ меньшего размера.';
    } else if (error.code === 'context_length_exceeded' || error.message.includes('maximum context length')) {
      errorMessage = 'Документ слишком большой для анализа. Пожалуйста, отправьте сокращенную версию документа или только наиболее важные разделы договора.';
    } else if (error.message.includes('response_format') || error.param === 'response_format') {
      errorMessage = 'Произошла техническая ошибка при анализе. Мы уже работаем над её устранением. Пожалуйста, повторите попытку через несколько минут.';
    }
    
    bot.sendMessage(chatId, `❌ ${errorMessage}`);
  }
}

/**
 * Делит текст на части с учетом границ предложений
 * @param {string} text - Текст для разделения
 * @param {number} maxPartLength - Максимальная длина части
 * @returns {Array<string>} - Массив частей текста
 */
function splitTextIntoParts(text, maxPartLength) {
  const parts = [];
  let currentPart = '';
  
  // Разбиваем текст на предложения
  const sentences = text.split(/(?<=[.!?])\s+/);
  
  for (const sentence of sentences) {
    // Если добавление предложения превысит максимальную длину части
    if ((currentPart + sentence).length > maxPartLength) {
      // Если текущая часть не пуста, добавляем ее в массив
      if (currentPart) {
        parts.push(currentPart);
        currentPart = '';
      }
      
      // Если предложение слишком длинное для одной части
      if (sentence.length > maxPartLength) {
        // Разбиваем длинное предложение на части
        let remainingSentence = sentence;
        while (remainingSentence.length > 0) {
          const partLength = Math.min(remainingSentence.length, maxPartLength);
          parts.push(remainingSentence.substring(0, partLength));
          remainingSentence = remainingSentence.substring(partLength);
        }
      } else {
        currentPart = sentence;
      }
    } else {
      currentPart += sentence;
    }
  }
  
  // Добавляем последнюю часть, если она не пуста
  if (currentPart) {
    parts.push(currentPart);
  }
  
  return parts;
}

// Добавляем обработчик выбора стороны
async function handlePartySelection(bot, query) {
  const userId = query.from.id.toString();
  const chatId = query.message.chat.id;
  const data = query.data;
  const [action, user, party] = data.split(':');

  if (action !== 'select_party' || user !== userId) {
    return;
  }

  try {
    if (!global.tempStorage) {
      global.tempStorage = {};
    }

    const userData = global.tempStorage[userId];
    if (!userData || !userData.analysis) {
      await bot.answerCallbackQuery(query.id, { 
        text: 'Ошибка: данные анализа не найдены. Пожалуйста, отправьте документ повторно.',
        show_alert: true
      });
      return;
    }

    const analysis = userData.analysis;
    const selectedParty = party === 'party1' ? analysis.party1 : analysis.party2;
    const otherParty = party === 'party1' ? analysis.party2 : analysis.party1;
    
    // Получаем анализ для выбранной стороны
    const partyAnalysis = party === 'party1' ? analysis.analysis.party1Analysis : analysis.analysis.party2Analysis;

    // Удаляем сообщение с кнопками выбора
    await bot.deleteMessage(chatId, query.message.message_id);

    // СООБЩЕНИЕ 1: Существенные условия договора
    let termsMessage = `📋 *СУЩЕСТВЕННЫЕ УСЛОВИЯ ДОГОВОРА*\n\n`;
    
    // Стороны договора
    termsMessage += `*1️⃣ СТОРОНЫ ДОГОВОРА:*\n`;
    termsMessage += `• ${analysis.party1.role}: *${analysis.party1.name}*\n`;
    termsMessage += `• ${analysis.party2.role}: *${analysis.party2.name}*\n\n`;
    
    // Предмет договора
    termsMessage += `*2️⃣ ПРЕДМЕТ ДОГОВОРА:*\n`;
    termsMessage += `${analysis.mainTerms.subject}\n\n`;
    
    // Стоимость и порядок оплаты
    termsMessage += `*3️⃣ СТОИМОСТЬ И ПОРЯДОК ОПЛАТЫ:*\n`;
    termsMessage += `${analysis.mainTerms.price}\n\n`;
    
    // Срок действия
    termsMessage += `*4️⃣ СРОК ДЕЙСТВИЯ ДОГОВОРА:*\n`;
    termsMessage += `${analysis.mainTerms.duration}\n\n`;
    
    // Основные обязанности сторон
    termsMessage += `*5️⃣ ОСНОВНЫЕ ОБЯЗАННОСТИ СТОРОН:*\n`;
    termsMessage += `${analysis.mainTerms.responsibilities}\n\n`;
    
    // Особые условия
    if (analysis.mainTerms.special && analysis.mainTerms.special !== 'Особые условия не выявлены') {
      termsMessage += `*6️⃣ ОСОБЫЕ УСЛОВИЯ:*\n`;
      termsMessage += `${analysis.mainTerms.special}\n\n`;
    }

    termsMessage += `❗️ _Данная информация носит справочный характер и не является юридическим заключением._`;

    // Отправляем первое сообщение с условиями
    await bot.sendMessage(chatId, termsMessage, { parse_mode: 'Markdown' });

    // СООБЩЕНИЕ 2: Анализ и рекомендации
    let analysisMessage = `*ИНФОРМАЦИЯ ДЛЯ ОБСУЖДЕНИЯ УСЛОВИЙ ДОГОВОРА*\n\n`;
    
    let sectionNumber = 1;
    
    // Существенные условия, требующие уточнения
    if (partyAnalysis.criticalErrors && partyAnalysis.criticalErrors.length > 0) {
      analysisMessage += `*${sectionNumber}. МОМЕНТЫ, КОТОРЫЕ МОГУТ ПОТРЕБОВАТЬ ОБСУЖДЕНИЯ:*\n\n`;
      partyAnalysis.criticalErrors.forEach((error, index) => {
        analysisMessage += `${index + 1}. ${error}\n`;
      });
      analysisMessage += '\n';
      sectionNumber++;
    }
    
    // Предложения по конкретизации условий
    if (partyAnalysis.improvements && partyAnalysis.improvements.length > 0) {
      analysisMessage += `*${sectionNumber}. ПУНКТЫ, КОТОРЫЕ МОЖНО ОБСУДИТЬ ДЛЯ БОЛЬШЕЙ ЯСНОСТИ:*\n\n`;
      partyAnalysis.improvements.forEach((imp, index) => {
        analysisMessage += `${index + 1}. ${imp}\n`;
      });
      analysisMessage += '\n';
      sectionNumber++;
    }
    
    // Вопросы для обсуждения
    if (partyAnalysis.risks && partyAnalysis.risks.length > 0) {
      analysisMessage += `*${sectionNumber}. ВОПРОСЫ ДЛЯ СОГЛАСОВАНИЯ С КОНТРАГЕНТОМ:*\n\n`;
      partyAnalysis.risks.forEach((risk, index) => {
        analysisMessage += `${index + 1}. ${risk}\n`;
      });
      analysisMessage += '\n';
      sectionNumber++;
    }
    
    // Итоговые предложения
    if (analysis.conclusion.mainProblems && analysis.conclusion.mainProblems.length > 0) {
      analysisMessage += `*${sectionNumber}. ПОТЕНЦИАЛЬНЫЕ ВОПРОСЫ ДЛЯ УТОЧНЕНИЯ:*\n\n`;
      analysis.conclusion.mainProblems.forEach((problem, index) => {
        analysisMessage += `${index + 1}. ${problem}\n`;
      });
      analysisMessage += '\n';
      sectionNumber++;
    }
    
    if (analysis.conclusion.recommendedActions && analysis.conclusion.recommendedActions.length > 0) {
      analysisMessage += `*${sectionNumber}. ВОЗМОЖНЫЕ ШАГИ ПО РАБОТЕ С ДОГОВОРОМ:*\n\n`;
      analysis.conclusion.recommendedActions.forEach((action, index) => {
        analysisMessage += `${index + 1}. ${action}\n`;
      });
    }

    analysisMessage += `\n❗️ _Обратите внимание: все содержащиеся здесь наблюдения не являются юридической консультацией и предоставляются исключительно в информационных целях. Для получения квалифицированной юридической помощи обратитесь к лицензированным специалистам._`;

    // Отправляем второе сообщение с анализом
    await bot.sendMessage(chatId, analysisMessage, { parse_mode: 'Markdown' });

    // Отправляем третье сообщение с призывом к действию
    await bot.sendMessage(chatId, '⬆️ *Вы можете переслать сообщение выше контрагенту для обсуждения условий договора*', { parse_mode: 'Markdown' });

    // Подтверждаем обработку callback query
    await bot.answerCallbackQuery(query.id);

    // Очищаем временное хранилище
    delete global.tempStorage[userId];

  } catch (error) {
    console.error('Ошибка при обработке выбора стороны:', error);
    await bot.answerCallbackQuery(query.id, { 
      text: 'Произошла ошибка при обработке выбора. Попробуйте отправить документ снова.',
      show_alert: true 
    });
  }
}

async function analyzeDocumentWithSelectedModel(text) {
  return await anthropicService.analyzeDocument(text);
}

// Упрощенная функция проверки документа
async function isContractDocument(text) {
  if (!text || text.trim() === '') {
    return { 
      result: false, 
      reason: 'Документ не содержит текста'
    };
  }
  
  // Простая проверка на ключевые слова договора
  const lowerText = text.toLowerCase().substring(0, 5000);
  const contractKeywords = [
    'договор', 'соглашение', 'контракт', 'стороны договорились', 
    'предмет договора', 'обязанности сторон', 'условия договора',
    'настоящий договор', 'обязуется', 'заключили настоящий',
    'исполнитель', 'заказчик', 'ответственность сторон'
  ];
  
  const contractKeywordsCount = contractKeywords.filter(keyword => 
    lowerText.includes(keyword.toLowerCase())
  ).length;
  
  if (contractKeywordsCount >= 3) {
    console.log(`Документ содержит ${contractKeywordsCount} ключевых слов договора. Быстрая проверка пройдена.`);
    return { 
      result: true, 
      reason: `Документ содержит характерные признаки договора (найдено ${contractKeywordsCount} ключевых слов)`
    };
  }
  
  // Проверка на счет
  if (lowerText.includes('счет на оплату') || lowerText.includes('счет-фактура') || 
      lowerText.includes('счет №') || lowerText.includes('счёт №')) {
    return { 
      result: false, 
      reason: 'Документ является счетом (обнаружены явные признаки счета)'
    };
  }
  
  // Если не удалось определить, считаем что это не договор и просим уточнить
  return {
    result: false,
    reason: 'Не удалось определить тип документа. Если это договор, пожалуйста, укажите это явно в сообщении.'
  };
}

module.exports = {
  handleDocument,
  handlePartySelection,
  isContractDocument
}; 