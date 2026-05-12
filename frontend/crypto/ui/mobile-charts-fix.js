// =============================================
// МОБИЛЬНЫЕ ИСПРАВЛЕНИЯ ГРАФИКОВ И МОДАЛЬНЫХ ОКОН v3
// Только touch-handling + body scroll lock
// Все размеры и лейаут контролируются через CSS
// =============================================

(function() {
  'use strict';
  
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || window.innerWidth <= 768;
  
  if (!isMobile) return;
  
  // === Body Scroll Lock при открытии модалок
  let scrollLockCount = 0;
  
  function lockBodyScroll() {
    scrollLockCount++;
    if (scrollLockCount === 1) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${window.scrollY}px`;
    }
  }
  
  function unlockBodyScroll() {
    scrollLockCount = Math.max(0, scrollLockCount - 1);
    if (scrollLockCount === 0) {
      const scrollY = document.body.style.top;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
      window.scrollTo(0, parseInt(scrollY || '0') * -1);
    }
  }
  
  // Слушаем открытие/закрытие модалок
  const originalOpenModal = window.openModal;
  if (typeof originalOpenModal === 'function') {
    window.openModal = function(...args) {
      lockBodyScroll();
      return originalOpenModal.apply(this, args);
    };
  }
  
  const originalCloseModal = window.closeModal;
  if (typeof originalCloseModal === 'function') {
    window.closeModal = function(...args) {
      unlockBodyScroll();
      return originalCloseModal.apply(this, args);
    };
  }
  
  // Fallback: отслеживаем display change на модалках
  const modals = document.querySelectorAll('.modal');
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      if (m.attributeName === 'style' || m.attributeName === 'class') {
        const el = m.target;
        if (!el.classList.contains('modal')) return;
        const isVisible = el.style.display !== 'none' && el.classList.contains('show') || el.style.display === 'flex' || el.style.display === 'block';
        // Мы не дублируем lock/unlock — только для модалок, которые не через openModal
      }
    });
  });
  modals.forEach(modal => {
    observer.observe(modal, { attributes: true, attributeFilter: ['style', 'class'] });
  });
  
  // ===================================================
  // 2. TOUCH-ACTION: разрешаем вертикальный скролл поверх графика
  // ===================================================
  // LightweightCharts перехватывает ВСЕ touch-события.
  // Решение: добавляем touch-action: pan-y на контейнеры графиков,
  // а также настраиваем handleScroll в опциях LC через патч.
  
  function applyTouchFix(chartContainer) {
    if (!chartContainer) return;
    
    // CSS touch-action: позволяем вертикальный скролл
    chartContainer.style.touchAction = 'pan-y';
    
    // Находим все canvas внутри (LightweightCharts создаёт их)
    const canvases = chartContainer.querySelectorAll('canvas');
    canvases.forEach(c => {
      c.style.touchAction = 'pan-y';
    });
    
    // Для wrapper-div который LC создаёт
    const lcWrapper = chartContainer.querySelector('div[style*="position: relative"]');
    if (lcWrapper) {
      lcWrapper.style.touchAction = 'pan-y';
    }
  }
  
  // Наблюдаем за появлением canvas в контейнерах графиков
  function observeChartContainer(container) {
    if (!container) return;
    applyTouchFix(container);
    
    const canvasObserver = new MutationObserver(() => {
      applyTouchFix(container);
    });
    canvasObserver.observe(container, { childList: true, subtree: true });
  }
  
  // Применяем ко всем известным контейнерам
  function initTouchFixes() {
    const chartIds = [
      'cryptoDetailPriceChart',
      'tradingViewChartContainer', 
      'stockPriceChartContainer',
      'stockVolumeChartContainer',
      'stockPriceChartWrapper',
      'stockVolumeChartWrapper'
    ];
    
    chartIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) observeChartContainer(el);
    });
    
    // Также все .chart-container и .chart-area-wrapper в модалках
    document.querySelectorAll('.crypto-detail-modal .chart-container, .crypto-detail-modal .chart-area-wrapper').forEach(el => {
      observeChartContainer(el);
    });
  }
  
  // ===================================================
  // 3. PATCH LightweightCharts: отключаем вертикальный touch-drag
  // ===================================================
  // Объект LightweightCharts заморожен (frozen/sealed), Proxy invariant
  // запрещает подмену non-configurable свойств. Поэтому создаём
  // wrapper-объект, копируя все свойства оригинала.
  
  function patchLightweightCharts() {
    if (!window.LightweightCharts) return;
    
    const original = window.LightweightCharts;
    const wrapper = {};
    
    // Копируем все свойства (перечисляемые + неперечисляемые)
    const allKeys = new Set([
      ...Object.keys(original),
      ...Object.getOwnPropertyNames(original)
    ]);
    
    for (const key of allKeys) {
      if (key === 'createChart') continue;
      try {
        wrapper[key] = original[key];
      } catch (e) { /* skip accessors that throw */ }
    }
    
    // Наша обёртка createChart с мобильными опциями
    wrapper.createChart = function(container, options = {}) {
      // Исключение: миниграфик «История портфеля» в welcome-секции дашборда.
      // Он маленький (160px), мобильные overrides ломают его вёрстку.
      if (container && container.id === 'miniChart') {
        return original.createChart(container, options);
      }

      // Убираем явные width/height — autoSize сам возьмёт из CSS
      const { width, height, ...restOptions } = options;
      
      // Критично: autoSize читает clientHeight контейнера.
      // Если контейнер не имеет inline style.height (только CSS height:100%),
      // clientHeight может быть 0 до первого рефлоу браузера → пустой чарт.
      // indicators.js решает это через явный style.height перед createChart.
      // Делаем то же самое для всех контейнеров без inline-высоты.
      if (!container.style.height) {
        const clientH = container.clientHeight;
        // Если clientHeight уже есть — используем его; иначе считаем как 55vh (совпадает с CSS)
        const finalH = clientH > 0 ? clientH : Math.round(0.55 * window.innerHeight);
        // Зажимаем в разумные пределы: не меньше 250px, не больше 520px (max-height в CSS)
        container.style.height = Math.min(Math.max(finalH, 250), 520) + 'px';

      }
      
      const mobileOptions = {
        ...restOptions,
        autoSize: true,
        devicePixelRatio: window.devicePixelRatio || 2, // Высокое качество для retina
        handleScroll: {
          ...restOptions.handleScroll,
          vertTouchDrag: false,
        },
        handleScale: {
          ...restOptions.handleScale,
          axisPressedMouseMove: {
            ...restOptions.handleScale?.axisPressedMouseMove,
            price: false,
          },
        },
        layout: {
          ...restOptions.layout,
          fontSize: 12, // Увеличенный шрифт для мобильных
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          background: { color: 'transparent' }, // Прозрачный фон
          textColor: '#d1d5db', // Синхронизировано с ui.js
        },
        rightPriceScale: {
          ...restOptions.rightPriceScale,
          // Эти параметры ПОСЛЕ spread — всегда побеждают вызывающий код
          scaleMargins: {
            top: 0.08,   // достаточный отступ чтобы верхний лейбл не клипился
            bottom: 0.08,
          },
          minimumWidth: 75, // 75px — хватает для 6-значных цен (94,000 – 140,000)
          borderVisible: false,
          textColor: '#d1d5db',
        },
        timeScale: {
          ...restOptions.timeScale,
          visible: true,  // всегда показываем ось времени на мобильных
          borderVisible: false,
          barSpacing: 8, // Больше пространства между барами
          minBarSpacing: 4,
          textColor: '#d1d5db',
        },
        grid: {
          ...restOptions.grid,
          vertLines: {
            color: 'rgba(180, 180, 190, 0.1)',
          },
          horzLines: {
            color: 'rgba(180, 180, 190, 0.1)',
          },
        },
        crosshair: {
          ...restOptions.crosshair,
          mode: 1, // Normal mode для touch устройств
        },
      };
      
      const chart = original.createChart(container, mobileOptions);
      
      // Перехватываем applyOptions чтобы не дать внешнему коду сломать autoSize.
      // НО: если container реально имеет размеры и передали корректные значения —
      // разрешаем их, иначе autoSize может не вызваться при первом рендере.
      const origApplyOptions = chart.applyOptions.bind(chart);
      chart.applyOptions = function(opts = {}) {
        const { width, height, autoSize, ...safeOpts } = opts;
        // Разрешаем width/height только если они реальные (>100px) и container тоже имеет размеры
        const containerW = container.clientWidth;
        const containerH = container.clientHeight;
        if (width > 100 && height > 100 && containerW > 100 && containerH > 100) {
          return origApplyOptions({ ...safeOpts, width, height });
        }
        return origApplyOptions(safeOpts);
      };
      
      requestAnimationFrame(() => {
        applyTouchFix(container);
        
        // Принудительно обновляем визуальные настройки для мобильных
        if (chart && typeof chart.applyOptions === 'function') {
          try {
            chart.applyOptions({
              layout: {
                fontSize: 12,
                textColor: '#d1d5db',
              },
              rightPriceScale: {
                textColor: '#d1d5db',
                minimumWidth: 75,
              },
              timeScale: {
                textColor: '#d1d5db',
              }
            });
            // Сбрасываем автомасштабирование прайс-шкалычтобы значения не сжимались
            try {
              chart.priceScale('right').applyOptions({ autoScale: true });
            } catch (e) { /* LightweightCharts <= 4.1 not support */ }
          } catch (e) {

          }
        }
      });
      
      return chart;
    };
    
    window.LightweightCharts = wrapper;

  }
  
  // ===================================================
  // 4. ОБНОВЛЕНИЕ СУЩЕСТВУЮЩИХ ГРАФИКОВ
  // ===================================================
  function updateExistingCharts() {
    // Обновляем все активные графики в модальных окнах
    const chartSelectors = [
      '#cryptoDetailPriceChart', 
      '#stockPriceChartContainer',
      '#tradingViewChartContainer'
    ];
    
    chartSelectors.forEach(selector => {
      const container = document.querySelector(selector);
      if (container) {
        // Ищем график через глобальную переменную tvChart
        let chart = window.tvChart;
        
        // Или в контейнере как _lwChart
        if (!chart && container._lwChart) {
          chart = container._lwChart;
        }
        
        if (chart && typeof chart.applyOptions === 'function') {
          try {
            chart.applyOptions({
              layout: {
                fontSize: 12,
                textColor: '#d1d5db',
                background: { color: 'transparent' },
              },
              rightPriceScale: {
                textColor: '#d1d5db',
                minimumWidth: 75,
                borderVisible: false,
              },
              timeScale: {
                textColor: '#d1d5db',
                borderVisible: false,
                barSpacing: 8,
                minBarSpacing: 4,
              },
              grid: {
                vertLines: { color: 'rgba(180, 180, 190, 0.1)' },
                horzLines: { color: 'rgba(180, 180, 190, 0.1)' },
              },
            });
            
            // Принудительно перерисовываем для применения devicePixelRatio
            chart.resize();

          } catch (e) {

          }
        }
      }
    });
  }

  // ===================================================
  // 5. ФОРС-RESIZE ПОСЛЕ ОТКРЫТИЯ МОДАЛКИ КРИПТОВАЛЮТЫ
  // ===================================================
  // LightweightCharts иногда инициализируется до завершения flex-layout.
  // Когда модалка становится видимой — форсируем resize через ResizeObserver-триггер.
  function forceChartResize() {
    const container = document.getElementById('cryptoDetailPriceChart');
    if (!container) return;

    const chart = window.tvChart;
    if (!chart || typeof chart.resize !== 'function') return;

    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w > 50 && h > 50) {
      try {
        chart.resize(w, h);
        chart.timeScale().fitContent();
        // Автомасштабирование прайс-шкалы — устраняет сжатость оси цены
        try { chart.priceScale('right').applyOptions({ autoScale: true }); } catch(e) {}

      } catch (e) {

      }
    }
  }

  function watchModalOpen() {
    const modal = document.getElementById('cryptoDetailModal');
    if (!modal) return;

    // MutationObserver смотрит на class 'active'
    const mo = new MutationObserver(() => {
      if (modal.classList.contains('active')) {
        // Несколько попыток с нарастающей задержкой
        [100, 300, 600].forEach(delay => {
          setTimeout(forceChartResize, delay);
        });
      }
    });
    mo.observe(modal, { attributes: true, attributeFilter: ['class'] });
  }

  // ===================================================
  // 6. ИНИЦИАЛИЗАЦИЯ
  // ===================================================
  function init() {
    patchLightweightCharts();
    initTouchFixes();
    updateExistingCharts(); // Обновляем уже существующие графики
    watchModalOpen();       // Форс-resize при открытии модалки

  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  // Повторяем при resize/orientation change
  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      initTouchFixes();
      updateExistingCharts(); // Обновляем графики после поворота экрана
      forceChartResize();
    }, 500);
  });
  
})();
