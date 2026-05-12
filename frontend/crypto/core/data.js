// data.js — работа с данными через Supabase
import { supabase } from './profile.js';
import { safeFetch, fetchCoinGeckoSimplePrice } from '../api/requests.js';
import { logActivity } from './activity-logger.js';
import { validatePortfolioInput, validateTransactionInput } from './security.js';

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

// Локальная очередь для CoinGecko — защита от 429
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
    } catch (_) { /* кэш недоступен */ }
  }

  return new Promise((resolve, reject) => {
    __cgQueue.push({ url, options, resolve, reject, retries: 3 });
    _cgProcessQueue();
  }).then(data => {
    try { if (ttl > 0 && data !== null) localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch (_) { /* запись в кэш недоступна */ }
    return data;
  }).catch(() => null);
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
        // первый результат — наиболее распространённая монета
        symToId[sym] = ids[0];
        idsToQuery.add(ids[0]);
      }
    });

    if (idsToQuery.size === 0) return prices;

    const idsParam = Array.from(idsToQuery).join(',');
    // кэшируем ответ на 30 секунд
    const json = await fetchCoinGeckoSimplePrice(idsParam, 30 * 1000);
    if (!json) return prices;
    Object.entries(symToId).forEach(([sym, id]) => {
      const val = json[id] && (json[id].usd || json[id].usd === 0 ? json[id].usd : undefined);
      if (val !== undefined && val !== null) prices[sym] = Number(val);
    });

    // update binancePriceCache compatibility and priceCache
    Object.keys(prices).forEach(s => {
      binancePriceCache.data[s] = prices[s];
      priceCache[s] = { price: prices[s], timestamp: Date.now() };
    });

  } catch (_) { /* ошибка CoinGecko — возвращаем частичные цены */ }

  return prices;
}

// Получение текущих цен активов через Binance
async function fetchCurrentPrices(symbols) {
    const prices = {};
    
    if (!symbols || symbols.length === 0) return prices;
    
    // Проверяем кэш
    const now = Date.now();
    if (now - binancePriceCache.timestamp < binancePriceCache.CACHE_DURATION && Object.keys(binancePriceCache.data).length > 0) {
        symbols.forEach(symbol => {
            if (binancePriceCache.data[symbol]) prices[symbol] = binancePriceCache.data[symbol];
        });
        if (symbols.every(s => prices[s])) return prices;
    }
    
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
        
        // Получаем все цены одним запросом к Binance
        if (binanceSymbols.size > 0) {
            try {
                const url = 'https://api.binance.com/api/v3/ticker/price';
                const response = await fetch(url);
                
                if (response.ok) {
                    const data = await response.json();
                    
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
                        return;
                      }
                      // Перебираем популярные торговые пары
                      for (const p of [`${upper}USDT`, `${upper}USD`, `${upper}USDC`, `${upper}BUSD`, `${upper}BTC`]) {
                        if (binancePrices[p]) { prices[symbol] = binancePrices[p]; break; }
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
                                ).catch(() => {});
                            }
                        }
                    });
                    
                } else {
                    // Binance недоступен — используем кэш
                    symbols.forEach(symbol => {
                        if (binancePriceCache.data[symbol]) prices[symbol] = binancePriceCache.data[symbol];
                    });
                }
            } catch (_) {
                // Сетевая ошибка — используем кэш
                symbols.forEach(symbol => {
                    if (binancePriceCache.data[symbol]) prices[symbol] = binancePriceCache.data[symbol];
                });
            }
        }
    } catch (_) {
        // Последний fallback на кэш
        symbols.forEach(symbol => {
            if (binancePriceCache.data[symbol]) prices[symbol] = binancePriceCache.data[symbol];
        });
    }
    
    return prices;
}

export async function initData() {
  await getPortfolios();
  await getTransactions();
}

export async function createPortfolio(name, description = '', currency = 'USD', riskLevel = 'MEDIUM') {
  // Валидация входных данных (защита от SQL-инъекций и XSS)
  const validated = validatePortfolioInput({ name, description, currency, riskLevel });
  name        = validated.name;
  description = validated.description;
  currency    = validated.currency;
  riskLevel   = validated.riskLevel;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Не авторизован');

  // Проверяем лимит портфелей из системных настроек
  const maxPortfolios = window.appSettings?.max_portfolios_per_user ?? 10;
  const { count: existingCount, error: countError } = await supabase
    .from('portfolios')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', session.user.id);
  if (!countError && existingCount >= maxPortfolios) {
    throw new Error(`Достигнут лимит портфелей: максимум ${maxPortfolios}`);
  }

  const portfolioData = {
    user_id: session.user.id,
    name: name.trim(),
    description: description.trim() || '',
    currency: currency,
    risk_level: riskLevel
  };

  const { data, error } = await supabase
    .from('portfolios')
    .insert(portfolioData)
    .select()
    .single();

  if (error) throw error;

  portfolios.push(data);
  logActivity('create_portfolio', 'portfolios', { portfolio_id: data.id, name: data.name, currency: data.currency });
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
  const name = portfolios.find(p => p.id === id)?.name;
  const { error: txError } = await supabase.from('transactions').delete().eq('portfolio_id', id);
  const { error } = await supabase.from('portfolios').delete().eq('id', id);
  if (txError || error) throw txError || error;
  portfolios = portfolios.filter(p => p.id !== id);
  transactions = transactions.filter(t => t.portfolio_id !== id);
  logActivity('delete_portfolio', 'portfolios', { portfolio_id: id, name });
}

// === ТРАНЗАКЦИИ ===
export async function addTransaction(portfolioId, type, symbol, quantity, price, date) {
  // Валидация входных данных (защита от SQL-инъекций и XSS)
  const validated = validateTransactionInput({ type, symbol, quantity, price, date });
  type     = validated.type;
  symbol   = validated.symbol;
  quantity = validated.quantity;
  price    = validated.price;
  date     = validated.date;

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
  logActivity('add_transaction', 'transactions', { type, symbol, quantity, price, portfolio_id: portfolioId });
  return data;
}

export async function getTransactions(retries = 2) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { transactions = []; return []; }
    
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false });
    
    if (error) {
      if (retries > 0) {
        await new Promise(r => setTimeout(r, 1000));
        return getTransactions(retries - 1);
      }
      throw error;
    }
    
    transactions = data || [];
    return data || [];
  } catch (err) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 1000));
      return getTransactions(retries - 1);
    }
    throw err;
  }
}

export async function deleteTransaction(id) {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
  
  transactions = transactions.filter(t => t.id !== id);
  logActivity('delete_transaction', 'transactions', { transaction_id: id });
  return true;
}

// === КЭШИРОВАНИЕ ЦЕН ===
export async function getPricesForSymbols(symbols, options = { useCoinGecko: true }) {
  if (!symbols || symbols.length === 0) return {};

  let prices = await fetchCurrentPrices(symbols);

  // Для символов без цены пробуем CoinGecko как запасной источник
  const missing = symbols.filter(s => !(Number.isFinite(prices[s]) && prices[s] > 0));
  if (missing.length > 0 && options?.useCoinGecko !== false) {
    try {
      const cg = await fetchCoinGeckoPrices(missing);
      prices = Object.assign({}, prices, cg);
    } catch (_) { /* CoinGecko fallback недоступен */ }
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
  // stocksRealData — заполняется из localStorage при загрузке страницы и при посещении раздела акций
  if (window.stocksRealData?.[symbol]) {
    const n = Number(window.stocksRealData[symbol].price || 0);
    if (Number.isFinite(n) && n > 0) return n;
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
export function clearPriceCache() { priceCache = {}; }

// Экспортируем глобально для использования в других модулях
window.getPortfoliosSync = getPortfoliosSync;
window.getTransactionsSync = getTransactionsSync;

// ==================== FAVORITES ====================
export async function getFavorites(retries = 2) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { favorites = []; return []; }

    const { data, error } = await supabase
      .from('favorites')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      if (retries > 0) return getFavorites(retries - 1);
      throw error;
    }

    favorites = data || [];
    return favorites;
  } catch (err) {
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
      // Нарушение уникальности — запись уже существует, возвращаем её
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

        }
      }
      throw error;
    }

    favorites.unshift(data);
    logActivity('add_favorite', 'favorites', { symbol: String(symbol).toUpperCase() });
    return data;
  } catch (e) {

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

      throw error;
    }

    const sym = favorites.find(f => f.id === id)?.symbol;
    favorites = favorites.filter(f => f.id !== id);
    logActivity('remove_favorite', 'favorites', { favorite_id: id, symbol: sym });
    return true;
  } catch (e) {

    throw e;
  }
}