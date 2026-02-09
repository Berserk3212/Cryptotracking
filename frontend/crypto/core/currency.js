async function safeFetchJsonGlobal(url, options) {
  try {
    const response = await fetch(url, options);
    const contentType = response.headers.get('content-type') || '';
    
    if (!response.ok) {
      console.warn('safeFetchJsonGlobal: response not ok', url, response.status);
      return null;
    }
    
    if (!contentType.includes('application/json')) {
      console.warn('safeFetchJsonGlobal: CORB or non-JSON response', url, 'Content-Type:', contentType);
      return null;
    }
    
    return await response.json();
  } catch (e) {
    console.warn('safeFetchJsonGlobal: fetch or parse error', url, e.message);
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

export async function setSelectedCurrencyAsync(currency) {
  selectedCurrency = currency;
  localStorage.setItem(CURRENCY_KEY, currency);
  window.dispatchEvent(new CustomEvent('currencyChanged', { detail: { currency, rate: currencyRate } }));
  await fetchCurrencyRate();
}

export async function fetchCurrencyRate() {
  if (selectedCurrency === BASE_CURRENCY) {
    currencyRate = 1;
    localStorage.setItem(RATE_KEY, '1');
    return 1;
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
                    console.warn(`Fetched currency rate is 1 for ${selectedCurrency} — possible API/CORS error`);
                }
                currencyRate = parsed;
                localStorage.setItem(RATE_KEY, currencyRate.toString());
                window.dispatchEvent(new CustomEvent('currencyRateUpdated', { detail: { currency: selectedCurrency, rate: currencyRate } }));
                if (window.showNotification) window.showNotification(`Курс загружен: 1 USD = ${currencyRate} ${selectedCurrency}`, 'success');
                return currencyRate;
            }
        } catch (err) {
            // игнорируем провайдера и пробуем следующий
            console.warn('Currency provider failed:', err);
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
        console.error('Failed to fetch valid currency rate; falling back to', currencyRate);
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
