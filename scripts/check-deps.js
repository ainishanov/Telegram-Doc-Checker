const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('Проверка необходимых зависимостей...');

const platform = os.platform();
let missingDependencies = false;

// Функция для проверки наличия команды
function commandExists(command) {
  try {
    execSync(`which ${command}`, { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

// Проверка наличия пакета pdf-to-png-converter
try {
  require.resolve('pdf-to-png-converter');
  console.log('✅ pdf-to-png-converter установлен');
} catch (error) {
  console.log('❌ pdf-to-png-converter не установлен. Установка...');
  try {
    execSync('npm install pdf-to-png-converter', { stdio: 'inherit' });
    console.log('✅ pdf-to-png-converter успешно установлен');
  } catch (installError) {
    console.error('❌ Ошибка при установке pdf-to-png-converter:', installError.message);
    missingDependencies = true;
  }
}

// Проверка наличия tesseract.js
try {
  require.resolve('tesseract.js');
  console.log('✅ tesseract.js установлен');
} catch (error) {
  console.log('❌ tesseract.js не установлен. Установка...');
  try {
    execSync('npm install tesseract.js', { stdio: 'inherit' });
    console.log('✅ tesseract.js успешно установлен');
  } catch (installError) {
    console.error('❌ Ошибка при установке tesseract.js:', installError.message);
    missingDependencies = true;
  }
}

// Создаем временные директории если их нет
const tempDir = path.join(__dirname, '..', 'temp');
if (!fs.existsSync(tempDir)) {
  console.log(`Создание временной директории ${tempDir}...`);
  fs.mkdirSync(tempDir, { recursive: true });
  console.log('✅ Временная директория создана');
}

// Проверка наличия Cheerio
try {
  const cheerio = require('cheerio');
  console.log('✅ cheerio установлен');
} catch (error) {
  console.log('❌ cheerio не установлен. Установка...');
  try {
    execSync('npm install cheerio@1.0.0-rc.12', { stdio: 'inherit' });
    console.log('✅ cheerio успешно установлен');
  } catch (installError) {
    console.error('❌ Ошибка при установке cheerio:', installError.message);
    missingDependencies = true;
  }
}

// Объявляем рекомендации для разных платформ
const recommendations = {
  linux: 'sudo apt-get install imagemagick poppler-utils tesseract-ocr tesseract-ocr-rus',
  darwin: 'brew install imagemagick poppler tesseract',
  win32: 'Для Windows установка внешних зависимостей не требуется.'
};

// Показываем итоговое сообщение
if (missingDependencies) {
  console.log('\n⚠️ Некоторые зависимости не были установлены.');
  console.log(`\nРекомендация для ${platform}:`);
  console.log(recommendations[platform] || 'Для вашей ОС нет рекомендаций.');
} else {
  console.log('\n✅ Все зависимости проверены и установлены!');
}

console.log('\nПриложение готово к запуску.'); 