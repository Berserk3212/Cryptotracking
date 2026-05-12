// init-improvements.js

import { initMarketSearch } from '../features/market/market-search.js';
import { initTransactionFilters } from '../features/transactions/transaction-filters.js';

export function initImprovements() {
    initMarketSearch();
    initTransactionFilters();
    initTransactionStats();
    initQuickFilters();
    initAssetSearch();
    initCurrencyChangeHandler();
}

function initTransactionStats() {
    setTimeout(() => {
        updateTransactionStats();
    }, 100);
    
    const observer = new MutationObserver(() => {
        updateTransactionStats();
    });
  
  const tbody = document.getElementById('transactionsTableBody');
  if (tbody) {
    observer.observe(tbody, { childList: true, subtree: true });
  }
}

function updateTransactionStats() {
  const tbody = document.getElementById('transactionsTableBody');
  if (!tbody) {
    return;
  }
  
  const rows = tbody.querySelectorAll('tr:not(.loading-row):not(.no-data)');
  
  let buyCount = 0;
  let sellCount = 0;
  let totalVolume = 0;
  let investedSum = 0;
  let receivedSum = 0;
  
  rows.forEach(row => {
    if (row.style.display === 'none') return;
    
    const cells = row.cells;
    if (!cells || cells.length < 6) return;
    
    const typeCell = cells[1];
    const sumCell = cells[5];
    
    if (typeCell && sumCell) {
      // Используем data-type атрибут из строки (устойчиво к переводу)
      const dataType = row.getAttribute('data-type');
      let isBuy = false;
      
      if (dataType) {
        isBuy = dataType === 'BUY';
      } else {
        // Фолбэк: проверяем класс транзакции
        const typeSpan = typeCell.querySelector('.transaction-type');
        if (typeSpan) {
          isBuy = typeSpan.classList.contains('buy');
        }
      }
      
      if (isBuy) {
        buyCount++;
      } else {
        sellCount++;
      }
      
      // Извлекаем число
      let sumText = sumCell.textContent || '';
      sumText = sumText.replace(/[^\d.,-]/g, '').replace(/,/g, '');
      const sum = parseFloat(sumText) || 0;
      totalVolume += Math.abs(sum);
      if (isBuy) investedSum += Math.abs(sum); else receivedSum += Math.abs(sum);
    }
  });
  
  // Обновляем UI
  const totalBuysEl = document.getElementById('totalBuys');
  const totalSellsEl = document.getElementById('totalSells');
  const totalTransactionsEl = document.getElementById('totalTransactions');
  const totalVolumeEl = document.getElementById('totalVolume');
  const totalInvestedEl = document.getElementById('totalInvested');
  const totalReceivedEl = document.getElementById('totalReceived');
  
  const _tSym  = (window.currency && window.currency.getCurrencySymbol) ? window.currency.getCurrencySymbol() : '$';
  const _tConv = (window.currency && window.currency.convertToSelectedCurrency) ? window.currency.convertToSelectedCurrency : v => v;

  if (totalBuysEl) totalBuysEl.textContent = buyCount;
  if (totalSellsEl) totalSellsEl.textContent = sellCount;
  if (totalTransactionsEl) totalTransactionsEl.textContent = rows.length;
  if (totalVolumeEl) totalVolumeEl.textContent = `${_tSym}${_tConv(totalVolume).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  if (totalInvestedEl) totalInvestedEl.textContent = `${_tSym}${_tConv(investedSum).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  if (totalReceivedEl) totalReceivedEl.textContent = `${_tSym}${_tConv(receivedSum).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

  // Обновляем элементы, которые внизу ссылаются на верхние значения (data-ref)
  document.querySelectorAll('[data-ref]').forEach(el => {
    const ref = el.getAttribute('data-ref');
    const source = document.getElementById(ref);
    if (source) el.textContent = source.textContent;
  });
}

// Экспортируем функцию глобально
window.updateTransactionStats = updateTransactionStats;

/**
 * Инициализирует быстрые фильтры
 */
function initQuickFilters() {
    const quickFilters = document.querySelectorAll('.quick-filter-btn');
    
    quickFilters.forEach(btn => {
        btn.addEventListener('click', () => {
            // Снимаем активность со всех кнопок
            quickFilters.forEach(b => b.classList.remove('active'));
            
            // Активируем нажатую кнопку
            btn.classList.add('active');
            
            // Применяем фильтр
            const filter = btn.dataset.filter;
            applyQuickFilter(filter);
        });
    });
}

/**
 * Применяет быстрый фильтр
 */
function applyQuickFilter(filter) {
    const filterType = document.getElementById('filterType');
    const filterPeriod = document.getElementById('filterPeriod');
    
    // Сбрасываем все фильтры
    if (filterType) filterType.value = '';
    if (filterPeriod) filterPeriod.value = 'all';
    
    switch(filter) {
        case 'all':
            // Показываем все
            break;
        case 'buy':
            if (filterType) filterType.value = 'BUY';
            break;
        case 'sell':
            if (filterType) filterType.value = 'SELL';
            break;
        case 'today':
            if (filterPeriod) filterPeriod.value = 'today';
            break;
        case 'week':
            if (filterPeriod) filterPeriod.value = 'week';
            break;
    }
    
    // Применяем фильтры
    if (window.applyTransactionFilters) {
        window.applyTransactionFilters();
    }
}

/**
 * Инициализирует поиск по активам
 */
function initAssetSearch() {
    const filterAsset = document.getElementById('filterAsset');
    
    if (filterAsset) {
        filterAsset.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            filterByAsset(query);
        });
    }
}

/**
 * Фильтрует транзакции по активу
 */
function filterByAsset(query) {
    const tbody = document.getElementById('transactionsTableBody');
    if (!tbody) return;
    
    const rows = tbody.querySelectorAll('tr:not(.loading-row):not(.no-data)');
    
    rows.forEach(row => {
        if (!query) {
            row.style.display = '';
            return;
        }
        
        const symbolCell = row.cells[2]; // 3-я колонка - символ
        if (symbolCell) {
            const symbol = symbolCell.textContent.toLowerCase();
            row.style.display = symbol.includes(query) ? '' : 'none';
        }
    });
    
    // Обновляем статистику
    updateTransactionStats();
}

/**
 * Экспортирует функцию для обновления статистики
 */
export { updateTransactionStats };

/**
 * Инициализирует централизованный обработчик смены валюты
 */
export function initCurrencyChangeHandler() {
    let updateTimeout = null;
    
    const updateAllElements = () => {
        if (updateTimeout) {
            clearTimeout(updateTimeout);
        }
        
        updateTimeout = setTimeout(() => {
            try {
                // 1. Обновляем дашборд если на странице
                if (typeof window.loadDashboardData === 'function') {
                    window.loadDashboardData();
                }
                
                // 2. Обновляем список криптовалют
                if (window.cryptoList && window.cryptoList.length && typeof window.renderCryptoList === 'function') {
                    window.renderCryptoList(window.cryptoList);
                }
                
                // 3. Обновляем список акций
                if (window.stocksList && window.stocksList.length && typeof window.renderStocksList === 'function') {
                    window.renderStocksList(window.stocksList);
                }
                
                // 4. Обновляем портфели если видны
                if (window.app && typeof window.app.loadPortfolios === 'function') {
                    window.app.loadPortfolios();
                }
                
                // 5. Обновляем транзакции если видны
                if (typeof window.renderTransactions === 'function') {
                    const txs = window.getTransactionsSync ? window.getTransactionsSync() : [];
                    window.renderTransactions(txs);
                }
                
                // 6. Обновляем избранное
                if (typeof window.renderFavorites === 'function' && typeof window.getFavorites === 'function') {
                    window.getFavorites().then(favs => window.renderFavorites(favs)).catch(e => {
                        // Error updating favorites
                    });
                }
                
                // 7. Обновляем аналитику если видна
                if (typeof window.renderAnalytics === 'function') {
                    window.renderAnalytics();
                }
            } catch (e) {
                // Error updating UI elements
            }
            
            updateTimeout = null;
        }, 300); // Даем время загрузиться курсу
    };
    
    // Слушаем оба события
    window.addEventListener('currencyChanged', updateAllElements);
    window.addEventListener('currencyRateUpdated', updateAllElements);
}
