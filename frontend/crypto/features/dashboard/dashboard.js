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

        return null;
    }
}

function _setCached(url, data) {
    try {
        const k = _cacheKey(url);
        localStorage.setItem(k, JSON.stringify({ ts: Date.now(), data }));
    } catch (e) {
        // localStorage переполнен
    }
}

async function _performFetchWithRetries(url, options, maxRetries = 3) {
    let attempt = 0;
    while (attempt <= maxRetries) {
        try {
            const resp = await fetch(url, options);
            if (resp.status === 429) {
                const backoff = 500 * Math.pow(2, attempt) + Math.floor(Math.random() * 300);

                await new Promise(r => setTimeout(r, backoff));
                attempt++;
                continue;
            }
            return resp;
        } catch (e) {
            const backoff = 400 * Math.pow(2, attempt) + Math.floor(Math.random() * 200);

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

                        item.resolve(null);
                    } else if (!contentType.includes('application/json')) {

                        item.resolve(null);
                    } else {
                        const json = await resp.json();
                        item.resolve(json);
                    }
                }
            } catch (e) {

                try { item.reject(e); } catch (_) {}
            }
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

    }

    return new Promise((resolve, reject) => {
        __fetchQueue.push({ url, options, resolve, reject, retries: 3 });
        _processFetchQueue();
    }).then(result => {
        try {
            if (result !== null && result !== undefined && ttl > 0) _setCached(url, result);
        } catch (e) {

        }
        return result;
    }).catch(e => {

        return null;
    });
}


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

    
    try {
        // Инициализируем drag & resize для виджетов
        await initWidgetsDragResize();
        
        // Загружаем все данные дашборда
        await loadDashboardData();
        
        // Инициализируем графики на главном дашборде
        await initDashboardCharts();
        
        // Запускаем автообновление
        startAutoRefresh();
        

    } catch (error) {

        showNotification('Ошибка загрузки дашборда', 'error');
    }
}



export async function loadDashboardData() {
    if (dashboardState.isLoading) {

        return;
    }
    
    dashboardState.isLoading = true;

    
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
            
            // Предзагрузка данных акций для избранного
            const stockSymbols = favs.filter(f => window.STOCK_INFO && window.STOCK_INFO[f.symbol]).map(f => f.symbol);
            if (stockSymbols.length > 0) {

                
                // Импортируем функцию загрузки данных акций
                try {
                    const { loadStockData } = await import('../favorites/favorites-controls.js');
                    
                    if (loadStockData && typeof loadStockData === 'function') {
                        const loadedStocks = await loadStockData(stockSymbols);
                        
                        // Сохраняем в window.stocksRealData
                        if (!window.stocksRealData) {
                            window.stocksRealData = {};
                        }
                        Object.assign(window.stocksRealData, loadedStocks);

                    }
                } catch (e) {

                    
                    // Fallback: загружаем напрямую через Finnhub
                    const FINNHUB_TOKEN = 'd49lflpr01qlaebhu1egd49lflpr01qlaebhu1f0';
                    if (!window.stocksRealData) window.stocksRealData = {};
                    
                    await Promise.all(stockSymbols.map(async symbol => {
                        try {
                            const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_TOKEN}`);
                            if (response.ok) {
                                const data = await response.json();
                                if (data && data.c) {
                                    window.stocksRealData[symbol] = {
                                        price: data.c.toFixed(2),
                                        change: (data.c - data.pc).toFixed(2),
                                        changePercent: (((data.c - data.pc) / data.pc) * 100).toFixed(2)
                                    };

                                }
                            }
                        } catch (e) {

                        }
                    }));
                }
            }
            
            renderFavorites(favs);
            // Re-render when cryptoList becomes available to populate prices immediately
            const onList = async (e) => {
                try {
                    const fresh = await getFavorites();
                    renderFavorites(fresh);
                } catch (err) {

                }
            };
            document.addEventListener('cryptoListLoaded', onList, { once: true });
            
            // Re-render when stocks data becomes available
            const onStocks = async (e) => {
                try {

                    const fresh = await getFavorites();
                    renderFavorites(fresh);
                } catch (err) {

                }
            };
            document.addEventListener('stocksDataLoaded', onStocks, { once: true });
        } catch (e) {

        }
        

    } catch (error) {

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

            } else {
                // Для крипты используем Binance prices с fallback
                price = (prices && (prices[f.symbol] || prices[`${f.symbol}USDT`])) ?? undefined;
                if (!(Number.isFinite(price) && price > 0)) {
                    const fallback = getPriceSync(f.symbol);
                    if (Number.isFinite(fallback) && fallback > 0) price = fallback;
                }
            }
            
            // Форматирование цены
            const _sym = currency.getCurrencySymbol();
            const formatPriceForDisplay = (p) => {
                if (!Number.isFinite(p) || p <= 0) return '—';
                const cp = currency.convertToSelectedCurrency(p);
                if (p >= 1) return `${_sym}${cp.toFixed(2)}`;
                if (p >= 0.01) return `${_sym}${cp.toFixed(4)}`;
                if (p >= 0.0001) return `${_sym}${cp.toFixed(6)}`;
                return `<${_sym}0.0001`;
            };
            const priceDisplay = formatPriceForDisplay(price);
            
            const info = isStock 
                ? (window.STOCK_INFO[f.symbol] || { name: f.symbol, color: '#3B82F6' })
                : ((window.CRYPTO_INFO && window.CRYPTO_INFO[f.symbol]) || { color: '#64748b' });
            

            
            const name = escapeHtml(isStock ? info.name : (info.name || ''));
            const symbolEsc = escapeHtml(f.symbol);
            
            // Разные иконки для акций и криптовалют
            let iconHTML;
            if (isStock) {
                const iconUrl = `https://img.logo.dev/${f.symbol.toLowerCase()}.com?token=pk_X-jjCWIKT_SRetd3NwvHUg&size=80`;
                const fallback1 = `https://assets.parqet.com/logos/symbol/${f.symbol}`;
                const fallback2 = `https://financialmodelingprep.com/image-stock/${f.symbol}.png`;
                iconHTML = `<img data-src="${iconUrl}" alt="${symbolEsc}" data-fallback1="${fallback1}" data-fallback2="${fallback2}" data-emoji="${f.symbol.charAt(0)}" style="width:100%;height:100%;object-fit:contain;border-radius:50%;"/>`;

            } else {
                const iconUrl = getCoinCapIcon(f.symbol);
                iconHTML = `<img data-src="${iconUrl}" alt="${symbolEsc}" data-fallback1="https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/32/icon/${f.symbol.toLowerCase()}.png" data-fallback2="https://ui-avatars.com/api/?name=${symbolEsc}&background=${info.color.replace('#','')}&color=fff&size=48&bold=true" data-emoji="${f.symbol.charAt(0)}" style="width:100%;height:100%;object-fit:contain;"/>`;
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

        if (window._iconLoader && typeof window._iconLoader.processContainer === 'function') {
            const imgElements = container.querySelectorAll('img[data-src]');

            window._iconLoader.processContainer(container);
        } else {

        }

        container.querySelectorAll('button[data-action="remove"]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                try {
                    await removeFavorite(id);
                    const updated = await getFavorites();
                    renderFavorites(updated);
                } catch (err) {

                    showNotification('Ошибка удаления избранного', 'error');
                }
            });
        });

        container.querySelectorAll('button[data-action="toggle"]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const card = btn.closest('.favorite-card');
                const symbol = card?.getAttribute('data-symbol');
                try {
                    btn.classList.add('animating', 'play-burst');
                    btn.classList.toggle('active');
                    setTimeout(() => { btn.classList.remove('animating'); btn.classList.remove('play-burst'); }, 600);

                    if (id) {
                        await removeFavorite(id);
                    } else if (symbol) {
                        await addFavorite(symbol);
                    }

                    const updated = await getFavorites();
                    renderFavorites(updated);
                } catch (err) {
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

        // fallback simple list (styled)
        container.innerHTML = `<div class="favorites-grid">${items.map(f => {
            const symbolEsc = escapeHtml(f.symbol);
            const info = (window.CRYPTO_INFO && window.CRYPTO_INFO[f.symbol]) || { color: '#64748b' };
            const iconUrl = getCoinCapIcon(f.symbol);
            return `
            <div class="favorite-card" data-id="${f.id}" style="border-left:4px solid ${info.color}; background: linear-gradient(135deg, ${info.color}08 0%, #ffffff 100%);">
                <div class="fav-top">
                    <div class="fav-icon" aria-hidden style="background: linear-gradient(135deg, ${info.color}, ${info.color}dd);"><img src="${iconUrl}" alt="${symbolEsc}" style="width:100%;height:100%;object-fit:contain;" onerror="if(!this.dataset.cf){this.dataset.cf='1';this.src='https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/32/icon/${symbolEsc.toLowerCase()}.png';}else{this.onerror=null;this.src='https://ui-avatars.com/api/?name=${symbolEsc}&background=${info.color.replace('#','')}&color=fff&size=48&bold=true';}"/></div>
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
                        const _s = currency.getCurrencySymbol();
                        const cp = currency.convertToSelectedCurrency(p);
                        const formatted = (p >= 1) ? `${_s}${cp.toFixed(2)}` : (p >= 0.01 ? `${_s}${cp.toFixed(4)}` : (p >= 0.0001 ? `${_s}${cp.toFixed(6)}` : `<${_s}0.0001`));
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
                                const _s = currency.getCurrencySymbol();
                                const cp = currency.convertToSelectedCurrency(num);
                                const formatted = (num >= 1) ? `${_s}${cp.toFixed(2)}` : (num >= 0.01 ? `${_s}${cp.toFixed(4)}` : (num >= 0.0001 ? `${_s}${cp.toFixed(6)}` : `<${_s}0.0001`));
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

        return prices;
    }
    
    // Проверяем кэш
    const now = Date.now();
    if (now - priceCache.timestamp < priceCache.CACHE_DURATION && Object.keys(priceCache.data).length > 0) {

        
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
        

        
        // Получаем цены криптовалют через Binance
        if (binanceSymbols.size > 0) {
            try {
                // Binance API возвращает все цены одним запросом
                const url = 'https://api.binance.com/api/v3/ticker/price';

                const data = await safeFetchJsonGlobal(url);
                if (data) {

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

                        }
                    });
                    // Обновляем кэш
                    priceCache.data = { ...priceCache.data, ...prices };
                    priceCache.timestamp = Date.now();
                } else {

                    // Fallback на кэш при любой ошибке
                    symbols.forEach(symbol => {
                        if (priceCache.data[symbol]) {
                            prices[symbol] = priceCache.data[symbol];

                        }
                    });
                }
            } catch (err) {

                // Fallback на закэшированные цены

                symbols.forEach(symbol => {
                    if (priceCache.data[symbol]) {
                        prices[symbol] = priceCache.data[symbol];

                    }
                });
            }
        }
        

        
    } catch (error) {

        
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

        
        const user = await checkAuth();
        if (!user) {

            return;
        }
        

        
        // Загружаем портфели и транзакции через data.js
        const portfolios = await getPortfolios();
        const transactions = await getTransactions();
        

        
        if (!transactions || transactions.length === 0) {

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
        

        
        // Обновляем UI
        updatePortfolioStatsUI(stats);
        
        // Отправляем уведомление об изменении портфеля
        console.log('🔔 Проверка интеграции уведомлений...', {
            hasIntegrations: !!window.notificationIntegrations,
            totalValue: stats.totalValue,
            functions: window.notificationIntegrations ? Object.keys(window.notificationIntegrations) : []
        });
        
        if (window.notificationIntegrations && stats.totalValue > 0) {

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

            }
        }
        

        
    } catch (error) {

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

        return stats;
    }
    

    
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

        }
    });
    

    
    // Подсчитываем активы и получаем актуальные цены
    let cryptoAssets = 0;
    let stockAssets = 0;
    
    // Получаем актуальные цены для всех активов
    const symbols = Object.keys(assets).filter(symbol => assets[symbol].quantity > 0);

    
    const prices = await fetchCurrentPrices(symbols);
    

    
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

            } else if (avgBuyPrice > 0) {
                // Если нет актуальной цены, используем среднюю цену покупки
                const assetValue = asset.quantity * avgBuyPrice;
                totalCurrentValue += assetValue;
                assetsWithoutPrices++;

            }
        }
    }
    
    stats.totalValue = totalCurrentValue;
    stats.cryptoCount = cryptoAssets;
    stats.stocksCount = stockAssets;
    

    
    // Рассчитываем реальную доходность
    if (stats.totalInvested > 0) {
        const returnAmount = stats.totalValue - stats.totalInvested;
        stats.totalReturn = parseFloat(((returnAmount / stats.totalInvested) * 100).toFixed(2));
        stats.totalChange = stats.totalReturn;

    } else {
        stats.totalReturn = 0;
        stats.totalChange = 0;

    }
    

    
    return stats;
}

function updatePortfolioStatsUI(stats) {

    
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
            initDashboardCharts(stats);
        }, 200);
    }, 100);
// Слушаем смену валюты и обновляем дашборд (всегда, currency уже импортирован)
window.addEventListener('currencyChanged', async () => {

    await loadDashboardData();
    if (window.app && window.app.refreshCurrentModal) {
        window.app.refreshCurrentModal();
    }
});
window.addEventListener('currencyRateUpdated', async () => {

    await loadDashboardData();
});
}

// Функция для рисования sparkline графика доходности
async function drawReturnSparkline(returnValue) {
    const canvas = document.getElementById('returnSparkline');
    if (!canvas) {

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
        

        
    } catch (error) {

        
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

                continue;
            }
            
            const data = await response.json();
            
            if (data.code === 401 || data.code === 429) {

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
                    <span class="indicator-label notranslate" translate="no">${indicator.name}</span>
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
                    <div class="fear-greed-classification notranslate" translate="no">
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

        updateBTCDominanceUI();
    } catch (error) {

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
                <h3>Обзор рынка</h3>
            </div>
            <!-- Main Stats -->
            <div class="dominance-main-stats">
                <div class="stat-item">
                    <div class="stat-icon" style="color: #F7931A;">
                        <i class="bi bi-currency-bitcoin"></i>
                    </div>
                    <div class="stat-info">
                        <span class="stat-label">Биткоин</span>
                        <span class="stat-value">${btc.toFixed(1)}%</span>
                    </div>
                </div>
                <div class="stat-item">
                    <div class="stat-icon" style="color: #627EEA;">
                        <i class="bi bi-gem"></i>
                    </div>
                    <div class="stat-info">
                        <span class="stat-label">Эфириум</span>
                        <span class="stat-value">${eth.toFixed(1)}%</span>
                    </div>
                </div>
                <div class="stat-item">
                    <div class="stat-icon" style="color: #94A3B8;">
                        <i class="bi bi-grid-3x3"></i>
                    </div>
                    <div class="stat-info">
                        <span class="stat-label">Другие</span>
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
                <h4>Статистика мирового рынка</h4>
                <div class="market-stats-grid">
                    <div class="market-stat-item">
                        <span class="market-stat-label">
                            <i class="bi bi-cash-stack"></i>
                            Общая рын. капитализация
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
                            24-часовой объём
                        </span>
                        <span class="market-stat-value">${formatBillion(totalVolume24h)} ${symbol}</span>
                    </div>
                    <div class="market-stat-item">
                        <span class="market-stat-label">
                            <i class="bi bi-coin"></i>
                            Криптовалют
                        </span>
                        <span class="market-stat-value">${formatNumber(activeCryptocurrencies)}</span>
                    </div>
                    <div class="market-stat-item">
                        <span class="market-stat-label">
                            <i class="bi bi-shop"></i>
                            Рынков
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
        

        
        try {
            const response = await fetch(
                `https://finnhub.io/api/v1/news?category=crypto&token=${API_KEY}`,
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

                    return;
                }
            }
        } catch (apiError) {

        }
        
        // Если не удалось загрузить из API, пробуем использовать window.currentNewsData
        if (window.currentNewsData && Array.isArray(window.currentNewsData) && window.currentNewsData.length > 0) {

            
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

            return;
        }
        
        // Если новостей нет, пробуем загрузить еще раз через 3 секунды

        dashboardState.events = [];
        updateEventsCalendarUI(); // Показываем заглушку
        
        setTimeout(async () => {
            // Повторная попытка загрузки
            if (window.currentNewsData && Array.isArray(window.currentNewsData) && window.currentNewsData.length > 0) {

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

            } else {
                // Финальная попытка через Finnhub
                try {
                    const response = await fetch(
                        `https://finnhub.io/api/v1/news?category=crypto&token=${API_KEY}`,
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

                        }
                    }
                } catch (retryError) {

                }
            }
        }, 3000);
        
    } catch (error) {

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

        
        const supabase = await getSupabase();
        if (!supabase) {

            return;
        }
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {

            return;
        }
        
        const container = document.querySelector('.dashboard-widgets-container');
        if (!container) {

            return;
        }
        
        const widgets = Array.from(container.children);

        
        const order = widgets.map((w, index) => ({
            id: w.id,
            order: index
        }));
        

        
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

            }
        } else {

            widgetLayoutCache = order;
        }
    } catch (err) {

    }
}

// Загрузка порядка виджетов из Supabase
async function loadWidgetLayout() {
    try {

        
        const supabase = await getSupabase();
        if (!supabase) {

            return;
        }
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {

            return;
        }
        

        
        const { data, error } = await supabase
            .from('user_preferences')
            .select('preference_value')
            .eq('user_id', user.id)
            .eq('preference_key', WIDGET_ORDER_KEY)
            .single();
            
        if (error) {
            if (error.code === 'PGRST116') {

            } else if (error.code === 'PGRST301' || error.message?.includes('406')) {

            } else {

            }
            return;
        }
        
        if (data?.preference_value) {

            widgetLayoutCache = data.preference_value;
            applyWidgetOrder(data.preference_value);
        } else {

        }
    } catch (err) {

    }
}

// Применение сохранённого порядка
function applyWidgetOrder(order) {

    
    const container = document.querySelector('.dashboard-widgets-container');
    if (!container) {

        return;
    }
    
    const widgets = Array.from(container.children);

    
    // Сортируем виджеты по сохранённому порядку
    const sortedWidgets = order
        .map(item => {
            const widget = widgets.find(w => w.id === item.id);
            if (!widget) {

            }
            return widget;
        })
        .filter(w => w !== undefined);
    
    // Добавляем виджеты, которых нет в сохранённом порядке
    widgets.forEach(w => {
        if (!sortedWidgets.includes(w)) {

            sortedWidgets.push(w);
        }
    });
    

    
    // Переставляем в DOM
    sortedWidgets.forEach(widget => container.appendChild(widget));
    

}

// Инициализация drag & drop для виджетов
async function initWidgetsDragResize() {
    const container = document.querySelector('.dashboard-widgets-container');
    if (!container) {

        return;
    }
    

    
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

async function initDashboardCharts(stats = null) {

    
    // Отключаем ResizeObservers перед уничтожением графиков
    Object.keys(dashboardResizeObservers).forEach(key => {
        if (dashboardResizeObservers[key]) {

            dashboardResizeObservers[key].disconnect();
            dashboardResizeObservers[key] = null;
        }
    });
    
    // Уничтожаем существующие графики перед созданием новых
    Object.keys(dashboardCharts).forEach(key => {
        if (dashboardCharts[key]) {

            try {
                if (typeof dashboardCharts[key].remove === 'function') {
                    dashboardCharts[key].remove();
                } else if (typeof dashboardCharts[key].destroy === 'function') {
                    dashboardCharts[key].destroy();
                }
            } catch (error) {

            }
            dashboardCharts[key] = null;
        }
    });
    
    const transactions = getTransactionsSync();

    
// Получаем точную доходность портфеля из stats (или запасной вариант — из DOM)
    const portfolioReturn = (stats?.totalReturn !== undefined && stats?.totalReturn !== null)
        ? stats.totalReturn
        : (parseFloat(document.getElementById('totalReturn')?.textContent?.replace(/[+%]/g, '') || '0') || 0);
    const isPositive = portfolioReturn >= 0;
    

    
    // График тренда (miniChart) - история портфеля пользователя - Lightweight Charts
    const miniChartContainer = document.getElementById('miniChart');
    if (miniChartContainer) {

        
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
                const lastPriceMap = {};
                const historyData = [];
                
                sortedTx.forEach(tx => {
                    const symbol = tx.symbol;
                    const txPrice = parseFloat(tx.price) || 0;
                    
                    holdings[symbol] = holdings[symbol] || 0;
                    
                    // Обновляем последнюю известную цену на момент этой сделки
                    if (txPrice > 0) {
                        lastPriceMap[symbol] = txPrice;
                    }
                    
                    if (tx.type === 'BUY') {
                        holdings[symbol] += parseFloat(tx.quantity) || 0;
                    } else if (tx.type === 'SELL') {
                        holdings[symbol] -= parseFloat(tx.quantity) || 0;
                    }
                    
                    // Стоимость портфеля по историческим ценам сделок
                    let portfolioValue = 0;
                    for (const [sym, qty] of Object.entries(holdings)) {
                        if (qty > 0 && lastPriceMap[sym]) {
                            portfolioValue += qty * lastPriceMap[sym];
                        }
                    }
                    
                    historyData.push({
                        time: Math.floor(new Date(tx.created_at).getTime() / 1000),
                        value: portfolioValue
                    });
                });
                
                // Добавляем текущую точку с актуальными рыночными ценами
                if (historyData.length > 0) {
                    const currentValue = Object.entries(holdings).reduce((sum, [sym, qty]) => {
                        return sum + (qty > 0 ? qty * (currentPrices[sym] || lastPriceMap[sym] || 0) : 0);
                    }, 0);
                    historyData.push({
                        time: Math.floor(Date.now() / 1000),
                        value: currentValue
                    });
                }
                
                // Берем последние 50 точек, удаляя дублирующиеся временные метки
                const dedupedMini = historyData.reduce((acc, point) => {
                    const last = acc[acc.length - 1];
                    if (last && last.time === point.time) {
                        acc[acc.length - 1] = point;
                    } else {
                        acc.push(point);
                    }
                    return acc;
                }, []);
                const recentHistory = dedupedMini.slice(-50);
                
                // Цвет в зависимости от доходности портфеля
                const lineColor = isPositive ? '#22d3ee' : '#f87171';
                const topColor = isPositive ? 'rgba(34, 211, 238, 0.52)' : 'rgba(248, 113, 113, 0.48)';
                const bottomColor = isPositive ? 'rgba(34, 211, 238, 0.02)' : 'rgba(248, 113, 113, 0.02)';
                
                // SVG-спарклайн: нет зависимостей, нет конфликтов, полный контроль над стилем
                miniChartContainer.style.height = '';

                const _fSym = currency.getCurrencySymbol();
                const fmtVal = v => {
                    const cv = currency.convertToSelectedCurrency(v);
                    if (cv >= 1e6) return `${_fSym}${(cv/1e6).toFixed(2)}M`;
                    if (cv >= 1e3) return `${_fSym}${(cv/1e3).toFixed(1)}K`;
                    return `${_fSym}${cv.toFixed(0)}`;
                };
                const fmtDate = t => {
                    const d = new Date(t * 1000);
                    return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}`;
                };
                
                function drawMiniSVG(containerWidth) {
                    const W = containerWidth || 270;
                    const H = 108;
                    const PT = 6, PB = 20, PL = 4, PR = 4;
                    const cH = H - PT - PB;
                    const cW = W - PL - PR;

                    const vals = recentHistory.map(d => d.value);
                    const minV = Math.min(...vals);
                    const maxV = Math.max(...vals);
                    const rng  = maxV - minV || maxV * 0.05 || 1;

                    const xOf = i => PL + (i / (recentHistory.length - 1)) * cW;
                    const yOf = v => PT + (1 - (v - minV) / rng) * cH;

                    const linePts = recentHistory.map((d, i) => {
                        const px = xOf(i).toFixed(1);
                        const py = yOf(d.value).toFixed(1);
                        return i === 0 ? `M${px},${py}` : `L${px},${py}`;
                    }).join(' ');

                    const lastX = xOf(recentHistory.length - 1).toFixed(1);
                    const lastY = yOf(recentHistory[recentHistory.length - 1].value).toFixed(1);
                    const firstX = xOf(0).toFixed(1);
                    const areaPath = `${linePts} L${lastX},${H - PB} L${firstX},${H - PB} Z`;

                    const labelStart = fmtDate(recentHistory[0].time);
                    const labelEnd   = fmtDate(recentHistory[recentHistory.length - 1].time);

                    const gid = 'msvg_' + Date.now().toString(36);

                    let midLabel = '';
                    if (recentHistory.length >= 6 && W > 180) {
                        const mi = Math.floor(recentHistory.length / 2);
                        const mx = xOf(mi).toFixed(1);
                        midLabel = `<text x="${mx}" y="${H - 4}" font-size="9" fill="rgba(200,214,229,0.38)" font-family="system-ui,sans-serif" text-anchor="middle">${fmtDate(recentHistory[mi].time)}</text>`;
                    }

                    miniChartContainer.innerHTML = `
<svg id="miniSVG" width="${W}" height="${H}" style="display:block;overflow:visible;cursor:crosshair" data-w="${W}" data-h="${H}" data-pt="${PT}" data-pb="${PB}" data-pl="${PL}" data-pr="${PR}">
  <defs>
    <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="${lineColor}" stop-opacity="0.48"/>
      <stop offset="100%" stop-color="${lineColor}" stop-opacity="0.02"/>
    </linearGradient>
  </defs>
  <line x1="${PL}" y1="${(PT + cH * 0.33).toFixed(1)}" x2="${W - PR}" y2="${(PT + cH * 0.33).toFixed(1)}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
  <line x1="${PL}" y1="${(PT + cH * 0.66).toFixed(1)}" x2="${W - PR}" y2="${(PT + cH * 0.66).toFixed(1)}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
  <path d="${areaPath}" fill="url(#${gid})"/>
  <path d="${linePts}" fill="none" stroke="${lineColor}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
  <!-- crosshair (скрыт по умолчанию) -->
  <line id="miniCrosshair" x1="0" y1="${PT}" x2="0" y2="${H - PB}" stroke="rgba(255,255,255,0.35)" stroke-width="1" stroke-dasharray="3,3" visibility="hidden"/>
  <!-- точка на линии (по умолчанию — последняя) -->
  <circle id="miniDot" cx="${lastX}" cy="${lastY}" r="3.5" fill="${lineColor}" stroke="rgba(255,255,255,0.85)" stroke-width="1.5"/>
  <!-- тултип-бэк -->
  <rect id="miniTipBg" rx="4" ry="4" fill="rgba(15,23,42,0.82)" stroke="rgba(255,255,255,0.12)" stroke-width="0.8" visibility="hidden"/>
  <!-- тултип-текст значения -->
  <text id="miniTipVal" font-size="10" font-weight="700" fill="#f1f5f9" font-family="system-ui,sans-serif" visibility="hidden"></text>
  <!-- тултип-текст даты -->
  <text id="miniTipDate" font-size="8.5" fill="rgba(148,163,184,0.85)" font-family="system-ui,sans-serif" visibility="hidden"></text>
  <text x="${PL}" y="${H - 4}" font-size="9" fill="rgba(200,214,229,0.52)" font-family="system-ui,sans-serif" text-anchor="start">${labelStart}</text>
  ${midLabel}
  <text x="${W - PR}" y="${H - 4}" font-size="9" fill="rgba(200,214,229,0.52)" font-family="system-ui,sans-serif" text-anchor="end">${labelEnd}</text>
  <!-- прозрачный overlay для событий мыши/тач -->
  <rect id="miniOverlay" x="${PL}" y="${PT}" width="${cW}" height="${cH + PB}" fill="transparent"/>
</svg>`;

                    // --- интерактивность ---
                    const svg        = miniChartContainer.querySelector('#miniSVG');
                    const overlay    = miniChartContainer.querySelector('#miniOverlay');
                    const crosshair  = miniChartContainer.querySelector('#miniCrosshair');
                    const dot        = miniChartContainer.querySelector('#miniDot');
                    const tipBg      = miniChartContainer.querySelector('#miniTipBg');
                    const tipVal     = miniChartContainer.querySelector('#miniTipVal');
                    const tipDate    = miniChartContainer.querySelector('#miniTipDate');

                    function nearestIndex(svgX) {
                        let best = 0, bestDist = Infinity;
                        recentHistory.forEach((_, i) => {
                            const d = Math.abs(xOf(i) - svgX);
                            if (d < bestDist) { bestDist = d; best = i; }
                        });
                        return best;
                    }

                    function showCrosshair(clientX) {
                        const rect = svg.getBoundingClientRect();
                        const scaleX = W / rect.width;
                        const svgX = (clientX - rect.left) * scaleX;
                        if (svgX < PL || svgX > W - PR) { hideCrosshair(); return; }

                        const idx = nearestIndex(svgX);
                        const pt  = recentHistory[idx];
                        const px  = xOf(idx);
                        const py  = yOf(pt.value);

                        crosshair.setAttribute('x1', px.toFixed(1));
                        crosshair.setAttribute('x2', px.toFixed(1));
                        crosshair.setAttribute('visibility', 'visible');

                        dot.setAttribute('cx', px.toFixed(1));
                        dot.setAttribute('cy', py.toFixed(1));

                        // тултип
                        const valTxt  = fmtVal(pt.value);
                        const dateTxt = fmtDate(pt.time);
                        tipVal.textContent  = valTxt;
                        tipDate.textContent = dateTxt;

                        const tipW = Math.max(valTxt.length, dateTxt.length) * 6.2 + 12;
                        const tipH = 28;
                        let tipX = px - tipW / 2;
                        const tipY = Math.max(PT, py - tipH - 6);
                        tipX = Math.min(Math.max(tipX, 2), W - tipW - 2);

                        tipBg.setAttribute('x', tipX);
                        tipBg.setAttribute('y', tipY);
                        tipBg.setAttribute('width', tipW);
                        tipBg.setAttribute('height', tipH);

                        tipVal.setAttribute('x', tipX + tipW / 2);
                        tipVal.setAttribute('y', tipY + 11);
                        tipVal.setAttribute('text-anchor', 'middle');

                        tipDate.setAttribute('x', tipX + tipW / 2);
                        tipDate.setAttribute('y', tipY + 22);
                        tipDate.setAttribute('text-anchor', 'middle');

                        [tipBg, tipVal, tipDate].forEach(el => el.setAttribute('visibility', 'visible'));
                    }

                    function hideCrosshair() {
                        crosshair.setAttribute('visibility', 'hidden');
                        [tipBg, tipVal, tipDate].forEach(el => el.setAttribute('visibility', 'hidden'));
                        // вернуть точку на последнюю позицию
                        dot.setAttribute('cx', lastX);
                        dot.setAttribute('cy', lastY);
                    }

                    overlay.addEventListener('mousemove',  e => showCrosshair(e.clientX));
                    overlay.addEventListener('mouseleave', () => hideCrosshair());
                    overlay.addEventListener('touchmove',  e => { e.preventDefault(); showCrosshair(e.touches[0].clientX); }, { passive: false });
                    overlay.addEventListener('touchend',   () => hideCrosshair());
                }

                drawMiniSVG(miniChartContainer.clientWidth);

                // Badge: используем уже рассчитанный portfolioReturn (реальная доходность портфеля)
                const badgeEl = document.getElementById('miniChartBadge');
                if (badgeEl) {
                    const sign = portfolioReturn >= 0 ? '+' : '';
                    badgeEl.textContent = `${sign}${portfolioReturn.toFixed(2)}%`;
                    badgeEl.classList.toggle('negative', portfolioReturn < 0);
                }
                
                // Показываем вложено → сейчас в футере графика
                const fmtV = v => v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M`
                                         : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K`
                                         : `$${v.toFixed(0)}`;
                const miniLowEl = document.getElementById('miniLow');
                const miniHighEl = document.getElementById('miniHigh');
                if (stats?.totalInvested > 0 && stats?.totalValue > 0) {
                    if (miniLowEl) miniLowEl.textContent = fmtV(stats.totalInvested);
                    if (miniHighEl) miniHighEl.textContent = fmtV(stats.totalValue);
                } else {
                    const nonZeroPoints = recentHistory.filter(p => p.value > 0);
                    if (nonZeroPoints.length >= 2) {
                        if (miniLowEl) miniLowEl.textContent = fmtV(nonZeroPoints[0].value);
                        if (miniHighEl) miniHighEl.textContent = fmtV(nonZeroPoints[nonZeroPoints.length - 1].value);
                    }
                }

                dashboardCharts.miniChart = { remove: () => { miniChartContainer.innerHTML = ''; } };

                const resizeObserver = new ResizeObserver(entries => {
                    if (!entries.length || !dashboardCharts.miniChart) return;
                    const w = Math.round(entries[0].contentRect.width);
                    if (w > 50) drawMiniSVG(w);
                });
                resizeObserver.observe(miniChartContainer);
                dashboardResizeObservers.miniChart = resizeObserver;
                
            }).catch(error => {

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
                                    return `${label}: ${currency.getCurrencySymbol()}${currency.convertToSelectedCurrency(value).toFixed(2)}`;
                                }
                            }
                        }
                    } 
                }
            });

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
        fetchCurrentPrices(allSymbols).then(async marketPrices => {
            // Сортируем транзакции по дате
            const sortedTx = [...transactions].sort((a, b) => 
                new Date(a.created_at) - new Date(b.created_at)
            );
            
            // Строим снимок состояния портфеля на каждый Calendar-день
            // от первой транзакции до сегодня
            const dailySnapshots = []; // [{dateStr, holdings, prices}]
            let currentHoldings = {};
            let txPrices = {};

            // Группируем транзакции по дате (YYYY-MM-DD)
            const txByDate = {};
            sortedTx.forEach(tx => {
                const d = (tx.created_at || '').slice(0, 10);
                if (!txByDate[d]) txByDate[d] = [];
                txByDate[d].push(tx);
            });

            const txDates = Object.keys(txByDate).sort();
            if (txDates.length === 0) return;

            // Обрабатываем транзакции по дням
            txDates.forEach(dateStr => {
                txByDate[dateStr].forEach(tx => {
                    const symbol = tx.symbol || tx.asset_symbol || 'UNKNOWN';
                    const txPrice = parseFloat(tx.price) || 0;
                    if (!currentHoldings[symbol]) currentHoldings[symbol] = 0;
                    if (txPrice > 0) txPrices[symbol] = txPrice;
                    if (tx.type === 'BUY') {
                        currentHoldings[symbol] += parseFloat(tx.quantity) || 0;
                    } else if (tx.type === 'SELL') {
                        currentHoldings[symbol] = Math.max(0, currentHoldings[symbol] - (parseFloat(tx.quantity) || 0));
                    }
                });
                dailySnapshots.push({
                    dateStr,
                    holdings: { ...currentHoldings },
                    prices: { ...txPrices }
                });
            });

            // Получаем первую и последнюю даты
            const firstDate = new Date(txDates[0] + 'T00:00:00Z');
            const today = new Date();
            today.setUTCHours(0, 0, 0, 0);

            // Загружаем реальные исторические дневные цены с Binance
            // для устранения плоских участков между транзакциями
            let historicalPrices = {};
            try {
                if (typeof window.fetchHistoricalDailyPrices === 'function') {
                    historicalPrices = await window.fetchHistoricalDailyPrices(allSymbols, txDates[0]);

                }
            } catch (e) {

            }

            // Заполняем каждый день от первой транзакции до сегодня
            const deduped = [];
            let snapshotIdx = 0;
            let activeHoldings = {};
            let activePrices = {};

            for (let d = new Date(firstDate); d <= today; d.setUTCDate(d.getUTCDate() + 1)) {
                const dateStr = d.toISOString().slice(0, 10);

                // Применяем все снимки, которые наступили к этому дню
                while (snapshotIdx < dailySnapshots.length && dailySnapshots[snapshotIdx].dateStr <= dateStr) {
                    activeHoldings = { ...dailySnapshots[snapshotIdx].holdings };
                    activePrices = { ...dailySnapshots[snapshotIdx].prices };
                    snapshotIdx++;
                }

                // Для текущего дня используем актуальные рыночные цены
                const isToday = dateStr === today.toISOString().slice(0, 10);

                const value = Object.entries(activeHoldings).reduce((sum, [sym, qty]) => {
                    // Приоритет: сегодняшняя цена → реальная историческая (Binance) → цена транзакции
                    const price = (isToday ? marketPrices[sym] : null)
                        || historicalPrices[sym]?.[dateStr]
                        || activePrices[sym] || 0;
                    return sum + (qty > 0 ? qty * price : 0);
                }, 0);

                if (value > 0 || deduped.length > 0) {
                    deduped.push({
                        time: dateStr,  // LightweightCharts принимает 'YYYY-MM-DD'
                        value
                    });
                }
            }
            
            if (deduped.length === 0) {

                return;
            }
            
            // Создаем график без границ - единый блок
            const chart = LightweightCharts.createChart(historyChartContainer, {
                width: historyChartContainer.clientWidth,
                height: 400,
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
            
            areaSeries.setData(deduped);
            chart.timeScale().fitContent();
            
            // Сохраняем для уничтожения позже
            dashboardCharts.historyChart = chart;
            
            // Адаптивность
            const HISTORY_CHART_HEIGHT = 400;
            const resizeObserver = new ResizeObserver(() => {
                // Проверяем, что график еще существует и не уничтожен
                if (!dashboardCharts.historyChart || !historyChartContainer.clientWidth) {
                    return;
                }
                try {
                    // Используем фиксированную высоту чтобы избежать CSS-цикла бесконечного роста
                    dashboardCharts.historyChart.applyOptions({ 
                        width: historyChartContainer.clientWidth,
                        height: HISTORY_CHART_HEIGHT
                    });
                } catch (error) {

                }
            });
            
            resizeObserver.observe(historyChartContainer);
            dashboardResizeObservers.historyChart = resizeObserver;
            

        }).catch(err => {

        });
    }
    

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
    

    
    // Используем функцию showSection из ui.js
    if (window.app && window.app.showSection) {
        window.app.showSection('news');
    } else {
        // Фоллбэк на прямое изменение hash
        window.location.hash = 'news';
    }
};
