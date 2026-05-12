/**
 * Vue.js приложение для модального окна деталей криптовалюты
 */

const { createApp } = Vue;

// Инициализация Vue-приложения после загрузки DOM
document.addEventListener('DOMContentLoaded', function() {
  const cryptoModalApp = createApp({
    data() {
      return {
        isVisible: false,
        isAnimating: false,
        cryptoData: {
          symbol: 'BTC',
          name: 'Bitcoin',
          price: 0,
          change: 0,
          marketCap: 0,
          volume: 0,
          high24h: 0,
          low24h: 0,
          circulation: 0,
          maxSupply: 0,
          fdv: 0,
          rank: 1,
          color: '#f7931a',
          icon: ''
        },
        chartType: 'price',
        compareSymbol: null,
        compareData: null,
        sentimentBullish: 84,
        sentimentBearish: 16
      };
    },
    
    computed: {
      priceChangeClass() {
        return this.cryptoData.change >= 0 ? 'price-positive' : 'price-negative';
      },
      
      formattedPrice() {
        return '$' + this.cryptoData.price.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
      },
      
      formattedChange() {
        const sign = this.cryptoData.change >= 0 ? '+' : '';
        return sign + this.cryptoData.change.toFixed(2) + '%';
      },
      
      formattedMarketCap() {
        return this.formatLargeNumber(this.cryptoData.marketCap);
      },
      
      formattedVolume() {
        return this.formatLargeNumber(this.cryptoData.volume);
      }
    },
    
    methods: {
      show(cryptoSymbol) {
        this.isVisible = true;
        this.isAnimating = true;
        this.loadCryptoData(cryptoSymbol);
        
        // Ждём завершения анимации
        setTimeout(() => {
          this.isAnimating = false;
        }, 400);
      },
      
      hide() {
        this.isAnimating = true;
        setTimeout(() => {
          this.isVisible = false;
          this.isAnimating = false;
          this.compareSymbol = null;
          this.compareData = null;
        }, 300);
      },
      
      loadCryptoData(symbol) {
        // Берём данные из window.CRYPTO_INFO если доступны
        if (window.CRYPTO_INFO && window.CRYPTO_INFO[symbol]) {
          const crypto = window.CRYPTO_INFO[symbol];
          this.cryptoData = {
            symbol: symbol,
            name: crypto.name || symbol,
            price: crypto.price || 0,
            change: crypto.change_24h || 0,
            marketCap: crypto.market_cap || 0,
            volume: crypto.volume_24h || 0,
            high24h: crypto.high_24h || 0,
            low24h: crypto.low_24h || 0,
            circulation: crypto.circulating_supply || 0,
            maxSupply: crypto.max_supply || 0,
            fdv: crypto.fully_diluted_valuation || 0,
            rank: crypto.market_cap_rank || 1,
            color: crypto.color || '#3b82f6',
            icon: crypto.icon || ''
          };
        }
        
        // Вызываем оригинальную функцию для загрузки графика
        if (window.showCryptoDetail) {
          window.showCryptoDetail(symbol);
        }
      },
      
      switchChart(type) {
        this.chartType = type;
        if (window.switchChartType) {
          window.switchChartType(type);
        }
      },
      
      selectCompare(symbol) {
        this.compareSymbol = symbol;
        if (window.selectCompareSymbol) {
          window.selectCompareSymbol(symbol);
        }
      },
      
      removeCompare() {
        this.compareSymbol = null;
        this.compareData = null;
        if (window.removeCompareSymbol) {
          window.removeCompareSymbol();
        }
      },
      
      formatLargeNumber(num) {
        if (!num) return '$0';
        
        if (num >= 1e12) {
          return '$' + (num / 1e12).toFixed(2) + 'T';
        } else if (num >= 1e9) {
          return '$' + (num / 1e9).toFixed(2) + 'B';
        } else if (num >= 1e6) {
          return '$' + (num / 1e6).toFixed(2) + 'M';
        } else if (num >= 1e3) {
          return '$' + (num / 1e3).toFixed(2) + 'K';
        }
        return '$' + num.toFixed(2);
      },
      
      downloadChart(format) {
        if (format === 'jpg') {
          if (window.downloadChartAsJPG) {
            window.downloadChartAsJPG();
          }
        } else if (format === 'png') {
          if (window.downloadChartAsPNG) {
            window.downloadChartAsPNG();
          }
        }
      }
    },
    
    mounted() {
      // Делаем метод show доступным глобально
      window.showVueCryptoModal = (symbol) => this.show(symbol);
      // Подписываемся на событие закрытия
      window.addEventListener('closeVueCryptoModal', () => this.hide());
    }
  });
  
  // Монтируем Vue-приложение к модалке
  const modalElement = document.getElementById('cryptoDetailModal');
  if (modalElement) {
    if (window._cryptoModalVueApp) {
      try { window._cryptoModalVueApp.unmount(); } catch (e) {}
    }
    cryptoModalApp.mount('#cryptoDetailModal');
    window._cryptoModalVueApp = cryptoModalApp;
  }
});

/* Настройка dock/undock для модалок крипто и акций — делегированные обработчики */
document.addEventListener('DOMContentLoaded', () => {
  const contentArea = document.querySelector('.content');
  if (!contentArea) return;

  const storeOriginal = (modal) => {
    if (!modal._originalParent) {
      modal._originalParent = modal.parentNode;
      modal._originalNext = modal.nextElementSibling;
    }
  }

  // Делегированный обработчик клика по кнопкам dock
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.modal-dock-btn');
    if (!btn) return;
    
    const modal = btn.closest('.modal');
    if (!modal) return;

    // Очищаем возможные DOM-артефакты от предыдущих операций
    if (window.cleanupStockChartDom) {
      try { window.cleanupStockChartDom(); } catch (_) {}
    }
    
    const content = modal.querySelector('.modal-content') || modal.querySelector('.modal-container');
    storeOriginal(modal);

    const willDock = !modal.classList.contains('docked');
    
    if (willDock) {
      // === DOCK MODE: Преобразуем модалку в полноценный раздел ===
      btn.classList.add('active');
      btn.innerHTML = '<i class="bi bi-x-square"></i>'; // Меняем иконку на "вернуть"
      btn.title = 'Вернуть в модальное окно';
      
      modal.classList.add('docked');
      
      // Сохраняем текущий активный раздел для возврата
      const currentActiveSection = contentArea.querySelector('.section.active');
      if (currentActiveSection) {
        modal._previousActiveSection = currentActiveSection.id;
      }
      
      // Скрываем все секции
      const allSections = contentArea.querySelectorAll('.section');
      allSections.forEach(s => s.classList.remove('active'));
      
      // Создаем wrapper-секцию с красивым layout
      const sectionWrapper = document.createElement('section');
      sectionWrapper.className = 'section active modal-as-section notranslate';
      sectionWrapper.id = modal.id + '-section';
      sectionWrapper.setAttribute('translate', 'no');
      
      // Клонируем и адаптируем контент модалки
      const dockedContainer = document.createElement('div');
      dockedContainer.className = 'docked-container notranslate';
      dockedContainer.setAttribute('translate', 'no');
      
      // Хэдер с кнопкой возврата
      const header = modal.querySelector('.modal-header');
      const headerClone = header.cloneNode(true);
      headerClone.setAttribute('translate', 'no');
      dockedContainer.appendChild(headerClone);
      
      // Контент body - ПЕРЕНОСИМ canvas/контейнеры вместо чистого клонирования
      const body = modal.querySelector('.crypto-detail-body');
      const bodyClone = body.cloneNode(true);
      bodyClone.className = 'docked-body notranslate';
      bodyClone.setAttribute('translate', 'no');

      // Переносим оригинальные DOM-узлы вместо клонирования — обработчики сохраняются
      const modalOriginalPriceContainer = modal.querySelector('#stockPriceChartContainer');
      const modalOriginalVolumeContainer = modal.querySelector('#stockVolumeChartContainer');
      const modalOriginalPriceTooltip = modal.querySelector('#stockPriceChartTooltip');
      const modalOriginalPriceLoader = modal.querySelector('#stockPriceChartLoader');
      const modalOriginalVolumeLoader = modal.querySelector('#stockVolumeChartLoader');
      const modalOriginalChartLegend = modal.querySelector('#stockChartLegend');

      // Плейсхолдеры в клоне — будут заменены оригиналами
      const pricePlaceholder = bodyClone.querySelector('#stockPriceChartContainer');
      const volumePlaceholder = bodyClone.querySelector('#stockVolumeChartContainer');
      const tooltipPlaceholder = bodyClone.querySelector('#stockPriceChartTooltip');
      const priceLoaderPlaceholder = bodyClone.querySelector('#stockPriceChartLoader');
      const volumeLoaderPlaceholder = bodyClone.querySelector('#stockVolumeChartLoader');
      const legendPlaceholder = bodyClone.querySelector('#stockChartLegend');

      // Заменяем плейсхолдеры на оригинальные узлы, сохраняем ссылки для undock
      if (modalOriginalPriceContainer) {
        modal._originalPriceContainer = modalOriginalPriceContainer;
        modal._originalPriceContainerParent = modalOriginalPriceContainer.parentNode;
        if (pricePlaceholder && pricePlaceholder.parentNode) {
          pricePlaceholder.parentNode.replaceChild(modalOriginalPriceContainer, pricePlaceholder);
          modal._dockedPriceContainer = modalOriginalPriceContainer;
        }
      }

      if (modalOriginalVolumeContainer) {
        modal._originalVolumeContainer = modalOriginalVolumeContainer;
        modal._originalVolumeContainerParent = modalOriginalVolumeContainer.parentNode;
        if (volumePlaceholder && volumePlaceholder.parentNode) {
          volumePlaceholder.parentNode.replaceChild(modalOriginalVolumeContainer, volumePlaceholder);
          modal._dockedVolumeContainer = modalOriginalVolumeContainer;
        }
      }

      // Перемещаем толтип, лоадеры, легенду
      if (modalOriginalPriceTooltip && tooltipPlaceholder && tooltipPlaceholder.parentNode) {
        tooltipPlaceholder.parentNode.replaceChild(modalOriginalPriceTooltip, tooltipPlaceholder);
      }
      if (modalOriginalPriceLoader && priceLoaderPlaceholder && priceLoaderPlaceholder.parentNode) {
        priceLoaderPlaceholder.parentNode.replaceChild(modalOriginalPriceLoader, priceLoaderPlaceholder);
      }
      if (modalOriginalVolumeLoader && volumeLoaderPlaceholder && volumeLoaderPlaceholder.parentNode) {
        volumeLoaderPlaceholder.parentNode.replaceChild(modalOriginalVolumeLoader, volumeLoaderPlaceholder);
      }
      if (modalOriginalChartLegend && legendPlaceholder && legendPlaceholder.parentNode) {
        legendPlaceholder.parentNode.replaceChild(modalOriginalChartLegend, legendPlaceholder);
      }

      // Перемещаем панель инструментов рисования — обработчики должны сохраниться
      const modalOriginalDrawingToolbar = modal.querySelector('#stockDrawingToolbar');
      const toolbarPlaceholder = bodyClone.querySelector('#stockDrawingToolbar');
      if (modalOriginalDrawingToolbar && toolbarPlaceholder && toolbarPlaceholder.parentNode) {
        modal._originalDrawingToolbarParent = modalOriginalDrawingToolbar.parentNode;
        toolbarPlaceholder.parentNode.replaceChild(modalOriginalDrawingToolbar, toolbarPlaceholder);
      }

      // Удаляем возможные застревшие placeholder с суффиксом -docked
      setTimeout(() => {
        const leftoverDocked = document.querySelectorAll('[id$="-docked"]');
        leftoverDocked.forEach(el => {
          if (el.id !== 'stockPriceChartContainer-docked' &&
              el.id !== 'stockVolumeChartContainer-docked' &&
              el.id !== 'stockPriceChartTooltip-docked' &&
              el.id !== 'stockPriceChartLoader-docked' &&
              el.id !== 'stockVolumeChartLoader-docked') {
            if (el.parentNode && !el.parentNode.closest('.modal-as-section')) {
              el.remove();
            }
          }
        });
      }, 100);

      // Переносим оригинальный canvas для Chart.js крипто-графиков
      const originalCanvas = body.querySelector('canvas');
      const clonedCanvas = bodyClone.querySelector('canvas');
      if (originalCanvas && clonedCanvas) {
        modal._originalCanvas = originalCanvas;
        modal._originalCanvasParent = originalCanvas.parentNode;
        clonedCanvas.parentNode.replaceChild(originalCanvas, clonedCanvas);
      }

      // Примечание: контейнеры акций уже перенесены выше (modalOriginal* блок)

      dockedContainer.appendChild(bodyClone);

      // Если это модалка акций — кнопки действий вне .crypto-detail-body, клонируем их тоже
      const actionsFooter = modal.querySelector('.stock-actions-footer');
      if (actionsFooter) {
        const actionsClone = actionsFooter.cloneNode(true);
        actionsClone.setAttribute('translate', 'no');
        actionsClone.classList.add('notranslate');
        dockedContainer.appendChild(actionsClone);
      }
      
      sectionWrapper.appendChild(dockedContainer);
      contentArea.appendChild(sectionWrapper);
      
      // Прячем оригинальную модалку
      modal.style.display = 'none';
      
      // Обновляем заголовок страницы
      const pageTitle = document.getElementById('pageTitle');
      const modalTitle = modal.querySelector('h3');
      if (pageTitle && modalTitle) {
        pageTitle.textContent = modalTitle.textContent;
      }
      
      // Переносим обработчики на кнопки в клонированном хэдере
      setupDockedHeaderHandlers(sectionWrapper, modal, btn);
      
      // Обновляем размер графика после переноса
      setTimeout(() => {
        // Для крипто графиков (Chart.js с canvas)
        const canvas = bodyClone.querySelector('canvas');
        if (canvas && window.cryptoChart) {
          const container = canvas.closest('.chart-wrapper');
          if (container) {
            canvas.style.width = '100%';
            canvas.style.height = '100%';
          }
          
          if (typeof window.cryptoChart.resize === 'function') {
            window.cryptoChart.resize();
          }
          
          if (typeof window.cryptoChart.update === 'function') {
            window.cryptoChart.update('resize');
          }
        }
        
        // Для графиков акций (Lightweight Charts)
        if (modal.id === 'stockDetailModal') {
          // Используем перенесённые оригинальные контейнеры или fallback на placeholders в клоне
          const priceContainer = modal._dockedPriceContainer || bodyClone.querySelector('#stockPriceChartContainer-docked') || bodyClone.querySelector('#stockPriceChartContainer');
          const volumeContainer = modal._dockedVolumeContainer || bodyClone.querySelector('#stockVolumeChartContainer-docked') || bodyClone.querySelector('#stockVolumeChartContainer');

          if (!priceContainer || !volumeContainer) return;

          // Удаляем старые инстансы графиков
          try {
            if (window.stockPriceChart?.remove) { window.stockPriceChart.remove(); window.stockPriceChart = null; }
            if (window.stockVolumeChart?.remove) { window.stockVolumeChart.remove(); window.stockVolumeChart = null; }
          } catch (_) {}

          if (window.currentStockDetail?.symbol && typeof window.loadStockChart === 'function') {
            const currentPeriod = modal.querySelector('.period-btn.active')?.getAttribute('data-period') || '30';
            setTimeout(() => {
              window.loadStockChart(window.currentStockDetail.symbol, currentPeriod, priceContainer, volumeContainer).catch(() => {});
            }, 300);
          }
        }
        
        // Для графиков криптовалют (TradingView Lightweight Charts)
        if (modal.id === 'cryptoDetailModal' && window.currentCryptoSymbol) {
          // Перемещаем оригинальный #chartAreaWrapper в docked-клон, чтобы document.getElementById
          // находил видимый элемент (не скрытую копию модалки) после modal.style.display='none'.
          // #cryptoDrawingToolbar и #cryptoDetailPriceChart находятся внутри #chartAreaWrapper
          // и перемещаются вместе с ним.
          const originalChartWrapper = modal.querySelector('#chartAreaWrapper');
          const cloneChartWrapper = bodyClone.querySelector('#chartAreaWrapper');
          if (originalChartWrapper && cloneChartWrapper && cloneChartWrapper.parentNode) {
            modal._originalChartWrapper = originalChartWrapper;
            modal._originalChartWrapperParent = originalChartWrapper.parentNode;
            cloneChartWrapper.parentNode.replaceChild(originalChartWrapper, cloneChartWrapper);
          }

          // Удаляем старый инстанс графика
          if (window.tvChart) {
            try { window.tvChart.remove(); } catch (_) {}
            window.tvChart = null;
            window.lineSeries = null;
            window.candlestickSeries = null;
            window.volumeSeries = null;
          }
          
          setTimeout(() => {
            if (window.currentCryptoSymbol && typeof window.loadCryptoDetailCharts === 'function') {
              const currentInterval = modal.querySelector('.period-btn.active')?.getAttribute('data-period') || '1w';
              window.loadCryptoDetailCharts(window.currentCryptoSymbol, currentInterval).catch(() => {});
            }
          }, 200);
        }
      }, 150);
      
    } else {
      // === UNDOCK MODE: Возвращаем в модальное окно ===
      btn.classList.remove('active');
      btn.innerHTML = '<i class="bi bi-window"></i>'; // Возвращаем иконку
      btn.title = 'Прикрепить';
      
      modal.classList.remove('docked');

      // Очищаем застревшие placeholders перед восстановлением DOM модалки
      if (window.cleanupStockChartDom) {
        try { window.cleanupStockChartDom(); } catch (_) {}
      }
      
      // Возвращаем canvas обратно в модалку
      const sectionWrapper = document.getElementById(modal.id + '-section');

      // Удаляем старые инстансы графиков перед undock
      try {
        if (window.stockPriceChart?.remove) { window.stockPriceChart.remove(); window.stockPriceChart = null; }
        if (window.stockVolumeChart?.remove) { window.stockVolumeChart.remove(); window.stockVolumeChart = null; }
      } catch (_) {}

      if (sectionWrapper && modal._originalCanvas && modal._originalCanvasParent) {
        const dockedCanvas = sectionWrapper.querySelector('canvas');
        if (dockedCanvas) {
          modal._originalCanvasParent.appendChild(dockedCanvas);
        }
      }

      // Возвращаем stock containers обратно в модалку (если мы перемещали их)
      try {
        if (sectionWrapper && modal._originalPriceContainerParent) {
          const dockedPrice = sectionWrapper.querySelector('#stockPriceChartContainer') || sectionWrapper.querySelector('#stockPriceChartContainer-docked');
          if (dockedPrice) modal._originalPriceContainerParent.appendChild(dockedPrice);
        }
      } catch (_) {}

      try {
        if (sectionWrapper && modal._originalVolumeContainerParent) {
          const dockedVolume = sectionWrapper.querySelector('#stockVolumeChartContainer') || sectionWrapper.querySelector('#stockVolumeChartContainer-docked');
          if (dockedVolume) modal._originalVolumeContainerParent.appendChild(dockedVolume);
        }
      } catch (_) {}

      try {
        if (sectionWrapper && modal._originalDrawingToolbarParent) {
          const dockedToolbar = sectionWrapper.querySelector('#stockDrawingToolbar');
          if (dockedToolbar) modal._originalDrawingToolbarParent.appendChild(dockedToolbar);
          delete modal._originalDrawingToolbarParent;
        }
      } catch (_) {}

      // Удаляем возможные оставшиеся клонированные placeholder'ы с суффиксом -docked
      try {
        const leftoverPrice = document.getElementById('stockPriceChartContainer-docked');
        if (leftoverPrice && leftoverPrice.parentNode) leftoverPrice.parentNode.removeChild(leftoverPrice);
        const leftoverVolume = document.getElementById('stockVolumeChartContainer-docked');
        if (leftoverVolume && leftoverVolume.parentNode) leftoverVolume.parentNode.removeChild(leftoverVolume);
      } catch (e) { /* ignore */ }
      
      // Удаляем wrapper-секцию
      if (sectionWrapper) {
        contentArea.removeChild(sectionWrapper);
      }
      
      // Убираем временные ссылки на docked-контейнеры, если были
      try {
        delete modal._dockedPriceContainer;
        delete modal._dockedVolumeContainer;
      } catch (e) { /* ignore */ }
      
      // Возвращаем #chartAreaWrapper в оригинальную позицию перед показом модалки
      if (modal.id === 'cryptoDetailModal') {
        try {
          if (modal._originalChartWrapper && modal._originalChartWrapperParent) {
            modal._originalChartWrapperParent.appendChild(modal._originalChartWrapper);
            delete modal._originalChartWrapper;
            delete modal._originalChartWrapperParent;
          }
        } catch (_) {}
      }

      // Показываем модалку обратно
      modal.style.display = '';
      
      // Обновляем размер графика после возврата
      setTimeout(() => {
        // Для крипто графиков
        if (window.cryptoChart && typeof window.cryptoChart.resize === 'function') {
          window.cryptoChart.resize();
        }
        
        // Для TradingView Lightweight Charts (криптовалюты)
        if (modal.id === 'cryptoDetailModal' && window.currentCryptoSymbol) {
          // Удаляем старый график
          if (window.tvChart) {
            try { window.tvChart.remove(); } catch (_) {}
            window.tvChart = null;
            window.lineSeries = null;
            window.candlestickSeries = null;
            window.volumeSeries = null;
          }
          
          // Пересоздаём график в модальном окне — ждём пока контейнер получит реальные размеры
          (function waitAndRecreate() {
            const chartContainer = modal.querySelector('#cryptoDetailPriceChart');
            if (!chartContainer || !window.currentCryptoSymbol || typeof window.loadCryptoDetailCharts !== 'function') return;

            let attempts = 0;
            const maxAttempts = 30; // до 3 секунд (30 × 100ms)
            let fired = false; // флаг: загрузка уже запущена, больше не запускать

            function tryCreate() {
              if (fired) return; // предотвращаем двойной запуск
              attempts++;
              // Убеждаемся что модалка видима и контейнер имеет размеры
              const modalVisible = modal.offsetParent !== null || window.getComputedStyle(modal).display !== 'none';
              const hasSize = chartContainer.clientWidth > 0 && chartContainer.clientHeight > 0;

              if (modalVisible && hasSize) {
                fired = true;
                const currentInterval = modal.querySelector('.period-btn.active')?.getAttribute('data-period') || '1w';
                window.loadCryptoDetailCharts(window.currentCryptoSymbol, currentInterval).catch(() => {});
                return;
              }

              if (attempts < maxAttempts) {
                setTimeout(() => requestAnimationFrame(tryCreate), 100);
              } else {
                fired = true;
                // Контейнер так и не получил размеры — загружаем всё равно
                const currentInterval = modal.querySelector('.period-btn.active')?.getAttribute('data-period') || '1w';
                window.loadCryptoDetailCharts(window.currentCryptoSymbol, currentInterval).catch(() => {});
              }
            }

            // Первый RAF даёт браузеру время применить display:block от modal.style.display = ''
            requestAnimationFrame(() => requestAnimationFrame(tryCreate));
          })();
        }
        
        // Для графиков акций - ПЕРЕЗАГРУЖАЕМ
        if (modal.id === 'stockDetailModal') {
          // Очищаем старые графики
          if (window.stockPriceChart && window.stockPriceChart.remove) {
            window.stockPriceChart.remove();
            window.stockPriceChart = null;
          }
          if (window.stockVolumeChart && window.stockVolumeChart.remove) {
            window.stockVolumeChart.remove();
            window.stockVolumeChart = null;
          }
          
          // Перезагружаем с текущим периодом
          if (window.currentStockDetail?.symbol && typeof window.loadStockChart === 'function') {
            const currentPeriod = modal.querySelector('.period-btn.active')?.getAttribute('data-period') || '30';
            setTimeout(() => {
              const priceContainer = modal.querySelector('#stockPriceChartContainer') || document.getElementById('stockPriceChartContainer');
              const volumeContainer = modal.querySelector('#stockVolumeChartContainer') || document.getElementById('stockVolumeChartContainer');
              window.loadStockChart(window.currentStockDetail.symbol, currentPeriod, priceContainer, volumeContainer).catch(() => {});
            }, 200);
          }
        }
      }, 100);
      
      // Восстанавливаем предыдущий активный раздел
      const previousSectionId = modal._previousActiveSection;
      if (previousSectionId) {
        const previousSection = document.getElementById(previousSectionId);
        if (previousSection) {
          previousSection.classList.add('active');
          const pageTitle = document.getElementById('pageTitle');
          if (pageTitle) {
            // Определяем название раздела
            if (previousSectionId === 'dashboardSection') {
              pageTitle.textContent = 'Дашборд';
            } else if (previousSectionId === 'cryptoSection') {
              pageTitle.textContent = 'Криптовалюты';
            } else if (previousSectionId === 'stocksSection') {
              pageTitle.textContent = 'Акции';
            }
          }
        }
      }
      
    }
  });

  const setupDockedHeaderHandlers = (wrapper, originalModal, dockBtn) => {
    const closeBtn = wrapper.querySelector('.modal-close-news');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        // Симулируем клик на dock button для возврата (это восстановит предыдущий раздел)
        dockBtn.click();
        // Затем закрываем модалку
        setTimeout(() => {
          originalModal.classList.remove('active');
          originalModal.style.display = 'none';
        }, 50);
      });
    }
    
    // Обработчик кнопки dock в клонированном хэдере
    const dockedDockBtn = wrapper.querySelector('.modal-dock-btn');
    if (dockedDockBtn) {
      dockedDockBtn.addEventListener('click', () => {
        dockBtn.click(); // Кликаем на оригинальную кнопку
      });
    }
    
    // Обработчики кнопок периодов для акций в docked режиме
    if (originalModal.id === 'stockDetailModal') {
      const periodButtons = wrapper.querySelectorAll('.period-btn');

      periodButtons.forEach(btn => {
        btn.addEventListener('click', async function(e) {
          e.preventDefault();
          e.stopPropagation();

          const days = this.getAttribute('data-period');

          // Обновляем активную кнопку
          periodButtons.forEach(b => b.classList.remove('active'));
          this.classList.add('active');
          
          if (window.currentStockDetail && window.currentStockDetail.symbol && typeof window.loadStockChart === 'function') {
            try {
              // Ищем price container внутри docked wrapper (который может иметь суффикс -docked)
              const priceContainer = wrapper.querySelector('#stockPriceChartContainer-docked') || wrapper.querySelector('#stockPriceChartContainer') || wrapper.querySelector('[id*="stockPriceChartContainer"]');
              const volumeContainer = wrapper.querySelector('#stockVolumeChartContainer-docked') || wrapper.querySelector('#stockVolumeChartContainer') || wrapper.querySelector('[id*="stockVolumeChartContainer"]');
              await window.loadStockChart(window.currentStockDetail.symbol, days, priceContainer, volumeContainer);
            } catch (_) {}
          }
        });
      });
    }
  }

  // Делегированное изменение размера: mousedown / touchstart на .modal-resize-handle
  let isResizing = false;
  let curModal = null;
  let curContent = null;
  let startX = 0, startY = 0, startW = 0, startH = 0;
  const minW = 360, minH = 240;

  const beginResize = (clientX, clientY, handleElem) => {
    curModal = handleElem.closest('.modal');
    if (!curModal) return;
    curContent = curModal.querySelector('.modal-content') || curModal.querySelector('.modal-container');
    if (!curContent) return;
    const rect = curContent.getBoundingClientRect();
    startX = clientX; startY = clientY; startW = rect.width; startH = rect.height;
    isResizing = true;
    document.body.style.userSelect = 'none';
  }

  const onMove = (clientX, clientY) => {
    if (!isResizing || !curContent || !curModal) return;
    const dx = clientX - startX;
    const dy = clientY - startY;
    let newW = Math.max(minW, startW + dx);
    let newH = Math.max(minH, startH + dy);

    if (!curModal.classList.contains('docked')) {
      // Обычное модальное окно - ограничиваем размером экрана
      newW = Math.min(newW, window.innerWidth * 0.95);
      newH = Math.min(newH, window.innerHeight * 0.95);
    } else {
      // Закрепленное в контенте - ограничиваем размером контентной области
      const contentArea = document.querySelector('.content');
      if (contentArea) {
        newW = Math.min(newW, contentArea.clientWidth - 40);
      }
    }

    curContent.style.width = newW + 'px';
    curContent.style.height = newH + 'px';
  }

  const endResize = () => {
    if (!isResizing) return;
    isResizing = false; curModal = null; curContent = null;
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', mouseMoveHandler);
    document.removeEventListener('mouseup', mouseUpHandler);
    document.removeEventListener('touchmove', touchMoveHandler);
    document.removeEventListener('touchend', touchEndHandler);
  }

  const mouseMoveHandler = (e) => { onMove(e.clientX, e.clientY); }
  const mouseUpHandler = () => { endResize(); }
  const touchMoveHandler = (e) => { if (e.touches && e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY); }
  const touchEndHandler = () => { endResize(); }

  document.addEventListener('mousedown', (e) => {
    const handle = e.target.closest('.modal-resize-handle');
    if (!handle) return;
    beginResize(e.clientX, e.clientY, handle);
    document.addEventListener('mousemove', mouseMoveHandler);
    document.addEventListener('mouseup', mouseUpHandler);
    e.preventDefault();
  });

  document.addEventListener('touchstart', (e) => {
    if (!e.touches || !e.touches[0]) return;
    const touch = e.touches[0];
    const elem = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!elem) return;
    const handle = elem.closest('.modal-resize-handle');
    if (!handle) return;
    beginResize(touch.clientX, touch.clientY, handle);
    document.addEventListener('touchmove', touchMoveHandler, {passive:false});
    document.addEventListener('touchend', touchEndHandler);
    e.preventDefault();
  });

});



