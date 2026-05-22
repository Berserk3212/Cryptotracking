// favorites-controls.js

function formatVolume(v) {
  const volume = parseFloat(v);
  if (isNaN(volume) || volume === 0) return '0';
  if (volume >= 1e9) return (volume / 1e9).toFixed(1) + 'B';
  if (volume >= 1e6) return (volume / 1e6).toFixed(1) + 'M';
  if (volume >= 1e3) return (volume / 1e3).toFixed(1) + 'K';
  return volume.toFixed(0);
}

export async function loadStockData(symbols) {
  const FINNHUB_TOKEN = 'd49lflpr01qlaebhu1egd49lflpr01qlaebhu1f0';
  const results = {};
  

  
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

        }
      }
    } catch (error) {

    }
  });
  
  await Promise.all(promises);
  return results;
}

async function fetchFavoritesCoins() {
  const { getFavorites } = await import('../../core/data.js');
  const api = await import('../../api/api.js');
  
  if (!window.cryptoList || window.cryptoList.length === 0) {
    try { await Promise.race([api.loadCryptoList(), new Promise(r => setTimeout(r, 4000))]); } catch (_) {}
  }

  const favs = await getFavorites().catch(() => []);
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

  return coins;
}

function createControlsHTML() {
  return `
    <div class="fc-panel">
      <div class="fc-row">
        <div class="fc-search">
          <i class="fas fa-search"></i>
          <input type="text" id="favoritesSearch" placeholder="Поиск в избранном (символ/имя)..." />
          <button id="favoritesClear" class="fc-clear" style="display:none"><i class="bi bi-x-lg"></i></button>
        </div>
      </div>
      <div class="fc-row fc-row--filters">
        <div class="fc-control-group">
          <span class="fc-label">Сортировка</span>
          <select id="favoritesSort">
            <option value="default">По умолч.</option>
            <option value="price_desc">Цена ↓</option>
            <option value="price_asc">Цена ↑</option>
            <option value="change_desc">Измен. ↓</option>
            <option value="change_asc">Измен. ↑</option>
            <option value="volume_desc">Объём ↓</option>
            <option value="marketcap_desc">Капитал. ↓</option>
          </select>
        </div>
        <div class="fc-control-group">
          <span class="fc-label">Цена</span>
          <div class="fc-price-range">
            <div class="fc-price-input">
              <input type="number" id="priceMin" placeholder="min" translate="no" />
              <div class="fc-stepper">
                <button type="button" class="fc-step-up" data-target="priceMin"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg></button>
                <button type="button" class="fc-step-down" data-target="priceMin"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>
              </div>
            </div>
            <span class="fc-price-dash">—</span>
            <div class="fc-price-input">
              <input type="number" id="priceMax" placeholder="max" translate="no" />
              <div class="fc-stepper">
                <button type="button" class="fc-step-up" data-target="priceMax"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg></button>
                <button type="button" class="fc-step-down" data-target="priceMax"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>
              </div>
            </div>
          </div>
        </div>
        <div class="fc-control-group">
          <span class="fc-label">Фильтр</span>
          <select id="percentFilter">
            <option value="all">Все</option>
            <option value="gainers">Победители</option>
            <option value="losers">Неудачники</option>
          </select>
        </div>
        <div class="fc-control-group">
          <span class="fc-label">Спарклайн</span>
          <select id="sparklineRange">
            <option value="auto">auto</option>
            <option value="7">7д</option>
            <option value="30">30д</option>
          </select>
        </div>
      </div>
      <div class="fc-row fc-row--actions">
        <button id="exportCsvBtn" class="fc-btn"><i class="fas fa-file-csv"></i> CSV</button>
        <button id="exportFavsBtn" class="fc-btn"><i class="fas fa-download"></i> Экспорт</button>
        <input type="file" id="importFavsFile" accept="application/json" style="display:none" />
        <button id="importFavsBtn" class="fc-btn"><i class="fas fa-upload"></i> Импорт</button>
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

  // Добавляем контейнер управления если его ещё нет
  let controlsWrap = document.getElementById('favoritesControlsWrap');
  const isFirstInit = !controlsWrap;
  if (isFirstInit) {
    controlsWrap = document.createElement('div');
    controlsWrap.id = 'favoritesControlsWrap';
    controlsWrap.innerHTML = createControlsHTML();
    section.insertBefore(controlsWrap, document.getElementById('favoritesCryptoGrid'));
  } else if (typeof window._refreshFavoritesControls === 'function') {
    // Уже инициализирован — просто обновляем данные, не переинициализируем DOM
    await window._refreshFavoritesControls();
    return;
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

  // Состояние
  let allCoins = await fetchFavoritesCoins();
  let filtered = allCoins.slice();

  const api = await import('../../api/api.js');

  async function refreshData() {
    // Перезагружаем данные избранного с актуальными ценами
    allCoins = await fetchFavoritesCoins();

  }

  async function applyFiltersAndRender() {
    const q = (searchInput.value || '').trim().toLowerCase();
    const min = parseFloat(priceMin.value) || -Infinity;
    const max = parseFloat(priceMax.value) || Infinity;
    const pct = percentFilter.value;

    
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

    // Сортировка
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

    // Обновляем спарклайны при необходимости (используем существующий priceHistory)
    api.renderCryptoCards(filtered, 'favoritesCryptoGrid');
  }

  // Первый рендер: если сетка уже содержит карточки (например, недавно отрендерены
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

  // Кнопки шага для полей цены
  controlsWrap.querySelectorAll('.fc-step-up, .fc-step-down').forEach(btn => {
    const targetId = btn.dataset.target;
    const input = document.getElementById(targetId);
    if (!input) return;
    const isUp = btn.classList.contains('fc-step-up');
    function step() {
      let val = parseFloat(input.value) || 0;
      val = isUp ? val + 1 : Math.max(0, val - 1);
      input.value = val;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      applyFiltersAndRender();
    }
    let rTimer = null, rInterval = null;
    function startRepeat() { step(); rTimer = setTimeout(() => { rInterval = setInterval(step, 120); }, 400); }
    function stopRepeat() { clearTimeout(rTimer); clearInterval(rInterval); rTimer = null; rInterval = null; }
    btn.addEventListener('mousedown', startRepeat);
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); startRepeat(); }, { passive: false });
    btn.addEventListener('mouseup', stopRepeat);
    btn.addEventListener('mouseleave', stopRepeat);
    btn.addEventListener('touchend', stopRepeat);
  });

  // Улучшаем нативные селекты в кастомные анимированные дропдауны
  const selectsToEnhance = ['favoritesSort','percentFilter','sparklineRange'];
  selectsToEnhance.forEach(id => {
    const s = document.getElementById(id);
    if (s) enhanceSelect(s);
  });

  // Обработчики событий
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
    // Пока просто перерисовываем; в будущем — подгружать разные периоды priceHistory
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

      showNotification('Не удалось импортировать избранные', 'error');
    }
  });

  // Автоматическое обновление данных каждые 30 секунд
  let autoRefreshInterval = setInterval(async () => {

    await refreshData();
    applyFiltersAndRender();
  }, 30000); // 30 seconds

  // Публикуем функцию обновления, чтобы повторные вызовы initFavoritesControls
  // только обновляли данные, не перестраивая DOM заново
  window._refreshFavoritesControls = async () => {
    await refreshData();
    applyFiltersAndRender();
  };

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

  }
}

// Автоинициализация не выполняется: initFavoritesControls экспортируется и вызывается из ui.js при открытии избранного.

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
  // Стрелка-каретка для визуального индикатора (поворачивается через CSS)
  const caret = document.createElement('span');
  caret.className = 'caret';
  selected.appendChild(caret);

  const opts = document.createElement('ul');
  opts.className = 'custom-select-options';
  opts.setAttribute('role', 'listbox');
  opts.tabIndex = -1;

  // Наполняем список опций
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

  let live = null; // aria-live элемент (назначается после вставки wrapper)

  // При открытии переносим список опций в document.body и позиционируем через fixed
  let repositionHandler = null;
  function repositionOptions() {
    const rect = wrapper.getBoundingClientRect();
    // не выходим за пределы viewport по горизонтали
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
