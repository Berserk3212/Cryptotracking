

/** Максимальные длины полей (соответствуют ограничениям БД) */
const FIELD_LIMITS = {
  portfolioName:  100,
  description:    500,
  profileName:    100,
  symbol:          20,
  currency:         3,
  riskLevel:       10,
  textInput:      255,
};

/** Допустимые значения для enum-полей */
const ALLOWED_ENUMS = {
  transactionType: ['BUY', 'SELL'],
  riskLevel:       ['low', 'medium', 'high'],
  currency:        ['USD', 'EUR', 'RUB', 'GBP', 'JPY', 'CNY', 'CAD', 'AUD', 'CHF'],
};

/** Паттерн допустимых тикеров (только буквы, цифры, дефис, точка) */
const TICKER_PATTERN = /^[A-Za-z0-9.\-]{1,20}$/;

/**
 * Экранирует HTML-сущности для безопасного вывода пользовательских данных в DOM.
 * Использовать при вставке текста через innerHTML.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return String(str ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Безопасная установка текстового содержимого элемента.
 * Использует textContent вместо innerHTML.
 * @param {HTMLElement} el
 * @param {string} text
 */
export function safeSetText(el, text) {
  if (!el) return;
  el.textContent = String(text ?? '');
}


/**
 * Удаляет управляющие символы и обрезает строку до maxLen.
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
function sanitizeString(str, maxLen) {
  if (typeof str !== 'string') {
    throw new SecurityValidationError(`Ожидалась строка, получено: ${typeof str}`);
  }
  // Удалить нулевые байты и управляющие символы (кроме пробела, таба, переноса)
  const cleaned = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
  if (cleaned.length > maxLen) {
    throw new SecurityValidationError(`Длина поля превышает допустимую: максимум ${maxLen} символов`);
  }
  return cleaned;
}

/**
 * Проверяет, что значение входит в разрешённый список.
 * @param {string} value
 * @param {string[]} allowed
 * @param {string} fieldName
 * @returns {string}
 */
function validateEnum(value, allowed, fieldName) {
  if (!allowed.includes(value)) {
    throw new SecurityValidationError(
      `Недопустимое значение для "${fieldName}": "${escapeHtml(String(value))}". Допустимо: ${allowed.join(', ')}`
    );
  }
  return value;
}


export class SecurityValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SecurityValidationError';
  }
}



/**
 * Валидирует данные для создания портфеля.
 * @param {{ name: string, description: string, currency: string, riskLevel: string }} params
 * @returns {{ name: string, description: string, currency: string, riskLevel: string }}
 */
export function validatePortfolioInput({ name, description, currency, riskLevel }) {
  const safeNname       = sanitizeString(name,        FIELD_LIMITS.portfolioName);
  const safeDescription = sanitizeString(description ?? '', FIELD_LIMITS.description);
  const safeCurrency    = validateEnum(currency,  ALLOWED_ENUMS.currency,  'currency');
  const safeRiskLevel   = validateEnum(riskLevel, ALLOWED_ENUMS.riskLevel, 'riskLevel');

  if (safeNname.length === 0) {
    throw new SecurityValidationError('Название портфеля не может быть пустым');
  }

  return {
    name:        safeNname,
    description: safeDescription,
    currency:    safeCurrency,
    riskLevel:   safeRiskLevel,
  };
}

/**
 * Валидирует данные транзакции перед записью в БД.
 * @param {{ type: string, symbol: string, quantity: number, price: number, date: string }} params
 * @returns {{ type: string, symbol: string, quantity: number, price: number, date: string }}
 */
export function validateTransactionInput({ type, symbol, quantity, price, date }) {
  const safeType = validateEnum(type, ALLOWED_ENUMS.transactionType, 'transactionType');

  if (typeof symbol !== 'string' || !TICKER_PATTERN.test(symbol)) {
    throw new SecurityValidationError(
      `Недопустимый тикер: "${escapeHtml(String(symbol))}". Допустимы только буквы, цифры, точка и дефис`
    );
  }
  const safeSymbol = symbol.toUpperCase();

  const safeQty = Number(quantity);
  if (!Number.isFinite(safeQty) || safeQty <= 0) {
    throw new SecurityValidationError('Количество должно быть положительным числом');
  }

  const safePrice = Number(price);
  if (!Number.isFinite(safePrice) || safePrice < 0) {
    throw new SecurityValidationError('Цена должна быть неотрицательным числом');
  }

  // Проверка даты
  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) {
    throw new SecurityValidationError('Недопустимый формат даты');
  }
  // Не позволяем даты далеко в будущем (> 1 дня вперёд)
  if (parsedDate.getTime() > Date.now() + 86_400_000) {
    throw new SecurityValidationError('Дата операции не может быть в будущем');
  }

  return {
    type:     safeType,
    symbol:   safeSymbol,
    quantity: safeQty,
    price:    safePrice,
    date:     parsedDate.toISOString(),
  };
}

/**
 * Валидирует имя пользователя в профиле.
 * @param {string} name
 * @returns {string}
 */
export function validateProfileName(name) {
  const safe = sanitizeString(name, FIELD_LIMITS.profileName);
  if (safe.length === 0) {
    throw new SecurityValidationError('Имя пользователя не может быть пустым');
  }
  return safe;
}
