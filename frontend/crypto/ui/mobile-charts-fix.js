// Мобильные исправления графиков v3
// touch-handling + body scroll lock; размеры через CSS

(function() {
  'use strict';
  
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || window.innerWidth <= 768;
  
  if (!isMobile) return;
  
  // Body scroll lock при открытии модалок
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
  
  // Touch-action: разрешаем вертикальный скролл поверх графика
  // LightweightCharts перехватывает все touch-события;
  // добавляем pan-y на контейнеры графиков.
  
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
  
  // Патч LightweightCharts: отключаем вертикальный touch-drag
  // Объект заморожен, поэтому создаём wrapper-объект с копией всех свойств.
  
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
      // Исключение: миниграфик дашборда — мобильные overrides ломают его вёрстку.
      if (container && container.id === 'miniChart') {
        return original.createChart(container, options);
      }

      // Убираем явные width/height — autoSize сам возьмёт из CSS
      const { width, height, ...restOptions } = options;
      
      // autoSize читает clientHeight; если его нет до рефлоу — чарт пустой.
      // Задаём inline height заранее (как в indicators.js).
      if (!container.style.height) {
        const clientH = container.clientHeight;
        // Нет clientHeight — берём 55vh; зажимаем в 250–520px
        container.style.height = Math.min(Math.max(finalH, 250), 520) + 'px';

      }
      
      const mobileOptions = {
        ...restOptions,
        autoSize: true,
        devicePixelRatio: window.devicePixelRatio || 2,
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
          fontSize: 12,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          background: { color: 'transparent' },
          textColor: '#d1d5db',
        },
        rightPriceScale: {
          ...restOptions.rightPriceScale,
          // Параметры ПОСЛЕ spread — всегда перекрывают вызывающий код
          scaleMargins: {
            top: 0.08,   // достаточный отступ чтобы верхний лейбл не клипился
            bottom: 0.08,
          },
          minimumWidth: 56,
          borderVisible: false,
          textColor: '#d1d5db',
        },
        timeScale: {
          ...restOptions.timeScale,
          visible: true,
          borderVisible: false,
          barSpacing: 8,
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
          mode: 1,
        },
      };
      
      const chart = original.createChart(container, mobileOptions);
      
      // Перехватываем applyOptions, чтобы не сломать autoSize.
      // Разрешаем width/height только если они реальные и контейнер уже имеет размеры.
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
                minimumWidth: 56,
              },
              timeScale: {
                textColor: '#d1d5db',
              }
            });
            // Сбрасываем автомасштабирование прайс-шкалычтобы значения не сжимались
            try { chart.priceScale('right').applyOptions({ autoScale: true }); } catch (e) { /* не поддерживается в LC <= 4.1 */ }
          } catch (e) {

          }
        }
      });
      
      return chart;
    };
    
    window.LightweightCharts = wrapper;

  }
  
  // Обновление существующих графиков
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
        // Ищем график через tvChart или _lwChart
        let chart = window.tvChart;
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

  // Форс-resize после открытия модалки
  // LC иногда инициализируется до завершения flex-layout.
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
        try { chart.priceScale('right').applyOptions({ autoScale: true }); } catch(e) {}
      } catch (e) {}
    }
  }

  function watchModalOpen() {
    const modal = document.getElementById('cryptoDetailModal');
    if (!modal) return;

    // MutationObserver: следим за class 'active'
    const mo = new MutationObserver(() => {
      if (modal.classList.contains('active')) {
        // Несколько попыток с нарастающей задержкой
        [100, 300, 600, 1000, 1500].forEach(delay => {
          setTimeout(forceChartResize, delay);
        });
      }
    });
    mo.observe(modal, { attributes: true, attributeFilter: ['class'] });
  }

  // Инициализация
  function init() {
    patchLightweightCharts();
    initTouchFixes();
    updateExistingCharts();
    watchModalOpen();

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
      updateExistingCharts();
      forceChartResize();
    }, 500);
  });
  
})();
