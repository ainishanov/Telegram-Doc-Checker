const { downloadTelegramFile, extractTextFromDocument, downloadTelegramPhoto } = require('../utils/documentParser');
const anthropicService = require('../utils/anthropic');
const { getUserSettings } = require('../models/userSettings');
const { canUserMakeRequest, registerRequestUsage, getAllPlans, PLANS } = require('../models/userLimits');
const path = require('path');
const axios = require('axios');
const config = require('../config/config');

// В начало файла добавим отслеживание сообщений пользователя для принудительной обработки
const pendingForceProcessing = {};

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
  const verificationCheck = canUserMakeRequest(userId);
  
  if (!verificationCheck.allowed) {
    if (verificationCheck.reason === 'subscription_inactive') {
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
  const limitCheck = canUserMakeRequest(userId);
  
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
    console.log('Начинаю извлечение текста из документа...');
    
    let documentText;
    try {
      documentText = await extractTextFromDocument(filePath);
      clearTimeout(extractTimeout);
      console.log(`Текст успешно извлечен, размер: ${documentText ? documentText.length : 0} символов`);
      
      // Проверяем, что текст был успешно извлечен
      if (!documentText || documentText.trim() === '') {
        throw new Error('Текст документа пуст');
      }
      
      // Проверяем, содержит ли текст сообщение об ошибке из модуля извлечения
      if (documentText.startsWith('Не удалось извлечь текст')) {
        throw new Error(documentText);
      }
      
      // Проверяем, содержит ли текст предупреждение о тексте в виде изображений
      const hasImageWarning = documentText.includes('[ВНИМАНИЕ: Документ содержит текст в виде изображений');
      
      // Если документ содержит предупреждение о тексте в виде изображений
      if (hasImageWarning) {
        // Мы все равно пытаемся анализировать документ, но уведомляем пользователя
        await bot.editMessageText(
          `⚠️ Документ "${fileName}" содержит текст в виде изображений. Выполняем анализ на основе частично извлеченного текста...`, 
          {
            chat_id: chatId,
            message_id: processingMsg.message_id
          }
        );
      }
    } catch (extractError) {
      console.error('Ошибка при извлечении текста из документа:', extractError);
      
      let errorMessage = 'Произошла ошибка при извлечении текста из документа.';
      
      if (extractError.message.includes('PDF слишком большой') || 
          extractError.message.includes('превышает возможности') ||
          extractError.message.includes('слишком большой для обработки')) {
        errorMessage = 'Документ слишком большой для обработки. Пожалуйста, отправьте сокращенную версию документа (до 20 МБ).';
      } else if (extractError.message.includes('защищен') || 
                extractError.message.includes('содержит только изображения')) {
        errorMessage = 'Не удалось извлечь текст из документа. Документ может быть защищен от копирования или содержать только изображения. Отправьте документ с подписью "договор" для принудительной обработки с OCR.';
      } else if (extractError.message.includes('Текст документа пуст')) {
        errorMessage = 'Документ не содержит текста или формат документа не поддерживается. Пожалуйста, отправьте документ с подписью "договор" для принудительной OCR-обработки.';
      }
      
      await bot.editMessageText(
        `❌ ${errorMessage}`, 
        {
          chat_id: chatId,
          message_id: processingMsg.message_id
        }
      );
      
      console.log(`Отправлено сообщение об ошибке извлечения текста: ${errorMessage}`);
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
      
      if (limitCheck.reason === 'limit_reached') {
        const plansInfo = getAllPlans();
        const basicPlan = plansInfo.find(plan => plan.id === 'BASIC');
        
        message = `
⚠️ *Достигнут лимит бесплатных запросов*

Документ определен как договор, но вы использовали все доступные запросы на бесплатном тарифе (${PLANS.FREE.requestLimit} запросов).

Чтобы продолжить использование бота, выберите один из платных тарифов:

*Базовый* - ${basicPlan.price} руб/мес
• До ${basicPlan.requestLimit} запросов в месяц
• ${basicPlan.description}

Для перехода на платный тариф используйте команду /upgrade
`;
      } else if (limitCheck.reason === 'subscription_inactive') {
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
    
    // Проверяем, содержит ли текст достаточно структурированной информации
    const hasStructuredText = checkTextStructure(documentText);
    if (!hasStructuredText) {
      clearTimeout(analysisTimeout);
      // Если текст не содержит структурированной информации, возвращаем сразу шаблон для неполного анализа
      console.log('Текст не содержит структурированной информации для анализа, возвращаем шаблон');
      
      // Создаем шаблон с пометкой о неполной информации
      const analysis = {
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
      
      // Логируем начало текста для отладки
      console.log('Начало текста документа (первые 200 символов):');
      console.log(documentText.substring(0, 200));
      console.log('Длина текста:', documentText.length);
      
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
              text: `${analysis.party1.role}`, 
              callback_data: `select_party:${userId}:party1` 
            }
          ],
          [
            { 
              text: `${analysis.party2.role}`, 
              callback_data: `select_party:${userId}:party2` 
            }
          ]
        ]
      };
      
      // Временно - добавляем возможность форсировать обработку
      const analysisTitle = "Документ с потенциальной OCR-проблемой";
      const forceMessage = createIncompleteAnalysisTemplate(documentText, analysisTitle, true) +
        `⚠️ *Внимание:* Алгоритм классифицировал этот документ как проблемный для распознавания текста.\n\n` +
        `*Диагностическая информация:*\n` +
        `• Длина текста: ${documentText.length} символов\n` +
        `• Документ обрабатывается с помощью улучшенного OCR\n\n` +
        `*Рекомендации:*\n` +
        `1. Если документ действительно содержит текст (а не изображения), попробуйте отправить его в другом формате (DOC, DOCX, TXT)\n` +
        `2. Используйте онлайн-сервисы OCR для преобразования PDF в текст:\n` +
        `   - pdf.online/ru/pdf-ocr\n` +
        `   - onlineocr.net/ru\n\n` +
        `Выберите любую сторону для получения дополнительных рекомендаций, или напишите "Обработать как текст":`;

      // Сохраняем информацию для возможной принудительной обработки
      pendingForceProcessing[userId] = {
        fileId: fileId,
        processingMsgId: processingMsg.message_id,
        documentText: documentText,
        timestamp: Date.now()
      };

      // Отправляем результат
      await bot.editMessageText(forceMessage, {
        chat_id: chatId,
        message_id: processingMsg.message_id,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: keyboard
      });
      
      console.log('Отправлено сообщение о недостаточной структурированности текста');
      return;
    }
    
    // Анализируем документ
    let analysis;
    try {
      analysis = await analyzeDocumentWithSelectedModel(documentText);
      clearTimeout(analysisTimeout);
    } catch (analysisError) {
      clearTimeout(analysisTimeout);
      console.error('Ошибка при анализе документа:', analysisError);
      
      // Формируем понятное сообщение об ошибке для разных случаев ошибок анализа
      let errorMessage = 'Произошла ошибка при анализе документа.';
      
      if (analysisError.message.includes('context_length_exceeded') || 
          analysisError.message.includes('maximum context length')) {
        errorMessage = 'Документ слишком большой для анализа. Пожалуйста, отправьте сокращенную версию документа или только наиболее важные разделы договора.';
      } else if (analysisError.message.includes('Текст документа пуст')) {
        errorMessage = 'Не удалось извлечь текст из документа. Пожалуйста, убедитесь, что документ содержит текстовую информацию, а не только изображения.';
      } else if (analysisError.message.includes('Не удалось определить стороны договора')) {
        errorMessage = 'Не удалось определить стороны договора. Возможно документ имеет нестандартную структуру или не содержит явного указания сторон.';
      } else if (analysisError.message.includes('Не удалось разобрать ответ')) {
        errorMessage = 'Произошла техническая ошибка при анализе документа. Пожалуйста, попробуйте еще раз или отправьте документ другого формата (например, в формате DOCX).';
      } 
      
      // Сообщаем пользователю о проблеме
      await bot.editMessageText(
        `❌ ${errorMessage}`, 
        {
          chat_id: chatId,
          message_id: processingMsg.message_id
        }
      );
      
      console.log(`Отправлено сообщение об ошибке пользователю: ${errorMessage}`);
      return;
    }
    
    console.log('Анализ завершен, формирую ответ...');
    
    // Регистрируем использование запроса
    registerRequestUsage(userId);
    
    // Получаем обновленные данные о лимитах
    const updatedLimits = canUserMakeRequest(userId);
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
    const message = analysis.incomplete 
      ? createIncompleteAnalysisTemplate(documentText, "Частичный анализ договора", true) +
        `*Определены стороны договора:*\n` +
        `1️⃣ ${analysis.party1.role}: *${analysis.party1.name}*\n` +
        `2️⃣ ${analysis.party2.role}: *${analysis.party2.name}*\n\n` +
        `Выберите, какой стороной договора вы являетесь:${limitInfo}`
      : `📄 *Анализ договора завершен*\n\n` +
        `*Определены стороны договора:*\n` +
        `1️⃣ ${analysis.party1.role}: *${analysis.party1.name}*\n` +
        `2️⃣ ${analysis.party2.role}: *${analysis.party2.name}*\n\n` +
        `Выберите, какой стороной договора вы являетесь:${limitInfo}`;

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
  console.log(`Получен callback запрос: ${query.data}`);
  
  // Сразу отвечаем на callback query, чтобы Telegram не считал запрос просроченным
  await bot.answerCallbackQuery(query.id, {
    text: "Начинаю анализ договора..."
  }).catch(err => console.error('Ошибка при ответе на callback:', err.message));
  
  const userId = query.from.id.toString();
  const chatId = query.message.chat.id;
  const data = query.data;
  const [action, user, party] = data.split(':');

  console.log(`Обработка выбора стороны: action=${action}, user=${user}, party=${party}`);

  if (action !== 'select_party' || user !== userId) {
    console.log('Несоответствие action или userId, выход из обработчика');
    return;
  }

  try {
    console.log('Проверка наличия tempStorage...');
    if (!global.tempStorage) {
      console.log('tempStorage не инициализирован, создаю новый объект');
      global.tempStorage = {};
    }

    console.log(`Проверка данных пользователя в tempStorage для userId=${userId}`);
    const userData = global.tempStorage[userId];
    if (!userData || !userData.analysis) {
      console.log('Данные анализа не найдены в tempStorage');
      await bot.answerCallbackQuery(query.id, { 
        text: 'Ошибка: данные анализа не найдены. Пожалуйста, отправьте документ повторно.',
        show_alert: true
      });
      return;
    }
    
    console.log('Данные анализа найдены, продолжаю обработку...');

    console.log('Получение данных анализа и выбранной стороны...');
    const analysis = userData.analysis;
    
    // Проверка наличия необходимых данных в анализе
    if (!analysis.party1 || !analysis.party2) {
      console.error('Ошибка: в анализе отсутствуют данные о сторонах договора');
      await bot.sendMessage(chatId, 'Ошибка: в анализе отсутствуют данные о сторонах договора. Пожалуйста, отправьте документ повторно.');
      delete global.tempStorage[userId];
      return;
    }
    
    const selectedParty = party === 'party1' ? analysis.party1 : analysis.party2;
    const otherParty = party === 'party1' ? analysis.party2 : analysis.party1;
    
    console.log(`Выбрана сторона: ${selectedParty.role} (${selectedParty.name})`);
    
    // Проверка наличия анализа для выбранной стороны
    if (!analysis.analysis || 
        (party === 'party1' && !analysis.analysis.party1Analysis) || 
        (party === 'party2' && !analysis.analysis.party2Analysis)) {
      console.error('Ошибка: в анализе отсутствуют данные анализа для выбранной стороны');
      await bot.sendMessage(chatId, 'Ошибка: в анализе отсутствуют данные анализа для выбранной стороны. Пожалуйста, отправьте документ повторно.');
      delete global.tempStorage[userId];
      return;
    }
    
    // Получаем анализ для выбранной стороны
    const partyAnalysis = party === 'party1' ? analysis.analysis.party1Analysis : analysis.analysis.party2Analysis;
    console.log('Анализ для выбранной стороны получен');

    try {
      console.log('Удаление сообщения с кнопками выбора...');
      // Удаляем сообщение с кнопками выбора
      await bot.deleteMessage(chatId, query.message.message_id).catch(err => {
        console.error('Ошибка при удалении сообщения:', err.message);
      });
    } catch (deleteError) {
      console.error('Ошибка при удалении сообщения:', deleteError);
      // Продолжаем выполнение, даже если не удалось удалить сообщение
    }

    // Если анализ был неполным из-за документа с изображениями
    if (analysis.incomplete) {
      console.log('Отправка сообщения о неполном анализе из-за проблем с OCR...');
      // Отправляем сообщение с рекомендациями
      const incompleteMessage = `⚠️ *Анализ документа с изображениями*\n\n` +
        `Документ содержит текст в виде изображений, что затрудняет его полноценный анализ.\n\n` +
        `*Рекомендации для более точного анализа:*\n` +
        `1. Отправьте документ в текстовом формате (DOC, DOCX, TXT)\n` +
        `2. Используйте онлайн-сервисы OCR для преобразования PDF в текст:\n` +
        `   - https://pdf.online/ru/pdf-ocr\n` +
        `   - https://www.onlineocr.net/ru/\n\n` +
        `Если у вас есть другая версия этого документа, отправьте её для более точного анализа.`;
        
      try {
        await bot.sendMessage(chatId, incompleteMessage, { 
          parse_mode: 'Markdown',
          disable_web_page_preview: true 
        });
        console.log('Сообщение о неполном анализе отправлено');
      } catch (sendError) {
        console.error('Ошибка при отправке сообщения о неполном анализе:', sendError);
      }
      
      // Очищаем временное хранилище
      console.log('Очистка временного хранилища для userId:', userId);
      delete global.tempStorage[userId];
      
      return;
    }

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

    // Отправляем второе сообщение с анализом
    await bot.sendMessage(chatId, analysisMessage, { parse_mode: 'Markdown' });

    // Отправляем третье сообщение с призывом к действию
    await bot.sendMessage(chatId, '⬆️ *Вы можете переслать сообщение выше контрагенту для обсуждения условий договора*', { parse_mode: 'Markdown' });

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

// Улучшенная функция проверки документа
async function isContractDocument(text) {
  if (!text || text.trim() === '') {
    return { 
      result: false, 
      reason: 'Документ не содержит текста'
    };
  }
  
  console.log('Начинаю проверку документа на признаки договора...');
  
  // Проверяем весь текст, а не только первые 5000 символов
  // Для очень больших документов ограничиваем до 50000 символов для производительности
  const lowerText = text.toLowerCase().substring(0, Math.min(text.length, 50000));
  
  // Расширенный список ключевых слов договора
  const contractKeywords = [
    // Основные термины договоров
    'договор', 'соглашение', 'контракт', 'договорились', 
    'предмет договора', 'обязанности сторон', 'условия договора',
    'настоящий договор', 'обязуется', 'заключили настоящий',
    'исполнитель', 'заказчик', 'ответственность сторон',
    
    // Дополнительные термины
    'стороны', 'именуемый', 'именуемая', 'в дальнейшем', 'в лице',
    'действующего на основании', 'с одной стороны', 'с другой стороны',
    'предмет соглашения', 'срок действия', 'расторжение договора',
    'порядок расчетов', 'права и обязанности', 'форс-мажор',
    'реквизиты сторон', 'подписи сторон', 'акт приема-передачи',
    
    // Юридические термины
    'арбитраж', 'претензия', 'неустойка', 'штраф', 'пеня',
    'конфиденциальность', 'расторжение', 'приложение к договору',
    'дополнительное соглашение', 'гарантийные обязательства'
  ];
  
  // Проверка на наличие структуры договора (разделы)
  const contractSections = [
    'предмет', 'стоимость', 'порядок', 'срок', 'ответственность',
    'права и обязанности', 'форс-мажор', 'реквизиты', 'приложение'
  ];
  
  // Подсчет ключевых слов
  const contractKeywordsCount = contractKeywords.filter(keyword => 
    lowerText.includes(keyword.toLowerCase())
  ).length;
  
  // Подсчет разделов договора
  const sectionMatches = contractSections.filter(section => {
    // Ищем разделы в формате "1. ПРЕДМЕТ ДОГОВОРА" или "Раздел 1. Предмет договора"
    const patterns = [
      new RegExp(`\\d+\\.\\s*${section}`, 'i'),  // "1. предмет"
      new RegExp(`раздел\\s+\\d+\\.\\s*${section}`, 'i'),  // "раздел 1. предмет"
      new RegExp(`${section}\\s+договора`, 'i')  // "предмет договора"
    ];
    
    return patterns.some(pattern => pattern.test(lowerText));
  }).length;
  
  console.log(`Найдено ${contractKeywordsCount} ключевых слов договора и ${sectionMatches} разделов`);
  
  // Проверка на наличие сторон договора
  const hasParties = /сторон[аы]|исполнитель|заказчик|подрядчик|поставщик|покупатель|продавец|арендатор|арендодатель/i.test(lowerText);
  
  // Проверка на наличие подписей
  const hasSignatures = /подпис[ьи]|м\.п\.|место печати|директор|генеральный директор/i.test(lowerText);
  
  // Проверка на наличие реквизитов
  const hasRequisites = /реквизиты|адрес|инн|кпп|огрн|р\/сч|р\/с|бик|к\/с/i.test(lowerText);
  
  // Комплексная проверка на договор
  // Документ считается договором, если:
  // 1. Содержит достаточно ключевых слов (>= 3)
  // 2. ИЛИ имеет структуру договора (>= 2 раздела)
  // 3. ИЛИ содержит упоминание сторон И (подписи ИЛИ реквизиты)
  
  if (contractKeywordsCount >= 3 || sectionMatches >= 2 || (hasParties && (hasSignatures || hasRequisites))) {
    console.log('Документ определен как договор на основе комплексного анализа');
    return { 
      result: true, 
      reason: `Документ содержит характерные признаки договора (найдено ${contractKeywordsCount} ключевых слов, ${sectionMatches} разделов)`
    };
  }
  
  // Проверка на счет
  if (lowerText.includes('счет на оплату') || lowerText.includes('счет-фактура') || 
      lowerText.includes('счет №') || lowerText.includes('счёт №') ||
      /счет\s+от\s+\d{1,2}[\.\/]\d{1,2}[\.\/]\d{2,4}/i.test(lowerText)) {
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

/**
 * Проверка структурированности текста
 * @param {string} text - Текст для проверки
 * @returns {boolean} - Содержит ли текст достаточно структурированной информации
 */
function checkTextStructure(text) {
  if (!text) {
    return false;
  }
  
  // Если текст очень короткий (менее 200 символов), возможно это OCR проблема
  if (text.length < 200) {
    console.log(`Текст слишком короткий (${text.length} символов), возможно это OCR проблема`);
    return false;
  }
  
  // Проверяем наличие ключевых слов и структур договора
  const keywords = [
    'договор', 'соглашение', 'контракт', 'стороны', 'предмет', 'исполнитель', 'заказчик',
    'обязуется', 'обязанности', 'права', 'ответственность', 'порядок', 'условия', 'оплата'
  ];
  
  let keywordsFound = 0;
  keywords.forEach(keyword => {
    // Проверяем вхождение слова с учетом границ слов
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(text)) {
      keywordsFound++;
    }
  });
  
  console.log(`Найдено ключевых слов: ${keywordsFound} из ${keywords.length}`);
  
  // Если найдено хотя бы 2 ключевых слова, скорее всего это текстовый документ
  if (keywordsFound >= 2) {
    return true;
  }
  
  // Проверяем наличие структуры пунктов (1.1., 2.3. и т.д.)
  const hasParagraphStructure = /\d+\.\d+\./.test(text);
  
  // Проверяем общий паттерн предложений (должно быть несколько полных предложений)
  const sentences = text.split(/[.!?][\s\n]+/).filter(s => s.trim().length > 10);
  const hasEnoughSentences = sentences.length >= 3;
  
  console.log(`Структура пунктов: ${hasParagraphStructure}, Достаточно предложений: ${hasEnoughSentences}`);
  
  // Проверка на наличие двух или более сторон договора
  // (обычно две организации, ИП или физических лица)
  const orgMatches = text.match(/ООО|ПАО|АО|ИП|«[^»]+»|"[^"]+"|\bИНН\b|\bОГРН\b/gi) || [];
  const hasOrganizations = orgMatches.length >= 1;
  
  console.log(`Найдено организаций/ИП: ${orgMatches.length}`);
  
  // Если есть хотя бы 1 ключевое слово и хотя бы один из признаков структурированности, 
  // считаем что это текстовый документ
  return (keywordsFound >= 1 && (hasParagraphStructure || hasEnoughSentences || hasOrganizations)) ||
         // Если много предложений, то скорее всего это текстовый документ
         hasEnoughSentences;
}

// Обработчик сообщений для принудительной обработки документа как текст
async function handleTextMessage(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const text = msg.text || '';
  
  if (!text || !text.toLowerCase().includes('обработать как текст')) {
    return false; // Не обрабатываем это сообщение
  }
  
  // Проверяем, есть ли пользователь в ожидании принудительной обработки
  if (!pendingForceProcessing[userId]) {
    return false;
  }
  
  // Получаем данные о файле для принудительной обработки
  const { fileId, processingMsgId, documentText } = pendingForceProcessing[userId];
  
  if (!fileId || !processingMsgId || !documentText) {
    await bot.sendMessage(chatId, 'Не найдены данные о документе для принудительной обработки. Пожалуйста, отправьте документ снова.');
    delete pendingForceProcessing[userId];
    return true;
  }
  
  // Отправляем сообщение о начале принудительной обработки
  await bot.editMessageText(
    'Выполняется принудительная обработка документа как текстовый. Это может занять до 2 минут...',
    {
      chat_id: chatId,
      message_id: processingMsgId
    }
  );
  
  try {
    // Создаем опцию для принудительной обработки
    const options = { forceContract: true };
    
    // Проверяем лимиты запросов
    const limitCheck = canUserMakeRequest(userId);
    if (!limitCheck.allowed) {
      let message = '';
      
      if (limitCheck.reason === 'limit_reached') {
        const plansInfo = getAllPlans();
        const basicPlan = plansInfo.find(plan => plan.id === 'BASIC');
        
        message = `
⚠️ *Достигнут лимит бесплатных запросов*

Вы использовали все доступные запросы на бесплатном тарифе (${PLANS.FREE.requestLimit} запросов).

Чтобы продолжить использование бота, выберите один из платных тарифов:

*Базовый* - ${basicPlan.price} руб/мес
• До ${basicPlan.requestLimit} запросов в месяц
• ${basicPlan.description}

Для перехода на платный тариф используйте команду /upgrade
`;
      } else if (limitCheck.reason === 'subscription_inactive') {
        message = '⚠️ *Требуется оплата*\n\nВаш тариф еще не оплачен. Используйте команду /payment для оплаты или /downgrade для возврата к бесплатному тарифу.';
      }
      
      await bot.editMessageText(
        message,
        {
          chat_id: chatId,
          message_id: processingMsgId,
          parse_mode: 'Markdown'
        }
      );
      
      delete pendingForceProcessing[userId];
      return true;
    }
    
    // Анализируем документ напрямую с использованием извлеченного текста
    await bot.editMessageText(
      `Анализирую текст документа...\nЭто может занять до 2 минут.`, 
      {
        chat_id: chatId,
        message_id: processingMsgId
      }
    );
    
    // Анализируем документ
    const analysis = await analyzeDocumentWithSelectedModel(documentText);
    
    // Регистрируем использование запроса
    registerRequestUsage(userId);
    
    // Получаем обновленные данные о лимитах
    const updatedLimits = canUserMakeRequest(userId);
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
    const message = createIncompleteAnalysisTemplate(documentText, "Анализ текстового содержимого документа") +
      `*Определены стороны договора:*\n` +
      `1️⃣ ${analysis.party1.role}: *${analysis.party1.name}*\n` +
      `2️⃣ ${analysis.party2.role}: *${analysis.party2.name}*\n\n` +
      `Выберите, какой стороной договора вы являетесь:${limitInfo}`;

    // Отправляем результат
    await bot.editMessageText(message, {
      chat_id: chatId,
      message_id: processingMsgId,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
    console.log('Ответ отправлен пользователю. Принудительная обработка текста завершена успешно.');
    
  } catch (error) {
    console.error('Ошибка при принудительной обработке документа:', error);
    
    // Формируем понятное сообщение об ошибке для пользователя
    let errorMessage = 'Произошла ошибка при анализе текста документа.';
    
    if (error.message.includes('context_length_exceeded') || 
        error.message.includes('maximum context length')) {
      errorMessage = 'Документ слишком большой для анализа. Пожалуйста, отправьте сокращенную версию документа или только наиболее важные разделы договора.';
    } else if (error.message.includes('Не удалось определить стороны договора')) {
      errorMessage = 'Не удалось определить стороны договора. Пожалуйста, убедитесь, что документ является договором и содержит информацию о сторонах.';
    } else if (error.message.includes('Не удалось разобрать ответ')) {
      errorMessage = 'Произошла ошибка при анализе документа. Пожалуйста, попробуйте еще раз или отправьте документ меньшего размера.';
    }
    
    await bot.editMessageText(
      `❌ ${errorMessage}`,
      {
        chat_id: chatId,
        message_id: processingMsgId
      }
    );
  }
  
  // Очищаем запись о принудительной обработке
  delete pendingForceProcessing[userId];
  return true;
}

// Создает шаблон сообщения для неполного анализа документа
function createIncompleteAnalysisTemplate(documentText, analysisTitle, isImageDetected = false) {
  let template = `📄 *${analysisTitle}*\n\n`;
  
  // Если обнаружены изображения, добавляем предупреждение
  if (isImageDetected) {
    template += `⚠️ *В документе обнаружены изображения*\n`;
    template += `Анализ может быть неполным, так как часть текста не удалось извлечь из изображений.\n\n`;
    template += `🔍 *Хотите обработать документ как текст?*\n`;
    template += `Отправьте боту сообщение: \`Обработать как текст\`\n\n`;
  }
  
  // Получаем первые 200 символов текста для предпросмотра
  const previewText = documentText.substring(0, 200).trim();
  template += `*Фрагмент текста:*\n${previewText}${documentText.length > 200 ? '...' : ''}\n\n`;
  
  return template;
}

/**
 * Обработчик фотографий для извлечения текста и анализа документов
 * @param {Object} bot - Экземпляр бота
 * @param {Object} msg - Сообщение от пользователя с фотографией
 * @param {Object} options - Дополнительные опции
 * @param {boolean} options.forceContract - Принудительно обработать как договор
 */
async function handlePhoto(bot, msg, options = {}) {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  // Получаем массив фотографий (разные размеры)
  const photos = msg.photo;
  // Берем фото с наилучшим качеством (последнее в массиве)
  const fileId = photos[photos.length - 1].file_id;
  
  // Определяем имя файла на основе даты и времени
  const fileName = `photo_${Date.now()}.jpg`;
  const forceContract = options.forceContract || false;
  
  // Проверяем, если фото отправлено с подписью, содержащей ключевое слово "договор" или "контракт"
  const hasForceKeyword = msg.caption && 
    (/договор|контракт|соглашение|анализ/i).test(msg.caption.toLowerCase());
  
  // Если в подписи есть указание на договор, устанавливаем флаг принудительной обработки
  const shouldForceContract = forceContract || hasForceKeyword;
  
  // Проверяем возможность проверки документа (доступность лимитов)
  const verificationCheck = canUserMakeRequest(userId);
  
  if (!verificationCheck.allowed) {
    if (verificationCheck.reason === 'subscription_inactive') {
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
  
  try {
    console.log(`Начало обработки фотографии: ${fileName}`);
    
    // Отправляем сообщение о начале обработки
    const processingMsg = await bot.sendMessage(
      chatId, 
      `Обрабатываю фотографию, это может занять некоторое время...`
    );
    
    // Загружаем фото
    const filePath = await downloadTelegramPhoto(fileId, bot, fileName);
    
    console.log(`Фото загружено: ${filePath}`);
    
    // Обновляем сообщение
    await bot.editMessageText(
      `Извлекаю текст из фотографии с помощью OCR...`, 
      {
        chat_id: chatId,
        message_id: processingMsg.message_id
      }
    );
    
    // Извлекаем текст из фотографии с помощью OCR
    console.log('Начинаю извлечение текста из фотографии...');
    
    let documentText;
    try {
      // Используем тот же метод extractTextFromDocument, который будет использовать OCR для изображений
      documentText = await extractTextFromDocument(filePath);
      console.log(`Текст успешно извлечен, размер: ${documentText ? documentText.length : 0} символов`);
      
      // Проверяем, что текст был успешно извлечен
      if (!documentText || documentText.trim() === '') {
        throw new Error('Текст на фотографии не обнаружен');
      }
      
      // Проверяем, содержит ли текст сообщение об ошибке из модуля извлечения
      if (documentText.startsWith('Не удалось извлечь текст')) {
        throw new Error(documentText);
      }
    } catch (extractError) {
      console.error('Ошибка при извлечении текста из фотографии:', extractError);
      
      let errorMessage = 'Произошла ошибка при извлечении текста из фотографии.';
      
      if (extractError.message.includes('не обнаружен')) {
        errorMessage = 'Не удалось распознать текст на фотографии. Пожалуйста, убедитесь, что текст четко виден и повторите попытку с лучшим качеством фото.';
      }
      
      await bot.editMessageText(
        `❌ ${errorMessage}`, 
        {
          chat_id: chatId,
          message_id: processingMsg.message_id
        }
      );
      
      console.log(`Отправлено сообщение об ошибке извлечения текста: ${errorMessage}`);
      return;
    }
    
    // Получаем настройки пользователя
    const userSettings = getUserSettings(userId);
    
    // Предварительная проверка, является ли документ договором, если не задан forceContract
    if (!shouldForceContract) {
      await bot.editMessageText(
        `Проверяю, является ли текст на фотографии договором...`, 
        {
          chat_id: chatId,
          message_id: processingMsg.message_id
        }
      );
      
      // Проверка на договор
      const isContract = await isContractDocument(documentText);
      
      if (!isContract.result) {
        // Если в подписи нет указания на договор и текст не похож на договор
        await bot.editMessageText(
          `📝 Текст на фотографии не похож на договор или юридический документ.\n\nЕсли вы уверены, что это договор, отправьте фотографию с подписью "договор" для принудительного анализа.`, 
          {
            chat_id: chatId,
            message_id: processingMsg.message_id
          }
        );
        return;
      }
    }
    
    // Регистрируем использование запроса
    registerRequestUsage(userId);
    
    // Обновляем сообщение
    await bot.editMessageText(
      `Анализирую документ на фотографии...`, 
      {
        chat_id: chatId,
        message_id: processingMsg.message_id
      }
    );
    
    // Анализируем документ
    try {
      // Используем тот же метод для анализа, что и для обычных документов
      const analysisResult = await analyzeDocumentWithSelectedModel(documentText);
      
      if (!analysisResult || !analysisResult.analysis) {
        throw new Error('Не удалось выполнить анализ документа');
      }
      
      // Отправляем результат анализа
      await bot.editMessageText(
        analysisResult.analysis, 
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: "Я - физлицо", callback_data: `party_individual:${chatId}` },
                { text: "Я - юрлицо", callback_data: `party_legal:${chatId}` }
              ]
            ]
          }
        }
      );
      
      // Сохраняем анализ в tempStorage для последующего использования
      global.tempStorage.documentAnalysis[chatId] = {
        text: documentText,
        analysis: analysisResult.analysis,
        timestamp: Date.now()
      };
      
      console.log(`Анализ документа на фотографии успешно отправлен пользователю ${userId}`);
    } catch (analysisError) {
      console.error('Ошибка при анализе документа на фотографии:', analysisError);
      
      await bot.editMessageText(
        `❌ Произошла ошибка при анализе документа: ${analysisError.message}`, 
        {
          chat_id: chatId,
          message_id: processingMsg.message_id
        }
      );
    }
  } catch (error) {
    console.error('Ошибка при обработке фотографии:', error);
    
    bot.sendMessage(
      chatId,
      `❌ Произошла ошибка при обработке фотографии: ${error.message}`
    );
  }
}

module.exports = {
  handleDocument,
  handlePartySelection,
  handlePhoto,
  isContractDocument,
  handleTextMessage
}; 