const fs = require('fs');
const path = require('path');

// Файл для хранения событий в формате JSON Lines
const EVENTS_FILE = path.join(__dirname, '../../data/events.jsonl');

// Гарантируем существование директории data
const dataDir = path.dirname(EVENTS_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Резервное хранилище на случай проблем с ФС
const memoryEvents = [];

/**
 * Логирует событие пользовательского поведения
 * @param {{userId: number|string, step: string, meta?: object}} param0
 */
function logEvent({ userId, step, meta = {} }) {
  const event = {
    userId,
    step,
    timestamp: new Date().toISOString(),
    ...(Object.keys(meta).length ? { meta } : {})
  };

  // Пытаемся записать строку в файл
  try {
    fs.appendFileSync(EVENTS_FILE, JSON.stringify(event) + '\n', 'utf8');
  } catch (err) {
    console.error('[WARN] Не удалось записать event в файл, сохраняю в памяти:', err.message);
    memoryEvents.push(event);
  }
}

module.exports = { logEvent }; 