window.stockCompareSymbol = null;

window.toggleStockCompareDropdown = function() {
  const dropdown = document.getElementById('stockCompareDropdownMenu');
  const btn = document.getElementById('stockCompareBtn');
  
  if (!dropdown) return;
  
  const isVisible = dropdown.style.display === 'block';
  dropdown.style.display = isVisible ? 'none' : 'block';
  
  if (!isVisible) {
    populateStockCompareList();
    const searchInput = document.getElementById('stockCompareSearch');
    if (searchInput) {
      searchInput.focus();
      searchInput.value = '';
    }
  }
};

function populateStockCompareList() {
  const list = document.getElementById('stockCompareList');
  if (!list || !window.STOCK_INFO) return;
  
  const currentSymbol = window.currentStockDetail?.symbol;
  const searchTerm = document.getElementById('stockCompareSearch')?.value.toLowerCase() || '';
  
  list.innerHTML = '';
  
  const stocks = Object.entries(window.STOCK_INFO)
    .filter(([symbol]) => symbol !== currentSymbol)
    .filter(([symbol, info]) => {
      if (!searchTerm) return true;
      return symbol.toLowerCase().includes(searchTerm) || 
             (info.name && info.name.toLowerCase().includes(searchTerm));
    })
    .slice(0, 8);
  
  if (stocks.length === 0) {
    list.innerHTML = '<div style="padding: 16px; text-align: center; color: #9ca3af;">Акции не найдены</div>';
    return;
  }
  
  stocks.forEach(([symbol, info]) => {
    const item = document.createElement('div');
    item.className = 'compare-list-item';
    
    let price = 0;
    
    if (window.stocksRealData && window.stocksRealData[symbol]) {
      price = window.stocksRealData[symbol].price || 0;
    } else if (info.price) {
      price = info.price;
    }
    
    const iconDiv = document.createElement('div');
    iconDiv.className = 'compare-item-icon';
    iconDiv.style.background = info.color || '#3b82f6';
    
    const img = document.createElement('img');
    img.src = `https://img.logo.dev/${symbol.toLowerCase()}.com?token=pk_X-jjCWIKT_SRetd3NwvHUg&size=80&format=png`;
    img.alt = symbol;
    img.style.cssText = 'width: 100%; height: 100%; object-fit: contain; border-radius: 50%;';
    
    img.onerror = function() {
      this.onerror = null;
      this.src = `https://assets.parqet.com/logos/symbol/${symbol}`;
      this.onerror = function() {
        this.onerror = null;
        this.src = `https://financialmodelingprep.com/image-stock/${symbol}.png`;
        this.onerror = function() {
          iconDiv.innerHTML = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: white;">${symbol.substring(0, 2)}</div>`;
        };
      };
    };
    
    iconDiv.appendChild(img);
    
    const infoDiv = document.createElement('div');
    infoDiv.className = 'compare-item-info';
    infoDiv.innerHTML = `
      <div class="compare-item-name">${info.name || symbol}</div>
      <div class="compare-item-symbol">${symbol}</div>
    `;
    
    // Создаем цену
    const priceSpan = document.createElement('span');
    priceSpan.className = 'compare-item-price';
    priceSpan.textContent = `$${price.toFixed(2)}`;
    
    item.appendChild(iconDiv);
    item.appendChild(infoDiv);
    item.appendChild(priceSpan);
    item.onclick = () => selectStockCompare(symbol);
    list.appendChild(item);
  });
}

/**
 * Select stock for comparison (как в криптовалютах)
 */
window.selectStockCompare = async function(symbol) {
  console.log('Selecting stock for comparison:', symbol);
  
  // Toggle: если кликнули на уже выбранный - убираем его
  if (window.stockCompareSymbol === symbol) {
    console.log('Deselecting stock comparison');
    removeStockCompareSymbol();
    return;
  }
  
  window.stockCompareSymbol = symbol;
  
  // Close dropdown
  const dropdown = document.getElementById('stockCompareDropdownMenu');
  if (dropdown) dropdown.style.display = 'none';
  
  // Update button with symbol and close icon (как в криптовалютах)
  const btn = document.getElementById('stockCompareBtn');
  if (btn) {
    btn.innerHTML = `
      <span>
        <i class="fas fa-check"></i> ${symbol}
      </span>
      <i class="fas fa-times" onclick="event.stopPropagation(); removeStockCompareSymbol();" style="margin-left: 0.5rem; opacity: 0.7;"></i>
    `;
    btn.classList.add('has-selection');
    btn.classList.add('active');
  }
  
  // Show legend
  const legend = document.getElementById('stockChartLegend');
  if (legend) legend.style.display = 'flex';
  
  // Reload chart with comparison
  if (window.currentStockDetail && typeof window.loadStockChart === 'function') {
    const currentPeriod = document.querySelector('#stockDetailModal .period-btn.active')?.getAttribute('data-period') || '30';
    await window.loadStockChart(window.currentStockDetail.symbol, currentPeriod);
  }
  
  showNotification(`Сравнение с ${symbol}`, 'success');
};

/**
 * Remove stock comparison (как в криптовалютах)
 */
window.removeStockCompareSymbol = function() {
  console.log('Removing stock comparison');
  window.stockCompareSymbol = null;
  
  // Reset button (как в криптовалютах)
  const btn = document.getElementById('stockCompareBtn');
  if (btn) {
    btn.innerHTML = '<i class="fas fa-plus"></i> Сравнить';
    btn.classList.remove('has-selection');
    btn.classList.remove('active');
  }
  
  // Hide only second legend item, keep legend visible for main stock
  const legend2 = document.getElementById('stockLegend2');
  if (legend2) legend2.style.display = 'none';
  
  // Close dropdown if open
  const dropdown = document.getElementById('stockCompareDropdownMenu');
  if (dropdown) {
    dropdown.style.display = 'none';
  }
  
  // Reload chart without comparison
  if (window.currentStockDetail && typeof window.loadStockChart === 'function') {
    const currentPeriod = document.querySelector('#stockDetailModal .period-btn.active')?.getAttribute('data-period') || '30';
    window.loadStockChart(window.currentStockDetail.symbol, currentPeriod);
  }
  
  showNotification('Сравнение отменено', 'success');
};

/**
 * Toggle stock download menu
 */
window.toggleStockDownloadMenu = function() {
  const menu = document.getElementById('stockDownloadMenu');
  if (!menu) return;
  
  const isVisible = menu.style.display === 'block';
  menu.style.display = isVisible ? 'none' : 'block';
};

/**
 * Download stock chart as JPG
 */
window.downloadStockChartAsJPG = function() {
  const container = document.getElementById('stockPriceChartContainer');
  if (!container) {
    showNotification('График не найден', 'error');
    return;
  }
  
  html2canvas(container, {
    backgroundColor: '#1f2937',
    scale: 2,
    logging: false
  }).then(canvas => {
    const link = document.createElement('a');
    const symbol = window.currentStockDetail?.symbol || 'stock';
    link.download = `${symbol}-chart-${Date.now()}.jpg`;
    link.href = canvas.toDataURL('image/jpeg', 0.95);
    link.click();
    
    showNotification('График сохранён как JPG', 'success');
    
    // Close menu
    const menu = document.getElementById('stockDownloadMenu');
    if (menu) menu.style.display = 'none';
  }).catch(error => {
    console.error('Ошибка скачивания JPG:', error);
    showNotification('Ошибка сохранения графика', 'error');
  });
};

/**
 * Download stock chart as PNG
 */
window.downloadStockChartAsPNG = function() {
  const container = document.getElementById('stockPriceChartContainer');
  if (!container) {
    showNotification('График не найден', 'error');
    return;
  }
  
  html2canvas(container, {
    backgroundColor: '#1f2937',
    scale: 2,
    logging: false
  }).then(canvas => {
    const link = document.createElement('a');
    const symbol = window.currentStockDetail?.symbol || 'stock';
    link.download = `${symbol}-chart-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    
    showNotification('График сохранён как PNG', 'success');
    
    // Close menu
    const menu = document.getElementById('stockDownloadMenu');
    if (menu) menu.style.display = 'none';
  }).catch(error => {
    console.error('Ошибка скачивания PNG:', error);
    showNotification('Ошибка сохранения графика', 'error');
  });
};

// Stock compare search listener
document.addEventListener('DOMContentLoaded', () => {
  const stockCompareSearch = document.getElementById('stockCompareSearch');
  if (stockCompareSearch) {
    // Обработчик ввода для поиска
    stockCompareSearch.addEventListener('input', (e) => {
      e.stopPropagation();
      populateStockCompareList();
    });
    
    // Предотвращаем закрытие dropdown при клике на поле поиска
    stockCompareSearch.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    
    // Обработчик фокуса
    stockCompareSearch.addEventListener('focus', (e) => {
      e.stopPropagation();
      const dropdown = document.getElementById('stockCompareDropdownMenu');
      if (dropdown && dropdown.style.display === 'none') {
        dropdown.style.display = 'block';
        populateStockCompareList();
      }
    });
  }
  
  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.chart-compare-dropdown') && !e.target.closest('#stockChartCompareDropdown')) {
      const dropdown = document.getElementById('stockCompareDropdownMenu');
      if (dropdown) dropdown.style.display = 'none';
    }
    if (!e.target.closest('.chart-download-wrapper')) {
      const menu = document.getElementById('stockDownloadMenu');
      if (menu) menu.style.display = 'none';
    }
  });
});

console.log('Stock comparison & download functions loaded');
