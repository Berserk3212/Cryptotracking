async function safeFetchJsonGlobal(url, options) {
  try {
    const response = await fetch(url, options);
    const contentType = response.headers.get('content-type') || '';
    
    if (!response.ok) {

      return null;
    }
    
    if (!contentType.includes('application/json')) {

      return null;
    }
    
    return await response.json();
  } catch (e) {

    return null;
  }
}

const CURRENCY_KEY = 'selectedCurrency';
const RATE_KEY = 'currencyRate';
const BASE_CURRENCY = 'USD';

let currencyRate = 1;
let selectedCurrency = localStorage.getItem(CURRENCY_KEY) || BASE_CURRENCY;

export function getSelectedCurrency() {
    return selectedCurrency;
}

export function setSelectedCurrency(currency) {
  selectedCurrency = currency;
  localStorage.setItem(CURRENCY_KEY, currency);
  window.dispatchEvent(new CustomEvent('currencyChanged', { detail: { currency, rate: currencyRate } }));
  fetchCurrencyRate();
}

export function setSelectedCurrencyAsync(currency) {
  selectedCurrency = currency;
  localStorage.setItem(CURRENCY_KEY, currency);

  // Мгновенно применяем кешированный курс до запроса к API
  if (currency === BASE_CURRENCY) {
    currencyRate = 1;
  } else {
    const cached = parseFloat(localStorage.getItem(`currency_rate_${currency}`));
    if (cached > 0 && !isNaN(cached)) currencyRate = cached;
  }
  localStorage.setItem(RATE_KEY, currencyRate.toString());

  // Мгновенный диспатч с уже правильным курсом
  window.dispatchEvent(new CustomEvent('currencyChanged', { detail: { currency, rate: currencyRate } }));

  // Фоновый фетч актуального курса (не блокирует вызывающий код)
  fetchCurrencyRate().then(() => {
    window.dispatchEvent(new CustomEvent('currencyChanged', { detail: { currency: selectedCurrency, rate: currencyRate } }));
  }).catch(() => {});
}

export async function fetchCurrencyRate() {
  if (selectedCurrency === BASE_CURRENCY) {
    currencyRate = 1;
    localStorage.setItem(RATE_KEY, '1');
    return 1;
  }

  // Per-currency cache with 1-hour TTL for instant repeat lookups
  const cacheKey = `currency_rate_${selectedCurrency}`;
  const cacheTimeKey = `currency_rate_time_${selectedCurrency}`;
  const cachedRate = parseFloat(localStorage.getItem(cacheKey));
  const cachedTime = parseInt(localStorage.getItem(cacheTimeKey) || '0');
  if (cachedRate > 0 && !isNaN(cachedRate) && Date.now() - cachedTime < 3_600_000) {
    currencyRate = cachedRate;
    localStorage.setItem(RATE_KEY, currencyRate.toString());
    window.dispatchEvent(new CustomEvent('currencyRateUpdated', { detail: { currency: selectedCurrency, rate: currencyRate } }));
    return currencyRate;
  }

  const providers = [
        async () => {
            const data = await safeFetchJsonGlobal(`https://api.exchangerate.host/latest?base=${BASE_CURRENCY}&symbols=${selectedCurrency}`);
            return data?.rates?.[selectedCurrency];
        },
        async () => {
            const data = await safeFetchJsonGlobal(`https://api.exchangerate.host/convert?from=${BASE_CURRENCY}&to=${selectedCurrency}`);
            return data?.result;
        },
        async () => {
            const data = await safeFetchJsonGlobal(`https://open.er-api.com/v6/latest/${BASE_CURRENCY}`);
            return data?.rates?.[selectedCurrency];
        },
        async () => {
            const data = await safeFetchJsonGlobal(`https://api.frankfurter.app/latest?from=${BASE_CURRENCY}&to=${selectedCurrency}`);
            return data?.rates?.[selectedCurrency];
        }
    ];

    for (const provider of providers) {
        try {
            const r = await provider();
            if (r && !isNaN(r) && Number(r) > 0) {
                const parsed = Number(r);
                // Защитная проверка: если API вернул ровно 1 для не-USD валюты — это подозрительно
                if (parsed === 1 && selectedCurrency !== BASE_CURRENCY) {

                }
                currencyRate = parsed;
                localStorage.setItem(RATE_KEY, currencyRate.toString());
                // Save per-currency cache
                localStorage.setItem(`currency_rate_${selectedCurrency}`, currencyRate.toString());
                localStorage.setItem(`currency_rate_time_${selectedCurrency}`, Date.now().toString());
                window.dispatchEvent(new CustomEvent('currencyRateUpdated', { detail: { currency: selectedCurrency, rate: currencyRate } }));
                if (window.showNotification) window.showNotification(`Курс загружен: 1 USD = ${currencyRate} ${selectedCurrency}`, 'success');
                return currencyRate;
            }
        } catch (err) {
            // игнорируем провайдера и пробуем следующий

        }
    }

    // Фоллбек на последний сохранённый курс или 1
    const storedRate = parseFloat(localStorage.getItem(RATE_KEY) || '1');
    if (!isNaN(storedRate) && storedRate > 0) {
        currencyRate = storedRate;
    } else {
        currencyRate = 1;
    }

    if (currencyRate === 1 && selectedCurrency !== BASE_CURRENCY) {

        if (window.showNotification) window.showNotification('Не удалось загрузить корректный курс валюты — используется последний доступный или 1', 'error');
    }

    return currencyRate;
}

export function convertToSelectedCurrency(amountInUSD) {
    // Всегда обновляем currencyRate из localStorage
    const storedRate = parseFloat(localStorage.getItem(RATE_KEY));
    if (!isNaN(storedRate) && storedRate > 0) {
        currencyRate = storedRate;
    }
    const amt = parseFloat(amountInUSD) || 0;
    // Возвращаем числовое значение (можно форматировать при выводе)
    return amt * currencyRate;
}

// Возвращает текущий курс (удобно для отладки)
export function getCurrencyRate() {
    const storedRate = parseFloat(localStorage.getItem(RATE_KEY));
    if (!isNaN(storedRate) && storedRate > 0) return storedRate;
    return currencyRate;
}

export function getCurrencySymbol() {
    switch (selectedCurrency) {
        case 'RUB': return '₽';
        case 'EUR': return '€';
        case 'USD': return '$';
        case 'GBP': return '£';
        case 'CNY': return '¥';
        default: return selectedCurrency;
    }
}

// Для инициализации при старте
fetchCurrencyRate();
