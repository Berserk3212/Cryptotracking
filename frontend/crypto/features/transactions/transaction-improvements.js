// ==================== TRANSACTION IMPROVEMENTS ====================
// Добавь этот код в конец script.js или ui.js

// Функция для гибкого парсинга дат в разных форматах
const parseFlexibleDate = (dateString) => {
    if (!dateString) return null;
    
    dateString = dateString.trim();
    
    // Формат: DD.MM.YYYY или DD.MM.YYYY HH:mm
    const dotFormat = dateString.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (dotFormat) {
        const day = parseInt(dotFormat[1], 10);
        const month = parseInt(dotFormat[2], 10) - 1; // месяцы с 0
        const year = parseInt(dotFormat[3], 10);
        return new Date(year, month, day);
    }
    
    // Формат: DD/MM/YYYY или DD/MM/YYYY HH:mm
    const slashFormat = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (slashFormat) {
        const day = parseInt(slashFormat[1], 10);
        const month = parseInt(slashFormat[2], 10) - 1;
        const year = parseInt(slashFormat[3], 10);
        return new Date(year, month, day);
    }
    
    // Формат: YYYY-MM-DD или ISO (2024-01-25T10:30:00)
    const isoFormat = dateString.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoFormat) {
        const year = parseInt(isoFormat[1], 10);
        const month = parseInt(isoFormat[2], 10) - 1;
        const day = parseInt(isoFormat[3], 10);
        return new Date(year, month, day);
    }
    
    // Попытка стандартного парсинга
    const parsedDate = new Date(dateString);
    if (!isNaN(parsedDate.getTime())) {
        return parsedDate;
    }
    
    return null;
}

// Функция обновления статистики транзакций
const updateTransactionStats = () => {
    const tbody = document.getElementById('transactionsTableBody');
    if (!tbody) return;
    
    const rows = tbody.querySelectorAll('tr:not(.loading-row):not(.no-data)');
    
    let buyCount = 0;
    let sellCount = 0;
    let totalVolume = 0;
    let investedSum = 0;
    let receivedSum = 0;
    
    rows.forEach(row => {
        // Проверяем видимость строки
        if (row.style.display === 'none') return;
        
        const cells = row.cells;
        if (!cells || cells.length < 6) return;
        
        // ГЛАВНОЕ: используем data-type атрибут из строки (устойчиво к переводу)
        const dataType = row.getAttribute('data-type');
        const typeCell = cells[1];
        let isBuy = false;
        
        if (dataType) {
            // Используем data-type атрибут (BUY/SELL)
            isBuy = dataType === 'BUY';
        } else if (typeCell) {
            // Фолбэк: проверяем класс транзакции или иконку
            const typeSpan = typeCell.querySelector('.transaction-type');
            if (typeSpan) {
                isBuy = typeSpan.classList.contains('buy');
            } else {
                // Последний фолбэк: проверяем иконку
                isBuy = typeCell.querySelector('.bi-arrow-up-circle-fill') !== null;
            }
        }
        
        if (isBuy) {
            buyCount++;
        } else {
            sellCount++;
        }
        
        // Получаем сумму транзакции (парсим числа независимо от символов валют)
        const sumCell = cells[5];
        if (sumCell) {
            // Извлекаем число более надежным способом
            let sumText = sumCell.textContent || sumCell.innerText || '';
            // Удаляем все символы кроме цифр, точки, запятой и минуса
            sumText = sumText.replace(/[^\d.,\-]/g, '');
            // Заменяем запятые на точки для парсинга
            sumText = sumText.replace(/,/g, '');
            const sum = parseFloat(sumText) || 0;
            totalVolume += Math.abs(sum);
            if (isBuy) investedSum += Math.abs(sum);
            else receivedSum += Math.abs(sum);
        }
    });
    
    // Обновляем UI
    const totalBuysEl = document.getElementById('totalBuys');
    const totalSellsEl = document.getElementById('totalSells');
    const totalTransactionsEl = document.getElementById('totalTransactions');
    const totalVolumeEl = document.getElementById('totalVolume');
    const totalInvestedEl = document.getElementById('totalInvested');
    const totalReceivedEl = document.getElementById('totalReceived');
    
    const currencySymbol = (window.currency && window.currency.getCurrencySymbol) ? window.currency.getCurrencySymbol() : '$';

    if (totalBuysEl) totalBuysEl.textContent = buyCount;
    if (totalSellsEl) totalSellsEl.textContent = sellCount;
    if (totalTransactionsEl) totalTransactionsEl.textContent = rows.length;
    if (totalVolumeEl) {
        totalVolumeEl.textContent = `${currencySymbol}${totalVolume.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;
    }
    if (totalInvestedEl) {
        totalInvestedEl.textContent = `${currencySymbol}${investedSum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (totalReceivedEl) {
        totalReceivedEl.textContent = `${currencySymbol}${receivedSum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // Обновляем все элементы внизу, которые ссылаются на верхние значения (data-ref)
    document.querySelectorAll('[data-ref]').forEach(el => {
        const ref = el.getAttribute('data-ref');
        if (!ref) return;
        const source = document.getElementById(ref);
        if (source) el.textContent = source.textContent;
    });
}

// Функция применения фильтров транзакций
const applyTransactionFilters = () => {
    const portfolioFilter = document.getElementById('filterPortfolio')?.value;
    const typeFilter = document.getElementById('filterType')?.value;
    const periodFilter = document.getElementById('filterPeriod')?.value || 'all';
    const assetFilter = document.getElementById('filterAsset')?.value.toLowerCase().trim();
    
    const tbody = document.getElementById('transactionsTableBody');
    if (!tbody) return;
    
    const rows = tbody.querySelectorAll('tr:not(.loading-row):not(.no-data)');
    
    rows.forEach(row => {
        let shouldShow = true;
        const cells = row.cells;
        
        if (!cells || cells.length < 7) return;
        
        // Фильтр по портфелю
        if (portfolioFilter && shouldShow) {
            const portfolioCell = cells[6];
            if (portfolioCell && !portfolioCell.textContent.includes(portfolioFilter)) {
                shouldShow = false;
            }
        }
        
        // Фильтр по типу
        if (typeFilter && shouldShow) {
            const typeCell = cells[1];
            if (typeCell) {
                const isBuy = typeCell.textContent.includes('Покупка') || typeCell.textContent.includes('BUY');
                if ((typeFilter === 'BUY' && !isBuy) || (typeFilter === 'SELL' && isBuy)) {
                    shouldShow = false;
                }
            }
        }
        
        // Фильтр по периоду
        if (periodFilter !== 'all' && shouldShow) {
            const dateCell = cells[0];
            if (dateCell) {
                const dateText = dateCell.textContent.trim();
                const transactionDate = parseFlexibleDate(dateText);
                
                if (transactionDate && !isNaN(transactionDate.getTime())) {
                    const now = new Date();
                    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    const transactionDay = new Date(transactionDate.getFullYear(), transactionDate.getMonth(), transactionDate.getDate());
                    
                    switch(periodFilter) {
                        case 'today':
                            if (transactionDay.getTime() !== today.getTime()) {
                                shouldShow = false;
                            }
                            break;
                        case 'week':
                            const weekAgo = new Date(today);
                            weekAgo.setDate(weekAgo.getDate() - 7);
                            if (transactionDay < weekAgo) {
                                shouldShow = false;
                            }
                            break;
                        case 'month':
                            const monthAgo = new Date(today);
                            monthAgo.setMonth(monthAgo.getMonth() - 1);
                            if (transactionDay < monthAgo) {
                                shouldShow = false;
                            }
                            break;
                        case 'year':
                            const yearAgo = new Date(today);
                            yearAgo.setFullYear(yearAgo.getFullYear() - 1);
                            if (transactionDay < yearAgo) {
                                shouldShow = false;
                            }
                            break;
                    }
                } else {
                    // Если не удалось распарсить дату - скрываем строку при фильтрации
                    shouldShow = false;
                }
            }
        }
        
        // Фильтр по активу
        if (assetFilter && shouldShow) {
            const assetCell = cells[2];
            if (assetCell && !assetCell.textContent.toLowerCase().includes(assetFilter)) {
                shouldShow = false;
            }
        }
        
        row.style.display = shouldShow ? '' : 'none';
    });
    
    // Обновляем статистику после фильтрации
    updateTransactionStats();
}

// Инициализация фильтров при загрузке
document.addEventListener('DOMContentLoaded', function() {
    // Обработчики фильтров
    const filterPortfolio = document.getElementById('filterPortfolio');
    const filterType = document.getElementById('filterType');
    const filterPeriod = document.getElementById('filterPeriod');
    const filterAsset = document.getElementById('filterAsset');
    
    if (filterPortfolio) filterPortfolio.addEventListener('change', applyTransactionFilters);
    if (filterType) filterType.addEventListener('change', applyTransactionFilters);
    if (filterPeriod) filterPeriod.addEventListener('change', applyTransactionFilters);
    if (filterAsset) filterAsset.addEventListener('input', applyTransactionFilters);
    
    // Быстрые фильтры
    const quickFilterBtns = document.querySelectorAll('.quick-filter-btn');
    quickFilterBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            // Снимаем активность со всех кнопок
            quickFilterBtns.forEach(b => b.classList.remove('active'));
            // Активируем нажатую
            this.classList.add('active');
            
            const filter = this.dataset.filter;
            
            // Сбрасываем фильтры
            if (filterType) filterType.value = '';
            if (filterPeriod) filterPeriod.value = 'all';
            
            // Применяем выбранный фильтр
            switch(filter) {
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
            
            applyTransactionFilters();
        });
    });
    
    // Обновляем статистику при изменении транзакций
    const observer = new MutationObserver(function() {
        setTimeout(updateTransactionStats, 100);
    });
    
    const tbody = document.getElementById('transactionsTableBody');
    if (tbody) {
        observer.observe(tbody, { childList: true, subtree: true });
    }
});

// ==================== MARKET SEARCH FOR CRYPTO ====================
// Поиск криптовалют в разделе рынок

document.addEventListener('DOMContentLoaded', function() {
    const marketSearch = document.getElementById('marketSearch');
    
    if (marketSearch) {
        marketSearch.addEventListener('input', function(e) {
            const query = e.target.value.toLowerCase().trim();
            filterMarketContent(query);
        });
    }
});

const filterMarketContent = (query) => {
    // Определяем активную вкладку
    const tabs = document.querySelectorAll('.tab');
    let activeTab = 'stocks';
    
    tabs.forEach(tab => {
        if (tab.classList.contains('active')) {
            activeTab = tab.dataset.tab || 'stocks';
        }
    });
    
    switch(activeTab) {
        case 'stocks':
            filterStocksTable(query);
            break;
        case 'crypto':
            filterMarketCrypto(query);
            break;
        case 'indices':
            filterMarketIndices(query);
            break;
    }
}

const filterStocksTable = (query) => {
    const tbody = document.getElementById('stocksTable');
    if (!tbody) return;
    
    const rows = tbody.querySelectorAll('tr:not(.loading-row)');
    let visibleCount = 0;
    
    rows.forEach(row => {
        if (row.classList.contains('loading-row')) return;
        
        const text = row.textContent.toLowerCase();
        const shouldShow = !query || text.includes(query);
        
        row.style.display = shouldShow ? '' : 'none';
        if (shouldShow) visibleCount++;
    });
    
    if (visibleCount === 0 && query && rows.length > 0) {
        showNoResultsInTable(tbody, 'Акции не найдены');
    } else {
        removeNoResultsFromTable(tbody);
    }
}

const filterMarketCrypto = (query) => {
    const grid = document.getElementById('marketCryptoGrid');
    if (!grid) return;
    
    const cards = grid.querySelectorAll('.crypto-card');
    let visibleCount = 0;
    
    cards.forEach(card => {
        if (card.classList.contains('loading-row')) return;
        
        const text = card.textContent.toLowerCase();
        const shouldShow = !query || text.includes(query);
        
        card.style.display = shouldShow ? '' : 'none';
        if (shouldShow) visibleCount++;
    });
    
    if (visibleCount === 0 && query && cards.length > 0) {
        showNoResultsInGrid(grid, 'Криптовалюты не найдены');
    } else {
        removeNoResultsFromGrid(grid);
    }
}

const filterMarketIndices = (query) => {
    const grid = document.getElementById('indicesGrid');
    if (!grid) return;
    
    const cards = grid.querySelectorAll('.index-card');
    let visibleCount = 0;
    
    cards.forEach(card => {
        if (card.classList.contains('loading-row')) return;
        
        const text = card.textContent.toLowerCase();
        const shouldShow = !query || text.includes(query);
        
        card.style.display = shouldShow ? '' : 'none';
        if (shouldShow) visibleCount++;
    });
    
    if (visibleCount === 0 && query && cards.length > 0) {
        showNoResultsInGrid(grid, 'Индексы не найдены');
    } else {
        removeNoResultsFromGrid(grid);
    }
}

const showNoResultsInTable = (tbody, message) => {
    removeNoResultsFromTable(tbody);
    
    const tr = document.createElement('tr');
    tr.className = 'no-results-row';
    tr.innerHTML = '<td colspan=\"100\" style=\"text-align: center; padding: 2rem; color: #9ca3af;\">' + 
                   '<i class=\"fas fa-search\" style=\"font-size: 2rem; margin-bottom: 0.5rem;\"></i><br>' +
                   message + '</td>';
    tbody.appendChild(tr);
}

const removeNoResultsFromTable = (tbody) => {
    const existing = tbody.querySelector('.no-results-row');
    if (existing) {
        existing.remove();
    }
}

const showNoResultsInGrid = (grid, message) => {
    removeNoResultsFromGrid(grid);
    
    const div = document.createElement('div');
    div.className = 'no-results-message';
    div.style.cssText = 'grid-column: 1 / -1; text-align: center; padding: 3rem; color: #9ca3af;';
    div.innerHTML = '<i class=\"fas fa-search\" style=\"font-size: 3rem; margin-bottom: 1rem; display: block;\"></i>' +
                   '<div style=\"font-size: 1.25rem; font-weight: 600;\">' + message + '</div>';
    grid.appendChild(div);
}

const removeNoResultsFromGrid = (grid) => {
    const existing = grid.querySelector('.no-results-message');
    if (existing) {
        existing.remove();
    }
}

// ==================== CONFIRM MODAL ====================

const showConfirmModal = (title, message, onConfirm) => {
    const existing = document.getElementById('_confirmModal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = '_confirmModal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:99999;';

    overlay.innerHTML = `
        <div style="background:#1a2035;border:1px solid #2d3748;border-radius:16px;padding:32px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.6);text-align:center;animation:_cmSlide 0.2s ease;">
            <div style="width:56px;height:56px;border-radius:50%;background:rgba(239,68,68,0.12);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
                <i class="fas fa-trash-alt" style="font-size:22px;color:#ef4444;"></i>
            </div>
            <h3 style="color:#f1f5f9;font-size:1.15rem;font-weight:700;margin:0 0 10px;">${title}</h3>
            <p style="color:#94a3b8;font-size:0.875rem;margin:0 0 24px;line-height:1.6;">${message}</p>
            <div style="display:flex;gap:12px;justify-content:center;">
                <button id="_cmCancel" style="padding:10px 24px;border-radius:8px;border:1px solid #374151;background:transparent;color:#9ca3af;cursor:pointer;font-size:0.875rem;font-weight:500;">Отмена</button>
                <button id="_cmOk" style="padding:10px 24px;border-radius:8px;border:none;background:#ef4444;color:#fff;cursor:pointer;font-size:0.875rem;font-weight:600;">Удалить</button>
            </div>
        </div>
        <style>
            @keyframes _cmSlide{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}
            #_cmCancel:hover{background:#374151!important;color:#f1f5f9!important;}
            #_cmOk:hover{background:#dc2626!important;}
        </style>
    `;

    document.body.appendChild(overlay);
    const close = () => overlay.remove();

    overlay.querySelector('#_cmCancel').addEventListener('click', close);
    overlay.querySelector('#_cmOk').addEventListener('click', () => { close(); onConfirm(); });
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); }, { once: true });
};

window.showConfirmModal = showConfirmModal;

// ==================== DELETE TRANSACTION FUNCTIONALITY ====================

document.addEventListener('click', function(e) {
    if (e.target.classList.contains('delete-transaction-btn') ||
        e.target.closest('.delete-transaction-btn')) {

        const btn = e.target.classList.contains('delete-transaction-btn')
            ? e.target : e.target.closest('.delete-transaction-btn');

        const transactionId = btn.dataset.transactionId;
        if (!transactionId) return;

        showConfirmModal(
            'Удалить транзакцию?',
            'Это действие нельзя отменить. Транзакция будет безвозвратно удалена из базы данных.',
            () => deleteTransactionRow(transactionId, btn)
        );
    }
});

const deleteTransactionRow = async (transactionId, button) => {
    try {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        if (!window.app || !window.app.deleteTransaction) {
            throw new Error('Функция удаления недоступна');
        }

        await window.app.deleteTransaction(transactionId);

        const row = button.closest('tr');
        if (row) {
            row.style.transition = 'opacity 0.3s, transform 0.3s';
            row.style.opacity = '0';
            row.style.transform = 'translateX(-20px)';
            setTimeout(() => {
                row.remove();
                updateTransactionStats();
                showNotification('Транзакция успешно удалена', 'success');
            }, 300);
        }
    } catch (error) {
        showNotification('Ошибка при удалении: ' + error.message, 'error');
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-trash"></i>';
    }
}

// Функция показа уведомлений
const showNotification = (message, type = 'info') => {
    const notification = document.createElement('div');
    notification.className = 'notification notification-' + type;
    notification.textContent = message;
    notification.style.cssText = 'position: fixed; top: 20px; right: 20px; padding: 16px 24px; border-radius: 12px; background: ' + 
        (type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6') + 
        '; color: white; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); z-index: 10000; animation: slideIn 0.3s ease;';
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100px)';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ==================== PROFILE DATA FIX ====================
// Обновление данных профиля в sidebar

document.addEventListener('DOMContentLoaded', function() {
    // Пытаемся обновить профиль через небольшую задержку
    setTimeout(updateSidebarProfile, 500);
    setTimeout(updateSidebarProfile, 1500);
});

const updateSidebarProfile = () => {
    // Получаем данные пользователя из существующих элементов на странице
    const profileNameInput = document.getElementById('profileName');
    const profileEmailInput = document.getElementById('profileEmail');
    
    const sidebarName = document.querySelector('.user-name');
    const sidebarEmail = document.querySelector('.user-email');
    
    if (profileNameInput && sidebarName && profileNameInput.value) {
        sidebarName.textContent = profileNameInput.value;
    }
    
    if (profileEmailInput && sidebarEmail && profileEmailInput.value) {
        sidebarEmail.textContent = profileEmailInput.value;
    }
    
    // Также пробуем получить из Supabase
    if (window.supabaseClient) {
        window.supabaseClient.auth.getUser().then(({ data: { user } }) => {
            if (user && sidebarName && sidebarEmail) {
                sidebarEmail.textContent = user.email || '—';
                
                // Пробуем получить имя из метаданных
                if (user.user_metadata && user.user_metadata.name) {
                    sidebarName.textContent = user.user_metadata.name;
                } else if (user.email) {
                    // Используем первую часть email как имя
                    sidebarName.textContent = user.email.split('@')[0];
                }
            }
        }).catch(err => {

        });
    }
}

// Экспортируем функцию для использования в других местах
window.updateSidebarProfile = updateSidebarProfile;

// ==================== DASHBOARD DATA FIX ====================
// DEPRECATED: Эта логика перенесена в dashboard.js
// Оставлено для совместимости, но не вызывается

// document.addEventListener('DOMContentLoaded', function() {
//     setTimeout(updateDashboardData, 500);
//     setTimeout(updateDashboardData, 2000);
// });

const updateDashboardData_DEPRECATED = async () => {
    // DEPRECATED: Логика перенесена в dashboard.js

    return;
    
    try {
        // Обновляем имя пользователя
        await updateUserName();
        
        // Обновляем статистику портфелей
        await updatePortfolioStats_DEPRECATED();
        

    } catch (error) {

    }
}

const updateUserName = async () => {
    const userNameEl = document.getElementById('userName');
    if (!userNameEl) return;
    
    // Пробуем получить из Supabase
    if (window.supabaseClient) {
        try {
            const { data: { user } } = await window.supabaseClient.auth.getUser();
            if (user) {
                // Используем имя из метаданных или первую часть email
                let displayName = 'Инвестор';
                
                if (user.user_metadata && user.user_metadata.name) {
                    displayName = user.user_metadata.name;
                } else if (user.user_metadata && user.user_metadata.full_name) {
                    displayName = user.user_metadata.full_name;
                } else if (user.email) {
                    displayName = user.email.split('@')[0];
                }
                
                userNameEl.textContent = displayName;
                
                // Обновляем также в sidebar
                const sidebarName = document.querySelector('.user-name');
                if (sidebarName) {
                    sidebarName.textContent = displayName;
                }
            }
        } catch (err) {

        }
    }
    
    // Альтернативный способ - из поля профиля
    const profileNameInput = document.getElementById('profileName');
    if (profileNameInput && profileNameInput.value && profileNameInput.value !== '') {
        userNameEl.textContent = profileNameInput.value;
    }
}

// DEPRECATED: Функция перенесена в dashboard.js
const updatePortfolioStats_DEPRECATED = async () => {

    return;
    
    let totalValue = 0;
    let portfolioCount = 0;
    let totalReturn = 0;
    let totalInvested = 0;
    
    // Пробуем получить данные из Supabase
    if (window.supabaseClient) {
        try {
            // Получаем портфели
            const { data: portfolios, error: portfoliosError } = await window.supabaseClient
                .from('portfolios')
                .select('*');
            
            if (!portfoliosError && portfolios) {
                portfolioCount = portfolios.length;
                
                // Получаем транзакции
                const { data: transactions, error: transactionsError } = await window.supabaseClient
                    .from('transactions')
                    .select('*');
                
                if (!transactionsError && transactions) {
                    // Подсчитываем инвестированную сумму
                    transactions.forEach(t => {
                        const amount = t.quantity * t.price;
                        if (t.type === 'BUY') {
                            totalInvested += amount;
                        } else {
                            totalInvested -= amount;
                        }
                    });
                    
                    // Примерный расчет текущей стоимости (нужны актуальные цены)
                    totalValue = totalInvested * 1.05; // заглушка +5%
                    totalReturn = ((totalValue - totalInvested) / totalInvested * 100).toFixed(2);
                }
            }
        } catch (err) {

        }
    }
    
    // Если нет данных из БД, пробуем получить из DOM
    if (portfolioCount === 0) {
        const portfolioCards = document.querySelectorAll('.portfolio-card');
        portfolioCount = portfolioCards.length;
    }
    
    // Обновляем UI
    const totalValueEl = document.getElementById('totalValue');
    const totalChangeEl = document.getElementById('totalChange');
    const portfolioCountEl = document.getElementById('portfolioCount');
    const totalReturnEl = document.getElementById('totalReturn');
    const assetsCountEl = document.getElementById('assetsCount');
    
    if (totalValueEl) {
        totalValueEl.textContent = '\$' + totalValue.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }
    
    if (totalChangeEl) {
        const changeValue = totalReturn;
        totalChangeEl.textContent = (changeValue >= 0 ? '+' : '') + changeValue + '%';
        totalChangeEl.className = 'balance-change ' + (changeValue >= 0 ? 'positive' : 'negative');
    }
    
    if (portfolioCountEl) {
        portfolioCountEl.textContent = portfolioCount;
    }
    
    if (totalReturnEl) {
        totalReturnEl.textContent = (totalReturn >= 0 ? '+' : '') + totalReturn + '%';
    }
    
    if (assetsCountEl) {
        // Подсчитываем уникальные активы из транзакций
        const uniqueAssets = new Set();
        const transactionRows = document.querySelectorAll('#transactionsTableBody tr:not(.loading-row):not(.no-data)');
        transactionRows.forEach(row => {
            const symbolCell = row.cells[2];
            if (symbolCell) {
                uniqueAssets.add(symbolCell.textContent.trim());
            }
        });
        assetsCountEl.textContent = uniqueAssets.size || 0;
    }
}

// Обновление дашборда перенесено в dashboard.js
// Обработчик удален чтобы избежать конфликтов
/*
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function() {
        if (this.getAttribute('href') === '#dashboard') {
            setTimeout(updateDashboardData, 300);
        }
    });
});
*/

// Экспорт удален так как функция deprecated
// window.updateDashboardData = updateDashboardData;

// ==================== SYNC PROFILE TO DASHBOARD ====================
// Синхронизация профиля с дашбордом

// Функция синхронизации имени
const syncUserNameToDashboard = () => {
    const profileNameInput = document.getElementById('profileName');
    const profileEmailInput = document.getElementById('profileEmail');
    const userNameEl = document.getElementById('userName');
    const sidebarName = document.querySelector('.user-name');
    const sidebarEmail = document.querySelector('.user-email');
    
    if (profileNameInput && profileNameInput.value && userNameEl) {
        userNameEl.textContent = profileNameInput.value;

    }
    
    if (profileNameInput && profileNameInput.value && sidebarName) {
        sidebarName.textContent = profileNameInput.value;
    }
    
    if (profileEmailInput && profileEmailInput.value && sidebarEmail) {
        sidebarEmail.textContent = profileEmailInput.value;
    }
}

// Вызываем синхронизацию при изменении полей профиля
document.addEventListener('DOMContentLoaded', function() {
    const profileNameInput = document.getElementById('profileName');
    const profileEmailInput = document.getElementById('profileEmail');
    
    if (profileNameInput) {
        // Синхронизируем при изменении
        profileNameInput.addEventListener('input', syncUserNameToDashboard);
        profileNameInput.addEventListener('change', syncUserNameToDashboard);
        
        // Синхронизируем сразу если есть значение
        if (profileNameInput.value) {
            setTimeout(syncUserNameToDashboard, 100);
            setTimeout(syncUserNameToDashboard, 500);
            setTimeout(syncUserNameToDashboard, 1000);
        }
    }
    
    // Следим за изменениями в профиле через MutationObserver
    if (profileNameInput) {
        const observer = new MutationObserver(syncUserNameToDashboard);
        observer.observe(profileNameInput, { 
            attributes: true, 
            attributeFilter: ['value'] 
        });
    }
});

// Синхронизируем при открытии дашборда
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function() {
        if (this.getAttribute('href') === '#dashboard') {
            setTimeout(syncUserNameToDashboard, 100);
        }
    });
});

// Синхронизируем при загрузке страницы несколько раз с задержкой
window.addEventListener('load', function() {
    setTimeout(syncUserNameToDashboard, 200);
    setTimeout(syncUserNameToDashboard, 1000);
    setTimeout(syncUserNameToDashboard, 2000);
});

// Экспортируем функцию
window.syncUserNameToDashboard = syncUserNameToDashboard;

// ==================== TABLE SORTING FUNCTIONALITY ====================
// Универсальная сортировка для таблиц

document.addEventListener('DOMContentLoaded', function() {
    initTableSorting();
});

const initTableSorting = () => {
    // Инициализация сортировки для всех таблиц
    const sortableHeaders = document.querySelectorAll('th.sortable');
    
    sortableHeaders.forEach(header => {
        header.addEventListener('click', function() {
            const table = this.closest('table');
            const tbody = table.querySelector('tbody');
            const columnIndex = Array.from(this.parentElement.children).indexOf(this);
            const currentSort = this.dataset.sortOrder || 'none';
            
            // Сбрасываем сортировку других колонок
            table.querySelectorAll('th.sortable').forEach(th => {
                if (th !== this) {
                    th.classList.remove('sorted', 'sorted-asc', 'sorted-desc');
                    th.dataset.sortOrder = 'none';
                }
            });
            
            // Определяем новое направление сортировки
            let newSort;
            if (currentSort === 'none') {
                newSort = 'asc';
            } else if (currentSort === 'asc') {
                newSort = 'desc';
            } else {
                newSort = 'none'; // Сброс при третьем клике
            }
            
            this.dataset.sortOrder = newSort;
            
            // Обновляем классы
            this.classList.remove('sorted', 'sorted-asc', 'sorted-desc');
            if (newSort !== 'none') {
                this.classList.add('sorted', 'sorted-' + newSort);
            }
            
            // Если сброс - восстанавливаем исходный порядок
            if (newSort === 'none') {
                // Перезагружаем данные таблицы
                const sectionId = table.closest('.section').id;
                if (sectionId === 'transactionsSection') {
                    // Для транзакций - просто показываем все строки в исходном порядке
                    const rows = Array.from(tbody.querySelectorAll('tr:not(.loading-row):not(.no-data)'));
                    rows.forEach(row => tbody.appendChild(row));
                }
                return;
            }
            
            // Выполняем сортировку
            sortTable(tbody, columnIndex, newSort);
        });
    });
}

const sortTable = (tbody, columnIndex, direction) => {
    const rows = Array.from(tbody.querySelectorAll('tr:not(.loading-row):not(.no-data)'));
    
    rows.sort((rowA, rowB) => {
        const cellA = rowA.cells[columnIndex];
        const cellB = rowB.cells[columnIndex];
        
        if (!cellA || !cellB) return 0;
        
        let valueA = cellA.textContent.trim();
        let valueB = cellB.textContent.trim();
        
        // Пробуем распарсить как число
        const numA = parseFloat(valueA.replace(/[^\d.-]/g, ''));
        const numB = parseFloat(valueB.replace(/[^\d.-]/g, ''));
        
        let comparison = 0;
        
        if (!isNaN(numA) && !isNaN(numB)) {
            // Сравнение чисел
            comparison = numA - numB;
        } else {
            // Сравнение строк
            comparison = valueA.localeCompare(valueB, 'ru');
        }
        
        return direction === 'asc' ? comparison : -comparison;
    });
    
    // Применяем отсортированный порядок
    rows.forEach(row => tbody.appendChild(row));
}

// Экспортируем для использования
window.initTableSorting = initTableSorting;
window.sortTable = sortTable;
