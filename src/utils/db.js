const fs = require('fs');
const path = require('path');
const config = require('../config/config');

// Путь к файлу с данными платежей
const PAYMENTS_DATA_FILE = path.join(__dirname, '../../data/payments.json');

// Обеспечиваем существование директории data
try {
  if (!fs.existsSync(path.join(__dirname, '../../data'))) {
    fs.mkdirSync(path.join(__dirname, '../../data'), { recursive: true });
    console.log('[INFO] Создана директория для данных');
  }

  // Инициализируем файл с данными платежей, если он не существует
  if (!fs.existsSync(PAYMENTS_DATA_FILE)) {
    fs.writeFileSync(PAYMENTS_DATA_FILE, JSON.stringify({}), 'utf8');
    console.log('[INFO] Создан файл для данных платежей');
  }
  
  // Проверяем права на запись
  fs.accessSync(PAYMENTS_DATA_FILE, fs.constants.W_OK);
  console.log('[INFO] Проверка прав доступа к файлу платежей прошла успешно');
} catch (error) {
  console.error('[ERROR] Проблема с доступом к файловой системе:', error.message);
  console.warn('[WARN] Будет использоваться временное хранилище в памяти');
}

// Резервное хранилище в памяти на случай проблем с файлами
const memoryStorage = {
  payments: {}
};

/**
 * Сохраняет информацию о платеже
 * @param {Object} paymentData - Данные платежа
 * @returns {Object} - Сохраненные данные платежа
 */
async function savePayment(paymentData) {
  try {
    if (!paymentData || !paymentData.paymentId) {
      console.error('[ERROR] Невозможно сохранить платеж без ID платежа');
      return null;
    }
    
    const paymentId = paymentData.paymentId;
    console.log(`[DEBUG] Сохранение данных платежа ${paymentId}`);
    
    // Добавляем временную метку, если её нет
    if (!paymentData.createdAt) {
      paymentData.createdAt = new Date().toISOString();
    }
    
    // Сохраняем в память в любом случае
    memoryStorage.payments[paymentId] = paymentData;
    
    // Пытаемся сохранить в файл
    try {
      // Читаем данные всех платежей
      const paymentsData = JSON.parse(fs.readFileSync(PAYMENTS_DATA_FILE, 'utf8'));
      
      // Обновляем данные конкретного платежа
      paymentsData[paymentId] = paymentData;
      
      // Сохраняем обновленные данные в файл
      fs.writeFileSync(PAYMENTS_DATA_FILE, JSON.stringify(paymentsData, null, 2), 'utf8');
      
      console.log(`[DEBUG] Данные платежа ${paymentId} успешно сохранены в файл`);
    } catch (fileError) {
      console.error(`[ERROR] Не удалось сохранить данные платежа в файл:`, fileError.message);
      console.log(`[INFO] Данные платежа ${paymentId} сохранены только в памяти`);
    }
    
    return paymentData;
  } catch (error) {
    console.error(`[ERROR] Критическая ошибка при сохранении данных платежа:`, error);
    return null;
  }
}

/**
 * Получает информацию о платеже по ID
 * @param {string} paymentId - ID платежа
 * @returns {Object|null} - Данные платежа или null, если платеж не найден
 */
async function getPayment(paymentId) {
  try {
    // Сначала проверяем в памяти
    if (memoryStorage.payments[paymentId]) {
      return memoryStorage.payments[paymentId];
    }
    
    // Пытаемся прочитать из файла
    try {
      const paymentsData = JSON.parse(fs.readFileSync(PAYMENTS_DATA_FILE, 'utf8'));
      
      if (paymentsData[paymentId]) {
        // Сохраняем в память для быстрого доступа в будущем
        memoryStorage.payments[paymentId] = paymentsData[paymentId];
        return paymentsData[paymentId];
      }
    } catch (fileError) {
      console.error(`[ERROR] Не удалось прочитать данные платежа из файла:`, fileError.message);
    }
    
    // Если платеж не найден
    return null;
  } catch (error) {
    console.error(`[ERROR] Критическая ошибка при получении данных платежа:`, error);
    return null;
  }
}

/**
 * Получает все платежи пользователя
 * @param {string} userId - ID пользователя
 * @returns {Array} - Массив платежей пользователя
 */
async function getUserPayments(userId) {
  try {
    if (!userId) {
      return [];
    }
    
    // Пытаемся прочитать из файла
    try {
      const paymentsData = JSON.parse(fs.readFileSync(PAYMENTS_DATA_FILE, 'utf8'));
      
      // Фильтруем платежи по userId
      const userPayments = Object.values(paymentsData).filter(
        payment => payment.userId === userId || 
                   (payment.metadata && payment.metadata.userId === userId)
      );
      
      return userPayments;
    } catch (fileError) {
      console.error(`[ERROR] Не удалось прочитать данные платежей из файла:`, fileError.message);
      
      // Если файл недоступен, фильтруем по данным в памяти
      const userPayments = Object.values(memoryStorage.payments).filter(
        payment => payment.userId === userId || 
                  (payment.metadata && payment.metadata.userId === userId)
      );
      
      return userPayments;
    }
  } catch (error) {
    console.error(`[ERROR] Критическая ошибка при получении платежей пользователя:`, error);
    return [];
  }
}

/**
 * Обновляет статус платежа
 * @param {string} paymentId - ID платежа
 * @param {string} status - Новый статус платежа
 * @returns {Object|null} - Обновленные данные платежа или null при ошибке
 */
async function updatePaymentStatus(paymentId, status) {
  try {
    // Получаем текущие данные платежа
    const payment = await getPayment(paymentId);
    
    if (!payment) {
      console.error(`[ERROR] Платеж ${paymentId} не найден для обновления статуса`);
      return null;
    }
    
    // Обновляем статус
    payment.status = status;
    payment.updatedAt = new Date().toISOString();
    
    // Сохраняем обновленные данные
    return await savePayment(payment);
  } catch (error) {
    console.error(`[ERROR] Ошибка при обновлении статуса платежа ${paymentId}:`, error);
    return null;
  }
}

module.exports = {
  savePayment,
  getPayment,
  getUserPayments,
  updatePaymentStatus
}; 