// market-search.js

export function initMarketSearch() {
  console.log('Initializing market search...');
    
    const searchInput = document.getElementById('marketSearch');
    const cryptoSearchInput = document.getElementById('cryptoSearch');
  
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      filterMarketContent(query);
    });
  }
  
  if (cryptoSearchInput) {
    cryptoSearchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      filterCryptoGrid(query);
    });
  }
  
  console.log('Market search initialized');
}

function filterMarketContent(query) {
  const activeTab = document.querySelector('.tab.active');
  if (!activeTab) return;
  
  const tabName = activeTab.dataset.tab;
  
  switch (tabName) {
    case 'stocks':
      filterStocksTable(query);
      break;
    case 'crypto':
      filterMarketCrypto(query);
      break;
    case 'indices':
      filterIndicesGrid(query);
      break;
  }
};

const filterStocksTable = (query) => {
  const tbody = document.getElementById('stocksTable');
  if (!tbody) return;
  
  const rows = tbody.querySelectorAll('tr');
  let visibleCount = 0;
  
  rows.forEach(row => {
    if (row.classList.contains('loading-row') || row.querySelector('.loading-row')) {
      return;
    }
    
    const text = row.textContent.toLowerCase();
    const shouldShow = !query || text.includes(query);
    
    row.style.display = shouldShow ? '' : 'none';
    if (shouldShow) visibleCount++;
  });
  
  if (visibleCount === 0 && query) {
    showNoResults(tbody, 'Акции не найдены');
  } else {
    removeNoResults(tbody);
  }
};

const filterMarketCrypto = (query) => {
  const grid = document.getElementById('marketCryptoGrid');
  if (!grid) return;
  
  const cards = grid.querySelectorAll('.crypto-card');
  let visibleCount = 0;
    
    cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        const shouldShow = !query || text.includes(query);
        
        card.style.display = shouldShow ? '' : 'none';
        if (shouldShow) visibleCount++;
    });
    
    if (visibleCount === 0 && query) {
        showNoResults(grid, 'Криптовалюты не найдены');
    } else {
        removeNoResults(grid);
    }
}

const filterCryptoGrid = (query) => {
    const grid = document.getElementById('mainCryptoGrid');
    if (!grid) return;
    
    const cards = grid.querySelectorAll('.crypto-card');
    let visibleCount = 0;
    
    cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        const shouldShow = !query || text.includes(query);
        
        card.style.display = shouldShow ? '' : 'none';
        if (shouldShow) visibleCount++;
    });
    
    if (visibleCount === 0 && query) {
        showNoResults(grid, 'Криптовалюты не найдены');
    } else {
        removeNoResults(grid);
    }
}

const filterIndicesGrid = (query) => {
    const grid = document.getElementById('indicesGrid');
    if (!grid) return;
    
    const cards = grid.querySelectorAll('.index-card');
    let visibleCount = 0;
    
    cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        const shouldShow = !query || text.includes(query);
        
        card.style.display = shouldShow ? '' : 'none';
        if (shouldShow) visibleCount++;
    });
    
    if (visibleCount === 0 && query) {
        showNoResults(grid, 'Индексы не найдены');
    } else {
        removeNoResults(grid);
    }
};

const showNoResults = (container, message) => {
    removeNoResults(container);
    
    const noResultsDiv = document.createElement('div');
    noResultsDiv.className = 'market-no-results';
    noResultsDiv.innerHTML = `
        <i class="fas fa-search"></i>
        <h3>Ничего не найдено</h3>
        <p>${message}</p>
    `;
    container.appendChild(noResultsDiv);
}

const removeNoResults = (container) => {
    const existing = container.querySelector('.market-no-results');
    if (existing) {
        existing.remove();
    }
}
