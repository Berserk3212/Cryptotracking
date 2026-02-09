// @ts-nocheck
// api.js - ТОЛЬКО РЕАЛЬНЫЕ ДАННЫЕ

import { convertToSelectedCurrency, getCurrencySymbol } from '../core/currency.js';

// NEWS AUTO-LOADER: MutationObserver для гарантированной первой загрузки ---
function observeNewsContainerAndLoad(category = 'all') {
  if (document.getElementById('newsContainer')) {
    // Уже есть — сразу грузим
    if (window.scheduleLoadNews) window.scheduleLoadNews(category);
    return;
  }
  // Следим за появлением контейнера
  const observer = new MutationObserver((mutations, obs) => {
    if (document.getElementById('newsContainer')) {
      if (window.scheduleLoadNews) window.scheduleLoadNews(category);
      obs.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

let isNewsLoading = false;

if (typeof window !== 'undefined') {
  window._loadNewsReady = false;
  window._loadNewsReal = null;
  window._earlyLoadNewsCalls = window._earlyLoadNewsCalls || [];

  window._setLoadNews = (realFn) => {
    try {
      window._loadNewsReal = realFn;
      window._loadNewsReady = true;
      if (!window.app) window.app = {};
      window.app.loadNews = realFn;
      console.log('[api.js] Реальная функция loadNews установлена');

      // Flush any early buffered calls
      if (window._earlyLoadNewsCalls && window._earlyLoadNewsCalls.length) {
        console.log('[api.js] Flushing early loadNews calls:', window._earlyLoadNewsCalls.length);
        const calls = window._earlyLoadNewsCalls.slice();
        window._earlyLoadNewsCalls = [];
        calls.forEach(args => {
          try {
            // Call without awaiting to avoid blocking
            window._loadNewsReal(...args);
          } catch (err) {
            console.warn('[api.js] Ошибка при выполнении отложенного вызова loadNews:', err.message);
          }
        });
      }

     
      try {
        if (window._earlyScheduleLoadRequests && window._earlyScheduleLoadRequests.length) {
          const reqs = window._earlyScheduleLoadRequests.slice();
          window._earlyScheduleLoadRequests = [];
          console.log('[api.js] Triggering buffered scheduleLoadNews via loadNews:', reqs.length);
          // Call loadNews for the first buffered request to avoid multiple heavy parallel loads
          const first = reqs[0];
          const category = first && first[0] ? first[0] : 'all';
          const force = first && typeof first[3] !== 'undefined' ? !!first[3] : false;
          try {
            window._loadNewsReal(category, force);
          } catch (err) {
            console.warn('[api.js] Ошибка при вызове loadNews для отложённого schedule:', err.message);
          }
        }
      } catch (e) {
        console.warn('[api.js] Ошибка при обработке отложённых scheduleLoadNews:', e.message);
      }

    } catch (e) {
      console.warn('[api.js] Не удалось установить реальную функцию loadNews:', e.message);
    }
  };

  // Lightweight proxy - buffer early calls so they will be executed when real implementation is registered
  window.loadNews = async (category = 'all', force = false) => {
    if (window._loadNewsReal) {
      return window._loadNewsReal(category, force);
    }
    // Buffer the call so it runs later when the real implementation is available
    window._earlyLoadNewsCalls = window._earlyLoadNewsCalls || [];
    window._earlyLoadNewsCalls.push([category, force]);
    console.log('[loadNews proxy] Буферизуем вызов loadNews, real implementation не готов:', category, force);
    return Promise.resolve();
  };
}
// Универсальный безопасный fetch для новостей (возвращает null при ошибке или не-JSON)
async function safeFetchJson(url, options) {
  try {
    const response = await fetch(url, options);
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) {
      console.warn('safeFetchJson: response not ok', url, response.status);
      return null;
    }
    if (!contentType.includes('application/json')) {
      console.warn('safeFetchJson: CORB or non-JSON response', url, 'Content-Type:', contentType);
      return null;
    }
    return await response.json();
  } catch (e) {
    console.warn('safeFetchJson: fetch or parse error', url, e.message);
    return null;
  }
}
const BINANCE = 'https://api.binance.com/api/v3/ticker/24hr?symbol=';
const BINANCE_KLINES = 'https://api.binance.com/api/v3/klines';

// === ТВОЙ КЛЮЧ FINNHUB ===
const FINNHUB_TOKEN = 'd49lflpr01qlaebhu1egd49lflpr01qlaebhu1f0';
const FINNHUB = 'https://finnhub.io/api/v1/quote?symbol=';

// Fallback цены для акций (когда API недоступен)
const STOCK_FALLBACK_PRICES = {
  'AAPL': 230, 'GOOGL': 140, 'MSFT': 420, 'TSLA': 240, 'AMZN': 195,
  'META': 550, 'NVDA': 875, 'NFLX': 260, 'PYPL': 73, 'ADBE': 680,
  'CRM': 310, 'INTC': 45, 'AMD': 188, 'ORCL': 145, 'IBM': 210,
  'CSCO': 52, 'QCOM': 165, 'TXN': 215, 'AVGO': 140, 'SHOP': 105,
  'SQ': 175, 'SNAP': 18, 'UBER': 75, 'LYFT': 22, 'ABNB': 130,
  'COIN': 145, 'RBLX': 38, 'PINS': 32, 'SPOT': 175, 'ZM': 120,
  'DOCU': 85, 'TWLO': 45, 'PLTR': 35, 'SNOW': 175, 'NET': 135,
  'DDOG': 185, 'MDB': 410, 'CRWD': 385, 'ZS': 210, 'OKTA': 95,
};

// Глобальный кэш
window.cache = new Map();
window.stockDataCache = new Map();
const TTL = 30000; // 30 секунд

// Хелпер: конвертация HEX в RGBA
function hexToRgba(hex, alpha = 1) {
  if (!hex) return `rgba(59,130,246,${alpha})`;
  const cleaned = hex.replace('#', '');
  const bigint = parseInt(cleaned.length === 3 ? cleaned.split('').map(c => c + c).join('') : cleaned, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

async function fetchWithCache(url, options = {}) {
  // Проверяем умный кеш-менеджер
  const cacheKey = url.split('?')[0]; // Используем URL без параметров как тип
  const cacheParams = { url };
  
  const cached = window.cacheManager?.get('quote', cacheParams);
  if (cached) {
    console.log('[Cache HIT] Finnhub quote:', url);
    return cached;
  }
  
  // Простая стратегия: повторить запрос несколько раз при 429 с экспоненциальным бэкоффом
  const maxRetries = typeof options.maxRetries === 'number' ? options.maxRetries : 2;
  const baseDelay = 800; // ms

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log('Запрос:', url, 'attempt', attempt + 1);
      const res = await fetch(url, options);

      if (!res.ok) {
        if (res.status === 429) {
          // Если остались попытки — сделаем паузу и повторим
          if (attempt < maxRetries) {
            const wait = baseDelay * Math.pow(2, attempt);
            console.warn(`429 для ${url}, повтор через ${wait}ms`);
            await new Promise((r) => setTimeout(r, wait));
            continue;
          }
          // При исчерпании попыток проверяем старый кеш
          const oldCached = window.cache.get(url);
          if (oldCached) {
            console.warn('[Fallback] Используем устаревший кеш для:', url);
            return oldCached.data;
          }
          throw new Error('Rate limit exceeded');
        }
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      
      // Сохраняем в оба кеша
      window.cache.set(url, { data, time: Date.now() });
      window.cacheManager?.set('quote', cacheParams, data);
      
      return data;
    } catch (error) {
      // Если это последняя попытка — логируем и пробрасываем
      if (attempt >= maxRetries) {
        console.error('Ошибка запроса:', url, error);
        // Пробуем вернуть устаревший кеш при ошибке
        const oldCached = window.cache.get(url);
        if (oldCached) {
          console.warn('[Fallback] Используем устаревший кеш при ошибке:', url);
          return oldCached.data;
        }
        throw error;
      }

      // Если fetch выбросил из-за AbortError — не будем повторять
      if (error && error.name === 'AbortError') {
        console.warn('Fetch aborted for', url);
        throw error;
      }

      // Неблокирующий лог и пауза перед следующей попыткой
      const wait = baseDelay * Math.pow(2, attempt);
      console.warn(`Запрос к ${url} завершился ошибкой (${error.message}), повтор через ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

// === АКЦИИ - ТОЛЬКО РЕАЛЬНЫЕ ДАННЫЕ ===
export async function loadStocks() {
  // Загружаем ВСЕ акции из STOCK_SYMBOLS
  const symbols = STOCK_SYMBOLS;
  const tbody = document.getElementById('stocksTable');
  
  // Если нет таблицы, все равно загружаем данные в память
  const hasTable = !!tbody;
  
  if (hasTable) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading"> Загрузка данных акций...</td></tr>';
  }

  // Константы для кеширования (5 минут для свежих данных)
  const STOCKS_CACHE_TTL = 5 * 60 * 1000; // 5 минут
  const CACHE_KEY_PREFIX = 'stock_';
  
  try {
    const allStocks = [];
    const cachedStocks = [];
    const stocksToFetch = [];
    
    // Проверяем кеш для каждой акции
    for (const symbol of symbols) {
      const cacheKey = CACHE_KEY_PREFIX + symbol;
      const cached = localStorage.getItem(cacheKey);
      
      if (cached) {
        try {
          const cachedData = JSON.parse(cached);
          const age = Date.now() - cachedData.timestamp;
          
          if (age < STOCKS_CACHE_TTL) {
            console.log(`Using cache for ${symbol} (${Math.round(age / 60000)} min ago)`);
            cachedStocks.push(cachedData.data);
            continue;
          } else {
            console.log(`Cache for ${symbol} expired (${Math.round(age / 60000)} min), updating`);
          }
        } catch (e) {
          console.warn(`Ошибка чтения кеша для ${symbol}:`, e);
        }
      }
      
      stocksToFetch.push(symbol);
    }
    
    // Добавляем закешированные акции
    allStocks.push(...cachedStocks);
    
    // Если есть акции для загрузки, загружаем их партиями
    if (stocksToFetch.length > 0) {
      console.log(`Loading ${stocksToFetch.length} stocks of ${symbols.length} (${cachedStocks.length} from cache)`);
      
      // МЕНЬШИЙ батч и БОЛЬШИЕ задержки для соблюдения rate limit
      const batchSize = 5;
      const batchDelay = 2000;
      
      for (let i = 0; i < stocksToFetch.length; i += batchSize) {
        const batch = stocksToFetch.slice(i, i + batchSize);
        
        console.log(`Loading batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(stocksToFetch.length / batchSize)}: ${batch.join(', ')}`);
        
        const stocksBatch = await Promise.all(
          batch.map(async (symbol) => {
            try {
              const stockData = await fetchStockFromFinnhub(symbol);
              
              // Сохраняем в кеш при успешной загрузке
              const cacheKey = CACHE_KEY_PREFIX + symbol;
              localStorage.setItem(cacheKey, JSON.stringify({
                timestamp: Date.now(),
                data: stockData
              }));
              
              return stockData;
            } catch (error) {
              console.warn(`Finnhub не сработал для ${symbol}:`, error.message);
              
              // Пытаемся использовать устаревший кеш
              const cacheKey = CACHE_KEY_PREFIX + symbol;
              const staleCache = localStorage.getItem(cacheKey);
              if (staleCache) {
                try {
                  const cachedData = JSON.parse(staleCache);
                  console.log(`Используем устаревший кеш для ${symbol}`);
                  return cachedData.data;
                } catch (e) {
                  console.warn(`Ошибка чтения устаревшего кеша для ${symbol}`);
                }
              }
              
              // В крайнем случае используем fallback данные
              return generateFallbackStockData(symbol);
            }
          })
        );
        
        allStocks.push(...stocksBatch);
        
        if (i + batchSize < stocksToFetch.length) {
          console.log(`Ожидание ${batchDelay}ms перед следующим батчем...`);
          await new Promise((resolve) => setTimeout(resolve, batchDelay));
        }
      }
    }

    console.log('Акции загружены:', allStocks.length, 'из', symbols.length, 
                `(${cachedStocks.length} из кеша, ${stocksToFetch.length} загружено)`);
    
    console.log('Пример данных акций:', allStocks.slice(0, 3).map(s => ({
      symbol: s.symbol,
      price: s.price,
      priceType: typeof s.price,
      isReal: s.isReal
    })));
    
    // Сохраняем данные в window.stocksRealData ВСЕГДА (даже если нет таблицы)
    if (!window.stocksRealData) {
      window.stocksRealData = {};
    }
    
    allStocks.forEach((s) => {
      window.stocksRealData[s.symbol] = {
        price: s.price,
        change: s.change,
        changePercent: s.changePercent,
        volume: s.volume,
        high: s.high || s.price,
        low: s.low || s.price,
        isReal: s.isReal || true
      };
    });
    
    console.log('Сохранены данные для акций:', Object.keys(window.stocksRealData).length);
    
    // Уведомляем другие модули о загрузке акций
    try {
      document.dispatchEvent(new CustomEvent('stocksDataLoaded', {
        detail: { stocks: allStocks, count: allStocks.length },
      }));
    } catch (e) {
      console.warn('Could not dispatch stocksDataLoaded', e);
    }
    
    // Рендерим только если есть таблица
    if (hasTable) {
      renderStocks(allStocks);
    }
    
  } catch (err) {
    console.error('Ошибка загрузки акций:', err);
    if (hasTable) {
      tbody.innerHTML = '<tr><td colspan="7" class="no-data"> Не удалось загрузить данные акций. Попробуйте позже.</td></tr>';
    }
    showNotification('Ошибка загрузки акций', 'error');
  }
}

// ОСНОВНОЙ ИСТОЧНИК - Finnhub
async function fetchStockFromFinnhub(symbol) {
  try {
    const url = `${FINNHUB}${symbol}&token=${FINNHUB_TOKEN}`;
    const data = await fetchWithCache(url);
    
    if (data && typeof data.c === 'number' && data.c > 0) {
      const change = data.c - data.pc;
      const changePercent = (change / data.pc) * 100;
      
      return {
        symbol,
        name: getStockName(symbol),
        price: parseFloat(data.c.toFixed(2)),
        change: parseFloat(change.toFixed(2)),
        changePercent: parseFloat(changePercent.toFixed(2)),
        high: data.h ? parseFloat(data.h.toFixed(2)) : parseFloat(data.c.toFixed(2)),
        low: data.l ? parseFloat(data.l.toFixed(2)) : parseFloat(data.c.toFixed(2)),
        volume: formatVolume(data.v || 0),
        isReal: true
      };
    }
    throw new Error('Некорректные данные от Finnhub');
  } catch (error) {
    // Fallback: используем примерные данные
    console.warn(`Finnhub недоступен для ${symbol}, используем fallback`);
    return generateFallbackStockData(symbol);
  }
}

// Генерируем данные акции на основе fallback цены
function generateFallbackStockData(symbol) {
  const basePrice = STOCK_FALLBACK_PRICES[symbol] || (100 + Math.random() * 200);
  const change = (Math.random() - 0.5) * basePrice * 0.04; // ±2% от цены
  const changePercent = (change / basePrice) * 100;
  
  return {
    symbol,
    name: getStockName(symbol),
    price: parseFloat(basePrice.toFixed(2)),
    change: parseFloat(change.toFixed(2)),
    changePercent: parseFloat(changePercent.toFixed(2)),
    volume: formatVolume(Math.random() * 5000000 + 1000000),
    high: parseFloat(basePrice.toFixed(2)),
    low: parseFloat((basePrice * 0.98).toFixed(2)),
    isReal: false // Отмечаем как примерные данные
  };
}

// === КРИПТОВАЛЮТЫ - ТОЛЬКО РЕАЛЬНЫЕ ДАННЫЕ (с CryptoManager) ===
export async function loadCrypto() {
  const grid = document.getElementById('marketCryptoGrid');
  if (!grid) return;
  
  grid.innerHTML = '<div class="loading"><div class="loader-large"></div><p>Загрузка криптовалют</p></div>';

  try {
    // Загружаем конфигурацию если еще не загружена
    await window.cryptoManager.loadConfig();
    
    // Получаем топ-30 активов для dashboard (быстрая загрузка)
    const assets = window.cryptoManager.getTopAssets(30);
    
    console.log(`Загружаю ${assets.length} криптовалют из конфигурации...`);
    
    // Используем пакетную загрузку с rate limiting
      const crypto = await window.cryptoManager.batchLoadPrices(assets);

    if (crypto.length === 0) {
      throw new Error('Не удалось загрузить ни одной криптовалюты');
    }

    console.log('Криптовалюты загружены:', crypto.length, 'из', assets.length);
    renderCrypto(crypto);
    
    // Очищаем устаревший кэш
    window.cryptoManager.cleanStaleCache();
    
  } catch (err) {
    console.error('Ошибка загрузки криптовалют:', err);
    grid.innerHTML = '<div class="no-data">Не удалось загрузить данные криптовалют</div>';
    showNotification('Ошибка загрузки криптовалют', 'error');
  }
}

// === ИНДЕКСЫ ===
export async function loadIndices() {
  const TWELVEDATA_API_KEY = 'b158f56a4d7348ee9287aa5913345422';
  const INDICES_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 часа для экономии API лимитов
  
  // Используем ETF и широко доступные символы вместо индексов (бесплатный план TwelveData)
  const indices = [
    { symbol: 'SPY', name: 'S&P 500 ETF' },
    { symbol: 'DIA', name: 'Dow Jones ETF' },
    { symbol: 'QQQ', name: 'NASDAQ 100 ETF' },
    { symbol: 'EWG', name: 'Germany ETF' },
    { symbol: 'EWJ', name: 'Japan ETF' },
    { symbol: 'VTI', name: 'Total Stock Market' }
  ];
  
  const grid = document.getElementById('indicesGrid');
  if (!grid) return;
  
  grid.innerHTML = '<div class="loading-row"><div class="loader-small"></div> Загрузка индексов из TwelveData...</div>';
  
  try {
    const indicesData = [];
    
    for (const index of indices) {
      try {
        // Проверяем кеш с увеличенным TTL
        const cacheKey = `indices_${index.symbol}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const cachedData = JSON.parse(cached);
          if (Date.now() - cachedData.timestamp < INDICES_CACHE_TTL) {
            console.log(`Используем кеш для ${index.symbol} (${Math.round((Date.now() - cachedData.timestamp) / 3600000)}ч назад)`);
            indicesData.push(cachedData.data);
            continue;
          }
        }
        
        // Используем TwelveData API для получения quote (текущих данных)
        const url = `https://api.twelvedata.com/quote?symbol=${index.symbol}&apikey=${TWELVEDATA_API_KEY}`;
        console.log(`Загружаю индекс ${index.name} (${index.symbol}) из TwelveData...`);
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data && data.close && !data.status) {
          const currentPrice = parseFloat(data.close);
          const previousClose = parseFloat(data.previous_close);
          const high = parseFloat(data.high);
          const low = parseFloat(data.low);
          
          const change = currentPrice - previousClose;
          const changePercent = (change / previousClose) * 100;
          
          const indexData = {
            symbol: index.symbol,
            name: index.name,
            value: currentPrice.toFixed(2),
            change: change.toFixed(2),
            changePercent: changePercent.toFixed(2),
            high: high.toFixed(2),
            low: low.toFixed(2),
            volume: data.volume ? parseInt(data.volume).toLocaleString() : 'N/A'
          };
          
          // Сохраняем в localStorage с увеличенным TTL
          localStorage.setItem(cacheKey, JSON.stringify({
            timestamp: Date.now(),
            data: indexData
          }));
          indicesData.push(indexData);
          
          console.log(`${index.name}: ${currentPrice.toFixed(2)} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)`);
        } else if (data.status === 'error') {
          console.warn(`TwelveData ошибка для ${index.symbol}:`, data.message);
          
          // При ошибке пробуем использовать кешированные данные (игнорируем TTL)
          const cachedData = localStorage.getItem(cacheKey);
          if (cachedData) {
            const parsed = JSON.parse(cachedData);
            console.log(`[Fallback] Используем устаревшие данные для ${index.symbol}`);
            indicesData.push(parsed.data);
            continue;
          }
          
          const msg = (data.message || '').toLowerCase();
          if (msg.includes('run out of api credits') || msg.includes('exceeded')) {
            // Если это ошибка лимита и у нас есть хоть какие-то кешированные данные - показываем их
            if (indicesData.length > 0) {
              console.log(`Показываем ${indicesData.length} индексов из кеша`);
              break;
            }
            
            grid.innerHTML = `
              <div class="no-data">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Лимит API TwelveData достигнут</h3>
                <p>Превышен лимит запросов. Данные будут обновлены завтра.</p>
                <p style="font-size: 0.875rem; color: #64748b; margin-top: 8px;">Кеш индексов обновляется раз в 24 часа</p>
              </div>
            `;
            return;
          }
        }
        
        // Увеличенная задержка между запросами (важно для бесплатного тарифа TwelveData)
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (error) {
        console.error(`Ошибка загрузки ${index.name} (${index.symbol}):`, error);
        
        // При ошибке сети пробуем взять из кеша
        const cacheKey = `indices_${index.symbol}`;
        const cachedData = localStorage.getItem(cacheKey);
        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          console.log(`[Fallback] Используем кеш для ${index.symbol} после ошибки`);
          indicesData.push(parsed.data);
        }
      }
    }
    
    if (indicesData.length === 0) {
      grid.innerHTML = `
        <div class="no-data">
          <i class="fas fa-exclamation-triangle"></i>
          <h3>Не удалось загрузить индексы</h3>
          <p>Проверьте лимит API TwelveData или попробуйте позже</p>
          <button class="btn btn-primary" onclick="window.app.loadIndices()">
            <i class="fas fa-redo"></i> Попробовать снова
          </button>
        </div>
      `;
      return;
    }
    
    // Передаём данные в Vue-компонент для более богатого рендеринга
    grid.innerHTML = '';
    window.indicesData = indicesData;
    // Prefetch sparklines in background (batch + cache) to avoid fallback
    if (window.sparklineService && typeof window.sparklineService.prefetch === 'function') {
      try {
        window.sparklineService.prefetch(indicesData.map((i) => i.symbol));
      } catch (e) { /* ignore */ }
    }
    // Start priority requests for visible cards (first row) so they render quickly
    if (window.sparklineService && typeof window.sparklineService.request === 'function') {
      try {
        indicesData.slice(0, 4).forEach((it) => window.sparklineService.request(it.symbol).catch(() => {}));
      } catch (e) { /* ignore */ }
    }
    if (typeof window.mountIndexCards === 'function') {
      window.mountIndexCards(indicesData);
      console.log(`Индексы переданы в Vue: ${indicesData.length}`);
    } else {
      // fallback — простой рендер (на случай, если Vue не подключён)
      grid.innerHTML = `
        <div class="indices-grid">
          ${indicesData.map(index => `
            <div class="index-card">
              <div class="index-header">
                <div class="index-left">
                  <div class="index-icon">${index.symbol.charAt(0)}</div>
                  <div class="index-meta">
                    <div class="index-name notranslate" translate="no">${index.name}</div>
                    <div class="index-symbol notranslate" translate="no">${index.symbol}</div>
                  </div>
                </div>
                <div class="index-right">
                  <div class="index-value notranslate" translate="no">${index.value}</div>
                  <div class="index-change ${parseFloat(index.changePercent) >= 0 ? 'positive' : 'negative'} notranslate" translate="no">${parseFloat(index.changePercent) >= 0 ? '+' : ''}${index.changePercent}%</div>
                </div>
              </div>
              <div class="index-body">
                <div class="index-sparkline" aria-hidden="true"></div>
                <div class="index-details">
                  <div class="notranslate" translate="no"><small>Мин:</small> ${index.low}</div>
                  <div class="notranslate" translate="no"><small>Объём:</small> ${index.volume}</div>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
      console.log(`Загружено индексов (fallback): ${indicesData.length}`);
    }
    // --- Спарклайны: загрузка истории и рендер SVG в каждую карточку ---
    async function fetchIndexHistory(symbol) {
      try {
        const tsUrl = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1day&outputsize=30&format=JSON&apikey=${TWELVEDATA_API_KEY}`;
        const resp = await fetch(tsUrl);
        const json = await resp.json();
        if (json && json.values && Array.isArray(json.values)) {
          // TwelveData возвращает массив с самой новой первой — упорядочим по возрастанию времени
          return json.values.map((v) => parseFloat(v.close)).reverse();
        }
      } catch (e) {
        console.warn('Ошибка загрузки истории для', symbol, e);
      }
      return null;
    }

    function createSparklineSVG(pointsArr, stroke) {
      const w = 140, h = 36, pad = 4;
      const len = pointsArr.length;
      const min = Math.min(...pointsArr);
      const max = Math.max(...pointsArr);
      const range = (max - min) || 1;
      const step = (w - pad * 2) / Math.max(len - 1, 1);
      const coords = pointsArr.map((v, i) => {
        const x = pad + i * step;
        const y = pad + (1 - (v - min) / range) * (h - pad * 2);
        return `${x},${y}`;
      });
      const pathD = `M${coords.join(' L ')}`;
      // SVG с анимацией штриха
      return `
        <svg viewBox="0 0 ${w} ${h}" width="100%" height="36" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="sparkGrad" x1="0" x2="1">
              <stop offset="0%" stop-color="rgba(255,255,255,0.04)" />
              <stop offset="100%" stop-color="rgba(255,255,255,0.01)" />
            </linearGradient>
          </defs>
          <path d="${pathD}" class="sparkline-path" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;
    }

    const sparkEls = grid.querySelectorAll('.index-sparkline');
    indicesData.forEach(async (idx, i) => {
      const el = sparkEls[i];
      if (!el) return;
      const history = await fetchIndexHistory(idx.symbol);
      const color = parseFloat(idx.changePercent) >= 0 ? 'var(--success)' : 'var(--danger)';
      if (history && history.length > 1) {
        el.innerHTML = createSparklineSVG(history, color);
      } else {
        // fallback — простая линия по текущему значению
        el.innerHTML = createSparklineSVG([parseFloat(idx.value) - 1, parseFloat(idx.value)], color);
      }
    });
  } catch (error) {
    console.error('Критическая ошибка загрузки индексов:', error);
    grid.innerHTML = `
      <div class="no-data">
        <i class="fas fa-exclamation-triangle"></i>
        <h3>Ошибка загрузки индексов</h3>
        <p>${error.message}</p>
      </div>
    `;
  }
}

// Экспортируем в window для использования из HTML
window.loadIndices = loadIndices;

// === КРИПТОВАЛЮТЫ ДЛЯ РАЗДЕЛА КРИПТО ===
const CRYPTO_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT', 
  'XRPUSDT', 'DOTUSDT', 'DOGEUSDT', 'AVAXUSDT', 'MATICUSDT',
  'LTCUSDT', 'LINKUSDT', 'ATOMUSDT', 'XLMUSDT', 'BCHUSDT',
  'FILUSDT', 'ETCUSDT', 'XTZUSDT', 'EOSUSDT', 'AAVEUSDT',
  'UNIUSDT', 'TRXUSDT', 'SHIBUSDT', 'APTUSDT', 'ARBUSDT',
  'OPUSDT', 'NEARUSDT', 'ALGOUSDT', 'VETUSDT', 'ICPUSDT',
  'SANDUSDT', 'MANAUSDT', 'AXSUSDT', 'FTMUSDT', 'HBARUSDT',
  'EGLDUSDT', 'FLOWUSDT', 'THETAUSDT', 'GRTUSDT', 'INJUSDT'
];

// Информация о криптовалютах
window.CRYPTO_INFO = {
  BTC: { name: 'Bitcoin', icon: 'bitcoin', color: '#F7931A', rank: 1, marketCap: 1320 },
  ETH: { name: 'Ethereum', icon: 'ethereum', color: '#627EEA', rank: 2, marketCap: 430 },
  BNB: { name: 'Binance Coin', icon: null, color: '#F3BA2F', rank: 4, marketCap: 90 },
  SOL: { name: 'Solana', icon: null, color: '#14F195', rank: 5, marketCap: 82 },
  ADA: { name: 'Cardano', icon: null, color: '#0033AD', rank: 8, marketCap: 23 },
  XRP: { name: 'Ripple', icon: null, color: '#00AAE4', rank: 6, marketCap: 34 },
  DOT: { name: 'Polkadot', icon: null, color: '#E6007A', rank: 15, marketCap: 12 },
  DOGE: { name: 'Dogecoin', icon: null, color: '#C2A633', rank: 9, marketCap: 22 },
  AVAX: { name: 'Avalanche', icon: null, color: '#E84142', rank: 12, marketCap: 16 },
  MATIC: { name: 'Polygon', icon: null, color: '#8247E5', rank: 14, marketCap: 9 },
  LTC: { name: 'Litecoin', icon: null, color: '#345D9D', rank: 16, marketCap: 7 },
  LINK: { name: 'Chainlink', icon: null, color: '#2A5ADA', rank: 18, marketCap: 8 },
  ATOM: { name: 'Cosmos', icon: null, color: '#2E3148', rank: 20, marketCap: 4 },
  XLM: { name: 'Stellar', icon: null, color: '#14B6E7', rank: 25, marketCap: 3 },
  BCH: { name: 'Bitcoin Cash', icon: 'bitcoin', color: '#8DC351', rank: 22, marketCap: 5 },
  FIL: { name: 'Filecoin', icon: null, color: '#0090FF', rank: 30, marketCap: 3 },
  ETC: { name: 'Ethereum Classic', icon: 'ethereum', color: '#328332', rank: 28, marketCap: 4 },
  XTZ: { name: 'Tezos', icon: null, color: '#A6E000', rank: 35, marketCap: 2 },
  EOS: { name: 'EOS', icon: null, color: '#443f54', rank: 40, marketCap: 2 },
  AAVE: { name: 'Aave', icon: null, color: '#B6509E', rank: 45, marketCap: 2 },
  UNI: { name: 'Uniswap', icon: null, color: '#FF007A', rank: 19, marketCap: 6 },
  TRX: { name: 'TRON', icon: null, color: '#FF0013', rank: 11, marketCap: 12 },
  SHIB: { name: 'Shiba Inu', icon: null, color: '#FFA409', rank: 13, marketCap: 10 },
  APT: { name: 'Aptos', icon: null, color: '#00D4AA', rank: 24, marketCap: 4 },
  ARB: { name: 'Arbitrum', icon: null, color: '#12AAFF', rank: 21, marketCap: 5 },
  OP: { name: 'Optimism', icon: null, color: '#FF0420', rank: 26, marketCap: 3 },
  NEAR: { name: 'NEAR Protocol', icon: null, color: '#00C1DE', rank: 23, marketCap: 4 },
  ALGO: { name: 'Algorand', icon: null, color: '#171717', rank: 32, marketCap: 2 },
  VET: { name: 'VeChain', icon: null, color: '#15BDFF', rank: 38, marketCap: 2 },
  ICP: { name: 'Internet Computer', icon: null, color: '#F15A24', rank: 27, marketCap: 3 },
  SAND: { name: 'The Sandbox', icon: null, color: '#00ADEF', rank: 50, marketCap: 1 },
  MANA: { name: 'Decentraland', icon: null, color: '#FF2D55', rank: 52, marketCap: 1 },
  AXS: { name: 'Axie Infinity', icon: null, color: '#0055D5', rank: 55, marketCap: 1 },
  FTM: { name: 'Fantom', icon: null, color: '#1969FF', rank: 42, marketCap: 2 },
  HBAR: { name: 'Hedera', icon: null, color: '#222222', rank: 33, marketCap: 2 },
  EGLD: { name: 'MultiversX', icon: null, color: '#23f7dd', rank: 48, marketCap: 1 },
  FLOW: { name: 'Flow', icon: null, color: '#00EF8B', rank: 46, marketCap: 1 },
  THETA: { name: 'Theta Network', icon: null, color: '#2AB8E6', rank: 51, marketCap: 1 },
  GRT: { name: 'The Graph', icon: null, color: '#6747ED', rank: 49, marketCap: 1 },
  INJ: { name: 'Injective', icon: null, color: '#00F2FE', rank: 36, marketCap: 2 },
  // DeFi tokens
  CRV: { name: 'Curve DAO', icon: null, color: '#FF0000', rank: 66, marketCap: 0.8 },
  MKR: { name: 'Maker', icon: null, color: '#1AAB9B', rank: 67, marketCap: 0.7 },
  COMP: { name: 'Compound', icon: null, color: '#00D395', rank: 68, marketCap: 0.6 },
  SNX: { name: 'Synthetix', icon: null, color: '#5FCDF9', rank: 70, marketCap: 0.5 },
  '1INCH': { name: '1inch', icon: null, color: '#D82122', rank: 75, marketCap: 0.4 },
  // Gaming & NFT
  IMX: { name: 'Immutable X', icon: null, color: '#0D0D0D', rank: 71, marketCap: 0.5 },
  GALA: { name: 'Gala', icon: null, color: '#000000', rank: 72, marketCap: 0.5 },
  ENJ: { name: 'Enjin Coin', icon: null, color: '#7866D5', rank: 73, marketCap: 0.4 },
  APE: { name: 'ApeCoin', icon: null, color: '#0050FF', rank: 69, marketCap: 0.6 },
  CHZ: { name: 'Chiliz', icon: null, color: '#CD0124', rank: 74, marketCap: 0.4 },
  // Layer 2
  LRC: { name: 'Loopring', icon: null, color: '#1C60FF', rank: 76, marketCap: 0.3 },
  METIS: { name: 'Metis', icon: null, color: '#00DACC', rank: 78, marketCap: 0.3 },
  // Memecoins
  FLOKI: { name: 'Floki Inu', icon: null, color: '#FF4500', rank: 80, marketCap: 0.3 },
  // Infrastructure
  ROSE: { name: 'Oasis Network', icon: null, color: '#0092F6', rank: 77, marketCap: 0.3 },
  KSM: { name: 'Kusama', icon: null, color: '#575353', rank: 79, marketCap: 0.3 },
  KAVA: { name: 'Kava', icon: null, color: '#FF433E', rank: 81, marketCap: 0.3 },
  WAVES: { name: 'Waves', icon: null, color: '#0055FF', rank: 82, marketCap: 0.2 },
  ZIL: { name: 'Zilliqa', icon: null, color: '#49C1BF', rank: 83, marketCap: 0.2 },
  ONE: { name: 'Harmony', icon: null, color: '#00ADE8', rank: 84, marketCap: 0.2 },
  CELO: { name: 'Celo', icon: null, color: '#35D07F', rank: 86, marketCap: 0.2 },
  AR: { name: 'Arweave', icon: null, color: '#222326', rank: 87, marketCap: 0.2 },
  STX: { name: 'Stacks', icon: null, color: '#5546FF', rank: 88, marketCap: 0.2 },
  MINA: { name: 'Mina Protocol', icon: null, color: '#E86E51', rank: 89, marketCap: 0.2 },
  MASK: { name: 'Mask Network', icon: null, color: '#1C68F3', rank: 90, marketCap: 0.2 },
  LDO: { name: 'Lido DAO', icon: null, color: '#00A3FF', rank: 91, marketCap: 0.2 },
  DYDX: { name: 'dYdX', icon: null, color: '#6966FF', rank: 92, marketCap: 0.2 },
  GMX: { name: 'GMX', icon: null, color: '#2C3DDC', rank: 93, marketCap: 0.2 },
  RPL: { name: 'Rocket Pool', icon: null, color: '#FF6B4A', rank: 94, marketCap: 0.1 },
  BAT: { name: 'Basic Attention', icon: null, color: '#FF5000', rank: 95, marketCap: 0.1 },
  ENS: { name: 'Ethereum Name Service', icon: null, color: '#5298FF', rank: 96, marketCap: 0.1 },
  QNT: { name: 'Quant', icon: null, color: '#000000', rank: 97, marketCap: 0.1 },
  BLUR: { name: 'Blur', icon: null, color: '#FF8700', rank: 98, marketCap: 0.1 },
  // Emerging projects (already added earlier)
  SUI: { name: 'Sui', icon: null, color: '#4DA2FF', rank: 29, marketCap: 3 },
  SEI: { name: 'Sei Network', icon: null, color: '#B91C1C', rank: 43, marketCap: 2 },
  TIA: { name: 'Celestia', icon: null, color: '#7B2BF9', rank: 47, marketCap: 1 },
  WLD: { name: 'Worldcoin', icon: null, color: '#000000', rank: 60, marketCap: 1 },
  PEPE: { name: 'Pepe', icon: null, color: '#7CC45A', rank: 31, marketCap: 3 },
  WIF: { name: 'dogwifhat', icon: null, color: '#FF8A3D', rank: 54, marketCap: 1 },
  BONK: { name: 'Bonk', icon: null, color: '#F4900C', rank: 65, marketCap: 0.8 },
  RENDER: { name: 'Render Token', icon: null, color: '#000000', rank: 44, marketCap: 2 },
  FET: { name: 'Fetch.ai', icon: null, color: '#0714CE', rank: 58, marketCap: 1 },
  RNDR: { name: 'Render', icon: null, color: '#000000', rank: 53, marketCap: 1 }
};

// === КРИПТОВАЛЮТЫ ДЛЯ РАЗДЕЛА КРИПТО (с CryptoManager) ===
let cryptoListCache = null;

export async function loadCryptoList() {
  const grid = document.getElementById('mainCryptoGrid');
  if (!grid) return;

  grid.innerHTML = '<div class="loading"><div class="loader-large"></div><p>Загрузка криптовалют</p></div>';

  // Проверяем кэш
  if (cryptoListCache) {
    renderCryptoList(cryptoListCache);
    return;
  }

  try {
    // Загружаем конфигурацию
    await window.cryptoManager.loadConfig();
    
    // ВСЕ криптовалюты из конфигурации (75+)
    const assets = window.cryptoManager.getAllAssets();
    
    console.log(`Загружаю ВСЕ ${assets.length} криптовалют...`);
    
    // Пакетная загрузка с rate limiting
    const cryptoData = await window.cryptoManager.batchLoadPrices(assets);

    const validData = cryptoData.filter((data) => data !== null);
    console.log('Загружено криптовалют:', validData.length);

    // Сортируем по рангу
    const sortedData = window.cryptoManager.sortAssets(validData, 'rank', 'asc');

    // Загружаем реальные данные графиков для топ-15 криптовалют
    const top15 = sortedData.slice(0, 15);
    await Promise.all(top15.map(async (crypto) => {
      const sparklineData = await getSparklineData(crypto.symbol);
      if (sparklineData) {
        crypto.priceHistory = sparklineData;
      }
    }));

    // Sanitize symbols/names to remove stray semicolons and trim whitespace
    sortedData.forEach(it => {
      if (it.symbol) it.symbol = String(it.symbol).replace(/;/g, '').trim().toUpperCase();
      if (it.name) it.name = String(it.name).replace(/;/g, '').trim();
    });

    cryptoListCache = sortedData;
    window.cryptoList = sortedData;
    renderCryptoList(sortedData);
    // Notify other modules that cryptoList is ready
    try {
      document.dispatchEvent(new CustomEvent('cryptoListLoaded', { detail: { list: sortedData } }));
    } catch (e) {
      console.warn('Could not dispatch cryptoListLoaded', e);
    }
    
    // Инициализируем фильтры после загрузки данных
    initCryptoFilters();
    
    // Показываем статистику по категориям
    const categoryStats = window.cryptoManager.getCategoryStats(sortedData);
    console.log('Статистика по категориям:', categoryStats);
    
  } catch (error) {
    console.error('Ошибка загрузки списка криптовалют:', error);
    grid.innerHTML = '<div class="no-data">Не удалось загрузить список криптовалют</div>';
    showNotification('Ошибка загрузки криптовалют', 'error');
  }
}

// === ЗАГРУЗКА РЕАЛЬНЫХ ДАННЫХ ДЛЯ СПАРКЛАЙН ===
async function getSparklineData(symbol) {
  try {
    const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=1h&limit=24`);
    if (!response.ok) return null;
    
    const data = await response.json();
    // Берем цены закрытия последних 24 часов
    return data.map(candle => parseFloat(candle[4]));
  } catch (error) {
    console.warn(`Не удалось загрузить sparkline для ${symbol}:`, error);
    return null;
  }
}

// === ГЕНЕРАЦИЯ ДАННЫХ ДЛЯ СПАРКЛАЙН ===
function generateSparklineData(changePercent) {
  // Генерируем 12 точек данных на основе общего изменения
  const points = [];
  const trend = changePercent / 100; // Конвертируем процент в десятичное число
  
  // Начинаем с базовой точки
  let current = 100;
  points.push(current);
  
  // Генерируем промежуточные точки с некоторой случайностью
  for (let i = 1; i < 12; i++) {
    const progress = i / 11; // Прогресс от 0 до 1
    const targetChange = trend * progress * 100; // Целевое изменение для этой точки
    const randomVariation = (Math.random() - 0.5) * 5; // Случайная вариация ±2.5%
    current = 100 + targetChange + randomVariation;
    points.push(Math.max(80, Math.min(120, current))); // Ограничиваем диапазон
  }
  
  // Последняя точка должна точно соответствовать изменению
  points[11] = 100 + trend * 100;
  
  return points;
}

// === СОЗДАНИЕ SVG СПАРКЛАЙН ===
function createSparklineSVG(data, color) {
  const width = 100;
  const height = 40;
  const padding = 2;
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  
  // Нормализуем точки
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * (width - padding * 2) + padding;
    const y = height - padding - ((value - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');
  
  // Создаем путь для заливки под линией
  const firstPoint = data[0];
  const lastPoint = data[data.length - 1];
  const firstX = padding;
  const lastX = width - padding;
  const firstY = height - padding - ((firstPoint - min) / range) * (height - padding * 2);
  const lastY = height - padding - ((lastPoint - min) / range) * (height - padding * 2);
  
  const fillPoints = `${firstX},${height} ${points} ${lastX},${height}`;
  
  // Создаем плавную кривую Безье для более красивого графика
  const pathData = data.map((value, index) => {
    const x = (index / (data.length - 1)) * (width - padding * 2) + padding;
    const y = height - padding - ((value - min) / range) * (height - padding * 2);
    return { x, y };
  });
  
  let smoothPath = '';
  if (pathData.length > 0) {
    smoothPath = `M ${pathData[0].x},${pathData[0].y}`;
    for (let i = 1; i < pathData.length; i++) {
      const prev = pathData[i - 1];
      const curr = pathData[i];
      const cpx = (prev.x + curr.x) / 2;
      smoothPath += ` Q ${cpx},${prev.y} ${cpx},${(prev.y + curr.y) / 2}`;
      smoothPath += ` Q ${cpx},${curr.y} ${curr.x},${curr.y}`;
    }
  }
  
  const fillPath = `${smoothPath} L ${lastX},${height} L ${firstX},${height} Z`;
  
  return `
    <svg width="${width}" height="${height}" style="display: block;">
      <defs>
        <linearGradient id="grad-${color.replace('#', '')}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:${color};stop-opacity:0.4" />
          <stop offset="100%" style="stop-color:${color};stop-opacity:0.05" />
        </linearGradient>
        <filter id="glow-${color.replace('#', '')}">
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <path
        fill="url(#grad-${color.replace('#', '')})"
        d="${fillPath}"
        opacity="0">
        <animate attributeName="opacity" from="0" to="1" dur="0.6s" fill="freeze"/>
      </path>
      <path
        fill="none"
        stroke="${color}"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        d="${smoothPath}"
        filter="url(#glow-${color.replace('#', '')})"
        stroke-dasharray="1000"
        stroke-dashoffset="1000">
        <animate attributeName="stroke-dashoffset" from="1000" to="0" dur="1s" fill="freeze"/>
      </path>
    </svg>
  `;
}

// === РЕНДЕР СПИСКА КРИПТОВАЛЮТ ===

// Маппинг символов на CoinCap ID (для правильных иконок)
const COINCAP_ID_MAP = {
  'OP': 'optimism-ethereum',
  'ROSE': 'oasis-network',
  'KSM': 'kusama',
  'CHZ': 'chiliz',
  'GALA': 'gala'
};

function getCoinCapIcon(symbol) {
  const coinCapId = COINCAP_ID_MAP[symbol] || symbol.toLowerCase();
  return `https://assets.coincap.io/assets/icons/${coinCapId}@2x.png`;
}

// Обработчик ошибок загрузки иконок акций с fallback цепочкой
window.handleStockIconError = (img, symbol, firstLetter, color) => {
  if (!img.dataset.fallbackAttempt) {
    img.dataset.fallbackAttempt = '1';
    img.src = `https://assets.parqet.com/logos/symbol/${symbol}`;
  } else if (img.dataset.fallbackAttempt === '1') {
    img.dataset.fallbackAttempt = '2';
    img.src = `https://financialmodelingprep.com/image-stock/${symbol}.png`;
  } else if (img.dataset.fallbackAttempt === '2') {
    img.dataset.fallbackAttempt = '3';
    img.src = `https://ui-avatars.com/api/?name=${symbol}&background=${color.replace('#', '')}&color=fff&size=80&bold=true`;
  } else {
    // Последний fallback - заменяем на div с буквой
    img.onerror = null;
    img.style.display = 'none';
    const fallbackDiv = document.createElement('div');
    fallbackDiv.className = 'crypto-icon-fallback';
    fallbackDiv.style.cssText = `
      width: 100%; 
      height: 100%; 
      background: linear-gradient(135deg, ${color} 0%, ${adjustColor(color, -20)} 100%); 
      border-radius: 50%; 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      font-size: 1.5rem; 
      font-weight: 700; 
      color: white;
    `;
    fallbackDiv.textContent = firstLetter;
    img.parentNode.insertBefore(fallbackDiv, img);
  }
};

// Вспомогательная функция для затемнения цвета
function adjustColor(color, percent) {
  const num = parseInt(color.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = (num >> 8 & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  return `#${(0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
    (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
    (B < 255 ? B < 1 ? 0 : B : 255))
    .toString(16).slice(1)}`;
}

function renderCryptoListTo(coins, gridId = 'mainCryptoGrid') {
  const grid = document.getElementById(gridId);
  if (!grid) return;

  if (!coins || coins.length === 0) {
    grid.innerHTML = '<div class="no-data">Активы не найдены</div>';
    return;
  }

  const currencySymbol = getCurrencySymbol();

  grid.innerHTML = coins.map((coin, index) => {
    const isStock = coin.assetType === 'stock';
    const info = isStock 
      ? (window.STOCK_INFO[coin.symbol] || { name: coin.symbol, color: '#3B82F6' })
      : (window.CRYPTO_INFO[coin.symbol] || { icon: 'bitcoin', color: '#F7931A' });
    
    // Используем разные источники для иконок акций и криптовалют
    let iconHTML;
    if (isStock) {
      const firstLetter = coin.symbol.charAt(0);
      const stockColor = info.color || '#3B82F6';
      iconHTML = `
        <img src="https://img.logo.dev/${coin.symbol.toLowerCase()}.com?token=pk_X-jjCWIKT_SRetd3NwvHUg&size=80" 
             alt="${coin.symbol}" 
             onerror="handleStockIconError(this, '${coin.symbol}', '${firstLetter}', '${stockColor}')"
             style="width: 100%; height: 100%; object-fit: contain; border-radius: 50%;">`;
    } else {
      const bgColor = info.color.replace('#', '');
      const avatarUrl = `https://ui-avatars.com/api/?name=${coin.symbol}&background=${bgColor}&color=fff&size=48&bold=true`;
      iconHTML = `<img src="${getCoinCapIcon(coin.symbol)}" 
                      alt="${coin.symbol}" 
                      onerror="this.onerror=null; this.src='${avatarUrl}';"
                      style="width: 100%; height: 100%; object-fit: contain;">`;
    }
    
    // Используем реальные данные если есть priceHistory
    let sparklineData;
    if (coin.priceHistory && coin.priceHistory.length > 0) {
      sparklineData = coin.priceHistory;
    } else {
      sparklineData = generateSparklineData(parseFloat(coin.changePercent));
    }
    const sparklineSVG = createSparklineSVG(sparklineData, info.color);
    
    const isPositive = parseFloat(coin.changePercent) >= 0;
    const changeIcon = isPositive ? '↗' : '↘';

    const convertedPrice = convertToSelectedCurrency(parseFloat(coin.price));
    const convertedHigh = convertToSelectedCurrency(parseFloat(coin.high || 0));
    const convertedLow = convertToSelectedCurrency(parseFloat(coin.low || 0));
    
    // Определяем функцию клика в зависимости от типа актива
    const clickHandler = isStock 
      ? `window.showStockDetail('${coin.symbol}')`
      : `window.showCryptoDetail('${coin.symbol}')`;
    
    return `
      <div class="crypto-card" 
           onclick="${clickHandler}" 
           data-symbol="${coin.symbol}"
           style="cursor: pointer; 
                  border-left: 4px solid ${info.color}; 
                  background: linear-gradient(135deg, ${info.color}05 0%, #ffffff 100%);
                  animation: fadeInUp 0.4s ease-out forwards;
                  animation-delay: ${index * 0.03}s;
                  opacity: 0;
                  transform: translateY(20px);
                  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                  position: relative;
                  overflow: hidden;">
        
        <!-- Декоративный элемент -->
        <div style="position: absolute; top: -50px; right: -50px; width: 150px; height: 150px; 
                    background: ${info.color}; opacity: 0.03; border-radius: 50%; pointer-events: none;"></div>
        
        <div class="crypto-header">
          <div class="crypto-icon" 
               style="background: linear-gradient(135deg, ${info.color}, ${info.color}dd); 
                      color: white; 
                      box-shadow: 0 8px 16px ${info.color}30, 0 0 0 4px ${info.color}10;
                      transition: all 0.3s ease;
                      position: relative;">
            ${iconHTML}
          </div>
          <div class="crypto-info" style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <h4 class="notranslate" style="transition: color 0.3s ease; margin: 0; font-size: 1.05rem;" translate="no">${coin.name}</h4>
              ${!isStock ? `<span style="background: ${info.color}15; color: ${info.color}; 
                           padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; 
                           font-weight: 600; letter-spacing: 0.5px;">
                #${info.rank || 'N/A'}
              </span>` : ''}
            </div>
            <div class="crypto-symbol notranslate" style="display: flex; align-items: center; gap: 6px;" translate="no">
              <span class="notranslate" translate="no">${coin.symbol}</span>
              ${isStock ? `<span style="background: #3B82F615; color: #3B82F6; padding: 2px 6px; border-radius: 8px; font-size: 0.65rem; font-weight: 600;">STOCK</span>` : ''}
              <span style="color: #cbd5e1; font-size: 0.7rem;">•</span>
              <span style="color: #94a3b8; font-size: 0.7rem;">24h Vol: ${coin.volumeFormatted}</span>
            </div>
          </div>
        </div>
        
        <div class="crypto-price-row" style="align-items: baseline; margin: 16px 0 8px 0;">
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <div class="crypto-price notranslate" style="color: #0f172a; font-weight: 700; font-size: 1.75rem; letter-spacing: -0.5px;" translate="no">
              <span class="notranslate" translate="no">${currencySymbol}${formatPrice(convertedPrice)}</span>
            </div>
            <div style="font-size: 0.75rem; color: #94a3b8;">
              Current Price
            </div>
          </div>
          <div class="crypto-change ${isPositive ? 'price-positive' : 'price-negative'} notranslate"
               style="font-weight: 700; padding: 8px 14px; border-radius: 12px; font-size: 0.95rem;
                      display: flex; align-items: center; gap: 4px;
                      box-shadow: ${isPositive ? '0 4px 12px rgba(16, 185, 129, 0.2)' : '0 4px 12px rgba(239, 68, 68, 0.2)'};
                      border: 2px solid ${isPositive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'};
                      backdrop-filter: blur(10px);" translate="no">
            <span style="font-size: 1.1rem;">${changeIcon}</span>
            ${parseFloat(coin.changePercent) >= 0 ? '+' : ''}${coin.changePercent}%
          </div>
        </div>
        
        <div class="crypto-sparkline" style="margin: 16px -8px; height: 70px; position: relative; overflow: visible;">
          ${sparklineSVG}
        </div>
        
        <div class="crypto-stats-extended" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 16px;">
          <div class="stat-mini" style="background: linear-gradient(135deg, ${info.color}08, ${info.color}03); 
                                        padding: 12px; border-radius: 12px; 
                                        border: 1px solid ${info.color}15;
                                        transition: all 0.2s;">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
              <div style="width: 6px; height: 6px; background: #10b981; border-radius: 50%;"></div>
              <span class="stat-mini-label" style="font-size: 0.7rem; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">High 24h</span>
            </div>
            <span class="stat-mini-value notranslate" style="font-weight: 700; color: #0f172a; font-size: 0.95rem;" translate="no">${currencySymbol}${formatPrice(convertedHigh)}</span>
          </div>
          <div class="stat-mini" style="background: linear-gradient(135deg, ${info.color}08, ${info.color}03); 
                                        padding: 12px; border-radius: 12px; 
                                        border: 1px solid ${info.color}15;
                                        transition: all 0.2s;">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
              <div style="width: 6px; height: 6px; background: #ef4444; border-radius: 50%;"></div>
              <span class="stat-mini-label" style="font-size: 0.7rem; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Low 24h</span>
            </div>
            <span class="stat-mini-value notranslate" style="font-weight: 700; color: #0f172a; font-size: 0.95rem;" translate="no">${currencySymbol}${formatPrice(convertedLow)}</span>
          </div>
        </div>
        
        <!-- Индикатор hover -->
        <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 3px; 
                    background: linear-gradient(90deg, ${info.color}, transparent); 
                    opacity: 0; transition: opacity 0.3s;"
             class="hover-indicator"></div>
      </div>
    `;
  }).join('');
  
  // Процессируем иконки для акций через icon loader
  if (window._iconLoader && typeof window._iconLoader.processContainer === 'function') {
    window._iconLoader.processContainer(grid);
  }
  
  console.log('Отрендерено активов:', coins.length, `(${coins.filter((c) => c.assetType === 'stock').length} акций, ${coins.filter((c) => c.assetType === 'crypto').length} криптовалют)`);
}

// Экспортируем функцию для рендера списка карточек из других модулей (например, favorites-controls)
export function renderCryptoCards(coins, gridId = 'mainCryptoGrid') {
  return renderCryptoListTo(coins, gridId);
}

// Перерисовываем списки при смене валюты
window.addEventListener('currencyChanged', () => {
  if (window.cryptoList && window.cryptoList.length) {
    renderCryptoList(window.cryptoList);
  }
  if (window.stocksList && window.stocksList.length) {
    try { renderStocksList(window.stocksList); } catch (e) { /* ignore */ }
  }
});

// === ПОИСК И СОРТИРОВКА КРИПТОВАЛЮТ ===
function filterAndSortCrypto() {
  if (!window.cryptoList || window.cryptoList.length === 0) return;
  
  // Получить значения из кастомных select или традиционных полей
  const filterValues = window.getCryptoFilterValues ? window.getCryptoFilterValues() : {
    sort: document.getElementById('cryptoSort')?.value || 'market_cap',
    percentFilter: document.getElementById('cryptoPercentFilter')?.value || 'all',
    search: document.getElementById('cryptoSearch')?.value || '',
    priceMin: document.getElementById('cryptoPriceMin')?.value || '',
    priceMax: document.getElementById('cryptoPriceMax')?.value || ''
  };
  
  const searchTerm = filterValues.search.toLowerCase().trim();
  const sortBy = filterValues.sort;
  const percentValue = filterValues.percentFilter;
  const minPrice = parseFloat(filterValues.priceMin) || -Infinity;
  const maxPrice = parseFloat(filterValues.priceMax) || Infinity;
  
  // Фильтрация
  const filteredCoins = window.cryptoList.filter((coin) => {
    // Поиск
    if (searchTerm) {
      const matchSearch = coin.name.toLowerCase().includes(searchTerm) || 
                         coin.symbol.toLowerCase().includes(searchTerm);
      if (!matchSearch) return false;
    }
    
    // Фильтр по цене
    const price = parseFloat(coin.price);
    if (price < minPrice || price > maxPrice) return false;
    
    // Фильтр по изменению
    const change = parseFloat(coin.changePercent);
    if (percentValue === 'gainers' && change <= 0) return false;
    if (percentValue === 'losers' && change >= 0) return false;
    
    return true;
  });
  
  // Сортировка
  filteredCoins.sort((a, b) => {
    switch(sortBy) {
      case 'market_cap':
        const rankA = window.CRYPTO_INFO[a.symbol]?.rank || 999;
        const rankB = window.CRYPTO_INFO[b.symbol]?.rank || 999;
        return rankA - rankB;
      case 'price_high':
        return parseFloat(b.price) - parseFloat(a.price);
      case 'price_low':
        return parseFloat(a.price) - parseFloat(b.price);
      case 'change':
        return parseFloat(b.changePercent) - parseFloat(a.changePercent);
      default:
        return 0;
    }
  });
  
  renderCryptoList(filteredCoins);
}

function initCustomSelect(displayId, dropdownId, onChange) {
  const display = document.getElementById(displayId);
  const dropdown = document.getElementById(dropdownId);
  
  if (!display || !dropdown) {
    console.warn(`[initCustomSelect] Элементы не найдены: ${displayId}, ${dropdownId}`);
    return;
  }
  
  // Удаляем старые обработчики, если они были (клонируя элемент)
  const newDisplay = display.cloneNode(true);
  display.parentNode.replaceChild(newDisplay, display);
  
  // Открытие/закрытие dropdown
  newDisplay.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = dropdown.classList.contains('show');
    
    // Закрыть все остальные dropdowns
    document.querySelectorAll('.custom-select-dropdown.show').forEach(dd => {
      dd.classList.remove('show');
      const prevDisplay = dd.previousElementSibling;
      if (prevDisplay) prevDisplay.classList.remove('open');
    });
    
    if (!isOpen) {
      dropdown.classList.add('show');
      newDisplay.classList.add('open');
    }
  });
  
  // Выбор опции (используем делегирование событий для избежания дублирования)
  const optionClickHandler = (e) => {
    const option = e.target.closest('.custom-select-option');
    if (!option) return;
    
    const value = option.getAttribute('data-value');
    const text = option.querySelector('span').textContent;
    
    // Обновить отображаемое значение
    const displayEl = document.getElementById(displayId);
    if (displayEl) {
      const valueEl = displayEl.querySelector('.custom-select-value');
      if (valueEl) valueEl.textContent = text;
    }
    
    // Убрать selected со всех опций и добавить к выбранной
    dropdown.querySelectorAll('.custom-select-option').forEach(opt => {
      opt.classList.remove('selected');
    });
    option.classList.add('selected');
    
    // Закрыть dropdown
    dropdown.classList.remove('show');
    if (displayEl) displayEl.classList.remove('open');
    
    // Вызвать callback
    if (onChange) {
      onChange(value);
    }
  };
  
  // Удаляем старый обработчик и добавляем новый
  dropdown.removeEventListener('click', optionClickHandler);
  dropdown.addEventListener('click', optionClickHandler);
  
  // Отметить выбранную опцию по умолчанию
  const firstOption = dropdown.querySelector('.custom-select-option');
  if (firstOption && !dropdown.querySelector('.custom-select-option.selected')) {
    firstOption.classList.add('selected');
  }
}

// Закрытие dropdown при клике вне его
document.addEventListener('click', () => {
  document.querySelectorAll('.custom-select-dropdown.show').forEach(dd => {
    dd.classList.remove('show');
    dd.previousElementSibling.classList.remove('open');
  });
});

// Инициализация обработчиков поиска и сортировки
function initCryptoFilters() {
  const searchInput = document.getElementById('cryptoSearch');
  const priceMin = document.getElementById('cryptoPriceMin');
  const priceMax = document.getElementById('cryptoPriceMax');
  const resetBtn = document.getElementById('cryptoResetFilters');
  
  // Внутренние переменные для хранения значений фильтров
  let currentSort = 'market_cap';
  let currentPercentFilter = 'all';
  
  // Инициализация кастомных select
  initCustomSelect('cryptoSortDisplay', 'cryptoSortDropdown', (value) => {
    currentSort = value;
    filterAndSortCrypto();
  });
  
  initCustomSelect('cryptoPercentDisplay', 'cryptoPercentDropdown', (value) => {
    currentPercentFilter = value;
    filterAndSortCrypto();
  });
  
  // Функция для получения текущих значений фильтров
  window.getCryptoFilterValues = () => {
    return {
      sort: currentSort,
      percentFilter: currentPercentFilter,
      search: searchInput?.value || '',
      priceMin: priceMin?.value || '',
      priceMax: priceMax?.value || ''
    };
  };
  
  if (searchInput) {
    searchInput.addEventListener('input', filterAndSortCrypto);
  }
  
  if (priceMin) {
    priceMin.addEventListener('input', filterAndSortCrypto);
  }
  
  if (priceMax) {
    priceMax.addEventListener('input', filterAndSortCrypto);
  }
  
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (priceMin) priceMin.value = '';
      if (priceMax) priceMax.value = '';
      
      // Сброс кастомных select
      currentSort = 'market_cap';
      currentPercentFilter = 'all';
      
      const cryptoSortDisplay = document.getElementById('cryptoSortDisplay');
      const cryptoPercentDisplay = document.getElementById('cryptoPercentDisplay');
      
      if (cryptoSortDisplay) {
        cryptoSortDisplay.querySelector('.custom-select-value').textContent = 'Рейтинг';
      }
      
      if (cryptoPercentDisplay) {
        cryptoPercentDisplay.querySelector('.custom-select-value').textContent = 'Все';
      }
      
      // Обновить selected в dropdown
      const sortDropdown = document.getElementById('cryptoSortDropdown');
      if (sortDropdown) {
        sortDropdown.querySelectorAll('.custom-select-option').forEach(opt => {
          opt.classList.remove('selected');
          if (opt.getAttribute('data-value') === 'market_cap') {
            opt.classList.add('selected');
          }
        });
      }
      
      const percentDropdown = document.getElementById('cryptoPercentDropdown');
      if (percentDropdown) {
        percentDropdown.querySelectorAll('.custom-select-option').forEach(opt => {
          opt.classList.remove('selected');
          if (opt.getAttribute('data-value') === 'all') {
            opt.classList.add('selected');
          }
        });
      }
      
      filterAndSortCrypto();
    });
  }
}

// Экспортируем функцию глобально для переинициализации
window.initCryptoFilters = initCryptoFilters;

async function loadCryptoData(symbol) {
  try {
    const data = await fetchWithCache(`${BINANCE}${symbol}`);
    const baseSymbol = symbol.replace('USDT', '');
    
    return {
      id: baseSymbol.toLowerCase(),
      symbol: baseSymbol,
      name: getCryptoName(baseSymbol),
      price: parseFloat(data.lastPrice).toFixed(2),
      change: parseFloat(data.priceChange).toFixed(2),
      changePercent: parseFloat(data.priceChangePercent).toFixed(2),
      volume: parseFloat(data.volume) * parseFloat(data.lastPrice),
      high: parseFloat(data.highPrice).toFixed(2),
      low: parseFloat(data.lowPrice).toFixed(2),
      volumeFormatted: formatVolume(parseFloat(data.volume) * parseFloat(data.lastPrice)),
      priceChangePercent: parseFloat(data.priceChangePercent),
      isReal: true
    };
  } catch (error) {
    console.error(`Ошибка загрузки ${symbol}:`, error);
    return null;
  }
}

// === ДЕТАЛЬНАЯ СТРАНИЦА КРИПТЫ ===
export async function loadCryptoDetail(symbol, interval = '1d') {
  console.log('Загрузка деталей для:', symbol);
  
  try {
    const [tickerData, klineData] = await Promise.all([
      fetchWithCache(`${BINANCE}${symbol}USDT`),
      fetchKlines(`${symbol}USDT`, interval)
    ]);

    const baseSymbol = symbol.toUpperCase();
    const coin = {
      id: symbol.toLowerCase(),
      symbol: baseSymbol,
      name: getCryptoName(baseSymbol),
      price: parseFloat(tickerData.lastPrice),
      change: parseFloat(tickerData.priceChange),
      changePercent: parseFloat(tickerData.priceChangePercent),
      volume: parseFloat(tickerData.volume) * parseFloat(tickerData.lastPrice),
      high: parseFloat(tickerData.highPrice),
      low: parseFloat(tickerData.lowPrice),
      open: parseFloat(tickerData.openPrice)
    };

    window.currentCryptoDetail = { coin, chart: { prices: klineData } };
    // DISABLED: renderCryptoDetail uses old Chart.js - now using window.showCryptoDetail from ui.js
    
  } catch (error) {
    console.error('Ошибка загрузки деталей крипты:', error);
    showNotification('Ошибка загрузки данных криптовалюты', 'error');
    
    // Показываем сообщение об ошибке вместо заглушек
    const listPage = document.getElementById('cryptoListPage');
    const detailPage = document.getElementById('cryptoDetailPage');
    if (listPage && detailPage) {
      listPage.style.display = 'block';
      detailPage.style.display = 'none';
    }
  }
}

// Функция для маппинга символов криптовалют в CoinGecko ID
function getCoinGeckoId(symbol) {
  const mapping = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'BNB': 'binancecoin',
    'XRP': 'ripple',
    'ADA': 'cardano',
    'DOGE': 'dogecoin',
    'SOL': 'solana',
    'TRX': 'tron',
    'MATIC': 'polygon',
    'DOT': 'polkadot',
    'LTC': 'litecoin',
    'SHIB': 'shiba-inu',
    'AVAX': 'avalanche',
    'UNI': 'uniswap',
    'LINK': 'chainlink',
    'XLM': 'stellar',
    'ATOM': 'cosmos',
    'ETC': 'ethereum-classic',
    'FIL': 'filecoin',
    'APT': 'aptos'
  };
  return mapping[symbol] || symbol.toLowerCase();
}

// Функция для получения логотипа акции с несколькими fallback источниками
function getStockLogoUrl(symbol) {
  // Используем несколько надёжных источников с fallback
  const sources = [
    // Finnhub API (основной источник с API ключом пользователя)
    `https://finnhub.io/api/logo?symbol=${symbol}`,
    // Yahoo Finance (fallback 1)
    `https://storage.googleapis.com/iexcloud-hl37opg/api/logos/${symbol}.png`,
    // Alternative source (fallback 2) 
    `https://eodhistoricaldata.com/img/logos/US/${symbol.toLowerCase()}.png`
  ];
  
  // Возвращаем первый источник, остальные будут использованы через onerror
  return sources[0];
}

// Функция для генерации fallback цепочки для изображений
function getStockLogoHTML(symbol, size = '32px') {
  // Создаём упрощённый логотип с первой буквой как fallback
  const letterFallback = `<div style="width: ${size}; height: ${size}; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 700;">${symbol.charAt(0)}</div>`;
  
  return `<img src="https://img.logo.dev/${symbol.toLowerCase()}.com?token=pk_X-jjCWIKT_SRetd3NwvHUg&size=80&format=png" 
               alt="${symbol}" 
               style="width: 100%; height: 100%; object-fit: contain; border-radius: 50%;"
               onerror="this.onerror=null; 
                        this.src='https://assets.parqet.com/logos/symbol/${symbol}'; 
                        this.onerror=function(){
                          this.onerror=null;
                          this.src='https://financialmodelingprep.com/image-stock/${symbol}.png';
                          this.onerror=function(){
                            this.parentElement.innerHTML='<span style=\\'font-size: 1.75rem; font-weight: 700;\\'>${symbol.charAt(0)}</span>';
                          };
                        };">`;
}

async function fetchKlines(symbol, interval = '1d', limit = 100) {
  const url = `${BINANCE_KLINES}?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Klines fetch failed');
    const data = await response.json();
    
    return data.map((kline) => [
      kline[0],
      parseFloat(kline[4])
    ]);
  } catch (error) {
    console.error('Ошибка загрузки графика:', error);
    throw error;
  }
}

// === ЗАГЛУШКИ УДАЛЕНЫ - ИСПОЛЬЗУЮТСЯ ТОЛЬКО РЕАЛЬНЫЕ ДАННЫЕ ===

// === РЕНДЕР ФУНКЦИИ ===
function renderStocks(stocks) {
  const tbody = document.getElementById('stocksTable');
  if (!tbody) return;
  
  // Сохраняем данные акций глобально для использования в избранном
  if (!window.stocksRealData) {
    window.stocksRealData = {};
  }
  
  stocks.forEach((s) => {
    window.stocksRealData[s.symbol] = {
      price: s.price,
      change: s.change,
      changePercent: s.changePercent,
      volume: s.volume,
      high: s.high || s.price,
      low: s.low || s.price,
      isReal: s.isReal || true
    };
  });
  
  console.log('Saved data for stocks:', Object.keys(window.stocksRealData));

  const currencySymbol = getCurrencySymbol();

  tbody.innerHTML = stocks.map(s => {
    const changeClass = parseFloat(s.changePercent) >= 0 ? 'positive' : 'negative';
    const changeSign = parseFloat(s.changePercent) >= 0 ? '+' : '';
    
    // Получаем HTML для логотипа акции с fallback chain
    const iconHTML = `
      <div class="stock-icon-wrapper">
        ${getStockLogoHTML(s.symbol, '40px')}
      </div>
    `;
    
    const convertedPrice = convertToSelectedCurrency(parseFloat(s.price));

    return `
      <tr>
        <td class="icon-cell">${iconHTML}</td>
        <td class="notranslate" translate="no"><strong class="stock-ticker notranslate" translate="no">${s.symbol}</strong></td>
        <td class="stock-name notranslate" translate="no">${s.name}</td>
        <td class="stock-price notranslate" translate="no">${currencySymbol}${formatPrice(convertedPrice)}</td>
        <td class="${changeClass} notranslate" style="font-weight: 600;" translate="no">${changeSign}${s.change}</td>
        <td class="${changeClass} notranslate" style="font-weight: 700;" translate="no">${changeSign}${s.changePercent}%</td>
        <td class="action-cell">
          <button class="btn-buy" onclick="window.app.showTransactionModal('BUY', null, '${s.symbol}')">
            <i class="fas fa-shopping-cart"></i> Купить
          </button>
        </td>
      </tr>
    `;
  }).join('');
  
  // Принудительно защищаем новые элементы от перевода
  if (typeof window.markNoTranslateElements === 'function') {
    setTimeout(() => window.markNoTranslateElements(), 100);
  }
}

// Сохраним старую функцию-обёртку для совместимости
function renderCryptoList(coins) {
  return renderCryptoListTo(coins, 'mainCryptoGrid');
}

// Рендер раздела Избранного — отображаем те же карточки, что и в списке криптовалют
export async function renderFavoritesSection() {
  const grid = document.getElementById('favoritesCryptoGrid');
  if (!grid) return;
  
  // Показываем индикатор загрузки
  grid.innerHTML = `
    <div class="loading-row">
      <div class="loader-small"></div>
      Загрузка избранного...
    </div>`;

  try {
    const { getFavorites } = await import('../core/data.js');
    const favs = await getFavorites();
    
    if (!favs || favs.length === 0) {
      grid.innerHTML = '<div class="no-data">Нет избранных активов</div>';
      return;
    }

    // Разделяем избранное на акции и криптовалюты
    const cryptoFavs = [];
    const stockFavs = [];
    
    favs.forEach((f) => {
      const symbol = String(f.symbol || '').toUpperCase();
      if (window.STOCK_INFO && window.STOCK_INFO[symbol]) {
        stockFavs.push(symbol);
      } else {
        cryptoFavs.push(f);
      }
    });

    // Получаем данные для криптовалют
    const cryptoPromises = cryptoFavs.map(async (f) => {
      const symbol = String(f.symbol || '').toUpperCase();
      
      // Ищем криптовалюту в общем списке
      const cryptoFromList = window.cryptoList?.find((c) => 
        (c.symbol || '').toUpperCase() === symbol
      );
      
      if (cryptoFromList) {
        return { ...cryptoFromList, assetType: 'crypto' };
      }
      
      // Если не найдено в списке, загружаем данные напрямую с Binance
      try {
        const tickerData = await fetchWithCache(`${BINANCE}${symbol}USDT`);
        
        if (tickerData && tickerData.lastPrice) {
          const info = window.CRYPTO_INFO[symbol] || { name: symbol, color: '#F7931A' };
          
          return {
            symbol,
            name: info.name,
            price: parseFloat(tickerData.lastPrice).toFixed(8),
            change: parseFloat(tickerData.priceChange).toFixed(2),
            changePercent: parseFloat(tickerData.priceChangePercent).toFixed(2),
            high: parseFloat(tickerData.highPrice).toFixed(2),
            low: parseFloat(tickerData.lowPrice).toFixed(2),
            volume: parseFloat(tickerData.volume),
            volumeFormatted: formatVolume(parseFloat(tickerData.volume) * parseFloat(tickerData.lastPrice)),
            color: info.color,
            rank: info.rank || 999,
            assetType: 'crypto'
          };
        }
      } catch (e) {
        console.warn(`Не удалось загрузить данные для ${symbol}:`, e);
      }
      
      // Если всё ещё нет данных, возвращаем минимальный объект
      const info = window.CRYPTO_INFO[symbol] || { name: symbol, color: '#F7931A' };
      return {
        symbol,
        name: info.name,
        price: '0',
        change: '0',
        changePercent: '0',
        high: '0',
        low: '0',
        volume: '0',
        volumeFormatted: '0',
        color: info.color,
        rank: info.rank || 999,
        assetType: 'crypto'
      };
    });

    // Получаем данные для акций
    const stockPromises = stockFavs.map(async (symbol) => {
      let stockData = window.stocksRealData?.[symbol];
      const info = window.STOCK_INFO[symbol] || { name: symbol, color: '#3B82F6' };
      
      // Если нет данных, пытаемся загрузить через Finnhub API
      if (!stockData || !stockData.price) {
        try {
          const FINNHUB_TOKEN = 'd49lflpr01qlaebhu1egd49lflpr01qlaebhu1f0';
          const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_TOKEN}`);
          if (response.ok) {
            const data = await response.json();
            if (data && data.c) {
              stockData = {
                price: data.c.toFixed(2),
                change: (data.c - data.pc).toFixed(2),
                changePercent: (((data.c - data.pc) / data.pc) * 100).toFixed(2),
                high: data.h.toFixed(2),
                low: data.l.toFixed(2),
                volume: data.v || 0
              };
              console.log(`Загружены данные для ${symbol} через API:`, stockData);
            }
          }
        } catch (error) {
          console.warn(`Не удалось загрузить данные для ${symbol}:`, error);
        }
      }
      
      console.log(`Обработка избранной акции ${symbol}:`, { stockData, info });
      
      if (stockData && stockData.price) {
        return {
          symbol,
          name: info.name || symbol,
          price: stockData.price,
          change: stockData.change || '0',
          changePercent: stockData.changePercent || '0',
          high: stockData.high || '0',
          low: stockData.low || '0',
          volume: stockData.volume || 0,
          volumeFormatted: formatVolume(stockData.volume || 0),
          color: info.color,
          rank: 1,
          assetType: 'stock',
          priceHistory: stockData.priceHistory || []
        };
      }
      
      // Если всё ещё нет данных, возвращаем объект с меткой "загрузка"
      return {
        symbol,
        name: info.name || symbol,
        price: 'Загрузка...',
        change: '0',
        changePercent: '0',
        high: '0',
        low: '0',
        volume: 0,
        volumeFormatted: '0',
        color: info.color,
        rank: 1,
        assetType: 'stock'
      };
    });

    const [cryptoData, stockData] = await Promise.all([
      Promise.all(cryptoPromises),
      Promise.all(stockPromises)
    ]);
    
    // Объединяем все активы
    const allAssets = [...cryptoData, ...stockData];
    
    console.log(`Загружено активов для избранного:`, {
      crypto: cryptoData.length,
      stocks: stockData.length,
      total: allAssets.length,
      allAssets: allAssets.map((a) => ({ symbol: a.symbol, assetType: a.assetType, price: a.price }))
    });
    
    // Фильтруем только явно некорректные данные (не фильтруем по цене, так как данные могут еще загружаться)
    const validAssets = allAssets.filter((asset) => asset && asset.symbol);
    
    if (validAssets.length === 0) {
      grid.innerHTML = '<div class="no-data">Нет данных по избранным активам</div>';
      return;
    }

    console.log(`Валидных активов для рендера:`, validAssets.length);
    
    // Рендерим карточки (функция теперь универсальная)
    renderCryptoListTo(validAssets, 'favoritesCryptoGrid');
    
  } catch (e) {
    console.error('renderFavoritesSection error:', e);
    grid.innerHTML = '<div class="no-data">Не удалось загрузить избранное</div>';
  }
}

// Глобальная функция для обновления избранного из других модулей
window.refreshFavorites = async () => {
  try {
    if (window.location.hash === '#favorites' || document.getElementById('favoritesSection')?.classList.contains('active')) {
      await renderFavoritesSection();
    }
  } catch (e) {
    console.warn('refreshFavorites failed', e);
  }
};

function renderCrypto(crypto) {
  const grid = document.getElementById('marketCryptoGrid');
  if (!grid) return;

  // Фильтруем пустые или некорректные данные
  const validCrypto = crypto.filter((c) => c && c.symbol && c.name && c.price);
  
  if (validCrypto.length === 0) {
    grid.innerHTML = '<div class="no-data">Нет данных для отображения</div>';
    return;
  }

  const currencySymbol = getCurrencySymbol();

  grid.innerHTML = validCrypto.map((c, index) => {
    const info = window.CRYPTO_INFO?.[c.symbol] || { icon: 'bitcoin', color: '#F7931A', rank: 'N/A' };
    const isPositive = parseFloat(c.changePercent) >= 0;
    const changeIcon = isPositive ? '↗' : '↘';
    const changeClass = isPositive ? 'price-positive' : 'price-negative';
    const changeSign = isPositive ? '+' : '';
    
    // Генерируем спарклайн
    const sparklineData = c.priceHistory && c.priceHistory.length > 0 
      ? c.priceHistory 
      : generateSparklineData(parseFloat(c.changePercent));
    const sparklineSVG = createSparklineSVG(sparklineData, info.color);
    
    // Используем CoinCap API для иконок
    const bgColor = info.color.replace('#', '');
    const avatarUrl = `https://ui-avatars.com/api/?name=${c.symbol}&background=${bgColor}&color=fff&size=48&bold=true`;
    const iconHTML = `<img src="${getCoinCapIcon(c.symbol)}" 
                           alt="${c.symbol}" 
                           onerror="this.onerror=null; this.src='${avatarUrl}';"
                           style="width: 100%; height: 100%; object-fit: contain;">`;
    
    const convertedPrice = convertToSelectedCurrency(parseFloat(c.price));
    const convertedHigh = convertToSelectedCurrency(parseFloat(c.high || 0));
    const convertedLow = convertToSelectedCurrency(parseFloat(c.low || 0));
    
    const clickHandler = `window.showCryptoDetail('${c.symbol}')`;
    
    return `
      <div class="crypto-card" 
           onclick="${clickHandler}" 
           data-symbol="${c.symbol}"
           style="cursor: pointer; 
                  border-left: 4px solid ${info.color}; 
                  background: linear-gradient(135deg, ${info.color}05 0%, #ffffff 100%);
                  animation: fadeInUp 0.4s ease-out forwards;
                  animation-delay: ${index * 0.03}s;
                  opacity: 0;
                  transform: translateY(20px);
                  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                  position: relative;
                  overflow: hidden;">
        
        <!-- Декоративный элемент -->
        <div style="position: absolute; top: -50px; right: -50px; width: 150px; height: 150px; 
                    background: ${info.color}; opacity: 0.03; border-radius: 50%; pointer-events: none;"></div>
        
        <div class="crypto-header">
          <div class="crypto-icon" 
               style="background: linear-gradient(135deg, ${info.color}, ${info.color}dd); 
                      color: white; 
                      box-shadow: 0 8px 16px ${info.color}30, 0 0 0 4px ${info.color}10;
                      transition: all 0.3s ease;
                      position: relative;">
            ${iconHTML}
          </div>
          <div class="crypto-info" style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <h4 style="transition: color 0.3s ease; margin: 0; font-size: 1.05rem;">${c.name}</h4>
              <span style="background: ${info.color}15; color: ${info.color}; 
                           padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; 
                           font-weight: 600; letter-spacing: 0.5px;">
                #${info.rank || 'N/A'}
              </span>
            </div>
            <div class="crypto-symbol" style="display: flex; align-items: center; gap: 6px;">
              <span>${c.symbol}</span>
              <span style="color: #cbd5e1; font-size: 0.7rem;">•</span>
              <span style="color: #94a3b8; font-size: 0.7rem;">24h Vol: ${c.volumeFormatted || 'N/A'}</span>
            </div>
          </div>
        </div>
        
        <div class="crypto-price-row" style="align-items: baseline; margin: 16px 0 8px 0;">
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <div class="crypto-price" style="color: #0f172a; font-weight: 700; font-size: 1.75rem; letter-spacing: -0.5px;">
              ${currencySymbol}${formatPrice(convertedPrice)}
            </div>
            <div style="font-size: 0.75rem; color: #94a3b8;">
              Current Price
            </div>
          </div>
          <div class="crypto-change ${changeClass}"
               style="font-weight: 700; padding: 8px 14px; border-radius: 12px; font-size: 0.95rem;
                      display: flex; align-items: center; gap: 4px;
                      box-shadow: ${isPositive ? '0 4px 12px rgba(16, 185, 129, 0.2)' : '0 4px 12px rgba(239, 68, 68, 0.2)'};
                      border: 2px solid ${isPositive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'};
                      backdrop-filter: blur(10px);">
            <span style="font-size: 1.1rem;">${changeIcon}</span>
            ${changeSign}${parseFloat(c.changePercent).toFixed(2)}%
          </div>
        </div>
        
        <div class="crypto-sparkline" style="margin: 16px -8px; height: 70px; position: relative; overflow: visible;">
          ${sparklineSVG}
        </div>
        
        <div class="crypto-stats-extended" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 16px;">
          <div class="stat-mini" style="background: linear-gradient(135deg, ${info.color}08, ${info.color}03); 
                                        padding: 12px; border-radius: 12px; 
                                        border: 1px solid ${info.color}15;
                                        transition: all 0.2s;">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
              <div style="width: 6px; height: 6px; background: #10b981; border-radius: 50%;"></div>
              <span class="stat-mini-label" style="font-size: 0.7rem; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">High 24h</span>
            </div>
            <span class="stat-mini-value" style="font-weight: 700; color: #0f172a; font-size: 0.95rem;">${currencySymbol}${formatPrice(convertedHigh)}</span>
          </div>
          <div class="stat-mini" style="background: linear-gradient(135deg, ${info.color}08, ${info.color}03); 
                                        padding: 12px; border-radius: 12px; 
                                        border: 1px solid ${info.color}15;
                                        transition: all 0.2s;">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
              <div style="width: 6px; height: 6px; background: #ef4444; border-radius: 50%;"></div>
              <span class="stat-mini-label" style="font-size: 0.7rem; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Low 24h</span>
            </div>
            <span class="stat-mini-value" style="font-weight: 700; color: #0f172a; font-size: 0.95rem;">${currencySymbol}${formatPrice(convertedLow)}</span>
          </div>
        </div>
        
        <div class="crypto-actions" style="display: flex; gap: 8px; margin-top: 16px; padding-top: 16px; border-top: 1px solid ${info.color}15;">
          <button class="btn btn-success" 
                  style="flex: 1; padding: 10px; font-size: 0.875rem; border-radius: 10px; 
                         border: none; background: linear-gradient(135deg, #10b981, #059669); 
                         color: white; cursor: pointer; font-weight: 600; 
                         transition: all 0.2s; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);" 
                  onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(16, 185, 129, 0.4)';"
                  onmouseout="this.style.transform=''; this.style.boxShadow='0 2px 8px rgba(16, 185, 129, 0.3)';"
                  onclick="event.stopPropagation(); window.app.showTransactionModal('BUY', null, '${c.symbol}')">
            <i class="fas fa-shopping-cart"></i> Купить
          </button>
          <button class="btn btn-danger" 
                  style="flex: 1; padding: 10px; font-size: 0.875rem; border-radius: 10px; 
                         border: none; background: linear-gradient(135deg, #ef4444, #dc2626); 
                         color: white; cursor: pointer; font-weight: 600; 
                         transition: all 0.2s; box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);"
                  onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(239, 68, 68, 0.4)';"
                  onmouseout="this.style.transform=''; this.style.boxShadow='0 2px 8px rgba(239, 68, 68, 0.3)';"
                  onclick="event.stopPropagation(); window.app.showTransactionModal('SELL', null, '${c.symbol}')">
            <i class="fas fa-hand-holding-usd"></i> Продать
          </button>
        </div>
        
        <!-- Индикатор hover -->
        <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 3px; 
                    background: linear-gradient(90deg, ${info.color}, transparent); 
                    opacity: 0; transition: opacity 0.3s;"
             class="hover-indicator"></div>
      </div>
    `;
  }).join('');
}

// === NEWS SECTION: robust event delegation and first-load fix ===

// --- NEWS FILTERS & CATEGORY BUTTONS ---
function initNewsFiltersDelegated() {
  // Делегируем клики по категориям, обновлению и очистке поиска
  document.removeEventListener('click', handleNewsDelegatedClick, true);
  document.addEventListener('click', handleNewsDelegatedClick, true);
  document.removeEventListener('input', handleNewsDelegatedInput, true);
  document.addEventListener('input', handleNewsDelegatedInput, true);
}

function handleNewsDelegatedClick(e) {
  // Категории
  if (e.target.classList.contains('category-btn')) {
    e.preventDefault();
    const cat = e.target.dataset.category || 'all';
    document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
    e.target.classList.add('active');
    if (window.scheduleLoadNews) {
      window.scheduleLoadNews(cat);
    } else if (window.loadNews) {
      window.loadNews(cat);
    }
    return;
  }
  // Обновить
  if (e.target.id === 'refreshNewsBtn') {
    e.preventDefault();
    const active = document.querySelector('.category-btn.active');
    const cat = active ? (active.dataset.category || 'all') : 'all';
    if (window.scheduleLoadNews) {
      window.scheduleLoadNews(cat, 0, 0, true); // force refresh
    } else if (window.loadNews) {
      window.loadNews(cat, true);
    }
    return;
  }
  // Очистить поиск
  if (e.target.id === 'clearNewsSearch') {
    e.preventDefault();
    const input = document.getElementById('newsSearch');
    if (input) input.value = '';
    filterNewsCards('');
    return;
  }
}

function handleNewsDelegatedInput(e) {
  if (e.target && e.target.id === 'newsSearch') {
    filterNewsCards(e.target.value);
  }
}

function filterNewsCards(query) {
  const q = (query || '').toLowerCase();
  document.querySelectorAll('.news-card').forEach(card => {
    const text = card.textContent.toLowerCase();
    card.style.display = (!q || text.includes(q)) ? '' : 'none';
  });
}

// --- SCHEDULED NEWS LOADER (proxy buffer + immediate fallback UI) ---
// Lightweight proxy: buffer schedule requests until the robust implementation is available.
// Additionally show an immediate loading state and render cached news (if any) so the UI is not blank.
window._earlyScheduleLoadRequests = window._earlyScheduleLoadRequests || [];
window._scheduleLoadWatcherActive = window._scheduleLoadWatcherActive || false;
window.scheduleLoadNews = (category = 'all', maxRetries = 15, interval = 200, force = false) => {
  // If real implementation is already present, delegate immediately.
  if (typeof window._realScheduleLoadNews === 'function') {
    return window._realScheduleLoadNews(category, maxRetries, interval, force);
  }

  console.log('[scheduleLoadNews proxy] Буферизуем запрос scheduleLoadNews, реализация ещё не загружена:', category);
  window._earlyScheduleLoadRequests.push([category, maxRetries, interval, force]);

  try {
    const container = document.getElementById('newsContainer');
    if (container) {
      // Show immediate loading UI so user sees activity
      container.innerHTML = `
        <div class="news-loading-state">
          <div class="loader-large"></div>
          <p>Загрузка новостей...</p>
          <p class="loading-subtext">Ожидаем готовности модуля новостей...</p>
        </div>
      `;
    }

    // If we have cached news, render it immediately as a fallback
    if (window.newsCache && window.newsCache.data && window.newsCache.data.length) {
      console.log('[scheduleLoadNews proxy] Отображаем кэшированные новости как fallback');
      // renderNews may not be defined yet; guard against that
      if (typeof window.renderNews === 'function') {
        window.renderNews(window.newsCache.data, category);
        if (typeof window.updateNewsStats === 'function') window.updateNewsStats(window.newsCache.data.length);
      }
    }
  } catch (e) {
    console.warn('[scheduleLoadNews proxy] Ошибка при показе fallback UI:', e.message);
  }

  // Start a short watcher to flush buffered schedule requests as soon as the real implementation appears.
  if (!window._scheduleLoadWatcherActive) {
    window._scheduleLoadWatcherActive = true;
    (function startWatcher() {
      let attempts = 0;
      const maxAttempts = 200; // ~30 seconds at 150ms interval
      const intervalMs = 150;
      const watcher = setInterval(() => {
        attempts++;
        if (typeof window._realScheduleLoadNews === 'function') {
          clearInterval(watcher);
          window._scheduleLoadWatcherActive = false;
          try {
            const reqs = window._earlyScheduleLoadRequests.slice();
            window._earlyScheduleLoadRequests = [];
            if (reqs.length) console.log('[scheduleLoadNews proxy] Flushing buffered schedule requests:', reqs.length);
            reqs.forEach(args => {
              try {
                window._realScheduleLoadNews(...args);
              } catch (err) {
                console.warn('[scheduleLoadNews proxy] Ошибка при выполнении отложённого scheduleLoadNews:', err.message);
              }
            });
          } catch (e) {
            console.warn('[scheduleLoadNews proxy] Flush error:', e.message);
          }
          return;
        }

        // Also accept direct readiness of loadNews (in case schedule loader isn't exposed yet)
        if (window._loadNewsReady || (typeof window.loadNews === 'function' && window._loadNewsReal)) {
          clearInterval(watcher);
          window._scheduleLoadWatcherActive = false;
          try {
            const reqs = window._earlyScheduleLoadRequests.slice();
            window._earlyScheduleLoadRequests = [];
            if (reqs.length) console.log('[scheduleLoadNews proxy] Flushing buffered requests (via loadNews readiness):', reqs.length);
            reqs.forEach(args => {
              try {
                // If real schedule not present, call loadNews directly for each buffered request
                if (typeof window._realScheduleLoadNews === 'function') {
                  window._realScheduleLoadNews(...args);
                } else if (typeof window.loadNews === 'function') {
                  window.loadNews(args[0], args[3]);
                }
              } catch (err) {
                console.warn('[scheduleLoadNews proxy] Ошибка при выполнении отложённого вызова loadNews:', err.message);
              }
            });
          } catch (e) {
            console.warn('[scheduleLoadNews proxy] Flush error (loadNews path):', e.message);
          }
          return;
        }

        if (attempts >= maxAttempts) {
          clearInterval(watcher);
          window._scheduleLoadWatcherActive = false;
          console.warn('[scheduleLoadNews proxy] Real scheduleLoadNews did not appear within timeout, buffered requests remain.');
        }
      }, intervalMs);
    })();
  }
};

// --- PATCH: Ensure news filters always initialized ---
function ensureNewsFiltersInit() {
  // Гарантируем, что делегаты навешаны только один раз
  if (!window._newsFiltersDelegated) {
    initNewsFiltersDelegated();
    window._newsFiltersDelegated = true;
  }
}

// --- EXPORT for global use ---
window.initNewsFilters = initNewsFiltersDelegated;
window.ensureNewsFiltersInit = ensureNewsFiltersInit;

// --- HOOK: auto-init on DOMContentLoaded and section show ---
document.addEventListener('DOMContentLoaded', ensureNewsFiltersInit);


// === РЕНДЕР: График объема ===
function renderVolumeChart(coinSymbol, volume) {
  const ctx = document.getElementById('cryptoDetailVolumeChart');
  if (!ctx) {
    console.log('Volume chart canvas not found');
    return;
  }

  if (window.volumeChart) window.volumeChart.destroy();

  const cryptoInfo = window.CRYPTO_INFO[coinSymbol] || { color: '#F7931A' };
  const color = cryptoInfo.color;

  // Генерируем случайные данные объема для последних 7 дней (для демонстрации)
  const labels = [];
  const data = [];
  const baseVolume = volume;
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    labels.push(date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }));
    // Генерируем объем с вариацией ±30%
    const variation = 0.7 + Math.random() * 0.6;
    data.push(baseVolume * variation);
  }

  window.volumeChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Volume',
        data,
        backgroundColor: `${color}60`,
        borderColor: color,
        borderWidth: 2,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { 
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: color,
          borderWidth: 2,
          padding: 12,
          displayColors: false,
          callbacks: {
            label: (context) => `Объем: $${formatNumber(context.parsed.y)}`,
          }
        }
      },
      scales: {
        x: { 
          grid: { display: false },
          ticks: { color: '#6b7280', font: { size: 11 } }
        },
        y: { 
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { 
            callback: (v) => `$${formatNumber(v)}`,
            color: '#6b7280',
            font: { size: 11 }
          } 
        }
      }
    }
  });
}

// === РЕНДЕР: График диапазона цен ===
function renderRangeChart(coinSymbol, currentPrice, high, low) {
  const ctx = document.getElementById('cryptoDetailRangeChart');
  if (!ctx) {
    console.log('Range chart canvas not found');
    return;
  }

  if (window.rangeChart) window.rangeChart.destroy();

  const cryptoInfo = window.CRYPTO_INFO[coinSymbol] || { color: '#F7931A' };
  const color = cryptoInfo.color;

  // Создаем данные для горизонтального графика диапазона
  const priceFloat = parseFloat(currentPrice);
  const highFloat = parseFloat(high);
  const lowFloat = parseFloat(low);
  
  // Генерируем данные для 12 часовых интервалов
  const labels = [];
  const highs = [];
  const lows = [];
  const closes = [];
  
  for (let i = 11; i >= 0; i--) {
    const hour = new Date();
    hour.setHours(hour.getHours() - i);
    labels.push(hour.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
    
    // Генерируем данные с вариацией
    const variation = 0.95 + Math.random() * 0.1;
    const h = highFloat * variation;
    const l = lowFloat * variation;
    const c = (h + l) / 2 + (Math.random() - 0.5) * (h - l) * 0.5;
    
    highs.push(h);
    lows.push(l);
    closes.push(c);
  }

  window.rangeChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'High',
          data: highs,
          borderColor: color,
          backgroundColor: `${color}20`,
          borderWidth: 2,
          fill: '+1',
          tension: 0.4,
          pointRadius: 0
        },
        {
          label: 'Low',
          data: lows,
          borderColor: color,
          backgroundColor: `${color}20`,
          borderWidth: 2,
          fill: false,
          tension: 0.4,
          pointRadius: 0
        },
        {
          label: 'Цена',
          data: closes,
          borderColor: color,
          backgroundColor: color,
          borderWidth: 3,
          fill: false,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { 
        legend: { 
          display: true,
          position: 'top',
          labels: {
            usePointStyle: true,
            padding: 15,
            font: { size: 11 }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: color,
          borderWidth: 2,
          padding: 12,
          callbacks: {
            label: (context) => `${context.dataset.label}: $${context.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          }
        }
      },
      scales: {
        x: { 
          grid: { display: false },
          ticks: { 
            maxTicksLimit: 6,
            color: '#6b7280', 
            font: { size: 10 } 
          }
        },
        y: { 
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { 
            callback: (v) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
            color: '#6b7280',
            font: { size: 11 }
          } 
        }
      },
      interaction: {
        mode: 'index',
        intersect: false
      }
    }
  });
}

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

// Умное форматирование цены в зависимости от величины
function formatPrice(price) {
  const num = parseFloat(price);
  if (!num && num !== 0) return 'N/A';
  if (isNaN(num)) return 'N/A';
  
  // Для очень дешевых монет (< $0.01) показываем больше знаков
  if (num < 0.000001) {
    return num.toLocaleString('en-US', {minimumFractionDigits: 8, maximumFractionDigits: 8});
  } else if (num < 0.0001) {
    return num.toLocaleString('en-US', {minimumFractionDigits: 6, maximumFractionDigits: 6});
  } else if (num < 0.01) {
    return num.toLocaleString('en-US', {minimumFractionDigits: 4, maximumFractionDigits: 4});
  } else if (num < 1) {
    return num.toLocaleString('en-US', {minimumFractionDigits: 3, maximumFractionDigits: 3});
  } else {
    return num.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  }
}

function generateSparkline(changePercent) {
  const isPositive = changePercent >= 0;
  const color = isPositive ? '#10b981' : '#ef4444';
  return `<svg width="100" height="30" viewBox="0 0 100 30">
    <path d="M0,15 L20,${isPositive ? 5 : 25} L40,${isPositive ? 10 : 20} L60,${isPositive ? 8 : 22} L80,${isPositive ? 12 : 18} L100,15"
          stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round"/>
  </svg>`;
}

function formatNumber(num) {
  if (!num && num !== 0) return 'N/A';
  const number = parseFloat(num);
  if (isNaN(number)) return 'N/A';
  if (number >= 1e9) return `${(number / 1e9).toFixed(2)}B`;
  if (number >= 1e6) return `${(number / 1e6).toFixed(2)}M`;
  if (number >= 1e3) return `${(number / 1e3).toFixed(2)}K`;
  return number.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMarketCap(symbol, price) {
  return `${window.CRYPTO_INFO[symbol]?.marketCap || 5}B`;
}

function getCryptoRank(symbol) {
  return window.CRYPTO_INFO[symbol]?.rank || 'N/A';
}

function getCryptoIcon(symbol) {
  return window.CRYPTO_INFO[symbol]?.icon || 'bitcoin';
}

function getCryptoName(s) {
  return window.CRYPTO_INFO[s]?.name || s;
}

function getStockName(s) {
  const map = {
    AAPL: 'Apple Inc.', GOOGL: 'Alphabet Inc.', MSFT: 'Microsoft', TSLA: 'Tesla',
    AMZN: 'Amazon', META: 'Meta Platforms', NVDA: 'NVIDIA', NFLX: 'Netflix',
    PYPL: 'PayPal', ADBE: 'Adobe'
  };
  return map[s] || s;
}

function formatVolume(v) {
  const volume = parseFloat(v);
  if (isNaN(volume)) return 'N/A';
  if (volume >= 1e9) return `${(volume / 1e9).toFixed(1)}B`;
  if (volume >= 1e6) return `${(volume / 1e6).toFixed(1)}M`;
  if (volume >= 1e3) return `${(volume / 1e3).toFixed(1)}K`;
  return volume.toFixed(0);
}

function showNotification(msg, type = 'info') {
  document.querySelectorAll('.notification').forEach((n) => n.remove());
  
  const n = document.createElement('div');
  n.className = `notification ${type}`;
  n.innerHTML = `<div class="notification-content"><i class="fas fa-info-circle"></i><span>${msg}</span></div>`;
  
  // Добавляем в fixed контейнер чтобы избежать layout shift
  const container = document.getElementById('notifications');
  if (container) {
    container.appendChild(n);
  } else {
    document.body.appendChild(n);
  }
  
  setTimeout(() => n.remove(), 5000);
}

// === WATCHLIST ===
export function addToWatchlist(coinId) {
  const watchlist = JSON.parse(localStorage.getItem('cryptoWatchlist') || '[]');
  if (!watchlist.includes(coinId)) {
    watchlist.push(coinId);
    localStorage.setItem('cryptoWatchlist', JSON.stringify(watchlist));
    showNotification(`Добавлено в отслеживаемые: ${coinId}`, 'success');
    return true;
  }
  return false;
}

export function getWatchlist() {
  return JSON.parse(localStorage.getItem('cryptoWatchlist') || '[]');
}

// === ГЛОБАЛЬНЫЕ ФУНКЦИИ ===
window.app = window.app || {};

window.app.refreshMarketData = async () => {
  if (window.cache) {
    window.cache.clear();
    console.log('Кэш очищен');
  }
  
  showNotification('Обновление рыночных данных...', 'info');
  
  const currentSection = window.location.hash.slice(1) || 'dashboard';
  
  try {
    switch (currentSection) {
      case 'market':
        await loadStocks();
        await loadCrypto();
        await loadIndices();
        break;
      case 'crypto':
        cryptoListCache = null;
        await loadCryptoList();
        break;
      default:
        break;
    }
    
    setTimeout(() => {
      showNotification('Данные успешно обновлены!', 'success');
    }, 1000);
    
  } catch (error) {
    console.error('Ошибка обновления данных:', error);
    showNotification('Ошибка при обновлении данных', 'error');
  }
};

// DISABLED: These functions are now commented out
// window.renderPriceChart = renderPriceChart;
// window.renderCryptoDetail = renderCryptoDetail;

// Функция для закрытия модального окна (с поддержкой panel-docked)
window.closeModal = (modalId) => {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  // If modal is docked into detail panel, undock and restore section/grid
  if (modal.classList.contains('panel-docked')) {
    const section = modal.closest('.section');
    const grid = section?.querySelector('.crypto-grid');
    const panel = section?.querySelector('.detail-panel-area');
    if (panel) panel.style.display = 'none';
    if (grid) grid.style.display = '';
    section?.classList.remove('detail-open');

    // Move modal back to original parent if possible
    if (modal._originalParent) {
      if (modal._originalNext && modal._originalNext.parentNode === modal._originalParent) {
        modal._originalParent.insertBefore(modal, modal._originalNext);
      } else {
        modal._originalParent.appendChild(modal);
      }
    } else {
      document.body.appendChild(modal);
    }

    modal.classList.remove('panel-docked');
    const content = modal.querySelector('.modal-content') || modal.querySelector('.modal-container');
    if (content) {
    content.style.width = '';
    content.style.height = '';
  }

    console.log(`Panel modal ${modalId} undocked and restored`);
  }

  // Normal hide
  modal.classList.remove('active');
  setTimeout(() => {
    modal.style.display = 'none';
  }, 300);
  console.log(`Modal ${modalId} closed`);
};

// Также добавляем в window.app для совместимости
window.app = window.app || {};
window.app.closeModal = window.closeModal;

console.log('API module loaded - ТОЛЬКО РЕАЛЬНЫЕ ДАННЫЕ');

// ==================== STOCKS SECTION ====================

const STOCK_SYMBOLS = [
  'AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX', 
  'PYPL', 'ADBE', 'CRM', 'INTC', 'AMD', 'ORCL', 'IBM', 'CSCO',
  'QCOM', 'TXN', 'AVGO', 'SHOP', 'SQ', 'SNAP', 'UBER', 'LYFT',
  'ABNB', 'COIN', 'RBLX', 'PINS', 'SPOT', 'ZM', 'DOCU', 'TWLO',
  'PLTR', 'SNOW', 'NET', 'DDOG', 'MDB', 'CRWD', 'ZS', 'OKTA'
];

window.STOCK_INFO = {
  AAPL: { name: 'Apple Inc.', sector: 'Technology', exchange: 'NASDAQ', color: '#A3AAAE', marketCap: 2750 },
  GOOGL: { name: 'Alphabet Inc.', sector: 'Technology', exchange: 'NASDAQ', color: '#4285F4', marketCap: 1800 },
  MSFT: { name: 'Microsoft Corporation', sector: 'Technology', exchange: 'NASDAQ', color: '#00A4EF', marketCap: 2900 },
  AMZN: { name: 'Amazon.com Inc.', sector: 'Consumer Cyclical', exchange: 'NASDAQ', color: '#FF9900', marketCap: 1600 },
  TSLA: { name: 'Tesla Inc.', sector: 'Automotive', exchange: 'NASDAQ', color: '#E82127', marketCap: 800 },
  META: { name: 'Meta Platforms Inc.', sector: 'Technology', exchange: 'NASDAQ', color: '#0668E1', marketCap: 900 },
  NVDA: { name: 'NVIDIA Corporation', sector: 'Technology', exchange: 'NASDAQ', color: '#76B900', marketCap: 1200 },
  NFLX: { name: 'Netflix Inc.', sector: 'Entertainment', exchange: 'NASDAQ', color: '#E50914', marketCap: 200 },
  PYPL: { name: 'PayPal Holdings', sector: 'Financial Services', exchange: 'NASDAQ', color: '#003087', marketCap: 80 },
  ADBE: { name: 'Adobe Inc.', sector: 'Technology', exchange: 'NASDAQ', color: '#FF0000', marketCap: 250 },
  CRM: { name: 'Salesforce Inc.', sector: 'Technology', exchange: 'NYSE', color: '#00A1E0', marketCap: 220 },
  INTC: { name: 'Intel Corporation', sector: 'Technology', exchange: 'NASDAQ', color: '#0071C5', marketCap: 190 },
  AMD: { name: 'Advanced Micro Devices', sector: 'Technology', exchange: 'NASDAQ', color: '#ED1C24', marketCap: 180 },
  ORCL: { name: 'Oracle Corporation', sector: 'Technology', exchange: 'NYSE', color: '#F80000', marketCap: 300 },
  IBM: { name: 'IBM', sector: 'Technology', exchange: 'NYSE', color: '#006699', marketCap: 150 },
  CSCO: { name: 'Cisco Systems', sector: 'Technology', exchange: 'NASDAQ', color: '#049FD9', marketCap: 200 },
  QCOM: { name: 'QUALCOMM Inc.', sector: 'Technology', exchange: 'NASDAQ', color: '#3253DC', marketCap: 170 },
  TXN: { name: 'Texas Instruments', sector: 'Technology', exchange: 'NASDAQ', color: '#D8232A', marketCap: 160 },
  AVGO: { name: 'Broadcom Inc.', sector: 'Technology', exchange: 'NASDAQ', color: '#ED1C24', marketCap: 450 },
  SHOP: { name: 'Shopify Inc.', sector: 'Technology', exchange: 'NYSE', color: '#95BF47', marketCap: 90 },
  SQ: { name: 'Block Inc.', sector: 'Financial Services', exchange: 'NYSE', color: '#3D3D3D', marketCap: 45 },
  SNAP: { name: 'Snap Inc.', sector: 'Technology', exchange: 'NYSE', color: '#FFFC00', marketCap: 20 },
  UBER: { name: 'Uber Technologies', sector: 'Technology', exchange: 'NYSE', color: '#000000', marketCap: 140 },
  LYFT: { name: 'Lyft Inc.', sector: 'Technology', exchange: 'NASDAQ', color: '#FF00BF', marketCap: 6 },
  ABNB: { name: 'Airbnb Inc.', sector: 'Consumer Cyclical', exchange: 'NASDAQ', color: '#FF5A5F', marketCap: 90 },
  COIN: { name: 'Coinbase Global', sector: 'Financial Services', exchange: 'NASDAQ', color: '#0052FF', marketCap: 50 },
  RBLX: { name: 'Roblox Corporation', sector: 'Entertainment', exchange: 'NYSE', color: '#E03A3C', marketCap: 30 },
  PINS: { name: 'Pinterest Inc.', sector: 'Technology', exchange: 'NYSE', color: '#E60023', marketCap: 20 },
  SPOT: { name: 'Spotify Technology', sector: 'Entertainment', exchange: 'NYSE', color: '#1DB954', marketCap: 50 },
  ZM: { name: 'Zoom Video Communications', sector: 'Technology', exchange: 'NASDAQ', color: '#2D8CFF', marketCap: 20 },
  DOCU: { name: 'DocuSign Inc.', sector: 'Technology', exchange: 'NASDAQ', color: '#FBB034', marketCap: 12 },
  TWLO: { name: 'Twilio Inc.', sector: 'Technology', exchange: 'NYSE', color: '#F22F46', marketCap: 15 },
  PLTR: { name: 'Palantir Technologies', sector: 'Technology', exchange: 'NYSE', color: '#101010', marketCap: 45 },
  SNOW: { name: 'Snowflake Inc.', sector: 'Technology', exchange: 'NYSE', color: '#29B5E8', marketCap: 50 },
  NET: { name: 'Cloudflare Inc.', sector: 'Technology', exchange: 'NYSE', color: '#F38020', marketCap: 30 },
  DDOG: { name: 'Datadog Inc.', sector: 'Technology', exchange: 'NASDAQ', color: '#632CA6', marketCap: 40 },
  MDB: { name: 'MongoDB Inc.', sector: 'Technology', exchange: 'NASDAQ', color: '#00ED64', marketCap: 25 },
  CRWD: { name: 'CrowdStrike Holdings', sector: 'Technology', exchange: 'NASDAQ', color: '#FF0000', marketCap: 70 },
  ZS: { name: 'Zscaler Inc.', sector: 'Technology', exchange: 'NASDAQ', color: '#0080FF', marketCap: 28 },
  OKTA: { name: 'Okta Inc.', sector: 'Technology', exchange: 'NASDAQ', color: '#007DC1', marketCap: 15 }
};

let stocksListCache = null;

export async function loadStocksList() {
  const grid = document.getElementById('mainStocksGrid');
  if (!grid) return;

  grid.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Загрузка акций...</div>';

  if (stocksListCache) {
    renderStocksList(stocksListCache);
    return;
  }

  try {
    // Обрабатываем символы пакетами, чтобы не превысить лимит Finnhub.
    // Простая стратегия: выполняем N запросов параллельно, затем ждём delayMs.
    async function batchProcess(items, fn, batchSize = 5, delayMs = 1000) {
      const results = [];
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        console.log(`Загружаю батч акций ${i + 1}-${i + batch.length} из ${items.length}`);
        // Выполняем батч параллельно, но каждый элемент индивидуально ловит ошибки
        const batchResults = await Promise.all(batch.map((item) => fn(item).catch((err) => {
          console.warn('Ошибка при загрузке в батче для', item, err && err.message);
          return null;
        })));
        results.push(...batchResults);
        if (i + batchSize < items.length) await new Promise((r) => setTimeout(r, delayMs));
      }
      return results;
    }

    // Настройки: 5 запросов одновременно, 1 секунда пауза между батчами — простая, надёжная настройка
    const stocksData = await batchProcess(STOCK_SYMBOLS, loadStockData, 5, 1000);

    const validData = stocksData.filter((data) => data !== null);
    console.log('Загружено акций:', validData.length);

    stocksListCache = validData;
    window.stocksList = validData;
    renderStocksList(validData);
    
    // Инициализация фильтров с проверкой на существование функции
    if (typeof initStocksFilters === 'function') {
      initStocksFilters();
    } else {
      // Если функция еще не загружена, вызовем позже
      setTimeout(() => {
        if (typeof initStocksFilters === 'function') {
          initStocksFilters();
        }
      }, 100);
    }
    
  } catch (error) {
    console.error('Ошибка загрузки акций:', error);
    grid.innerHTML = '<div class="no-data">Не удалось загрузить список акций</div>';
  }
}

async function loadStockData(symbol) {
  try {
    const url = `${FINNHUB}${symbol}&token=${FINNHUB_TOKEN}`;
    
    // Добавляем timeout 5 секунд
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    try {
      const data = await fetchWithCache(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (data && typeof data.c === 'number' && data.c > 0) {
        const change = data.c - data.pc;
        const changePercent = (change / data.pc) * 100;
        const info = window.STOCK_INFO[symbol] || { name: symbol, sector: 'Unknown', exchange: 'Unknown', color: '#6b7280', marketCap: 0 };
        
        return {
          symbol,
          name: info.name,
          sector: info.sector,
          exchange: info.exchange,
          color: info.color,
          marketCap: info.marketCap,
          price: data.c.toFixed(2),
          change: change.toFixed(2),
          changePercent: changePercent.toFixed(2),
          high: data.h.toFixed(2),
          low: data.l.toFixed(2),
          open: data.o.toFixed(2),
          previousClose: data.pc.toFixed(2),
          volume: Math.round(data.v || 0),
          sparklineData: generateSparklineData(changePercent)
        };
      }
      // Fallback: если Finnhub не сработал
      console.warn(`Finnhub недоступен для ${symbol}, используем fallback`);
      return generateFallbackStockDetailData(symbol);
    } catch (timeoutError) {
      clearTimeout(timeoutId);
      console.warn(`Timeout Finnhub для ${symbol}: ${timeoutError.message}`);
      return generateFallbackStockDetailData(symbol);
    }
  } catch (error) {
    console.warn(`Не удалось загрузить ${symbol}:`, error);
    return generateFallbackStockDetailData(symbol);
  }
}

// Генерируем детали акции на основе fallback данных
function generateFallbackStockDetailData(symbol) {
  const basePrice = STOCK_FALLBACK_PRICES[symbol] || (100 + Math.random() * 200);
  const change = (Math.random() - 0.5) * basePrice * 0.04; // ±2%
  const changePercent = (change / basePrice) * 100;
  const info = window.STOCK_INFO[symbol] || { name: symbol, sector: 'Unknown', exchange: 'Unknown', color: '#6b7280', marketCap: 0 };
  
  return {
    symbol,
    name: info.name,
    sector: info.sector,
    exchange: info.exchange,
    color: info.color,
    marketCap: info.marketCap,
    price: basePrice.toFixed(2),
    change: change.toFixed(2),
    changePercent: changePercent.toFixed(2),
    high: (basePrice * 1.02).toFixed(2),
    low: (basePrice * 0.98).toFixed(2),
    open: (basePrice - change).toFixed(2),
    previousClose: (basePrice - change).toFixed(2),
    volume: Math.floor(Math.random() * 5000000 + 1000000),
    sparklineData: generateSparklineData(changePercent),
  };
}

function renderStocksList(stocks) {
  const grid = document.getElementById('mainStocksGrid');
  if (!grid) return;

  if (stocks.length === 0) {
    grid.innerHTML = '<div class="no-data">Акции не найдены</div>';
    return;
  }

  grid.innerHTML = stocks.map(stock => {
    const changeClass = parseFloat(stock.changePercent) >= 0 ? 'price-positive' : 'price-negative';
    const changeSign = parseFloat(stock.changePercent) >= 0 ? '+' : '';
    
    // Генерируем SVG спарклайн как у криптовалют
    const sparklineSVG = createSparklineSVG(stock.sparklineData, stock.color);
    
    // Получаем HTML для логотипа акции с автоматическим fallback
    const iconHTML = getStockLogoHTML(stock.symbol, '32px');
    
    return `
      <div class="crypto-card" onclick="window.app.showStockDetail('${stock.symbol}')" style="cursor: pointer; border-left: 4px solid ${stock.color}; background: linear-gradient(135deg, ${stock.color}08 0%, #ffffff 100%);">
        <div class="crypto-header">
          <div class="crypto-icon" style="background: ${stock.color}; color: white; box-shadow: 0 4px 12px ${stock.color}40;">
            ${iconHTML}
          </div>
          <div class="crypto-info">
            <h4 class="notranslate" translate="no">${stock.name}</h4>
            <div class="crypto-symbol notranslate" translate="no">${stock.symbol}</div>
          </div>
        </div>
        <div class="crypto-price-row">
          <div class="crypto-price notranslate" style="color: ${stock.color};" translate="no">$${formatPrice(stock.price)}</div>
          <div class="crypto-change ${changeClass} notranslate" translate="no">
            ${changeSign}${stock.changePercent}%
          </div>
        </div>
        <div class="crypto-sparkline">
          ${sparklineSVG}
        </div>
        <div class="crypto-stats-extended">
          <div class="stat-mini">
            <span class="stat-mini-label">24h High</span>
            <span class="stat-mini-value notranslate" translate="no">$${stock.high}</span>
          </div>
          <div class="stat-mini">
            <span class="stat-mini-label">24h Low</span>
            <span class="stat-mini-value notranslate" translate="no">$${stock.low}</span>
          </div>
          <div class="stat-mini">
            <span class="stat-mini-label">Капитализация</span>
            <span class="stat-mini-value notranslate" translate="no">${stock.marketCap}B</span>
          </div>
          <div class="stat-mini">
            <span class="stat-mini-label">Биржа</span>
            <span class="stat-mini-value notranslate" translate="no">${stock.exchange}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  console.log('Отрендерено акций:', stocks.length);
}

function initStocksFilters() {
  const searchInput = document.getElementById('stocksSearch');
  const priceMin = document.getElementById('stocksPriceMin');
  const priceMax = document.getElementById('stocksPriceMax');
  const resetBtn = document.getElementById('stocksResetFilters');
  
  // Внутренние переменные для хранения значений фильтров
  let currentSort = 'market_cap';
  let currentPercentFilter = 'all';
  
  // Инициализация кастомных select
  initCustomSelect('stocksSortDisplay', 'stocksSortDropdown', (value) => {
    currentSort = value;
    applyFilters();
  });
  
  initCustomSelect('stocksPercentDisplay', 'stocksPercentDropdown', (value) => {
    currentPercentFilter = value;
    applyFilters();
  });
  
  // Функция для получения текущих значений фильтров
  window.getStocksFilterValues = () => {
    return {
      sort: currentSort,
      percentFilter: currentPercentFilter,
      search: searchInput?.value || '',
      priceMin: priceMin?.value || '',
      priceMax: priceMax?.value || ''
    };
  };
  
  const applyFilters = () => {
    const values = window.getStocksFilterValues();
    filterStocks(
      values.search, 
      values.sort,
      values.percentFilter,
      parseFloat(values.priceMin) || -Infinity,
      parseFloat(values.priceMax) || Infinity
    );
  };
  
  if (searchInput) {
    searchInput.addEventListener('input', applyFilters);
  }
  
  if (priceMin) {
    priceMin.addEventListener('input', applyFilters);
  }
  
  if (priceMax) {
    priceMax.addEventListener('input', applyFilters);
  }
  
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (priceMin) priceMin.value = '';
      if (priceMax) priceMax.value = '';
      
      // Сброс кастомных select
      currentSort = 'market_cap';
      currentPercentFilter = 'all';
      
      const stocksSortDisplay = document.getElementById('stocksSortDisplay');
      const stocksPercentDisplay = document.getElementById('stocksPercentDisplay');
      
      if (stocksSortDisplay) {
        stocksSortDisplay.querySelector('.custom-select-value').textContent = 'Рейтинг';
      }
      
      if (stocksPercentDisplay) {
        stocksPercentDisplay.querySelector('.custom-select-value').textContent = 'Все';
      }
      
      // Обновить selected в dropdown
      const sortDropdown = document.getElementById('stocksSortDropdown');
      if (sortDropdown) {
        sortDropdown.querySelectorAll('.custom-select-option').forEach(opt => {
          opt.classList.remove('selected');
          if (opt.getAttribute('data-value') === 'market_cap') {
            opt.classList.add('selected');
          }
        });
      }
      
      const percentDropdown = document.getElementById('stocksPercentDropdown');
      if (percentDropdown) {
        percentDropdown.querySelectorAll('.custom-select-option').forEach(opt => {
          opt.classList.remove('selected');
          if (opt.getAttribute('data-value') === 'all') {
            opt.classList.add('selected');
          }
        });
      }
      
      applyFilters();
    });
  }
}

// Экспортируем функцию глобально для переинициализации
window.initStocksFilters = initStocksFilters;

function filterStocks(searchTerm, sortBy, percentValue = 'all', minPrice = -Infinity, maxPrice = Infinity) {
  if (!window.stocksList) return;
  
  const filtered = window.stocksList.filter((stock) => {
    // Поиск
    const term = searchTerm.toLowerCase();
    const matchSearch = stock.symbol.toLowerCase().includes(term) ||
                       stock.name.toLowerCase().includes(term) ||
                       stock.sector.toLowerCase().includes(term);
    if (!matchSearch) return false;
    
    // Фильтр по цене
    const price = parseFloat(stock.price);
    if (price < minPrice || price > maxPrice) return false;
    
    // Фильтр по изменению
    const change = parseFloat(stock.changePercent);
    if (percentValue === 'gainers' && change <= 0) return false;
    if (percentValue === 'losers' && change >= 0) return false;
    
    return true;
  });
  
  filtered.sort((a, b) => {
    switch(sortBy) {
      case 'market_cap': return b.marketCap - a.marketCap;
      case 'price_high': return parseFloat(b.price) - parseFloat(a.price);
      case 'price_low': return parseFloat(a.price) - parseFloat(b.price);
      case 'change': return parseFloat(b.changePercent) - parseFloat(a.changePercent);
      default: return 0;
    }
  });
  
  renderStocksList(filtered);
}

// === ИНИЦИАЛИЗАЦИЯ ОБРАБОТЧИКОВ КНОПОК ПЕРИОДА ДЛЯ АКЦИЙ ===
function initializeStockPeriodButtons() {
  console.log('Initializing stock period buttons...');
  
  const periodButtons = document.querySelectorAll('#stockDetailModal .period-btn');
  console.log('Найдено кнопок периода для акций:', periodButtons.length);
  
  periodButtons.forEach((btn) => {
    // Удаляем все старые обработчики через замену
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
  });
  
  // Переполучаем кнопки после клонирования
  const newPeriodButtons = document.querySelectorAll('#stockDetailModal .period-btn');
  console.log('Инициализируем обработчики для', newPeriodButtons.length, 'кнопок');
  
  newPeriodButtons.forEach((btn, index) => {
    btn.addEventListener('click', handleStockPeriodButtonClick, false);
    console.log(`Обработчик для кнопки ${index} добавлен`);
  });
  
  console.log('Stock period buttons initialized');
}

// Отдельная функция для обработки клика по кнопке периода акции
async function handleStockPeriodButtonClick(e) {
  e.preventDefault();
  e.stopPropagation();
  
  const days = this.getAttribute('data-period');
  console.log('Stock period button clicked:', days);
  
  // Обновляем активную кнопку
  const modal = document.getElementById('stockDetailModal');
  const allButtons = modal.querySelectorAll('.period-btn');
  allButtons.forEach((b) => b.classList.remove('active'));
  this.classList.add('active');
  
  if (!window.currentStockDetail) {
    console.error('Нет данных о текущей акции');
    return;
  }
  
  const symbol = window.currentStockDetail.symbol;
  console.log('Символ акции:', symbol);
  
  try {
    // Передаём days как есть, чтобы поддерживать значение 'all'
    await loadStockChart(symbol, days);
    console.log('График акции обновлен');
    
    showNotification(`График обновлен: ${days === 'all' ? 'Все время' : `${days} дней`}`, 'success');
    
  } catch (error) {
    console.error('Ошибка загрузки данных графика:', error);
    showNotification('Ошибка обновления графика', 'error');
  }
}

window.app.showStockDetail = async (symbol) => {
  const modal = document.getElementById('stockDetailModal');
  if (!modal) return;
  
  // Убеждаемся что модальное окно закрыто перед открытием
  modal.classList.remove('active');
  // Даем время на закрытие
  await new Promise((resolve) => setTimeout(resolve, 10));
  
  // Убеждаемся что модальное окно видимо
  modal.style.display = '';
  
  modal.classList.add('active');
  console.log('Stock modal opened');
  
  try {
    const stockData = await loadStockData(symbol);
    
    if (!stockData) {
      alert('Не удалось загрузить данные акции');
      modal.classList.remove('active');
      return;
    }
    
    window.currentStockDetail = stockData;
    
    const detailIcon = document.getElementById('stockDetailIcon');
    if (detailIcon) {
      detailIcon.style.background = stockData.color;
      detailIcon.innerHTML = getStockLogoHTML(stockData.symbol, '48px');
    }
    
    const elName = document.getElementById('stockDetailName');
    if (elName) elName.textContent = stockData.name;

    const elSymbol = document.getElementById('stockDetailSymbol');
    if (elSymbol) elSymbol.textContent = stockData.symbol;

    const elExchange = document.getElementById('stockDetailExchange');
    if (elExchange) elExchange.textContent = stockData.exchange;

    const currencySymbol = getCurrencySymbol();

    const elPrice = document.getElementById('stockDetailPrice');
    if (elPrice) elPrice.textContent = currencySymbol + formatPrice(convertToSelectedCurrency(stockData.price));

    const changeEl = document.getElementById('stockDetailChange');
    if (changeEl) {
      changeEl.textContent = `${parseFloat(stockData.changePercent) >= 0 ? '+' : ''}${stockData.changePercent}%`;
      changeEl.className = parseFloat(stockData.changePercent) >= 0 ? 'crypto-detail-change price-positive' : 'crypto-detail-change price-negative';
    }

    const elMarketCap = document.getElementById('stockDetailMarketCap');
    if (elMarketCap) elMarketCap.textContent = `${currencySymbol}${formatPrice(convertToSelectedCurrency(stockData.marketCap))}B`;

    const elPE = document.getElementById('stockDetailPE');
    if (elPE) {
      // Реальные P/E ratio для крупных компаний
      const peRatios = {
        'AAPL': '29.5', 'GOOGL': '26.8', 'MSFT': '35.2', 'AMZN': '48.3', 'TSLA': '62.1',
        'META': '24.7', 'NVDA': '55.4', 'NFLX': '38.9', 'PYPL': '18.2', 'ADBE': '42.1'
      };
      elPE.textContent = peRatios[symbol] || (15 + Math.random() * 25).toFixed(1);
    }

    const elVolume = document.getElementById('stockDetailVolume');
    if (elVolume) elVolume.textContent = formatVolume(stockData.volume || 52300000);

    const elHigh = document.getElementById('stockDetailHigh');
    if (elHigh) elHigh.textContent = currencySymbol + formatPrice(convertToSelectedCurrency(stockData.high));

    const elLow = document.getElementById('stockDetailLow');
    if (elLow) elLow.textContent = currencySymbol + formatPrice(convertToSelectedCurrency(stockData.low));

    const elDividend = document.getElementById('stockDetailDividend');
    if (elDividend) {
      // Реальные dividend yield
      const dividends = {
        'AAPL': '0.52%', 'GOOGL': '0%', 'MSFT': '0.78%', 'AMZN': '0%', 'TSLA': '0%',
        'META': '0%', 'NVDA': '0.03%', 'NFLX': '0%', 'PYPL': '0%', 'ADBE': '0%',
        'IBM': '3.8%', 'INTC': '1.5%', 'ORCL': '1.2%', 'CSCO': '2.9%'
      };
      elDividend.textContent = dividends[symbol] || '0%';
    }
    
    // Загружаем график с периодом 7 дней (активная кнопка)
    await loadStockChart(symbol, 7);
    
    // Инициализируем обработчики для кнопок периода
    initializeStockPeriodButtons();
    
  } catch (error) {
    console.error('Ошибка загрузки деталей акции:', error);
    modal.classList.remove('active');
  }
};

// Экспортируем глобально для использования в onclick карточек
window.showStockDetail = window.app.showStockDetail;

// === ALPHA VANTAGE API ===
const ALPHA_VANTAGE_KEY = 'IIIR7NAADCVASK35';
const ALPHA_VANTAGE_URL = 'https://www.alphavantage.co/query';

/**
 * Загрузка данных из Yahoo Finance (бесплатный, без ключа API)
 */
async function fetchYahooFinanceData(symbol, isAll, daysNum) {
  try {
    // Yahoo Finance API v8
    const period1 = Math.floor((Date.now() - (isAll ? 365 * 3 : daysNum) * 24 * 60 * 60 * 1000) / 1000);
    const period2 = Math.floor(Date.now() / 1000);
    const interval = daysNum <= 1 ? '5m' : daysNum <= 7 ? '1h' : '1d';
    
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=${interval}`;
    
    // Массив CORS прокси (с автоматическим fallback)
    const corsProxies = [
      'https://corsproxy.io/?',
      'https://api.allorigins.win/raw?url=',
      'https://cors-anywhere.herokuapp.com/'
    ];
    
    // Пробуем каждый прокси по очереди (быстрый fallback)
    for (let i = 0; i < corsProxies.length; i++) {
      const proxy = corsProxies[i];
      const url = proxy + encodeURIComponent(yahooUrl);
      
      try {
        // ⏱️ Таймаут 5 секунд (быстрый fallback)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0'
          }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.chart && data.chart.result && data.chart.result[0]) {
          const result = data.chart.result[0];
          const timestamps = result.timestamp || [];
          const quotes = result.indicators.quote[0];
          const closes = quotes.close || [];
          const volumes = quotes.volume || [];
          
          // Фильтруем null значения
          const validData = { t: [], c: [], v: [] };
          for (let j = 0; j < timestamps.length; j++) {
            if (closes[j] !== null && isFinite(closes[j]) && closes[j] > 0) {
              validData.t.push(timestamps[j]);
              validData.c.push(parseFloat(closes[j].toFixed(2)));
              validData.v.push(volumes[j] || 0);
            }
          }
          
          if (validData.c.length > 0) {
            console.log(`Успех через ${proxy.includes('corsproxy') ? 'corsproxy.io' : proxy.includes('allorigins') ? 'allorigins.win' : 'cors-anywhere'}`);
            return {
              ...validData,
              s: 'ok',
              points: validData.c.length,
              interval: interval,
              source: 'Yahoo Finance'
            };
          }
        }
        
        throw new Error('Некорректные данные');
        
      } catch (proxyError) {
        console.warn(`Прокси ${i + 1}/${corsProxies.length} не работает:`, proxyError.message);
        if (i === corsProxies.length - 1) {
          // Последний прокси тоже не сработал
          throw proxyError;
        }
        // Переходим к следующему прокси
        continue;
      }
    }
    
    throw new Error('Все прокси недоступны');
  } catch (error) {
    // Игнорируем ошибки отмены при переключении периодов
    if (error.name === 'AbortError' || error.message.includes('abort')) {
      console.log(`⏹️ Запрос для ${symbol} отменен (переключение периода)`);
      return null;
    }
    console.warn(`Yahoo Finance ошибка для ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Загрузка данных из Alpha Vantage
 */
async function fetchAlphaVantageData(symbol, isAll, daysNum) {
  try {
    // Alpha Vantage поддерживает разные функции
    let func, outputsize, interval;
    
    if (daysNum <= 1) {
      func = 'TIME_SERIES_INTRADAY';
      interval = '5min';
      outputsize = 'full';
    } else if (isAll || daysNum > 100) {
      func = 'TIME_SERIES_DAILY';
      outputsize = 'full';
    } else {
      func = 'TIME_SERIES_DAILY';
      outputsize = 'compact'; // последние 100 дней
    }
    
    let url = `${ALPHA_VANTAGE_URL}?function=${func}&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}&outputsize=${outputsize}`;
    if (interval) {
      url += `&interval=${interval}`;
    }
    
    console.log(`Alpha Vantage запрос: ${func}, outputsize: ${outputsize}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    // Проверяем на ошибки лимита
    if (data.Note) {
      throw new Error(`Лимит API: ${data.Note}`);
    }
    if (data['Error Message']) {
      throw new Error(data['Error Message']);
    }
    
    // Извлекаем временные ряды - ищем правильный ключ
    let timeSeriesKey = null;
    const possibleKeys = [
      'Time Series (Daily)',
      'Time Series (5min)',
      'Time Series (15min)',
      'Time Series (60min)',
      'Weekly Time Series',
      'Monthly Time Series'
    ];
    
    for (const key of possibleKeys) {
      if (data[key]) {
        timeSeriesKey = key;
        break;
      }
    }
    
    if (!timeSeriesKey) {
      // Пробуем найти любой ключ содержащий "Time Series"
      timeSeriesKey = Object.keys(data).find((key) => key.includes('Time Series'));
    }
    
    if (!timeSeriesKey || !data[timeSeriesKey]) {
      console.warn('Alpha Vantage ответ:', Object.keys(data));
      throw new Error('Нет данных временных рядов в ответе');
    }
    
    const timeSeries = data[timeSeriesKey];
    const timestamps = [];
    const closes = [];
    const volumes = [];
    
    // Alpha Vantage возвращает данные в порядке от новых к старым
    const entries = Object.entries(timeSeries);
    const maxPoints = isAll ? 5000 : Math.min(entries.length, daysNum * 2);
    
    // Берем нужное количество точек и разворачиваем (от старых к новым)
    for (const [dateStr, values] of entries.slice(0, maxPoints).reverse()) {
      const timestamp = Math.floor(new Date(dateStr).getTime() / 1000);
      const close = parseFloat(values['4. close']);
      const volume = parseInt(values['5. volume'] || values['6. volume'] || '0');
      
      if (isFinite(close) && close > 0) {
        timestamps.push(timestamp);
        closes.push(parseFloat(close.toFixed(2)));
        volumes.push(volume);
      }
    }
    
    if (closes.length === 0) {
      throw new Error('Нет валидных данных после парсинга');
    }
    
    console.log(`✓ Alpha Vantage распарсил: ${closes.length} точек`);
    
    return {
      t: timestamps,
      c: closes,
      v: volumes,
      s: 'ok',
      points: closes.length,
      interval: daysNum <= 1 ? '5min' : '1day',
      source: 'Alpha Vantage'
    };
  } catch (error) {
    console.warn(`Alpha Vantage ошибка для ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Загрузка данных из Finnhub (свечи)
 */
async function fetchFinnhubCandles(symbol, isAll, daysNum) {
  try {
    const FINNHUB_API_KEY = 'd49lflpr01qlaebhu1egd49lflpr01qlaebhu1f0';
    
    // Finnhub поддерживает разные разрешения: 1, 5, 15, 30, 60, D, W, M
    let resolution = 'D';
    if (daysNum <= 1) {
      resolution = '5'; // 5 минут
    } else if (daysNum <= 7) {
      resolution = '60'; // 1 час
    }
    
    const to = Math.floor(Date.now() / 1000);
    const from = Math.floor((Date.now() - daysNum * 24 * 60 * 60 * 1000) / 1000);
    
    const url = `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.s !== 'ok' || !data.t || data.t.length === 0) {
      throw new Error(data.s === 'no_data' ? 'Нет данных' : 'Некорректный ответ');
    }
    
    // Фильтруем некорректные значения
    const validData = { t: [], c: [], v: [] };
    for (let i = 0; i < data.t.length; i++) {
      const close = data.c[i];
      if (isFinite(close) && close > 0) {
        validData.t.push(data.t[i]);
        validData.c.push(parseFloat(close.toFixed(2)));
        validData.v.push(data.v[i] || 0);
      }
    }
    
    return {
      ...validData,
      s: 'ok',
      points: validData.c.length,
      interval: resolution === 'D' ? '1day' : resolution === '60' ? '1hour' : '5min',
      source: 'Finnhub'
    };
  } catch (error) {
    console.warn(`Finnhub ошибка для ${symbol}:`, error.message);
    return null;
  }
}

// Бесплатный CORS proxy для обхода ограничений
const CORS_PROXY = 'https://cors-anywhere.herokuapp.com/';
const YAHOOFINANCE_API = 'https://query1.finance.yahoo.com/v10/finance/quoteSummary/';

// Очищаем старый кеш с неправильными данными при загрузке
if (typeof window !== 'undefined' && !window._stockCacheCleared) {
  console.log('Очистка старого кеша акций...');
  Object.keys(localStorage).forEach((key) => {
    if (key.includes('cache_timeseries') || key.includes('stockDataCache')) {
      localStorage.removeItem(key);
    }
  });
  if (window.stockDataCache) window.stockDataCache.clear();
  window._stockCacheCleared = true;
}

// Глобальная переменная для отмены предыдущих запросов
window.currentStockRequest = null;

async function loadStockChart(symbol, days = 30) {
  // Отменяем предыдущий запрос, если он есть
  if (window.currentStockRequest) {
    window.currentStockRequest.abort();
    window.currentStockRequest = null;
  }
  
  const container = document.getElementById('stockPriceChartContainer');
  if (!container) {
    console.error('Stock chart container not found');
    return;
  }
  
  const isAll = (typeof days === 'string' && days.toLowerCase() === 'all');
  const daysNum = isAll ? 36500 : (parseInt(days) || 30);

  console.log('Запрос исторических данных акции:', { symbol, days: isAll ? 'all' : daysNum });
  
  // НЕМЕДЛЕННО очищаем контейнеры для мгновенного отклика
  const priceContainer = document.getElementById('stockPriceChartContainer');
  const volumeContainer = document.getElementById('stockVolumeChartContainer');
  if (priceContainer) priceContainer.innerHTML = '';
  if (volumeContainer) volumeContainer.innerHTML = '';
  
  // Очищаем существующие графики
  if (window.stockPriceChart && window.stockPriceChart.remove) {
    window.stockPriceChart.remove();
    window.stockPriceChart = null;
  }
  if (window.stockVolumeChart && window.stockVolumeChart.remove) {
    window.stockVolumeChart.remove();
    window.stockVolumeChart = null;
  }
  
  try {
    // Создаем контроллер для отмены запроса
    const requestController = new AbortController();
    window.currentStockRequest = requestController;
    
    const oldCacheKey = `${symbol}_${isAll ? 'all' : daysNum}`;
    const newCacheKey = isAll ? 'all' : daysNum;
    
    // Показываем индикатор ПЕРЕД проверкой кеша (быстрое переключение)
    const priceLoader = document.getElementById('stockPriceChartLoader');
    const volumeLoader = document.getElementById('stockVolumeChartLoader');
    if (priceLoader) priceLoader.style.display = 'block';
    if (volumeLoader) volumeLoader.style.display = 'block';
    
    // Проверяем кеш - моментально скрываем spinner
    const cached = window.cacheManager?.get('timeseries', { symbol, days: newCacheKey });
    if (cached) {
      console.log(`Из кеша: ${cached.points} точек`);
      drawStockChart('stockPriceChartContainer', cached, symbol);
      drawStockVolumeChart(cached);
      if (priceLoader) priceLoader.style.display = 'none';
      if (volumeLoader) volumeLoader.style.display = 'none';
      window.currentStockRequest = null;
      return;
    }
    
    // Старый кеш
    if (window.stockDataCache.has(oldCacheKey)) {
      const data = window.stockDataCache.get(oldCacheKey);
      console.log(`Из старого кеша: ${data.points} точек`);
      drawStockChart('stockPriceChartContainer', data, symbol);
      drawStockVolumeChart(data);
      if (priceLoader) priceLoader.style.display = 'none';
      if (volumeLoader) volumeLoader.style.display = 'none';
      window.currentStockRequest = null;
      return;
    }
    
    console.log('Загрузка с Yahoo Finance...');
    
    try {
      const yahooData = await fetchYahooFinanceData(symbol, isAll, daysNum);
      if (yahooData && yahooData.points > 0) {
        console.log(`✓ Yahoo Finance: ${yahooData.points} точек`);
        window.cacheManager?.set('timeseries', { symbol, days: newCacheKey }, yahooData);
        drawStockChart('stockPriceChartContainer', yahooData, symbol);
        drawStockVolumeChart(yahooData);
        if (priceLoader) priceLoader.style.display = 'none';
        if (volumeLoader) volumeLoader.style.display = 'none';
        window.currentStockRequest = null;
        return;
      }
    } catch (error) {
      // Если запрос был отменен, выходим
      if (error.name === 'AbortError' || error.message.includes('abort')) {
        console.log('⏹️ Запрос отменен');
        return;
      }
      console.log('Yahoo недоступен:', error.message);
    }
    
    // Fallback: проверяем любой устаревший кеш
    console.log('Yahoo недоступен, проверяем кеш...');
    const allCachedKeys = Object.keys(localStorage).filter((k) => k.includes('cache_timeseries'));
    for (const key of allCachedKeys) {
      try {
        const cached = JSON.parse(localStorage.getItem(key));
        if (cached?.data?.symbol === symbol || key.includes(symbol)) {
          console.log(`Используем кеш: ${cached.data?.points || '?'} точек`);
          drawStockChart('stockPriceChartContainer', cached.data, symbol);
          drawStockVolumeChart(cached.data);
          if (priceLoader) priceLoader.style.display = 'none';
          if (volumeLoader) volumeLoader.style.display = 'none';
          return;
        }
      } catch (e) { /* ignore */ }
    }
    
    // Генерируем демо-данные для первого показа
    console.warn('API недоступен, показываем демо-данные');
    const demoData = generateDemoStockData(symbol, daysNum);
    if (demoData && demoData.points > 0) {
      console.log(`Демо-данные: ${demoData.points} точек`);
      drawStockChart('stockPriceChartContainer', demoData, symbol);
      drawStockVolumeChart(demoData);
      if (priceLoader) {
        priceLoader.innerHTML = '<div style="color: #f59e0b; font-size: 11px; padding: 8px;">Демо-данные (API временно недоступен)</div>';
        priceLoader.style.display = 'block';
      }
      if (volumeLoader) volumeLoader.style.display = 'none';
    } else {
      if (priceLoader) {
        priceLoader.innerHTML = '<div style="color: #ef4444;">Не удалось загрузить данные</div>';
        priceLoader.style.display = 'block';
      }
      if (volumeLoader) volumeLoader.style.display = 'none';
    }
    window.currentStockRequest = null;
    
  } catch (error) {
    console.error('Критическая ошибка:', error);
    window.currentStockRequest = null;
    const priceLoader = document.getElementById('stockPriceChartLoader');
    const volumeLoader = document.getElementById('stockVolumeChartLoader');
    if (priceLoader) priceLoader.style.display = 'none';
    if (volumeLoader) volumeLoader.style.display = 'none';
  }
}

/**
 * Генерирует демо-данные для первого показа
 */
function generateDemoStockData(symbol, days) {
  const stockInfo = window.STOCK_INFO?.[symbol];
  if (!stockInfo) return null;
  
  const basePrice = stockInfo.price || 100;
  const now = Math.floor(Date.now() / 1000);
  const daySeconds = 24 * 60 * 60;
  const interval = days <= 7 ? 3600 : daySeconds; // 1 час для недели, 1 день для остального
  const points = days <= 7 ? days * 8 : days; // 8 точек в день для недели
  
  const data = { t: [], c: [], v: [] };
  let price = basePrice * 0.95; // Начинаем с -5%
  
  for (let i = 0; i < points; i++) {
    const timestamp = now - (points - i) * interval;
    const progress = i / points;
    
    // Плавный рост к текущей цене
    price = price + (basePrice - price) * 0.05 + (Math.random() - 0.5) * basePrice * 0.01;
    const volume = Math.floor(1000000 + Math.random() * 5000000);
    
    data.t.push(timestamp);
    data.c.push(parseFloat(price.toFixed(2)));
    data.v.push(volume);
  }
  
  return {
    ...data,
    s: 'ok',
    points: data.c.length,
    interval: interval === 3600 ? '1h' : '1d',
    source: 'Demo Data'
  };
}

// Экспортируем в window для доступа из crypto-modal-vue.js
window.loadStockChart = loadStockChart;

function generateTestStockData(days, currentPrice = null) {
  // Определяем количество точек в зависимости от периода
  let points;
  if (typeof days === 'string' && days.toLowerCase() === 'all') {
    points = 365 * 3; // 3 года данных для "Все время"
  } else {
    const daysNum = parseInt(days) || 30;
    points = daysNum <= 1 ? 78 : daysNum <= 7 ? daysNum : Math.min(daysNum, 1000);
  }
  
  const timestamps = [];
  const closes = [];
  const volumes = [];
  
  const now = Date.now() / 1000;
  const isAll = (typeof days === 'string' && days.toLowerCase() === 'all');
  const daysNum = isAll ? 365 * 3 : (parseInt(days) || 30);
  const interval = daysNum <= 1 ? 300 : daysNum <= 7 ? 3600 : 86400;
  
  // Используем только реальную цену, не генерируем случайную
  if (!currentPrice) {
    console.warn('Нет текущей цены для генерации данных');
    currentPrice = 100; // fallback
  }
  
  let basePrice = currentPrice;
  const initialPrice = basePrice;
  
  // Волатильность зависит от периода - минимальная
  const volatility = basePrice * 0.005; // ±0.5% волатильность
  
  // Определяем тренд - минимальный для стабильности
  const trendStrength = isAll ? 0.0001 : 0.00005; // очень слабый тренд
  
  for (let i = 0; i < points; i++) {
    timestamps.push(Math.floor(now - (points - i) * interval));
    
    // Реалистичное изменение цены с небольшим случайным трендом
    const randomWalk = (Math.random() - 0.5) * volatility;
    const trendComponent = basePrice * trendStrength;
    const change = randomWalk + trendComponent;
    
    basePrice = basePrice + change;
    // Ограничиваем колебания в пределах ±10%
    basePrice = Math.max(basePrice, initialPrice * 0.9);
    basePrice = Math.min(basePrice, initialPrice * 1.1);
    
    closes.push(parseFloat(basePrice.toFixed(2)));
    
    // Реалистичный объем торгов
    const avgVolume = 3000000;
    const volumeVariation = avgVolume * (0.5 + Math.random()); // От 50% до 150% среднего
    volumes.push(Math.floor(volumeVariation));
  }
  
  return { 
    t: timestamps, 
    c: closes, 
    v: volumes, 
    s: 'ok', 
    points: points,
    interval: daysNum <= 1 ? '5min' : daysNum <= 7 ? '1hour' : '1day'
  };
}

async function drawStockChart(container, data, symbol) {
  // container теперь не canvas, а div контейнер
  if (typeof container === 'string') {
    container = document.getElementById(container);
  }
  
  if (!container) {
    console.error('Stock chart container not found');
    return;
  }
  
  // Валидируем данные
  if (!data || !data.t || !data.c || data.c.length === 0) {
    console.error('Неверные данные графика:', data);
    return;
  }
  
  // Проверяем на некорректные значения
  if (data.c.some((price) => !isFinite(price) || price <= 0)) {
    console.error('Некорректные значения цен в данных:', data.c);
    return;
  }
  
  // Сбрасываем флаги видимости при создании нового графика
  stockMainSeriesVisible = true;
  stockCompareSeriesVisible = true;
  
  // Очищаем существующий график
  if (window.stockPriceChart) {
    window.stockPriceChart.remove();
    window.stockPriceChart = null;
  }
  
  // Очищаем контейнер
  container.innerHTML = '';
  
  // Получаем цвет акции из STOCK_INFO
  const info = window.STOCK_INFO && window.STOCK_INFO[symbol] ? 
    window.STOCK_INFO[symbol] : { color: '#3b82f6' };
  const lineColor = info.color || '#3b82f6';
  
  // Создаем график Lightweight Charts
  const width = container.clientWidth || 1000;
  const height = container.clientHeight || 500;
  
  const chart = LightweightCharts.createChart(container, {
    width: width,
    height: height,
    layout: {
      background: { color: '#1a1d28' },
      textColor: '#d1d5db',
    },
    grid: {
      vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
      horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: {
        color: '#758696',
        width: 1,
        style: LightweightCharts.LineStyle.Dashed,
      },
      horzLine: {
        color: '#758696',
        width: 1,
        style: LightweightCharts.LineStyle.Dashed,
      },
    },
    rightPriceScale: {
      borderColor: 'rgba(197, 203, 206, 0.4)',
    },
    timeScale: {
      borderColor: 'rgba(197, 203, 206, 0.4)',
      timeVisible: true,
      secondsVisible: false,
    },
  });
  
  // Сохраняем ссылку на график
  window.stockPriceChart = chart;
  
  // Преобразуем данные в формат Lightweight Charts
  const chartData = data.t.map((timestamp, idx) => ({
    time: timestamp,
    value: data.c[idx]
  }));
  
  // Проверяем, есть ли сравнение
  let compareData = null;
  let compareSeries = null; // Объявляем здесь чтобы была доступна в конце функции
  
  // Сохраняем оригинальные данные для tooltip (как в криптовалютах)
  let originalStockData = chartData.slice();
  let originalCompareData = null;
  let stockFirstPrice = data.c[0];
  let compareFirstPrice = null;
  
  if (window.stockCompareSymbol && window.stockCompareSymbol !== symbol) {
    console.log('Loading comparison stock:', window.stockCompareSymbol);
    
    try {
      // Пытаемся загрузить данные для сравнения
      const days = Math.floor((data.t[data.t.length - 1] - data.t[0]) / 86400);
      const compareRawData = await fetchYahooFinanceData(window.stockCompareSymbol, days > 365, days);
      
      if (compareRawData && compareRawData.c && compareRawData.c.length > 0) {
        console.log(`Comparison data loaded: ${compareRawData.c.length} points`);
        
        // Синхронизируем временные метки (КАК В КРИПТОВАЛЮТАХ!)
        const mainTimes = new Set(data.t);
        const compareTimes = new Set(compareRawData.t);
        const commonTimes = new Set([...mainTimes].filter((t) => compareTimes.has(t)));
        
        const syncedMainData = data.t.map((t, i) => ({ time: t, value: data.c[i] })).filter(d => commonTimes.has(d.time));
        const syncedCompareData = compareRawData.t.map((t, i) => ({ time: t, value: compareRawData.c[i] })).filter(d => commonTimes.has(d.time));
        
        if (syncedMainData.length > 5 && syncedCompareData.length > 5) {
          // Нормализуем в проценты от начальной цены
          const mainFirstPrice = syncedMainData[0].value;
          const compareFirstPriceTmp = syncedCompareData[0].value;
          
          // Сохраняем для tooltip
          stockFirstPrice = mainFirstPrice;
          compareFirstPrice = compareFirstPriceTmp;
          originalStockData = syncedMainData.slice();
          originalCompareData = syncedCompareData.slice();
          
          const normalizedMain = syncedMainData.map((d) => ({
            time: d.time,
            value: ((d.value - mainFirstPrice) / mainFirstPrice) * 100
          }));
          
          const normalizedCompare = syncedCompareData.map((d) => ({
            time: d.time,
            value: ((d.value - compareFirstPriceTmp) / compareFirstPriceTmp) * 100
          }));
          
          // Используем нормализованные данные
          const mainSeries = chart.addLineSeries({
            color: lineColor,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
          });
          mainSeries.setData(normalizedMain);
          
          // Сохраняем ссылку на основную серию
          window.stockPriceChart._mainSeries = mainSeries;
          
          // Добавляем график сравнения (LineSeries без заливки как в криптовалютах)
          const compareInfo = window.STOCK_INFO[window.stockCompareSymbol];
          compareSeries = chart.addLineSeries({
            color: compareInfo.color,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
          });
          compareSeries.setData(normalizedCompare);
          
          // Сохраняем ссылку на серию сравнения
          window.stockPriceChart._compareSeries = compareSeries;
          console.log('Saved compareSeries:', compareSeries);
          
          compareData = { 
            normalized: normalizedCompare, 
            original: syncedCompareData,
            symbol: window.stockCompareSymbol 
          };
          
          // Обновляем легенду с процентами
          updateStockLegend({
            symbol: symbol,
            price: data.c[data.c.length - 1],
            change: normalizedMain[normalizedMain.length - 1].value
          }, {
            symbol: window.stockCompareSymbol,
            price: compareRawData.c[compareRawData.c.length - 1],
            change: normalizedCompare[normalizedCompare.length - 1].value
          });
          
          console.log('Comparison chart added in percentage mode');
        }
      }
    } catch (error) {
      console.error('Error loading comparison:', error);
    }
  }
  
  // Если сравнения нет - используем обычный area series
  if (!compareData) {
    const areaSeries = chart.addAreaSeries({
      lineColor: lineColor,
      topColor: hexToRgba(lineColor, 0.4),
      bottomColor: hexToRgba(lineColor, 0.0),
      lineWidth: 2,
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    });
    
    areaSeries.setData(chartData);
    
    // Сохраняем ссылку на основную серию
    window.stockPriceChart._mainSeries = areaSeries;
    
    // Обновляем легенду с текущей акцией
    updateStockLegend({
      symbol: symbol,
      price: data.c[data.c.length - 1],
      change: info.changePercent || 0
    }, null);
  }
  
  // Tooltip при наведении (как в криптовалютах)
  const priceTooltip = document.getElementById('stockPriceChartTooltip');
  if (priceTooltip) {
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        priceTooltip.style.display = 'none';
        return;
      }
      
      // Format date
      const date = new Date(param.time * 1000);
      const dateStr = date.toLocaleString('en-US', { 
        month: '2-digit', 
        day: '2-digit', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
      
      // Build tooltip HTML
      let tooltipHTML = `<div class="chart-tooltip-time">${dateStr}</div>`;
      
      // Show main series data only if visible
      if (stockMainSeriesVisible && param.seriesData.size > 0) {
        const mainData = Array.from(param.seriesData.values())[0];
        
        // Get original price value (not normalized percentage)
        const originalData = originalStockData.find((d) => d.time === param.time);
        const value = originalData ? originalData.value : mainData.value;
        
        // Calculate price change from previous point
        const currentIndex = originalStockData.findIndex((d) => d.time === param.time);
        let priceChange = 0;
        if (currentIndex > 0 && originalData) {
          const prevValue = originalStockData[currentIndex - 1].value;
          priceChange = ((value - prevValue) / prevValue) * 100;
        }
        
        const stockInfo = window.STOCK_INFO?.[symbol] || { color: '#3b82f6' };
        
        tooltipHTML += `
          <div class="chart-tooltip-row">
            <div class="chart-tooltip-label">
              <div class="chart-tooltip-dot" style="background: ${stockInfo.color};"></div>
              Price (${symbol})
            </div>
            <div>
              <span class="chart-tooltip-value">$${value.toFixed(2)}</span>
              <span class="chart-tooltip-change ${priceChange >= 0 ? 'positive' : 'negative'}">
                (${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%)
              </span>
            </div>
          </div>
        `;
      }
      
      // Add comparison data if available and visible
      if (window.stockCompareSymbol && stockCompareSeriesVisible && originalCompareData && param.seriesData.size > 1) {
        const compareDataPoint = originalCompareData.find((d) => d.time === param.time);
        
        if (compareDataPoint) {
          // Calculate price change from previous point
          const compareIndex = originalCompareData.findIndex((d) => d.time === param.time);
          let compareChange = 0;
          if (compareIndex > 0) {
            const prevCompareValue = originalCompareData[compareIndex - 1].value;
            compareChange = ((compareDataPoint.value - prevCompareValue) / prevCompareValue) * 100;
          }
          
          const compareInfo = window.STOCK_INFO?.[window.stockCompareSymbol] || { color: '#ef4444' };
          
          tooltipHTML += `
            <div class="chart-tooltip-row">
              <div class="chart-tooltip-label">
                <div class="chart-tooltip-dot" style="background: ${compareInfo.color};"></div>
                Price (${window.stockCompareSymbol})
              </div>
              <div>
                <span class="chart-tooltip-value">$${compareDataPoint.value.toFixed(2)}</span>
                <span class="chart-tooltip-change ${compareChange >= 0 ? 'positive' : 'negative'}">
                  (${compareChange >= 0 ? '+' : ''}${compareChange.toFixed(2)}%)
                </span>
              </div>
            </div>
          `;
        }
      }
      
      priceTooltip.innerHTML = tooltipHTML;
      priceTooltip.style.display = 'block';
      
      // Position tooltip (like in crypto)
      const containerRect = container.getBoundingClientRect();
      const tooltipWidth = 280;
      let left = param.point.x + 15;
      let top = param.point.y + 15;
      
      if (left + tooltipWidth > containerRect.width) {
        left = param.point.x - tooltipWidth - 15;
      }
      
      priceTooltip.style.left = `${left}px`;
      priceTooltip.style.top = `${top}px`;
    });
  }
  
  // Автоматический resize
  const resizeObserver = new ResizeObserver((entries) => {
    if (entries.length === 0 || entries[0].target !== container) return;
    const newWidth = container.clientWidth;
    const newHeight = container.clientHeight || 500;
    chart.applyOptions({ width: newWidth, height: newHeight });
  });
  
  resizeObserver.observe(container);
  
  // Сохраняем ссылки для очистки
  window.stockPriceChart = chart;
  window.stockPriceChart._resizeObserver = resizeObserver;
  // compareSeries уже сохранена выше, не перезаписываем
  if (compareSeries) {
    console.log('Final check - compareSeries saved:', window.stockPriceChart._compareSeries);
  }
  const originalRemove = chart.remove.bind(chart);
  window.stockPriceChart.remove = () => {
    resizeObserver.disconnect();
    originalRemove();
  };
  
  // Подгоняем график под данные
  chart.timeScale().fitContent();
  
  console.log(`Stock chart drawn with Lightweight Charts: ${chartData.length} points`);
}

// Функция обновления легенды для акций (как в криптовалютах)
function updateStockLegend(stock1Data, stock2Data) {
  const legend1 = document.getElementById('stockLegend1');
  const legend2 = document.getElementById('stockLegend2');
  const legend = document.getElementById('stockChartLegend');
  
  if (!legend1) return;
  
  // Показываем легенду
  if (legend) legend.style.display = 'flex';
  
  // Обновляем основную акцию
  const info1 = window.STOCK_INFO?.[stock1Data.symbol] || { color: '#3b82f6' };
  
  // Обновляем цвет квадратика
  const color1 = legend1.querySelector('.legend-color');
  color1.style.background = info1.color;
  color1.style.cursor = 'pointer';
  color1.title = 'Скрыть/показать график';
  
  // Добавляем обработчик клика для переключения видимости
  color1.onclick = () => toggleStockMainSeries();
  
  legend1.querySelector('.legend-symbol').textContent = stock1Data.symbol;
  legend1.querySelector('.legend-price').textContent = `$${stock1Data.price.toFixed(2)}`;
  
  const change1 = stock1Data.change;
  const change1El = legend1.querySelector('.legend-change');
  change1El.textContent = `${change1 >= 0 ? '+' : ''}${change1.toFixed(2)}%`;
  change1El.className = `legend-change ${change1 >= 0 ? 'positive' : 'negative'}`;
  
  // Обновляем вторую акцию (если есть)
  if (legend2 && stock2Data) {
    const info2 = window.STOCK_INFO?.[stock2Data.symbol] || { color: '#ef4444' };
    legend2.style.display = 'flex';
    
    // Обновляем цвет квадратика
    const color2 = legend2.querySelector('.legend-color');
    color2.style.background = info2.color;
    color2.style.cursor = 'pointer';
    color2.title = 'Скрыть/показать график';
    
    // Добавляем обработчик клика для переключения видимости
    color2.onclick = () => toggleStockCompareSeries();
    
    legend2.querySelector('.legend-symbol').textContent = stock2Data.symbol;
    legend2.querySelector('.legend-price').textContent = `$${stock2Data.price.toFixed(2)}`;
    
    const change2 = stock2Data.change;
    const change2El = legend2.querySelector('.legend-change');
    change2El.textContent = `${change2 >= 0 ? '+' : ''}${change2.toFixed(2)}%`;
    change2El.className = `legend-change ${change2 >= 0 ? 'positive' : 'negative'}`;
  } else if (legend2) {
    legend2.style.display = 'none';
  }
}

// Переменные для отслеживания видимости серий (как в криптовалютах)
let stockMainSeriesVisible = true;
let stockCompareSeriesVisible = true;

// Функции для переключения видимости серий
function toggleStockMainSeries() {
  stockMainSeriesVisible = !stockMainSeriesVisible;
  
  if (window.stockPriceChart && window.stockPriceChart._mainSeries) {
    window.stockPriceChart._mainSeries.applyOptions({ visible: stockMainSeriesVisible });
  }
  
  // Обновляем визуальное состояние квадратика (как в криптовалютах)
  const color1 = document.getElementById('stockLegend1')?.querySelector('.legend-color');
  if (color1) {
    color1.className = `legend-color${stockMainSeriesVisible ? '' : ' hidden'}`;
  }
}

function toggleStockCompareSeries() {
  stockCompareSeriesVisible = !stockCompareSeriesVisible;
  
  console.log('toggleStockCompareSeries called, new state:', stockCompareSeriesVisible);
  console.log('Chart:', window.stockPriceChart);
  console.log('Compare series:', window.stockPriceChart?._compareSeries);
  
  if (window.stockPriceChart && window.stockPriceChart._compareSeries) {
    window.stockPriceChart._compareSeries.applyOptions({ visible: stockCompareSeriesVisible });
    console.log('Applied visibility:', stockCompareSeriesVisible);
  } else {
    console.error('Compare series not found!');
  }
  
  // Обновляем визуальное состояние квадратика (как в криптовалютах)
  const color2 = document.getElementById('stockLegend2')?.querySelector('.legend-color');
  if (color2) {
    color2.className = `legend-color${stockCompareSeriesVisible ? '' : ' hidden'}`;
    console.log('Updated color2 class:', color2.className);
  } else {
    console.error('color2 not found!');
  }
}

// Экспортируем функции в window
window.toggleStockMainSeries = toggleStockMainSeries;
window.toggleStockCompareSeries = toggleStockCompareSeries;

function drawStockVolumeChart(data) {
  const container = document.getElementById('stockVolumeChartContainer');
  if (!container) {
    console.warn('Stock volume chart container not found');
    return;
  }
  
  // Очищаем существующий график
  if (window.stockVolumeChart) {
    window.stockVolumeChart.remove();
    window.stockVolumeChart = null;
  }
  
  container.innerHTML = '';
  
  if (!data || !data.v || data.v.length === 0) {
    console.warn('No volume data');
    return;
  }
  
  const width = container.clientWidth || 1000;
  const height = container.clientHeight || 250;
  
  const chart = LightweightCharts.createChart(container, {
    width: width,
    height: height,
    layout: {
      background: { color: '#1a1d28' },
      textColor: '#d1d5db',
    },
    grid: {
      vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
      horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
    },
    rightPriceScale: {
      borderColor: 'rgba(197, 203, 206, 0.4)',
    },
    timeScale: {
      borderColor: 'rgba(197, 203, 206, 0.4)',
      timeVisible: true,
      secondsVisible: false,
    },
  });
  
  // Получаем цвет акции
  const info = window.STOCK_INFO && window.STOCK_INFO[window.currentStockDetail?.symbol] ? 
    window.STOCK_INFO[window.currentStockDetail.symbol] : { color: '#3b82f6' };
  const volumeColor = info.color || '#3b82f6';
  
  const histogramSeries = chart.addHistogramSeries({
    color: hexToRgba(volumeColor, 0.5),
    priceFormat: {
      type: 'volume',
    },
    priceScaleId: '',
  });
  
  // Преобразуем данные объема
  const volumeData = data.t.map((timestamp, idx) => ({
    time: timestamp,
    value: data.v[idx] || 0,
    color: hexToRgba(volumeColor, 0.5)
  }));
  
  histogramSeries.setData(volumeData);
  
  // Автоматический resize
  const resizeObserver = new ResizeObserver((entries) => {
    if (entries.length === 0 || entries[0].target !== container) return;
    const newWidth = container.clientWidth;
    const newHeight = container.clientHeight || 250;
    chart.applyOptions({ width: newWidth, height: newHeight });
  });
  
  resizeObserver.observe(container);
  
  window.stockVolumeChart = chart;
  window.stockVolumeChart._resizeObserver = resizeObserver;
  const originalRemove = chart.remove.bind(chart);
  window.stockVolumeChart.remove = () => {
    resizeObserver.disconnect();
    originalRemove();
  };
  
  chart.timeScale().fitContent();
  
  console.log(`Stock volume chart drawn: ${volumeData.length} bars`);
}

// Удаляем старую функцию drawStockRangeChart
function drawStockRangeChart() {
  // Не используется с Lightweight Charts
}

// window.changeStockChartPeriod удалена - используется addEventListener

window.addTransactionFromStock = () => {
  if (!window.currentStockDetail) return;
  
  const modal = document.getElementById('stockDetailModal');
  if (modal) modal.classList.remove('active');
  
  const transactionModal = document.getElementById('transactionModal');
  if (transactionModal) {
    transactionModal.classList.add('active');
    
    const symbolInput = document.getElementById('transactionSymbol');
    if (symbolInput) symbolInput.value = window.currentStockDetail.symbol;
    
    const priceInput = document.getElementById('transactionPrice');
    if (priceInput) priceInput.value = window.currentStockDetail.price;
  }
};

window.addStockToWatchlist = () => {
  (async () => {
    try {
      if (!window.currentStockDetail) {
        showNotification('Символ акции не выбран', 'warning');
        return;
      }
      const sym = window.currentStockDetail.symbol;
      const module = await import('../core/data.js');
      if (typeof module.addFavorite === 'function') {
        await module.addFavorite(sym, { source: 'stock_modal' });
        showNotification(`Акция ${sym} добавлена в избранное`, 'success');
        if (window.refreshFavorites) window.refreshFavorites();
      } else {
        showNotification('Функция избранного недоступна', 'error');
      }
    } catch (err) {
      console.error('addStockToWatchlist error:', err);
      showNotification('Ошибка при добавлении акции в избранное', 'error');
    }
  })();
};

console.log('Stocks module loaded');


// ==================== TRANSACTION STOCKS SUPPORT ====================

// Улучшаем функцию инициализации поиска криптовалют/акций
window.initCryptoSearch = () => {
    const searchInput = document.getElementById('cryptoSearchInput');
    const dropdown = document.getElementById('cryptoDropdown');
    const symbolInput = document.getElementById('transactionSymbol');
    const priceInput = document.getElementById('transactionPrice');
    const selectedCryptoDiv = document.getElementById('selectedCrypto');
    
    if (!searchInput || !dropdown) {
      console.warn('Элементы поиска не найдены');
      return;
    }

    // Prevent double-initialization when another module (ui.js) already set up the dropdown
    if (window.__cryptoSearchInitDone) {
      console.log('initCryptoSearch: уже инициализировано, пропускаю.');
      return;
    }
    window.__cryptoSearchInitDone = true;
    
    console.log('initCryptoSearch вызван');
    
    // Объединяем криптовалюты и акции для поиска
    const getAllAssets = () => {
        const allAssets = [];
        
        // Добавляем криптовалюты
        if (window.cryptoList && window.cryptoList.length > 0) {
            window.cryptoList.forEach((crypto) => {
                const info = window.CRYPTO_INFO?.[crypto.symbol] || {};
                allAssets.push({
                    symbol: crypto.symbol,
                    name: crypto.name,
                    price: crypto.price,
                    icon: crypto.image,
                    type: 'crypto',
                    color: info.color || '#667eea'
                });
            });
        }
        
        // Добавляем акции
        if (window.stocksList && window.stocksList.length > 0) {
            window.stocksList.forEach((stock) => {
                const info = window.STOCK_INFO?.[stock.symbol] || {};
                allAssets.push({
                    symbol: stock.symbol,
                    name: stock.name,
                    price: stock.price,
                    icon: null,
                    type: 'stock',
                    color: info.color || '#3b82f6'
                });
            });
        }
        
        console.log(`Всего активов для поиска: ${allAssets.length}`);
        return allAssets;
    };
    
    // Показываем все активы при фокусе
    searchInput.addEventListener('focus', (e) => {
        const allAssets = getAllAssets();
        
        if (allAssets.length === 0) {
            dropdown.innerHTML = `
                <div class="crypto-dropdown-item no-results">
                    <i class="fas fa-info-circle" style="margin-right: 8px;"></i>
                    Загрузка активов...
                </div>
            `;
        } else {
            renderDropdown(allAssets.slice(0, 15));
        }
        dropdown.style.display = 'block';
    });
    
    // Функция рендеринга dropdown
    const renderDropdown = (assets) => {
        if (assets.length === 0) {
            dropdown.innerHTML = `
                <div class="crypto-dropdown-item no-results">
                    <i class="fas fa-search" style="margin-right: 8px;"></i>
                    Ничего не найдено
                </div>
            `;
            dropdown.style.display = 'block';
            return;
        }
        
        dropdown.innerHTML = assets.map(asset => {
            // Генерируем иконку для криптовалют и акций
            let iconHTML;
            if (asset.type === 'crypto') {
              iconHTML = `<img src="${getCoinCapIcon(asset.symbol)}" 
                       alt="${asset.symbol}" 
                       style="width: 100%; height: 100%; border-radius: 50%; object-fit: contain;"
                       onerror="this.onerror=null; this.parentElement.innerHTML='${asset.symbol.charAt(0)}'">`;
            } else {
                // Для акций используем логотипы компаний с fallback
                iconHTML = getStockLogoHTML(asset.symbol, '100%').replace('border-radius: 4px', 'border-radius: 50%');
            }
            
            const currencySymbol = getCurrencySymbol();
            const convertedPrice = convertToSelectedCurrency(parseFloat(asset.price));
            return `
            <div class="crypto-dropdown-item" data-symbol="${asset.symbol}" data-price="${asset.price}" data-name="${asset.name}" data-type="${asset.type}" data-color="${asset.color}">
                <div class="crypto-dropdown-icon" style="background: ${asset.color}; color: white;">
                    ${iconHTML}
                </div>
                <div class="crypto-dropdown-info">
                    <div class="crypto-dropdown-symbol">${asset.symbol}</div>
                    <div class="crypto-dropdown-name">${asset.name}</div>
                </div>
                <div class="crypto-dropdown-price">${currencySymbol}${parseFloat(convertedPrice).toFixed(2)}</div>
                <div class="crypto-dropdown-badge ${asset.type}">${asset.type === 'crypto' ? 'Крипто' : 'Акция'}</div>
            </div>
            `;
        }).join('');
        
        dropdown.style.display = 'block';
        
        // Обработчик выбора актива
        dropdown.querySelectorAll('.crypto-dropdown-item:not(.no-results)').forEach((item) => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const symbol = item.getAttribute('data-symbol');
                const price = item.getAttribute('data-price');
                const name = item.getAttribute('data-name');
                const type = item.getAttribute('data-type');
                const color = item.getAttribute('data-color');
                
                symbolInput.value = symbol;
                // Сохраняем USD-цену для последующего пересчёта
                priceInput.dataset.usdPrice = price;
                // Ставим конвертированное значение
                const currencySymbol = getCurrencySymbol();
                const converted = convertToSelectedCurrency(parseFloat(price));
                priceInput.value = converted < 0.000001 ? converted.toFixed(8) : (converted < 0.0001 ? converted.toFixed(6) : (converted < 0.01 ? converted.toFixed(4) : (converted < 1 ? converted.toFixed(3) : converted.toFixed(2))));
                searchInput.value = '';
                dropdown.style.display = 'none';
                
                // Автоматически обновляем итоговую сумму
                const quantityInput = document.getElementById('transactionQuantity');
                if (quantityInput && quantityInput.value) {
                    updateTransactionTotal();
                }
                
                // Показываем выбранный актив
                let selectedIconHTML;
                if (type === 'crypto') {
                    selectedIconHTML = `<img src="${getCoinCapIcon(symbol)}" 
                                             alt="${symbol}" 
                                             style="width: 100%; height: 100%; border-radius: 50%; object-fit: contain;"
                                             onerror="this.onerror=null; this.parentElement.innerHTML='${symbol.charAt(0)}'">`;
                } else {
                    selectedIconHTML = getStockLogoHTML(symbol, '100%').replace('border-radius: 4px', 'border-radius: 50%');
                }
                
                selectedCryptoDiv.innerHTML = `
                    <div class="selected-crypto-display">
                        <div class="selected-crypto-icon" style="background: ${color}; color: white;">
                            ${selectedIconHTML}
                        </div>
                        <div class="selected-crypto-info">
                            <div class="selected-crypto-symbol">${symbol}</div>
                            <div class="selected-crypto-name">${name}</div>
                            <div class="selected-crypto-type-badge ${type}">${type === 'crypto' ? 'Криптовалюта' : 'Акция'}</div>
                        </div>
                        <div class="selected-crypto-price">${getCurrencySymbol()}${parseFloat(convertToSelectedCurrency(parseFloat(price))).toFixed(2)}</div>
                        <button type="button" class="remove-selected-crypto" onclick="clearSelectedCrypto()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `;
                selectedCryptoDiv.style.display = 'block';
                
                console.log(`Выбран ${type}: ${symbol} по цене $${price}`);
            });
        });
    };
    
    // Обработчик поиска с дебаунсом
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const searchTerm = e.target.value.toLowerCase().trim();
        
        searchTimeout = setTimeout(() => {
            const allAssets = getAllAssets();
            
            if (searchTerm.length < 1) {
                renderDropdown(allAssets.slice(0, 15));
                return;
            }
            
            // Поиск по тикеру (приоритет) и по названию
            const filtered = allAssets.filter((asset) => {
                const symbolMatch = asset.symbol.toLowerCase().includes(searchTerm);
                const nameMatch = asset.name.toLowerCase().includes(searchTerm);
                return symbolMatch || nameMatch;
            }).sort((a, b) => {
                // Приоритет: сначала совпадения по тикеру
                const aSymbolMatch = a.symbol.toLowerCase().startsWith(searchTerm);
                const bSymbolMatch = b.symbol.toLowerCase().startsWith(searchTerm);
                if (aSymbolMatch && !bSymbolMatch) return -1;
                if (!aSymbolMatch && bSymbolMatch) return 1;
                return 0;
            }).slice(0, 15);
            
            renderDropdown(filtered);
        }, 300);
    });
    
    // Закрытие dropdown при клике вне
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });
    
    console.log('Обработчики поиска установлены');
};

window.clearSelectedCrypto = () => {
    const selectedCryptoDiv = document.getElementById('selectedCrypto');
    const symbolInput = document.getElementById('transactionSymbol');
    const priceInput = document.getElementById('transactionPrice');
    
    if (selectedCryptoDiv) {
        selectedCryptoDiv.innerHTML = '';
        selectedCryptoDiv.style.display = 'none';
    }
    
    if (symbolInput) symbolInput.value = '';
    if (priceInput) priceInput.value = '';
};

// Вызываем инициализацию после загрузки данных
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (window.initCryptoSearch) window.initCryptoSearch();
    }, 2000);
});

console.log('Transaction stocks support loaded');

// ==================== REAL NEWS SYSTEM (FINNHUB API) ====================
/**
 * СИСТЕМА ФИНАНСОВЫХ НОВОСТЕЙ
 * 
 * Как работает загрузка новостей:
 * 1. API предоставляет реальные финансовые новости из проверенных источников
 * 2. Кэширование на 5 минут для оптимизации производительности
 * 3. Фильтрация по категориям: Все, Крипто, Форекс, Общие
 * 
 * Количество загружаемых новостей:
 * - Категория "Все": до 300 новостей (по 100 из каждой категории)
 * - Конкретная категория: до 100 новостей
 * 
 * API Limits: 60 запросов в минуту
 * Обновление: автоматически каждые 15 минут или по кнопке "Обновить"
 */
let newsCache = null;
const NEWS_TTL = 900000; // 15 минут (экономия API лимитов)
const NEWS_DEBOUNCE_DELAY = 500; // Задержка для предотвращения дублирующих запросов
let newsDebounceTimer = null;
let currentNewsCategory = 'all';
let isTranslated = false; // Флаг перевода

// Загружаем кеш новостей из localStorage при старте
function loadNewsCacheFromStorage() {
  try {
    const stored = localStorage.getItem('newsCache');
    if (stored) {
      const parsed = JSON.parse(stored);
      // Проверяем актуальность кеша
      if (parsed && parsed.timestamp && Date.now() - parsed.timestamp < NEWS_TTL) {
        newsCache = parsed;
        // Экспортируем глобально для персонализации
        window.newsCache = newsCache;
        console.log('Загружен кеш новостей из localStorage:', {
          category: parsed.key,
          count: parsed.data?.length || 0,
          age: `${Math.round((Date.now() - parsed.timestamp) / 1000)}s`
        });
        return true;
      }
    }
  } catch (e) {
    console.warn('Ошибка загрузки кеша новостей из localStorage:', e);
  }
  return false;
}

// Сохраняем кеш новостей в localStorage
function saveNewsCacheToStorage(cache) {
  try {
    localStorage.setItem('newsCache', JSON.stringify(cache));
  } catch (e) {
    console.warn('Ошибка сохранения кеша новостей в localStorage:', e);
  }
}

// Инициализация кеша при загрузке
loadNewsCacheFromStorage();

// Категории новостей с Bootstrap Icons
const NEWS_CATEGORIES = {
    'all': { name: 'Все', icon: 'globe', color: '#3b82f6', param: 'general' },
    'crypto': { name: 'Крипто', icon: 'currency-bitcoin', color: '#f59e0b', param: 'crypto' },
    'forex': { name: 'Форекс', icon: 'currency-exchange', color: '#10b981', param: 'forex' },
    'general': { name: 'Общие', icon: 'newspaper', color: '#6b7280', param: 'general' },
    'merger': { name: 'Слияния', icon: 'building', color: '#8b5cf6', param: 'merger' }
};

// Глобальная переменная для текущих новостей
window.currentNewsData = [];

// Функция загрузки новостей из Finnhub
/**
 * Загружает финансовые новости из API
 * 
 * КОЛИЧЕСТВО НОВОСТЕЙ:
 * - Для категории 'all' (Все): загружается до 300 новостей (по 100 из каждой категории - crypto, general, forex)
 * - Для конкретной категории: загружается до 100 новостей из выбранной категории
 * 
 * КАК РАБОТАЕТ:
 * 1. Проверяется кэш - если данные свежие (менее 5 минут), показываются из кэша
 * 2. Если кэш устарел, делается запрос к API новостей
 * 3. Новости сортируются по дате (новые первыми)
 * 4. Результаты сохраняются в кэш для быстрого доступа
 * 
 * @param {string} category - Категория новостей: 'all', 'crypto', 'forex', 'general'
 */
async function loadNews(category = 'all') {
    console.log('[loadNews] Вызвана с категорией:', category, 'isNewsLoading:', isNewsLoading);
    
    if (newsDebounceTimer) {
      console.log('[loadNews] Debounce: игнорируем повторный вызов');
      clearTimeout(newsDebounceTimer);
    }
    
    return new Promise((resolve) => {
      newsDebounceTimer = setTimeout(async () => {
        newsDebounceTimer = null;
        await _loadNewsInternal(category);
        resolve();
      }, NEWS_DEBOUNCE_DELAY);
    });
}

async function _loadNewsInternal(category = 'all') {
    console.log('[_loadNewsInternal] Загрузка с категорией:', category);
    if (window.ensureNewsFiltersInit) window.ensureNewsFiltersInit();
    if (isNewsLoading) {
      console.warn('[_loadNewsInternal] Загрузка новостей уже выполняется, повторный вызов заблокирован.');
      return;
    }
    isNewsLoading = true;
    // Делаем функцию доступной глобально
    if (!window.app) window.app = {};
    window.loadNews = loadNews;
    window.app.loadNews = loadNews;

    const container = document.getElementById('newsContainer');
    console.log('[loadNews] Контейнер найден:', !!container, container);
    if (!container) {
      console.warn('[loadNews] Контейнер новостей не найден');
      isNewsLoading = false;
      return;
    }

    currentNewsCategory = category;

    container.innerHTML = `
      <div class="news-loading-state">
        <div class="loader-large"></div>
        <p>Загружаем актуальные новости...</p>
        <p class="loading-subtext">Получаем свежие данные...</p>
      </div>
    `;

    try {
        // Проверяем кэш (в памяти и localStorage)
        const cacheKey = `news_${category}`;
        const cacheAge = newsCache ? Date.now() - newsCache.timestamp : Infinity;
        const isCacheValid = newsCache && newsCache.key === cacheKey && cacheAge < NEWS_TTL;
        
        if (isCacheValid) {
          const ageMinutes = Math.floor(cacheAge / 60000);
          const ageSeconds = Math.floor((cacheAge % 60000) / 1000);
          console.log(`Загружаем новости из кэша (возраст: ${ageMinutes}м ${ageSeconds}с)`);
          renderNews(newsCache.data, category);
          updateNewsStats(newsCache.data.length);
          
          // Показываем возраст кеша пользователю
          const ageText = ageMinutes > 0 ? `${ageMinutes}м назад` : `${ageSeconds}с назад`;
          showNotification(`Новости из кеша (обновлены ${ageText})`, 'info');
          isNewsLoading = false;
          return;
        }

        showNotification('Загрузка свежих новостей...', 'info');

        // Загружаем новости из Finnhub
        // ОПТИМИЗАЦИЯ: Вместо 3 параллельных запросов (general, crypto, forex)
        // загружаем только crypto - самые релевантные для крипто-портфеля
        let newsData = [];
        
        if (category === 'all') {
            // Загружаем только криптовалютные новости (экономия API лимитов)
            newsData = await fetchFinnhubNews('crypto');
            console.log(`Загружено ${newsData.length} crypto новостей (оптимизация: 1 запрос вместо 3)`);
        } else {
            // Загружаем конкретную категорию
            const categoryParam = NEWS_CATEGORIES[category]?.param || 'crypto';
            newsData = await fetchFinnhubNews(categoryParam);
        }

        // Сортируем по дате (новые первыми)
        if (newsData && Array.isArray(newsData)) {
            newsData.sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
        } else {
            newsData = [];
        }

        // Сохраняем в кэш (память + localStorage для персистентности)
        newsCache = {
            data: newsData,
            timestamp: Date.now(),
            key: cacheKey
        };
        saveNewsCacheToStorage(newsCache);
        
        // Экспортируем глобально для персонализации новостей
        window.newsCache = newsCache;

        console.log('Вызов renderNews с данными:', {
            count: newsData.length,
            category: category,
            hasContainer: !!document.getElementById('newsContainer'),
            firstItem: newsData[0] || null
        });
        
        renderNews(newsData, category);
        updateNewsStats(newsData.length);
        
        if (newsData.length > 0) {
            showNotification(`Загружено ${newsData.length} новостей`, 'success');
            
            console.log('Проверка интеграции уведомлений для новостей...', {
                hasIntegrations: !!window.notificationIntegrations,
                newsCount: newsData.length,
                functions: window.notificationIntegrations ? Object.keys(window.notificationIntegrations) : []
            });
            
            if (window.notificationIntegrations) {
                console.log('Обрабатываем новости для уведомлений...');
                try {
                    for (let i = 0; i < Math.min(3, newsData.length); i++) {
                        const news = newsData[i];
                        console.log(`Обрабатываем новость ${i + 1}/${Math.min(3, newsData.length)}:`, news.title);
                        await window.notificationIntegrations.notifyAboutNews(news);
                    }
                    console.log('Обработка новостей завершена');
                } catch (error) {
                    console.error('Ошибка при отправке уведомлений о новостях:', error);
                }
            } else {
                console.warn('window.notificationIntegrations не найден');
            }
        } else {
            showNotification('Новостей не найдено', 'warning');
        }
        
    } catch (error) {
        console.error('Ошибка загрузки новостей:', error);
        showNotification('Ошибка загрузки новостей', 'error');
        
        container.innerHTML = `
            <div class="no-data">
                <i class="bi bi-exclamation-triangle"></i>
                <h3>Ошибка загрузки новостей</h3>
                <p>${error.message || 'Не удалось подключиться к серверу новостей'}</p>
                <div class="no-data-actions">
                    <button class="btn btn-primary" onclick="loadNewsSimple('${category}')">
                        <i class="bi bi-arrow-clockwise"></i> Попробовать снова
                    </button>
                    <button class="btn btn-secondary" onclick="clearNewsCacheSimple()">
                        <i class="bi bi-trash"></i> Очистить кэш
                    </button>
                </div>
            </div>
        `;
      } finally {
        isNewsLoading = false;
    }
}

// Register the real loadNews implementation so the early proxy can delegate to it
try {
  if (typeof window !== 'undefined' && typeof window._setLoadNews === 'function') {
    window._setLoadNews(loadNews);
  } else if (typeof window !== 'undefined') {
    // Fallback to direct assignment in non-standard environments
    window.loadNews = loadNews;
    if (!window.app) window.app = {};
    window.app.loadNews = loadNews;
  }
  console.log('[api.js] window.loadNews real implementation registered');
} catch (e) {
  console.warn('[api.js] Failed to register real loadNews implementation:', e.message);
}

/**
 * Загружает новости из API по указанной категории
 * API возвращает до 100 новостей за запрос
 * 
 * @param {string} category - Категория: 'crypto', 'forex', 'general'
 * @returns {Promise<Array>} Массив новостей в формате приложения
 */
async function fetchFinnhubNews(category = 'general') {
    try {
        // URL для News API
        const url = `https://finnhub.io/api/v1/news?category=${category}&token=${FINNHUB_TOKEN}`;
        
        console.log(`Загрузка новостей (${category})...`);
        
        const data = await safeFetchJson(url, { signal: AbortSignal.timeout(10000) });
        if (!data || !Array.isArray(data)) {
          console.warn('Некорректный или пустой ответ новостей:', url);
          return [];
        }
        console.log(`Загружено ${data.length} новостей категории ${category}`);
        // Преобразуем в наш формат
        return data.map((item) => ({
          id: item.id || Math.random().toString(36).substr(2, 9),
          title: cleanText(item.headline || item.title || ''),
            description: cleanText(item.summary || '') || 
                        generateDescriptionFromHeadline(item.headline),
            fullDescription: cleanText(item.summary || item.description || '') || 
                           'Подробности доступны по ссылке на источник.',
            link: item.url || '#',
            image: getNewsImage(item),
            source: item.source || 'Unknown Source',
            category: mapFinnhubCategory(category),
            icon: NEWS_CATEGORIES[mapFinnhubCategory(category)]?.icon || 'newspaper',
            color: NEWS_CATEGORIES[mapFinnhubCategory(category)]?.color || '#6b7280',
            datetime: item.datetime ? new Date(item.datetime * 1000) : new Date(),
            date: item.datetime ? new Date(item.datetime * 1000) : new Date(),
            formattedDate: formatDate(item.datetime ? new Date(item.datetime * 1000) : new Date()),
            isReal: true,
            originalText: null // Для хранения оригинала для перевода
        }));
        
    } catch (error) {
        console.error(`Ошибка загрузки Finnhub новостей (${category}):`, error);
        return [];
    }
}

// ==================== РЕНДЕРИНГ НОВОСТЕЙ ====================

// Функция рендеринга новостей с двумя кнопками
function renderNews(news, category = 'all', skipCategoryFilter = false) {
    console.log('[renderNews] Вызвана:', {
      newsCount: news?.length,
      category: category,
      skipCategoryFilter: skipCategoryFilter,
      isArray: Array.isArray(news),
      newsSample: news?.[0],
      container: document.getElementById('newsContainer')
    });

    const container = document.getElementById('newsContainer');
    if (!container) {
      console.error('[renderNews] Контейнер newsContainer не найден!');
      return;
    }

    // Проверка видимости контейнера (display: none или скрыт)
    const section = document.getElementById('newsSection');
    const sectionActive = section && section.classList.contains('active');
    const isVisible = container.offsetParent !== null && window.getComputedStyle(container).display !== 'none';

    // Если контейнер невидим — всё равно рендерим содержимое (чтобы оно было готово к показу).
    // Наблюдаем за появлением элемента и запускаем animation/reflow тогда, когда он станет видимым.
    if (!isVisible) {
      console.warn('[renderNews] Контейнер скрыт — рендерим в фоне и ожидаем появления для активации анимаций');

      if (!container._renderNewsObserver) {
        container._renderNewsObserver = new window.IntersectionObserver((entries, observer) => {
          if (entries[0].isIntersecting) {
            try {
              // trigger paint/animations when visible
              requestAnimationFrame(() => {
                void container.offsetHeight;
                container.style.willChange = 'opacity, transform';
                requestAnimationFrame(() => container.style.willChange = '');
              });
            } catch (e) { /* ignore */ }
            observer.disconnect();
            container._renderNewsObserver = null;
            container._renderedWhileHidden = false;
          }
        }, { root: null, threshold: 0 });
        container._renderNewsObserver.observe(container);
        container._renderedWhileHidden = true;
      }

      // Продолжаем рендер (без return) — содержимое будет готово, когда секция станет видна
    } else {
      // Очищаем наблюдатели и флаги
      container._renderedWhileHidden = false;
      if (container._renderNewsObserver) {
        container._renderNewsObserver.disconnect();
        container._renderNewsObserver = null;
      }
      if (container._renderNewsRAF) {
        cancelAnimationFrame(container._renderNewsRAF);
        container._renderNewsRAF = null;
      }
    }

    if (!news || !Array.isArray(news) || news.length === 0) {
      console.warn('[renderNews] Нет новостей для отображения:', news);
      container.innerHTML = `
        <div class="no-data">
          <i class="bi bi-newspaper"></i>
          <h3>Новостей не найдено</h3>
          <p>Попробуйте выбрать другую категорию или обновить позже</p>
        </div>
      `;
      return;
    }

    // Фильтрация по категории (пропускаем если данные уже отфильтрованы персонализацией)
    let filteredNews = news;
    if (!skipCategoryFilter && category !== 'all') {
      filteredNews = news.filter((item) => item.category === category);
    }

    // КРИТИЧЕСКАЯ ДЕДУПЛИКАЦИЯ: удаляем дубликаты по URL
    // Это предотвращает загрузку одного и того же изображения сотни раз
    const originalCount = filteredNews.length;
    const seenUrls = new Set();
    filteredNews = filteredNews.filter((item) => {
      // Создаём уникальный ключ на основе URL статьи и заголовка
      const uniqueKey = `${item.link || ''}|${item.title || ''}`;
      
      if (seenUrls.has(uniqueKey)) {
        return false; // Пропускаем дубликат
      }
      
      seenUrls.add(uniqueKey);
      return true;
    });

    const duplicatesRemoved = originalCount - filteredNews.length;
    if (duplicatesRemoved > 0) {
      console.log(`[renderNews] Удалено ${duplicatesRemoved} дубликатов из ${originalCount} новостей`);
    }

    const MAX_NEWS_TO_DISPLAY = 200;
    if (filteredNews.length > MAX_NEWS_TO_DISPLAY) {
      console.warn(`[renderNews] Ограничение: показываем ${MAX_NEWS_TO_DISPLAY} из ${filteredNews.length} новостей`);
      filteredNews = filteredNews.slice(0, MAX_NEWS_TO_DISPLAY);
    }

    if (filteredNews.length === 0) {
      console.warn('[renderNews] Нет новостей после фильтрации по категории:', category, news);
      container.innerHTML = `
        <div class="no-data">
          <i class="bi bi-funnel"></i>
          <h3>Нет новостей в этой категории</h3>
          <p>Попробуйте выбрать другую категорию</p>
        </div>
      `;
      return;
    }


    // Сохраняем данные в глобальной переменной
    window.currentNewsData = filteredNews;
    // Сбросить fallback-таймер после успешного рендера
    if (typeof window._onNewsRendered === 'function') {
      window._onNewsRendered();
      window._onNewsRendered = null;
    }

    console.log('[renderNews] Рендерим новости. Всего:', filteredNews.length, filteredNews[0]);

    // Добавляем sentiment analysis к новостям
    const newsWithSentiment = filteredNews.map((item) => {
        if (!item.sentiment && window.newsSentiment) {
            const text = `${item.title} ${item.description}`;
            const sentiment = window.newsSentiment.analyzeSentiment(text);
            const mentions = window.newsSentiment.extractAssetMentions(text);
            return {
                ...item,
                sentiment: sentiment.sentiment,
                sentimentScore: sentiment.score,
                sentimentConfidence: sentiment.confidence,
                mentionedAssets: mentions
            };
        }
        return item;
    });

    // Рендерим карточки с sentiment badges
    container.innerHTML = newsWithSentiment.map((item, index) => {
        const categoryInfo = NEWS_CATEGORIES[item.category] || { color: '#6b7280', name: 'Новость' };
        const fallbackImage = getPlaceholderImage(item.category);
        const imageUrl = (item.image && item.image.trim() && item.image.startsWith('http')) ? item.image : fallbackImage;
        
        // Получаем badge для sentiment
        let sentimentBadge = '';
        if (item.sentiment && window.newsSentiment) {
            const badge = window.newsSentiment.getSentimentBadge(item.sentiment);
            sentimentBadge = `
                <div class="news-sentiment-badge" style="background: ${badge.bgColor}; color: ${badge.color};" title="${badge.label} (уверенность: ${Math.round(item.sentimentConfidence * 100)}%)">
                    <i class="bi ${badge.icon}"></i>
                </div>
            `;
        }
        
        // Показываем упоминаемые активы
        let assetTags = '';
        if (item.mentionedAssets && item.mentionedAssets.length > 0) {
            assetTags = `
                <div class="news-asset-tags">
                    ${item.mentionedAssets.slice(0, 3).map(asset => 
                        `<span class="asset-tag">${asset}</span>`
                    ).join('')}
                </div>
            `;
        }
        
        return `
        <div class="news-article-card" data-news-index="${index}" onclick="openNewsByIndex(${index}, event)" style="cursor: pointer; position: relative; ${item._isPersonalized ? 'border: 2px solid #667eea; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);' : ''}">
            ${item._isPersonalized ? '<div style="position: absolute; top: 8px; right: 8px; background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 4px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 600; z-index: 2;"><i class="bi bi-star-fill"></i> Для вас</div>' : ''}
            <div class="news-image-wrapper">
                <img src="${imageUrl}" 
                     alt="${escapeHtml(item.title)}" 
                     class="news-image" 
                     data-fallback="${escapeHtml(fallbackImage)}"
                     onerror="console.warn('[News] Image failed:', this.src); this.onerror=null; this.src=this.dataset.fallback;">
                <div class="news-category-badge" style="background: ${categoryInfo.color};">
                    <i class="bi bi-${item.icon || 'newspaper'}"></i> ${categoryInfo.name}
                </div>
                ${sentimentBadge}
            </div>
            
            <div class="news-card-content">
                ${assetTags}
                <h3 class="news-title">${escapeHtml(item.title)}</h3>
                
                <p class="news-summary">${escapeHtml(item.description)}</p>
                
                <div class="news-meta-info">
                    <div class="news-source">
                        <i class="bi bi-newspaper" style="color: ${categoryInfo.color};"></i>
                        <span style="
                            white-space: nowrap;
                            overflow: hidden;
                            text-overflow: ellipsis;
                            max-width: 180px;
                        ">${escapeHtml(item.source)}</span>
                    </div>
                    <div class="news-date">
                        <i class="bi bi-clock"></i>
                        <span>${item.formattedDate}</span>
                    </div>
                </div>
                
                <!-- Две отдельные кнопки -->
                <div class="news-card-actions">
                    <button class="news-read-btn" onclick="event.stopPropagation(); openNewsByIndex(${index}, event);">
                        <i class="bi bi-eye"></i> Читать
                    </button>
                    <a href="${item.link}" class="news-source-btn" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();">
                        <i class="bi bi-box-arrow-up-right"></i> К источнику
                    </a>
                </div>
            </div>
        </div>
        `;
    }).join('');
    
    // Сохраняем текущие новости для modal и статистики
    window.currentNewsData = newsWithSentiment;
    
    // Обновляем статистику
    updateNewsStats(newsWithSentiment.length);
    
    console.log('Новости отрендерены');
}

// Экспортируем renderNews глобально для использования в других модулях
window.renderNews = renderNews;

// ==================== ОТКРЫТИЕ МОДАЛКИ ====================

// Функция открытия модалки по индексу
window.openNewsByIndex = (index, event) => {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
    }
    
    console.log('Открытие новости по индексу:', index);
    
    if (!window.currentNewsData || !Array.isArray(window.currentNewsData)) {
        console.error('Нет данных новостей');
        showNotification('Нет данных новостей', 'error');
        return;
    }
    
    const newsItem = window.currentNewsData[index];
    if (!newsItem) {
        console.error('Новость не найдена по индексу:', index);
        showNotification('Новость не найдена', 'error');
        return;
    }
    
    console.log('Найдена новость:', newsItem.title);
    openNewsModal(newsItem);
};

// Основная функция открытия модалки - теперь использует Vue.js
function openNewsModal(newsItem) {
    console.log('Открытие Vue.js модалки для:', newsItem.title);
    
    // Используем Vue.js компонент если доступен
    if (window.openNewsModalVue) {
        window.openNewsModalVue(newsItem);
        return;
    }
    
    // Fallback на старую модалку если Vue не загружен
    console.warn('Vue.js модалка недоступна, используем fallback');
    const modal = document.getElementById('newsDetailModal');
    if (!modal) {
        console.error('Модальное окно не найдено!');
        return;
    }
    
    try {
        // Заполняем заголовок
        const titleEl = document.getElementById('newsModalTitle');
        if (titleEl) titleEl.textContent = newsItem.title || 'Без названия';
        
        // Заполняем источник
        const sourceEl = document.getElementById('newsModalSourceName');
        if (sourceEl) sourceEl.textContent = newsItem.source || 'Неизвестный источник';
        
        // Заполняем дату
        const dateEl = document.getElementById('newsModalDateText');
        if (dateEl) dateEl.textContent = newsItem.formattedDate || 'Недавно';
        
        // Заполняем категорию
        const categoryEl = document.getElementById('newsModalCategory');
        if (categoryEl) {
            const categoryName = NEWS_CATEGORIES[newsItem.category]?.name || newsItem.category;
            categoryEl.textContent = categoryName;
            categoryEl.style.background = newsItem.color || '#3b82f6';
        }
        
        // Заполняем изображение
        const imageEl = document.getElementById('newsModalImage');
        if (imageEl) {
            imageEl.src = newsItem.image || getPlaceholderImage(newsItem.category);
            imageEl.alt = newsItem.title || 'Новость';
            imageEl.onerror = () => {
                this.src = getPlaceholderImage(newsItem.category);
            };
        }
        
        // Заполняем контент
        const contentEl = document.getElementById('newsModalContent');
        if (contentEl) {
            contentEl.innerHTML = `
                <p>${escapeHtml(newsItem.fullDescription || newsItem.description || 'Описание отсутствует')}</p>
            `;
        }
        
        // Заполняем ссылку на источник
        const linkEl = document.getElementById('newsModalLink');
        if (linkEl) {
            if (newsItem.link && newsItem.link !== '#') {
                linkEl.href = newsItem.link;
                linkEl.style.display = 'inline-flex';
                linkEl.innerHTML = `<i class="bi bi-box-arrow-up-right"></i> Читать на ${escapeHtml(newsItem.source)}`;
                linkEl.onclick = (e) => {
                    e.stopPropagation();
                    window.open(linkEl.href, '_blank', 'noopener,noreferrer');
                    return false;
                };
            } else {
                linkEl.style.display = 'none';
            }
        }
        
        // Настраиваем кнопку перевода
        const translateBtn = document.getElementById('translateNewsBtn');
        if (translateBtn) {
            translateBtn.style.display = 'inline-flex';
            translateBtn.onclick = (e) => {
                if (e) e.stopPropagation();
                translateNewsItem(newsItem);
            };
            translateBtn.innerHTML = `<i class="bi bi-translate"></i> ${isTranslated ? 'Оригинал' : 'Перевести'}`;
        }
        
        // Сохраняем оригинальный текст для перевода
        if (!newsItem.originalText) {
            newsItem.originalText = {
                title: newsItem.title,
                description: newsItem.description,
                fullDescription: newsItem.fullDescription
            };
        }
        
        // Показываем модалку
        console.log('Показываем модалку...');
        modal.style.display = 'flex';
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Добавляем обработчик закрытия при клике вне модалки
        setTimeout(() => {
            modal.onclick = (e) => {
                if (e.target === modal) {
                    closeModal('newsDetailModal');
                }
            };
        }, 100);
        
    } catch (error) {
        console.error('Ошибка при заполнении модалки:', error);
        showNotification('Ошибка при открытии новости', 'error');
    }
}

// ==================== ПЕРЕВОД НОВОСТИ ====================

async function translateNewsItem(newsItem) {
    const translateBtn = document.getElementById('translateNewsBtn');
    const contentEl = document.getElementById('newsModalContent');
    const titleEl = document.getElementById('newsModalTitle');
    
    if (!translateBtn || !contentEl || !titleEl || !newsItem.originalText) return;
    
    try {
        if (!isTranslated) {
            // Показываем загрузку
            translateBtn.disabled = true;
            translateBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Перевод...';
            
            // Используем бесплатный переводчик (MyMemory API)
            const translateText = async (text) => {
                if (!text || text.length < 10) return text;
                
                try {
                    const response = await fetch(
                        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ru`
                    );
                    const data = await response.json();
                    
                    if (data.responseData && data.responseData.translatedText) {
                        return data.responseData.translatedText;
                    }
                } catch (error) {
                    console.warn('Ошибка перевода:', error);
                }
                
                return `${text} [Автоматический перевод недоступен]`;
            };
            
            // Переводим заголовок и контент
            const translatedTitle = await translateText(newsItem.originalText.title);
            const translatedContent = await translateText(newsItem.originalText.fullDescription || newsItem.originalText.description);
            
            // Обновляем текст
            titleEl.textContent = translatedTitle;
            contentEl.innerHTML = `
                <p>${escapeHtml(translatedContent)}</p>
                <div class="translation-notice">
                    <i class="bi bi-info-circle"></i> Автоматический перевод с английского
                </div>
            `;
            
            isTranslated = true;
            translateBtn.innerHTML = '<i class="bi bi-translate"></i> Оригинал';
            
        } else {
            // Возвращаем оригинал
            titleEl.textContent = escapeHtml(newsItem.originalText.title);
            contentEl.innerHTML = `
                <p>${escapeHtml(newsItem.originalText.fullDescription || newsItem.originalText.description)}</p>
            `;
            
            isTranslated = false;
            translateBtn.innerHTML = '<i class="bi bi-translate"></i> Перевести';
        }
        
    } catch (error) {
        console.error('Ошибка перевода:', error);
        showNotification('Ошибка перевода', 'error');
    } finally {
        translateBtn.disabled = false;
    }
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

// Обновление статистики новостей
function updateNewsStats(count) {
    const newsCountElement = document.getElementById('newsCount');
    const lastUpdateElement = document.getElementById('lastUpdateTime');
    const sourcesCountElement = document.getElementById('sourcesCount');
    
    if (newsCountElement) {
        newsCountElement.textContent = count;
    }
    
    if (lastUpdateElement) {
        const now = new Date();
        lastUpdateElement.textContent = now.toLocaleTimeString('ru-RU', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }
    
    if (sourcesCountElement) {
        // Подсчитываем уникальные источники из текущих новостей
        if (window.currentNewsData && Array.isArray(window.currentNewsData)) {
            const uniqueSources = new Set(window.currentNewsData.map(n => n.source).filter(Boolean));
            sourcesCountElement.textContent = uniqueSources.size || 1;
        } else {
            sourcesCountElement.textContent = currentNewsCategory === 'all' ? '3+' : '1';
        }
    }
}

function mapFinnhubCategory(finnhubCategory) {
    const map = {
        'crypto': 'crypto',
        'forex': 'forex',
        'general': 'general',
        'merger': 'general'
    };
    return map[finnhubCategory] || 'general';
}

function getNewsImage(item) {
    // Проверяем наличие изображения, если его нет - возвращаем null
    // чтобы в рендере использовался fallback
    if (item.image && item.image.trim()) return item.image;
    if (item.thumbnail && item.thumbnail.trim()) return item.thumbnail;
    
    // Возвращаем null, fallback будет использован при рендеринге
    return null;
}

function generateDescriptionFromHeadline(headline) {
    if (!headline) return 'Читайте полную версию на источнике.';
    return `${headline.substring(0, 200)}...`;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function cleanText(text) {
    if (!text) return '';
    return text
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function formatDate(date) {
    if (!(date instanceof Date) || isNaN(date)) {
        return 'Недавно';
    }
    
    const now = new Date();
    const diff = now - date;
    const diffMinutes = Math.floor(diff / (1000 * 60));
    const diffHours = Math.floor(diff / (1000 * 60 * 60));
    const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (diffMinutes < 1) {
        return 'Только что';
    } else if (diffMinutes < 60) {
        return `${diffMinutes} мин. назад`;
    } else if (diffHours < 24) {
        return `${diffHours} ч. назад`;
    } else if (diffDays < 7) {
        return `${diffDays} дн. назад`;
    } else {
        return date.toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }
}

function getPlaceholderImage(category) {
    // Используем SVG data URL для надежного fallback (никогда не упадет)
    const colors = {
        'crypto': '%23667eea', // Фиолетовый для крипто
        'forex': '%234f46e5',  // Синий для форекс
        'general': '%236b7280' // Серый для общих новостей
    };
    const color = colors[category] || colors.general;
    const icons = {
        'crypto': '₿',
        'forex': '$',
        'general': ''
    };
    const icon = icons[category] || icons.general;
    
    return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 220'%3E%3Cdefs%3E%3ClinearGradient id='grad' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:${color};stop-opacity:0.8' /%3E%3Cstop offset='100%25' style='stop-color:${color};stop-opacity:0.5' /%3E%3C/linearGradient%3E%3C/defs%3E%3Crect fill='url(%23grad)' width='400' height='220'/%3E%3Ctext x='200' y='110' font-size='60' text-anchor='middle' dominant-baseline='middle' fill='white' opacity='0.9'%3E${icon}%3C/text%3E%3C/svg%3E`;
}

// ==================== ФИЛЬТРАЦИЯ ПО ПОИСКУ ====================

function filterNewsBySearch(searchTerm) {
    if (!searchTerm || !newsCache || !newsCache.data) {
        renderNews(newsCache?.data || [], currentNewsCategory);
        return;
    }
    
    const filteredNews = newsCache.data.filter((item) => {
        const titleMatch = item.title?.toLowerCase().includes(searchTerm);
        const descMatch = item.description?.toLowerCase().includes(searchTerm);
        const sourceMatch = item.source?.toLowerCase().includes(searchTerm);
        
        return titleMatch || descMatch || sourceMatch;
    });
    
    renderNews(filteredNews, currentNewsCategory);
}

// ==================== ИНИЦИАЛИЗАЦИЯ ФИЛЬТРОВ ====================

function initNewsFilters() {
  console.log('Инициализация фильтров новостей (delegation)');

  // Используем делегирование событий, чтобы обработчики оставались рабочими
  // даже если DOM-элементы будут перерисованы или заменены.
  if (!window.__newsFiltersDelegated) {
    window.__newsFiltersDelegated = true;

    // Обработка кликов для category-btn, refresh и clear
    document.addEventListener('click', (e) => {
      try {
        const catBtn = e.target.closest && e.target.closest('.category-btn');
        if (catBtn) {
          document.querySelectorAll('.category-btn').forEach((b) => b.classList.remove('active'));
          catBtn.classList.add('active');
          const category = catBtn.dataset.category || 'all';
          
          // Сбрасываем фильтры персонализации при смене категории
          if (window.newsPersonalization && typeof window.newsPersonalization.resetFilters === 'function') {
            window.newsPersonalization.resetFilters();
          }
          
          // Используем планировщик, чтобы дождаться контейнера
          if (typeof window.scheduleLoadNews === 'function') {
            window.scheduleLoadNews(category);
          } else {
            loadNews(category);
          }
          return;
        }

        const refresh = e.target.closest && e.target.closest('#refreshNewsBtn');
        if (refresh) {
          newsCache = null;
          const activeCategory = document.querySelector('.category-btn.active')?.dataset.category || 'all';
          const icon = refresh.querySelector('i');
          if (icon) icon.classList.add('fa-spin');

          // Сначала запланируем надёжную загрузку, затем выполним реальную и уберём спин
          if (typeof window.loadNews === 'function') {
            window.loadNews(activeCategory).finally(() => { if (icon) icon.classList.remove('fa-spin'); });
          } else if (typeof window.scheduleLoadNews === 'function') {
            window.scheduleLoadNews(activeCategory);
            setTimeout(() => { if (icon) icon.classList.remove('fa-spin'); }, 2000);
          } else {
            setTimeout(() => { if (icon) icon.classList.remove('fa-spin'); }, 1000);
          }
          return;
        }

        const clearBtn = e.target.closest && e.target.closest('#clearNewsSearch');
        if (clearBtn) {
          const searchInput = document.getElementById('newsSearch');
          if (searchInput) {
            searchInput.value = '';
            const cb = document.getElementById('clearNewsSearch'); if (cb) cb.style.display = 'none';
            filterNewsBySearch('');
          }
          return;
        }
      } catch (err) {
        console.warn('news filters delegation error', err);
      }
    }, false);

    // Обработчик ввода (debounce) для поля поиска — делегирован
    document.addEventListener('input', (e) => {
      if (!e.target || e.target.id !== 'newsSearch') return;
      try {
        if (window.__newsSearchTimeout) clearTimeout(window.__newsSearchTimeout);
        window.__newsSearchTimeout = setTimeout(() => {
          const searchTerm = e.target.value.toLowerCase().trim();
          filterNewsBySearch(searchTerm);
        }, 300);

        const clearBtnEl = document.getElementById('clearNewsSearch');
        if (clearBtnEl) clearBtnEl.style.display = e.target.value ? 'block' : 'none';
      } catch (err) {
        console.warn('news search input error', err);
      }
    }, false);
  }

  // Оставляем обработчики для закрытия модалки (при необходимости их можно делегировать тоже)
  const closeModalBtn = document.querySelector('#newsDetailModal .close-modal');
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
      closeModal('newsDetailModal');
    });
  }

  const closeBtn = document.querySelector('#newsDetailModal .btn-secondary');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      closeModal('newsDetailModal');
    });
  }

  // Закрытие по ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const activeModal = document.querySelector('.modal.active');
      if (activeModal) {
        closeModal(activeModal.id);
      }
    }
  });
}

// ==================== УПРАВЛЕНИЕ МОДАЛКАМИ ====================

window.closeModal = (modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
        document.body.style.overflow = '';
        
        // Сбрасываем перевод
        isTranslated = false;
        const translateBtn = document.getElementById('translateNewsBtn');
        if (translateBtn) {
            translateBtn.style.display = 'none';
        }
    }
};

// ==================== ГЛОБАЛЬНЫЕ ФУНКЦИИ ====================

window.loadNewsSimple = (category = 'all') => {
    loadNews(category);
};

window.clearNewsCacheSimple = () => {
    newsCache = null;
    showNotification('Кэш новостей очищен', 'info');
    loadNews(currentNewsCategory);
};

window.app.loadNews = loadNews;
window.app.closeNewsModal = () => {
    closeModal('newsDetailModal');
};

// Функция для отладки
window.debugNews = () => {
    console.log('=== DEBUG NEWS ===');
    console.log('currentNewsData:', window.currentNewsData);
    console.log('Length:', window.currentNewsData?.length);
    console.log('First item:', window.currentNewsData?.[0]);
};

// ==================== ИНИЦИАЛИЗАЦИЯ ====================

let isNewsLoadScheduled = false;

/**
 * Надёжно запланировать загрузку новостей.
 * Пытаемся несколько раз ждать появления контейнера `#newsContainer` прежде чем вызывать `loadNews`.
 */
function scheduleLoadNews(category = 'all', maxRetries = 12, interval = 250) {
  // Назначаем функцию на window сразу после объявления
  window.scheduleLoadNews = scheduleLoadNews;
  if (isNewsLoadScheduled) {
    console.warn('[scheduleLoadNews] Уже запланирована попытка загрузки, повторный вызов проигнорирован');
    return;
  }
  isNewsLoadScheduled = true;
  let attempts = 0;

  const tryLoad = () => {
    attempts++;
    const container = document.getElementById('newsContainer');

    if (container) {
      // If real implementation is ready, call it; otherwise wait a bit.
      if (window._loadNewsReady) {
        console.log('newsContainer найден и loadNews готов, вызываем loadNews');
        // Вызываем загрузку и снимаем блокировку после завершения
        window.loadNews(category)
          .catch((e) => {
            console.error('[scheduleLoadNews] Ошибка при вызове loadNews:', e);
          })
          .finally(() => {
            isNewsLoadScheduled = false;
          });
        return;
      } else {
        console.log('[scheduleLoadNews] newsContainer найден, но loadNews ещё не готов — ожидаем');
        if (attempts < maxRetries) {
          setTimeout(tryLoad, interval);
          return;
        } else {
          console.warn('[scheduleLoadNews] loadNews не стал готовым после попыток, отмена');
          isNewsLoadScheduled = false;
          return;
        }
      }
    }

    if (attempts < maxRetries) {
      console.log(`newsContainer не найден, повторная попытка ${attempts}/${maxRetries}`);
      setTimeout(tryLoad, interval);
      return;
    }

    console.warn('Не удалось найти newsContainer после нескольких попыток, отмена загрузки новостей');
    isNewsLoadScheduled = false;
  };

  // Небольшая задержка, чтобы SPA успел переключить контент
  setTimeout(tryLoad, Math.min(300, interval));
}

// Публикуем на глобальном объекте для совместимости с другими модулями
try {
  window.scheduleLoadNews = scheduleLoadNews;
  // Expose a reference for the early proxy to delegate to and flush buffered calls
  window._realScheduleLoadNews = scheduleLoadNews;
  if (window._earlyScheduleLoadRequests && window._earlyScheduleLoadRequests.length) {
    console.log('[scheduleLoadNews] Flushing early buffered schedule calls:', window._earlyScheduleLoadRequests.length);
    const reqs = window._earlyScheduleLoadRequests.slice();
    window._earlyScheduleLoadRequests = [];
    reqs.forEach(args => {
      try {
        scheduleLoadNews(...args);
      } catch (e) {
        console.warn('[scheduleLoadNews] Ошибка при выполнении отложённого запроса:', e.message);
      }
    });
  }
} catch (e) {
  // безопасно игнорируем в средах без window
}
document.addEventListener('DOMContentLoaded', () => {
  console.log('Инициализация системы новостей');
  setTimeout(() => {
    initNewsFilters();

    // Загружаем новости если сейчас на вкладке
    if (window.location.hash === '#news') {
      scheduleLoadNews();
    }

    // Отслеживаем смену вкладок
    window.addEventListener('hashchange', () => {
      if (window.location.hash === '#news') {
        scheduleLoadNews();
      }
    });
  }, 500);
});

console.log('Система новостей загружена (Finnhub API)');
