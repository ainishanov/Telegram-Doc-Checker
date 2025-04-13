const fs = require('fs');
const path = require('path');
const config = require('../config/config');

// Путь к файлу с настройками пользователей
const USER_SETTINGS_FILE = path.join(__dirname, '../../data/userSettings.json');

// Обеспечиваем существование директории data
if (!fs.existsSync(path.join(__dirname, '../../data'))) {
  fs.mkdirSync(path.join(__dirname, '../../data'), { recursive: true });
}

// Инициализируем файл настроек, если он не существует
if (!fs.existsSync(USER_SETTINGS_FILE)) {
  fs.writeFileSync(USER_SETTINGS_FILE, JSON.stringify({}), 'utf8');
}

/**
 * Получить настройки пользователя
 * @param {string} userId - ID пользователя
 * @returns {Object} - Настройки пользователя
 */
function getUserSettings(userId) {
  try {
    const settings = JSON.parse(fs.readFileSync(USER_SETTINGS_FILE, 'utf8'));
    
    if (!settings[userId]) {
      // Если настроек нет, создаем дефолтные
      settings[userId] = {
        prompt: config.defaultPrompt,
        model: config.openaiModel
      };
      saveUserSettings(settings);
    }
    
    return settings[userId];
  } catch (error) {
    console.error('Ошибка при чтении настроек:', error);
    return {
      prompt: config.defaultPrompt,
      model: config.openaiModel
    };
  }
}

/**
 * Обновить настройки пользователя
 * @param {string} userId - ID пользователя
 * @param {Object} newSettings - Новые настройки
 */
function updateUserSettings(userId, newSettings) {
  try {
    const settings = JSON.parse(fs.readFileSync(USER_SETTINGS_FILE, 'utf8'));
    
    // Создаем настройки для пользователя, если их нет
    if (!settings[userId]) {
      settings[userId] = {
        prompt: config.defaultPrompt,
        model: config.openaiModel
      };
    }
    
    // Обновляем настройки
    settings[userId] = { ...settings[userId], ...newSettings };
    
    saveUserSettings(settings);
    return settings[userId];
  } catch (error) {
    console.error('Ошибка при обновлении настроек:', error);
    return null;
  }
}

/**
 * Сохранить настройки всех пользователей
 * @param {Object} settings - Объект с настройками всех пользователей
 */
function saveUserSettings(settings) {
  fs.writeFileSync(USER_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
}

/**
 * Сбросить промпт пользователя на стандартный
 * @param {string} userId - ID пользователя
 */
function resetPrompt(userId) {
  const settings = getUserSettings(userId);
  settings.prompt = config.defaultPrompt;
  updateUserSettings(userId, settings);
  return settings;
}

module.exports = {
  getUserSettings,
  updateUserSettings,
  resetPrompt
}; 