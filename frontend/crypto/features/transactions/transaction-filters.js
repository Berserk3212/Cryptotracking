// transaction-filters.js

let currentPortfolio = '';
let currentType = '';
let currentPeriod = 'all';

export function initTransactionFilters() {
  console.log('Initializing transaction filters...');
  
  populatePortfolioFilter();
  
  initCustomSelect('filterPortfolioDisplay', 'filterPortfolioDropdown', (value) => {
        currentPortfolio = value;
        console.log('Portfolio filter changed:', value);
        applyTransactionFilters();
    });
    
    initCustomSelect('filterTypeDisplay', 'filterTypeDropdown', (value) => {
        currentType = value;
        console.log('Type filter changed:', value);
        applyTransactionFilters();
    });
    
    initCustomSelect('filterPeriodDisplay', 'filterPeriodDropdown', (value) => {
        currentPeriod = value;
        console.log('Period filter changed:', value);
        applyTransactionFilters();
    });
    
    // Функция для получения текущих значений фильтров
    window.getTransactionFilterValues = () => {
        return {
            portfolio: currentPortfolio,
            type: currentType,
            period: currentPeriod
        };
    };
    
    // Закрытие всех dropdowns при клике вне их
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-select-wrapper')) {
            document.querySelectorAll('.custom-select-dropdown.show').forEach(dd => {
                dd.classList.remove('show');
                dd.previousElementSibling?.classList.remove('open');
            });
        }
    });
    
    // Экспортируем функцию для обновления портфелей из других модулей
    window.updateTransactionPortfolioFilter = () => {
        populatePortfolioFilter();
        // Реинициализируем обработчики для новых элементов
        initCustomSelect('filterPortfolioDisplay', 'filterPortfolioDropdown', (value) => {
            currentPortfolio = value;
            console.log('Portfolio filter changed:', value);
            applyTransactionFilters();
        });
    };
    
    console.log('Transaction filters initialized');
}

// Функция для заполнения dropdown портфелей
function populatePortfolioFilter() {
    const dropdown = document.getElementById('filterPortfolioDropdown');
    if (!dropdown) return;
    
    // Получаем список портфелей (используем window.getPortfoliosSync если доступно)
    const portfolios = window.getPortfoliosSync ? window.getPortfoliosSync() : [];
    
    // Очищаем существующие опции (кроме "Все портфели")
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
    
    console.log(`Добавлено ${portfolios.length} портфелей в фильтр`);
}

// Функция инициализации кастомного select (с делегированием событий)
function initCustomSelect(displayId, dropdownId, onChange) {
  const display = document.getElementById(displayId);
  const dropdown = document.getElementById(dropdownId);
  
  if (!display || !dropdown) {
    console.warn(`[initCustomSelect] Элементы не найдены: ${displayId}, ${dropdownId}`);
    return;
  }
  
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
  
  // Используем делегирование событий для опций (работает с динамически созданными элементами)
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
  
  // Удаляем старый обработчик и добавляем новый (делегирование на родительский элемент)
  dropdown.removeEventListener('click', optionClickHandler);
  dropdown.addEventListener('click', optionClickHandler);
  
  // Отметить выбранную опцию по умолчанию
  const firstOption = dropdown.querySelector('.custom-select-option');
  if (firstOption && !dropdown.querySelector('.custom-select-option.selected')) {
    firstOption.classList.add('selected');
  }
}

export function applyTransactionFilters() {
    const filterValues = window.getTransactionFilterValues ? window.getTransactionFilterValues() : {
        portfolio: '',
        type: '',
        period: 'all'
    };
    
    const portfolioFilter = filterValues.portfolio;
    const typeFilter = filterValues.type;
    const periodFilter = filterValues.period;
    
    const tbody = document.getElementById('transactionsTableBody');
    if (!tbody) return;
    
    const rows = tbody.querySelectorAll('tr');
    let visibleCount = 0;
    
    rows.forEach(row => {
        // Пропускаем служебные строки
        if (row.classList.contains('loading-row') || 
            row.classList.contains('no-data') ||
            row.querySelector('.loading-row') ||
            row.querySelector('.no-data')) {
            return;
        }
        
        let shouldShow = true;
        
        // Фильтр по портфелю (используем data-атрибут)
        if (portfolioFilter) {
            const rowPortfolioId = row.getAttribute('data-portfolio-id');
            if (rowPortfolioId !== portfolioFilter) {
                shouldShow = false;
            }
        }
        
        // Фильтр по типу транзакции (используем data-атрибут)
        if (typeFilter && shouldShow) {
            const rowType = row.getAttribute('data-type');
            if (rowType !== typeFilter) {
                shouldShow = false;
            }
        }
        
        // Фильтр по периоду
        if (periodFilter !== 'all' && shouldShow) {
            const dateCell = row.cells[0]; // 1-я колонка - дата
            if (dateCell) {
                const dateText = dateCell.textContent.trim();
                const transactionDate = parseRussianDate(dateText);
                
                if (transactionDate && !isInPeriod(transactionDate, periodFilter)) {
                    shouldShow = false;
                }
            }
        }
        
        row.style.display = shouldShow ? '' : 'none';
        if (shouldShow) visibleCount++;
    });
    
    // Показываем статистику
    updateTransactionStats(visibleCount);
}

function parseRussianDate(dateStr) {
    // Парсим дату в формате "дд.мм.гггг"
    const parts = dateStr.split('.');
    if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // месяцы с 0
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day);
    }
    
    // Пробуем стандартный парсинг
    return new Date(dateStr);
}

function isInPeriod(date, period) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const transactionDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    switch(period) {
        case 'today':
            return transactionDate.getTime() === today.getTime();
            
        case 'week':
            const weekAgo = new Date(today);
            weekAgo.setDate(weekAgo.getDate() - 7);
            return transactionDate >= weekAgo;
            
        case 'month':
            const monthAgo = new Date(today);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            return transactionDate >= monthAgo;
            
        case 'year':
            const yearAgo = new Date(today);
            yearAgo.setFullYear(yearAgo.getFullYear() - 1);
            return transactionDate >= yearAgo;
            
        default:
            return true;
    }
}

function updateTransactionStats(count) {
    // Можно добавить отображение статистики
    console.log(`Filtered transactions: ${count}`);
}
