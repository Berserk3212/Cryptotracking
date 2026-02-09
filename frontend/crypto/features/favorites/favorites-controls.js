// favorites-controls.js

function formatVolume(v) {
  const volume = parseFloat(v);
  if (isNaN(volume) || volume === 0) return '0';
  if (volume >= 1e9) return (volume / 1e9).toFixed(1) + 'B';
  if (volume >= 1e6) return (volume / 1e6).toFixed(1) + 'M';
  if (volume >= 1e3) return (volume / 1e3).toFixed(1) + 'K';
  return volume.toFixed(0);
}


async function loadStockData(symbols) {
  const FINNHUB_TOKEN = 'd49lflpr01qlaebhu1egd49lflpr01qlaebhu1f0';
  const results = {};
  
  console.log('[FavoritesControls] Loading stock data for:', symbols);
  
  const promises = symbols.map(async symbol => {
    try {
      const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_TOKEN}`);
      if (response.ok) {
        const data = await response.json();
        if (data && data.c) {
          const info = window.STOCK_INFO?.[symbol] || { name: symbol };
          results[symbol] = {
            symbol,
            name: info.name || symbol,
            price: data.c.toFixed(2),
            change: (data.c - data.pc).toFixed(2),
            changePercent: (((data.c - data.pc) / data.pc) * 100).toFixed(2),
            high: data.h.toFixed(2),
            low: data.l.toFixed(2),
            volume: data.v || 0
          };
          console.log(`[FavoritesControls] Loaded ${symbol}:`, results[symbol]);
        }
      }
    } catch (error) {
      console.warn(`[FavoritesControls] Failed to load ${symbol}:`, error);
    }
  });
  
  await Promise.all(promises);
  return results;
}

async function fetchFavoritesCoins() {
  const { getFavorites } = await import('../../core/data.js');
  const api = await import('../../api/api.js');
  
  if (!window.cryptoList || window.cryptoList.length === 0) {
    try { await Promise.race([api.loadCryptoList(), new Promise(r => setTimeout(r, 4000))]); } catch (e) { console.warn('loadCryptoList failed in favorites-controls', e); }
  }

  const favs = await getFavorites().catch(e => { console.warn('getFavorites failed', e); return []; });
  const cryptoList = window.cryptoList || [];

  // Определяем какие символы это акции
  const stockSymbols = [];
  const cryptoSymbols = [];
  
  (favs || []).forEach(f => {
    const sym = String(f.symbol || '').toUpperCase();
    const isStock = window.STOCK_INFO && window.STOCK_INFO[sym];
    if (isStock) {
      stockSymbols.push(sym);
    } else {
      cryptoSymbols.push(sym);
    }
  });

  const stocksToLoad = stockSymbols.filter(sym => !window.stocksRealData?.[sym]);
  if (stocksToLoad.length > 0) {
    console.log('[FavoritesControls] Loading missing stock data:', stocksToLoad);
    const loadedStocks = await loadStockData(stocksToLoad);
    
    if (!window.stocksRealData) {
      window.stocksRealData = {};
    }
    Object.assign(window.stocksRealData, loadedStocks);
  }

  const coins = (favs || []).map(f => {
    const sym = String(f.symbol || '').toUpperCase();
    const isStock = window.STOCK_INFO && window.STOCK_INFO[sym];
    
    if (isStock) {
      let stockData = window.stocksRealData?.[sym];
      const info = window.STOCK_INFO[sym] || { name: sym, color: '#3B82F6' };
      
      return {
        symbol: sym,
        name: stockData?.name || info.name || sym,
        price: parseFloat(stockData?.price || 0),
        changePercent: parseFloat(stockData?.changePercent || 0),
        change: parseFloat(stockData?.change || 0),
        high: parseFloat(stockData?.high || 0),
        low: parseFloat(stockData?.low || 0),
        volume: stockData?.volume || 0,
        volumeFormatted: formatVolume(stockData?.volume || 0),
        marketCap: 0,
        priceHistory: stockData?.priceHistory || [],
        assetType: 'stock',
        color: info.color
      };
    }
    
    const found = cryptoList.find(c => (c.symbol || '').toUpperCase() === sym);
      const baseInfo = window.CRYPTO_INFO?.[sym] || {};
      const priceRaw = found?.price ?? found?.lastPrice ?? found?.priceUsd ?? 0;
      const price = (typeof priceRaw === 'number') ? priceRaw : Number(String(priceRaw).replace(/[^0-9.\-]/g, '')) || 0;
      
      return {
        symbol: sym,
        name: found?.name || baseInfo.name || sym,
        price,
        changePercent: found?.changePercent ?? found?.change ?? 0,
        change: found?.change || 0,
        high: found?.high || 0,
        low: found?.low || 0,
        volume: found?.volume || found?.volumeFormatted || 0,
        volumeFormatted: found?.volumeFormatted || '0',
        marketCap: found?.marketCap || baseInfo.marketCap || 0,
        priceHistory: found?.priceHistory || [],
        assetType: 'crypto',
        color: baseInfo.color
      };
  });

  console.log('[FavoritesControls] Loaded favorites:', coins.map(c => ({ symbol: c.symbol, assetType: c.assetType, price: c.price })));

  return coins;
}

function createControlsHTML() {
  return `
    <div class="favorites-controls">
      <div class="fc-left">
        <div class="search-bar small">
          <i class="fas fa-search"></i>
          <input type="text" id="favoritesSearch" placeholder="Поиск в избранном (символ/имя)..." />
          <button id="favoritesClear" class="search-clear" style="display:none"><i class="bi bi-x-lg"></i></button>
        </div>
        <select id="favoritesSort" class="sort-select">
          <option value="default">Сортировка</option>
          <option value="price_desc">Цена (убыв.)</option>
          <option value="price_asc">Цена (возр.)</option>
          <option value="change_desc">Измен. 24ч (убыв.)</option>
          <option value="change_asc">Измен. 24ч (возр.)</option>
          <option value="volume_desc">Объём (убыв.)</option>
          <option value="marketcap_desc">Market Cap (убыв.)</option>
        </select>

        <label class="fc-filter">Цена
          <input type="number" id="priceMin" placeholder="min" style="width:80px;margin-left:6px" />
          <input type="number" id="priceMax" placeholder="max" style="width:80px;margin-left:6px" />
        </label>

        <select id="percentFilter" class="sort-select">
          <option value="all">Все</option>
          <option value="gainers">Gainers</option>
          <option value="losers">Losers</option>
        </select>

      </div>
      <div class="fc-right">
        <select id="sparklineRange" class="sort-select">
          <option value="auto">Спарклайн: auto</option>
          <option value="7">7d</option>
          <option value="30">30d</option>
        </select>
        <button id="exportCsvBtn" class="btn btn-outline">Экспорт CSV</button>
        <button id="exportFavsBtn" class="btn btn-outline">Экспорт избранных</button>
        <input type="file" id="importFavsFile" accept="application/json" style="display:none" />
        <button id="importFavsBtn" class="btn btn-outline">Импорт избранных</button>
      </div>
    </div>
  `;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function coinsToCSV(coins) {
  const header = ['symbol','name','price','changePercent','volume','marketCap'];
  const rows = coins.map(c => [c.symbol,c.name,Number(c.price).toFixed(8),c.changePercent,c.volume,c.marketCap]);
  const csv = [header.join(','), ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(','))].join('\n');
  return csv;
}

export async function initFavoritesControls() {
  const section = document.getElementById('favoritesSection');
  if (!section) return;

  // Add controls container if not present
  let controlsWrap = document.getElementById('favoritesControlsWrap');
  if (!controlsWrap) {
    controlsWrap = document.createElement('div');
    controlsWrap.id = 'favoritesControlsWrap';
    controlsWrap.innerHTML = createControlsHTML();
    section.insertBefore(controlsWrap, document.getElementById('favoritesCryptoGrid'));
  }

  const searchInput = document.getElementById('favoritesSearch');
  const clearBtn = document.getElementById('favoritesClear');
  const sortSelect = document.getElementById('favoritesSort');
  const priceMin = document.getElementById('priceMin');
  const priceMax = document.getElementById('priceMax');
  const percentFilter = document.getElementById('percentFilter');
  const sparkRange = document.getElementById('sparklineRange');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const exportFavsBtn = document.getElementById('exportFavsBtn');
  const importFavsBtn = document.getElementById('importFavsBtn');
  const importFile = document.getElementById('importFavsFile');

  // State
  let allCoins = await fetchFavoritesCoins();
  let filtered = allCoins.slice();

  const api = await import('../../api/api.js');

  async function refreshData() {
    // Перезагружаем данные избранного с актуальными ценами
    allCoins = await fetchFavoritesCoins();
    console.log('[FavoritesControls] Data refreshed:', allCoins.length, 'items');
  }

  async function applyFiltersAndRender() {
    const q = (searchInput.value || '').trim().toLowerCase();
    const min = parseFloat(priceMin.value) || -Infinity;
    const max = parseFloat(priceMax.value) || Infinity;
    const pct = percentFilter.value;

    console.log('[FavoritesControls] Filtering with allCoins:', allCoins.length, 'items');
    
    filtered = allCoins.filter(c => {
      if (q) {
        const m = c.symbol.toLowerCase().includes(q) || (c.name || '').toLowerCase().includes(q);
        if (!m) return false;
      }
      const currentPrice = parseFloat(c.price) || 0;
      if (currentPrice < min || currentPrice > max) return false;
      if (pct === 'gainers' && parseFloat(c.changePercent) <= 0) return false;
      if (pct === 'losers' && parseFloat(c.changePercent) >= 0) return false;
      return true;
    });

    // Sorting
    const sort = sortSelect.value;
    if (sort === 'price_desc') filtered.sort((a,b)=>b.price-a.price);
    else if (sort === 'price_asc') filtered.sort((a,b)=>a.price-b.price);
    else if (sort === 'change_desc') filtered.sort((a,b)=>b.changePercent-a.changePercent);
    else if (sort === 'change_asc') filtered.sort((a,b)=>a.changePercent-b.changePercent);
    else if (sort === 'volume_desc') filtered.sort((a,b)=>Number(b.volume||0)-Number(a.volume||0));
    else if (sort === 'marketcap_desc') filtered.sort((a,b)=>Number(b.marketCap||0)-Number(a.marketCap||0));

    console.log('[FavoritesControls] Rendering filtered coins:', filtered.length, filtered.map(c => ({ 
      symbol: c.symbol, 
      assetType: c.assetType, 
      price: c.price,
      volume: c.volume,
      volumeFormatted: c.volumeFormatted,
      _noData: c._noData
    })));

    // Update sparklines if needed (we currently rely on existing priceHistory)
    api.renderCryptoCards(filtered, 'favoritesCryptoGrid');
  }

  // Initial render
  // Initial render: если сетка уже содержит карточки (например, недавно отрендерены
  // через renderFavoritesSection), не перезаписываем её немедленно — это предотвращает
  // мерцание/исчезновение контента при быстром последовательном рендеринге.
  const favGrid = document.getElementById('favoritesCryptoGrid');
  const hasCards = favGrid && favGrid.querySelectorAll && favGrid.querySelectorAll('.crypto-card').length > 0;
  if (!hasCards) {
    applyFiltersAndRender();
  } else {
    // Синхронизируем состояние filtered с полученными монетами, но сохраняем текущий UI
    filtered = allCoins.slice();
  }

  // Add custom steppers for number inputs (priceMin/priceMax)
  [priceMin, priceMax].forEach(input => {
    if (!input) return;
    // wrap input
    const wrapper = document.createElement('span');
    wrapper.className = 'number-stepper-wrapper';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const stepper = document.createElement('span');
    stepper.className = 'number-stepper';
    stepper.innerHTML = `
      <button type="button" class="step-up" aria-label="Увеличить">\n        <svg viewBox="0 0 24 24"><path d="M7 14l5-5 5 5z"></path></svg>\n      </button>\n      <button type="button" class="step-down" aria-label="Уменьшить">\n        <svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"></path></svg>\n      </button>`;
    wrapper.appendChild(stepper);

    const up = stepper.querySelector('.step-up');
    const down = stepper.querySelector('.step-down');

    function step(delta){
      const stepVal = parseFloat(input.step) || 1;
      const min = (input.min !== '') ? Number(input.min) : -Infinity;
      const max = (input.max !== '') ? Number(input.max) : Infinity;
      let val = parseFloat(input.value) || 0;
      val = Math.round((val + delta*stepVal) * 100000000) / 100000000;
      if (val < min) val = min;
      if (val > max) val = max;
      input.value = val;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      applyFiltersAndRender();
    }

    // handle clicks and long-press auto-repeat
    let repeatTimer = null;
    let repeatInterval = null;
    function startRepeat(delta){
      step(delta);
      repeatTimer = setTimeout(()=>{
        repeatInterval = setInterval(()=> step(delta), 120);
      }, 400);
    }
    function stopRepeat(){ if (repeatTimer) { clearTimeout(repeatTimer); repeatTimer = null; } if (repeatInterval) { clearInterval(repeatInterval); repeatInterval = null; } }

    up.addEventListener('mousedown', ()=> startRepeat(1));
    up.addEventListener('mouseup', stopRepeat);
    up.addEventListener('mouseleave', stopRepeat);
    up.addEventListener('click', ()=> step(1));

    down.addEventListener('mousedown', ()=> startRepeat(-1));
    down.addEventListener('mouseup', stopRepeat);
    down.addEventListener('mouseleave', stopRepeat);
    down.addEventListener('click', ()=> step(-1));

  });

  // Enhance native selects into custom animated dropdowns for better UX
  const selectsToEnhance = ['favoritesSort','percentFilter','sparklineRange'];
  selectsToEnhance.forEach(id => {
    const s = document.getElementById(id);
    if (s) enhanceSelect(s);
  });

  // Handlers
  searchInput.addEventListener('input', () => { 
    clearBtn.style.display = searchInput.value ? 'inline-block' : 'none'; 
    applyFiltersAndRender(); 
  });
  clearBtn.addEventListener('click', () => { 
    searchInput.value=''; 
    clearBtn.style.display='none'; 
    applyFiltersAndRender(); 
  });
  sortSelect.addEventListener('change', applyFiltersAndRender);
  priceMin.addEventListener('change', applyFiltersAndRender);
  priceMax.addEventListener('change', applyFiltersAndRender);
  percentFilter.addEventListener('change', applyFiltersAndRender);
  sparkRange.addEventListener('change', (e)=>{
    // For now we just re-render; advanced: fetch different priceHistory lengths
    applyFiltersAndRender();
  });

  exportCsvBtn.addEventListener('click', ()=>{
    const csv = coinsToCSV(filtered);
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    downloadBlob(blob, `favorites_export_${new Date().toISOString().slice(0,10)}.csv`);
    showNotification('CSV экспортирован', 'success');
  });

  exportFavsBtn.addEventListener('click', async ()=>{
    const { getFavorites } = await import('../../core/data.js');
    const favs = await getFavorites().catch(()=>[]);
    const payload = JSON.stringify(favs.map(f=>f.symbol), null, 2);
    downloadBlob(new Blob([payload], {type:'application/json'}), `favorites_symbols_${new Date().toISOString().slice(0,10)}.json`);
    showNotification('Избранные экспортированы', 'success');
  });

  importFavsBtn.addEventListener('click', ()=> importFile.click());
  importFile.addEventListener('change', async (e)=>{
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const arr = JSON.parse(text);
      if (!Array.isArray(arr)) throw new Error('Invalid format');
      const { addFavorite } = await import('../../core/data.js');
      let added = 0;
      for (const s of arr) {
        try { await addFavorite(String(s).toUpperCase()); added++; } catch(e) { console.warn('addFavorite failed', e); }
      }
      showNotification(`Импортировано ${added} символов`, 'success');
      allCoins = await fetchFavoritesCoins();
      applyFiltersAndRender();
    } catch (err) {
      console.error('Import favorites failed', err);
      showNotification('Не удалось импортировать избранные', 'error');
    }
  });

  // Автоматическое обновление данных каждые 30 секунд
  let autoRefreshInterval = setInterval(async () => {
    console.log('[FavoritesControls] Auto-refreshing data...');
    await refreshData();
    applyFiltersAndRender();
  }, 30000); // 30 seconds

  // Очистка интервала при закрытии секции избранного
  // Добавим возможность остановить автообновление
  if (!window.favoritesAutoRefreshIntervals) {
    window.favoritesAutoRefreshIntervals = [];
  }
  window.favoritesAutoRefreshIntervals.push(autoRefreshInterval);

}

// Функция для очистки всех автообновлений при закрытии секции
export function cleanupFavoritesAutoRefresh() {
  if (window.favoritesAutoRefreshIntervals) {
    window.favoritesAutoRefreshIntervals.forEach(interval => clearInterval(interval));
    window.favoritesAutoRefreshIntervals = [];
    console.log('[FavoritesControls] Auto-refresh intervals cleared');
  }
}

// Auto-init not performed: initFavoritesControls is exported and called from `ui.js` when favorites shown.

export default { initFavoritesControls, cleanupFavoritesAutoRefresh };

// --- Custom select enhancement (accessible, keyboard navigable) ---
function enhanceSelect(nativeSelect) {
  if (nativeSelect.__enhanced) return;
  nativeSelect.style.opacity = '0';
  nativeSelect.style.position = 'absolute';
  nativeSelect.style.pointerEvents = 'none';

  const wrapper = document.createElement('div');
  wrapper.className = 'custom-select-wrapper';
  const selected = document.createElement('button');
  selected.type = 'button';
  selected.className = 'custom-select-selected';
  selected.setAttribute('aria-haspopup', 'listbox');
  selected.setAttribute('aria-expanded', 'false');
  // caret element for better visuals (uses CSS for rotation)
  const caret = document.createElement('span');
  caret.className = 'caret';
  selected.appendChild(caret);

  const opts = document.createElement('ul');
  opts.className = 'custom-select-options';
  opts.setAttribute('role', 'listbox');
  opts.tabIndex = -1;

  // Populate
  Array.from(nativeSelect.options).forEach((opt, idx) => {
    const li = document.createElement('li');
    li.className = 'custom-select-option';
    li.textContent = opt.textContent;
    li.dataset.value = opt.value;
    li.setAttribute('role', 'option');
    if (opt.selected) {
      li.classList.add('selected');
      selected.textContent = opt.textContent;
      li.setAttribute('aria-selected', 'true');
    }
    li.addEventListener('click', (e) => {
      e.stopPropagation();
      selectOption(idx);
      closeOptions();
      nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    opts.appendChild(li);
  });

  let live = null; // will hold aria-live element (assigned after wrapper insertion)

  // When opening, move the options list to document.body and position it fixed
  let repositionHandler = null;
  function repositionOptions() {
    const rect = wrapper.getBoundingClientRect();
    // keep within viewport horizontally
    const left = Math.max(8, rect.left);
    const top = rect.bottom + 8;
    opts.style.position = 'fixed';
    opts.style.left = left + 'px';
    opts.style.top = top + 'px';
    opts.style.minWidth = rect.width + 'px';
    opts.style.right = 'auto';
    // adjust max-height so it fits in viewport
    const available = Math.max(80, window.innerHeight - top - 20);
    opts.style.maxHeight = Math.min(320, available) + 'px';
  }

  function openOptions() {
    // append to body so it's outside any stacking context of ancestors
    if (opts.parentNode !== document.body) document.body.appendChild(opts);
    opts.classList.add('open');
    wrapper.classList.add('open');
    selected.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', outsideClick);
    // position and keep repositioning on scroll/resize
    repositionOptions();
    repositionHandler = () => repositionOptions();
    window.addEventListener('resize', repositionHandler);
    window.addEventListener('scroll', repositionHandler, true);
    if (live) try { live.textContent = `Открыто меню — ${opts.children.length} вариантов`; } catch(e){}
  }

  function closeOptions() {
    opts.classList.remove('open');
    wrapper.classList.remove('open');
    selected.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', outsideClick);
    // remove global listeners
    if (repositionHandler) {
      window.removeEventListener('resize', repositionHandler);
      window.removeEventListener('scroll', repositionHandler, true);
      repositionHandler = null;
    }
    // move back into wrapper so DOM stays consistent
    if (opts.parentNode === document.body) wrapper.appendChild(opts);
    // clear inline positioning
    opts.style.position = '';
    opts.style.left = '';
    opts.style.top = '';
    opts.style.minWidth = '';
    opts.style.right = '';
    opts.style.maxHeight = '';
    if (live) try { live.textContent = 'Меню закрыто'; } catch(e){}
  }
  function outsideClick(e) {
    if (!wrapper.contains(e.target)) closeOptions();
  }

  let focusedIndex = -1;
  function selectOption(index) {
    const opt = nativeSelect.options[index];
    if (!opt) return;
    nativeSelect.value = opt.value;
    // Update display
    Array.from(opts.children).forEach((li, i) => {
      li.classList.toggle('selected', i === index);
      li.setAttribute('aria-selected', i === index ? 'true' : 'false');
    });
    selected.textContent = opt.textContent;
    focusedIndex = index;
    if (live) try { live.textContent = `Выбрано ${opt.textContent}`; } catch(e){}
  }

  selected.addEventListener('click', (e) => {
    e.stopPropagation();
    if (opts.classList.contains('open')) closeOptions(); else openOptions();
    // focus first selected or first
    const sel = Array.from(opts.children).findIndex(li => li.classList.contains('selected'));
    focusedIndex = sel >= 0 ? sel : 0;
    focusOption(focusedIndex);
  });

  function focusOption(i) {
    Array.from(opts.children).forEach((li, idx) => li.classList.toggle('focused', idx === i));
    const node = opts.children[i]; if (node) node.scrollIntoView({ block: 'nearest' });
  }

  selected.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); openOptions(); focusedIndex = Math.min(opts.children.length-1, (focusedIndex<0?0:focusedIndex+1)); focusOption(focusedIndex); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); openOptions(); focusedIndex = Math.max(0, focusedIndex-1); focusOption(focusedIndex); }
    else if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); if (opts.classList.contains('open')) { selectOption(focusedIndex); closeOptions(); nativeSelect.dispatchEvent(new Event('change',{bubbles:true})); } else openOptions(); }
    else if (ev.key === 'Escape') { closeOptions(); }
  });

  opts.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); focusedIndex = Math.min(opts.children.length-1, focusedIndex+1); focusOption(focusedIndex); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); focusedIndex = Math.max(0, focusedIndex-1); focusOption(focusedIndex); }
    else if (ev.key === 'Enter') { ev.preventDefault(); selectOption(focusedIndex); closeOptions(); nativeSelect.dispatchEvent(new Event('change',{bubbles:true})); }
    else if (ev.key === 'Escape') { closeOptions(); }
  });

  wrapper.appendChild(selected);
  wrapper.appendChild(opts);
  nativeSelect.parentNode.insertBefore(wrapper, nativeSelect.nextSibling);

  // Accessibility: live region for announcements (visually hidden)
  live = document.createElement('span');
  live.className = 'sr-only aria-live';
  live.setAttribute('aria-live', 'polite');
  live.style.position = 'absolute';
  live.style.left = '-9999px';
  wrapper.appendChild(live);

  // Helper: when native select changes (e.g., programmatically), keep UI in sync
  nativeSelect.addEventListener('change', () => {
    const idx = nativeSelect.selectedIndex;
    selectOption(idx);
  });

  // Initialize selected text if not set
  if (!selected.textContent) {
    const first = nativeSelect.options[nativeSelect.selectedIndex] || nativeSelect.options[0];
    selected.textContent = first ? first.textContent : '';
  }

  nativeSelect.__enhanced = true;
}
