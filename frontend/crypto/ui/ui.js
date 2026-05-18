// ui.js — ПОЛНЫЙ, РАБОЧИЙ, С SUPABASE

import { 
  getPortfolios, createPortfolio, deletePortfolio, 
  getTransactions, addTransaction, 
  getPortfolioName, getRisk,
  getPortfoliosSync, getTransactionsSync,
  getPricesForSymbols, getPriceSync, clearPriceCache
} from '../core/data.js';
import { convertToSelectedCurrency, getCurrencySymbol, getSelectedCurrency } from '../core/currency.js';
import { initTransactionFilters } from '../features/transactions/transaction-filters.js';

let charts = {};
let analyticsCharts = {};
let dashboardCharts = {};

// Global chart state variables
let currentCryptoSymbol = null;
let currentChartType = 'price'; // 'price' or 'tradingview'
let currentPeriod = '30d';
let isLogScale = false;
let compareSymbol = null;
let isPinModeActive = false;
let globalPinnedMarker = null;
let globalPinnedData = null;

// Toggle pin mode
window.togglePinMode = function() {
  isPinModeActive = !isPinModeActive;
  const pinBtn = document.getElementById('chartPinBtn');
  
  if (isPinModeActive) {
    pinBtn.classList.add('active');
    showNotification('Режим закрепления активирован', 'success');
  } else {
    pinBtn.classList.remove('active');
    // Remove pin marker when mode is disabled
    if (globalPinnedMarker && window.currentSeries) {
      try {
        window.currentSeries.removePriceLine(globalPinnedMarker);
      } catch (_) {}
      globalPinnedMarker = null;
      globalPinnedData = null;
    }
    showNotification('Режим закрепления отключен', 'info');
  }
};

// === УТИЛИТЫ ===

// Smart price formatting based on magnitude
const formatPrice = (price) => {
  const num = parseFloat(price);
  if (!num && num !== 0) return 'N/A';
  if (isNaN(num)) return 'N/A';
  
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

const debounce = (fn, delay = 500) => {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}

export const initApp = () => {
  setupNav();
  setupModals();
  setupTransactionCalc();
  initCharts();
  setupMobileMenu();
  setupMarketTabs();
  setupMarketSearch();
  setupMarketSort();
  setupAnalyticsExport();
  
  // Обработчик изменения размера окна для responsive таблицы активов
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      // Перерисовка таблицы активов в аналитике
      const assetsBody = document.getElementById('assetsStatsBody');
      if (assetsBody && window.cachedAnalyticsTransactions) {
        renderAssetsStats(window.cachedAnalyticsTransactions);
      }
      
      // Перерисовка таблицы акций в разделе Рынка
      const stocksTable = document.getElementById('stocksTable');
      if (stocksTable && window.stocksRealData && window.renderStocks) {
        const stocksArray = Object.keys(window.stocksRealData).map((symbol) => {
          const data = window.stocksRealData[symbol];
          return {
            symbol: symbol,
            name: window.STOCK_INFO?.[symbol]?.name || symbol,
            price: data.price,
            change: data.change,
            changePercent: data.changePercent,
            high: data.high,
            low: data.low,
            volume: data.volume,
            isReal: data.isReal
          };
        });
        if (stocksArray.length > 0) {
          window.renderStocks(stocksArray);
        }
      }
    }, 300);
  });
  
  // Предзагрузка данных в фоновом режиме
  preloadMarketData();
  
  // Обновляем dropdown после загрузки данных
  document.addEventListener('cryptoListLoaded', () => {
    const dropdown = document.getElementById('cryptoDropdown');
    if (dropdown && dropdown.classList.contains('active')) renderCryptoDropdown();
  });

  document.addEventListener('stocksDataLoaded', () => {
    const dropdown = document.getElementById('cryptoDropdown');
    if (dropdown && dropdown.classList.contains('active')) renderCryptoDropdown();
  });
}

// Предзагрузка данных о рынке при инициализации
const preloadMarketData = async () => {
  await new Promise(resolve => setTimeout(resolve, 100));
  try {
    if (window.app?.loadStocks) window.app.loadStocks().catch(() => {});
    if (window.app?.loadCrypto) window.app.loadCrypto().catch(() => {});
  } catch (_) {}
}



const setupNav = () => {
  document.querySelectorAll('.nav-item').forEach(link => {
    const href = link.getAttribute('href') || '';
    // Внешние ссылки (не начинающиеся с #) — не перехватываем
    if (!href.startsWith('#')) return;
    link.addEventListener('click', e => {
      e.preventDefault();
      const section = href.slice(1);
      if (window.location.hash === '#' + section) {
        // Hash уже совпадает (напр. после F5) — вручную вызываем hashchange
        window.dispatchEvent(new Event('hashchange'));
      } else {
        window.location.hash = section;
      }
    });
  });
}

export const showSection = async (id) => {
  // Скрываем все секции
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const section = document.getElementById(id + 'Section');
  if (section) {
    section.classList.add('active');
    
    // Мгновенная и надёжная загрузка новостей при переходе в раздел "Новости"
    if (id === 'news') {
      const container = document.getElementById('newsContainer');
      if (container) {
        container.style.display = 'grid';
        container.style.visibility = 'visible';
        // Быстрый индикатор загрузки — реальная функция загрузки установит содержимое
        container.innerHTML = `
          <div class="news-loading-state">
            <div class="loader-large"></div>
            <p>Загрузка новостей...</p>
          </div>
        `;
      }

      // Инициализируем фильтры делегированно (без дублирования обработчиков)
      if (typeof window.ensureNewsFiltersInit === 'function') window.ensureNewsFiltersInit();

      // Обновляем заголовок страницы сразу (до return)
      const titleElNews = document.getElementById('pageTitle');
      if (titleElNews) titleElNews.textContent = getTitle(id);
      const navNews = document.querySelector(`[href="#${id}"]`);
      if (navNews) navNews.classList.add('active');

      // Сразу вызываем `loadNews`. Верхний proxy в `api.js` буферизует вызов, если реализация ещё не готова.
      if (typeof window.loadNews === 'function') {
        try { window.loadNews('all'); } catch (_) {}
        return;
      }

      // Если loadNews не доступна как функция (крайний кейс), используем scheduleLoadNews как запасной план.
      if (typeof window.scheduleLoadNews === 'function') {
        window.scheduleLoadNews('all');
        return;
      }

      // Ожидаем регистрацию proxy/реализации
    }

    // При переходе в раздел "Избранное" — отрендерим карточки
    if (id === 'favorites') {
      try {
        const mod = await import('../api/api.js');
        if (typeof mod.renderFavoritesSection === 'function') {
          await mod.renderFavoritesSection();
          try {
            const favsMod = await import('../features/favorites/favorites-controls.js');
            if (typeof favsMod.initFavoritesControls === 'function') await favsMod.initFavoritesControls();
          } catch (_) {}
          // Инициализируем расширенный функционал избранного
          try {
            const enhancedMod = await import('../features/favorites/favorites-enhanced.js');
            if (typeof enhancedMod.initFavoritesEnhanced === 'function') await enhancedMod.initFavoritesEnhanced();
          } catch (_) {}
        } else if (typeof window.renderFavoritesSection === 'function') {
          await window.renderFavoritesSection();
        }
      } catch (_) {}
    }
  } else {
    // Раздел не найден — возможно, eSS-секция ещё не создана
  }
  
  // Активируем nav-item
  const nav = document.querySelector(`[href="#${id}"]`);
  if (nav) {
    nav.classList.add('active');
  }

  // Обновляем заголовок
  const titleEl = document.getElementById('pageTitle');
  if (titleEl) {
    titleEl.textContent = getTitle(id);
  }
  
  // Загружаем данные для раздела Market при первом открытии
  if (id === 'market') {
    // Показываем вкладку "Акции" по умолчанию и загружаем данные
    setTimeout(() => {
      const stocksTab = document.querySelector('[data-tab="stocks"]');
      if (stocksTab) {
        stocksTab.click();
      }
    }, 100);
  }
  
  // Переинициализируем фильтры при переходе в секцию криптовалют
  if (id === 'crypto' && typeof window.initCryptoFilters === 'function') {
    setTimeout(() => {
      window.initCryptoFilters();
    }, 100);
  }
  
  // Переинициализируем фильтры при переходе в секцию акций
  if (id === 'stocks' && typeof window.initStocksFilters === 'function') {
    setTimeout(() => {
      window.initStocksFilters();
    }, 100);
  }
}

const getTitle = (id) => {
  const titles = {
    dashboard: 'Дашборд',
    portfolios: 'Портфели',
    transactions: 'Транзакции',
    market: 'Рынок',
    analytics: 'Аналитика',
    crypto: 'Криптовалюты',
    stocks: 'Акции',
    tools: 'Торговые инструменты',
    news: 'Новости',
    favorites: 'Избранное'
  };
  return titles[id] || id;
}

const setupModals = () => {
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', e => {
      if (e.target === modal) window.app.closeModal(modal.id);
    });
  });
}

const setupTransactionCalc = () => {
  // Обновление итоговой суммы при изменении количества или цены
  ['transactionQuantity', 'transactionPrice'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateTransactionTotal);
  });
  
  // Настройка crypto dropdown
  setupCryptoDropdown();
}

// === CRYPTO DROPDOWN ===
const setupCryptoDropdown = () => {
  const searchInput = document.getElementById('cryptoSearchInput');
  const dropdown = document.getElementById('cryptoDropdown');

  if (!searchInput || !dropdown) return;

  // Переносим dropdown в <body> чтобы избежать обрезки overflow:hidden модального окна
  if (dropdown.parentElement !== document.body) {
    document.body.appendChild(dropdown);
  }

  // Блокируем initCryptoSearch из api.js чтобы не было дублирующих конкурирующих обработчиков
  window.__cryptoSearchInitDone = true;

  // Функция позиционирования дропдауна под полем ввода
  const positionDropdown = () => {
    const rect = searchInput.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.top = (rect.bottom + 4) + 'px';
    dropdown.style.left = rect.left + 'px';
    dropdown.style.width = rect.width + 'px';
    dropdown.style.zIndex = '99999';
  };

  // Показываем dropdown при фокусе
  searchInput.addEventListener('focus', function() {
    if (!dropdown.classList.contains('active')) {
      renderCryptoDropdown(this.value.toLowerCase().trim());
    }
    positionDropdown();
    dropdown.classList.add('active');
  });

  // Обновляем позицию при скролле или ресайзе
  const reposition = () => {
    if (dropdown.classList.contains('active')) positionDropdown();
  };
  window.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);

  // Поиск при вводе — используем debounce
  const debouncedRender = debounce((term) => renderCryptoDropdown(term), 180);
  searchInput.addEventListener('input', function() {
    const searchTerm = this.value.toLowerCase().trim();
    positionDropdown();
    dropdown.classList.add('active');
    debouncedRender(searchTerm);
  });

  // Закрываем dropdown при клике вне него
  document.addEventListener('click', function(e) {
    if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.remove('active');
      dropdown.style.display = '';
    }
  });

  // Закрываем при нажатии Escape
  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      dropdown.classList.remove('active');
      this.blur();
    }
  });
}

const renderCryptoDropdown = (searchTerm = '') => {
  const dropdown = document.getElementById('cryptoDropdown');
  if (!dropdown) return;

  // Объединяем криптовалюты и акции в один список
  let allAssets = [];

  // Добавляем криптовалюты
  if (window.cryptoList && window.cryptoList.length > 0) {
    allAssets = allAssets.concat(window.cryptoList.map(crypto => ({
      ...crypto,
      type: 'Крипто',
      assetType: 'crypto'
    })));
  }

  // Добавляем акции — STOCK_INFO всегда доступен статически, stocksRealData опционален
  if (window.STOCK_INFO) {
    const stocks = Object.entries(window.STOCK_INFO).map(([symbol, info]) => {
      const priceData = window.stocksRealData?.[symbol];
      return {
        symbol: symbol,
        name: info.name,
        price: priceData?.price || 0,
        color: info.color,
        type: 'Акция',
        assetType: 'stock',
        sector: info.sector,
        exchange: info.exchange
      };
    });
    allAssets = allAssets.concat(stocks);
  }

  if (allAssets.length === 0) {
    dropdown.innerHTML = '<div style="padding: 1rem; text-align: center; color: #6b7280;">Загрузка активов...</div>';
    return;
  }

  // Фильтруем по поисковому запросу
  let filteredAssets = allAssets;
  if (searchTerm) {
    filteredAssets = allAssets.filter(asset => 
      asset.name.toLowerCase().includes(searchTerm) || 
      asset.symbol.toLowerCase().includes(searchTerm));
  }

  if (filteredAssets.length === 0) {
    dropdown.innerHTML = '<div style="padding: 1rem; text-align: center; color: #6b7280;">Актив не найден</div>';
    return;
  }

  // Быстрая отрисовка: сначала рендерим первые 20 элементов, затем покусково добавляем остальные (chunked rendering)
  const items = filteredAssets;
  const containerHtml = '<div class="dropdown-header">' + items.length + ' активов</div>' +
    '<div class="dropdown-results"></div>';
  dropdown.innerHTML = containerHtml;
  const container = dropdown.querySelector('.dropdown-results');

  const makeItemHtml = (asset) => {
    // Sanitize incoming data (remove stray semicolons, trim)
    const rawSymbol = asset.symbol || '';
    const rawName = asset.name || '';
    const symbol = String(rawSymbol).replace(/;+$/g, '').replace(/;/g, '').trim().toUpperCase();
    const name = String(rawName).replace(/;+$/g, '').replace(/;/g, '').trim();
    
    // Определяем цвет и иконку в зависимости от типа актива
    let info, iconUrl, iconFallback;
    if (asset.assetType === 'stock') {
      info = window.STOCK_INFO?.[symbol] || { color: '#3B82F6' };
      iconUrl = `https://img.logo.dev/${symbol.toLowerCase()}.com?token=pk_X-jjCWIKT_SRetd3NwvHUg&size=80&format=png`;
      iconFallback = `https://assets.parqet.com/logos/symbol/${symbol}`;
    } else {
      info = window.CRYPTO_INFO?.[symbol] || window.CRYPTO_INFO?.[asset.symbol] || { icon: null, color: '#F7931A' };
      iconUrl = `https://assets.coincap.io/assets/icons/${(asset.symbol || symbol).toLowerCase()}@2x.png`;
      iconFallback = `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/32/icon/${(asset.symbol || symbol).toLowerCase()}.png`;
    }
    
    const currencySymbol = getCurrencySymbol();
    const convertedPrice = convertToSelectedCurrency(asset.price);
    const typeLabel = asset.type || 'Актив';
    const sym0 = symbol.charAt(0) || '';
    return `
      <div class="tools-crypto-item" data-symbol="${symbol}" data-price="${asset.price}" data-name="${name}" data-type="${asset.assetType}" style="display:flex;align-items:center;gap:.75rem;padding:.5rem .75rem;border-radius:8px;cursor:pointer;">
        <div class="tools-crypto-icon" style="width:36px; height:36px; border-radius:50%; background:${info.color}; display:flex;align-items:center;justify-content:center; position:relative; flex:0 0 36px; overflow:hidden;">
          <img src="${iconUrl}" alt="${symbol}" style="width:100%;height:100%;object-fit:contain;border-radius:50%;display:block;" onerror="if(!this.dataset.fb1){this.dataset.fb1='1';this.src='${iconFallback}';}else{this.style.display='none';this.nextElementSibling.style.display='flex';}" />
          <div class="tools-crypto-icon-fallback" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;font-weight:700;color:rgba(255,255,255,0.95);">${sym0}</div>
        </div>
        <div class="tools-crypto-info" style="flex:1; min-width:0;">
          <div class="tools-crypto-name" style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</div>
          <div class="tools-crypto-meta" style="display:flex;gap:.5rem;align-items:center;font-size:0.85rem;margin-top:0.125rem;">
            <div class="tools-crypto-symbol">${symbol}</div>
            <div class="tools-crypto-type">${typeLabel}</div>
          </div>
        </div>
        <div class="crypto-price" style="flex:0 0 auto; font-weight:600;">${currencySymbol}${formatPrice(convertedPrice)}</div>
      </div>
    `;
  };

  // First quick chunk (render minimal set for instant feedback)
  const firstChunk = items.slice(0, 10);
  container.innerHTML = firstChunk.map(makeItemHtml).join('');

  // Attach click handlers for items present
  const attachClickHandlers = (root) => {
    root.querySelectorAll('.tools-crypto-item').forEach(item => {
      if (item.__bound) return; // avoid double-binding
      item.__bound = true;
      item.addEventListener('click', function() {
        selectCrypto(this.dataset.symbol, this.dataset.name, this.dataset.price);
      });
    });
  };
  attachClickHandlers(container);

  // If there are more items — render them in background in small chunks to avoid blocking UI
  if (items.length > firstChunk.length) {
    let index = firstChunk.length;
    const chunkSize = 25; // smaller chunks for smoother interactivity
    const renderNext = () => {
      const chunk = items.slice(index, index + chunkSize);
      if (chunk.length === 0) return;
      container.insertAdjacentHTML('beforeend', chunk.map(makeItemHtml).join(''));
      attachClickHandlers(container);
      index += chunkSize;
      if (index < items.length) {
        // schedule next chunk a bit later so UI stays responsive
        setTimeout(renderNext, 30);
      }
    };
    setTimeout(renderNext, 30);
  }

  // Add a small counter showing how many are displayed
  const headerEl = dropdown.querySelector('.dropdown-header');
  if (headerEl) headerEl.textContent = `Показано ${Math.min(items.length, container.querySelectorAll('.tools-crypto-item').length)} из ${items.length}`;
}

// Экспортируем функцию глобально для использования в других модулях
window.renderCryptoDropdown = renderCryptoDropdown;

// Пересчитать виджеты при смене валюты
window.addEventListener('currencyChanged', () => {
  // Перерисовать dropdown с новыми ценами
  renderCryptoDropdown();
  // Обновить аналитику и таблицы
  try {
    renderAnalytics();
  } catch (e) {}
  try {
    const txs = getTransactionsSync();
    if (txs && txs.length) renderAssetsStats(txs);
  } catch (e) {}

  // Обновить выбранную криптовалюту в форме транзакции, если есть сохранённая USD-цена
  const priceInput = document.getElementById('transactionPrice');
  const selectedCrypto = document.getElementById('selectedCrypto');
  if (priceInput && priceInput.dataset && priceInput.dataset.usdPrice) {
    const usd = parseFloat(priceInput.dataset.usdPrice);
    if (!isNaN(usd)) {
      const converted = convertToSelectedCurrency(usd);
      if (converted < 0.000001) {
        priceInput.value = converted.toFixed(8);
      } else if (converted < 0.0001) {
        priceInput.value = converted.toFixed(6);
      } else if (converted < 0.01) {
        priceInput.value = converted.toFixed(4);
      } else if (converted < 1) {
        priceInput.value = converted.toFixed(3);
      } else {
        priceInput.value = converted.toFixed(2);
      }
      updateTransactionTotal();
    }
  } else {
    // Если цены нет — обновим и просто символ в итого
    const totalEl = document.getElementById('transactionTotal');
    if (totalEl) {
      const symbol = getCurrencySymbol();
      // Попробуем извлечь число из текста и поставить новый символ
      const existing = totalEl.textContent.replace(/[\s\u00A0\$€₽¥£, ]/g, '');
      const num = parseFloat(existing) || 0;
      totalEl.textContent = `${symbol}${num.toFixed(2)}`;
    }
  }

  // Обновить отображение выбранной криптовалюты
  if (selectedCrypto && selectedCrypto.dataset && selectedCrypto.dataset.usdPrice) {
    const usd = parseFloat(selectedCrypto.dataset.usdPrice);
    if (!isNaN(usd)) {
      const priceEl = selectedCrypto.querySelector('.selected-crypto-price');
      const currencySymbol = getCurrencySymbol();
      if (priceEl) {
        priceEl.textContent = currencySymbol + formatPrice(convertToSelectedCurrency(usd));
      }
    }
  }

  // Перерисовать таблицу детальной статистики активов и аналитики, используя локальные транзакции
  try {
    const txs = getTransactionsSync();
    if (txs && txs.length > 0) {
      renderAssetsStats(txs);
    }
  } catch (e) {
    // ignore if no sync function
  }
});

const selectCrypto = (symbol, name, price) => {
  const searchInput = document.getElementById('cryptoSearchInput');
  const dropdown = document.getElementById('cryptoDropdown');
  const hiddenInput = document.getElementById('transactionSymbol');
  const selectedCrypto = document.getElementById('selectedCrypto');
  const priceInput = document.getElementById('transactionPrice');
  
  // Заполняем скрытое поле
  if (hiddenInput) hiddenInput.value = symbol;
  
  // Заполняем цену (в выбранной валюте) и сохраняем цену в USD для последующего пересчёта
  if (priceInput) {
    // Сохраняем оригинальную цену в USD в data-атрибуте
    priceInput.dataset.usdPrice = price;

    const converted = convertToSelectedCurrency(parseFloat(price));
    if (converted < 0.000001) {
      priceInput.value = converted.toFixed(8);
    } else if (converted < 0.0001) {
      priceInput.value = converted.toFixed(6);
    } else if (converted < 0.01) {
      priceInput.value = converted.toFixed(4);
    } else if (converted < 1) {
      priceInput.value = converted.toFixed(3);
    } else {
      priceInput.value = converted.toFixed(2);
    }
    updateTransactionTotal();
  }
  
  // Очищаем поле поиска
  if (searchInput) searchInput.value = '';
  
  // Скрываем dropdown — сбрасываем и класс и inline-стиль (на случай конкурирующего механизма)
  if (dropdown) {
    dropdown.classList.remove('active');
    dropdown.style.display = '';
  }
  
  // Показываем выбранную криптовалюту/акцию
  if (selectedCrypto) {
    // Определяем тип актива (акция или криптовалюта)
    const isStock = window.STOCK_INFO && window.STOCK_INFO[symbol];
    
    let info, iconHTML;
    if (isStock) {
      // Для акций
      info = window.STOCK_INFO[symbol] || { color: '#3B82F6' };
      const iconUrl = `https://img.logo.dev/${symbol.toLowerCase()}.com?token=pk_X-jjCWIKT_SRetd3NwvHUg&size=80&format=png`;
      iconHTML = `<img src="${iconUrl}" alt="${symbol}" style="width:100%;height:100%;object-fit:contain;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                  <span style="font-weight: 700; display:none;">${symbol.charAt(0)}</span>`;
    } else {
      // Для криптовалют
      info = window.CRYPTO_INFO[symbol] || { icon: null, color: '#F7931A' };
      const cryptoBg = info.color.replace('#', '');
      iconHTML = `<img src="https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png" alt="${symbol}" style="width:100%;height:100%;object-fit:contain;" onerror="if(!this.dataset.cf){this.dataset.cf='1';this.src='https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/32/icon/${symbol.toLowerCase()}.png';}else{this.onerror=null;this.src='https://ui-avatars.com/api/?name=${symbol}&background=${cryptoBg}&color=fff&size=64&bold=true';}" />`;
    }
    
    const currencySymbol = getCurrencySymbol();
    const convertedPrice = convertToSelectedCurrency(parseFloat(price));
    // Сохраняем оригинальную цену в USD в data-атрибуте выбранного элемента
    selectedCrypto.dataset.usdPrice = price;
    selectedCrypto.innerHTML = `
      <div class="selected-crypto-icon" style="background: ${info.color}; color: white;">
        ${iconHTML}
      </div>
      <div class="selected-crypto-info">
        <div class="selected-crypto-name">${name}</div>
        <div class="selected-crypto-symbol">${symbol}</div>
      </div>
      <div class="selected-crypto-price">${currencySymbol}${formatPrice(convertedPrice)}</div>
    `;
    selectedCrypto.style.display = 'flex';
  }
}

const updateTransactionTotal = () => {
  const qty = parseFloat(document.getElementById('transactionQuantity')?.value) || 0;
  const price = parseFloat(document.getElementById('transactionPrice')?.value) || 0;
  const total = qty * price;
  const totalEl = document.getElementById('transactionTotal');
  if (totalEl) {
    const currencySymbol = getCurrencySymbol();
    totalEl.textContent = `${currencySymbol}${total.toFixed(2)}`;
  }
}

// Делаем функцию доступной глобально
window.updateTransactionTotal = updateTransactionTotal;

const initCharts = () => {
  const ctx1 = document.getElementById('assetAllocationChart');
  const ctx2 = document.getElementById('portfolioHistoryChart');

  if (ctx1) {
    charts.asset = new Chart(ctx1, {
      type: 'doughnut',
      data: { labels: ['Акции', 'Крипто', 'Наличные'], datasets: [{ data: [60, 30, 10], backgroundColor: ['#2563eb', '#f59e0b', '#10b981'] }] },
      options: { responsive: true }
    });
  }

  if (ctx2) {
    charts.history = new Chart(ctx2, {
      type: 'line',
      data: {
        labels: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн'],
        datasets: [{
          label: 'Портфель',
          data: [120000, 125000, 132000, 128000, 140000, 154320],
          borderColor: '#2563eb',
          fill: true,
          tension: 0.4
        }]
      },
      options: { responsive: true }
    });
  }
}

const setupMobileMenu = () => {
  const btn = document.getElementById('mobileMenuBtn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');

  if (btn && sidebar && overlay) {
    btn.addEventListener('click', () => {
      sidebar.classList.add('active');
      overlay.classList.add('active');
    });

    overlay.addEventListener('click', () => {
      sidebar.classList.remove('active');
      overlay.classList.remove('active');
    });

    document.getElementById('sidebarToggle')?.addEventListener('click', () => {
      sidebar.classList.remove('active');
      overlay.classList.remove('active');
    });
  }
}

// === ВКЛАДКИ РЫНКА ===
export const setupMarketTabs = () => {
  document.querySelectorAll('#marketTabs .tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      
      // Убираем active со всех вкладок
      document.querySelectorAll('#marketTabs .tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Скрываем все tab-content
      document.getElementById('stocksContent').style.display = 'none';
      document.getElementById('cryptoContent').style.display = 'none';
      document.getElementById('indicesContent').style.display = 'none';
      
      // Показываем нужный content
      if (tab === 'stocks') {
        document.getElementById('stocksContent').style.display = 'block';
        if (window.app.loadStocks) window.app.loadStocks();
      }
      if (tab === 'crypto') {
        document.getElementById('cryptoContent').style.display = 'block';

        if (!window.cryptoManager) {
          const grid = document.getElementById('marketCryptoGrid');
          if (grid) grid.innerHTML = '<div class="no-data">Ошибка: менеджер криптовалют не загружен. Перезагрузите страницу.</div>';
          return;
        }

        if (window.app.loadCrypto) {
          try {
            const result = window.app.loadCrypto();
            if (result?.catch) result.catch(() => {});
          } catch (_) {}
        }
      }
      if (tab === 'indices') {
        document.getElementById('indicesContent').style.display = 'block';
        if (window.app.loadIndices) window.app.loadIndices();
      }
    });
  });
}

// === ПОИСК ===
export const setupMarketSearch = () => {
  const search = document.getElementById('marketSearch');
  if (!search) return;

  search.addEventListener('input', () => {
    const query = search.value.toLowerCase();
    document.querySelectorAll('#stocksTable tr, #cryptoGrid .crypto-card, #indicesTable tr').forEach(el => {
      const text = el.textContent.toLowerCase();
      el.style.display = text.includes(query) ? '' : 'none';
    });
  });
}

// === СОРТИРОВКА ===
export const setupMarketSort = () => {
  document.querySelectorAll('.market-table th').forEach((th, i) => {
    if (i < 5) {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const table = th.closest('table');
        const tbody = table.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));
        const isNum = i >= 2;
        rows.sort((a, b) => {
          let A = a.children[i].textContent;
          let B = b.children[i].textContent;
          if (isNum) {
            A = parseFloat(A.replace(/[^\d.-]/g, '')) || 0;
            B = parseFloat(B.replace(/[^\d.-]/g, '')) || 0;
          }
          return A > B ? 1 : -1;
        });
        rows.forEach(r => tbody.appendChild(r));
      });
    }
  });
}

// === ЭКСПОРТ АНАЛИТИКИ В PDF ===
const setupAnalyticsExport = () => {
  const exportBtn = document.getElementById('exportAnalyticsPDFBtn');
  if (!exportBtn) return;
  
  exportBtn.addEventListener('click', async () => {
    // Защита от повторных кликов
    if (exportBtn.disabled) {
      return;
    }
    
    try {
      exportBtn.disabled = true;
      exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Генерация...';
      
      // Получаем выбранный портфель из dropdown
      const portfolioDisplay = document.getElementById('analyticsPortfolioDisplay');
      const selectedOption = document.querySelector('#analyticsPortfolioDropdown .custom-select-option.selected');
      const portfolioId = selectedOption ? selectedOption.getAttribute('data-value') : '';
      
      // Импортируем модуль экспорта
      const { exportAnalyticsToPDF } = await import('../analytics/analytics-export.js');
      
      // Вызываем функцию экспорта
      await exportAnalyticsToPDF(portfolioId);
    } catch (error) {
      showNotification('Ошибка при экспорте аналитики в PDF', 'error');
    } finally {
      exportBtn.disabled = false;
      exportBtn.innerHTML = '<i class="fas fa-file-pdf"></i> Экспорт в PDF';
    }
  });
}

export const showNotification = (msg, type = 'info') => {
  window.showNotification = showNotification; // Keep global for backwards compatibility
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
  
  setTimeout(() => n.remove(), 4000);
}

// === ПОРТФЕЛИ И ТРАНЗАКЦИИ ===
export const loadPortfolios = async () => {
  window.loadPortfolios = loadPortfolios;
  const grid = document.getElementById('portfoliosGrid');
  if (!grid) return;

  try {
    const portfolios = await getPortfolios();

    if (portfolios.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-briefcase"></i>
          <h3>Нет портфелей</h3>
          <p>Создайте свой первый портфель для отслеживания инвестиций</p>
          <button class="btn btn-primary" onclick="document.getElementById('createPortfolioBtn').click()">
            <i class="fas fa-plus"></i> Создать портфель
          </button>
        </div>
      `;
      return;
    }

    // Mount Vue component for portfolios if available (better animations + reactivity)
    grid.innerHTML = '<div id="vuePortfoliosRoot"></div>';

    const mountVuePortfolios = (items) => {
      try {
        if (typeof Vue !== 'undefined' && Vue && Vue.createApp) {
          // Unmount previous portfolios Vue instance if any
          if (window._portfoliosVueApp) {
            try { window._portfoliosVueApp.unmount(); } catch (e) {}
            window._portfoliosVueApp = null;
          }
          const { createApp, ref } = Vue;
          const app = createApp({
            setup() {
              const portfolios = ref(items || []);
              const remove = async (id) => {
                const doDelete = async () => {
                  try { await deletePortfolio(id); portfolios.value = portfolios.value.filter(p => p.id !== id); populatePortfolioSelect(); } catch (_) { alert('Не удалось удалить портфель'); }
                };
                if (window.showConfirmModal) {
                  window.showConfirmModal('Удалить портфель?', 'Все транзакции этого портфеля будут безвозвратно удалены. Это действие нельзя отменить.', doDelete);
                } else {
                  if (confirm('Удалить портфель и все транзакции?')) doDelete();
                }
              };
              const openTransaction = (portfolioId) => {
                if (window.app && window.app.showTransactionModal) window.app.showTransactionModal('BUY', portfolioId);
              };
              return { portfolios, remove, openTransaction, getRisk };
            },
            template: `
                <transition-group name="portfolio-list" tag="div" class="portfolios-list">
                  <div class="portfolio-card" v-for="p in portfolios" :key="p.id">
                    <div class="portfolio-header">
                      <h3 translate="no">{{ p.name }}</h3>
                      <span class="portfolio-badge notranslate" translate="no" :class="p.risk_level.toLowerCase()">{{ getRisk(p.risk_level) }}</span>
                    </div>
                    <p class="portfolio-description" translate="no">{{ p.description || '' }}</p>
                    <div class="portfolio-info">
                      <div><i class="fas fa-coins"></i> <span translate="no">{{ p.currency || 'USD' }}</span></div>
                      <div><i class="fas fa-calendar"></i> <span translate="no">{{ new Date(p.created_at).toLocaleDateString('ru-RU') }}</span></div>
                    </div>

                    <div class="portfolio-sparkline" aria-hidden="true"></div>

                    <div class="portfolio-actions">
                      <button class="btn btn-primary" @click.prevent="openTransaction(p.id)"><i class="fas fa-plus-circle"></i> Транзакция</button>
                      <button class="btn btn-outline" @click.prevent="remove(p.id)"><i class="fas fa-trash"></i> Удалить</button>
                    </div>
                  </div>
                </transition-group>
            `
          });
          app.mount('#vuePortfoliosRoot');
          window._portfoliosVueApp = app;
          // Apply default style variant (can be changed via `window.app.portfolioStyle`) and make root a grid
          try {
            const root = document.getElementById('vuePortfoliosRoot');
            const style = (window.app && window.app.portfolioStyle) ? window.app.portfolioStyle : 'tt-1';
            if (root) root.classList.add(`portfolio-style-${style}`);
          } catch (_) {}
          return true;
        }
      } catch (_) {}
      return false;
    };

    const mounted = mountVuePortfolios(portfolios);
    if (!mounted) {
      // Fallback to previous static rendering
      grid.innerHTML = portfolios.map(p => `
        <div class="portfolio-card">
          <div class="portfolio-header">
            <h3 translate="no">${escapeHtml(p.name)}</h3>
            <span class="portfolio-badge notranslate ${p.risk_level.toLowerCase()}" translate="no">${getRisk(p.risk_level)}</span>
          </div>
          <p class="portfolio-description" translate="no">${escapeHtml(p.description) || ''}</p>
          <div class="portfolio-info">
            <div><i class="fas fa-coins"></i> <span translate="no">${p.currency || 'USD'}</span></div>
            <div><i class="fas fa-calendar"></i> <span translate="no">${new Date(p.created_at).toLocaleDateString('ru-RU')}</span></div>
          </div>
          <div class="portfolio-actions">
            <button class="btn btn-primary" onclick="app.showTransactionModal('BUY', '${p.id}')"><i class="fas fa-plus-circle"></i> Транзакция</button>
            <button class="btn btn-outline" onclick="app.deletePortfolio('${p.id}')"><i class="fas fa-trash"></i> Удалить</button>
          </div>
        </div>
      `).join('');
    }

    populatePortfolioSelect();
    
    // Обновляем фильтр портфелей в транзакциях
    if (window.updateTransactionPortfolioFilter) {
        window.updateTransactionPortfolioFilter();
    }
    
    // Обновляем фильтр портфелей в аналитике
    await populateAnalyticsFilters();
  } catch (err) {
    grid.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-exclamation-triangle"></i>
        <h3>Ошибка загрузки</h3>
        <p>${escapeHtml(err.message)}</p>
        <button class="btn btn-primary" onclick="window.app.loadPortfolios()">
          <i class="fas fa-redo"></i> Попробовать снова
        </button>
      </div>
    `;
  }
}

// Функция для экранирования HTML
const escapeHtml = (text) => {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

export const loadTransactions = async () => {
  window.loadTransactions = loadTransactions;
  const tbody = document.getElementById('transactionsTableBody');
  if (!tbody) return;

  try {
    const transactions = await getTransactions();

    if (transactions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="no-data">Нет транзакций</td></tr>';
      return;
    }

    tbody.innerHTML = transactions.map(t => {
      const currencySymbol = getCurrencySymbol();
      const priceConverted = convertToSelectedCurrency(parseFloat(t.price));
      const totalConverted = convertToSelectedCurrency(parseFloat(t.quantity) * parseFloat(t.price));
      return `
      <tr class="transaction-row" data-portfolio-id="${t.portfolio_id}" data-type="${t.type}" data-date="${t.date}">
        <td>${new Date(t.date).toLocaleDateString()}</td>
        <td><span class="transaction-type ${t.type.toLowerCase()}">${t.type === 'BUY' ? 'Покупка' : 'Продажа'}</span></td>
        <td>
          <div class="asset-cell">
            <div class="asset-icon-cell">${getAssetIcon(t.symbol)}</div>
            <div class="asset-name notranslate" translate="no"><strong class="notranslate" translate="no">${t.symbol}</strong></div>
          </div>
        </td>
        <td class="asset-qty notranslate" translate="no">${t.quantity}</td>
        <td class="asset-price notranslate" translate="no">${currencySymbol}${formatPrice(priceConverted)}</td>
        <td class="asset-total notranslate" translate="no">${currencySymbol}${formatPrice(totalConverted)}</td>
        <td>${getPortfolioName(t.portfolio_id)}</td>
        <td>
            <button class="delete-transaction-btn" data-transaction-id="${t.id}">
                <i class="fas fa-trash-alt"></i>
                <span>Удалить</span>
            </button>
        </td>
      </tr>
    `
    }).join('');

    // Throttle lazy icon loading to avoid massive parallel requests (process this tbody)
    if (window._iconLoader?.processContainer) window._iconLoader.processContainer(tbody);
    
    // Инициализируем кастомные фильтры после загрузки транзакций
    initTransactionFilters();

    if (window.updateTransactionPortfolioFilter) window.updateTransactionPortfolioFilter();

    if (typeof window.updateTransactionStats === 'function') {
      setTimeout(() => window.updateTransactionStats(), 500);
    }
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="8">Ошибка: ' + err.message + '</td></tr>';
  }
}

const populatePortfolioSelect = () => {
  const select = document.getElementById('transactionPortfolio');
  if (!select) return;
  const portfolios = getPortfoliosSync();
  select.innerHTML = portfolios.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

  // Also populate visible transaction dropdown (portfolio-style) if present
  try {
    const dropdown = document.getElementById('transactionPortfolioDropdown');
    const display = document.getElementById('transactionPortfolioDisplay');
    if (dropdown) {
      dropdown.innerHTML = portfolios.map(p => `
        <div class="tools-crypto-item" data-value="${p.id}">
          <div class="tools-crypto-name">${p.name}</div>
        </div>
      `).join('');

      // attach click handlers
      dropdown.querySelectorAll('.tools-crypto-item').forEach(item => {
        item.addEventListener('click', (e) => {
          const val = item.getAttribute('data-value');
          const nameEl = item.querySelector('.tools-crypto-name');
          if (select) select.value = val;
          if (display && nameEl) display.querySelector('.tools-crypto-name').textContent = nameEl.textContent.trim();
          dropdown.style.display = 'none';
          if (display) display.setAttribute('aria-expanded', 'false');
        });
      });
    }
  } catch (_) {}
}

// Setup visible transaction dropdowns (type + portfolio) toggles
const setupTransactionDropdowns = () => {
  const setups = [
    {displayId: 'transactionTypeDisplay', dropdownId: 'transactionTypeDropdown', hiddenId: 'transactionType'},
    {displayId: 'transactionPortfolioDisplay', dropdownId: 'transactionPortfolioDropdown', hiddenId: 'transactionPortfolio'}
  ];

  setups.forEach(({displayId, dropdownId, hiddenId}) => {
    const display = document.getElementById(displayId);
    const dropdown = document.getElementById(dropdownId);
    const hidden = document.getElementById(hiddenId);
    if (!display || !dropdown) return;

    display.addEventListener('click', (e) => {
      e.stopPropagation();
      const opened = dropdown.style.display === 'block';
      // close others
      document.querySelectorAll('.tools-crypto-dropdown').forEach(d => { if (d !== dropdown) d.style.display = 'none'; });
      dropdown.style.display = opened ? 'none' : 'block';
      display.setAttribute('aria-expanded', String(!opened));
    });

    // If dropdown items already exist, attach handlers; otherwise they'll be attached by populatePortfolioSelect for portfolio
    dropdown.querySelectorAll('.tools-crypto-item').forEach(item => {
      if (item.__tx_init) return;
      item.__tx_init = true;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const v = item.dataset.value || item.textContent.trim();
        if (hidden) hidden.value = v;
        const nameEl = item.querySelector('.tools-crypto-name');
        if (nameEl && display.querySelector('.tools-crypto-name')) display.querySelector('.tools-crypto-name').textContent = nameEl.textContent.trim();
        dropdown.style.display = 'none';
        display.setAttribute('aria-expanded', 'false');
      });
    });
  });

  // close on outside click
  document.addEventListener('click', (e) => {
    document.querySelectorAll('#transactionTypeDropdown, #transactionPortfolioDropdown').forEach(d => { if (d) d.style.display = 'none'; });
    document.querySelectorAll('#transactionTypeDisplay, #transactionPortfolioDisplay').forEach(d => { if (d) d.setAttribute('aria-expanded', 'false'); });
  });

  // escape closes
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') {
    document.querySelectorAll('#transactionTypeDropdown, #transactionPortfolioDropdown').forEach(d => { if (d) d.style.display = 'none'; });
  }});
}

// === АНАЛИТИКА ===
export const initAnalytics = async () => {
  window.initAnalytics = initAnalytics;
  showAnalyticsLoading();
  try {
    await getTransactions();
  } catch (_) {}
  await populateAnalyticsFilters();
  setupAnalyticsFilters();
  await renderAnalytics();
  hideAnalyticsLoading();
}

const showAnalyticsLoading = () => {
  const grid = document.querySelector('.charts-grid');
  if (grid && !document.querySelector('.analytics-loading-overlay')) {
    const overlay = document.createElement('div');
    overlay.className = 'analytics-loading-overlay';
    overlay.style.cssText = `
      position: relative;
      grid-column: 1/-1;
      padding: 3rem;
      text-align: center;
      background: linear-gradient(135deg, #f8fafc 0%, #e0e7ff 100%);
      border-radius: 12px;
      border: 1px solid #cbd5e1;
      margin-bottom: 2rem;
    `;
    overlay.innerHTML = `
      <div class="spinner" style="display: inline-block; width: 50px; height: 50px; border: 5px solid #e5e7eb; border-top: 5px solid #2563eb; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 1rem;"></div>
      <p style="margin-top: 1rem; color: #475569; font-size: 1.1rem; font-weight: 600;">Загрузка аналитики...</p>
      <p style="margin-top: 0.5rem; color: #94a3b8; font-size: 0.875rem;">Анализируем ваши транзакции и портфели</p>
      <style>
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      </style>
    `;
    grid.insertBefore(overlay, grid.firstChild);
    // Скрываем все карточки с графиками
    grid.querySelectorAll('.card').forEach(card => {
      card.style.display = 'none';
    });
  }
  const assetsBody = document.getElementById('assetsStatsBody');
  if (assetsBody) {
    assetsBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 2rem; color: #64748b;">
          <div style="display: inline-block; width: 30px; height: 30px; border: 3px solid #e5e7eb; border-top: 3px solid #2563eb; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 0.5rem;"></div>
          <div style="font-weight: 500;">Загрузка статистики активов...</div>
        </td>
      </tr>
    `;
  }
}

const hideAnalyticsLoading = () => {
  const overlay = document.querySelector('.analytics-loading-overlay');
  if (overlay) overlay.remove();
  // Показываем все карточки с графиками
  const grid = document.querySelector('.charts-grid');
  if (grid) {
    grid.querySelectorAll('.card').forEach(card => {
      card.style.display = 'block';
    });
  }
}

const populateAnalyticsFilters = async () => {
  const portfolios = getPortfoliosSync();
  const dropdown = document.getElementById('analyticsPortfolioDropdown');
  
  if (!dropdown) return;
  
  // Сохраняем опцию "Все портфели"
  const allOption = dropdown.querySelector('.custom-select-option[data-value=""]');
  dropdown.innerHTML = '';
  
  // Добавляем опцию "Все портфели" обратно
  if (allOption) {
    dropdown.appendChild(allOption);
  } else {
    const defaultOption = document.createElement('div');
    defaultOption.className = 'custom-select-option selected';
    defaultOption.setAttribute('data-value', '');
    defaultOption.innerHTML = `
      <i class="fas fa-layer-group"></i>
      <span>Все портфели</span>
    `;
    dropdown.appendChild(defaultOption);
  }
  
  // Добавляем портфели пользователя
  portfolios.forEach(portfolio => {
    const option = document.createElement('div');
    option.className = 'custom-select-option';
    option.setAttribute('data-value', portfolio.id);
    option.innerHTML = `
      <i class="fas fa-briefcase"></i>
      <span>${portfolio.name}</span>
    `;
    dropdown.appendChild(option);
  });
}

const setupChartPeriodTabs = () => {
  const chartsGrid = document.querySelector('.charts-grid');
  if (!chartsGrid || chartsGrid._chartTabsSetup) return;
  chartsGrid._chartTabsSetup = true;

  chartsGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.period-btn');
    if (!btn) return;
    const tabsEl = btn.closest('.chart-period-tabs');
    if (!tabsEl) return;

    tabsEl.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const chartId = tabsEl.dataset.chart;
    const data = window._analyticsData;
    if (!data) return;

    if (chartId === 'pnl') renderPnLChart(data.allReturns);
    else if (chartId === 'risk') renderRiskChart(data.allReturns, data.transactions);
    else if (chartId === 'volatility') renderVolatilityChart(data.holdings, data.historicalPrices);
  });
};

const setupAnalyticsFilters = () => {
  // Инициализация кастомного select для аналитики
  initAnalyticsCustomSelect('analyticsPortfolioDisplay', 'analyticsPortfolioDropdown', () => {
    renderAnalytics();
  });
  
  // Обработчик выбора периода для графика истории портфеля
  const periodSelect = document.getElementById('portfolioHistoryPeriod');
  if (periodSelect) {
    periodSelect.addEventListener('change', async () => {
      const transactions = getFilteredTransactions();
      if (!transactions.length) return;
      const period = periodSelect.value;
      const symbols = [...new Set(transactions.map(t => t.symbol))];

      // Загружаем актуальные рыночные цены (крипто + акции)
      try { await getPricesForSymbols(symbols); } catch (e) { /* ignore */ }

      // Для акций доподгружаем из Finnhub если нет в кэше
      const FINNHUB_TOKEN = 'd49lflpr01qlaebhu1egd49lflpr01qlaebhu1f0';
      const stockSymbols = symbols.filter(s => window.STOCK_INFO?.[s] && !(getPriceSync(s) > 0));
      await Promise.allSettled(stockSymbols.map(async sym => {
        try {
          const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FINNHUB_TOKEN}`);
          if (r.ok) {
            const d = await r.json();
            if (d?.c > 0) {
              if (!window.stocksRealData) window.stocksRealData = {};
              window.stocksRealData[sym] = { price: d.c, change: d.c - d.pc, changePercent: ((d.c - d.pc) / d.pc * 100) };
            }
          }
        } catch (_) {}
      }));

      let historicalPrices = {};
      try {
        if (typeof window.fetchHistoricalDailyPrices === 'function') {
          const firstDate = [...transactions]
            .sort((a, b) => new Date(a.created_at || a.date) - new Date(b.created_at || b.date))[0]
            ?.created_at?.slice(0, 10) || '2020-01-01';
          historicalPrices = await window.fetchHistoricalDailyPrices(symbols, firstDate);
        }
      } catch (_) {}

      // Пересобираем holdings с актуальными ценами
      const holdings = {};
      for (const t of transactions) {
        if (!holdings[t.symbol]) holdings[t.symbol] = { totalQty: 0, totalCost: 0, totalValue: 0, currentPrice: 0 };
        const qty = parseFloat(t.quantity) || 0;
        const price = parseFloat(t.price) || 0;
        if (t.type === 'BUY') { holdings[t.symbol].totalQty += qty; holdings[t.symbol].totalCost += qty * price; }
        else if (t.type === 'SELL') holdings[t.symbol].totalQty -= qty;
        holdings[t.symbol].currentPrice = price;
      }
      for (const sym in holdings) {
        const mkt = getPriceSync(sym);
        if (mkt) holdings[sym].currentPrice = mkt;
        holdings[sym].totalValue = holdings[sym].totalQty * holdings[sym].currentPrice;
      }

      const returns = calculateReturns(transactions, period, historicalPrices);
      const allReturns = calculateReturns(transactions, 'all', historicalPrices);

      // Обновляем глобальные данные (historical prices могли обновиться)
      window._analyticsData = { allReturns, transactions, holdings, historicalPrices };

      renderReturnChart(returns);
      renderRiskChart(allReturns, transactions);
      renderVolatilityChart(holdings, historicalPrices);
      renderPnLChart(allReturns);
    });
  }
}

// Функция инициализации кастомного select для аналитики
const initAnalyticsCustomSelect = (displayId, dropdownId, onChange) => {
  const display = document.getElementById(displayId);
  const dropdown = document.getElementById(dropdownId);
  
  if (!display || !dropdown) return;
  
  // Удаляем старые обработчики (клонируя элемент)
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
  
  // Используем делегирование событий для опций
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
}

const getFilteredTransactions = () => {
  let transactions = getTransactionsSync();
  
  // Получаем значение из кастомного dropdown
  const dropdown = document.getElementById('analyticsPortfolioDropdown');
  const selectedOption = dropdown?.querySelector('.custom-select-option.selected');
  const portfolioId = selectedOption?.getAttribute('data-value') || '';

  if (portfolioId) {
    transactions = transactions.filter(t => t.portfolio_id == portfolioId);
  }

  return transactions.sort((a, b) => new Date(a.date) - new Date(b.date));
}

const renderAnalytics = async () => {

  try {
    const transactions = getFilteredTransactions();
    
    if (transactions.length === 0) {

      
      // Скрываем canvas элементы и показываем сообщение
      const grid = document.querySelector('.charts-grid');
      if (grid) {
        // Скрываем все карточки с графиками
        grid.querySelectorAll('.card').forEach(card => {
          card.style.display = 'none';
        });
        
        // Проверяем, есть ли уже empty state
        let emptyState = grid.querySelector('.analytics-empty-state');
        if (!emptyState) {
          emptyState = document.createElement('div');
          emptyState.className = 'analytics-empty-state';
          emptyState.style.cssText = 'grid-column: 1/-1; padding: 3rem; text-align: center; background: linear-gradient(135deg, #f8fafc 0%, #fef3c7 100%); border-radius: 12px; border: 2px dashed #fbbf24; box-shadow: 0 4px 12px rgba(251, 191, 36, 0.1);';
          emptyState.innerHTML = `
            <div style="font-size: 3rem; margin-bottom: 1rem;"></div>
            <p style="margin-top: 0.5rem; color: #78716c; font-size: 1.25rem; font-weight: 600;">Нет данных для анализа</p>
            <p style="font-size: 0.95rem; color: #a8a29e; margin-top: 0.5rem;">Добавьте транзакции в портфель для получения детальной аналитики</p>
            <button onclick="document.getElementById('addTransactionBtn').click()" style="margin-top: 1.5rem; padding: 0.75rem 1.5rem; background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 8px rgba(251, 191, 36, 0.3); transition: all 0.3s ease;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 12px rgba(251, 191, 36, 0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 8px rgba(251, 191, 36, 0.3)'">
              <i class="fas fa-plus" style="margin-right: 0.5rem;"></i>Добавить транзакцию
            </button>
          `;
          grid.insertBefore(emptyState, grid.firstChild);
        } else {
          emptyState.style.display = 'block';
        }
      }
      
      // Очищаем метрики
      const els = {
        totalValue: document.getElementById('analyticsTotalValue'),
        pnl: document.getElementById('analyticsPnL'),
        roi: document.getElementById('analyticsROI'),
        assets: document.getElementById('analyticsAssets')
      };
      if (els.totalValue) els.totalValue.textContent = '$0.00';
      if (els.pnl) els.pnl.textContent = '$0.00';
      if (els.roi) els.roi.textContent = '0.00%';
      if (els.assets) els.assets.textContent = '0';
      
      // Очищаем детальную таблицу активов
      const assetsBody = document.getElementById('assetsStatsBody');
      if (assetsBody) assetsBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: #9ca3af; font-style: italic;">Нет активных позиций</td></tr>';
      return;
    }

    // Убираем empty state если есть данные
    const grid = document.querySelector('.charts-grid');
    const emptyState = grid?.querySelector('.analytics-empty-state');
    if (emptyState) {
      emptyState.style.display = 'none';
    }
    // Показываем все карточки с графиками
    if (grid) {
      grid.querySelectorAll('.card').forEach(card => {
        card.style.display = 'block';
      });
    }



    // Запрашиваем цены
    const symbols = [...new Set(transactions.map(t => t.symbol))];
    try {
      await getPricesForSymbols(symbols);
    } catch (_) {}

    // Дозагружаем цены акций из Finnhub если нет в кэше
    const FINNHUB_TOKEN = 'd49lflpr01qlaebhu1egd49lflpr01qlaebhu1f0';
    const stockSymbols = symbols.filter(s => window.STOCK_INFO?.[s] && !(getPriceSync(s) > 0));
    if (stockSymbols.length > 0) {
      await Promise.allSettled(stockSymbols.map(async sym => {
        try {
          const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FINNHUB_TOKEN}`);
          if (r.ok) {
            const d = await r.json();
            if (d?.c > 0) {
              if (!window.stocksRealData) window.stocksRealData = {};
              window.stocksRealData[sym] = {
                price: d.c,
                change: +(d.c - d.pc).toFixed(2),
                changePercent: +(((d.c - d.pc) / d.pc) * 100).toFixed(2)
              };
            }
          }
        } catch (_) {}
      }));
    }

    const periodSelect = document.getElementById('portfolioHistoryPeriod');
    const period = periodSelect?.value || 'all';

    // Загружаем исторические дневные цены с Binance для устранения плоских линий
    let historicalPrices = {};
    try {
      if (typeof window.fetchHistoricalDailyPrices === 'function' && transactions.length) {
        const firstDate = [...transactions]
          .sort((a, b) => new Date(a.created_at || a.date) - new Date(b.created_at || b.date))[0]
          ?.created_at?.slice(0, 10) || '2020-01-01';
        historicalPrices = await window.fetchHistoricalDailyPrices(symbols, firstDate);
      }
    } catch (_) {}

    const returns = calculateReturns(transactions, period, historicalPrices);
    const diversification = calculateDiversification(transactions);
    const risk = calculateRisk(transactions, historicalPrices);

    // Получаем holdings с актуальными рыночными ценами для графика волатильности
    const holdings = {};
    for (const t of transactions) {
      if (!holdings[t.symbol]) {
        holdings[t.symbol] = { totalQty: 0, totalCost: 0, totalValue: 0, currentPrice: 0 };
      }
      const qty = parseFloat(t.quantity) || 0;
      const price = parseFloat(t.price) || 0;
      if (t.type === 'BUY') {
        holdings[t.symbol].totalQty += qty;
        holdings[t.symbol].totalCost += qty * price;
      } else if (t.type === 'SELL') {
        holdings[t.symbol].totalQty -= qty;
      }
      holdings[t.symbol].currentPrice = price; // fallback: цена последней транзакции
    }

    // Подставляем актуальную рыночную цену вместо цены последней транзакции
    for (const symbol in holdings) {
      const h = holdings[symbol];
      const marketPrice = getPriceSync(symbol);
      if (marketPrice) h.currentPrice = marketPrice;
      h.totalValue = h.totalQty * h.currentPrice;
    }

    // allReturns — всё время (не зависит от основного периода), используется для кнопок периодов на отдельных графиках
    const allReturns = calculateReturns(transactions, 'all', historicalPrices);

    // Сохраняем данные для setupChartPeriodTabs при смене периода на отдельных графиках
    window._analyticsData = { allReturns, transactions, holdings, historicalPrices };

    renderReturnChart(returns);
    renderDiversificationChart(diversification);
    renderRiskChart(allReturns, transactions);
    renderVolatilityChart(holdings, historicalPrices);
    renderPnLChart(allReturns);
    renderTopAssetsChart(transactions);

    setupChartPeriodTabs();

    updateMetrics(allReturns, transactions);
    renderAssetsStats(transactions);

  } catch (err) {
    const grid = document.querySelector('.charts-grid');
    if (grid) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; padding: 2rem; text-align: center; background: #fee2e2; border-radius: 8px; border: 1px solid #fca5a5;">
          <p style="margin-top: 0.5rem; color: #dc2626;">Ошибка загрузки аналитики</p>
          <p style="font-size: 0.85rem; color: #991b1b;">${err.message}</p>
        </div>
      `;
    }
  }
}

const calculatePortfolioValue = (transactions) => {
  const holdings = {};
  transactions.forEach(t => {
    // Группируем только по символу
    const key = t.symbol;
    if (!holdings[key]) holdings[key] = { qty: 0, cost: 0, lastPrice: t.price };
    if (t.type === 'BUY') {
      holdings[key].qty += t.quantity;
      holdings[key].cost += t.quantity * t.price;
    } else {
      holdings[key].qty -= t.quantity;
      holdings[key].cost -= t.quantity * t.price;
    }
    holdings[key].lastPrice = t.price;
  });

  let total = 0;
  for (const key in holdings) {
    const symbol = key; // теперь key это уже symbol
    const price = getPriceSync(symbol) || holdings[key].lastPrice || 0;
    if (holdings[key].qty > 0) {
      total += holdings[key].qty * price;
    }
  }
  return total;
}

const calculateReturns = (transactions, period = 'all', historicalPrices = {}) => {
  // Сортируем транзакции по дате создания
  const sortedTx = [...transactions].sort((a, b) => 
    new Date(a.created_at || a.date) - new Date(b.created_at || b.date));

  if (sortedTx.length === 0) return [];

  // Строим снимки состояния на каждый день транзакций
  const dailySnapshots = [];
  let currentHoldings = {};
  let txPrices = {};

  const txByDate = {};
  sortedTx.forEach(tx => {
    const d = (tx.created_at || tx.date || '').slice(0, 10);
    if (!txByDate[d]) txByDate[d] = [];
    txByDate[d].push(tx);
  });

  Object.keys(txByDate).sort().forEach(dateStr => {
    txByDate[dateStr].forEach(tx => {
      const symbol = tx.symbol;
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

  // Заполняем каждый день от первой транзакции до сегодня
  const firstDate = new Date(dailySnapshots[0].dateStr + 'T00:00:00Z');
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const allPoints = [];
  let snapshotIdx = 0;
  let activeHoldings = {};
  let activePrices = {};

  for (let d = new Date(firstDate); d <= today; d.setUTCDate(d.getUTCDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);

    while (snapshotIdx < dailySnapshots.length && dailySnapshots[snapshotIdx].dateStr <= dateStr) {
      activeHoldings = { ...dailySnapshots[snapshotIdx].holdings };
      activePrices = { ...dailySnapshots[snapshotIdx].prices };
      snapshotIdx++;
    }

    const isToday = dateStr === today.toISOString().slice(0, 10);
    let value = 0;
    for (const [sym, qty] of Object.entries(activeHoldings)) {
      if (qty > 0) {
        // Приоритет: сегодняшняя цена → реальная историческая (Binance) → цена транзакции
        const price = (isToday ? getPriceSync(sym) : null)
          || historicalPrices[sym]?.[dateStr]
          || activePrices[sym] || 0;
        value += qty * price;
      }
    }

    if (value > 0 || allPoints.length > 0) {
      allPoints.push({
        date: new Date(d),
        dateStr: d.toLocaleDateString('ru-RU'),
        value
      });
    }
  }

  // Фильтруем по периоду
  const now = new Date();
  const cutoffMap = {
    '7d': new Date(now.getTime() - 7 * 86400000),
    '1m': new Date(now.getTime() - 30 * 86400000),
    '3m': new Date(now.getTime() - 90 * 86400000),
    '6m': new Date(now.getTime() - 180 * 86400000),
    '1y': new Date(now.getTime() - 365 * 86400000),
    'all': new Date(0)
  };
  const cutoff = cutoffMap[period] || new Date(0);

  let filtered = allPoints.filter(p => p.date >= cutoff);
  
  // Если выбран период и нет точек до него — добавляем последнюю известную точку как стартовую
  if (filtered.length <= 1 && allPoints.length > 0) {
    const lastBeforeCutoff = [...allPoints].reverse().find(p => p.date < cutoff);
    if (lastBeforeCutoff) {
      filtered = [
        { dateStr: cutoff.toLocaleDateString('ru-RU'), isoDate: cutoff.toISOString().slice(0, 10), date: cutoff, value: lastBeforeCutoff.value },
        ...filtered
      ];
    }
  }
  
  return filtered.map(p => ({
    date: p.dateStr,
    isoDate: p.isoDate || (p.date instanceof Date ? p.date.toISOString().slice(0, 10) : ''),
    value: p.value
  }));
}

const calculateDiversification = (transactions) => {
  const assets = {};
  transactions.forEach(t => {
    if (t.type === 'BUY') {
      if (!assets[t.symbol]) assets[t.symbol] = 0;
      assets[t.symbol] += t.quantity * t.price;
    }
  });
  const total = Object.values(assets).reduce((a, b) => a + b, 0);
  return Object.entries(assets).map(([symbol, value]) => ({
    label: symbol,
    value: (value / total) * 100
  }));
}

const calculateRisk = (transactions, historicalPrices = {}) => {
  const returns = calculateReturns(transactions, 'all', historicalPrices);
  const daily = returns.map((r, i) => i > 0 ? (r.value - returns[i-1].value) / returns[i-1].value : 0);
  const avg = daily.reduce((a, b) => a + b, 0) / daily.length;
  const variance = daily.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / daily.length;
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

const calculatePnL = (transactions) => {
  const monthly = {};
  transactions.forEach(t => {
    const month = new Date(t.date).toLocaleString('default', { month: 'short', year: 'numeric' });
    if (!monthly[month]) monthly[month] = { profit: 0, loss: 0 };
    const amount = t.quantity * t.price;
    if (t.type === 'BUY') monthly[month].loss += amount;
    else monthly[month].profit += amount;
  });
  return Object.entries(monthly).map(([month, data]) => ({
    month,
    profit: data.profit,
    loss: data.loss
  }));
}

// ── Helpers for per-chart period selectors ─────────────────────────────────
const getChartPeriod = (chartId) => {
  const btn = document.querySelector(`.chart-period-tabs[data-chart="${chartId}"] .period-btn.active`);
  return btn?.dataset.period || 'all';
};

const filterReturnsByPeriod = (allReturns, period) => {
  if (!period || period === 'all') return allReturns;
  const days = { '1m': 30, '3m': 90, '6m': 180, '1y': 365 }[period];
  if (!days) return allReturns;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return allReturns.filter(r => (r.isoDate || '') >= cutoff);
};

const filterHistoricalByPeriod = (historicalPrices, period) => {
  if (!period || period === 'all') return historicalPrices;
  const days = { '1m': 30, '3m': 90, '6m': 180, '1y': 365 }[period];
  if (!days) return historicalPrices;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const filtered = {};
  for (const [sym, prices] of Object.entries(historicalPrices)) {
    filtered[sym] = Object.fromEntries(Object.entries(prices).filter(([date]) => date >= cutoff));
  }
  return filtered;
};
// ───────────────────────────────────────────────────────────────────────────

const renderReturnChart = (returns) => {
  const ctx = document.getElementById('portfolioValueChart');
  if (!ctx) {

    return;
  }

  const labels = returns.map(r => r.date);
  const data = returns.map(r => r.value);

  if (analyticsCharts.return) analyticsCharts.return.destroy();
  analyticsCharts.return = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Стоимость портфеля',
        data,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
        fill: true,
        tension: 0.4
      }]
    },
    options: { responsive: true, scales: { y: { beginAtZero: false } } }
  });

  const totalReturn = data.length > 1 ? ((data[data.length-1] - data[0]) / data[0] * 100).toFixed(2) : 0;
  const el = document.getElementById('analyticsROI');
  if (el) {
    el.textContent = (totalReturn >= 0 ? '+' : '') + totalReturn + '%';
    el.className = 'stat-value ' + (totalReturn >= 0 ? 'positive' : 'negative');
  }
}

const renderDiversificationChart = (data) => {
  const ctx = document.getElementById('assetTypeChart');
  if (!ctx || data.length === 0) {

    return;
  }

  if (analyticsCharts.diversification) analyticsCharts.diversification.destroy();
  analyticsCharts.diversification = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: data.map(d => d.label),
      datasets: [{ 
        data: data.map(d => d.value), 
        backgroundColor: ['#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'] 
      }]
    },
    options: { 
      responsive: true,
      plugins: {
        legend: { position: 'bottom' }
      }
    }
  });
}

const renderRiskChart = (allReturns = [], transactions = []) => {
  const ctx = document.getElementById('riskProfileChart');
  if (!ctx) {

    return;
  }

  if (analyticsCharts.risk) analyticsCharts.risk.destroy();

  // Применяем период этого графика
  const chartPeriod = getChartPeriod('risk');
  const returns = filterReturnsByPeriod(allReturns, chartPeriod);

  // Вычисляем волатильность из отфильтрованных данных
  // Фильтруем нулевые дни (дни без исторических цен дают 0 — искажают std)
  const allDailyR = [];
  let volatility = 0;
  if (returns.length > 1) {
    for (let i = 1; i < returns.length; i++) {
      if (returns[i - 1].value > 0) allDailyR.push((returns[i].value - returns[i - 1].value) / returns[i - 1].value);
    }
    const dailyReturnsNonZero = allDailyR.filter(r => r !== 0);
    if (dailyReturnsNonZero.length > 0) {
      const avg = dailyReturnsNonZero.reduce((s, v) => s + v, 0) / dailyReturnsNonZero.length;
      const variance = dailyReturnsNonZero.reduce((s, v) => s + (v - avg) ** 2, 0) / dailyReturnsNonZero.length;
      volatility = Math.sqrt(variance) * Math.sqrt(252) * 100;
    }
  }
  const dailyReturns = allDailyR.filter(r => r !== 0);

  // Максимальная просадка из временного ряда портфеля
  let maxDrawdown = 0;
  if (returns.length > 1) {
    let peak = returns[0].value;
    for (const r of returns) {
      if (r.value > peak) peak = r.value;
      const dd = peak > 0 ? ((peak - r.value) / peak) * 100 : 0;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }
  }

  // Sharpe Ratio: annualized, с безрисковой ставкой 4% и фильтрацией нулевых дней
  let sharpeRatio = 0;
  if (dailyReturns.length > 1) {
    const avg = dailyReturns.reduce((s, v) => s + v, 0) / dailyReturns.length;
    const std = Math.sqrt(dailyReturns.reduce((s, v) => s + (v - avg) ** 2, 0) / dailyReturns.length);
    const riskFreeDaily = 0.04 / 252;
    if (std > 0) sharpeRatio = ((avg - riskFreeDaily) * Math.sqrt(252)) / std;
  }

  // Концентрация: максимальная доля одного актива по текущей рыночной стоимости
  const assetValue = {};
  const assetQty = {};
  transactions.forEach(t => {
    const qty = parseFloat(t.quantity) || 0;
    if (!assetQty[t.symbol]) assetQty[t.symbol] = 0;
    if (t.type === 'BUY') assetQty[t.symbol] += qty;
    else if (t.type === 'SELL') assetQty[t.symbol] -= qty;
  });
  let totalCurrentValue = 0;
  for (const [sym, qty] of Object.entries(assetQty)) {
    if (qty > 0) {
      const price = getPriceSync(sym) || 0;
      const val = qty * price;
      assetValue[sym] = val;
      totalCurrentValue += val;
    }
  }
  // Если нет рыночных цен — fallback по объёму покупок
  let maxConc = 0;
  if (totalCurrentValue > 0) {
    maxConc = Math.max(...Object.values(assetValue).map(v => (v / totalCurrentValue) * 100));
  } else {
    const assetBuy = {};
    let totalBuy = 0;
    transactions.forEach(t => {
      if (t.type === 'BUY') {
        const v = (parseFloat(t.quantity) || 0) * (parseFloat(t.price) || 0);
        assetBuy[t.symbol] = (assetBuy[t.symbol] || 0) + v;
        totalBuy += v;
      }
    });
    if (totalBuy > 0) maxConc = Math.max(...Object.values(assetBuy).map(v => (v / totalBuy) * 100));
  }

  const volClamped = Math.min(volatility, 100);
  const ddClamped = Math.min(maxDrawdown, 100);
  const concClamped = Math.min(maxConc, 100);

  const riskLevel = volatility < 15 ? 'Низкий' : volatility < 30 ? 'Средний' : volatility < 60 ? 'Высокий' : 'Очень высокий';
  const riskColor = volatility < 15 ? '#10b981' : volatility < 30 ? '#f59e0b' : volatility < 60 ? '#ef4444' : '#dc2626';

  const labels = ['Волатильность (год.)', 'Макс. просадка', 'Концентрация (топ)'];
  const values = [+volClamped.toFixed(1), +ddClamped.toFixed(1), +concClamped.toFixed(1)];
  const colors = [
    volClamped < 20 ? '#10b981' : volClamped < 50 ? '#f59e0b' : '#ef4444',
    ddClamped < 10 ? '#10b981' : ddClamped < 30 ? '#f59e0b' : '#ef4444',
    concClamped < 40 ? '#10b981' : concClamped < 70 ? '#f59e0b' : '#ef4444',
  ];

  analyticsCharts.risk = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors.map(c => c + 'bb'),
        borderColor: colors,
        borderWidth: 2,
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: `Уровень риска: ${riskLevel}   |   Sharpe: ${sharpeRatio.toFixed(2)}`,
          color: riskColor,
          font: { size: 12, weight: '600' },
          padding: { bottom: 10 }
        },
        tooltip: {
          callbacks: {
            label: ctx => ctx.parsed.x.toFixed(1) + '%'
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          max: 100,
          ticks: { color: '#94a3b8', callback: v => v + '%' },
          grid: { color: 'rgba(255,255,255,0.06)' }
        },
        y: {
          ticks: { color: '#94a3b8' },
          grid: { display: false }
        }
      }
    }
  });
}

const renderVolatilityChart = (holdings, historicalPrices = {}) => {
  const ctx = document.getElementById('volatilityChart');
  if (!ctx) {

    return;
  }

  if (analyticsCharts.volatility) analyticsCharts.volatility.destroy();

  // Фильтруем исторические цены по периоду этого графика
  const chartPeriod = getChartPeriod('volatility');
  const filteredHistoricalPrices = filterHistoricalByPeriod(historicalPrices, chartPeriod);

  // Только активы с положительным остатком, топ-10 по текущей стоимости
  const topAssets = Object.entries(holdings)
    .filter(([, h]) => h.totalQty > 0 && h.totalValue > 0)
    .sort((a, b) => b[1].totalValue - a[1].totalValue)
    .slice(0, 10);

  if (topAssets.length === 0) return;

  const results = topAssets.map(([symbol, h]) => {
    // Приоритет 1: историческая волатильность — annualized stddev дневных доходностей
    const prices = filteredHistoricalPrices[symbol];
    if (prices) {
      const dates = Object.keys(prices).sort();
      if (dates.length >= 5) {
        const dailyReturns = [];
        for (let i = 1; i < dates.length; i++) {
          const prev = prices[dates[i - 1]];
          const curr = prices[dates[i]];
          if (prev > 0) dailyReturns.push((curr - prev) / prev);
        }
        if (dailyReturns.length >= 4) {
          const n = dailyReturns.length;
          const mean = dailyReturns.reduce((s, r) => s + r, 0) / n;
          const variance = dailyReturns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / n;
          const vol = Math.sqrt(variance) * Math.sqrt(252) * 100;
          return { symbol, value: +vol.toFixed(1), mode: 'historic' };
        }
      }
    }

    // Приоритет 2: P&L% от средней цены покупки до текущей рыночной цены
    const avgBuy = h.totalQty > 0 ? h.totalCost / h.totalQty : 0;
    const curr = h.currentPrice || avgBuy;
    const pnlPct = avgBuy > 0 ? ((curr - avgBuy) / avgBuy) * 100 : 0;
    return { symbol, value: +pnlPct.toFixed(1), mode: 'pnl' };
  });

  const allHistoric = results.every(r => r.mode === 'historic');
  const chartTitle = allHistoric
    ? 'Историческая волатильность (год.)'
    : 'P&L от средней цены покупки';

  analyticsCharts.volatility = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: results.map(r => r.symbol),
      datasets: [{
        label: chartTitle,
        data: results.map(r => r.value),
        backgroundColor: results.map(r => {
          if (r.mode === 'historic') {
            return r.value > 80 ? 'rgba(239,68,68,0.8)' : r.value > 40 ? 'rgba(245,158,11,0.8)' : 'rgba(16,185,129,0.8)';
          }
          return r.value >= 0 ? 'rgba(16,185,129,0.8)' : 'rgba(239,68,68,0.8)';
        }),
        borderColor: results.map(r => {
          if (r.mode === 'historic') {
            return r.value > 80 ? '#ef4444' : r.value > 40 ? '#f59e0b' : '#10b981';
          }
          return r.value >= 0 ? '#10b981' : '#ef4444';
        }),
        borderWidth: 2,
        borderRadius: 4,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: chartTitle,
          color: '#94a3b8',
          font: { size: 11 }
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const r = results[ctx.dataIndex];
              const sign = (r.mode === 'pnl' && r.value > 0) ? '+' : '';
              return (r.mode === 'historic' ? 'Волат.: ' : 'P&L: ') + sign + ctx.parsed.y.toFixed(1) + '%';
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: false,
          ticks: {
            color: '#94a3b8',
            callback: v => (v > 0 ? '+' : '') + v + '%'
          },
          grid: { color: 'rgba(255,255,255,0.06)' }
        },
        x: {
          ticks: { color: '#94a3b8' },
          grid: { display: false }
        }
      }
    }
  });
}

const renderPnLChart = (allReturns) => {
  const ctx = document.getElementById('monthlyReturnsChart');
  if (!ctx) {

    return;
  }

  if (analyticsCharts.pnl) analyticsCharts.pnl.destroy();

  // Применяем период этого графика
  const chartPeriod = getChartPeriod('pnl');
  const portfolioReturns = filterReturnsByPeriod(allReturns, chartPeriod);

  if (!portfolioReturns || portfolioReturns.length < 2) {
    ctx.parentElement.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:2rem">Недостаточно данных для анализа</p>';
    return;
  }

  // Транзакции для исключения эффекта новых вложений (Modified Dietz)
  const transactions = window._analyticsData?.transactions || [];
  // Суммируем чистые вложения по месяцам (YYYY-MM)
  const netFlowByMonth = {};
  transactions.forEach(tx => {
    const m = (tx.created_at || tx.date || '').slice(0, 7); // YYYY-MM
    if (!m) return;
    const amount = (parseFloat(tx.quantity) || 0) * (parseFloat(tx.price) || 0);
    netFlowByMonth[m] = (netFlowByMonth[m] || 0) + (tx.type === 'BUY' ? amount : tx.type === 'SELL' ? -amount : 0);
  });

  // Группируем по месяцам: берём первое и последнее значение портфеля за каждый месяц
  const byMonth = {};
  portfolioReturns.forEach(r => {
    // r.date = "dd.mm.yyyy" (toLocaleDateString('ru-RU'))
    const parts = r.date.split('.');
    if (parts.length !== 3) return;
    const key = `${parts[1]}.${parts[2]}`; // MM.YYYY
    if (!byMonth[key]) byMonth[key] = { first: r.value, last: r.value };
    else byMonth[key].last = r.value;
  });

  const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
  const monthly = Object.entries(byMonth)
    .sort(([a], [b]) => {
      const [am, ay] = a.split('.');
      const [bm, by] = b.split('.');
      return new Date(+ay, +am - 1) - new Date(+by, +bm - 1);
    })
    .map(([key, d]) => {
      const [mm, yy] = key.split('.');
      // Modified Dietz: исключаем новые вложения из доходности
      // Предполагаем вложения происходят в середине месяца (вес 0.5)
      const isoMonth = `${yy}-${mm}`;
      const flow = netFlowByMonth[isoMonth] || 0;
      const buyFlow = Math.max(flow, 0); // только покупки увеличивают базу
      const denominator = d.first + 0.5 * buyFlow;
      const ret = denominator > 0 ? ((d.last - d.first - flow) / denominator) * 100 : 0;
      return { label: `${monthNames[+mm - 1]} '${yy.slice(2)}`, ret: +ret.toFixed(2) };
    })
    .filter(d => isFinite(d.ret));

  analyticsCharts.pnl = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: monthly.map(d => d.label),
      datasets: [{
        label: 'Доходность %',
        data: monthly.map(d => d.ret),
        backgroundColor: monthly.map(d => d.ret >= 0 ? 'rgba(16,185,129,0.8)' : 'rgba(239,68,68,0.75)'),
        borderColor: monthly.map(d => d.ret >= 0 ? '#10b981' : '#ef4444'),
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => (ctx.parsed.y >= 0 ? '+' : '') + ctx.parsed.y.toFixed(2) + '%'
          }
        }
      },
      scales: {
        y: {
          beginAtZero: false,
          ticks: {
            color: '#94a3b8',
            callback: v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%'
          },
          grid: { color: 'rgba(255,255,255,0.06)' }
        },
        x: {
          ticks: { color: '#94a3b8', maxRotation: 45 },
          grid: { display: false }
        }
      }
    }
  });
}

const renderTopAssetsChart = (transactions) => {
  const ctx = document.getElementById('topAssetsChart');
  if (!ctx) {

    return;
  }

  // Группируем транзакции по активам и считаем текущую стоимость
  const holdings = {};
  transactions.forEach(t => {
    if (!holdings[t.symbol]) {
      holdings[t.symbol] = { qty: 0, cost: 0 };
    }
    if (t.type === 'BUY') {
      holdings[t.symbol].qty += t.quantity;
      holdings[t.symbol].cost += t.quantity * t.price;
    } else if (t.type === 'SELL') {
      holdings[t.symbol].qty -= t.quantity;
    }
  });

  // Вычисляем текущую стоимость каждого актива
  const assets = Object.entries(holdings)
    .filter(([symbol, h]) => h.qty > 0)
    .map(([symbol, h]) => {
      const currentPrice = getPriceSync(symbol);
      const value = currentPrice ? h.qty * currentPrice : 0;
      return { symbol, value };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 10); // Топ-10 активов

  if (analyticsCharts.topAssets) analyticsCharts.topAssets.destroy();
  
  analyticsCharts.topAssets = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: assets.map(a => a.symbol),
      datasets: [{
        label: 'Стоимость ($)',
        data: assets.map(a => a.value),
        backgroundColor: assets.map((_, i) => {
          const colors = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#14b8a6', '#a855f7'];
          return colors[i % colors.length];
        }),
        borderRadius: 8
      }]
    },
    options: { 
      responsive: true,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              return '$' + context.parsed.x.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return '$' + value.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
            }
          }
        }
      }
    }
  });
}

const updateMetrics = (returns, transactions) => {

  try {
    // Считаем дневные доходности только по дням с реальным изменением цены.
    // Дни без исторических данных дают нулевое изменение — они искусственно
    // занижают среднее и завышают std, что делает Sharpe некорректным.
    const allDailyReturns = returns.slice(1).map((r, i) => (r.value - returns[i].value) / returns[i].value);
    const dailyReturns = allDailyReturns.filter(r => r !== 0);
    const avg = dailyReturns.length > 0 ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length : 0;
    const std = dailyReturns.length > 1
      ? Math.sqrt(dailyReturns.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / dailyReturns.length)
      : 0;
    // Стандартная annualized Sharpe (безрисковая ставка ~4% годовых = 0.04/252 в день)
    const riskFreeDaily = 0.04 / 252;
    const sharpe = std > 0 ? ((avg - riskFreeDaily) * Math.sqrt(252)) / std : 0;

    // Рассчитываем портфель с использованием реальных цен
    const holdings = {};
    let totalBuyAmount = 0;    // суммарные вложения (все BUY)
    let totalSellProceeds = 0; // суммарная выручка от продаж (все SELL)
    
    transactions.forEach(t => {
      // Группируем только по символу, без portfolio_id
      const key = t.symbol;
      if (!holdings[key]) holdings[key] = { qty: 0, cost: 0, lastPrice: t.price };
      if (t.type === 'BUY') {
        holdings[key].qty += t.quantity;
        holdings[key].cost += t.quantity * t.price;
        totalBuyAmount += t.quantity * t.price;
      } else {
        // При продаже уменьшаем базу затрат по средней цене покупки
        const avgBuyPrice = holdings[key].qty > 0 ? holdings[key].cost / holdings[key].qty : t.price;
        holdings[key].cost -= t.quantity * avgBuyPrice;
        holdings[key].qty -= t.quantity;
        totalSellProceeds += t.quantity * t.price;
      }
      holdings[key].lastPrice = t.price;
    });

    // Считаем текущую рыночную стоимость удерживаемых активов
    let totalValue = 0;
    for (const key in holdings) {
      const price = getPriceSync(key) || holdings[key].lastPrice || 0;
      if (holdings[key].qty > 0) {
        totalValue += holdings[key].qty * price;
      }
    }
    
    // PnL = (рыночная стоимость + реализованная выручка) - общие вложения
    const pnl = (totalValue + totalSellProceeds) - totalBuyAmount;
    const totalCost = totalBuyAmount; // для совместимости с остальным кодом
    const roi = totalBuyAmount > 0 ? (pnl / totalBuyAmount * 100).toFixed(2) : 0;
    const assetCount = Object.keys(holdings).filter(k => holdings[k].qty > 0).length;

    // Win rate: доля прибыльных продаж (цена продажи > средняя цена покупки)
    const winHoldings = {};
    let wins = 0;
    let totalSells = 0;
    for (const t of transactions) {
      const key = t.symbol;
      if (!winHoldings[key]) winHoldings[key] = { qty: 0, cost: 0 };
      if (t.type === 'BUY') {
        winHoldings[key].qty += t.quantity;
        winHoldings[key].cost += t.quantity * t.price;
      } else if (t.type === 'SELL') {
        const avgBuyPrice = winHoldings[key].qty > 0 ? winHoldings[key].cost / winHoldings[key].qty : 0;
        if (avgBuyPrice > 0 && t.price > avgBuyPrice) wins++;
        // Уменьшаем базу затрат по средней цене покупки
        winHoldings[key].cost -= t.quantity * (avgBuyPrice || t.price);
        winHoldings[key].qty -= t.quantity;
        totalSells++;
      }
    }
    const winRate = totalSells > 0 ? Math.round((wins / totalSells) * 100) : 0;

    // Обновляем элементы
    const currencySymbol = getCurrencySymbol();
    const totalValueEl = document.getElementById('analyticsTotalValue');
    if (totalValueEl) totalValueEl.textContent = currencySymbol + convertToSelectedCurrency(totalValue).toLocaleString('ru-RU', {maximumFractionDigits: 2});

    const pnlEl = document.getElementById('analyticsPnL');
    if (pnlEl) {
      const convertedPnL = convertToSelectedCurrency(pnl);
      pnlEl.textContent = (convertedPnL >= 0 ? '+' : '') + currencySymbol + Math.abs(convertedPnL).toLocaleString('ru-RU', {maximumFractionDigits: 2});
      pnlEl.parentElement.className = 'stat-info ' + (convertedPnL >= 0 ? 'positive' : 'negative');
    }

    const roiEl = document.getElementById('analyticsROI');
    if (roiEl) {
      roiEl.textContent = (roi >= 0 ? '+' : '') + roi + '%';
      roiEl.className = 'stat-value ' + (roi >= 0 ? 'positive' : 'negative');
    }

    const assetsEl = document.getElementById('analyticsAssets');
    if (assetsEl) assetsEl.textContent = assetCount;
    
    // Обновляем Sharpe Ratio
    const sharpeEl = document.getElementById('analyticsSharpe');
    const sharpeLabelEl = document.getElementById('analyticsSharpeLabel');
    if (sharpeEl) {
      sharpeEl.textContent = sharpe.toFixed(2);
      if (sharpeLabelEl) {
        if (sharpe > 2) {
          sharpeLabelEl.innerHTML = '<i class="fas fa-check-circle"></i> Отличное соотношение';
          sharpeLabelEl.style.color = '#10b981';
        } else if (sharpe > 1) {
          sharpeLabelEl.innerHTML = '<i class="fas fa-thumbs-up"></i> Хорошее соотношение';
          sharpeLabelEl.style.color = '#fbbf24';
        } else if (sharpe > 0) {
          sharpeLabelEl.innerHTML = '<i class="fas fa-minus-circle"></i> Умеренное соотношение';
          sharpeLabelEl.style.color = '#f97316';
        } else {
          sharpeLabelEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> Низкое соотношение';
          sharpeLabelEl.style.color = '#ef4444';
        }
      }
    }
    
    // Рассчитываем диверсификацию (индекс Херфиндаля-Хиршмана)
    let diversificationIndex = 0;
    if (totalValue > 0) {
      const assetValues = Object.entries(holdings)
        .filter(([k, h]) => h.qty > 0)
        .map(([symbol, h]) => {
          const price = getPriceSync(symbol) || h.lastPrice || 0;
          return (h.qty * price) / totalValue;
        });
      
      // HHI: сумма квадратов долей (чем ближе к 0, тем лучше диверсификация)
      const hhi = assetValues.reduce((sum, share) => sum + share * share, 0);
      diversificationIndex = Math.round((1 - hhi) * 100);
    }
    
    const divEl = document.getElementById('analyticsDiversification');
    const divLabelEl = document.getElementById('analyticsDivLabel');
    if (divEl) {
      divEl.textContent = diversificationIndex + '%';
      if (divLabelEl) {
        if (diversificationIndex > 70) {
          divLabelEl.innerHTML = '<i class="fas fa-star"></i> Отлично распределен';
          divLabelEl.style.color = '#10b981';
        } else if (diversificationIndex > 50) {
          divLabelEl.innerHTML = '<i class="fas fa-chart-pie"></i> Хорошо распределен';
          divLabelEl.style.color = '#fbbf24';
        } else if (diversificationIndex > 30) {
          divLabelEl.innerHTML = '<i class="fas fa-adjust"></i> Средняя диверсификация';
          divLabelEl.style.color = '#f97316';
        } else {
          divLabelEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Низкая диверсификация';
          divLabelEl.style.color = '#ef4444';
        }
      }
    }
    
    // Генерируем автоматические рекомендации
    generateRecommendations({ 
      sharpe, 
      diversificationIndex, 
      roi: parseFloat(roi), 
      assetCount, 
      totalValue, 
      pnl,
      holdings 
    });
    

  } catch (err) {

  }
}

// Функция генерации автоматических рекомендаций
const generateRecommendations = (metrics) => {
  const { sharpe, diversificationIndex, roi, assetCount, totalValue, pnl, holdings } = metrics;
  const recommendations = [];
  
  // Рекомендация по диверсификации
  if (diversificationIndex < 30) {
    const lowDivText = assetCount >= 5
      ? `Ваш портфель содержит ${assetCount} активов, однако один или несколько доминируют (индекс диверсификации ${diversificationIndex}%). Рекомендуем ребалансировать портфель, снизив концентрацию в крупнейших позициях.`
      : `Ваш портфель содержит ${assetCount} активов с индексом диверсификации ${diversificationIndex}%. Рекомендуем увеличить количество активов до 5-10 для снижения рисков.`;
    recommendations.push({
      icon: 'fas fa-layer-group',
      color: '#ef4444',
      title: 'Низкая диверсификация портфеля',
      text: lowDivText,
      action: assetCount >= 5 ? 'Ребалансировать портфель' : 'Добавить новые активы',
      priority: 'high'
    });
  } else if (diversificationIndex < 50) {
    recommendations.push({
      icon: 'fas fa-chart-pie',
      color: '#f97316',
      title: 'Средняя диверсификация портфеля',
      text: `Индекс диверсификации ${diversificationIndex}%. Можно улучшить распределение активов для оптимального баланса риск/доходность.`,
      action: 'Оптимизировать распределение',
      priority: 'medium'
    });
  }
  
  // Рекомендация по Sharpe Ratio
  if (sharpe < 0) {
    recommendations.push({
      icon: 'fas fa-chart-line',
      color: '#ef4444',
      title: 'Отрицательный Sharpe Ratio',
      text: `Ваш Sharpe Ratio: ${sharpe.toFixed(2)}. Портфель теряет в стоимости с учётом принятого риска. Пересмотрите состав активов или снизьте долю убыточных позиций.`,
      action: 'Пересмотреть стратегию',
      priority: 'high'
    });
  } else if (sharpe < 1 && sharpe > 0) {
    recommendations.push({
      icon: 'fas fa-chart-line',
      color: '#f97316',
      title: 'Низкий показатель Sharpe Ratio',
      text: `Ваш Sharpe Ratio: ${sharpe.toFixed(2)}. Это означает, что риск не полностью компенсируется доходностью. Рассмотрите более стабильные активы.`,
      action: 'Пересмотреть стратегию',
      priority: 'medium'
    });
  }
  
  // Рекомендация по убыточным активам
  if (holdings) {
    const losers = Object.entries(holdings)
      .filter(([symbol, h]) => {
        if (h.qty <= 0) return false;
        const price = getPriceSync(symbol) || h.lastPrice || 0;
        const currentValue = h.qty * price;
        const pnl = currentValue - h.cost;
        return pnl < 0 && Math.abs(pnl / h.cost) > 0.2; // убыток более 20%
      });
    
    if (losers.length > 0) {
      recommendations.push({
        icon: 'fas fa-exclamation-triangle',
        color: '#ef4444',
        title: `Обнаружено ${losers.length} убыточных активов`,
        text: `${losers.map(([s]) => s).join(', ')} показывают убыток более 20%. Рассмотрите возможность стоп-лосса или ребалансировки.`,
        action: 'Проверить активы',
        priority: 'high'
      });
    }
  }
  
  // Рекомендация по концентрации в одном активе
  if (holdings && totalValue > 0) {
    const concentrations = Object.entries(holdings)
      .filter(([k, h]) => h.qty > 0)
      .map(([symbol, h]) => {
        const price = getPriceSync(symbol) || h.lastPrice || 0;
        const value = h.qty * price;
        return { symbol, share: (value / totalValue) * 100 };
      })
      .filter(a => a.share > 40);
    
    if (concentrations.length > 0) {
      recommendations.push({
        icon: 'fas fa-balance-scale',
        color: '#f97316',
        title: 'Высокая концентрация в отдельных активах',
        text: `${concentrations.map(c => `${c.symbol} (${c.share.toFixed(0)}%)`).join(', ')} занимают более 40% портфеля. Это увеличивает риски.`,
        action: 'Ребалансировать портфель',
        priority: 'medium'
    });
    }
  }
  
  // Положительные рекомендации
  if (roi > 15 && sharpe > 1.5) {
    recommendations.push({
      icon: 'fas fa-trophy',
      color: '#10b981',
      title: 'Отличные показатели портфеля!',
      text: `ROI ${roi.toFixed(1)}% и Sharpe Ratio ${sharpe.toFixed(2)} - ваш портфель показывает отличные результаты. Продолжайте следить за диверсификацией.`,
      action: 'Продолжить стратегию',
      priority: 'info'
    });
  }
  
  // Рекомендация по количеству активов
  if (assetCount < 3) {
    recommendations.push({
      icon: 'fas fa-coins',
      color: '#ef4444',
      title: 'Слишком мало активов в портфеле',
      text: `В портфеле всего ${assetCount} активов. Для эффективной диверсификации рекомендуется иметь минимум 5-7 различных активов.`,
      action: 'Добавить активы',
      priority: 'high'
    });
  }
  
  // Отображаем рекомендации
  const container = document.getElementById('analyticsRecommendations');
  const body = document.getElementById('recommendationsBody');
  
  if (!container || !body) return;
  
  if (recommendations.length === 0) {
    container.style.display = 'none';
    return;
  }
  
  container.style.display = 'block';
  
  // Сортируем по приоритету
  const priorityOrder = { 'high': 0, 'medium': 1, 'info': 2 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  
  body.innerHTML = `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; align-items: stretch;">` +
  recommendations.map((rec, idx) => `
    <div class="recommendation-card" data-priority="${rec.priority}" style="padding: 1.25rem; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 12px; border-left: 4px solid ${rec.color}; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2); display: flex; flex-direction: column;">
      <div class="recommendation-content" style="display: flex; align-items: flex-start; gap: 1rem; flex: 1;">
        <div class="recommendation-icon" style="flex-shrink: 0; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; background: ${rec.color}20; border-radius: 10px;">
          <i class="${rec.icon}" style="font-size: 1.5rem; color: ${rec.color};"></i>
        </div>
        <div class="recommendation-text" style="flex: 1; display: flex; flex-direction: column;">
          <h4 class="recommendation-title" style="margin: 0 0 0.5rem 0; color: #f1f5f9; font-size: 1.05rem; font-weight: 600;">${rec.title}</h4>
          <p class="recommendation-description" style="margin: 0 0 1rem 0; color: #cbd5e1; font-size: 0.9rem; line-height: 1.6; flex: 1;">${rec.text}</p>
          <button class="rec-action-btn" data-action="${rec.action}" data-index="${idx}" style="padding: 0.6rem 1.2rem; font-size: 0.875rem; background: linear-gradient(135deg, ${rec.color} 0%, ${rec.color}dd 100%); border: none; color: white; border-radius: 8px; cursor: pointer; font-weight: 500; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2); align-self: flex-start;">
            <i class="fas fa-arrow-right" style="margin-right: 0.5rem;"></i>${rec.action}
          </button>
        </div>
      </div>
    </div>
  `).join('') + `</div>`;
  
  // Добавляем обработчики для кнопок
  document.querySelectorAll('.rec-action-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const action = this.getAttribute('data-action');
      const rec = recommendations[parseInt(this.getAttribute('data-index'))];
      handleRecommendationAction(action, rec);
    });
    
    // Hover эффект
    btn.addEventListener('mouseenter', function() {
      this.style.transform = 'translateY(-2px)';
      this.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
    });
    btn.addEventListener('mouseleave', function() {
      this.style.transform = 'translateY(0)';
      this.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.2)';
    });
  });
}

// === ОБРАБОТЧИК ДЕЙСТВИЙ ДЛЯ РЕКОМЕНДАЦИЙ ===
const handleRecommendationAction = (action, recommendation) => {

  
  switch(action) {
    case 'Проверить активы':
      // Переходим в раздел аналитики и фокусируемся на таблице убыточных активов
      showNotification('info', 'Просмотрите таблицу детальной статистики ниже для анализа убыточных активов');
      const assetsTable = document.querySelector('.assets-table-wrapper');
      if (assetsTable) {
        assetsTable.scrollIntoView({ behavior: 'smooth', block: 'center' });
        assetsTable.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.4)';
        setTimeout(() => {
          assetsTable.style.boxShadow = '';
        }, 2000);
      }
      break;
      
    case 'Ребалансировать портфель':
      // Показываем модальное окно с предложениями по ребалансировке
      showRebalanceModal();
      break;
      
    case 'Добавить новые активы':
    case 'Добавить активы':
      // Переходим в раздел рынка для выбора новых активов
      showNotification('success', 'Переходим в раздел рынка для добавления новых активов');
      setTimeout(() => {
        document.querySelector('[href="#market"]')?.click();
      }, 500);
      break;
      
    case 'Оптимизировать распределение':
      // Показываем анализ текущего распределения с рекомендациями
      showOptimizationModal();
      break;
      
    case 'Пересмотреть стратегию':
      // Показываем советы по улучшению стратегии
      showStrategyModal();
      break;
      
    case 'Продолжить стратегию':
      showNotification('success', 'Ваша стратегия работает отлично! Продолжайте в том же духе.');
      break;
      
    default:
      showNotification('info', `Действие: ${action}`);
  }
}

// === МОДАЛЬНОЕ ОКНО РЕБАЛАНСИРОВКИ ===
const showRebalanceModal = () => {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay-news';
  modal.style.display = 'flex';
  modal.style.zIndex = '10000';
  
  modal.innerHTML = `
    <div class="modal-container-news" style="max-width: 700px;">
      <div class="modal-header-news">
        <h3><i class="fas fa-balance-scale"></i> Рекомендации по ребалансировке</h3>
        <button class="modal-close-news" onclick="this.closest('.modal-overlay-news').remove()">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>
      <div class="modal-body-news" style="max-height: 70vh; overflow-y: auto;">
        <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem;">
          <h4 style="color: #f1f5f9; margin: 0 0 1rem 0;"><i class="fas fa-chart-pie" style="color: #10b981;"></i> Оптимальное распределение</h4>
          <div style="display: grid; gap: 1rem;">
            <div style="display: flex; justify-content: space-between; padding: 0.75rem; background: rgba(255, 255, 255, 0.05); border-radius: 8px;">
              <span style="color: #cbd5e1;">Крупные активы (BTC, ETH):</span>
              <span style="color: #10b981; font-weight: 600;">40-50%</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 0.75rem; background: rgba(255, 255, 255, 0.05); border-radius: 8px;">
              <span style="color: #cbd5e1;">Средние активы (Top 20):</span>
              <span style="color: #fbbf24; font-weight: 600;">30-40%</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 0.75rem; background: rgba(255, 255, 255, 0.05); border-radius: 8px;">
              <span style="color: #cbd5e1;">Перспективные проекты:</span>
              <span style="color: #3b82f6; font-weight: 600;">10-20%</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 0.75rem; background: rgba(255, 255, 255, 0.05); border-radius: 8px;">
              <span style="color: #cbd5e1;">Стейблкоины (резерв):</span>
              <span style="color: #8b5cf6; font-weight: 600;">5-10%</span>
            </div>
          </div>
        </div>
        
        <div style="padding: 1.5rem; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 8px; margin-bottom: 1rem;">
          <h5 style="margin: 0 0 0.5rem 0; color: #856404;"><i class="fas fa-lightbulb"></i> Рекомендации</h5>
          <ul style="margin: 0; padding-left: 1.5rem; color: #856404;">
            <li>Постепенно снижайте долю активов, занимающих более 40% портфеля</li>
            <li>Увеличивайте позиции в недооцененных активах</li>
            <li>Сохраняйте стейблкоины для быстрых возможностей</li>
            <li>Ребалансируйте портфель раз в месяц или при изменении цен на 20%+</li>
          </ul>
        </div>
        
        <div style="padding: 1.5rem; background: #d1ecf1; border-left: 4px solid #17a2b8; border-radius: 8px;">
          <h5 style="margin: 0 0 0.5rem 0; color: #0c5460;"><i class="fas fa-info-circle"></i> Стратегия ребалансировки</h5>
          <p style="margin: 0; color: #0c5460;">
            <strong>Календарная ребалансировка:</strong> Установите регулярное расписание (например, первый день каждого месяца) для пересмотра портфеля.<br><br>
            <strong>Пороговая ребалансировка:</strong> Корректируйте позиции, когда доля актива отклоняется от целевой более чем на 5-10%.
          </p>
        </div>
      </div>
      <div class="modal-actions-news">
        <button class="btn-modal btn-secondary-modal" onclick="this.closest('.modal-overlay-news').remove()">Закрыть</button>
        <button class="btn-modal btn-primary-modal" id="goToTransactionsBtn">
          <i class="fas fa-exchange-alt"></i> Перейти к транзакциям
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Добавляем обработчик для кнопки перехода
  const transBtn = modal.querySelector('#goToTransactionsBtn');
  if (transBtn) {
    transBtn.addEventListener('click', () => {
      modal.remove();
      document.querySelector('[href="#transactions"]')?.click();
    });
  }
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

// === МОДАЛЬНОЕ ОКНО ОПТИМИЗАЦИИ ===
const showOptimizationModal = () => {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay-news';
  modal.style.display = 'flex';
  modal.style.zIndex = '10000';
  
  modal.innerHTML = `
    <div class="modal-container-news" style="max-width: 700px;">
      <div class="modal-header-news">
        <h3><i class="fas fa-chart-line"></i> Оптимизация распределения</h3>
        <button class="modal-close-news" onclick="this.closest('.modal-overlay-news').remove()">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>
      <div class="modal-body-news" style="max-height: 70vh; overflow-y: auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem; color: white;">
          <h4 style="margin: 0 0 1rem 0;"><i class="fas fa-magic"></i> Автоматические рекомендации</h4>
          <p style="margin: 0; opacity: 0.9;">Система проанализировала ваш портфель и предлагает следующие улучшения:</p>
        </div>
        
        <div style="display: grid; gap: 1rem; margin-bottom: 1.5rem;">
          <div style="padding: 1rem; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #10b981;">
            <h5 style="margin: 0 0 0.5rem 0; color: #10b981;"><i class="fas fa-check-circle"></i> Увеличить диверсификацию</h5>
            <p style="margin: 0; font-size: 0.9rem; color: #6c757d;">Добавьте 2-3 актива из разных секторов (DeFi, NFT, Layer 2)</p>
          </div>
          
          <div style="padding: 1rem; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #fbbf24;">
            <h5 style="margin: 0 0 0.5rem 0; color: #fbbf24;"><i class="fas fa-exclamation-triangle"></i> Снизить концентрацию</h5>
            <p style="margin: 0; font-size: 0.9rem; color: #6c757d;">Уменьшите долю крупнейшего актива до 30-35% от портфеля</p>
          </div>
          
          <div style="padding: 1rem; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #3b82f6;">
            <h5 style="margin: 0 0 0.5rem 0; color: #3b82f6;"><i class="fas fa-shield-alt"></i> Добавить защиту</h5>
            <p style="margin: 0; font-size: 0.9rem; color: #6c757d;">Включите 5-10% стейблкоинов для снижения волатильности</p>
          </div>
        </div>
        
        <div style="padding: 1.5rem; background: #e7f3ff; border-radius: 8px;">
          <h5 style="margin: 0 0 1rem 0; color: #004085;"><i class="fas fa-calculator"></i> Рассчитанные метрики</h5>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">
            <div style="text-align: center; padding: 1rem; background: white; border-radius: 8px;">
              <div style="font-size: 2rem; font-weight: 700; color: #10b981;">75%</div>
              <div style="font-size: 0.85rem; color: #6c757d;">Целевая диверсификация</div>
            </div>
            <div style="text-align: center; padding: 1rem; background: white; border-radius: 8px;">
              <div style="font-size: 2rem; font-weight: 700; color: #3b82f6;">2.5</div>
              <div style="font-size: 0.85rem; color: #6c757d;">Целевой Sharpe Ratio</div>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-actions-news">
        <button class="btn-modal btn-secondary-modal" onclick="this.closest('.modal-overlay-news').remove()">Закрыть</button>
        <button class="btn-modal btn-primary-modal" id="showRebalanceBtn">
          <i class="fas fa-arrow-right"></i> Посмотреть стратегию
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Добавляем обработчик для кнопки
  const rebalanceBtn = modal.querySelector('#showRebalanceBtn');
  if (rebalanceBtn) {
    rebalanceBtn.addEventListener('click', () => {
      modal.remove();
      showRebalanceModal();
    });
  }
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

// === МОДАЛЬНОЕ ОКНО СТРАТЕГИИ ===
const showStrategyModal = () => {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay-news';
  modal.style.display = 'flex';
  modal.style.zIndex = '10000';
  
  modal.innerHTML = `
    <div class="modal-container-news" style="max-width: 700px;">
      <div class="modal-header-news">
        <h3><i class="fas fa-chess"></i> Улучшение инвестиционной стратегии</h3>
        <button class="modal-close-news" onclick="this.closest('.modal-overlay-news').remove()">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>
      <div class="modal-body-news" style="max-height: 70vh; overflow-y: auto;">
        <div style="padding: 1.5rem; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); border-radius: 12px; margin-bottom: 1.5rem; color: white;">
          <h4 style="margin: 0 0 0.5rem 0;"><i class="fas fa-trophy"></i> Стратегии для улучшения показателей</h4>
          <p style="margin: 0; opacity: 0.9;">Выберите подход, соответствующий вашему риск-профилю</p>
        </div>
        
        <div style="display: grid; gap: 1.5rem;">
          <div style="padding: 1.5rem; background: #f8f9fa; border-radius: 12px; border: 2px solid #10b981;">
            <h4 style="color: #10b981; margin: 0 0 1rem 0;"><i class="fas fa-turtle"></i> Консервативная стратегия</h4>
            <ul style="margin: 0; padding-left: 1.5rem; color: #495057;">
              <li>70% - топ-10 криптовалют по капитализации</li>
              <li>20% - стейблкоины и защитные активы</li>
              <li>10% - перспективные проекты</li>
            </ul>
            <div style="margin-top: 1rem; padding: 0.75rem; background: #d4edda; border-radius: 6px;">
              <strong style="color: #155724;">Ожидаемый Sharpe Ratio:</strong> <span style="color: #155724;">1.5-2.0</span>
            </div>
          </div>
          
          <div style="padding: 1.5rem; background: #f8f9fa; border-radius: 12px; border: 2px solid #fbbf24;">
            <h4 style="color: #fbbf24; margin: 0 0 1rem 0;"><i class="fas fa-balance-scale-right"></i> Сбалансированная стратегия</h4>
            <ul style="margin: 0; padding-left: 1.5rem; color: #495057;">
              <li>50% - крупные активы (BTC, ETH)</li>
              <li>30% - топ-50 по капитализации</li>
              <li>10% - стейблкоины</li>
              <li>10% - высокорисковые активы</li>
            </ul>
            <div style="margin-top: 1rem; padding: 0.75rem; background: #fff3cd; border-radius: 6px;">
              <strong style="color: #856404;">Ожидаемый Sharpe Ratio:</strong> <span style="color: #856404;">1.0-1.5</span>
            </div>
          </div>
          
          <div style="padding: 1.5rem; background: #f8f9fa; border-radius: 12px; border: 2px solid #ef4444;">
            <h4 style="color: #ef4444; margin: 0 0 1rem 0;"><i class="fas fa-rocket"></i> Агрессивная стратегия</h4>
            <ul style="margin: 0; padding-left: 1.5rem; color: #495057;">
              <li>30% - крупные активы</li>
              <li>40% - средние проекты</li>
              <li>30% - новые перспективные токены</li>
            </ul>
            <div style="margin-top: 1rem; padding: 0.75rem; background: #f8d7da; border-radius: 6px;">
              <strong style="color: #721c24;">Ожидаемый Sharpe Ratio:</strong> <span style="color: #721c24;">0.5-1.0 (высокий риск)</span>
            </div>
          </div>
        </div>
        
        <div style="margin-top: 1.5rem; padding: 1.5rem; background: #d1ecf1; border-radius: 8px;">
          <h5 style="margin: 0 0 0.5rem 0; color: #0c5460;"><i class="fas fa-info-circle"></i> Важно помнить</h5>
          <p style="margin: 0; color: #0c5460;">
            • Диверсифицируйте не только по активам, но и по секторам<br>
            • Регулярно пересматривайте портфель (минимум раз в месяц)<br>
            • Используйте стоп-лоссы для защиты от больших просадок<br>
            • Не вкладывайте больше, чем готовы потерять
          </p>
        </div>
      </div>
      <div class="modal-actions-news">
        <button class="btn-modal btn-secondary-modal" onclick="this.closest('.modal-overlay-news').remove()">Закрыть</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}
 
  // === РЕНДЕР ТАБЛИЦЫ ДЕТАЛЬНОЙ СТАТИСТИКИ АКТИВОВ ===
  const renderAssetsStats = (transactions) => {
    const tbody = document.getElementById('assetsStatsBody');
    if (!tbody) {

      return;
    }
    
    // Кэшируем транзакции для пересчета при изменении размера экрана
    window.cachedAnalyticsTransactions = transactions;
    
    // Проверяем мобильное устройство
    const isMobile = window.innerWidth <= 768;
    
    // Символ валюты для всего рендера (избегаем ReferenceError)
    const currencySymbol = getCurrencySymbol();

    try {
      // Сгруппировать транзакции по символу
      const holdings = {};
      transactions.forEach(t => {
        const key = `${t.symbol}`;
        if (!holdings[key]) holdings[key] = { qty: 0, cost: 0, lastPrice: 0, lastDate: 0, firstDate: Infinity, symbol: t.symbol, txCount: 0, buyDates: [] };
        if (t.type === 'BUY') {
          holdings[key].qty += t.quantity;
          holdings[key].cost += t.quantity * t.price;
          const buyTime = new Date(t.date || t.created_at).getTime();
          holdings[key].buyDates.push({ date: t.date || t.created_at, price: t.price, qty: t.quantity });
          if (buyTime < holdings[key].firstDate) holdings[key].firstDate = buyTime;
        } else {
          holdings[key].qty -= t.quantity;
          holdings[key].cost -= t.quantity * t.price;
        }
        holdings[key].txCount++;
        const time = new Date(t.date || t.created_at).getTime();
        if (time >= holdings[key].lastDate) {
          holdings[key].lastDate = time;
          holdings[key].lastPrice = t.price;
        }
      });

      const assetsData = [];
      let totalValue = 0;
      let totalPnL = 0;
      
      for (const symbol in holdings) {
        const h = holdings[symbol];
        if (h.qty <= 0) continue;

        const currentPrice = getPriceSync(symbol) || h.lastPrice || 0;
        const avgPrice = h.cost && h.qty ? (h.cost / h.qty) : 0;
        const value = h.qty * currentPrice;
        const pnl = (currentPrice - avgPrice) * h.qty;
        const roi = avgPrice > 0 ? (pnl / (avgPrice * h.qty) * 100) : 0;
        
        totalValue += value;
        totalPnL += pnl;

        assetsData.push({
          symbol,
          qty: h.qty,
          avgPrice,
          currentPrice,
          value,
          pnl,
          roi,
          firstBuyDate: h.firstDate !== Infinity ? new Date(h.firstDate) : null,
          lastBuyDate: h.lastDate ? new Date(h.lastDate) : null,
          txCount: h.txCount || 0,
          buyDates: h.buyDates || [],
        });
      }

      if (assetsData.length === 0) {
        if (isMobile) {
          tbody.closest('.assets-table-wrapper').innerHTML = '<div style="text-align: center; padding: 2rem; color: #94a3b8; font-style: italic;">Нет активных позиций</div>';
        } else {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: #94a3b8; font-style: italic;">Нет активных позиций</td></tr>';
        }
        return;
      }

      const formatNumber = (num) => {
        return num.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 8 });
      };

      // МОБИЛЬНАЯ ВЕРСИЯ: Карточки
      if (isMobile) {
        const wrapper = tbody.closest('.assets-table-wrapper');
        const cardsHTML = assetsData.map(asset => {
          const iconColor = getAssetColor(asset.symbol);
          const iconHTML = getAssetIcon(asset.symbol);
          return `
            <div class="asset-card-mobile">
              <div class="asset-card-mobile-header">
                <div class="asset-card-mobile-icon" style="background: linear-gradient(135deg, ${iconColor}, ${iconColor}dd); color: white;">
                  ${iconHTML}
                </div>
                <div class="asset-card-mobile-name">
                  <h4>${asset.symbol}</h4>
                  <span>${formatNumber(asset.qty)} шт.</span>
                </div>
              </div>
              <div class="asset-card-mobile-body">
                <div class="asset-card-mobile-field">
                  <div class="asset-card-mobile-field-label">Ср. цена покупки</div>
                  <div class="asset-card-mobile-field-value">${currencySymbol}${formatNumber(convertToSelectedCurrency(asset.avgPrice))}</div>
                </div>
                <div class="asset-card-mobile-field">
                  <div class="asset-card-mobile-field-label">Текущая цена</div>
                  <div class="asset-card-mobile-field-value">${currencySymbol}${formatNumber(convertToSelectedCurrency(asset.currentPrice))}</div>
                </div>
                <div class="asset-card-mobile-field">
                  <div class="asset-card-mobile-field-label">Стоимость</div>
                  <div class="asset-card-mobile-field-value">${currencySymbol}${formatNumber(convertToSelectedCurrency(asset.value))}</div>
                </div>
                <div class="asset-card-mobile-field">
                  <div class="asset-card-mobile-field-label">Прибыль/Убыток</div>
                  <div class="asset-card-mobile-field-value ${asset.pnl >= 0 ? 'positive' : 'negative'}">
                    ${asset.pnl >= 0 ? '+' : ''}${currencySymbol}${formatNumber(Math.abs(convertToSelectedCurrency(asset.pnl)))}
                  </div>
                </div>
                <div class="asset-card-mobile-field">
                  <div class="asset-card-mobile-field-label">ROI</div>
                  <div class="asset-card-mobile-field-value ${asset.roi >= 0 ? 'positive' : 'negative'}">
                    ${asset.roi >= 0 ? '+' : ''}${asset.roi.toFixed(2)}%
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join('');
        
        // Итоговая карточка
        const totalCard = `
          <div class="asset-card-mobile" style="background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); border: 2px solid #3b82f6;">
            <div class="asset-card-mobile-header" style="border-bottom-color: #cbd5e1;">
              <div class="asset-card-mobile-icon" style="background: #3b82f6; color: white;">
                <i class="fas fa-sigma"></i>
              </div>
              <div class="asset-card-mobile-name">
                <h4>ИТОГО</h4>
              </div>
            </div>
            <div class="asset-card-mobile-body">
              <div class="asset-card-mobile-field">
                <div class="asset-card-mobile-field-label">Общая стоимость</div>
                <div class="asset-card-mobile-field-value" style="font-size: 1.125rem; color: #1e293b;">${currencySymbol}${formatPrice(convertToSelectedCurrency(totalValue))}</div>
              </div>
              <div class="asset-card-mobile-field">
                <div class="asset-card-mobile-field-label">Общая П/У</div>
                <div class="asset-card-mobile-field-value ${totalPnL >= 0 ? 'positive' : 'negative'}" style="font-size: 1.125rem;">
                  ${totalPnL >= 0 ? '+' : ''}${currencySymbol}${formatPrice(Math.abs(convertToSelectedCurrency(totalPnL)))}
                </div>
              </div>
            </div>
          </div>
        `;
        
        wrapper.innerHTML = cardsHTML + totalCard;
        
        // Загружаем иконки через icon loader
        if (window._iconLoader && typeof window._iconLoader.processContainer === 'function') {
          window._iconLoader.processContainer(wrapper);
        }
      } 
      // ДЕСКТОПНАЯ ВЕРСИЯ: Таблица
      else {
        const rows = assetsData.map(asset => {
          const posJson = JSON.stringify({
            symbol: asset.symbol,
            qty: asset.qty,
            avgPrice: asset.avgPrice,
            currentPrice: asset.currentPrice,
            value: asset.value,
            pnl: asset.pnl,
            roi: asset.roi,
            firstBuyDate: asset.firstBuyDate ? asset.firstBuyDate.toISOString() : null,
            lastBuyDate: asset.lastBuyDate ? asset.lastBuyDate.toISOString() : null,
            txCount: asset.txCount,
            buyDates: asset.buyDates,
          }).replace(/'/g, '&#39;');
          return `
          <tr class="asset-row asset-row-clickable" onclick="window.openDetailFromAnalytics('${asset.symbol}', '${posJson.replace(/"/g, "&quot;")}')"
              title="Открыть детальный анализ ${asset.symbol}">
            <td>
              <div class="asset-cell">
                <div class="asset-icon-cell">${getAssetIcon(asset.symbol)}</div>
                <div class="asset-name notranslate" translate="no"><strong class="notranslate" translate="no">${asset.symbol}</strong></div>
              </div>
            </td>
            <td class="asset-qty notranslate" translate="no">${formatNumber(asset.qty)}</td>
            <td class="asset-avg-price notranslate" translate="no">${currencySymbol}${formatNumber(convertToSelectedCurrency(asset.avgPrice))}</td>
            <td class="asset-current-price notranslate" translate="no">${currencySymbol}${formatNumber(convertToSelectedCurrency(asset.currentPrice))}</td>
            <td class="asset-value notranslate" translate="no">${currencySymbol}${formatNumber(convertToSelectedCurrency(asset.value))}</td>
            <td class="asset-pnl ${asset.pnl >= 0 ? 'positive' : 'negative'} notranslate" translate="no">${asset.pnl >= 0 ? '+' : ''}${currencySymbol}${formatNumber(Math.abs(convertToSelectedCurrency(asset.pnl)))}</td>
            <td class="asset-roi ${asset.roi >= 0 ? 'positive' : 'negative'} notranslate" translate="no">${asset.roi >= 0 ? '+' : ''}${asset.roi.toFixed(2)}%</td>
          </tr>
        `;
        });

        // Добавляем итоговую строку
        rows.push(`
          <tr class="total-row">
            <td colspan="4" class="total-label">ИТОГО:</td>
            <td class="total-value">${currencySymbol}${formatPrice(convertToSelectedCurrency(totalValue))}</td>
            <td class="total-pnl ${totalPnL >= 0 ? 'positive' : 'negative'}">${totalPnL >= 0 ? '+' : ''}${currencySymbol}${formatPrice(Math.abs(convertToSelectedCurrency(totalPnL)))}</td>
            <td></td>
          </tr>
        `);
        tbody.innerHTML = rows.join('');

        // After rendering assets, lazy-load icons via icon loader (throttled + cached)
        if (window._iconLoader && typeof window._iconLoader.processContainer === 'function') {
          window._iconLoader.processContainer(tbody);
        }
      }
      

    } catch (err) {

      if (isMobile) {
        tbody.closest('.assets-table-wrapper').innerHTML = '<div style="text-align: center; padding: 2rem; color: #dc2626; background: #fee2e2;">Ошибка загрузки: ' + err.message + '</div>';
      } else {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: #dc2626; background: #fee2e2;">Ошибка загрузки: ' + err.message + '</td></tr>';
      }
    }
  }
  
  // Вспомогательная функция для получения цвета актива
  const getAssetColor = (symbol) => {
    const colors = {
      'BTC': '#F7931A',
      'ETH': '#627EEA',
      'BNB': '#F3BA2F',
      'SOL': '#14F195',
      'XRP': '#23292F',
      'ADA': '#0033AD',
      'DOT': '#E6007A',
      'MATIC': '#8247E5',
      'LINK': '#2A5ADA',
      'UNI': '#FF007A'
    };
    return colors[symbol] || '#6366f1';
  };
  
  const getAssetIcon = (symbol) => {
    const cryptoIcons = {
      'BTC': '₿',
      'ETH': 'Ξ',
      'USDT': '₮',
      'BNB': 'Ⓑ',
      'SOL': '◎',
      'XRP': 'Ʀ',
      'ADA': '₳',
      'DOGE': 'Ð'
    };

    // Проверяем, это акция или криптовалюта
    const isStock = window.STOCK_INFO && window.STOCK_INFO[symbol];
    
    if (isStock) {
      // Для акций используем логотип как в карточках
      const imgUrl = `https://img.logo.dev/${symbol.toLowerCase()}.com?token=pk_X-jjCWIKT_SRetd3NwvHUg&size=80&format=png`;
      return `<div class="asset-icon-inner"><img data-src="${imgUrl}" alt="${symbol}" data-fallback1="https://assets.parqet.com/logos/symbol/${symbol}" data-fallback2="https://financialmodelingprep.com/image-stock/${symbol}.png" data-emoji="${symbol.charAt(0)}"/></div>`;
    } else {
      // Для криптовалют используем CoinCap
      const imgUrl = `https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`;
      return `<div class="asset-icon-inner"><img data-src="${imgUrl}" alt="${symbol}" data-emoji="${cryptoIcons[symbol] ? cryptoIcons[symbol] : '🪙'}"/></div>`;
    }
  }

  // Icon loader: throttled, cached image loader to reduce parallel requests and CORB noise
  (function(){
    const cache = new Map(); // url -> Promise
    const concurrency = 6;
    let running = 0;
    const queue = [];

    const _next = () => {
      if (queue.length === 0) return;
      if (running >= concurrency) return;
      const fn = queue.shift();
      fn();
    }

    const _loadUrl = (url) => {
      if (cache.has(url)) return cache.get(url);
      const p = new Promise((resolve, reject) => {
        const start = () => {
          running++;
          const img = new Image();
          // Do not set crossOrigin by default to avoid CORS errors when not needed
          img.onload = () => { running--; resolve(url); _next(); };
          img.onerror = () => { running--; reject(new Error('Failed to load ' + url)); _next(); };
          img.src = url;
        };
        if (running < concurrency) start(); else queue.push(start);
      });
      cache.set(url, p);
      return p;
    }

    const processContainer = (container) => {
      if (!container) return;
      const imgs = container.querySelectorAll('img[data-src]');
      imgs.forEach(el => {
        const url = el.getAttribute('data-src');
        if (!url) return;
        
        // Fallback chain для акций
        const fallback1 = el.dataset.fallback1;
        const fallback2 = el.dataset.fallback2;
        
        _loadUrl(url).then(src => {
          el.src = src;
          el.removeAttribute('data-src');
        }).catch(() => {
          // Попробуем первый fallback
          if (fallback1) {
            _loadUrl(fallback1).then(src => {
              el.src = src;
              el.removeAttribute('data-src');
            }).catch(() => {
              // Попробуем второй fallback
              if (fallback2) {
                _loadUrl(fallback2).then(src => {
                  el.src = src;
                  el.removeAttribute('data-src');
                }).catch(() => {
                  // Показываем emoji или букву
                  const emoji = el.dataset.emoji || '🪙';
                  const parent = el.parentNode;
                  if (parent) parent.innerHTML = `<span class="emoji">${emoji}</span>`;
                });
              } else {
                const emoji = el.dataset.emoji || '🪙';
                const parent = el.parentNode;
                if (parent) parent.innerHTML = `<span class="emoji">${emoji}</span>`;
              }
            });
          } else {
            const emoji = el.dataset.emoji || '🪙';
            const parent = el.parentNode;
            if (parent) parent.innerHTML = `<span class="emoji">${emoji}</span>`;
          }
        });
      });
    }

    window._iconLoader = {
      processContainer,
      _cache: cache
    };
  })();

  // Watch DOM for newly added images with data-src and auto-process them (reduces missed cases)
  if (typeof MutationObserver !== 'undefined') {
    const _mo = new MutationObserver(muts => {
      muts.forEach(m => {
        m.addedNodes.forEach(node => {
          try {
            if (!node) return;
            if (node.nodeType !== 1) return;
            if (node.matches && node.matches('img[data-src]')) {
              window._iconLoader.processContainer(node.parentElement || node);
            } else if (node.querySelector && node.querySelector('img[data-src]')) {
              window._iconLoader.processContainer(node);
            }
          } catch (e) {}
        });
      });
    });
    _mo.observe(document.body, { childList: true, subtree: true });
  }

  const greeting = document.getElementById('userGreetingName');
  if (greeting && nameEl) greeting.textContent = nameEl.textContent || 'Инвестор';

const updateDate = () => {
  const el = document.getElementById('currentDate');
  if (el) el.textContent = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
}

// Deprecated: эта функция больше не используется
const loadDashboardData_DEPRECATED = async () => {
  try {

    
    const portfolios = getPortfoliosSync();
    const transactions = getTransactionsSync();




    const el = document.getElementById('portfolioCount');
    if (el) el.textContent = portfolios.length;

    // Вычисляем реальную статистику из транзакций
    if (transactions && transactions.length > 0) {
      let totalInvested = 0;
      let totalQuantity = 0;
      
      // Группируем по активам
      const assets = {};
      
      transactions.forEach(tx => {
        if (!assets[tx.symbol]) {
          assets[tx.symbol] = {
            totalCost: 0,
            totalQuantity: 0,
            currentQuantity: 0
          };
        }
        
        if (tx.transaction_type === 'BUY') {
          assets[tx.symbol].totalCost += tx.quantity * tx.price;
          assets[tx.symbol].totalQuantity += tx.quantity;
          assets[tx.symbol].currentQuantity += tx.quantity;
        } else if (tx.transaction_type === 'SELL') {
          assets[tx.symbol].currentQuantity -= tx.quantity;
        }
      });
      
      // Считаем общую инвестированную сумму
      Object.values(assets).forEach(asset => {
        if (asset.currentQuantity > 0) {
          totalInvested += asset.totalCost;
        }
      });
      
      // Предполагаем рост на 15% для демонстрации
      const currentValue = totalInvested * 1.15;
      const change = ((currentValue - totalInvested) / totalInvested) * 100;
      
      const balance = document.getElementById('totalBalance');
      if (balance) balance.textContent = `$${formatPrice(currentValue)}`;
      
      const changeEl = document.getElementById('totalChange');
      if (changeEl) {
        const changeClass = change >= 0 ? 'positive' : 'negative';
        changeEl.innerHTML = `<span class="${changeClass}">${change >= 0 ? '+' : ''}${change.toFixed(1)}% (+$${formatPrice(currentValue - totalInvested)})</span>`;
      }
      
      const ret = document.getElementById('totalReturn');
      if (ret) ret.textContent = `+${change.toFixed(1)}%`;
      

    } else {
      // Заглушки если нет транзакций
      const balance = document.getElementById('totalBalance');
      if (balance) balance.textContent = '$0.00';
      
      const change = document.getElementById('totalChange');
      if (change) change.innerHTML = '<span class="positive">+0.0%</span>';
      
      const ret = document.getElementById('totalReturn');
      if (ret) ret.textContent = '+0%';
      

    }
    
    const crypto = document.getElementById('cryptoValue');
    if (crypto) crypto.textContent = '$0';
    
    const stocks = document.getElementById('stocksValue');
    if (stocks) stocks.textContent = '$0';
    
  } catch (err) {

  }
}

// Deprecated: эта функция больше не используется, графики теперь инициализируются в dashboard.js
const initDashboardCharts_DEPRECATED = () => {

  return; // Не делаем ничего
  
  const transactions = getTransactionsSync();

  
  // График тренда (miniChart)
  const ctxTrend = document.getElementById('miniChart');
  if (ctxTrend && transactions && transactions.length > 0) {
    // Группируем транзакции по датам для истории
    const dateMap = {};
    transactions.forEach(tx => {
      const date = new Date(tx.created_at).toLocaleDateString('ru-RU', { month: 'short' });
      if (!dateMap[date]) dateMap[date] = 0;
      if (tx.transaction_type === 'BUY') {
        dateMap[date] += tx.quantity * tx.price;
      }
    });
    
    const dates = Object.keys(dateMap).slice(-6);
    const values = dates.map(d => dateMap[d]);
    
    dashboardCharts.trend = new Chart(ctxTrend, {
      type: 'line',
      data: {
        labels: dates.length > 0 ? dates : ['', '', '', '', '', ''],
        datasets: [{
          data: values.length > 0 ? values : [0, 0, 0, 0, 0, 0],
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 0
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } } }
    });
  }

  // График распределения активов (allocationChart)
  const ctxPie = document.getElementById('allocationChart');
  if (ctxPie && transactions && transactions.length > 0) {
    // Группируем по типам активов
    const assetTypes = {};
    transactions.forEach(tx => {
      const type = tx.asset_type || 'OTHER';
      if (!assetTypes[type]) assetTypes[type] = 0;
      // ИСПРАВЛЕНО: используем поле 'type' вместо 'transaction_type'
      if (tx.type === 'BUY') {
        assetTypes[type] += tx.quantity * tx.price;
      } else if (tx.type === 'SELL') {
        assetTypes[type] -= tx.quantity * tx.price;
      }
    });
    
    const labels = Object.keys(assetTypes).map(t => t === 'CRYPTO' || t === 'CRYPTOCURRENCY' ? 'Крипто' : t === 'STOCK' || t === 'STOCKS' ? 'Акции' : t);
    const data = Object.values(assetTypes);
    
    dashboardCharts.pie = new Chart(ctxPie, {
      type: 'doughnut',
      data: {
        labels: labels.length > 0 ? labels : ['Нет данных'],
        datasets: [{ 
          data: data.length > 0 ? data : [1], 
          backgroundColor: ['#2563eb', '#f59e0b', '#8b5cf6', '#10b981'], 
          borderWidth: 3, 
          borderColor: '#1e293b' 
        }]
      },
      options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { color: '#fff' } } } }
    });
  }

  // График истории портфеля (historyChart)
  const ctxLine = document.getElementById('historyChart');
  if (ctxLine && transactions && transactions.length > 0) {
    // Группируем по месяцам
    const monthMap = {};
    transactions.forEach(tx => {
      const month = new Date(tx.created_at).toLocaleDateString('ru-RU', { month: 'short' });
      if (!monthMap[month]) monthMap[month] = 0;
      // ИСПРАВЛЕНО: используем поле 'type' вместо 'transaction_type'
      if (tx.type === 'BUY') {
        monthMap[month] += tx.quantity * tx.price;
      }
    });
    
    const months = Object.keys(monthMap).slice(-6);
    const monthValues = months.map(m => monthMap[m]);
    
    // Кумулятивная сумма для истории
    let cumulative = 0;
    const cumulativeValues = monthValues.map(v => {
      cumulative += v;
      return cumulative;
    });
    
    dashboardCharts.line = new Chart(ctxLine, {
      type: 'line',
      data: {
        labels: months.length > 0 ? months : ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн'],
        datasets: [{
          label: 'Портфель',
          data: cumulativeValues.length > 0 ? cumulativeValues : [0, 0, 0, 0, 0, 0],
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          fill: true,
          tension: 0.4
        }]
      },
      options: { 
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            labels: {
              color: '#fff'
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#94a3b8' },
            grid: { color: 'rgba(148, 163, 184, 0.1)' }
          },
          y: {
            ticks: { color: '#94a3b8' },
            grid: { color: 'rgba(148, 163, 184, 0.1)' }
          }
        }
      }
    });
  }
  

}

const loadRecentTransactions = () => {
  const transactions = getTransactionsSync().slice(-5).reverse();
  const container = document.getElementById('recentTransactions');
  if (!container) return;

  if (transactions.length === 0) {
    container.innerHTML = '<p class="no-data">Нет транзакций</p>';
    return;
  }

  container.innerHTML = transactions.map(t => {
    const currencySymbol = getCurrencySymbol();
    const priceConverted = convertToSelectedCurrency(parseFloat(t.price));
    const totalConverted = convertToSelectedCurrency(parseFloat(t.quantity) * parseFloat(t.price));
    return `
    <div class="activity-item">
      <div class="activity-icon ${t.type === 'BUY' ? 'buy' : 'sell'}">
        <i class="fas fa-${t.type === 'BUY' ? 'plus' : 'minus'}"></i>
      </div>
      <div class="activity-info">
        <div class="activity-title">${t.type === 'BUY' ? 'Покупка' : 'Продажа'} ${t.symbol}</div>
        <div class="activity-subtitle">${t.quantity} × ${currencySymbol}${formatPrice(priceConverted)}</div>
      </div>
      <div class="activity-amount ${t.type === 'BUY' ? 'negative' : 'positive'}">
        ${t.type === 'BUY' ? '-' : '+'}${currencySymbol}${formatPrice(totalConverted)}
      </div>
    </div>
  `
  }).join('');
}

const loadTopAssets = () => {
  const container = document.getElementById('topAssetsGrid');
  if (!container) return;

  const mockAssets = [
    { symbol: 'AAPL', name: 'Apple', price: 185.50, change: 2.30, changePercent: 1.26 },
    { symbol: 'BTC', name: 'Bitcoin', price: 45230, change: -550, changePercent: -1.20 },
    { symbol: 'TSLA', name: 'Tesla', price: 215.40, change: -3.20, changePercent: -1.46 },
    { symbol: 'GOOGL', name: 'Alphabet', price: 2850, change: 45, changePercent: 1.60 }
  ];

  container.innerHTML = mockAssets.map(a => `
    <div class="top-asset-card">
      <div class="asset-header">
        <div class="asset-symbol notranslate" translate="no">${a.symbol}</div>
        <div class="asset-name notranslate" translate="no">${a.name}</div>
      </div>
      <div class="asset-price notranslate" translate="no">$${formatPrice(a.price)}</div>
      <div class="asset-change ${a.change >= 0 ? 'positive' : 'negative'} notranslate" translate="no">
        ${a.change >= 0 ? '+' : ''}${formatPrice(a.change)} (${a.changePercent.toFixed(2)}%)
      </div>
    </div>
  `).join('');
}

// === ФОРМЫ ===
// === ДЕТАЛЬНАЯ ИНФОРМАЦИЯ О КРИПТОВАЛЮТЕ ===
// Moved to global scope at top of file
let currentCryptoPeriod = '7';
let cryptoDetailCharts = {};

// Comparison state
let compareSeriesLine = null;
let compareSeriesCandle = null;

// Series visibility state
let mainSeriesVisible = true;
let compareSeriesVisible = true;

// Make chart instances global for cleanup
window.tvChart = null;
let candlestickSeries = null;
let lineSeries = null;
let volumeSeries = null;
let currentCryptoInterval = '1w';

// Make currentCryptoSymbol global
window.currentCryptoSymbol = null;

// Кеш данных для избежания rate limit
window.cryptoDataCache = window.cryptoDataCache || {};
const CACHE_DURATION = 60000; // 1 минута

window.showCryptoDetail = async function(symbol) {
  window.currentCryptoSymbol = symbol;

  
  // Проверяем кеш
  const now = Date.now();
  const cached = window.cryptoDataCache[symbol];
  if (cached && (now - cached.timestamp) < CACHE_DURATION) {

  }
  
  const modal = document.getElementById('cryptoDetailModal');
  if (!modal) {

    return;
  }
  
  // Полностью очищаем предыдущий график перед созданием нового
  if (window.tvChart) {
    try {
      window.tvChart.remove();

    } catch (e) {

    }
    window.tvChart = null;
    candlestickSeries = null;
    lineSeries = null;
    volumeSeries = null;
  }
  
  // Clear container and reset any inline styles LightweightCharts set during previous render
  const container = document.getElementById('cryptoDetailPriceChart');
  if (container) {
    container.innerHTML = '';
    container.style.cssText = ''; // reset LWC-set inline position/width/height
  }
  // Force chart wrapper to refresh its flex-layout dimensions
  const chartWrapperEl = document.getElementById('chartAreaWrapper');
  if (chartWrapperEl) {
    chartWrapperEl.style.cssText = ''; // clear any stale inline styles
    void chartWrapperEl.offsetHeight;  // force reflow
  }
  
  // Open modal FIRST, then create chart
  modal.style.display = '';
  modal.classList.add('active');
  
  // Ждем окончания анимации и рендера модального окна
  // 100ms вместо 50ms — после dock/undock браузеру нужно больше времени пересчитать flex-layout
  await new Promise(resolve => setTimeout(resolve, 100));

  
  // Show legend for main symbol
  const chartLegend = document.getElementById('chartLegend');
  if (chartLegend) {
    chartLegend.style.display = 'flex';
  }
  
  try {
    // Проверяем кеш для ticker данных
    const tickerCacheKey = `ticker_${symbol}`;
    let data;
    if (cached) {

      data = cached.tickerData;
    } else {
      const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}USDT`);
      data = await response.json();
      
      // Сохраняем в кеш
      window.cryptoDataCache[symbol] = {
        tickerData: data,
        timestamp: now
      };

    }
    
    const price = parseFloat(data.lastPrice);
    const change = parseFloat(data.priceChangePercent);
    const volume = parseFloat(data.quoteVolume);
    const high = parseFloat(data.highPrice);
    const low = parseFloat(data.lowPrice);
    const open = parseFloat(data.openPrice);
    
    const cryptoInfo = window.CRYPTO_INFO?.[symbol] || { name: symbol, icon: null, color: '#F7931A', rank: 'N/A', marketCap: 5 };
    
    // Update header
    document.getElementById('cryptoDetailName').textContent = cryptoInfo.name;
    document.getElementById('cryptoDetailSymbol').textContent = symbol;
    document.getElementById('cryptoDetailSymbolLabel').textContent = symbol;
    document.getElementById('cryptoDetailRank').textContent = 'Rank #' + (cryptoInfo.rank || 'N/A');
    
    // Update icon
    const iconEl = document.getElementById('cryptoDetailIcon');
    if (iconEl) {
      iconEl.style.background = cryptoInfo.color;
      iconEl.style.color = 'white';
      
      // Create img element programmatically to avoid HTML escaping issues
      const imgUrl = `https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`;
      const img = document.createElement('img');
      img.src = imgUrl;
      img.alt = symbol;
      img.style.cssText = 'width: 100%; height: 100%; object-fit: contain;';
      
      // Fallback handler — multi-step: CryptoIcons CDN → ui-avatars
      img.onerror = function() {
        if (!this.dataset.cryptoFallback) {
          this.dataset.cryptoFallback = '1';
          this.src = `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/32/icon/${symbol.toLowerCase()}.png`;
        } else {
          this.onerror = null;
          const fallbackIcon = document.createElement('i');
          fallbackIcon.className = `fab fa-${cryptoInfo.icon || 'bitcoin'}`;
          iconEl.innerHTML = '';
          iconEl.appendChild(fallbackIcon);
        }
      };
      
      iconEl.innerHTML = '';
      iconEl.appendChild(img);
    }
    
    // Update price section
    const currencySymbol = getCurrencySymbol();
    const convertedPrice = convertToSelectedCurrency(price);
    document.getElementById('cryptoDetailPrice').textContent = currencySymbol + convertedPrice.toLocaleString('en-US', {
      minimumFractionDigits: 2, 
      maximumFractionDigits: convertedPrice < 1 ? 6 : 2
    });
    
    const changeEl = document.getElementById('cryptoDetailChange');
    changeEl.textContent = (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
    changeEl.className = 'price-change ' + (change >= 0 ? 'price-positive' : 'price-negative');
    
    // Update 24h high/low
    document.getElementById('cryptoDetailHigh24h').innerHTML = 
      `<i class="fas fa-arrow-up"></i> ${currencySymbol}${convertToSelectedCurrency(high).toFixed(2)}`;
    document.getElementById('cryptoDetailLow24h').innerHTML = 
      `<i class="fas fa-arrow-down"></i> ${currencySymbol}${convertToSelectedCurrency(low).toFixed(2)}`;
    
    // Update OHLC display
    updateOHLCDisplay(open, high, low, price, change);
    
    // Update community sentiment based on technical indicators
    const sentimentData = await window.calculateSentimentFromIndicators(symbol, currentCryptoInterval);
    const bullishPercent = sentimentData.bullish;
    const bearishPercent = sentimentData.bearish;
    document.getElementById('sentimentBullish').style.width = bullishPercent + '%';
    document.getElementById('sentimentBullishValue').textContent = bullishPercent.toFixed(0) + '%';
    document.getElementById('sentimentBearish').style.width = bearishPercent + '%';
    document.getElementById('sentimentBearishValue').textContent = bearishPercent.toFixed(0) + '%';
    
    // Update stats
    const marketCap = (cryptoInfo.marketCap || 5);
    const fdv = marketCap * 1.15;
    const volMarketCapRatio = (volume / (marketCap * 1e9) * 100);
    
    document.getElementById('cryptoDetailMarketCap').textContent = currencySymbol + convertToSelectedCurrency(marketCap).toFixed(2) + 'B';
    const marketCapChange = (change * 0.95).toFixed(2);
    const mcChangeEl = document.getElementById('cryptoDetailMarketCapChange');
    mcChangeEl.textContent = (marketCapChange >= 0 ? '+' : '') + marketCapChange + '%';
    mcChangeEl.className = 'stat-change ' + (marketCapChange >= 0 ? 'positive' : 'negative');
    
    document.getElementById('cryptoDetailVolume').textContent = currencySymbol + (convertToSelectedCurrency(volume) / 1e9).toFixed(2) + 'B';
    document.getElementById('cryptoDetailVolumeMarketCap').textContent = 'Vol / Mkt Cap: ' + volMarketCapRatio.toFixed(2) + '%';
    
    const circulation = (marketCap * 1e3).toFixed(0);
    document.getElementById('cryptoDetailCirculation').textContent = circulation + 'M ' + symbol;
    document.getElementById('cryptoDetailMaxSupply').textContent = 'Max: ' + (marketCap * 1.2e3).toFixed(0) + 'M';
    
    document.getElementById('cryptoDetailFDV').textContent = currencySymbol + convertToSelectedCurrency(fdv).toFixed(2) + 'B';
    
    // Update additional stats
    document.getElementById('statPriceChange1h').textContent = (change * 0.3).toFixed(2) + '%';
    document.getElementById('statPriceChange24h').textContent = (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
    document.getElementById('statPriceChange7d').textContent = (change * 2.5).toFixed(2) + '%';
    document.getElementById('statATH').textContent = currencySymbol + convertToSelectedCurrency(price * 1.45).toFixed(2);
    document.getElementById('statATL').textContent = currencySymbol + convertToSelectedCurrency(price * 0.15).toFixed(2);
    // --- Обновление модалки при смене валюты ---
    window.addEventListener('currencyChanged', () => {
      // Если модалка открыта, пересчитать значения только после загрузки курса
      const modal = document.getElementById('cryptoDetailModal');
      if (modal && modal.classList.contains('active')) {
        const symbol = document.getElementById('cryptoDetailSymbol')?.textContent;
        if (symbol) {
          import('../core/currency.js').then(currency => {
            currency.fetchCurrencyRate().then(() => {
              window.showCryptoDetail(symbol);
            });
          });
        }
      }
    });
    document.getElementById('statVolMktCap').textContent = volMarketCapRatio.toFixed(2) + '%';
    
    await window.loadCryptoDetailCharts(symbol, currentCryptoInterval);
  } catch (error) {

    showNotification('Ошибка загрузки', 'error');
  }
};

const updateOHLCDisplay = (open, high, low, close, change) => {
  const formatOHLCPrice = (val) => {
    const num = parseFloat(val);
    if (!num && num !== 0) return 'N/A';
    if (isNaN(num)) return 'N/A';
    
    if (num < 0.000001) {
      return num.toFixed(8);
    } else if (num < 0.0001) {
      return num.toFixed(6);
    } else if (num < 0.01) {
      return num.toFixed(4);
    } else if (num < 1) {
      return num.toFixed(3);
    } else {
      return num.toFixed(2);
    }
  };
  
  document.getElementById('ohlcOpen').textContent = formatOHLCPrice(open);
  document.getElementById('ohlcHigh').textContent = formatOHLCPrice(high);
  document.getElementById('ohlcLow').textContent = formatOHLCPrice(low);
  document.getElementById('ohlcClose').textContent = formatOHLCPrice(close);
  
  const changeEl = document.getElementById('ohlcChange');
  changeEl.textContent = (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
  changeEl.className = 'ohlc-value ' + (change >= 0 ? 'positive' : 'negative');
  
  const closeEl = document.getElementById('ohlcClose');
  closeEl.className = 'ohlc-value ' + (close >= open ? 'positive' : 'negative');
}

window.changeCryptoChartPeriod = async function(interval) {

  
  // Защита от вызова без выбранного символа
  if (!window.currentCryptoSymbol) {

    return;
  }
  
  currentCryptoInterval = interval;
  
  // Update button states
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.period === interval) {
      btn.classList.add('active');

    }
  });
  

  await window.loadCryptoDetailCharts(window.currentCryptoSymbol, interval);

};

window.switchChartType = function(type) {

  
  // Защита от вызова без выбранного символа
  if (!window.currentCryptoSymbol) {

    return;
  }
  
  currentChartType = type;

  
  // При переходе на TradingView сбрасываем сравнение
  if (type === 'tradingview') {
    if (compareSymbol) {

      removeCompareSymbol();
    }
    // Скрываем легенду в TradingView режиме
    const chartLegend = document.getElementById('chartLegend');
    if (chartLegend) {
      chartLegend.style.display = 'none';
    }
  } else if (type === 'indicators') {
    // В режиме индикаторов скрываем легенду, OHLC и toolbar
    const chartLegend = document.getElementById('chartLegend');
    if (chartLegend) chartLegend.style.display = 'none';
    const chartOhlc = document.getElementById('chartOhlcDisplay');
    if (chartOhlc) chartOhlc.style.display = 'none';
    const toolbar = document.getElementById('cryptoDrawingToolbar');
    if (toolbar) toolbar.style.display = 'none';
  } else if (type === 'tech-table') {
    // В режиме таблицы индикаторов скрываем легенду, OHLC и toolbar
    const chartLegend = document.getElementById('chartLegend');
    if (chartLegend) chartLegend.style.display = 'none';
    const chartOhlc = document.getElementById('chartOhlcDisplay');
    if (chartOhlc) chartOhlc.style.display = 'none';
    const toolbar = document.getElementById('cryptoDrawingToolbar');
    if (toolbar) toolbar.style.display = 'none';
  } else {
    // Показываем легенду в Price режиме и toolbar
    const chartLegend = document.getElementById('chartLegend');
    if (chartLegend) {
      chartLegend.style.display = 'flex';
    }
    const toolbar = document.getElementById('cryptoDrawingToolbar');
    if (toolbar) toolbar.style.display = '';
  }
  
  document.querySelectorAll('.chart-tab').forEach(tab => {
    tab.classList.remove('active');
    if (tab.dataset.chart === type) {
      tab.classList.add('active');

    }
  });
  
  // Reload chart with new type
  window.loadCryptoDetailCharts(window.currentCryptoSymbol, currentCryptoInterval);
};

window.toggleChartScale = function() {

  
  // Защита от вызова без выбранного символа
  if (!window.currentCryptoSymbol) {

    return;
  }
  
  isLogScale = !isLogScale;
  const btn = document.getElementById('chartScaleBtn');
  btn.classList.toggle('active', isLogScale);
  window.loadCryptoDetailCharts(window.currentCryptoSymbol, currentCryptoInterval);
};

// Экспортируем глобально для использования в dock/undock
// Счётчик запросов — каждый новый вызов отменяет предыдущий (last-wins).
let _chartLoadSeq = 0;

const loadCryptoDetailCharts = async (symbol, interval) => {
  const mySeq = ++_chartLoadSeq; // захватываем номер до первого await

  try {

    
    // Reset visibility state when loading new charts
    mainSeriesVisible = true;
    compareSeriesVisible = true;
    
    if (!symbol) {

      return;
    }

    // Если за время ожидания пришёл более новый запрос — выходим
    const stale = () => mySeq !== _chartLoadSeq;
    
    // Map intervals to Binance API format
    const intervalMap = {
      '1m': '1m',
      '5m': '5m',
      '15m': '15m',
      '30m': '30m',
      '1h': '1h',
      '2h': '2h',
      '4h': '4h',
      '1d': '1d',
      '1w': '1w',
      '1M': '1M',
      '1Y': '1M',  // Use monthly for yearly view
      'all': '1w'
    };
    
    const binanceInterval = intervalMap[interval] || '1d';
    
    // Calculate limit based on interval - increased for accurate indicator calculations
    let limit = 500; // Default maximum
    if (interval === '1m') limit = 500;
    else if (interval === '5m') limit = 500;
    else if (interval === '15m') limit = 500;
    else if (interval === '30m') limit = 500;
    else if (interval === '1h') limit = 500;
    else if (interval === '2h') limit = 500;
    else if (interval === '4h') limit = 500;
    else if (interval === '1d') limit = 500; // Was 30 - need more for accurate indicators
    else if (interval === '1w') limit = 500;
    else if (interval === '1M') limit = 500;
    else if (interval === '1Y') limit = 500;
    else if (interval === 'all') limit = 1000;
    
    // Проверяем кеш перед запросом
    const cacheKey = `${symbol}_${binanceInterval}_${limit}`;
    const now = Date.now();
    if (window.cryptoDataCache[cacheKey] && (now - window.cryptoDataCache[cacheKey].timestamp) < CACHE_DURATION) {

      const klines = window.cryptoDataCache[cacheKey].data;
      
      if (stale()) return;
      // Render chart based on current type
      if (currentChartType === 'tradingview') {
        renderTradingViewChart(klines, symbol);
      } else if (currentChartType === 'indicators') {
        window.renderIndicatorsChart(klines, symbol);
      } else if (currentChartType === 'tech-table') {
        window.renderTechIndicatorsTable(klines, symbol, currentCryptoInterval);
      } else {
        await renderPriceLineChart(klines, symbol);
      }
      return;
    }
    
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=${binanceInterval}&limit=${limit}`;

    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const klines = await response.json();

    
    if (!klines || klines.length === 0) {

      showNotification('Нет данных для отображения', 'warning');
      return;
    }
    
    // Сохраняем в кеш
    window.cryptoDataCache[cacheKey] = {
      data: klines,
      timestamp: now
    };

    
    if (stale()) return;
    // Render chart based on current type
    if (currentChartType === 'tradingview') {
      renderTradingViewChart(klines, symbol);
    } else if (currentChartType === 'indicators') {
      window.renderIndicatorsChart(klines, symbol);
    } else if (currentChartType === 'tech-table') {
      window.renderTechIndicatorsTable(klines, symbol, currentCryptoInterval);
    } else {
      await renderPriceLineChart(klines, symbol);
    }
    
  } catch (error) {

    showNotification('Ошибка загрузки графика: ' + error.message, 'error');
  }
}

// Helper function to fetch klines for comparison
window.loadCryptoDetailCharts = loadCryptoDetailCharts;

const fetchKlinesForComparison = async (symbol, interval) => {
  try {
    const intervalMap = {
      '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
      '1h': '1h', '2h': '2h', '4h': '4h', '1d': '1d',
      '1w': '1w', '1M': '1M', '1Y': '1M', 'all': '1w'
    };
    
    const binanceInterval = intervalMap[interval] || '1d';
    
    // Increased limit for accurate indicator calculations
    let limit = 500;
    if (interval === 'all') limit = 1000;
    
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=${binanceInterval}&limit=${limit}`;
    const response = await fetch(url);
    
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    return await response.json();
  } catch (error) {

    return null;
  }
}

// Удалена универсальная функция createCryptoChart - используем только модальное окно с dock mode

// Simple line chart for "Price" tab (like CoinMarketCap)
const renderPriceLineChart = async (klines, symbol) => {

  
  let container = document.getElementById('cryptoDetailPriceChart');
  if (!container) {

    return;
  }

  // In docked mode the original modal is hidden (display:none), so getElementById
  // returns the hidden copy first. Prefer the visible twin (docked clone) if one exists.
  if (container.clientWidth === 0 && container.clientHeight === 0) {
    const twins = document.querySelectorAll('#cryptoDetailPriceChart');
    for (const twin of twins) {
      if (twin !== container && (twin.clientWidth > 0 || twin.clientHeight > 0)) {

        container = twin;
        break;
      }
    }
  }
  
  // Remove indicators mode class if present
  const chartContainer = document.getElementById('tradingViewChartContainer');
  if (chartContainer) {
    chartContainer.classList.remove('indicators-mode');
  }

  // Восстанавливаем панель рисования (могла быть скрыта в режиме indicators/tech-table)
  const drawingToolbarPL = document.getElementById('cryptoDrawingToolbar');
  if (drawingToolbarPL) drawingToolbarPL.style.display = '';

  // OHLC не нужен в режиме area/line графика
  const ohlcEl = document.getElementById('chartOhlcDisplay');
  if (ohlcEl) ohlcEl.style.display = 'none';
  // Легенда остаётся видимой во всех режимах графика
  if (typeof LightweightCharts === 'undefined') {

    showNotification('Библиотека графиков не загружена', 'error');
    return;
  }
  
  // Destroy existing chart
  if (window.tvChart) {
    try {

      
      // Disconnect ResizeObserver
      if (window.chartResizeObserver && container) {
        try {
          window.chartResizeObserver.unobserve(container);

        } catch (e) {

        }
      }
      
      window.tvChart.remove();
      window.tvChart = null;

    } catch (e) {

    }
  }
  
  // Clear container
  container.innerHTML = '';
  
  // Убеждаемся что вся цепочка предков (включая модалку) видима,
  // иначе clientWidth/clientHeight будут 0 сколько бы мы ни ждали.
  // ВАЖНО: используем точный селектор .modal (не [class*="modal"]!) чтобы не поймать
  // .modal-content, .modal-header и т.д., которые могут иметь display:none из-за
  // родителя, даже когда сами по себе не hidden.
  const modalAncestor = container.closest('.modal, .modal-overlay-news, .modal-as-section');
  if (modalAncestor) {
    // В dock-режиме контейнер перенесён в .modal-as-section (видимый раздел) — не прерываем
    if (modalAncestor.classList.contains('modal-as-section')) {
      // OK — chart container is in the visible docked section
    } else {
      const st = window.getComputedStyle(modalAncestor);
      if (st.display === 'none' || st.visibility === 'hidden') {

        return;
      }
    }
  }

  // Force layout recalculation — два RAF гарантируют что CSS применился
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  
  // Ensure parent has dimensions
  const parentContainer = container.closest('.chart-area-wrapper') || container.parentElement;
  if (parentContainer) {
    const isMobile = window.innerWidth < 768;
    const minHeight = isMobile ? 300 : 500;
    // На мобильном chart-area-wrapper = position:absolute;inset:0 — clientHeight
    // должна быть уже правильной (55vh). Форсируем только если реально 0.
    void parentContainer.offsetHeight; // принудительный reflow перед проверкой
    if (!parentContainer.clientHeight || parentContainer.clientHeight < 50) {
      // Только min-height, НЕ height — не ломаем position:absolute sizing
      parentContainer.style.minHeight = `${minHeight}px`;

    }
    // Fix width: 0 that occurs when flex-basis:0% hasn't resolved yet
    if (!parentContainer.clientWidth) {
      parentContainer.style.width = '100%';
      void parentContainer.offsetWidth;  // force synchronous reflow

    }
  }
  
  // Force minimum height/width on container itself
  // NOTE: use setProperty with 'important' to override any CSS !important rules
  if (!container.clientHeight || container.clientHeight < 100) {
    const minHeight = window.innerWidth < 768 ? 300 : 500;
    container.style.setProperty('min-height', `${minHeight}px`, 'important');
    container.style.setProperty('height', `${minHeight}px`, 'important');
    void container.offsetHeight; // force reflow

  }
  if (!container.clientWidth) {
    container.style.setProperty('width', '100%', 'important');
    void container.offsetWidth;
  }

  // Wait for dimensions with smart retry logic
  let retries = 0;
  const maxRetries = 15;
  while ((!container.clientWidth || !container.clientHeight) && retries < maxRetries) {

    
    // Progressive delay: faster retries initially, then slower
    const delay = retries < 5 ? 50 : (retries < 10 ? 100 : 200);
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Force reflow every few attempts
    if (retries % 3 === 0) {
      void container.offsetHeight; // Force reflow
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    
    retries++;
  }
  
  // Final check with explicit fallback
  if (!container.clientWidth || !container.clientHeight) {

    
    // Last resort: force absolute dimensions (setProperty overrides CSS !important)
    const fallbackHeight = window.innerWidth < 768 ? 300 : 500;
    container.style.setProperty('width', '100%', 'important');
    container.style.setProperty('height', `${fallbackHeight}px`, 'important');
    container.style.setProperty('min-height', `${fallbackHeight}px`, 'important');
    container.style.setProperty('position', 'relative', 'important');
    
    // Wait one more time
    await new Promise(resolve => setTimeout(resolve, 200));
    
    if (!container.clientHeight) {
      // Walk up DOM (but stop before body/html) to find a visible ancestor with real width
      const isMobileChart = window.innerWidth < 768;
      let rectWidth = 0;
      let ancestor = container.parentElement;
      while (ancestor && ancestor !== document.body && ancestor !== document.documentElement) {
        const r = ancestor.getBoundingClientRect();
        if (r.width > 0) {
          rectWidth = Math.round(r.width);
          break;
        }
        ancestor = ancestor.parentElement;
      }
      // Try modal content as last resort for width
      if (!rectWidth) {
        const mc = container.closest('.modal-content, .docked-body, .docked-container');
        if (mc) rectWidth = Math.round(mc.getBoundingClientRect().width);
      }
      // Always use a fixed chart height — never derive from ancestor rect (could be page height)
      const rectHeight = isMobileChart ? 300 : 500;
      rectWidth = rectWidth || Math.round(window.innerWidth * (isMobileChart ? 0.95 : 0.8));

      // Force explicit pixel dimensions so clientWidth/clientHeight become non-zero
      container.style.setProperty('width',      `${rectWidth}px`,  'important');
      container.style.setProperty('height',     `${rectHeight}px`, 'important');
      container.style.setProperty('min-height', `${rectHeight}px`, 'important');
      container.style.setProperty('position',   'relative',        'important');
      container.style.setProperty('display',    'block',           'important');

    }
    

  }
  

  
  // Prepare line data (using close prices)
  const lineData = klines.map(k => ({
    time: Math.floor(k[0] / 1000),
    value: parseFloat(k[4]) // close price
  })).sort((a, b) => a.time - b.time);
  
  // Сохраняем 24-часовое изменение в глобальной переменной
  window.current24hChange = 0;
  try {
    const ticker24h = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}USDT`);
    const data24h = await ticker24h.json();
    window.current24hChange = parseFloat(data24h.priceChangePercent) || 0;
  } catch (e) {

  }
  

  
  // Load comparison data BEFORE creating chart if needed
  let originalCompareData = null;
  let compareFirstPrice = null;
  let compareLineData = null;
  
  if (compareSymbol) {
    try {

      const compareKlines = await fetchKlinesForComparison(compareSymbol, currentCryptoInterval);
      
      if (compareKlines && compareKlines.length > 0) {
        compareLineData = compareKlines.map(k => ({
          time: Math.floor(k[0] / 1000),
          value: parseFloat(k[4])
        })).sort((a, b) => a.time - b.time);
        
        originalCompareData = compareLineData;
        compareFirstPrice = compareLineData[0].value;

        
        // Сохраняем 24-часовое изменение для сравниваемой криптовалюты
        window.compare24hChange = 0;
        try {
          const compareData24h = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${compareSymbol}USDT`).then(r => r.json());
          window.compare24hChange = parseFloat(compareData24h?.priceChangePercent) || 0;
        } catch (e) {

        }
      }
    } catch (error) {

    }
  }
  
  try {
    // Убеждаемся что контейнер видим и имеет размеры
    const width = container.clientWidth || 1000;
    const height = container.clientHeight || 550;
    
    // Если контейнер не имеет размеров, ждем немного
    if (width < 100 || height < 100) {

      await new Promise(resolve => setTimeout(resolve, 100));
    }
    

    
    // Get crypto color
    const cryptoInfo = window.CRYPTO_INFO?.[symbol] || { color: '#3b82f6' };
    
    window.tvChart = LightweightCharts.createChart(container, {
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
    

    // Захватываем локальную ссылку — она не будет обнулена другими async-вызовами
    const localTvChart = window.tvChart;
    
    // Check if we need percentage mode (when comparing)
    const usePercentageMode = compareSymbol !== null && originalCompareData !== null;
    
    if (usePercentageMode) {
      // Synchronize data - use only common timestamps
      const mainTimes = new Set(lineData.map(d => d.time));
      const compareTimes = new Set(originalCompareData.map(d => d.time));
      const commonTimes = new Set([...mainTimes].filter(t => compareTimes.has(t)));
      
      // Filter both datasets to only common times
      const syncedLineData = lineData.filter(d => commonTimes.has(d.time));
      const syncedCompareData = originalCompareData.filter(d => commonTimes.has(d.time));
      

      
      // In comparison mode, normalize data to percentage
      const firstPrice = syncedLineData[0].value;
      const normalizedLineData = syncedLineData.map(d => ({
        time: d.time,
        value: ((d.value - firstPrice) / firstPrice) * 100
      }));
      
      // Add line series for main symbol (percentage mode)
      lineSeries = window.tvChart.addLineSeries({
        color: cryptoInfo.color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      
      lineSeries.setData(normalizedLineData);

      
      // Configure price scale for percentage
      window.tvChart.applyOptions({
        rightPriceScale: {
          borderColor: 'rgba(197, 203, 206, 0.4)',
          mode: 0, // Normal mode
        },
      });
      
      // Add synced comparison line
      if (syncedCompareData.length > 0) {
        const compareFirstPriceSync = syncedCompareData[0].value;
        const normalizedCompareData = syncedCompareData.map(d => ({
          time: d.time,
          value: ((d.value - compareFirstPriceSync) / compareFirstPriceSync) * 100
        }));
        
        const compareInfo = window.CRYPTO_INFO?.[compareSymbol] || { color: '#ef4444' };
        
        compareSeriesLine = window.tvChart.addLineSeries({
          color: compareInfo.color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        
        compareSeriesLine.setData(normalizedCompareData);

      }
    } else {
      // Normal mode - absolute prices
      lineSeries = window.tvChart.addAreaSeries({
        lineColor: cryptoInfo.color,
        topColor: cryptoInfo.color + '80',
        bottomColor: cryptoInfo.color + '00',
        lineWidth: 2,
        priceLineVisible: false,
      });
      
      lineSeries.setData(lineData);

      // Маркеры покупок из Аналитики
      if (typeof window.applyBuyMarkersFromAnalytics === 'function') {
        window.applyBuyMarkersFromAnalytics(lineSeries, lineData);
      }
    }
    
    // Update legend (always, regardless of comparison)
    // Используем 24-часовое изменение из API вместо изменения за период графика
    let change24h = 0;
    try {
      const ticker24h = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}USDT`);
      const data24h = await ticker24h.json();
      change24h = parseFloat(data24h.priceChangePercent) || 0;
    } catch (e) {

    }
    
    const symbol1Data = {
      price: lineData[lineData.length - 1].value,
      change: change24h
    };
    
    if (compareSymbol && originalCompareData) {
      // Получаем 24-часовое изменение для сравниваемой криптовалюты
      let compareChange24h = 0;
      try {
        const compareTicker = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${compareSymbol}USDT`);
        const compareData24h = await compareTicker.json();
        compareChange24h = parseFloat(compareData24h.priceChangePercent) || 0;
      } catch (e) {

      }
      
      const symbol2Data = {
        price: originalCompareData[originalCompareData.length - 1].value,
        change: compareChange24h
      };
      updateChartLegend(symbol1Data, symbol2Data);
    } else {
      updateChartLegend(symbol1Data, null);
    }
    
    // Fit content и принудительное обновление
    // Проверяем что наш chart всё ещё актуален (не был уничтожен пока мы ждали)
    if (localTvChart && window.tvChart === localTvChart && typeof localTvChart.timeScale === 'function') {
      try { 
        localTvChart.timeScale().fitContent(); 
        // Принудительное обновление размеров после загрузки данных
        await new Promise(resolve => setTimeout(resolve, 50));
        // Повторная проверка после await — за это время chart мог быть уничтожен
        if (window.tvChart !== localTvChart) {

        } else {
          const newWidth = container.clientWidth || width;
          const newHeight = container.clientHeight || height;
          if (newWidth > 0 && newHeight > 0) {
            localTvChart.applyOptions({ width: newWidth, height: newHeight });
          }

        }
      }
      catch (_) {}
    } else {

    }
    
    // Handle resize
    const resizeObserver = new ResizeObserver(entries => {
      if (window.tvChart && entries.length > 0) {
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) {
          window.tvChart.applyOptions({ width, height });
        }
      }
    });
    
    resizeObserver.observe(container);
    
    // Create tooltip element
    const tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip';
    container.appendChild(tooltip);
    
    // Store original data for tooltip (absolute prices)
    const originalLineData = lineData;
    const firstPrice = lineData[0].value;
    
    // Store current series globally
    window.currentSeries = lineSeries;
    // Инициализация инструментов разметки
    document.dispatchEvent(new CustomEvent('lwcChartReady', {
      detail: {
        chart:       localTvChart,
        series:      lineSeries,
        containerId: 'chartAreaWrapper',
        toolbarId:   'cryptoDrawingToolbar',
      },
    }));

    // Add click handler for pin marker (only works in pin mode)
    const handlePinClick = (e) => {
      if (!isPinModeActive) return;
      
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      
      // Get time from click position
      if (!(window.tvChart && typeof window.tvChart.timeScale === 'function')) return;
      const timeScale = window.tvChart.timeScale();
      const time = timeScale ? timeScale.coordinateToTime(x) : null;
      
      if (time) {
        // Find closest data point
        const closestData = originalLineData.reduce((prev, curr) => {
          return Math.abs(curr.time - time) < Math.abs(prev.time - time) ? curr : prev;
        });
        
        // Toggle pin
        if (globalPinnedData && Math.abs(globalPinnedData.time - closestData.time) < 3600) {
          // Remove if clicking near the same pin
          if (globalPinnedMarker) {
            lineSeries.removePriceLine(globalPinnedMarker);
            globalPinnedMarker = null;
            globalPinnedData = null;
          }
        } else {
          // Remove old marker if exists
          if (globalPinnedMarker) {
            try {
              lineSeries.removePriceLine(globalPinnedMarker);
            } catch (e) {

            }
          }
          
          // Create new pin marker
          globalPinnedData = closestData;
          globalPinnedMarker = lineSeries.createPriceLine({
            price: usePercentageMode ? ((closestData.value - firstPrice) / firstPrice) * 100 : closestData.value,
            color: '#f59e0b',
            lineWidth: 2,
            lineStyle: 2,
            axisLabelVisible: true,
            title: '',
          });
          

        }
      }
    };
    
    container.addEventListener('click', handlePinClick);
    
    // Subscribe to crosshair move for tooltip
    if (!localTvChart) {

      return;
    }
    
    localTvChart.subscribeCrosshairMove(param => {
      // If pin is locked, show pinned data in tooltip
      if (isPinModeActive && globalPinnedData) {
        const date = new Date(globalPinnedData.time * 1000);
        const dateStr = date.toLocaleString('en-US', { 
          month: '2-digit', 
          day: '2-digit', 
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });
        
        const priceChange = usePercentageMode ? 
          ((globalPinnedData.value - firstPrice) / firstPrice * 100) : 
          ((globalPinnedData.value - firstPrice) / firstPrice * 100);
        
        const cryptoInfo = window.CRYPTO_INFO?.[symbol] || { color: '#3b82f6' };
        
        let tooltipHTML = `<div class="chart-tooltip-time">${dateStr}</div>`;
        
        if (mainSeriesVisible) {
          tooltipHTML += `
            <div class="chart-tooltip-row">
              <div class="chart-tooltip-label">
                <div class="chart-tooltip-dot" style="background: ${cryptoInfo.color};"></div>
                Price (${symbol})
              </div>
              <div>
                <span class="chart-tooltip-value">$${formatPrice(globalPinnedData.value)}</span>
                <span class="chart-tooltip-change ${priceChange >= 0 ? 'positive' : 'negative'}">
                  (${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%)
                </span>
              </div>
            </div>
          `;
        }
        
        if (compareSymbol && compareSeriesLine && compareSeriesVisible && originalCompareData) {
          const compareDataPoint = originalCompareData.find(d => Math.abs(d.time - globalPinnedData.time) < 60);
          if (compareDataPoint) {
            const compareChange = ((compareDataPoint.value - compareFirstPrice) / compareFirstPrice * 100);
            const compareInfo = window.CRYPTO_INFO?.[compareSymbol] || { color: '#f59e0b' };
            
            tooltipHTML += `
              <div class="chart-tooltip-row">
                <div class="chart-tooltip-label">
                  <div class="chart-tooltip-dot" style="background: ${compareInfo.color};"></div>
                  Price (${compareSymbol})
                </div>
                <div>
                  <span class="chart-tooltip-value">$${formatPrice(compareDataPoint.value)}</span>
                  <span class="chart-tooltip-change ${compareChange >= 0 ? 'positive' : 'negative'}">
                    (${compareChange >= 0 ? '+' : ''}${compareChange.toFixed(2)}%)
                  </span>
                </div>
              </div>
            `;
          }
        }
        
        tooltip.innerHTML = tooltipHTML;
        tooltip.style.display = 'block';
        
        // Position pinned tooltip below OHLC display (left side, but lower)
        tooltip.style.left = '15px';
        tooltip.style.right = 'auto';
        tooltip.style.top = '90px'; // Below OHLC display
        tooltip.style.bottom = 'auto';
        
        // Update OHLC with pinned data
        updateOHLCDisplay(globalPinnedData.value, globalPinnedData.value, globalPinnedData.value, globalPinnedData.value, 0);
        
        return;
      }
      
      if (!param.time || !param.point) {
        tooltip.style.display = 'none';
        return;
      }
      
      const data = param.seriesData.get(lineSeries);
      if (!data) {
        tooltip.style.display = 'none';
        return;
      }
      
      // Get original price value (not normalized percentage)
      const originalData = originalLineData.find(d => d.time === param.time);
      const value = originalData ? originalData.value : (usePercentageMode ? firstPrice * (1 + data.value / 100) : data.value);
      
      // Update OHLC display
      updateOHLCDisplay(value, value, value, value, 0);
      
      // Рассчитываем процент изменения от предыдущей точки на графике
      const currentIndex = originalLineData.findIndex(d => d.time === param.time);
      let priceChange = 0;
      if (currentIndex > 0) {
        const prevValue = originalLineData[currentIndex - 1].value;
        priceChange = ((value - prevValue) / prevValue) * 100;
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
      if (mainSeriesVisible) {
        tooltipHTML += `
          <div class="chart-tooltip-row">
            <div class="chart-tooltip-label">
              <div class="chart-tooltip-dot" style="background: ${cryptoInfo.color};"></div>
              Price (${symbol})
            </div>
            <div>
              <span class="chart-tooltip-value">$${formatPrice(value)}</span>
              <span class="chart-tooltip-change ${priceChange >= 0 ? 'positive' : 'negative'}">
                (${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%)
              </span>
            </div>
          </div>
        `;
      }
      
      // Add comparison data if available and visible
      if (compareSymbol && compareSeriesLine && compareSeriesVisible && originalCompareData) {
        const compareData = param.seriesData.get(compareSeriesLine);
        if (compareData) {
          // Get original compare price (not normalized percentage)
          const originalCompare = originalCompareData.find(d => d.time === param.time);
          const compareValue = originalCompare ? originalCompare.value : (usePercentageMode ? compareFirstPrice * (1 + compareData.value / 100) : compareData.value);
          
          // Рассчитываем процент изменения от предыдущей точки
          const compareIndex = originalCompareData.findIndex(d => d.time === param.time);
          let compareChange = 0;
          if (compareIndex > 0) {
            const prevCompareValue = originalCompareData[compareIndex - 1].value;
            compareChange = ((compareValue - prevCompareValue) / prevCompareValue) * 100;
          }
          
          const compareInfo = window.CRYPTO_INFO?.[compareSymbol] || { color: '#f59e0b' };
          
          tooltipHTML += `
            <div class="chart-tooltip-row">
              <div class="chart-tooltip-label">
                <div class="chart-tooltip-dot" style="background: ${compareInfo.color};"></div>
                Price (${compareSymbol})
              </div>
              <div>
                <span class="chart-tooltip-value">$${formatPrice(compareValue)}</span>
                <span class="chart-tooltip-change ${compareChange >= 0 ? 'positive' : 'negative'}">
                  (${compareChange >= 0 ? '+' : ''}${compareChange.toFixed(2)}%)
                </span>
              </div>
            </div>
          `;
        }
      }
      
      // Add volume if available
      const volume = klines.find(k => Math.floor(k[0] / 1000) === param.time)?.[5];
      if (volume) {
        const volumeFormatted = parseFloat(volume) >= 1e9 
          ? `$${(parseFloat(volume) / 1e9).toFixed(2)}B`
          : parseFloat(volume) >= 1e6
          ? `$${(parseFloat(volume) / 1e6).toFixed(2)}M`
          : `$${parseFloat(volume).toFixed(2)}`;
        tooltipHTML += `<div class="chart-tooltip-volume">Vol 24h: ${volumeFormatted}</div>`;
      }
      
      tooltip.innerHTML = tooltipHTML;
      tooltip.style.display = 'block';
      
      // Position tooltip
      const chartRect = container.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      
      let left = param.point.x + 15;
      let top = param.point.y + 15;
      
      // Keep tooltip inside container
      if (left + tooltipRect.width > chartRect.width) {
        left = param.point.x - tooltipRect.width - 15;
      }
      if (top + tooltipRect.height > chartRect.height) {
        top = param.point.y - tooltipRect.height - 15;
      }
      
      // Reset positioning styles (remove 'right' and 'bottom' if they were set for pinned tooltip)
      tooltip.style.left = left + 'px';
      tooltip.style.right = 'auto';
      tooltip.style.top = top + 'px';
      tooltip.style.bottom = 'auto';
    });
    
    // Add ResizeObserver to handle container size changes
    if (!window.chartResizeObserver) {
      window.chartResizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          
          // Only resize if dimensions are valid
          if (width > 100 && height > 100 && window.tvChart) {
            try {
              requestAnimationFrame(() => {
                if (window.tvChart) {
                  window.tvChart.applyOptions({ 
                    width, 
                    height 
                  });

                }
              });
            } catch (e) {

            }
          }
        }
      });
    }
    
    // Observe container
    if (container && window.chartResizeObserver) {
      window.chartResizeObserver.observe(container);
    }
    
  } catch (error) {

    showNotification('Ошибка создания графика', 'error');
  }
}

const renderTradingViewChart = async (klines, symbol) => {

  
  let container = document.getElementById('cryptoDetailPriceChart');
  if (!container) {

    return;
  }

  // In docked mode the original modal is hidden — prefer visible twin
  if (container.clientWidth === 0 && container.clientHeight === 0) {
    const twins = document.querySelectorAll('#cryptoDetailPriceChart');
    for (const twin of twins) {
      if (twin !== container && (twin.clientWidth > 0 || twin.clientHeight > 0)) {

        container = twin;
        break;
      }
    }
  }
  
  // Remove indicators mode class and restore OHLC
  const chartContainer = document.getElementById('tradingViewChartContainer');
  if (chartContainer) {
    chartContainer.classList.remove('indicators-mode');
  }

  // Восстанавливаем панель рисования (могла быть скрыта в режиме indicators/tech-table)
  const drawingToolbar = document.getElementById('cryptoDrawingToolbar');
  if (drawingToolbar) drawingToolbar.style.display = '';

  // Принудительный reflow — нужен чтобы браузер применил стили до измерения размеров
  void container.offsetHeight;

  const ohlc = document.getElementById('chartOhlcDisplay');
  if (ohlc) ohlc.style.display = 'flex';
  
  // Restore legend for TradingView mode
  const legend = document.getElementById('chartLegend');
  if (legend) legend.style.display = 'flex';
  

  
  // Check if LightweightCharts is available
  if (typeof LightweightCharts === 'undefined') {

    showNotification('Библиотека графиков не загружена', 'error');
    return;
  }
  
  // Destroy existing chart before creating new one
  if (window.tvChart) {
    try {

      
      // Disconnect ResizeObserver
      if (window.chartResizeObserver && container) {
        try {
          window.chartResizeObserver.unobserve(container);
        } catch (e) {

        }
      }
      
      window.tvChart.remove();
      window.tvChart = null;
      candlestickSeries = null;
      volumeSeries = null;

    } catch (e) {

    }
  }
  
  // Clear container
  container.innerHTML = '';
  
  // Force layout recalculation
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  
  // Ensure parent has dimensions
  const parentContainer = container.closest('.chart-area-wrapper') || container.parentElement;
  if (parentContainer && (!parentContainer.clientHeight || parentContainer.clientHeight < 100)) {
    // Force minimum height on parent
    const minHeight = window.innerWidth < 768 ? 300 : 500;
    parentContainer.style.minHeight = `${minHeight}px`;
    parentContainer.style.height = `${minHeight}px`;

  }
  
  // Force minimum height on container itself
  if (!container.style.minHeight || parseInt(container.style.minHeight) < 100) {
    const minHeight = window.innerWidth < 768 ? 300 : 500;
    container.style.minHeight = `${minHeight}px`;
    if (!container.style.height || container.style.height === '0px') {
      container.style.height = `${minHeight}px`;
    }

  }
  
  // Wait for dimensions with smart retry logic
  let retries = 0;
  const maxRetries = 15;
  while ((!container.clientWidth || !container.clientHeight) && retries < maxRetries) {

    
    // Progressive delay: faster retries initially, then slower
    const delay = retries < 5 ? 50 : (retries < 10 ? 100 : 200);
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Force reflow every few attempts
    if (retries % 3 === 0) {
      void container.offsetHeight; // Force reflow
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    
    retries++;
  }
  
  // Final check with explicit fallback
  if (!container.clientWidth || !container.clientHeight) {

    
    // Last resort: force absolute dimensions (setProperty overrides CSS !important)
    const fallbackHeight = window.innerWidth < 768 ? 300 : 500;
    container.style.setProperty('width', '100%', 'important');
    container.style.setProperty('height', `${fallbackHeight}px`, 'important');
    container.style.setProperty('min-height', `${fallbackHeight}px`, 'important');
    container.style.setProperty('position', 'relative', 'important');
    
    // Wait one more time
    await new Promise(resolve => setTimeout(resolve, 200));
    
    if (!container.clientHeight) {

      showNotification('Не удалось загрузить график', 'error');
      return;
    }
    

  }
  

  
  // Prepare data
  const candleData = klines.map(k => ({
    time: Math.floor(k[0] / 1000),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4])
  })).sort((a, b) => a.time - b.time);
  
  const volumeData = klines.map(k => ({
    time: Math.floor(k[0] / 1000),
    value: parseFloat(k[5]),
    color: parseFloat(k[4]) >= parseFloat(k[1]) ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)'
  })).sort((a, b) => a.time - b.time);
  



  
  // Сохраняем 24-часовое изменение в глобальной переменной
  window.current24hChange = 0;
  try {
    const ticker24h = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}USDT`);
    const data24h = await ticker24h.json();
    window.current24hChange = parseFloat(data24h.priceChangePercent) || 0;
  } catch (e) {

  }
  
  // Load comparison data BEFORE creating chart if needed
  let originalCompareData = null;
  let compareFirstPrice = null;
  
  if (compareSymbol) {
    try {

      const compareKlines = await fetchKlinesForComparison(compareSymbol, currentCryptoInterval);
      
      if (compareKlines && compareKlines.length > 0) {
        originalCompareData = compareKlines.map(k => ({
          time: Math.floor(k[0] / 1000),
          close: parseFloat(k[4])
        })).sort((a, b) => a.time - b.time);
        
        compareFirstPrice = originalCompareData[0].close;

      }
    } catch (error) {

    }
  }
  
  try {
    // Create chart with explicit dimensions
    const width = container.clientWidth || 600;
    const height = container.clientHeight || 400;
    
    if (width < 50 || height < 50) {

      return;
    }
    

    
    window.tvChart = LightweightCharts.createChart(container, {
      width: width,
      height: height,
      layout: {
        background: { color: '#1a1d28' },
        textColor: '#d1d5db',
      },
      grid: {
        vertLines: { color: '#2a2d3a' },
        horzLines: { color: '#2a2d3a' },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: {
          color: '#6366f1',
          width: 1,
          style: LightweightCharts.LineStyle.Dashed,
        },
        horzLine: {
          color: '#6366f1',
          width: 1,
          style: LightweightCharts.LineStyle.Dashed,
        },
      },
      rightPriceScale: {
        borderColor: '#2a2d3a',
        scaleMargins: {
          top: 0.1,
          bottom: 0.2,
        },
      },
      timeScale: {
        borderColor: '#2a2d3a',
        timeVisible: true,
        secondsVisible: false,
      },
      localization: {
        priceFormatter: price => {
          return '$' + (price < 1 ? price.toFixed(6) : price.toFixed(2));
        },
      },
    });
    

    
    // Check if we need percentage mode (when comparing)
    const usePercentageMode = compareSymbol !== null && originalCompareData !== null;
    
    if (usePercentageMode) {
      // Synchronize data - use only common timestamps
      const mainTimes = new Set(candleData.map(d => d.time));
      const compareTimes = new Set(originalCompareData.map(d => d.time));
      const commonTimes = new Set([...mainTimes].filter(t => compareTimes.has(t)));
      
      // Filter both datasets to only common times
      const syncedCandleData = candleData.filter(d => commonTimes.has(d.time));
      const syncedCompareData = originalCompareData.filter(d => commonTimes.has(d.time));
      

      
      // In comparison mode, use line series with percentage normalization
      const firstPrice = syncedCandleData[0].close;
      const normalizedCandleData = syncedCandleData.map(d => ({
        time: d.time,
        value: ((d.close - firstPrice) / firstPrice) * 100
      }));
      
      const cryptoInfo = window.CRYPTO_INFO?.[symbol] || { color: '#10b981' };
      
      // Use line series instead of candlesticks for comparison
      candlestickSeries = tvChart.addLineSeries({
        color: cryptoInfo.color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      
      candlestickSeries.setData(normalizedCandleData);

      
      // Configure price scale for normal mode
      window.tvChart.applyOptions({
        rightPriceScale: {
          borderColor: '#2a2d3a',
          mode: 0, // Normal mode
          scaleMargins: {
            top: 0.1,
            bottom: 0.1,
          },
        },
      });
      
      // Add synced comparison line
      if (syncedCompareData.length > 0) {
        const compareFirstPriceSync = syncedCompareData[0].close;
        const normalizedCompareData = syncedCompareData.map(d => ({
          time: d.time,
          value: ((d.close - compareFirstPriceSync) / compareFirstPriceSync) * 100
        }));
        
        const compareInfo = window.CRYPTO_INFO?.[compareSymbol] || { color: '#ef4444' };
        
        compareSeriesCandle = window.tvChart.addLineSeries({
          color: compareInfo.color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        
        compareSeriesCandle.setData(normalizedCompareData);

      }
    } else {
      // Normal mode - candlesticks
      candlestickSeries = tvChart.addCandlestickSeries({
        upColor: '#10b981',
        downColor: '#ef4444',
        borderUpColor: '#10b981',
        borderDownColor: '#ef4444',
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
      });
      

      
      candlestickSeries.setData(candleData);

      // Маркеры покупок из Аналитики
      if (typeof window.applyBuyMarkersFromAnalytics === 'function') {
        window.applyBuyMarkersFromAnalytics(candlestickSeries, candleData);
      }
    }
    
    // Add volume series (only in non-comparison mode)
    if (!usePercentageMode) {
      volumeSeries = tvChart.addHistogramSeries({
        color: '#26a69a',
        priceFormat: {
          type: 'volume',
        },
        priceScaleId: '',
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        },
      });
      

      
      volumeSeries.setData(volumeData);

    }
    
    // Update legend (only for Price mode, not TradingView)
    if (currentChartType !== 'tradingview') {
      // Используем 24-часовое изменение из API вместо изменения за период графика
      let change24h = 0;
      try {
        const ticker24h = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}USDT`);
        const data24h = await ticker24h.json();
        change24h = parseFloat(data24h.priceChangePercent) || 0;
      } catch (e) {

      }
      
      const symbol1Data = {
        price: candleData[candleData.length - 1].close,
        change: change24h
      };
      
      if (compareSymbol && originalCompareData) {
        // Получаем 24-часовое изменение для сравниваемой криптовалюты
        let compareChange24h = 0;
        try {
          const compareTicker = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${compareSymbol}USDT`);
          const compareData24h = await compareTicker.json();
          compareChange24h = parseFloat(compareData24h.priceChangePercent) || 0;
        } catch (e) {

        }
        
        const symbol2Data = {
          price: originalCompareData[originalCompareData.length - 1].close,
          change: compareChange24h
        };
        updateChartLegend(symbol1Data, symbol2Data);
      } else {
        updateChartLegend(symbol1Data, null);
      }
    } else {
      // Hide legend in TradingView mode
      const chartLegend = document.getElementById('chartLegend');
      if (chartLegend) {
        chartLegend.style.display = 'none';
      }
    }
    
    // Fit content и принудительное обновление
    if (window.tvChart && typeof window.tvChart.timeScale === 'function') {
      try {
        window.tvChart.timeScale().fitContent();
        // Принудительное обновление размеров после загрузки данных
        await new Promise(resolve => setTimeout(resolve, 50));
        if (window.tvChart) {
          const newWidth = container.clientWidth || width;
          const newHeight = container.clientHeight || height;
          if (newWidth > 0 && newHeight > 0) {
            window.tvChart.applyOptions({ width: newWidth, height: newHeight });
          }
        }

      } catch (e) {

      }
    } else {

    }
    
    // Handle resize
    const resizeObserver = new ResizeObserver(entries => {
      if (window.tvChart && entries.length > 0) {
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) {
          try {
            window.tvChart.applyOptions({ width, height });
          } catch (e) {

          }
        }
      }
    });
    
    resizeObserver.observe(container);
    
    // Store current series globally for pin functionality
    window.currentSeries = candlestickSeries;
    // Инициализация инструментов разметки
    document.dispatchEvent(new CustomEvent('lwcChartReady', {
      detail: {
        chart:       window.tvChart,
        series:      candlestickSeries,
        containerId: 'chartAreaWrapper',
        toolbarId:   'cryptoDrawingToolbar',
      },
    }));

    // Add click handler for pin marker (only works in pin mode)
    const handleCandlePinClick = (e) => {
      if (!isPinModeActive) return;
      
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      
      // Get time from click position
      if (!(window.tvChart && typeof window.tvChart.timeScale === 'function')) return;
      const timeScale = window.tvChart.timeScale();
      const time = timeScale ? timeScale.coordinateToTime(x) : null;
      
      if (time) {
        // Find closest data point
        const closestData = candleData.reduce((prev, curr) => {
          return Math.abs(curr.time - time) < Math.abs(prev.time - time) ? curr : prev;
        });
        
        // Toggle pin
        if (globalPinnedData && Math.abs(globalPinnedData.time - closestData.time) < 3600) {
          // Remove if clicking near the same pin
          if (globalPinnedMarker) {
            candlestickSeries.removePriceLine(globalPinnedMarker);
            globalPinnedMarker = null;
            globalPinnedData = null;
          }
        } else {
          // Remove old marker if exists
          if (globalPinnedMarker) {
            try {
              candlestickSeries.removePriceLine(globalPinnedMarker);
            } catch (e) {

            }
          }
          
          // Create new pin marker
          globalPinnedData = closestData;
          globalPinnedMarker = candlestickSeries.createPriceLine({
            price: usePercentageMode ? 
              ((closestData.close - candleData[0].close) / candleData[0].close) * 100 : 
              closestData.close,
            color: '#f59e0b',
            lineWidth: 2,
            lineStyle: 2,
            axisLabelVisible: true,
            title: '',
          });
          

        }
      }
    };
    
    container.addEventListener('click', handleCandlePinClick);
    
    // Subscribe to crosshair move for OHLC updates only (no tooltip in TradingView mode)
    if (!window.tvChart) {

      return;
    }
    window.tvChart.subscribeCrosshairMove(param => {
      // If pin mode is active and there's pinned data, use it
      if (isPinModeActive && globalPinnedData) {
        updateOHLCDisplay(globalPinnedData.open, globalPinnedData.high, globalPinnedData.low, globalPinnedData.close, 0);
        return;
      }
      
      if (!param.time || !param.point) {
        return;
      }
      
      const data = param.seriesData.get(candlestickSeries);
      if (!data) {
        return;
      }
      
      // Update OHLC display based on mode
      if (usePercentageMode) {
        // In percentage mode, show percentage value
        const percentValue = data.value || 0;
        updateOHLCDisplay(percentValue, percentValue, percentValue, percentValue, percentValue);
      } else {
        // In normal mode, show OHLC
        const change = ((data.close - data.open) / data.open * 100);
        updateOHLCDisplay(data.open, data.high, data.low, data.close, change);
      }
    });
    

    
    // Add ResizeObserver to handle container size changes
    if (!window.chartResizeObserver) {
      window.chartResizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          
          // Only resize if dimensions are valid
          if (width > 100 && height > 100 && window.tvChart) {
            try {
              requestAnimationFrame(() => {
                if (window.tvChart) {
                  window.tvChart.applyOptions({ 
                    width, 
                    height 
                  });

                }
              });
            } catch (e) {

            }
          }
        }
      });
    }
    
    // Observe container
    if (container && window.chartResizeObserver) {
      window.chartResizeObserver.observe(container);
    }

    // Принудительный resize после создания графика на мобильных.
    // watchModalOpen в mobile-charts-fix.js стреляет в 100/300/600ms после открытия модалки,
    // но в этот момент window.tvChart ещё null (API-запрос ещё летит).
    // Поэтому форсируем resize здесь — сразу после того как чарт создан и данные загружены.
    if (window.innerWidth <= 768) {
      [0, 100, 300, 600].forEach(delay => {
        setTimeout(() => {
          if (!window.tvChart) return;
          const w = container.clientWidth;
          const h = container.clientHeight;
          if (w > 50 && h > 50) {
            try {
              window.tvChart.resize(w, h);
              window.tvChart.timeScale().fitContent();
            } catch (e) {}
          }
        }, delay);
      });
    }

  } catch (error) {

    showNotification('Ошибка создания графика: ' + error.message, 'error');
  }
}

window.addTransactionFromCrypto = function() {
  if (!window.currentCryptoSymbol) {
    showNotification('Выберите криптовалюту', 'error');
    return;
  }
  
  // Закрываем модальное окно с деталями
  window.app.closeModal('cryptoDetailModal');
  
  // Открываем форму добавления транзакции
  const modal = document.getElementById('transactionModal');
  if (!modal) return;
  
  // Закрываем перед открытием
  modal.classList.remove('active');
  setTimeout(() => {
    modal.style.display = '';
    modal.classList.add('active');

  }, 10);
  
  // Заполняем тип и дату
  const dateInput = document.getElementById('transactionDate');
  const typeSelect = document.getElementById('transactionType');
  
  if (typeSelect) typeSelect.value = 'BUY';
  
  // Правильное локальное время
  if (dateInput) {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const localTime = new Date(now - offset);
    dateInput.value = localTime.toISOString().slice(0, 16);
  }
  
  // Автоматически выбираем криптовалюту через новый dropdown
  if (window.cryptoList) {
    const crypto = window.cryptoList.find(c => c.symbol === window.currentCryptoSymbol);
    if (crypto) {
      selectCrypto(crypto.symbol, crypto.name, crypto.price);
    }
  }
  
  // Заполняем список портфелей
  populatePortfolioSelect();
};

window.addToWatchlist = async function() {
  try {
    const symbol = window.currentCryptoSymbol;
    if (!symbol) {
      showNotification('Символ не выбран', 'warning');
      return;
    }
    // Динамический импорт чтобы не ломать порядок загрузки скриптов
    const module = await import('../core/data.js');
    if (typeof module.addFavorite === 'function') {
      await module.addFavorite(symbol, { source: 'crypto_modal' });
      showNotification(`Добавлено в избранное: ${symbol}`, 'success');
      // Обновим favorites в dashboard если есть функция
      if (window.refreshFavorites) window.refreshFavorites();
    } else {
      showNotification('Функция избранного недоступна', 'error');
    }
  } catch (err) {

    showNotification('Ошибка при добавлении в избранное', 'error');
  }
};

// Добавь в конец ui.js - ИСПРАВЛЕНО: правильные ID и защита от дублирования
document.addEventListener('DOMContentLoaded', function() {

  
  // Обработчик кнопки "Создать портфель"
  const createPortfolioBtn = document.getElementById('createPortfolioBtn');
  if (createPortfolioBtn) {
    createPortfolioBtn.addEventListener('click', () => {

      const modal = document.getElementById('createPortfolioModal');
      if (modal) {
        modal.classList.remove('active');
        setTimeout(() => {
          modal.style.display = '';
          modal.classList.add('active');
        }, 10);
      }
    });
  }
  
  // Обработчик создания портфеля - ИСПРАВЛЕНО: правильный ID формы
  const portfolioForm = document.getElementById('createPortfolioForm');
  if (portfolioForm) {
    // Удаляем старые обработчики, чтобы избежать дублирования
    const newForm = portfolioForm.cloneNode(true);
    portfolioForm.parentNode.replaceChild(newForm, portfolioForm);
    
    newForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      
      const submitBtn = e.target.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Создание...';
      
      const name = document.getElementById('portfolioName')?.value.trim();
      const description = document.getElementById('portfolioDescription')?.value.trim() || '';
      const currency = document.getElementById('portfolioCurrency')?.value || 'USD';
      const riskLevel = document.getElementById('portfolioRisk')?.value || 'MEDIUM';

      if (!name) {
        alert('Введите название портфеля');
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
        return;
      }

      try {

        await createPortfolio(name, description, currency, riskLevel);

        
        window.app.closeModal('createPortfolioModal');
        newForm.reset();
        await loadPortfolios();
        showNotification('Портфель успешно создан!', 'success');
      } catch (error) {

        showNotification('Ошибка при создании портфеля: ' + error.message, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });

  } else {

  }

  // Custom dropdowns for Create Portfolio modal (currency and risk) — reuse trading-tools styles
  (() => {
    const setups = [
      {displayId: 'portfolioCurrencyDisplay', dropdownId: 'portfolioCurrencyDropdown', hiddenId: 'portfolioCurrency'},
      {displayId: 'portfolioRiskDisplay', dropdownId: 'portfolioRiskDropdown', hiddenId: 'portfolioRisk'}
    ];

    setups.forEach(({displayId, dropdownId, hiddenId}) => {
      const display = document.getElementById(displayId);
      const dropdown = document.getElementById(dropdownId);
      const hidden = document.getElementById(hiddenId);
      if (!display || !dropdown || !hidden) return;

      // Toggle dropdown
      display.addEventListener('click', (e) => {
        const opened = dropdown.style.display === 'block';
        closeAllPortfolioDropdowns();
        dropdown.style.display = opened ? 'none' : 'block';
        display.setAttribute('aria-expanded', String(!opened));
      });

      // Click on item
      dropdown.querySelectorAll('.tools-crypto-item').forEach(item => {
        item.addEventListener('click', (e) => {
          const value = item.dataset.value || item.textContent.trim();
          // update hidden input
          hidden.value = value;
          // update display label (use inner name if present)
          const nameEl = item.querySelector('.tools-crypto-name');
          if (nameEl) display.querySelector('.tools-crypto-name').textContent = nameEl.textContent.trim();
          else display.querySelector('.tools-crypto-name').textContent = value;
          dropdown.style.display = 'none';
          display.setAttribute('aria-expanded', 'false');
        });
      });
    });

    const closeAllPortfolioDropdowns = () => {
      document.querySelectorAll('#portfolioCurrencyDropdown, #portfolioRiskDropdown').forEach(d => {
        if (d) d.style.display = 'none';
      });
      document.querySelectorAll('#portfolioCurrencyDisplay, #portfolioRiskDisplay').forEach(d => {
        if (d) d.setAttribute('aria-expanded', 'false');
      });
    }

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#portfolioCurrencyDisplay') && !e.target.closest('#portfolioCurrencyDropdown')
          && !e.target.closest('#portfolioRiskDisplay') && !e.target.closest('#portfolioRiskDropdown')){
        closeAllPortfolioDropdowns();
      }
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAllPortfolioDropdowns();
    });
  })();

  // Обработчик транзакций
  const transactionForm = document.getElementById('transactionForm');
  if (transactionForm) {
    // Удаляем старые обработчики, чтобы избежать дублирования
    const newTransactionForm = transactionForm.cloneNode(true);
    transactionForm.parentNode.replaceChild(newTransactionForm, transactionForm);
    
    newTransactionForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      
      const submitBtn = e.target.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Добавление...';
      
      const portfolioId = document.getElementById('transactionPortfolio')?.value;
      const type = document.getElementById('transactionType')?.value;
      const symbol = document.getElementById('transactionSymbol')?.value.trim().toUpperCase();
      const quantity = parseFloat(document.getElementById('transactionQuantity')?.value);
      const price = parseFloat(document.getElementById('transactionPrice')?.value);
      const commission = parseFloat(document.getElementById('transactionCommission')?.value) || 0;
      const date = document.getElementById('transactionDate')?.value;

      if (!portfolioId || !symbol || !quantity || !price || !date) {
        alert('Заполните все обязательные поля');
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
        return;
      }

      if (quantity <= 0 || price <= 0) {
        alert('Количество и цена должны быть положительными числами');
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
        return;
      }

      try {

        await addTransaction(portfolioId, type, symbol, quantity, price, date);

        
        window.app.closeModal('transactionModal');
        newTransactionForm.reset();
        await loadTransactions();
        showNotification('Транзакция успешно добавлена!', 'success');
      } catch (error) {

        showNotification('Ошибка при добавлении транзакции: ' + error.message, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });

    // initialize visible transaction dropdown behaviors
    try {
      setupTransactionDropdowns();
    } catch (err) {

    }
  }
});

// === COMPARISON FUNCTIONS ===
window.toggleCompareDropdown = function() {
  const dropdown = document.getElementById('compareDropdownMenu');
  const btn = document.getElementById('compareBtn');
  
  if (dropdown.style.display === 'none') {
    dropdown.style.display = 'block';
    btn.classList.add('active');
    populateCompareList();
  } else {
    dropdown.style.display = 'none';
    btn.classList.remove('active');
  }
};

const populateCompareList = () => {
  const list = document.getElementById('compareList');
  if (!window.CRYPTO_INFO) {
    list.innerHTML = '<div style="padding: 1rem; text-align: center; color: #9ca3af;">Loading...</div>';
    return;
  }
  
  const cryptos = Object.entries(window.CRYPTO_INFO)
    .filter(([symbol]) => symbol !== window.currentCryptoSymbol)
    .sort((a, b) => (a[1].rank || 999) - (b[1].rank || 999))
    .slice(0, 20);
  
  list.innerHTML = '';
  
  cryptos.forEach(([symbol, info]) => {
    const item = document.createElement('div');
    item.className = 'compare-list-item';
    if (compareSymbol === symbol) {
      item.classList.add('selected');
    }
    
    // Create icon container
    const iconDiv = document.createElement('div');
    iconDiv.className = 'compare-item-icon';
    iconDiv.style.background = info.color;
    
    // Create image element
    const img = document.createElement('img');
    const imgUrl = `https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`;
    img.src = imgUrl;
    img.alt = symbol;
    img.style.cssText = 'width: 100%; height: 100%; object-fit: contain;';
    
    // Multi-step fallback: CryptoIcons CDN → fa icon
    img.onerror = function() {
      if (!this.dataset.cryptoFallback) {
        this.dataset.cryptoFallback = '1';
        this.src = `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/32/icon/${symbol.toLowerCase()}.png`;
      } else {
        this.onerror = null;
        const fallbackIcon = document.createElement('i');
        fallbackIcon.className = `fab fa-${info.icon || 'bitcoin'}`;
        iconDiv.innerHTML = '';
        iconDiv.appendChild(fallbackIcon);
      }
    };
    
    iconDiv.appendChild(img);
    
    // Create info container
    const infoDiv = document.createElement('div');
    infoDiv.className = 'compare-item-info';
    infoDiv.innerHTML = `
      <div class="compare-item-name">${info.name}</div>
      <div class="compare-item-symbol">${symbol}</div>
    `;
    
    item.appendChild(iconDiv);
    item.appendChild(infoDiv);
    
    // Add click handler
    item.onclick = () => selectCompareSymbol(symbol);
    
    list.appendChild(item);
  });
}

window.selectCompareSymbol = async function(symbol) {

  
  // Toggle: если кликнули на уже выбранный - убираем его
  if (compareSymbol === symbol) {

    removeCompareSymbol();
    return;
  }
  
  compareSymbol = symbol;
  
  // Close dropdown
  document.getElementById('compareDropdownMenu').style.display = 'none';
  document.getElementById('compareBtn').classList.remove('active');
  
  // Update button with symbol and close button
  const btn = document.getElementById('compareBtn');
  btn.innerHTML = `
    <span>
      <i class="fas fa-check"></i> ${symbol}
    </span>
    <i class="fas fa-times" onclick="event.stopPropagation(); removeCompareSymbol();" style="margin-left: 0.5rem; opacity: 0.7;"></i>
  `;
  btn.classList.add('has-selection');
  
  // Show legend
  document.getElementById('chartLegend').style.display = 'flex';
  
  // Reload chart with comparison
  await window.loadCryptoDetailCharts(window.currentCryptoSymbol, currentCryptoInterval);
};

window.removeCompareSymbol = function() {

  compareSymbol = null;
  compareSeriesLine = null;
  compareSeriesCandle = null;
  
  // Reset visibility state
  compareSeriesVisible = true;
  
  // Reset button
  const btn = document.getElementById('compareBtn');
  btn.innerHTML = '<i class="fas fa-plus"></i> Compare';
  btn.classList.remove('has-selection');
  
  // Hide only second legend item, keep legend visible for main symbol
  const legend2 = document.getElementById('legend2');
  if (legend2) legend2.style.display = 'none';
  
  // Close dropdown if open
  const dropdown = document.getElementById('compareDropdownMenu');
  if (dropdown) dropdown.style.display = 'none';
  btn.classList.remove('active');
  
  // Reload chart without comparison
  window.loadCryptoDetailCharts(window.currentCryptoSymbol, currentCryptoInterval);
};

// Search in compare dropdown
document.addEventListener('DOMContentLoaded', function() {
  const searchInput = document.getElementById('compareSearch');
  if (searchInput) {
    searchInput.addEventListener('input', function(e) {
      const query = e.target.value.toLowerCase();
      const items = document.querySelectorAll('.compare-list-item');
      items.forEach(item => {
        const name = item.querySelector('.compare-item-name').textContent.toLowerCase();
        const symbol = item.querySelector('.compare-item-symbol').textContent.toLowerCase();
        if (name.includes(query) || symbol.includes(query)) {
          item.style.display = 'flex';
        } else {
          item.style.display = 'none';
        }
      });
    });
  }
});

const updateChartLegend = (symbol1Data, symbol2Data) => {
  const legend1 = document.getElementById('legend1');
  const legend2 = document.getElementById('legend2');
  
  if (!legend1 || !legend2) return;
  
  // Update primary symbol
  const info1 = window.CRYPTO_INFO?.[window.currentCryptoSymbol] || { color: '#3b82f6' };
  const color1 = legend1.querySelector('.legend-color');
  color1.style.background = info1.color;
  color1.className = 'legend-color' + (mainSeriesVisible ? '' : ' hidden');
  color1.onclick = () => toggleMainSeries();
  
  legend1.querySelector('.legend-symbol').textContent = window.currentCryptoSymbol;
  legend1.querySelector('.legend-price').textContent = '$' + symbol1Data.price.toLocaleString();
  const change1El = legend1.querySelector('.legend-change');
  change1El.textContent = (symbol1Data.change >= 0 ? '+' : '') + symbol1Data.change.toFixed(2) + '%';
  change1El.className = 'legend-change ' + (symbol1Data.change >= 0 ? 'positive' : 'negative');
  
  // Update compare symbol
  if (compareSymbol && symbol2Data) {
    const info2 = window.CRYPTO_INFO?.[compareSymbol] || { color: '#ef4444' };
    legend2.style.display = 'flex';
    const color2 = legend2.querySelector('.legend-color');
    color2.style.background = info2.color;
    color2.className = 'legend-color' + (compareSeriesVisible ? '' : ' hidden');
    color2.onclick = () => toggleCompareSeries();
    
    legend2.querySelector('.legend-symbol').textContent = compareSymbol;
    legend2.querySelector('.legend-price').textContent = '$' + symbol2Data.price.toLocaleString();
    const change2El = legend2.querySelector('.legend-change');
    change2El.textContent = (symbol2Data.change >= 0 ? '+' : '') + symbol2Data.change.toFixed(2) + '%';
    change2El.className = 'legend-change ' + (symbol2Data.change >= 0 ? 'positive' : 'negative');
  } else {
    legend2.style.display = 'none';
  }
}

const toggleMainSeries = () => {
  mainSeriesVisible = !mainSeriesVisible;
  
  if (currentChartType === 'price') {
    if (lineSeries) {
      lineSeries.applyOptions({ visible: mainSeriesVisible });
    }
  } else {
    if (candlestickSeries) {
      candlestickSeries.applyOptions({ visible: mainSeriesVisible });
    }
    if (volumeSeries) {
      volumeSeries.applyOptions({ visible: mainSeriesVisible });
    }
  }
  
  // Update legend color state
  const color1 = document.getElementById('legend1')?.querySelector('.legend-color');
  if (color1) {
    color1.className = 'legend-color' + (mainSeriesVisible ? '' : ' hidden');
  }
}

const toggleCompareSeries = () => {
  compareSeriesVisible = !compareSeriesVisible;
  
  if (currentChartType === 'price' && compareSeriesLine) {
    compareSeriesLine.applyOptions({ visible: compareSeriesVisible });
  } else if (currentChartType === 'tradingview' && compareSeriesCandle) {
    compareSeriesCandle.applyOptions({ visible: compareSeriesVisible });
  }
  
  // Update legend color state
  const color2 = document.getElementById('legend2')?.querySelector('.legend-color');
  if (color2) {
    color2.className = 'legend-color' + (compareSeriesVisible ? '' : ' hidden');
  }
}

window.toggleMainSeries = toggleMainSeries;
window.toggleCompareSeries = toggleCompareSeries;

// ============================================================================
// ОТКРЫТИЕ ДЕТАЛЬНОГО МОДАЛА ИЗ АНАЛИТИКИ (с панелью позиции + маркеры покупок)
// ============================================================================

/**
 * Сохраняет данные позиции и открывает модальное окно актива.
 * Вызывается при клике на строку в таблице аналитики.
 */
window.openDetailFromAnalytics = function(symbol, posJsonEncoded) {
  let posData = null;
  try {
    posData = JSON.parse(posJsonEncoded.replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
  } catch(e) {

  }

  // Сохраняем данные позиции — они подхватятся после рендера графика
  window._analyticsPosition = posData;

  const isStock = window.STOCK_INFO && window.STOCK_INFO[symbol];
  if (isStock) {
    window.showStockDetail(symbol);
  } else {
    window.showCryptoDetail(symbol);
  }
};

/**
 * Ставит маркеры покупок на серию Lightweight Charts.
 * Вызывается после setData.
 */
window.applyBuyMarkersFromAnalytics = function(series, chartData) {
  const pos = window._analyticsPosition;
  if (!pos || !pos.buyDates || pos.buyDates.length === 0) return;
  if (!series || typeof series.setMarkers !== 'function') return;

  const markers = pos.buyDates.map(bd => {
    const ts = Math.floor(new Date(bd.date).getTime() / 1000);
    // Находим ближайшую свечу
    const closest = chartData.reduce((prev, curr) =>
      Math.abs(curr.time - ts) < Math.abs(prev.time - ts) ? curr : prev
    , chartData[0]);
    return {
      time: closest.time,
      position: 'belowBar',
      color: '#22d3ee',
      shape: 'arrowUp',
      text: '▲ Куплено',
      size: 1.2,
    };
  });

  // Удаляем дубли по времени
  const seen = new Set();
  const unique = markers.filter(m => { if (seen.has(m.time)) return false; seen.add(m.time); return true; });

  try {
    series.setMarkers(unique);
  } catch(e) {

  }
  // Сбрасываем контекст — позиция применена однократно
  window._analyticsPosition = null;
};
// This MUST happen to ensure the new chart system is used instead of the old Chart.js one
if (!window.app) {
  window.app = {};

}


window.app.showCryptoDetail = window.showCryptoDetail;

// Verify the override worked
if (window.app.showCryptoDetail === window.showCryptoDetail) {

} else {

}

// Export other functions globally
window.initApp = initApp;
window.showSection = showSection;
window.setupMarketTabs = setupMarketTabs;
window.setupMarketSearch = setupMarketSearch;
window.setupMarketSort = setupMarketSort;
window.switchChartType = window.switchChartType || function() {}; // Already defined above
window.changeCryptoChartPeriod = window.changeCryptoChartPeriod || function() {}; // Already defined above
window.toggleChartScale = window.toggleChartScale || function() {}; // Already defined above



// Упрощенная функция для загрузки новостей
window.loadNewsDirect = function(category = 'all') {

  
  const container = document.getElementById('newsContainer');
  if (!container) {

    return;
  }
  
  container.innerHTML = `
    <div class="news-loading-state">
      <div class="loader-large"></div>
      <p>Загружаем актуальные новости...</p>
    </div>
  `;
  
  // Просто вызываем loadNews напрямую
  if (typeof window.loadNews === 'function') {
    window.loadNews(category);
  } else {

  }
};

// Функция для принудительной загрузки новостей
window.forceLoadNews = function() {

  if (typeof window.loadNews === 'function') {
    window.loadNews('all', true); // force refresh
  }
};

// Упрощенная версия scheduleLoadNews для новостей
window.scheduleNewsLoad = function() {

  
  // Проверяем, на вкладке ли новостей
  const newsSection = document.getElementById('newsSection');
  if (!newsSection || !newsSection.classList.contains('active')) {

    return;
  }
  
  // Загружаем новости с небольшой задержкой
  setTimeout(() => {
    if (typeof window.loadNews === 'function') {
      window.loadNews('all');
    } else {

      setTimeout(() => {
        if (typeof window.loadNews === 'function') {
          window.loadNews('all');
        }
      }, 500);
    }
  }, 100);
};

// Перехватываем переход на новости и загружаем сразу
const originalShowSection = showSection;
export const showSectionWithNews = (id) => {
  originalShowSection(id);
  
  if (id === 'news') {

    
    // Небольшая задержка для гарантии отрисовки DOM
    setTimeout(() => {
      const container = document.getElementById('newsContainer');
      if (container) {

        if (typeof window.loadNews === 'function') {
          window.loadNews('all');
        } else {

          // Пробуем еще раз через 500мс
          setTimeout(() => {
            if (typeof window.loadNews === 'function') {
              window.loadNews('all');
            }
          }, 500);
        }
      } else {

        setTimeout(() => {
          if (typeof window.loadNews === 'function') {
            window.loadNews('all');
          }
        }, 300);
      }
    }, 50);
  }
}

// Заменяем оригинальную функцию showSection
window.showSection = showSectionWithNews;

