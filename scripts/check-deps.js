try {
  // Попытка загрузить cheerio
  const cheerio = require('cheerio');
  console.log('Cheerio успешно загружен, версия:', cheerio.VERSION || 'неизвестна');
} catch (error) {
  console.error('Ошибка при загрузке модуля cheerio:', error.message);
  console.error('Стек ошибки:', error.stack);
  process.exit(1); // Выход с ошибкой
}

// Проверка других зависимостей
try {
  const fs = require('fs');
  const path = require('path');
  
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  const dependencies = Object.keys(packageJson.dependencies || {});
  
  console.log('Проверка зависимостей:');
  
  let allDepsLoaded = true;
  for (const dep of dependencies) {
    try {
      require(dep);
      console.log(`✅ ${dep} загружен успешно`);
    } catch (err) {
      console.error(`❌ Ошибка загрузки ${dep}:`, err.message);
      allDepsLoaded = false;
    }
  }
  
  if (!allDepsLoaded) {
    console.error('Не все зависимости загружены корректно!');
    process.exit(1);
  }
  
  console.log('Все зависимости проверены успешно!');
} catch (error) {
  console.error('Ошибка при проверке зависимостей:', error.message);
  process.exit(1);
} 