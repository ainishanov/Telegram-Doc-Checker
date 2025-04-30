const fs = require('fs');
const path = require('path');
const https = require('https');
const { promisify } = require('util');
const stream = require('stream');
const pipeline = promisify(stream.pipeline);
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const docxParser = require('docx-parser');
const rtfParser = require('rtf-parser');
const cheerio = require('cheerio');
const { createWorker } = require('tesseract.js');
const { PdfReader } = require('pdfreader');
const child_process = require('child_process');
const util = require('util');
const exec = util.promisify(child_process.exec);

// Добавляем импорт pdf-to-png-converter для лучшей конвертации PDF в изображения
let pdfToPng;
try {
  pdfToPng = require('pdf-to-png-converter').pdfToPng;
  console.log('pdf-to-png-converter успешно загружен');
} catch (error) {
  console.log('pdf-to-png-converter не установлен, будут использованы базовые методы OCR');
}

/**
 * Загрузка файла из Telegram
 * @param {string} fileId - ID файла в Telegram
 * @param {Object} bot - Экземпляр Telegram бота
 * @returns {Promise<string>} - Путь к загруженному файлу
 */
async function downloadTelegramFile(fileId, bot) {
  try {
    console.log(`Начало загрузки файла с ID: ${fileId}`);
    
    // Получаем информацию о файле
    const fileInfo = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${bot.token}/${fileInfo.file_path}`;
    
    console.log(`URL файла: ${fileUrl}`);
    console.log(`Размер файла: ${fileInfo.file_size} байт`);
    
    // Проверяем размер файла - не более 30 МБ (безопасный лимит для обработки)
    const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30 МБ
    if (fileInfo.file_size > MAX_FILE_SIZE) {
      throw new Error(`Файл слишком большой: ${Math.round(fileInfo.file_size / 1024 / 1024)} МБ. Максимальный размер: 30 МБ.`);
    }
    
    // Создаем директорию для временных файлов, если она не существует
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Создаем путь для сохранения файла
    const filePath = path.join(tempDir, path.basename(fileInfo.file_path));
    
    // Загружаем файл
    const fileStream = fs.createWriteStream(filePath);
    
    await new Promise((resolve, reject) => {
      const request = https.get(fileUrl, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Не удалось загрузить файл: ${response.statusCode}`));
          return;
        }
        
        pipeline(response, fileStream)
          .then(() => resolve())
          .catch(err => reject(err));
      });
      
      request.on('error', (err) => {
        reject(err);
      });
      
      // Устанавливаем таймаут на загрузку файла
      request.setTimeout(60000, () => {
        request.abort();
        reject(new Error('Таймаут загрузки файла (60 секунд)'));
      });
    });
    
    console.log(`Файл успешно загружен: ${filePath}`);
    return filePath;
  } catch (error) {
    console.error('Ошибка при загрузке файла:', error);
    throw error;
  }
}

/**
 * Извлечение текста из PDF документа с ограничением размера
 * @param {string} filePath - Путь к PDF файлу
 * @returns {Promise<string>} - Извлеченный текст
 */
async function extractTextFromPdf(filePath) {
  try {
    console.log(`Извлечение текста из PDF: ${filePath}`);
    
    // Проверяем существование файла
    if (!fs.existsSync(filePath)) {
      console.error(`Ошибка: PDF файл не найден: ${filePath}`);
      return null;
    }
    
    const dataBuffer = fs.readFileSync(filePath);
    console.log(`Размер файла PDF: ${dataBuffer.length} байт`);
    
    // Ограничиваем размер обрабатываемого файла
    const MAX_SIZE = 20 * 1024 * 1024; // 20 МБ
    if (dataBuffer.length > MAX_SIZE) {
      console.log(`PDF слишком большой: ${dataBuffer.length} байт. Будет обработано только ${MAX_SIZE} байт.`);
      // Для PDF формата нельзя просто обрезать Buffer, поэтому добавим предупреждение
      try {
        const data = await pdfParse(dataBuffer, { max: 100 }); // Ограничиваем до 100 страниц
        console.log(`Успешно извлечен текст из большого PDF (${data.numpages} страниц)`);
        return data.text + "\n\n[ВНИМАНИЕ: Документ слишком большой, показаны только первые 100 страниц]";
      } catch (pdfError) {
        console.error('Ошибка при извлечении текста из большого PDF:', pdfError);
        throw new Error(`Ошибка обработки большого PDF файла: ${pdfError.message}`);
      }
    }
    
    // Используем опции для ограничения обработки
    const options = {
      max: 100, // Максимальное количество страниц
      timeout: 120000 // 2 минуты таймаут
    };
    
    const data = await pdfParse(dataBuffer, options);
    console.log(`Текст из PDF извлечен, размер: ${data.text.length} символов, количество страниц: ${data.numpages}`);
    
    // Если текст не удалось извлечь или его очень мало, пробуем улучшенный OCR
    if (!data.text || data.text.trim() === '' || (data.text.length < 100 && data.numpages > 0)) {
      console.log('Извлеченный текст пуст или слишком короткий, пробуем улучшенное OCR распознавание...');
      
      // Проверяем, что PDF имеет хотя бы одну страницу
      if (data.numpages > 0) {
        return await extractTextFromPdfUsingImprovedOcr(filePath, data.numpages);
      } else {
        console.error('PDF не содержит страниц для OCR');
        return 'Не удалось извлечь текст из PDF. Документ может быть пустым или содержать только изображения.';
      }
    }
    
    return data.text;
  } catch (error) {
    console.error('Ошибка при извлечении текста из PDF:', error);
    console.error('Стек ошибки:', error.stack);
    
    // Пробуем улучшенный OCR как запасной вариант
    try {
      console.log('Пробуем использовать улучшенный OCR для извлечения текста...');
      return await extractTextFromPdfUsingImprovedOcr(filePath);
    } catch (ocrError) {
      console.error('Ошибка при попытке OCR:', ocrError);
      throw new Error(`Не удалось извлечь текст из PDF документа: ${error.message}`);
    }
  }
}

/**
 * Улучшенная функция извлечения текста из PDF с использованием OCR
 * @param {string} filePath - Путь к PDF файлу
 * @param {number} pageCount - Количество страниц (если известно)
 * @returns {Promise<string>} - Извлеченный текст
 */
async function extractTextFromPdfUsingImprovedOcr(filePath, pageCount = 10) {
  console.log(`Начало улучшенной OCR обработки PDF: ${filePath}`);
  
  try {
    // Сначала попробуем получить текст обычными методами
    let textFromPdfReader = await extractTextWithPdfReader(filePath);
    
    // Если удалось получить достаточно текста через pdfreader, используем его
    if (textFromPdfReader && textFromPdfReader.length > 500) {
      console.log(`Успешно извлечен текст с помощью pdfreader, длина: ${textFromPdfReader.length}`);
      return textFromPdfReader;
    }
    
    // Если не получилось и pdf-to-png-converter доступен, используем его для конвертации PDF в изображения
    if (pdfToPng) {
      console.log('Используем pdf-to-png-converter для преобразования PDF в изображения');
      
      // Создаем временную директорию для изображений
      const tempDir = path.join(path.dirname(filePath), 'temp_ocr_images');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Конвертируем PDF страницы в изображения
      const maxPages = Math.min(pageCount || 10, 10);
      console.log(`Конвертируем ${maxPages} страниц PDF в изображения`);
      
      // Подготовим массив номеров страниц для обработки (в библиотеке нумерация начинается с 1)
      const pagesToProcess = Array.from({ length: maxPages }, (_, i) => i + 1);
      
      // Конвертируем PDF в изображения 
      const pngPages = await pdfToPng(filePath, {
        viewportScale: 2.0, // Увеличенный масштаб для лучшего распознавания
        outputFolder: tempDir, // Куда сохранять изображения
        outputFileMask: 'page_${pageNumber}', // Шаблон для имени файла
        pagesToProcess: pagesToProcess, // Какие страницы обрабатывать
        verbosityLevel: 0 // Уровень логгирования
      });
      
      // Инициализируем Tesseract для OCR
      const worker = await createWorker('rus+eng');
      console.log('Tesseract worker инициализирован');
      
      let fullText = '';
      
      // Обрабатываем каждое изображение с помощью OCR
      for (const page of pngPages) {
        try {
          console.log(`Обработка OCR для страницы ${page.pageNumber}, путь: ${page.path}`);
          // Распознаем текст на изображении
          const { data: { text } } = await worker.recognize(page.path);
          fullText += `\n--- Страница ${page.pageNumber} ---\n\n` + text + '\n\n';
          
          // Удаляем временное изображение, если оно создано на диске
          if (page.path && fs.existsSync(page.path)) {
            fs.unlinkSync(page.path);
          }
        } catch (pageError) {
          console.error(`Ошибка при OCR обработке страницы ${page.pageNumber}:`, pageError);
        }
      }
      
      // Освобождаем ресурсы Tesseract
      await worker.terminate();
      
      // Удаляем временную директорию, если она пуста
      try {
        const files = fs.readdirSync(tempDir);
        if (files.length === 0) {
          fs.rmdirSync(tempDir);
        }
      } catch (rmError) {
        console.error('Ошибка при удалении временной директории:', rmError);
      }
      
      if (fullText.length > 0) {
        console.log(`Успешно извлечен текст с помощью OCR, длина: ${fullText.length}`);
        return fullText;
      }
    }
    
    // Если pdf-to-png-converter недоступен, используем стандартный метод OCR
    console.log('Используем стандартный метод OCR');
    const worker = await createWorker('rus+eng');
    console.log('Tesseract worker инициализирован');
    
    // Возвращаем информативное сообщение, но продолжаем анализировать документ с тем текстом, который удалось получить
    console.log('Возвращаем частичный текст и инструкции для пользователя');
    
    let baseText = textFromPdfReader || '';
    if (baseText.length < 100) {
      baseText = 'Текст не удалось полностью извлечь из документа, обрабатываем на основе частично извлеченной информации.';
    }
    
    // Освобождаем ресурсы
    await worker.terminate();
    
    // Возвращаем извлеченный текст с уведомлением
    return baseText + `\n\n[ВНИМАНИЕ: Документ содержит текст в виде изображений. Анализ может быть неполным.]`;
  } catch (error) {
    console.error('Ошибка при улучшенной OCR обработке:', error);
    return `Документ содержит текст в виде изображений, выполняется анализ на основе частично извлеченного текста.`;
  }
}

/**
 * Извлечение текста из PDF с помощью pdfreader
 * @param {string} filePath - Путь к PDF файлу
 * @returns {Promise<string>} - Извлеченный текст
 */
async function extractTextWithPdfReader(filePath) {
  return new Promise((resolve, reject) => {
    const reader = new PdfReader();
    let text = '';
    let lastItem = null;
    
    reader.parseFileItems(filePath, (err, item) => {
      if (err) {
        console.error('Ошибка при чтении PDF с помощью pdfreader:', err);
        resolve(''); // Не отклоняем промис при ошибке, чтобы продолжить обработку
        return;
      }
      
      if (!item) {
        // Конец файла
        console.log(`pdfreader: Извлечение завершено, получено ${text.length} символов`);
        resolve(text);
        return;
      }
      
      if (item.text) {
        // Если это текстовый элемент
        if (lastItem && lastItem.y !== item.y) {
          text += '\n'; // Новая строка при изменении координаты y
        }
        text += item.text + ' ';
        lastItem = item;
      }
    });
  });
}

/**
 * Извлечение текста из DOCX документа
 * @param {string} filePath - Путь к DOCX файлу
 * @returns {Promise<string>} - Извлеченный текст
 */
async function extractTextFromDocx(filePath) {
  try {
    console.log(`Извлечение текста из DOCX: ${filePath}`);
    
    const result = await mammoth.extractRawText({ path: filePath });
    console.log(`Текст из DOCX извлечен, размер: ${result.value.length} символов`);
    
    return result.value;
  } catch (error) {
    console.error('Ошибка при извлечении текста из DOCX:', error);
    return null;
  }
}

/**
 * Извлечение текста из DOC документа
 * @param {string} filePath - Путь к DOC файлу
 * @returns {Promise<string>} - Извлеченный текст
 */
async function extractTextFromDoc(filePath) {
  return new Promise((resolve, reject) => {
    try {
      console.log(`Извлечение текста из DOC: ${filePath}`);
      
      // Установка таймаута для извлечения текста
      const timeout = setTimeout(() => {
        console.error('Таймаут извлечения текста из DOC');
        resolve("Не удалось извлечь текст из документа: превышен лимит времени обработки. Пожалуйста, попробуйте конвертировать DOC в DOCX или TXT и отправить снова.");
      }, 60000); // 60 секунд
      
      docxParser.parseDocx(filePath, function(data) {
        clearTimeout(timeout);
        console.log(`Текст из DOC извлечен, размер: ${data ? data.length : 0} символов`);
        resolve(data);
      });
    } catch (error) {
      console.error('Ошибка при извлечении текста из DOC:', error);
      resolve(null);
    }
  });
}

/**
 * Извлечение текста из RTF документа
 * @param {string} filePath - Путь к RTF файлу
 * @returns {Promise<string>} - Извлеченный текст
 */
async function extractTextFromRtf(filePath) {
  return new Promise((resolve, reject) => {
    console.log(`Извлечение текста из RTF: ${filePath}`);
    
    // Устанавливаем таймаут для обработки
    const timeout = setTimeout(() => {
      console.error('Таймаут извлечения текста из RTF');
      resolve("Не удалось извлечь текст из RTF: превышен лимит времени обработки. Пожалуйста, попробуйте конвертировать в TXT и отправить снова.");
    }, 60000); // 60 секунд
    
    try {
      const rtfBuffer = fs.readFileSync(filePath);
      
      // Проверка размера файла
      if (rtfBuffer.length > 10 * 1024 * 1024) { // 10 МБ
        console.log(`RTF слишком большой: ${rtfBuffer.length} байт`);
        clearTimeout(timeout);
        resolve("Документ RTF слишком большой для обработки. Пожалуйста, конвертируйте в TXT или разделите на части.");
        return;
      }
      
      rtfParser.string(rtfBuffer.toString(), (err, doc) => {
        clearTimeout(timeout);
        
        if (err) {
          console.error('Ошибка при извлечении текста из RTF:', err);
          resolve(null);
          return;
        }
        
        let text = '';
        
        // Рекурсивно извлекаем текст из секций документа
        function extractTextFromSections(sections) {
          if (!sections || !Array.isArray(sections)) return;
          
          for (const section of sections) {
            if (section.value) {
              text += section.value + ' ';
            }
            
            if (section.sections) {
              extractTextFromSections(section.sections);
            }
          }
        }
        
        extractTextFromSections(doc.sections);
        console.log(`Текст из RTF извлечен, размер: ${text.length} символов`);
        resolve(text.trim());
      });
    } catch (error) {
      clearTimeout(timeout);
      console.error('Ошибка при чтении RTF файла:', error);
      resolve(null);
    }
  });
}

/**
 * Извлечение текста из HTML документа
 * @param {string} filePath - Путь к HTML файлу
 * @returns {Promise<string>} - Извлеченный текст
 */
async function extractTextFromHtml(filePath) {
  try {
    console.log(`Извлечение текста из HTML: ${filePath}`);
    
    // Читаем HTML файл
    const htmlContent = fs.readFileSync(filePath, 'utf8');
    
    // Используем cheerio для извлечения текста
    const $ = cheerio.load(htmlContent);
    
    // Удаляем скрипты, стили и комментарии
    $('script').remove();
    $('style').remove();
    $('head').remove();
    $('noscript').remove();
    
    // Получаем текст из body
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    
    console.log(`Текст из HTML извлечен, размер: ${text.length} символов`);
    return text;
  } catch (error) {
    console.error('Ошибка при извлечении текста из HTML:', error);
    return null;
  }
}

/**
 * Извлечение текста из документа
 * @param {string} filePath - Путь к файлу
 * @returns {Promise<string>} - Текст из документа
 */
async function extractTextFromDocument(filePath) {
  try {
    const fileExt = path.extname(filePath).toLowerCase();
    const fileSize = fs.statSync(filePath).size;
    console.log(`Начало извлечения текста из файла: ${filePath} (${fileExt}, ${Math.round(fileSize / 1024)} КБ)`);
    
    let text = null;
    
    switch (fileExt) {
      case '.pdf':
        text = await extractTextFromPdf(filePath);
        break;
      case '.docx':
        text = await extractTextFromDocx(filePath);
        break;
      case '.doc':
        text = await extractTextFromDoc(filePath);
        break;
      case '.rtf':
        text = await extractTextFromRtf(filePath);
        break;
      case '.html':
      case '.htm':
        text = await extractTextFromHtml(filePath);
        break;
      case '.txt':
        console.log(`Чтение текстового файла: ${filePath}`);
        text = fs.readFileSync(filePath, 'utf8');
        console.log(`Текст из TXT прочитан, размер: ${text.length} символов`);
        break;
      default:
        // Для других форматов пробуем прочитать как текст
        try {
          console.log(`Попытка прочитать файл неизвестного формата: ${filePath}`);
          text = fs.readFileSync(filePath, 'utf8');
          console.log(`Текст из файла неизвестного формата прочитан, размер: ${text.length} символов`);
        } catch (error) {
          console.error(`Не удалось прочитать файл формата ${fileExt} как текст:`, error);
          text = null;
        }
        break;
    }
    
    // Ограничение размера текста
    const MAX_TEXT_SIZE = 500000; // Примерно 500 КБ текста
    if (text && text.length > MAX_TEXT_SIZE) {
      console.log(`Текст слишком большой: ${text.length} символов. Сокращаем до ${MAX_TEXT_SIZE} символов.`);
      text = text.substring(0, MAX_TEXT_SIZE) + "\n\n[ВНИМАНИЕ: Документ слишком большой, показана только часть текста]";
    }
    
    return text;
  } catch (error) {
    console.error('Ошибка при извлечении текста из документа:', error);
    return null;
  } finally {
    // Удаляем временный файл
    try {
      fs.unlinkSync(filePath);
      console.log(`Временный файл удален: ${filePath}`);
    } catch (error) {
      console.error('Ошибка при удалении временного файла:', error);
    }
  }
}

module.exports = {
  downloadTelegramFile,
  extractTextFromDocument
}; 