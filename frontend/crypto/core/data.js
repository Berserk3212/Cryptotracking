// data.js — ВСЁ РАБОТАЕТ + SUPABASE
import { supabase } from './profile.js';
import { safeFetch, fetchCoinGeckoSimplePrice } from '../api/requests.js';

// Кэш в памяти (не localStorage)
let portfolios = [];
let transactions = [];
let favorites = [];
let priceCache = {}; // { symbol: { price, timestamp } }
const PRICE_CACHE_TTL = 30000; // 30 секунд

// Кэш для цен с Binance
const binancePriceCache = {
    data: {},
    timestamp: 0,
    CACHE_DURATION: 30000 // 30 секунд
};

// Кэш для CoinGecko (список монет и быстрый доступ по symbol->id)
const coinGeckoCache = {
  coinsList: null,
  timestamp: 0,
  TTL: 1000 * 60 * 60 * 24 // 24 часа
};

// Простая локальная очередь и retry для CoinGecko вызовов (чтобы избежать 429)
const __cgQueue = [];
let __cgRunning = false;
const CG_MIN_INTERVAL = 1200;

async function _cgPerformFetchWithRetries(url, options = {}, maxRetries = 3) {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      const r = await fetch(url, options);
      if (r.status === 429) {
        const backoff = 500 * Math.pow(2, attempt) + Math.floor(Math.random() * 300);
        await new Promise(r => setTimeout(r, backoff));
        attempt++;
        continue;
      }
      return r;
    } catch (e) {
      const backoff = 400 * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
      await new Promise(r => setTimeout(r, backoff));
      attempt++;
      continue;
    }
  }
  return null;
}

function _cgProcessQueue() {
  if (__cgRunning) return;
  __cgRunning = true;
  (async () => {
    while (__cgQueue.length > 0) {
      const it = __cgQueue.shift();
      try {
        const resp = await _cgPerformFetchWithRetries(it.url, it.options, it.retries || 3);
        if (!resp) it.reject(new Error('cg_fetch_failed'));
        else {
          const ct = resp.headers.get ? (resp.headers.get('content-type') || '') : '';
          if (!resp.ok || !ct.includes('application/json')) it.resolve(null);
          else it.resolve(await resp.json());
        }
      } catch (e) {
        it.reject(e);
      }
      await new Promise(r => setTimeout(r, CG_MIN_INTERVAL));
    }
    __cgRunning = false;
  })();
}

async function safeFetchCoinGeckoJson(url, options = {}, ttl = 0) {
  // localStorage cache when ttl > 0
  const key = 'cg_cache:' + url;
  if (ttl > 0) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.ts && (Date.now() - parsed.ts) <= ttl) return parsed.data;
      }
    } catch (e) { console.warn('cg cache read', e); }
  }

  return new Promise((resolve, reject) => {
    __cgQueue.push({ url, options, resolve, reject, retries: 3 });
    _cgProcessQueue();
  }).then(data => {
    try { if (ttl > 0 && data !== null) localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch (e) { console.warn('cg cache write', e); }
    return data;
  }).catch(e => { console.warn('safeFetchCoinGeckoJson error', e); return null; });
}

// Получаем цены через CoinGecko для символов, когда Binance не покрывает
async function fetchCoinGeckoPrices(symbols) {
  const prices = {};
  if (!symbols || symbols.length === 0) return prices;

  try {
    // Загрузим список монет один раз в сутки
    const now = Date.now();
    if (!coinGeckoCache.coinsList || (now - coinGeckoCache.timestamp) > coinGeckoCache.TTL) {
      const respJson = await safeFetch('https://api.coingecko.com/api/v3/coins/list', { ttl: coinGeckoCache.TTL });
      if (respJson) {
        coinGeckoCache.coinsList = respJson;
        coinGeckoCache.timestamp = Date.now();
      } else {
        console.warn('CoinGecko /coins/list failed or returned null');
      }
    }

    if (!coinGeckoCache.coinsList) return prices;

    // Map symbols -> possible ids (case-insensitive match)
    const symToId = {};
    const lowerToIds = {};
    coinGeckoCache.coinsList.forEach(c => {
      const s = String(c.symbol || '').toLowerCase();
      if (!lowerToIds[s]) lowerToIds[s] = [];
      lowerToIds[s].push(c.id);
    });

    const idsToQuery = new Set();
    symbols.forEach(sym => {
      const s = String(sym || '').toLowerCase();
      const ids = lowerToIds[s];
      if (ids && ids.length > 0) {
        // choose first id (best-effort)
        symToId[sym] = ids[0];
        idsToQuery.add(ids[0]);
      }
    });

    if (idsToQuery.size === 0) return prices;

    const idsParam = Array.from(idsToQuery).join(',');
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(idsParam)}&vs_currencies=usd`;
    // cache simple/price short-term (30s)
    const json = await fetchCoinGeckoSimplePrice(idsParam, 30 * 1000);
    if (!json) {
      console.warn('CoinGecko simple/price failed or returned null');
      return prices;
    }
    // map back to symbols
    Object.entries(symToId).forEach(([sym, id]) => {
      const val = json[id] && (json[id].usd || json[id].usd === 0 ? json[id].usd : undefined);
      if (val !== undefined && val !== null) prices[sym] = Number(val);
    });

    // update binancePriceCache compatibility and priceCache
    Object.keys(prices).forEach(s => {
      binancePriceCache.data[s] = prices[s];
      priceCache[s] = { price: prices[s], timestamp: Date.now() };
    });

  } catch (e) {
    console.warn('fetchCoinGeckoPrices error', e);
  }

  return prices;
}

// Функция для получения текущих цен активов через Binance
async function fetchCurrentPrices(symbols) {
    const prices = {};
    
    if (!symbols || symbols.length === 0) {
        console.log('No symbols to fetch prices for');
        return prices;
    }
    
    // Проверяем кэш
    const now = Date.now();
    if (now - binancePriceCache.timestamp < binancePriceCache.CACHE_DURATION && Object.keys(binancePriceCache.data).length > 0) {
        console.log('Using cached Binance prices (age:', Math.round((now - binancePriceCache.timestamp) / 1000), 'seconds)');
        
        // Возвращаем закэшированные цены для запрошенных символов
        symbols.forEach(symbol => {
            if (binancePriceCache.data[symbol]) {
                prices[symbol] = binancePriceCache.data[symbol];
            }
        });
        
        // Если есть все нужные цены в кэше, возвращаем их
        if (symbols.every(s => prices[s])) {
            return prices;
        }
    }
    
    console.log('Fetching prices for symbols from Binance:', symbols);
    
    try {
        // Маппинг символов к Binance торговым парам
        const binanceSymbolMap = {
            'BTC': 'BTCUSDT',
            'BTCUSDT': 'BTCUSDT',
            'BTCUSD': 'BTCUSDT',
            'ETH': 'ETHUSDT',
            'ETHUSDT': 'ETHUSDT',
            'ETHUSD': 'ETHUSDT',
            'ETC': 'ETCUSDT',
            'ETCUSDT': 'ETCUSDT',
            'BNB': 'BNBUSDT',
            'BNBUSDT': 'BNBUSDT',
            'SOL': 'SOLUSDT',
            'SOLUSDT': 'SOLUSDT',
            'ADA': 'ADAUSDT',
            'ADAUSDT': 'ADAUSDT',
            'XRP': 'XRPUSDT',
            'XRPUSDT': 'XRPUSDT',
            'DOGE': 'DOGEUSDT',
            'DOGEUSDT': 'DOGEUSDT',
            'DOT': 'DOTUSDT',
            'DOTUSDT': 'DOTUSDT',
            'MATIC': 'MATICUSDT',
            'MATICUSDT': 'MATICUSDT',
            'AVAX': 'AVAXUSDT',
            'AVAXUSDT': 'AVAXUSDT',
            'LINK': 'LINKUSDT',
            'LINKUSDT': 'LINKUSDT',
            'UNI': 'UNIUSDT',
            'UNIUSDT': 'UNIUSDT'
        };
        
        // Собираем уникальные Binance символы
        const binanceSymbols = new Set();
        const symbolToBindanceMap = {};
        
        symbols.forEach(symbol => {
            const upperSymbol = symbol.toUpperCase();
            const binanceSymbol = binanceSymbolMap[upperSymbol];
            
            if (binanceSymbol) {
                binanceSymbols.add(binanceSymbol);
                symbolToBindanceMap[symbol] = binanceSymbol;
            }
        });
        
        console.log('Binance symbols to fetch:', Array.from(binanceSymbols));
        
        // Получаем цены криптовалют через Binance
        if (binanceSymbols.size > 0) {
            try {
                // Binance API возвращает все цены одним запросом
                const url = 'https://api.binance.com/api/v3/ticker/price';
                
                console.log('Fetching from Binance:', url);
                
                const response = await fetch(url);
                
                if (response.ok) {
                    const data = await response.json();
                    console.log('Binance response received:', data.length, 'pairs');
                    
                    // Создаем быстрый lookup объект
                    const binancePrices = {};
                    data.forEach(item => {
                        binancePrices[item.symbol] = parseFloat(item.price);
                    });
                    
                    // Маппим цены обратно к оригинальным символам
                    symbols.forEach(symbol => {
                      const upper = String(symbol).toUpperCase();
                      const binanceSymbol = symbolToBindanceMap[symbol];
                      if (binanceSymbol && binancePrices[binanceSymbol]) {
                        prices[symbol] = binancePrices[binanceSymbol];
                        console.log(`Price for ${symbol}: $${prices[symbol]} (mapped)`);
                        return;
                      }

                      // Попытки найти пару по общим суффиксам (best-effort)
                      const tryPairs = [`${upper}USDT`, `${upper}USD`, `${upper}USDC`, `${upper}BUSD`, `${upper}BTC`];
                      for (const p of tryPairs) {
                        if (binancePrices[p]) {
                          prices[symbol] = binancePrices[p];
                          console.log(`Price for ${symbol}: $${prices[symbol]} (found by ${p})`);
                          break;
                        }
                      }
                    });
                    
                    // Обновляем кэш
                    binancePriceCache.data = { ...binancePriceCache.data, ...prices };
                    binancePriceCache.timestamp = Date.now();
                    
                    // Также обновляем старый priceCache для совместимости
                    symbols.forEach(symbol => {
                        if (prices[symbol]) {
                            const previousPrice = priceCache[symbol]?.price;
                            priceCache[symbol] = { price: prices[symbol], timestamp: Date.now() };
                            
                            // Уведомляем об изменении цены
                            if (previousPrice && window.notificationIntegrations) {
                                window.notificationIntegrations.notifyAboutPriceChange(
                                    symbol, 
                                    prices[symbol], 
                                    previousPrice
                                ).catch(err => console.error('Ошибка уведомления об изменении цены:', err));
                            }
                        }
                    });
                    
                } else {
                    console.error('Binance API error:', response.status, response.statusText);
                    
                    // Fallback на кэш при любой ошибке
                    symbols.forEach(symbol => {
                        if (binancePriceCache.data[symbol]) {
                            prices[symbol] = binancePriceCache.data[symbol];
                            console.log(`Using cached price for ${symbol}: $${prices[symbol]}`);
                        }
                    });
                }
            } catch (err) {
                console.error('Error fetching crypto prices from Binance:', err);
                
                // Fallback на закэшированные цены
                console.log('Using cached prices due to fetch error');
                symbols.forEach(symbol => {
                    if (binancePriceCache.data[symbol]) {
                        prices[symbol] = binancePriceCache.data[symbol];
                        console.log(`Using cached price for ${symbol}: $${prices[symbol]}`);
                    }
                });
            }
        }
        
        console.log('Final prices object:', prices);
        
    } catch (error) {
        console.error('Error in fetchCurrentPrices:', error);
        
        // Последний fallback на кэш
        symbols.forEach(symbol => {
            if (binancePriceCache.data[symbol]) {
                prices[symbol] = binancePriceCache.data[symbol];
            }
        });
    }
    
    return prices;
}

export async function initData() {
  await getPortfolios();
  await getTransactions();
}

// data.js - ПРОСТАЯ ВЕРСИЯ с детальным логированием
export async function createPortfolio(name, description = '', currency = 'USD', riskLevel = 'MEDIUM') {
  console.log('createPortfolio called with:', { name, description, currency, riskLevel });
  console.log('Parameter types:', {
    name: typeof name,
    description: typeof description,
    currency: typeof currency,
    riskLevel: typeof riskLevel
  });
  
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    console.error('User not authenticated');
    throw new Error('Не авторизован');
  }
  
  console.log('User ID:', session.user.id);

  // ВАЖНО: Проверяем, что передается в risk_level
  console.log('Risk level before insert:', riskLevel);
  console.log('Risk level type:', typeof riskLevel);
  console.log('Risk level length:', riskLevel.length);
  console.log('Risk level charCodes:', [...riskLevel].map(c => c.charCodeAt(0)));

  // Подготовка данных - ТОЛЬКО те поля, которые точно есть в таблице
  const portfolioData = {
    user_id: session.user.id,
    name: name.trim(),
    description: description.trim() || '',
    currency: currency,
    risk_level: riskLevel  // Передаем как есть
  };
  
  console.log('Inserting portfolio data:', portfolioData);
  console.log('JSON stringify:', JSON.stringify(portfolioData, null, 2));

  const { data, error } = await supabase
    .from('portfolios')
    .insert(portfolioData)
    .select()
    .single();

  if (error) {
    console.error('Supabase error:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('Error details:', error.details);
    console.error('Error hint:', error.hint);
    
    // Пробуем получить существующие портфели, чтобы увидеть правильный формат
    console.log('Trying to fetch existing portfolios to see correct format...');
    const { data: existingPortfolios } = await supabase
      .from('portfolios')
      .select('risk_level')
      .limit(1);
    
    if (existingPortfolios && existingPortfolios.length > 0) {
      console.log('Example risk_level from DB:', existingPortfolios[0].risk_level);
      console.log('Type:', typeof existingPortfolios[0].risk_level);
    }
    
    throw error;
  }
  
  console.log('Portfolio created successfully:', data);
  portfolios.push(data);
  return data;
}

export async function getPortfolios() {
  const { data, error } = await supabase
    .from('portfolios')
    .select('id, name, description, currency, risk_level, created_at')
    .order('created_at', { ascending: false });

  if (error) throw error;
  portfolios = data;
  return data;
}

export async function deletePortfolio(id) {
  const { error: txError } = await supabase.from('transactions').delete().eq('portfolio_id', id);
  const { error } = await supabase.from('portfolios').delete().eq('id', id);
  if (txError || error) throw txError || error;
  portfolios = portfolios.filter(p => p.id !== id);
  transactions = transactions.filter(t => t.portfolio_id !== id);
}

// === ТРАНЗАКЦИИ ===
export async function addTransaction(portfolioId, type, symbol, quantity, price, date) {
  const { data: { session } } = await supabase.auth.getSession();
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      portfolio_id: portfolioId,
      user_id: session.user.id,
      type,
      symbol,
      quantity,
      price,
      date
    })
    .select()
    .single();

  if (error) throw error;
  transactions.push(data);
  return data;
}

export async function getTransactions(retries = 2) {
  console.log('📥 data.js: getTransactions вызвана (попыток:', retries + 1 + ')');
  
  const t0 = performance.now();
  try {
    // Проверяем, авторизован ли пользователь
    const { data: { session } } = await supabase.auth.getSession();
    console.log('✔️ Текущая сессия:', session ? 'Активна' : 'Отсутствует');
    
    if (!session?.user) {
      console.warn('Пользователь не авторизован');
      transactions = [];
      return [];
    }
    
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false });

    const t1 = performance.now();
    console.log(`🕒 Supabase запрос транзакций занял ${Math.round(t1 - t0)} мс`);
    
    if (error) {
      console.error('Ошибка Supabase:', error);
      if (retries > 0) {
        console.log(`Повторяю запрос (осталось ${retries - 1})...`);
        await new Promise(r => setTimeout(r, 1000));
        return getTransactions(retries - 1);
      }
      throw error;
    }
    
    transactions = data || [];
    console.log(`Транзакции загружены: ${transactions.length} шт.`);
    return data || [];
  } catch (err) {
    console.error('ОШИБКА getTransactions:', err);
    if (retries > 0) {
      console.log(`Повторяю запрос (осталось ${retries - 1})...`);
      await new Promise(r => setTimeout(r, 1000));
      return getTransactions(retries - 1);
    }
    throw err;
  }
}

export async function deleteTransaction(id) {
  console.log('Удаление транзакции:', id);
  
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id);
  
  if (error) {
    console.error('Ошибка удаления:', error);
    throw error;
  }
  
  // Удаляем из кэша
  transactions = transactions.filter(t => t.id !== id);
  console.log('Транзакция удалена из кэша');
  
  return true;
}

// === КЭШИРОВАНИЕ ЦЕН ===
export async function getPricesForSymbols(symbols, options = { useCoinGecko: true }) {
  if (!symbols || symbols.length === 0) {
    console.log('⏭️ Пропускаем fetch цен — массив пуст');
    return {};
  }

  console.log('Запрос цен для:', symbols, 'options:', options);

  // Используем новую функцию fetchCurrentPrices с Binance API
  let prices = await fetchCurrentPrices(symbols);
  console.log('💯 Цены получены через Binance:', prices);

  // Если включён fallback и для некоторых символов не нашлось цены — попробуем CoinGecko
  const missing = symbols.filter(s => !(Number.isFinite(prices[s]) && prices[s] > 0));
  if (missing.length > 0 && options && options.useCoinGecko !== false) {
    console.log('🔎 Missing prices for, trying CoinGecko:', missing);
    try {
      const cg = await fetchCoinGeckoPrices(missing);
      console.log('🌐 CoinGecko prices:', cg);
      prices = Object.assign({}, prices, cg);
    } catch (e) {
      console.warn('CoinGecko fallback failed', e);
    }
  }

  return prices;
}

export function getPriceSync(symbol) {
  // Сначала проверяем кэш Binance
  if (binancePriceCache.data[symbol]) {
    return binancePriceCache.data[symbol];
  }
  
  // Fallback на старый кэш
  if (priceCache[symbol]) {
    return priceCache[symbol].price;
  }
  
  // Fallback to window lists
  if (window.cryptoList) {
    const c = window.cryptoList.find(x => (x.symbol || '').toUpperCase() === String(symbol).toUpperCase());
    if (c) {
      const candidates = [c.price, c.current_price, c.priceUsd, c.price_usd, c.price_usd, c.lastPrice, c.priceUsdValue, c.price_usd_value];
      for (const v of candidates) {
        if (v !== undefined && v !== null && v !== '') {
          const n = Number(v);
          if (Number.isFinite(n) && n > 0) return n;
        }
      }
    }
  }
  if (window.stocksList) {
    const s = window.stocksList.find(x => (x.symbol || '').toUpperCase() === String(symbol).toUpperCase());
    if (s) {
      const n = Number(s.price || s.current_price || s.lastPrice || 0);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  
  // Fallback to last transaction price
  const lastTx = transactions
    .filter(t => t.symbol === symbol)
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  return lastTx?.price || 0;
}

// === ВСПОМОГАТЕЛЬНЫЕ ===
export function getPortfolioName(id) {
  return portfolios.find(p => p.id === id)?.name || '—';
}

export function getRisk(level) {
  const map = { LOW: 'Консервативный', MEDIUM: 'Умеренный', HIGH: 'Агрессивный' };
  return map[level] || level;
}

// === ДЛЯ ДАШБОРДА И АНАЛИТИКИ ===
export function getPortfoliosSync() { return portfolios; }
export function getTransactionsSync() { return transactions; }
export function clearPriceCache() { 
  priceCache = {}; 
  console.log('Кэш цен очищен');
}

// Экспортируем глобально для использования в других модулях
window.getPortfoliosSync = getPortfoliosSync;
window.getTransactionsSync = getTransactionsSync;

// ==================== FAVORITES ====================
export async function getFavorites(retries = 2) {
  console.log('📥 data.js: getFavorites called');
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      console.warn('Пользователь не авторизован (favorites)');
      favorites = [];
      return [];
    }

    const { data, error } = await supabase
      .from('favorites')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Ошибка Supabase (getFavorites):', error);
      if (retries > 0) return getFavorites(retries - 1);
      throw error;
    }

    favorites = data || [];
    console.log(`Favorites loaded: ${favorites.length}`);
    return favorites;
  } catch (err) {
    console.error('ОШИБКА getFavorites:', err);
    if (retries > 0) return getFavorites(retries - 1);
    throw err;
  }
}

export function getFavoritesSync() { return favorites; }

export async function addFavorite(symbol, metadata = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Не авторизован');

    const payload = {
      user_id: session.user.id,
      symbol: String(symbol).toUpperCase(),
      metadata: metadata || {}
    };

    const { data, error } = await supabase
      .from('favorites')
      .insert(payload)
      .select()
      .single();

    if (error) {
      // Если уникальное ограничение — уже добавлено, вернём существующую запись
      console.warn('addFavorite: Supabase error', error);
      if (error.code === '23505') {
        try {
          const { data: existing } = await supabase
            .from('favorites')
            .select('*')
            .eq('user_id', session.user.id)
            .eq('symbol', payload.symbol)
            .maybeSingle();
          if (existing) {
            // Обновим локальный кэш, если нужно
            favorites = favorites.filter(f => f.id !== existing.id);
            favorites.unshift(existing);
            return existing;
          }
        } catch (e) {
          console.warn('addFavorite: failed to fetch existing favorite after duplicate error', e);
        }
      }
      throw error;
    }

    favorites.unshift(data);
    return data;
  } catch (e) {
    console.error('addFavorite error:', e.message || e);
    throw e;
  }
}

export async function removeFavorite(id) {
  try {
    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('removeFavorite supabase error:', error);
      throw error;
    }

    favorites = favorites.filter(f => f.id !== id);
    return true;
  } catch (e) {
    console.error('removeFavorite error:', e.message || e);
    throw e;
  }
}