// Универсальный безопасный fetch для всех внешних API (анти-CORB)
// Добавлен: локальный кэш (localStorage) и очередь с таймингом запросов + retry на 429
const __fetchQueue = [];
let __fetchQueueRunning = false;
const MIN_INTERVAL_MS = 1500; // интервал между запросами (примерно 40 запросов/мин на браузер)
const FETCH_CACHE_PREFIX = 'fetchCache_v1:';

function _cacheKey(url) {
    return FETCH_CACHE_PREFIX + url;
}

function _getCached(url, ttl) {
    try {
        const k = _cacheKey(url);
        const raw = localStorage.getItem(k);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.ts) return null;
        if (Date.now() - parsed.ts > ttl) {
            localStorage.removeItem(k);
            return null;
        }
        return parsed.data;
    } catch (e) {
        console.warn('fetch cache read error', e);
        return null;
    }
}

function _setCached(url, data) {
    try {
        const k = _cacheKey(url);
        localStorage.setItem(k, JSON.stringify({ ts: Date.now(), data }));
    } catch (e) {
        // localStorage may be full or blocked
        console.warn('fetch cache write error', e);
    }
}

async function _performFetchWithRetries(url, options, maxRetries = 3) {
    let attempt = 0;
    while (attempt <= maxRetries) {
        try {
            const resp = await fetch(url, options);
            if (resp.status === 429) {
                // Too many requests — backoff and retry
                const backoff = 500 * Math.pow(2, attempt) + Math.floor(Math.random() * 300);
                console.warn('Received 429 from', url, 'backoff', backoff, 'ms, attempt', attempt);
                await new Promise(r => setTimeout(r, backoff));
                attempt++;
                continue;
            }
            return resp;
        } catch (e) {
            // Network or CORS error — fail fast for non-429, but try a few times
            const backoff = 400 * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
            console.warn('Fetch error', e.message || e, 'backoff', backoff, 'ms, attempt', attempt);
            await new Promise(r => setTimeout(r, backoff));
            attempt++;
            continue;
        }
    }
    return null;
}

function _processFetchQueue() {
    if (__fetchQueueRunning) return;
    __fetchQueueRunning = true;

    (async function worker() {
        while (__fetchQueue.length > 0) {
            const item = __fetchQueue.shift();
            try {
                const resp = await _performFetchWithRetries(item.url, item.options, item.retries || 3);
                if (!resp) {
                    item.reject(new Error('fetch_failed'));
                } else {
                    const contentType = resp.headers.get ? (resp.headers.get('content-type') || '') : '';
                    if (!resp.ok) {
                        console.warn('safeFetchJsonGlobal: response not ok', item.url, resp.status);
                        item.resolve(null);
                    } else if (!contentType.includes('application/json')) {
                        console.warn('safeFetchJsonGlobal: CORB or non-JSON response', item.url, 'Content-Type:', contentType);
                        item.resolve(null);
                    } else {
                        const json = await resp.json();
                        item.resolve(json);
                    }
                }
            } catch (e) {
                console.warn('safeFetchJsonGlobal queue worker error', e);
                try { item.reject(e); } catch (_) {}
            }
            // wait between requests to avoid hitting rate limits
            await new Promise(r => setTimeout(r, MIN_INTERVAL_MS));
        }
        __fetchQueueRunning = false;
    })();
}

async function safeFetchJsonGlobal(url, options = {}, ttl = 60 * 1000) {
    // Попробуем вернуть из localStorage, если ttl > 0
    try {
        if (ttl > 0) {
            const cached = _getCached(url, ttl);
            if (cached !== null) return cached;
        }
    } catch (e) {
        console.warn('safeFetchJsonGlobal cache read failed', e);
    }

    return new Promise((resolve, reject) => {
        __fetchQueue.push({ url, options, resolve, reject, retries: 3 });
        _processFetchQueue();
    }).then(result => {
        try {
            if (result !== null && result !== undefined && ttl > 0) _setCached(url, result);
        } catch (e) {
            console.warn('safeFetchJsonGlobal cache write failed', e);
        }
        return result;
    }).catch(e => {
        console.warn('safeFetchJsonGlobal: fetch or parse error', url, e && (e.message || e));
        return null;
    });
}
// ============================================================================
// DASHBOARD MODULE - Модуль управления дашбордом
// ============================================================================

// Простая функция экранирования HTML для безопасного вывода
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

import { getPortfolios, getTransactions, getTransactionsSync, getFavorites, getPricesForSymbols, removeFavorite, addFavorite, getPriceSync } from '../../core/data.js';
import { fetchCoinGeckoGlobal } from '../../api/requests.js';
import * as currency from '../../core/currency.js';

function getCoinCapIcon(symbol) {
    return `https://assets.coincap.io/assets/icons/${String(symbol).toLowerCase()}@2x.png`;
}

// Получаем supabase из глобального объекта
const getSupabase = async () => {
    const { supabase } = await import('../../core/profile.js');
    return supabase;
};

// Проверка авторизации
const checkAuth = async () => {
    const supabase = await getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user || null;
};

// Состояние дашборда
const dashboardState = {
    widgets: [],
    marketData: null,
    fearGreedIndex: null,
    btcDominance: null,
    events: [],
    isLoading: false
};

export async function initDashboard() {
    console.log('Initializing Dashboard...');
    
    try {
        // Инициализируем drag & resize для виджетов
        await initWidgetsDragResize();
        
        // Загружаем все данные дашборда
        await loadDashboardData();
        
        // Инициализируем графики на главном дашборде
        await initDashboardCharts();
        
        // Запускаем автообновление
        startAutoRefresh();
        
        console.log('Dashboard initialized successfully');
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        showNotification('Ошибка загрузки дашборда', 'error');
    }
}

// ============================================================================
// ЗАГРУЗКА ДАННЫХ ДАШБОРДА
// ============================================================================

export async function loadDashboardData() {
    if (dashboardState.isLoading) {
        console.log('⏳ Dashboard data is already loading...');
        return;
    }
    
    dashboardState.isLoading = true;
    console.log('Loading dashboard data...');
    
    try {
        // Загружаем данные параллельно
        await Promise.allSettled([
            loadPortfolioStats(),
            loadMarketIndicators(),
            loadFearGreedIndex(),
            loadBTCDominance(),
            loadUpcomingEvents(),
            loadQuickActions()
        ]);
        // Загружаем избранное и обновляем UI
        try {
            const favs = await getFavorites();
            renderFavorites(favs);
            // Re-render when cryptoList becomes available to populate prices immediately
            const onList = async (e) => {
                try {
                    const fresh = await getFavorites();
                    renderFavorites(fresh);
                } catch (err) {
                    console.warn('cryptoListLoaded handler error:', err);
                }
            };
            document.addEventListener('cryptoListLoaded', onList, { once: true });
            
            // Re-render when stocks data becomes available
            const onStocks = async (e) => {
                try {
                    console.log('Stocks data loaded, updating favorites...', e.detail);
                    const fresh = await getFavorites();
                    renderFavorites(fresh);
                } catch (err) {
                    console.warn('stocksDataLoaded handler error:', err);
                }
            };
            document.addEventListener('stocksDataLoaded', onStocks, { once: true });
        } catch (e) {
            console.warn('Не удалось загрузить избранное:', e.message || e);
        }
        
        console.log('Dashboard data loaded successfully');
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    } finally {
        dashboardState.isLoading = false;
    }
}

// Рендер избранного в простом виде
export function renderFavorites(items) {
    const container = document.getElementById('favoritesContainer');
    if (!container) return;
    if (!items || items.length === 0) {
        container.innerHTML = '<div class="no-data">Нет избранных активов</div>';
        return;
    }

    const symbols = items.map(i => i.symbol);
    // Для избранного отключаем CoinGecko — используем Binance и window.cryptoList
    getPricesForSymbols(symbols, { useCoinGecko: false }).then(prices => {
        container.innerHTML = `<div class="favorites-grid">${items.map(f => {
            // Определяем тип актива (акция или криптовалюта)
            const isStock = window.STOCK_INFO && window.STOCK_INFO[f.symbol];
            
            // Для акций берем цену из window.stocksRealData
            let price;
            if (isStock) {
                const stockData = window.stocksRealData?.[f.symbol];
                price = stockData?.price ? parseFloat(stockData.price) : undefined;
                console.log(`Цена акции ${f.symbol} из stocksRealData:`, price, stockData);
            } else {
                // Для крипты используем Binance prices с fallback
                price = (prices && (prices[f.symbol] || prices[`${f.symbol}USDT`])) ?? undefined;
                if (!(Number.isFinite(price) && price > 0)) {
                    const fallback = getPriceSync(f.symbol);
                    if (Number.isFinite(fallback) && fallback > 0) price = fallback;
                }
            }
            
            // Format price with adaptive precision for very cheap assets
            const formatPriceForDisplay = (p) => {
                if (!Number.isFinite(p) || p <= 0) return '—';
                if (p >= 1) return `$${p.toFixed(2)}`;
                if (p >= 0.01) return `$${p.toFixed(4)}`;
                if (p >= 0.0001) return `$${p.toFixed(6)}`;
                return '<$0.0001';
            };
            const priceDisplay = formatPriceForDisplay(price);
            
            const info = isStock 
                ? (window.STOCK_INFO[f.symbol] || { name: f.symbol, color: '#3B82F6' })
                : ((window.CRYPTO_INFO && window.CRYPTO_INFO[f.symbol]) || { color: '#64748b' });
            
            console.log(`🎴 Рендер карточки избранного ${f.symbol}:`, { isStock, info, price, priceDisplay });
            
            const name = escapeHtml(isStock ? info.name : (info.name || ''));
            const symbolEsc = escapeHtml(f.symbol);
            
            // Разные иконки для акций и криптовалют
            let iconHTML;
            if (isStock) {
                const iconUrl = `https://img.logo.dev/${f.symbol.toLowerCase()}.com?token=pk_X-jjCWIKT_SRetd3NwvHUg&size=80`;
                const fallback1 = `https://assets.parqet.com/logos/symbol/${f.symbol}`;
                const fallback2 = `https://financialmodelingprep.com/image-stock/${f.symbol}.png`;
                iconHTML = `<img data-src="${iconUrl}" alt="${symbolEsc}" data-fallback1="${fallback1}" data-fallback2="${fallback2}" data-emoji="${f.symbol.charAt(0)}" style="width:100%;height:100%;object-fit:contain;border-radius:50%;"/>`;
                console.log(`  📸 Акция ${f.symbol} - иконка:`, iconUrl);
            } else {
                const iconUrl = getCoinCapIcon(f.symbol);
                const bgColor = info.color.replace('#','');
                const avatarUrl = `https://ui-avatars.com/api/?name=${symbolEsc}&background=${bgColor}&color=fff&size=48&bold=true`;
                iconHTML = `<img data-src="${iconUrl}" alt="${symbolEsc}" data-fallback1="${avatarUrl}" data-emoji="${f.symbol.charAt(0)}" style="width:100%;height:100%;object-fit:contain;"/>`;
            }
            
            return `
                <div class="favorite-card" data-id="${f.id}" data-symbol="${symbolEsc}" style="border-left: 4px solid ${info.color}; background: linear-gradient(135deg, ${info.color}08 0%, #ffffff 100%);">
                    <div class="fav-top">
                        <div class="fav-icon" aria-hidden style="background: linear-gradient(135deg, ${info.color}, ${info.color}dd); color: white;">${iconHTML}</div>
                        <div>
                            <div class="fav-symbol notranslate">${symbolEsc}</div>
                            <div class="fav-name notranslate">${name}</div>
                        </div>
                        <div style="margin-left:auto;"><button class="btn-fav active" data-action="toggle" data-id="${f.id}" title="Убрать из избранного">★</button></div>
                    </div>
                    <div class="fav-price-row">
                        <div class="fav-price notranslate">${priceDisplay}</div>
                        <div class="fav-change">&nbsp;</div>
                    </div>
                    <div class="fav-bottom">
                        <button class="fav-cta" data-action="open" data-symbol="${symbolEsc}">Открыть</button>
                        <div class="fav-actions"><button class="btn-fav" data-action="remove" data-id="${f.id}">Удалить</button></div>
                    </div>
                </div>
            `;
        }).join('')}</div>`;

        // Процессируем иконки через icon loader
        console.log('Вызов icon loader для избранного, window._iconLoader:', !!window._iconLoader);
        if (window._iconLoader && typeof window._iconLoader.processContainer === 'function') {
            const imgElements = container.querySelectorAll('img[data-src]');
            console.log(`  📸 Найдено img[data-src] элементов: ${imgElements.length}`, Array.from(imgElements).map(img => ({ src: img.dataset.src, alt: img.alt })));
            window._iconLoader.processContainer(container);
        } else {
            console.warn('Icon loader недоступен!');
        }

        // handlers
        container.querySelectorAll('button[data-action="remove"]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                try {
                    await removeFavorite(id);
                    const updated = await getFavorites();
                    renderFavorites(updated);
                } catch (err) {
                    console.error('Ошибка удаления избранного:', err);
                    showNotification('Ошибка удаления избранного', 'error');
                }
            });
        });

        container.querySelectorAll('button[data-action="toggle"]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const card = btn.closest('.favorite-card');
                const symbol = card?.getAttribute('data-symbol');
                // Optimistic UI: animate star immediately
                try {
                    btn.classList.add('animating', 'play-burst');
                    btn.classList.toggle('active');
                    // remove temporary classes after animation
                    setTimeout(() => { btn.classList.remove('animating'); btn.classList.remove('play-burst'); }, 600);

                    if (id) {
                        // removing
                        await removeFavorite(id);
                    } else if (symbol) {
                        // adding
                        await addFavorite(symbol);
                    }

                    const updated = await getFavorites();
                    renderFavorites(updated);
                } catch (err) {
                    // Revert visual state on error
                    console.error('Ошибка toggle избранного:', err);
                    btn.classList.toggle('active');
                    showNotification('Ошибка обновления избранного', 'error');
                    const updated = await getFavorites();
                    renderFavorites(updated);
                }
            });
        });

        container.querySelectorAll('button[data-action="open"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const symbol = btn.getAttribute('data-symbol');
                if (!symbol) return;
                
                // Определяем тип актива
                const isStock = window.STOCK_INFO && window.STOCK_INFO[symbol];
                
                if (isStock) {
                    // Открываем модальное окно акции
                    if (window.app && window.app.showStockDetail) {
                        window.app.showStockDetail(symbol);
                    }
                } else {
                    // Открываем модальное окно криптовалюты
                    if (window.showVueCryptoModal) {
                        window.showVueCryptoModal(symbol);
                    }
                }
            });
        });
    }).catch(err => {
        console.warn('Не удалось получить цены для избранного', err);
        // fallback simple list (styled)
        container.innerHTML = `<div class="favorites-grid">${items.map(f => {
            const symbolEsc = escapeHtml(f.symbol);
            const info = (window.CRYPTO_INFO && window.CRYPTO_INFO[f.symbol]) || { color: '#64748b' };
            const iconUrl = getCoinCapIcon(f.symbol);
            return `
            <div class="favorite-card" data-id="${f.id}" style="border-left:4px solid ${info.color}; background: linear-gradient(135deg, ${info.color}08 0%, #ffffff 100%);">
                <div class="fav-top">
                    <div class="fav-icon" aria-hidden style="background: linear-gradient(135deg, ${info.color}, ${info.color}dd);"><img src="${iconUrl}" alt="${symbolEsc}" style="width:100%;height:100%;object-fit:contain;" onerror="this.onerror=null;this.src='https://ui-avatars.com/api/?name=${symbolEsc}&background=${info.color.replace('#','')}&color=fff&size=48&bold=true'"/></div>
                    <div class="fav-symbol">${symbolEsc}</div>
                    <div class="fav-actions"><button class="btn-fav" data-action="remove" data-id="${f.id}">Удалить</button></div>
                </div>
            </div>
        `}).join('')}</div>`;
    });

    // If some prices are missing (displayed as '—'), retry a few times to pick up prices
    (function retryFillMissing(attempts = 3, delay = 600) {
        if (attempts <= 0) return;
        setTimeout(() => {
            let anyUpdated = false;
            container.querySelectorAll('.favorite-card').forEach(card => {
                const priceEl = card.querySelector('.fav-price');
                if (!priceEl) return;
                const txt = priceEl.textContent?.trim();
                if (txt === '—' || txt === '' ) {
                    const symbol = card.getAttribute('data-symbol');
                    if (!symbol) return;
                    const p = getPriceSync(symbol);
                    if (Number.isFinite(p) && p > 0) {
                        const formatted = (p >= 1) ? `$${p.toFixed(2)}` : (p >= 0.01 ? `$${p.toFixed(4)}` : (p >= 0.0001 ? `$${p.toFixed(6)}` : '<$0.0001'));
                        priceEl.textContent = formatted;
                        anyUpdated = true;
                    }
                }
            });
            if (!anyUpdated) retryFillMissing(attempts - 1, delay * 1.2);
        }, delay);
    })();

    // Also, watch for window.cryptoList becoming available and fill prices from it immediately
    (function watchCryptoList(timeout = 10000, interval = 300) {
        const start = Date.now();
        const check = () => {
            if (window.cryptoList && window.cryptoList.length > 0) {
                // fill prices from cryptoList
                container.querySelectorAll('.favorite-card').forEach(card => {
                    const symbol = card.getAttribute('data-symbol');
                    if (!symbol) return;
                    const pObj = window.cryptoList.find(c => (c.symbol || '').toUpperCase() === symbol.toUpperCase());
                    if (pObj && (pObj.price || pObj.current_price || pObj.priceUsd || pObj.price_usd)) {
                        const raw = pObj.price ?? pObj.current_price ?? pObj.priceUsd ?? pObj.price_usd;
                        const num = Number(raw);
                        if (Number.isFinite(num) && num > 0) {
                            const priceEl = card.querySelector('.fav-price');
                            if (priceEl) {
                                const formatted = (num >= 1) ? `$${num.toFixed(2)}` : (num >= 0.01 ? `$${num.toFixed(4)}` : (num >= 0.0001 ? `$${num.toFixed(6)}` : '<$0.0001'));
                                priceEl.textContent = formatted;
                            }
                        }
                    }
                });
                return; // done
            }
            if (Date.now() - start < timeout) {
                setTimeout(check, interval);
            }
        };
        check();
    })();
}

// Экспортируем/регистрируем функцию для внешнего вызова (например из модалок)
window.refreshFavorites = async function() {
    try {
        const favs = await getFavorites();
        renderFavorites(favs);
    } catch (e) {
        console.warn('refreshFavorites error:', e);
    }
};

// ============================================================================
// ЗАГРУЗКА СТАТИСТИКИ ПОРТФЕЛЕЙ
// ============================================================================

// Кэш для цен криптовалют
const priceCache = {
    data: {},
    timestamp: 0,
    CACHE_DURATION: 30000 // 30 секунд
};

// Функция для получения текущих цен активов через Binance
async function fetchCurrentPrices(symbols) {
    const prices = {};
    
    if (!symbols || symbols.length === 0) {
        console.log('No symbols to fetch prices for');
        return prices;
    }
    
    // Проверяем кэш
    const now = Date.now();
    if (now - priceCache.timestamp < priceCache.CACHE_DURATION && Object.keys(priceCache.data).length > 0) {
        console.log('Using cached prices (age:', Math.round((now - priceCache.timestamp) / 1000), 'seconds)');
        
        // Возвращаем закэшированные цены для запрошенных символов
        symbols.forEach(symbol => {
            if (priceCache.data[symbol]) {
                prices[symbol] = priceCache.data[symbol];
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
                const data = await safeFetchJsonGlobal(url);
                if (data) {
                    console.log('Binance response received:', data.length, 'pairs');
                    // Создаем быстрый lookup объект
                    const binancePrices = {};
                    data.forEach(item => {
                        binancePrices[item.symbol] = parseFloat(item.price);
                    });
                    // Маппим цены обратно к оригинальным символам
                    symbols.forEach(symbol => {
                        const binanceSymbol = symbolToBindanceMap[symbol];
                        if (binanceSymbol && binancePrices[binanceSymbol]) {
                            prices[symbol] = binancePrices[binanceSymbol];
                            console.log(`Price for ${symbol}: $${prices[symbol]}`);
                        }
                    });
                    // Обновляем кэш
                    priceCache.data = { ...priceCache.data, ...prices };
                    priceCache.timestamp = Date.now();
                } else {
                    console.error('Binance API error: no data');
                    // Fallback на кэш при любой ошибке
                    symbols.forEach(symbol => {
                        if (priceCache.data[symbol]) {
                            prices[symbol] = priceCache.data[symbol];
                            console.log(`Using cached price for ${symbol}: $${prices[symbol]}`);
                        }
                    });
                }
            } catch (err) {
                console.error('Error fetching crypto prices from Binance:', err);
                // Fallback на закэшированные цены
                console.log('Using cached prices due to fetch error');
                symbols.forEach(symbol => {
                    if (priceCache.data[symbol]) {
                        prices[symbol] = priceCache.data[symbol];
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
            if (priceCache.data[symbol]) {
                prices[symbol] = priceCache.data[symbol];
            }
        });
    }
    
    return prices;
}

async function loadPortfolioStats() {
    try {
        console.log('Loading portfolio stats...');
        
        const user = await checkAuth();
        if (!user) {
            console.warn('No user authenticated');
            return;
        }
        
        console.log('User authenticated:', user.id);
        
        // Загружаем портфели и транзакции через data.js
        const portfolios = await getPortfolios();
        const transactions = await getTransactions();
        
        console.log('Portfolios loaded:', portfolios?.length || 0, portfolios);
        console.log('Transactions loaded:', transactions?.length || 0, transactions);
        
        if (!transactions || transactions.length === 0) {
            console.warn('NO TRANSACTIONS FOUND! User needs to add transactions first.');
            // Показываем stats с нулями
            const emptyStats = {
                totalValue: 0,
                totalChange: 0,
                portfolioCount: portfolios?.length || 0,
                cryptoCount: 0,
                stocksCount: 0,
                totalReturn: 0,
                totalInvested: 0
            };
            updatePortfolioStatsUI(emptyStats);
            return;
        }
        
        // Вычисляем статистику
        const stats = await calculatePortfolioStats(portfolios, transactions);
        
        console.log('Calculated stats:', stats);
        
        // Обновляем UI
        updatePortfolioStatsUI(stats);
        
        // Отправляем уведомление об изменении портфеля
        console.log('🔔 Проверка интеграции уведомлений...', {
            hasIntegrations: !!window.notificationIntegrations,
            totalValue: stats.totalValue,
            functions: window.notificationIntegrations ? Object.keys(window.notificationIntegrations) : []
        });
        
        if (window.notificationIntegrations && stats.totalValue > 0) {
            console.log('📢 Вызываем уведомление об изменении портфеля...');
            try {
                await window.notificationIntegrations.notifyAboutPortfolioChange(stats.totalValue, stats);
                
                // Проверяем диверсификацию
                const holdings = {};
                transactions.forEach(tx => {
                    if (!holdings[tx.symbol]) {
                        holdings[tx.symbol] = { value: 0, quantity: 0 };
                    }
                    const multiplier = tx.type === 'BUY' ? 1 : -1;
                    holdings[tx.symbol].quantity += tx.quantity * multiplier;
                });
                
                // Получаем цены и рассчитываем стоимость
                const symbols = Object.keys(holdings).filter(s => holdings[s].quantity > 0);
                const prices = await fetchCurrentPrices(symbols);
                for (const symbol of symbols) {
                    if (prices[symbol] && holdings[symbol].quantity > 0) {
                        holdings[symbol].value = holdings[symbol].quantity * prices[symbol];
                    }
                }
                
                await window.notificationIntegrations.checkPortfolioDiversification(holdings);
            } catch (error) {
                console.error('Ошибка при отправке уведомления о портфеле:', error);
            }
        }
        
        console.log('Portfolio stats updated');
        
    } catch (error) {
        console.error('Error loading portfolio stats:', error);
    }
}

async function calculatePortfolioStats(portfolios, transactions) {
    const stats = {
        totalValue: 0,
        totalChange: 0,
        portfolioCount: portfolios?.length || 0,
        cryptoCount: 0,
        stocksCount: 0,
        totalReturn: 0,
        totalInvested: 0
    };
    
    if (!transactions || transactions.length === 0) {
        console.log('No transactions found');
        return stats;
    }
    
    console.log('Processing transactions:', transactions);
    console.log('Number of transactions:', transactions.length);
    
    // Группируем активы по символу
    const assets = {};
    transactions.forEach((tx, index) => {
        console.log(`Transaction ${index + 1}:`, {
            symbol: tx.symbol,
            type: tx.type,
            quantity: tx.quantity,
            price: tx.price,
            asset_type: tx.asset_type
        });
        
        if (!assets[tx.symbol]) {
            // Определяем тип актива
            let assetType = tx.asset_type;
            
            // Если тип не указан, определяем по символу
            if (!assetType) {
                // Проверяем есть ли символ в CRYPTO_INFO
                if (window.CRYPTO_INFO && window.CRYPTO_INFO[tx.symbol]) {
                    assetType = 'CRYPTO';
                }
                // Проверяем есть ли в STOCK_INFO
                else if (window.STOCK_INFO && window.STOCK_INFO[tx.symbol]) {
                    assetType = 'STOCK';
                }
                // По умолчанию - крипта
                else {
                    assetType = 'CRYPTO';
                }
                console.log(`Auto-detected asset type for ${tx.symbol}: ${assetType}`);
            }
            
            assets[tx.symbol] = { 
                quantity: 0, 
                type: assetType,
                totalCost: 0,
                totalQuantity: 0
            };
        }
        
        const multiplier = tx.type === 'BUY' ? 1 : -1;
        const quantity = tx.quantity * multiplier;
        
        assets[tx.symbol].quantity += quantity;
        
        if (tx.type === 'BUY') {
            const cost = tx.quantity * tx.price;
            assets[tx.symbol].totalCost += cost;
            assets[tx.symbol].totalQuantity += tx.quantity;
            console.log(`  Added cost: $${cost.toFixed(2)} (${tx.quantity} × $${tx.price})`);
        }
    });
    
    console.log('Assets grouped:', assets);
    
    // Подсчитываем активы и получаем актуальные цены
    let cryptoAssets = 0;
    let stockAssets = 0;
    
    // Получаем актуальные цены для всех активов
    const symbols = Object.keys(assets).filter(symbol => assets[symbol].quantity > 0);
    console.log('Symbols to fetch prices for:', symbols);
    console.log('Assets details:', JSON.stringify(assets, null, 2));
    
    const prices = await fetchCurrentPrices(symbols);
    
    console.log('Current prices fetched:', prices);
    console.log('Number of prices received:', Object.keys(prices).length);
    
    let totalCurrentValue = 0;
    let assetsWithPrices = 0;
    let assetsWithoutPrices = 0;
    
    for (const [symbol, asset] of Object.entries(assets)) {
        if (asset.quantity > 0) {
            const assetType = asset.type?.toUpperCase();
            if (assetType === 'CRYPTO' || assetType === 'CRYPTOCURRENCY') {
                cryptoAssets++;
            } else if (assetType === 'STOCK' || assetType === 'STOCKS') {
                stockAssets++;
            }
            
            stats.totalInvested += asset.totalCost;
            
            // Рассчитываем текущую стоимость актива
            const currentPrice = prices[symbol];
            const avgBuyPrice = asset.totalQuantity > 0 ? asset.totalCost / asset.totalQuantity : 0;
            
            if (currentPrice && currentPrice > 0) {
                const assetValue = asset.quantity * currentPrice;
                totalCurrentValue += assetValue;
                assetsWithPrices++;
                console.log(`${symbol}: quantity=${asset.quantity}, currentPrice=${currentPrice}, value=${assetValue}`);
            } else if (avgBuyPrice > 0) {
                // Если нет актуальной цены, используем среднюю цену покупки
                const assetValue = asset.quantity * avgBuyPrice;
                totalCurrentValue += assetValue;
                assetsWithoutPrices++;
                console.log(`${symbol}: using avg buy price=${avgBuyPrice}, value=${assetValue}`);
            }
        }
    }
    
    stats.totalValue = totalCurrentValue;
    stats.cryptoCount = cryptoAssets;
    stats.stocksCount = stockAssets;
    
    console.log(`Assets with current prices: ${assetsWithPrices}, without prices: ${assetsWithoutPrices}`);
    console.log(`Total invested: $${stats.totalInvested.toFixed(2)}, Current value: $${stats.totalValue.toFixed(2)}`);
    
    // Рассчитываем реальную доходность
    if (stats.totalInvested > 0) {
        const returnAmount = stats.totalValue - stats.totalInvested;
        stats.totalReturn = parseFloat(((returnAmount / stats.totalInvested) * 100).toFixed(2));
        stats.totalChange = stats.totalReturn;
        console.log(`Return amount: $${returnAmount.toFixed(2)}, Return %: ${stats.totalReturn}%`);
    } else {
        stats.totalReturn = 0;
        stats.totalChange = 0;
        console.log('No investments found, return is 0');
    }
    
    console.log('Final stats with real prices:', stats);
    
    return stats;
}

function updatePortfolioStatsUI(stats) {
    console.log('Updating UI with stats:', stats);
    
    // Используем setTimeout чтобы дать DOM время на рендеринг
    setTimeout(() => {
        const elements = {
            totalValue: document.getElementById('totalValue'),
            totalChange: document.getElementById('totalChange'),
            portfolioCount: document.getElementById('portfolioCount'),
            totalReturn: document.getElementById('totalReturn'),
            cryptoCount: document.getElementById('cryptoCount'),
            stocksCount: document.getElementById('stocksCount')
        };
        const symbol = currency.getCurrencySymbol();
        if (elements.totalValue) {
            const value = currency.convertToSelectedCurrency(stats.totalValue);
            elements.totalValue.textContent = `${value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${symbol}`;
        }
        if (elements.totalChange) {
            const changeAmount = currency.convertToSelectedCurrency(stats.totalValue - stats.totalInvested);
            const changeClass = stats.totalChange >= 0 ? 'positive' : 'negative';
            elements.totalChange.innerHTML = `<span class="${changeClass}">${stats.totalChange >= 0 ? '+' : ''}${stats.totalChange.toFixed(1)}% (${changeAmount >= 0 ? '+' : ''}${changeAmount.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${symbol})</span>`;
        }
        if (elements.portfolioCount) {
            elements.portfolioCount.textContent = stats.portfolioCount;
        }
        if (elements.totalReturn) {
            const returnValue = stats.totalReturn || 0;
            const sign = returnValue >= 0 ? '+' : '';
            elements.totalReturn.textContent = `${sign}${returnValue.toFixed(1)}%`;
            elements.totalReturn.style.color = returnValue >= 0 ? '#10B981' : '#EF4444';
            drawReturnSparkline(returnValue);
        }
        if (elements.cryptoCount) {
            elements.cryptoCount.textContent = stats.cryptoCount;
        }
        if (elements.stocksCount) {
            elements.stocksCount.textContent = stats.stocksCount;
        }
        setTimeout(() => {
            initDashboardCharts();
        }, 200);
    }, 100);
// Слушаем смену валюты и обновляем дашборд
if (window.currency) {
    window.addEventListener('currencyChanged', async () => {
        console.log('Currency changed, reloading dashboard data...');
        await loadDashboardData();
        // Обновляем также все открытые модальные окна
        if (window.app && window.app.refreshCurrentModal) {
            window.app.refreshCurrentModal();
        }
    });
    
    window.addEventListener('currencyRateUpdated', async () => {
        console.log('Currency rate updated, reloading dashboard data...');
        await loadDashboardData();
    });
}
}

// Функция для рисования sparkline графика доходности
async function drawReturnSparkline(returnValue) {
    const canvas = document.getElementById('returnSparkline');
    if (!canvas) {
        console.warn('returnSparkline canvas not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Очистка canvas
    ctx.clearRect(0, 0, width, height);
    
    try {
        // Получаем исторические данные BTC из Binance для примера тренда
        const symbol = 'BTCUSDT';
        const interval = '1h'; // 1 час
        const limit = 15; // последние 15 точек
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error('Binance API error');
        
        const klines = await response.json();
        
        // Извлекаем цены закрытия и нормализуем их
        const closePrices = klines.map(k => parseFloat(k[4]));
        const firstPrice = closePrices[0];
        
        // Преобразуем в процентное изменение относительно начальной цены
        const percentChanges = closePrices.map(price => ((price - firstPrice) / firstPrice) * 100);
        
        // Масштабируем изменения под текущую доходность портфеля
        const maxChange = Math.max(...percentChanges.map(Math.abs));
        const scaleFactor = returnValue / (maxChange || 1);
        const data = percentChanges.map(change => change * scaleFactor);
        
        // Определяем min/max для масштабирования
        const minValue = Math.min(...data, 0);
        const maxValue = Math.max(...data, 0);
        const range = maxValue - minValue || 1;
        const padding = 6;
        
        // Цвета в зависимости от доходности
        const isPositive = returnValue >= 0;
        const mainColor = isPositive ? '#10B981' : '#EF4444';
        const gradientStartColor = isPositive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)';
        const gradientEndColor = isPositive ? 'rgba(16, 185, 129, 0)' : 'rgba(239, 68, 68, 0)';
        
        // Создаем градиент для заливки
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, gradientStartColor);
        gradient.addColorStop(1, gradientEndColor);
        
        // Рисуем заливку под линией
        ctx.beginPath();
        ctx.moveTo(padding, height - padding);
        
        data.forEach((value, i) => {
            const x = (i / (data.length - 1)) * (width - padding * 2) + padding;
            const y = height - padding - ((value - minValue) / range) * (height - padding * 2);
            ctx.lineTo(x, y);
        });
        
        ctx.lineTo(width - padding, height - padding);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Рисуем основную линию с тенью
        ctx.shadowColor = mainColor;
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        ctx.beginPath();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = mainColor;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        data.forEach((value, i) => {
            const x = (i / (data.length - 1)) * (width - padding * 2) + padding;
            const y = height - padding - ((value - minValue) / range) * (height - padding * 2);
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
        
        // Убираем тень для точки
        ctx.shadowBlur = 0;
        
        // Рисуем светящуюся точку на конце
        const lastX = width - padding;
        const lastY = height - padding - ((data[data.length - 1] - minValue) / range) * (height - padding * 2);
        
        // Внешнее свечение
        ctx.beginPath();
        ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
        const glowGradient = ctx.createRadialGradient(lastX, lastY, 0, lastX, lastY, 5);
        glowGradient.addColorStop(0, mainColor);
        glowGradient.addColorStop(0.5, mainColor + '80');
        glowGradient.addColorStop(1, mainColor + '00');
        ctx.fillStyle = glowGradient;
        ctx.fill();
        
        // Основная точка
        ctx.beginPath();
        ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        
        // Внутренняя цветная точка
        ctx.beginPath();
        ctx.arc(lastX, lastY, 2, 0, Math.PI * 2);
        ctx.fillStyle = mainColor;
        ctx.fill();
        
        console.log('Sparkline drawn with real Binance data');
        
    } catch (error) {
        console.warn('Failed to fetch Binance data, using synthetic data:', error);
        
        // Fallback: синтетические данные если API недоступен
        const points = 15;
        const data = [];
        const currentReturn = returnValue;
        
        for (let i = 0; i < points; i++) {
            const progress = i / (points - 1);
            const variation = (Math.sin(i * 0.8) * 0.3 + Math.cos(i * 1.2) * 0.2) * Math.abs(currentReturn) * 0.4;
            data.push(currentReturn * progress + variation);
        }
        
        const minValue = Math.min(...data, 0);
        const maxValue = Math.max(...data, 0);
        const range = maxValue - minValue || 1;
        const padding = 6;
        
        const isPositive = returnValue >= 0;
        const mainColor = isPositive ? '#10B981' : '#EF4444';
        const gradientStartColor = isPositive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)';
        const gradientEndColor = isPositive ? 'rgba(16, 185, 129, 0)' : 'rgba(239, 68, 68, 0)';
        
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, gradientStartColor);
        gradient.addColorStop(1, gradientEndColor);
        
        ctx.beginPath();
        ctx.moveTo(padding, height - padding);
        
        data.forEach((value, i) => {
            const x = (i / (points - 1)) * (width - padding * 2) + padding;
            const y = height - padding - ((value - minValue) / range) * (height - padding * 2);
            ctx.lineTo(x, y);
        });
        
        ctx.lineTo(width - padding, height - padding);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
        
        ctx.shadowColor = mainColor;
        ctx.shadowBlur = 4;
        
        ctx.beginPath();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = mainColor;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        data.forEach((value, i) => {
            const x = (i / (points - 1)) * (width - padding * 2) + padding;
            const y = height - padding - ((value - minValue) / range) * (height - padding * 2);
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
        ctx.shadowBlur = 0;
        
        const lastX = width - padding;
        const lastY = height - padding - ((data[data.length - 1] - minValue) / range) * (height - padding * 2);
        
        ctx.beginPath();
        ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
        const glowGradient = ctx.createRadialGradient(lastX, lastY, 0, lastX, lastY, 5);
        glowGradient.addColorStop(0, mainColor);
        glowGradient.addColorStop(0.5, mainColor + '80');
        glowGradient.addColorStop(1, mainColor + '00');
        ctx.fillStyle = glowGradient;
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(lastX, lastY, 2, 0, Math.PI * 2);
        ctx.fillStyle = mainColor;
        ctx.fill();
    }
}

// ============================================================================
// ИНДИКАТОРЫ РЫНКА
// ============================================================================

async function loadMarketIndicators() {
    try {
        const CACHE_KEY = 'market_indicators_cache';
        const CACHE_DURATION = 5 * 60 * 1000; // 5 минут
        
        // Проверяем кеш
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            const age = Date.now() - timestamp;
            
            if (age < CACHE_DURATION) {
                console.log(`Используем кешированные индексы (обновление через ${Math.round((CACHE_DURATION - age) / 1000)}с)`);
                updateMarketIndicatorsUI(data);
                return;
            }
        }
        
        // Загружаем основные индикаторы
        const indicators = await fetchMarketIndicators();
        
        // Сохраняем в кеш
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            data: indicators,
            timestamp: Date.now()
        }));
        
        updateMarketIndicatorsUI(indicators);
    } catch (error) {
        console.error('Error loading market indicators:', error);
        const container = document.getElementById('marketIndicators');
        if (container) {
            container.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Ошибка загрузки индикаторов</p>
                </div>
            `;
        }
    }
}

async function fetchMarketIndicators() {
    const TWELVE_DATA_KEY = 'b158f56a4d7348ee9287aa5913345422';
    
    // Основные индексы для дашборда через ETF
    const indices = [
        { symbol: 'SPY', name: 'S&P 500' },
        { symbol: 'DIA', name: 'Dow Jones' },
        { symbol: 'QQQ', name: 'NASDAQ' }
    ];
    
    const results = {};
    
    for (const index of indices) {
        try {
            const response = await fetch(
                `https://api.twelvedata.com/quote?symbol=${index.symbol}&apikey=${TWELVE_DATA_KEY}`
            );
            
            if (!response.ok) {
                console.warn(`Failed to fetch ${index.symbol}:`, response.status);
                continue;
            }
            
            const data = await response.json();
            
            if (data.code === 401 || data.code === 429) {
                console.warn(`TwelveData API error for ${index.symbol}:`, data.message);
                continue;
            }
            
            if (data.symbol && data.close) {
                const price = parseFloat(data.close);
                const change = parseFloat(data.percent_change || 0);
                
                results[index.symbol.toLowerCase()] = {
                    name: index.name,
                    value: price.toFixed(2),
                    change: change.toFixed(2),
                    high: parseFloat(data.high || 0).toFixed(2),
                    low: parseFloat(data.low || 0).toFixed(2)
                };
            }
            
            // Задержка между запросами
            await new Promise(resolve => setTimeout(resolve, 100));
            
        } catch (error) {
            console.error(`Error fetching ${index.symbol}:`, error);
        }
    }
    
    return results;
}

function updateMarketIndicatorsUI(indicators) {
    const container = document.getElementById('marketIndicators');
    if (!container) return;
    
    const indicatorKeys = Object.keys(indicators);
    
    if (indicatorKeys.length === 0) {
        container.innerHTML = `
            <div class="error-message">
                <i class="bi bi-exclamation-triangle"></i>
                <p>Нет данных об индексах</p>
            </div>
        `;
        return;
    }
    
    const symbol = currency.getCurrencySymbol();
    const html = indicatorKeys.map(key => {
        const indicator = indicators[key];
        const change = parseFloat(indicator.change);
        const isPositive = change >= 0;
        const value = currency.convertToSelectedCurrency(parseFloat(indicator.value));
        return `
            <div class="indicator-item">
                <div class="indicator-header">
                    <i class="bi bi-graph-up-arrow"></i>
                    <span class="indicator-label">${indicator.name}</span>
                </div>
                <div class="indicator-values">
                    <span class="indicator-value">${value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${symbol}</span>
                    <span class="indicator-change ${isPositive ? 'positive' : 'negative'}">
                        <i class="bi bi-${isPositive ? 'arrow-up' : 'arrow-down'}-short"></i>
                        ${isPositive ? '+' : ''}${indicator.change}%
                    </span>
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = html;
}

// ============================================================================
// FEAR & GREED INDEX
// ============================================================================

async function loadFearGreedIndex() {
    try {
        // API для Fear & Greed Index
        const fgDataObj = await safeFetchJsonGlobal('https://api.alternative.me/fng/?limit=1');
        if (!fgDataObj) throw new Error('HTTP error! status: no data');
        if (fgDataObj.data && fgDataObj.data.length > 0) {
            const fgData = fgDataObj.data[0];
            dashboardState.fearGreedIndex = {
                value: parseInt(fgData.value),
                classification: fgData.value_classification
            };
            updateFearGreedUI();
        }
    } catch (error) {
        console.error('Error loading Fear & Greed Index:', error);
        // Используем fallback данные
        dashboardState.fearGreedIndex = {
            value: 50,
            classification: 'Neutral'
        };
        updateFearGreedUI();
    }
}

function updateFearGreedUI() {
    const widgetBody = document.querySelector('#fearGreedWidget .widget-body');
    if (!widgetBody || !dashboardState.fearGreedIndex) return;
    
    const { value, classification } = dashboardState.fearGreedIndex;
    
    // Определяем цвет и описание
    let color, bgColor, textRu;
    if (value < 25) {
        color = '#ef4444';
        bgColor = 'rgba(239, 68, 68, 0.1)';
        textRu = 'Крайний страх';
    } else if (value < 45) {
        color = '#f59e0b';
        bgColor = 'rgba(245, 158, 11, 0.1)';
        textRu = 'Страх';
    } else if (value < 55) {
        color = '#eab308';
        bgColor = 'rgba(234, 179, 8, 0.1)';
        textRu = 'Нейтрально';
    } else if (value < 75) {
        color = '#10b981';
        bgColor = 'rgba(16, 185, 129, 0.1)';
        textRu = 'Жадность';
    } else {
        color = '#22c55e';
        bgColor = 'rgba(34, 197, 94, 0.1)';
        textRu = 'Крайняя жадность';
    }
    
    // Рассчитываем угол стрелки (от 0 до 180 градусов)
    const angle = (value / 100) * 180;
    const radians = (angle - 180) * (Math.PI / 180);
    const needleLength = 65;
    const centerX = 120;
    const centerY = 130;
    const needleX = centerX + needleLength * Math.cos(radians);
    const needleY = centerY + needleLength * Math.sin(radians);
    
    widgetBody.innerHTML = `
        <div class="fear-greed-container">
            <div class="fear-greed-gauge-wrapper">
                <svg class="fear-greed-gauge" viewBox="0 0 240 170" preserveAspectRatio="xMidYMid meet" style="overflow: visible;">
                    <defs>
                        <!-- Основной градиент спидометра -->
                        <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" style="stop-color:#ef4444;stop-opacity:1" />
                            <stop offset="20%" style="stop-color:#f97316;stop-opacity:1" />
                            <stop offset="40%" style="stop-color:#f59e0b;stop-opacity:1" />
                            <stop offset="50%" style="stop-color:#eab308;stop-opacity:1" />
                            <stop offset="70%" style="stop-color:#84cc16;stop-opacity:1" />
                            <stop offset="85%" style="stop-color:#10b981;stop-opacity:1" />
                            <stop offset="100%" style="stop-color:#22c55e;stop-opacity:1" />
                        </linearGradient>
                        
                        <!-- Градиент для свечения -->
                        <linearGradient id="glowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" style="stop-color:#ef4444;stop-opacity:0.5" />
                            <stop offset="50%" style="stop-color:#eab308;stop-opacity:0.5" />
                            <stop offset="100%" style="stop-color:#22c55e;stop-opacity:0.5" />
                        </linearGradient>
                        
                        <!-- Фильтр свечения -->
                        <filter id="glow">
                            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                            <feMerge>
                                <feMergeNode in="coloredBlur"/>
                                <feMergeNode in="SourceGraphic"/>
                            </feMerge>
                        </filter>
                        
                        <!-- Фильтр тени для стрелки -->
                        <filter id="needleShadow">
                            <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
                            <feOffset dx="0" dy="2" result="offsetblur"/>
                            <feComponentTransfer>
                                <feFuncA type="linear" slope="0.5"/>
                            </feComponentTransfer>
                            <feMerge>
                                <feMergeNode/>
                                <feMergeNode in="SourceGraphic"/>
                            </feMerge>
                        </filter>
                    </defs>
                    
                    <!-- Внешний круг (декоративный) -->
                    <circle cx="120" cy="130" r="95" 
                            fill="none" 
                            stroke="rgba(255,255,255,0.03)" 
                            stroke-width="1"/>
                    
                    <!-- Фоновая дуга -->
                    <path d="M 25 130 A 95 95 0 0 1 215 130" 
                          fill="none" 
                          stroke="rgba(255,255,255,0.06)" 
                          stroke-width="24" 
                          stroke-linecap="round"/>
                    
                    <!-- Светящаяся дуга -->
                    <path d="M 25 130 A 95 95 0 0 1 215 130" 
                          fill="none" 
                          stroke="url(#glowGradient)" 
                          stroke-width="26" 
                          stroke-linecap="round"
                          opacity="0.3"
                          filter="url(#glow)"/>
                    
                    <!-- Основная цветная дуга -->
                    <path d="M 25 130 A 95 95 0 0 1 215 130" 
                          fill="none" 
                          stroke="url(#gaugeGradient)" 
                          stroke-width="22" 
                          stroke-linecap="round"
                          filter="url(#glow)"/>
                    
                    <!-- Деления на спидометре -->
                    ${generateGaugeTicks()}
                    
                    <!-- Центральный круг (основа стрелки) -->
                    <circle cx="120" cy="130" r="12" 
                            fill="rgba(0,0,0,0.4)" 
                            filter="url(#glow)"/>
                    <circle cx="120" cy="130" r="10" 
                            fill="${color}" 
                            opacity="0.2"/>
                    <circle cx="120" cy="130" r="6" 
                            fill="${color}"
                            filter="url(#glow)"/>
                    
                    <!-- Стрелка -->
                    <g filter="url(#needleShadow)">
                        <line x1="120" y1="130" 
                              x2="${needleX}" 
                              y2="${needleY}" 
                              stroke="${color}" 
                              stroke-width="4" 
                              stroke-linecap="round"
                              opacity="0.8"/>
                        <line x1="120" y1="130" 
                              x2="${needleX}" 
                              y2="${needleY}" 
                              stroke="white" 
                              stroke-width="2" 
                              stroke-linecap="round"
                              opacity="0.3"/>
                    </g>
                    
                    <!-- Метки значений -->
                    <text x="30" y="145" fill="rgba(239,68,68,0.8)" font-size="11" font-weight="600">0</text>
                    <text x="113" y="45" fill="rgba(234,179,8,0.8)" font-size="11" font-weight="600">50</text>
                    <text x="203" y="145" fill="rgba(34,197,94,0.8)" font-size="11" font-weight="600">100</text>
                </svg>
            </div>
            
            <div class="fear-greed-info-card">
                <div class="fear-greed-value-display">
                    <div class="fear-greed-value" style="color: ${color};">
                        ${value}
                    </div>
                    <div class="fear-greed-label" style="color: ${color};">
                        ${textRu}
                    </div>
                    <div class="fear-greed-classification">
                        ${classification}
                    </div>
                </div>
            </div>
            
            <div class="fear-greed-legend">
                <div class="legend-item fear">
                    <i class="bi bi-emoji-frown-fill"></i>
                    <span>Страх</span>
                </div>
                <div class="legend-item neutral">
                    <i class="bi bi-emoji-neutral-fill"></i>
                    <span>Нейтрально</span>
                </div>
                <div class="legend-item greed">
                    <i class="bi bi-emoji-smile-fill"></i>
                    <span>Жадность</span>
                </div>
            </div>
        </div>
    `;
}

// Функция генерации делений на спидометре
function generateGaugeTicks() {
    let ticks = '';
    for (let i = 0; i <= 10; i++) {
        const angle = (i / 10) * 180 - 180;
        const radians = angle * (Math.PI / 180);
        const innerRadius = 85;
        const outerRadius = i % 2 === 0 ? 92 : 90;
        
        const x1 = 120 + innerRadius * Math.cos(radians);
        const y1 = 130 + innerRadius * Math.sin(radians);
        const x2 = 120 + outerRadius * Math.cos(radians);
        const y2 = 130 + outerRadius * Math.sin(radians);
        
        ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" 
                       stroke="rgba(255,255,255,0.3)" 
                       stroke-width="${i % 2 === 0 ? 2 : 1}" 
                       stroke-linecap="round"/>`;
    }
    return ticks;
}

// ============================================================================
// BTC DOMINANCE
// ============================================================================

async function loadBTCDominance() {
    try {
        console.log('Loading BTC dominance from CoinGecko...');
        // Используем CoinGecko API через централизованный helper с кэшем/лимитом
        const cgData = await fetchCoinGeckoGlobal(5 * 60 * 1000); // TTL 5 минут
        if (!cgData) throw new Error('Failed to fetch');
        const globalData = cgData.data;
        const marketData = globalData.market_cap_percentage;
        // ТОЛЬКО реальные данные из API, без расчетов
        const btcDominance = marketData.btc;
        const ethDominance = marketData.eth;
        if (!btcDominance || !ethDominance) {
            throw new Error('Invalid data received from API');
        }
        const othersDominance = 100 - btcDominance - ethDominance;
        dashboardState.btcDominance = {
            btc: btcDominance,
            eth: ethDominance,
            others: othersDominance,
            totalMarketCap: globalData.total_market_cap?.usd || 0,
            totalVolume24h: globalData.total_volume?.usd || 0,
            marketCapChange24h: globalData.market_cap_change_percentage_24h_usd || 0,
            activeCryptocurrencies: globalData.active_cryptocurrencies || 0,
            markets: globalData.markets || 0,
            updatedAt: globalData.updated_at || Date.now()
        };
        console.log('BTC Dominance loaded from CoinGecko:', dashboardState.btcDominance);
        updateBTCDominanceUI();
    } catch (error) {
        console.error('Failed to load Bitcoin Dominance from CoinGecko:', error);
        dashboardState.btcDominance = null;
        updateBTCDominanceUI();
    }
}

function updateBTCDominanceUI() {
    const container = document.getElementById('btcDominanceWidget');
    if (!container) return;
    
    // Если нет данных - показываем ошибку
    if (!dashboardState.btcDominance) {
        container.innerHTML = `
            <div class="dominance-content">
                <div class="dominance-header">
                    <h3>Bitcoin Dominance</h3>
                </div>
                <div class="error-message" style="padding: 2rem; text-align: center; color: rgba(255,255,255,0.5);">
                    <i class="bi bi-exclamation-triangle" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
                    <p>Не удалось загрузить данные</p>
                    <p style="font-size: 0.875rem; margin-top: 0.5rem;">Проверьте подключение к интернету</p>
                </div>
            </div>
        `;
        return;
    }
    
    const { btc, eth, others, totalMarketCap, totalVolume24h, marketCapChange24h, activeCryptocurrencies, markets } = dashboardState.btcDominance;
    
    const symbol = currency.getCurrencySymbol();
    const formatBillion = (num) => {
        const converted = currency.convertToSelectedCurrency(num);
        return `${(converted / 1e9).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} млрд`;
    };
    const formatNumber = (num) => {
        return num.toLocaleString('ru-RU');
    };
    container.innerHTML = `
        <div class="dominance-content">
            <!-- Header -->
            <div class="dominance-header">
                <h3>Market Overview</h3>
            </div>
            <!-- Main Stats -->
            <div class="dominance-main-stats">
                <div class="stat-item">
                    <div class="stat-icon" style="color: #F7931A;">
                        <i class="bi bi-currency-bitcoin"></i>
                    </div>
                    <div class="stat-info">
                        <span class="stat-label">Bitcoin</span>
                        <span class="stat-value">${btc.toFixed(1)}%</span>
                    </div>
                </div>
                <div class="stat-item">
                    <div class="stat-icon" style="color: #627EEA;">
                        <i class="bi bi-gem"></i>
                    </div>
                    <div class="stat-info">
                        <span class="stat-label">Ethereum</span>
                        <span class="stat-value">${eth.toFixed(1)}%</span>
                    </div>
                </div>
                <div class="stat-item">
                    <div class="stat-icon" style="color: #94A3B8;">
                        <i class="bi bi-grid-3x3"></i>
                    </div>
                    <div class="stat-info">
                        <span class="stat-label">Others</span>
                        <span class="stat-value">${others.toFixed(1)}%</span>
                    </div>
                </div>
            </div>
            <!-- Progress Bar -->
            <div class="dominance-bar">
                <div class="dominance-segment btc" style="width: ${btc}%"></div>
                <div class="dominance-segment eth" style="width: ${eth}%"></div>
                <div class="dominance-segment others" style="width: ${others}%"></div>
            </div>
            <!-- Market Stats -->
            <div class="dominance-section">
                <h4>Global Market Stats</h4>
                <div class="market-stats-grid">
                    <div class="market-stat-item">
                        <span class="market-stat-label">
                            <i class="bi bi-cash-stack"></i>
                            Total Market Cap
                        </span>
                        <span class="market-stat-value">${formatBillion(totalMarketCap)} ${symbol}</span>
                        <span class="market-stat-change ${marketCapChange24h >= 0 ? 'positive' : 'negative'}">
                            <i class="bi bi-caret-${marketCapChange24h >= 0 ? 'up' : 'down'}-fill"></i>
                            ${marketCapChange24h >= 0 ? '+' : ''}${marketCapChange24h.toFixed(2)}%
                        </span>
                    </div>
                    <div class="market-stat-item">
                        <span class="market-stat-label">
                            <i class="bi bi-graph-up"></i>
                            24h Volume
                        </span>
                        <span class="market-stat-value">${formatBillion(totalVolume24h)} ${symbol}</span>
                    </div>
                    <div class="market-stat-item">
                        <span class="market-stat-label">
                            <i class="bi bi-coin"></i>
                            Active Cryptocurrencies
                        </span>
                        <span class="market-stat-value">${formatNumber(activeCryptocurrencies)}</span>
                    </div>
                    <div class="market-stat-item">
                        <span class="market-stat-label">
                            <i class="bi bi-shop"></i>
                            Markets
                        </span>
                        <span class="market-stat-value">${formatNumber(markets)}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ============================================================================
// ПОСЛЕДНИЕ НОВОСТИ
// ============================================================================

// Функция для форматирования относительного времени
function getRelativeTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    
    if (diffMin < 1) return 'только что';
    if (diffMin < 60) return `${diffMin}м`;
    if (diffHour < 24) return `${diffHour}ч`;
    if (diffDay < 7) return `${diffDay}д`;
    return date.toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' });
}

async function loadUpcomingEvents() {
    try {
        // Загружаем новости напрямую из Finnhub API
        const API_KEY = 'd49lflpr01qlaebhu1egd49lflpr01qlaebhu1f0';
        
        console.log('Загружаем последние новости из Finnhub API...');
        
        try {
            const response = await fetch(
                `https://finnhub.io/api/v1/news?category=general&token=${API_KEY}`,
                { signal: AbortSignal.timeout(8000) }
            );
            
            if (response.ok) {
                const newsData = await response.json();
                
                if (Array.isArray(newsData) && newsData.length > 0) {
                    // Сортируем по дате (новые первыми) и берем только первые 5
                    const sortedNews = newsData.sort((a, b) => b.datetime - a.datetime);
                    const latestNews = sortedNews.slice(0, 5).map(news => ({
                        id: news.id,
                        title: news.headline || news.title,
                        date: new Date(news.datetime * 1000),
                        source: news.source,
                        url: news.url,
                        image: news.image || '',
                        category: news.category || 'general'
                    }));
                    
                    dashboardState.events = latestNews;
                    updateEventsCalendarUI();
                    console.log('Загружено новостей из Finnhub API:', latestNews.length);
                    return;
                }
            }
        } catch (apiError) {
            console.warn('Ошибка загрузки из Finnhub API:', apiError.message);
        }
        
        // Если не удалось загрузить из API, пробуем использовать window.currentNewsData
        if (window.currentNewsData && Array.isArray(window.currentNewsData) && window.currentNewsData.length > 0) {
            console.log('Используем новости из глобального кэша:', window.currentNewsData.length);
            
            const sortedNews = [...window.currentNewsData].sort((a, b) => {
                const dateA = new Date(a.datetime || a.date);
                const dateB = new Date(b.datetime || b.date);
                return dateB - dateA;
            });
            
            const latestNews = sortedNews.slice(0, 5).map(news => ({
                id: news.id,
                title: news.headline || news.title,
                date: news.datetime ? new Date(news.datetime * 1000) : (news.date || new Date()),
                source: news.source,
                url: news.url || news.link,
                image: news.image,
                category: news.category || 'general'
            }));
            
            dashboardState.events = latestNews;
            updateEventsCalendarUI();
            console.log('Отображены новости из кэша:', latestNews.length);
            return;
        }
        
        // Если новостей нет, пробуем загрузить еще раз через 3 секунды
        console.log('Новости еще не загружены, повторная попытка через 3 сек...');
        dashboardState.events = [];
        updateEventsCalendarUI(); // Показываем заглушку
        
        setTimeout(async () => {
            // Повторная попытка загрузки
            if (window.currentNewsData && Array.isArray(window.currentNewsData) && window.currentNewsData.length > 0) {
                console.log('Повторная попытка: используем кэш');
                const sortedNews = [...window.currentNewsData].sort((a, b) => {
                    const dateA = new Date(a.datetime || a.date);
                    const dateB = new Date(b.datetime || b.date);
                    return dateB - dateA;
                });
                
                const latestNews = sortedNews.slice(0, 5).map(news => ({
                    id: news.id,
                    title: news.headline || news.title,
                    date: news.datetime ? new Date(news.datetime * 1000) : (news.date || new Date()),
                    source: news.source,
                    url: news.url || news.link,
                    image: news.image,
                    category: news.category || 'general'
                }));
                
                dashboardState.events = latestNews;
                updateEventsCalendarUI();
                console.log('Новости загружены при повторной попытке:', latestNews.length);
            } else {
                // Финальная попытка через Finnhub
                try {
                    const response = await fetch(
                        `https://finnhub.io/api/v1/news?category=general&token=${API_KEY}`,
                        { signal: AbortSignal.timeout(8000) }
                    );
                    
                    if (response.ok) {
                        const newsData = await response.json();
                        if (Array.isArray(newsData) && newsData.length > 0) {
                            const sortedNews = newsData.sort((a, b) => b.datetime - a.datetime);
                            const latestNews = sortedNews.slice(0, 5).map(news => ({
                                id: news.id,
                                title: news.headline || news.title,
                                date: new Date(news.datetime * 1000),
                                source: news.source,
                                url: news.url,
                                image: news.image || '',
                                category: news.category || 'general'
                            }));
                            
                            dashboardState.events = latestNews;
                            updateEventsCalendarUI();
                            console.log('Новости загружены при повторной попытке из API:', latestNews.length);
                        }
                    }
                } catch (retryError) {
                    console.error('Не удалось загрузить новости при повторной попытке:', retryError);
                }
            }
        }, 3000);
        
    } catch (error) {
        console.error('Error loading latest news:', error);
        dashboardState.events = [];
        updateEventsCalendarUI();
    }
}

function updateEventsCalendarUI() {
    const container = document.getElementById('eventsCalendarWidget');
    if (!container) return;
    
    if (!dashboardState.events || dashboardState.events.length === 0) {
        container.innerHTML = `
            <div class="events-content">
                <h4>Последние новости</h4>
                <div class="news-empty">
                    <i class="fas fa-newspaper"></i>
                    <p>Загрузка новостей...</p>
                </div>
            </div>
        `;
        return;
    }
    
    const newsHTML = dashboardState.events.map(news => {
        const relativeTime = getRelativeTime(news.date);
        // Используем картинку из новости или placeholder
        const imageUrl = news.image || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="60" height="60"%3E%3Crect fill="%23334155" width="60" height="60"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%2394a3b8" font-size="12" font-family="Arial"%3ENews%3C/text%3E%3C/svg%3E';
        
        return `
            <div class="news-item-widget" onclick="goToNewsSection(event)">
                <div class="news-item-image">
                    <img src="${imageUrl}" alt="${news.title}">
                </div>
                <div class="news-item-content">
                    <div class="news-item-header">
                        <span class="news-source">${news.source}</span>
                        <span class="news-time">${relativeTime}</span>
                    </div>
                    <div class="news-title">${news.title}</div>
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = `
        <div class="events-content">
            <h4>Последние новости</h4>
            <div class="news-list">
                ${newsHTML}
            </div>
        </div>
    `;
}

// ============================================================================
// ПАНЕЛЬ БЫСТРЫХ ДЕЙСТВИЙ
// ============================================================================

async function loadQuickActions() {
    const container = document.getElementById('quickActionsWidget');
    if (!container) return;
    
    container.innerHTML = `
        <div class="quick-actions-content">
            <div class="quick-actions-grid">
                <button class="quick-action-btn primary" onclick="window.quickBuy()">
                    <i class="bi bi-lightning-charge-fill"></i>
                    <span>Быстрая покупка</span>
                </button>
                <button class="quick-action-btn success" onclick="window.viewTransactions()">
                    <i class="bi bi-arrow-left-right"></i>
                    <span>Транзакции</span>
                </button>
                <button class="quick-action-btn warning" onclick="window.viewFavorites()">
                    <i class="bi bi-star-fill"></i>
                    <span>Избранное</span>
                </button>
                <button class="quick-action-btn info" onclick="window.viewNews()">
                    <i class="bi bi-newspaper"></i>
                    <span>Новости</span>
                </button>
            </div>
        </div>
    `;
}

// ============================================================================
// СИСТЕМА СОХРАНЕНИЯ И ПЕРЕМЕЩЕНИЯ ВИДЖЕТОВ
// ============================================================================

let widgetLayoutCache = null;
const WIDGET_ORDER_KEY = 'dashboard_widget_order';

// Сохранение порядка виджетов в Supabase
async function saveWidgetLayout() {
    try {
        console.log('Saving widget layout...');
        
        const supabase = await getSupabase();
        if (!supabase) {
            console.warn('Supabase client not initialized');
            return;
        }
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            console.warn('No user authenticated');
            return;
        }
        
        const container = document.querySelector('.dashboard-widgets-container');
        if (!container) {
            console.warn('Widget container not found');
            return;
        }
        
        const widgets = Array.from(container.children);
        console.log('Found', widgets.length, 'widgets');
        
        const order = widgets.map((w, index) => ({
            id: w.id,
            order: index
        }));
        
        console.log('Saving order:', order);
        
        const { error } = await supabase
            .from('user_preferences')
            .upsert({
                user_id: user.id,
                preference_key: WIDGET_ORDER_KEY,
                preference_value: order
            }, {
                onConflict: 'user_id,preference_key'
            });
            
        if (error) {
            if (error.message?.includes('406') || error.code === 'PGRST301') {
                console.error('Table user_preferences not found. Please run:\n' +
                    '1. Open Supabase Dashboard\n' +
                    '2. Go to SQL Editor\n' +
                    '3. Run the SQL from user_preferences_table.sql file');
            } else {
                console.error('Error saving widget layout:', error);
            }
        } else {
            console.log('Widget layout saved successfully!');
            widgetLayoutCache = order;
        }
    } catch (err) {
        console.error('Failed to save widget layout:', err);
    }
}

// Загрузка порядка виджетов из Supabase
async function loadWidgetLayout() {
    try {
        console.log('Loading widget layout...');
        
        const supabase = await getSupabase();
        if (!supabase) {
            console.warn('Supabase client not initialized');
            return;
        }
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            console.warn('No user authenticated');
            return;
        }
        
        console.log('👤 User ID:', user.id);
        
        const { data, error } = await supabase
            .from('user_preferences')
            .select('preference_value')
            .eq('user_id', user.id)
            .eq('preference_key', WIDGET_ORDER_KEY)
            .single();
            
        if (error) {
            if (error.code === 'PGRST116') {
                console.log('No saved widget layout found (first time)');
            } else if (error.code === 'PGRST301' || error.message?.includes('406')) {
                console.warn('Table user_preferences might not exist. Please run user_preferences_table.sql in Supabase');
            } else {
                console.error('Error loading widget layout:', error);
            }
            return;
        }
        
        if (data?.preference_value) {
            console.log('Widget layout loaded:', data.preference_value);
            widgetLayoutCache = data.preference_value;
            applyWidgetOrder(data.preference_value);
        } else {
            console.log('No preference_value in data');
        }
    } catch (err) {
        console.error('Failed to load widget layout:', err);
    }
}

// Применение сохранённого порядка
function applyWidgetOrder(order) {
    console.log('📋 Applying widget order:', order);
    
    const container = document.querySelector('.dashboard-widgets-container');
    if (!container) {
        console.warn('Container not found for applying order');
        return;
    }
    
    const widgets = Array.from(container.children);
    console.log('Current widgets in DOM:', widgets.map(w => w.id));
    
    // Сортируем виджеты по сохранённому порядку
    const sortedWidgets = order
        .map(item => {
            const widget = widgets.find(w => w.id === item.id);
            if (!widget) {
                console.warn(`Widget ${item.id} from saved order not found in DOM`);
            }
            return widget;
        })
        .filter(w => w !== undefined);
    
    // Добавляем виджеты, которых нет в сохранённом порядке
    widgets.forEach(w => {
        if (!sortedWidgets.includes(w)) {
            console.log(`➕ Adding widget ${w.id} not in saved order`);
            sortedWidgets.push(w);
        }
    });
    
    console.log('Final order:', sortedWidgets.map(w => w.id));
    
    // Переставляем в DOM
    sortedWidgets.forEach(widget => container.appendChild(widget));
    
    console.log('Widgets reordered successfully');
}

// Инициализация drag & drop для виджетов
async function initWidgetsDragResize() {
    const container = document.querySelector('.dashboard-widgets-container');
    if (!container) {
        console.warn('Dashboard widgets container not found');
        return;
    }
    
    console.log('Initializing widget drag & drop...');
    
    // Загружаем сохранённый порядок
    await loadWidgetLayout();
    
    const widgets = container.querySelectorAll('.dashboard-widget');
    
    widgets.forEach(widget => {
        const header = widget.querySelector('.widget-header');
        if (!header) return;
        
        // Добавляем индикатор перетаскивания
        header.style.cursor = 'grab';
        
        widget.setAttribute('draggable', 'true');
        
        widget.addEventListener('dragstart', handleDragStart);
        widget.addEventListener('dragover', handleDragOver);
        widget.addEventListener('drop', handleDrop);
        widget.addEventListener('dragend', handleDragEnd);
    });
}

let draggedWidget = null;

function handleDragStart(e) {
    draggedWidget = this;
    this.style.opacity = '0.5';
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
    
    const header = this.querySelector('.widget-header');
    if (header) header.style.cursor = 'grabbing';
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    
    const rect = this.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    
    if (e.clientY < midpoint) {
        this.style.borderTop = '3px solid #3b82f6';
        this.style.borderBottom = 'none';
    } else {
        this.style.borderBottom = '3px solid #3b82f6';
        this.style.borderTop = 'none';
    }
    
    return false;
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    
    if (draggedWidget !== this) {
        const rect = this.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        
        if (e.clientY < midpoint) {
            this.parentNode.insertBefore(draggedWidget, this);
        } else {
            this.parentNode.insertBefore(draggedWidget, this.nextSibling);
        }
        
        // Сохраняем новый порядок
        saveWidgetLayout();
    }
    
    this.style.borderTop = 'none';
    this.style.borderBottom = 'none';
    
    return false;
}

function handleDragEnd(e) {
    this.style.opacity = '1';
    
    const header = this.querySelector('.widget-header');
    if (header) header.style.cursor = 'grab';
    
    // Убираем все границы
    document.querySelectorAll('.dashboard-widget').forEach(widget => {
        widget.style.borderTop = 'none';
        widget.style.borderBottom = 'none';
    });
}

// ============================================================================
// АВТООБНОВЛЕНИЕ
// ============================================================================

function startAutoRefresh() {
    // Обновляем каждые 30 секунд
    setInterval(() => {
        if (document.getElementById('dashboardSection').classList.contains('active')) {
            loadDashboardData();
        }
    }, 30000);
}

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

function showNotification(message, type = 'info') {
    // Используем систему уведомлений из основного скрипта
    if (window.showNotification) {
        window.showNotification(message, type);
    } else {
        console.log(`[${type}] ${message}`);
    }
}

// Глобальные функции для быстрых действий
window.quickBuy = function() {
    if (window.app && window.app.showTransactionModal) {
        window.app.showTransactionModal('BUY');
    }
};

window.viewTransactions = function() {
    document.querySelector('a[href="#transactions"]')?.click();
};

window.viewFavorites = function() {
    document.querySelector('a[href="#favorites"]')?.click();
};

window.viewNews = function() {
    document.querySelector('a[href="#news"]')?.click();
};

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ ГРАФИКОВ ДАШБОРДА
// ============================================================================

// Глобальное хранилище графиков для их уничтожения
let dashboardCharts = {
    miniChart: null,
    allocationChart: null,
    historyChart: null
};

// Хранилище для ResizeObserver, чтобы их можно было отключить
let dashboardResizeObservers = {
    miniChart: null,
    historyChart: null
};

async function initDashboardCharts() {
    console.log('Initializing mini dashboard charts...');
    
    // Отключаем ResizeObservers перед уничтожением графиков
    Object.keys(dashboardResizeObservers).forEach(key => {
        if (dashboardResizeObservers[key]) {
            console.log(`🔌 Disconnecting ResizeObserver: ${key}`);
            dashboardResizeObservers[key].disconnect();
            dashboardResizeObservers[key] = null;
        }
    });
    
    // Уничтожаем существующие графики перед созданием новых
    Object.keys(dashboardCharts).forEach(key => {
        if (dashboardCharts[key]) {
            console.log(`Destroying existing chart: ${key}`);
            try {
                if (typeof dashboardCharts[key].remove === 'function') {
                    dashboardCharts[key].remove();
                } else if (typeof dashboardCharts[key].destroy === 'function') {
                    dashboardCharts[key].destroy();
                }
            } catch (error) {
                console.warn(`Error destroying chart ${key}:`, error);
            }
            dashboardCharts[key] = null;
        }
    });
    
    const transactions = getTransactionsSync();
    console.log('Transactions for charts:', transactions?.length);
    
    // Получаем текущую доходность портфеля из DOM
    const totalReturnElement = document.getElementById('totalReturn');
    const returnText = totalReturnElement?.textContent || '+0%';
    const portfolioReturn = parseFloat(returnText.replace(/[+%]/g, '')) || 0;
    const isPositive = portfolioReturn >= 0;
    
    console.log('Portfolio return for chart color:', portfolioReturn);
    
    // График тренда (miniChart) - история портфеля пользователя - Lightweight Charts
    const miniChartContainer = document.getElementById('miniChart');
    if (miniChartContainer) {
        console.log('Initializing miniChart with Lightweight Charts...');
        
        if (transactions && transactions.length > 0) {
            // Очищаем старый график (если это canvas)
            miniChartContainer.innerHTML = '';
            
            // Получаем все уникальные символы
            const allSymbols = [...new Set(transactions.map(tx => tx.symbol))];
            
            // Получаем актуальные цены
            fetchCurrentPrices(allSymbols).then(currentPrices => {
                // Группируем транзакции по датам
                const sortedTx = [...transactions].sort((a, b) => 
                    new Date(a.created_at) - new Date(b.created_at)
                );
                
                const holdings = {};
                const historyData = [];
                
                sortedTx.forEach(tx => {
                    const symbol = tx.symbol;
                    holdings[symbol] = holdings[symbol] || 0;
                    
                    if (tx.type === 'BUY') {
                        holdings[symbol] += tx.quantity;
                    } else if (tx.type === 'SELL') {
                        holdings[symbol] -= tx.quantity;
                    }
                    
                    let portfolioValue = 0;
                    for (const [sym, qty] of Object.entries(holdings)) {
                        if (qty > 0 && currentPrices[sym]) {
                            portfolioValue += qty * currentPrices[sym];
                        }
                    }
                    
                    historyData.push({
                        time: Math.floor(new Date(tx.created_at).getTime() / 1000),
                        value: portfolioValue
                    });
                });
                
                // Берем последние 20 точек
                const recentHistory = historyData.slice(-20);
                
                // Цвет в зависимости от доходности портфеля
                const lineColor = isPositive ? '#06b6d4' : '#ef4444';
                const topColor = isPositive ? 'rgba(6, 182, 212, 0.4)' : 'rgba(239, 68, 68, 0.4)';
                const bottomColor = isPositive ? 'rgba(6, 182, 212, 0.05)' : 'rgba(239, 68, 68, 0.05)';
                
                // Создаем Lightweight Chart
                const chart = LightweightCharts.createChart(miniChartContainer, {
                    width: miniChartContainer.clientWidth,
                    height: 80,
                    layout: {
                        background: { color: 'transparent' },
                        textColor: '#e2e8f0',
                    },
                    grid: {
                        vertLines: { visible: false },
                        horzLines: { visible: false },
                    },
                    crosshair: {
                        vertLine: { visible: false },
                        horzLine: { visible: false },
                    },
                    rightPriceScale: {
                        visible: false,
                    },
                    timeScale: {
                        visible: false,
                    },
                    handleScroll: false,
                    handleScale: false,
                });
                
                const areaSeries = chart.addAreaSeries({
                    topColor: topColor,
                    bottomColor: bottomColor,
                    lineColor: lineColor,
                    lineWidth: 2,
                    priceLineVisible: false,
                });
                
                areaSeries.setData(recentHistory);
                chart.timeScale().fitContent();
                
                dashboardCharts.miniChart = chart;
                
                const resizeObserver = new ResizeObserver(entries => {
                    if (entries.length === 0 || entries[0].target !== miniChartContainer) {
                        return;
                    }
                    // Проверяем, что график еще существует и не уничтожен
                    if (!dashboardCharts.miniChart) {
                        return;
                    }
                    try {
                        const newRect = entries[0].contentRect;
                        dashboardCharts.miniChart.applyOptions({ width: newRect.width });
                    } catch (error) {
                        console.warn('ResizeObserver error for miniChart:', error);
                    }
                });
                
                resizeObserver.observe(miniChartContainer);
                dashboardResizeObservers.miniChart = resizeObserver;
                
            }).catch(error => {
                console.error('Error loading prices for mini chart:', error);
            });
        } else {
            miniChartContainer.innerHTML = '<p style="text-align: center; color: #94a3b8; font-size: 0.75rem;">Нет данных</p>';
        }
    }
    
    // График распределения активов (allocationChart)
    const ctxPie = document.getElementById('allocationChart');
    if (ctxPie) {
        // Уничтожаем старый график Chart.js если он существует
        if (dashboardCharts.allocationChart) {
            dashboardCharts.allocationChart.destroy();
            dashboardCharts.allocationChart = null;
        }
        
        if (transactions && transactions.length > 0) {
            // Группируем по символам активов и считаем текущее количество
            const holdings = {};
            transactions.forEach(tx => {
                const symbol = tx.symbol || tx.asset_symbol || 'UNKNOWN';
                if (!holdings[symbol]) {
                    holdings[symbol] = { quantity: 0, totalValue: 0 };
                }
                
                if (tx.type === 'BUY') {
                    holdings[symbol].quantity += tx.quantity;
                    holdings[symbol].totalValue += tx.quantity * tx.price;
                } else if (tx.type === 'SELL') {
                    holdings[symbol].quantity -= tx.quantity;
                    holdings[symbol].totalValue -= tx.quantity * tx.price;
                }
            });
            
            // Фильтруем только активы с положительным количеством
            const activeHoldings = Object.entries(holdings)
                .filter(([_, data]) => data.quantity > 0)
                .sort((a, b) => b[1].totalValue - a[1].totalValue);
            
            const labels = activeHoldings.map(([symbol, _]) => symbol);
            const data = activeHoldings.map(([_, data]) => data.totalValue);
            
            // Цвета для графика - сине-зеленая палитра
            const colors = [
                '#3b82f6', '#06b6d4', '#14b8a6', '#10b981', '#22c55e',
                '#0ea5e9', '#0891b2', '#059669', '#2dd4bf', '#34d399'
            ];
            
            // Создаем градиенты для каждого сегмента
            const backgroundColors = colors.slice(0, labels.length).map((color, index) => {
                const gradient = ctxPie.getContext('2d').createLinearGradient(0, 0, 0, 400);
                const rgb = color.match(/\w\w/g).map(x => parseInt(x, 16));
                gradient.addColorStop(0, color);
                gradient.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.7)`);
                return gradient;
            });
            
            dashboardCharts.allocationChart = new Chart(ctxPie, {
                type: 'doughnut',
                data: {
                    labels: labels.length > 0 ? labels : ['Нет данных'],
                    datasets: [{ 
                        data: data.length > 0 ? data : [1], 
                        backgroundColor: backgroundColors,
                        borderWidth: 4, 
                        borderColor: '#0f172a',
                        hoverBorderWidth: 5,
                        hoverBorderColor: '#ffffff',
                        hoverOffset: 15
                    }]
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: true,
                    cutout: '65%',
                    animation: {
                        animateRotate: true,
                        animateScale: true,
                        duration: 2000,
                        easing: 'easeInOutQuart'
                    },
                    plugins: { 
                        legend: { 
                            position: 'bottom',
                            labels: { 
                                color: '#ffffff',
                                font: {
                                    size: 13,
                                    weight: '600'
                                },
                                padding: 15,
                                usePointStyle: true,
                                pointStyle: 'circle'
                            } 
                        },
                        tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.95)',
                            titleColor: '#ffffff',
                            bodyColor: '#ffffff',
                            padding: 12,
                            cornerRadius: 8,
                            displayColors: true,
                            callbacks: {
                                label: function(context) {
                                    const label = context.label || '';
                                    const value = context.parsed || 0;
                                    return `${label}: $${value.toFixed(2)}`;
                                }
                            }
                        }
                    } 
                }
            });
            console.log('Allocation chart initialized with', labels.length, 'assets');
        }
    }
    
    // График истории портфеля (historyChart) - Lightweight Charts
    const historyChartContainer = document.getElementById('historyChart');
    if (historyChartContainer && transactions && transactions.length > 0) {
        // Очищаем старый график
        historyChartContainer.innerHTML = '';
        
        // Получаем все уникальные символы
        const allSymbols = [...new Set(transactions.map(tx => tx.symbol || tx.asset_symbol))];
        
        // Получаем текущие цены
        fetchCurrentPrices(allSymbols).then(currentPrices => {
            // Сортируем транзакции по дате
            const sortedTx = [...transactions].sort((a, b) => 
                new Date(a.created_at) - new Date(b.created_at)
            );
            
            // Рассчитываем стоимость портфеля в каждый момент времени
            const holdings = {};
            const historyData = [];
            
            sortedTx.forEach(tx => {
                const symbol = tx.symbol || tx.asset_symbol || 'UNKNOWN';
                
                if (!holdings[symbol]) holdings[symbol] = 0;
                
                if (tx.type === 'BUY') {
                    holdings[symbol] += tx.quantity;
                } else if (tx.type === 'SELL') {
                    holdings[symbol] -= tx.quantity;
                }
                
                // Считаем общую стоимость с текущими ценами
                const portfolioValue = Object.entries(holdings).reduce((sum, [sym, qty]) => {
                    return sum + (qty > 0 && currentPrices[sym] ? qty * currentPrices[sym] : 0);
                }, 0);
                
                historyData.push({
                    time: Math.floor(new Date(tx.created_at).getTime() / 1000),
                    value: portfolioValue
                });
            });
            
            // Добавляем текущую точку если последняя транзакция была давно
            if (historyData.length > 0) {
                const lastTime = historyData[historyData.length - 1].time;
                const nowTime = Math.floor(Date.now() / 1000);
                
                if (nowTime - lastTime > 3600) { // Больше часа
                    historyData.push({
                        time: nowTime,
                        value: historyData[historyData.length - 1].value
                    });
                }
            }
            
            if (historyData.length === 0) {
                console.warn('No history data');
                return;
            }
            
            // Создаем график без границ - единый блок
            const chart = LightweightCharts.createChart(historyChartContainer, {
                width: historyChartContainer.clientWidth,
                height: historyChartContainer.clientHeight || 400,
                layout: {
                    background: { color: 'transparent' },
                    textColor: '#ffffff',
                    fontSize: 13,
                },
                grid: {
                    vertLines: { visible: false },
                    horzLines: { 
                        color: 'rgba(255, 255, 255, 0.05)',
                        style: LightweightCharts.LineStyle.Solid,
                    },
                },
                crosshair: {
                    mode: LightweightCharts.CrosshairMode.Normal,
                    vertLine: {
                        color: '#06b6d4',
                        width: 1,
                        style: LightweightCharts.LineStyle.Dashed,
                    },
                    horzLine: {
                        color: '#06b6d4',
                        width: 1,
                        style: LightweightCharts.LineStyle.Dashed,
                    },
                },
                rightPriceScale: {
                    visible: true,
                    borderVisible: false,
                    textColor: '#ffffff',
                    scaleMargins: {
                        top: 0.1,
                        bottom: 0.1,
                    },
                },
                timeScale: {
                    visible: true,
                    borderVisible: false,
                    textColor: '#ffffff',
                    timeVisible: true,
                    secondsVisible: false,
                },
            });
            
            // Добавляем красивую area series
            const areaSeries = chart.addAreaSeries({
                topColor: 'rgba(6, 182, 212, 0.4)',
                bottomColor: 'rgba(6, 182, 212, 0.0)',
                lineColor: '#06b6d4',
                lineWidth: 2,
                priceLineVisible: false,
                crosshairMarkerVisible: true,
                crosshairMarkerRadius: 5,
                crosshairMarkerBorderColor: '#ffffff',
                crosshairMarkerBackgroundColor: '#06b6d4',
                lastValueVisible: true,
            });
            
            areaSeries.setData(historyData);
            chart.timeScale().fitContent();
            
            // Сохраняем для уничтожения позже
            dashboardCharts.historyChart = chart;
            
            // Адаптивность
            const resizeObserver = new ResizeObserver(() => {
                // Проверяем, что график еще существует и не уничтожен
                if (!dashboardCharts.historyChart || !historyChartContainer.clientWidth) {
                    return;
                }
                try {
                    dashboardCharts.historyChart.applyOptions({ 
                        width: historyChartContainer.clientWidth,
                        height: historyChartContainer.clientHeight || 400
                    });
                } catch (error) {
                    console.warn('ResizeObserver error for historyChart:', error);
                }
            });
            
            resizeObserver.observe(historyChartContainer);
            dashboardResizeObservers.historyChart = resizeObserver;
            
            console.log('History chart initialized with', historyData.length, 'data points');
        }).catch(err => {
            console.error('Error fetching prices for history chart:', err);
        });
    }
    
    console.log('All dashboard charts initialized');
}

// ============================================================================
// НАВИГАЦИЯ К РАЗДЕЛУ НОВОСТЕЙ
// ============================================================================

// Глобальная функция для перехода к разделу новостей при клике на виджет
window.goToNewsSection = function(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    console.log('Переход к разделу новостей...');
    
    // Используем функцию showSection из ui.js
    if (window.app && window.app.showSection) {
        window.app.showSection('news');
    } else {
        // Фоллбэк на прямое изменение hash
        window.location.hash = 'news';
    }
};
