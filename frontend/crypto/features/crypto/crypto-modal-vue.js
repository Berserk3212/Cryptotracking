/**
 * Vue.js Application for Crypto Detail Modal
 * Enhanced animations and professional UI
 */

const { createApp } = Vue;

// Initialize Vue app after DOM is loaded
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
        
        // Allow animation to complete
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
        // Get data from window.CRYPTO_INFO if available
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
        
        // Call original function to load chart
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
      // Expose show method globally
      window.showVueCryptoModal = (symbol) => {
        this.show(symbol);
      };
      
      // Listen for close events
      window.addEventListener('closeVueCryptoModal', () => {
        this.hide();
      });
    }
  });
  
  // Mount Vue app to the modal
  const modalElement = document.getElementById('cryptoDetailModal');
  if (modalElement) {
    cryptoModalApp.mount('#cryptoDetailModal');
  }
});

/* Setup dock & resize for crypto and stock detail modals (delegated handlers) */
document.addEventListener('DOMContentLoaded', () => {
  const contentArea = document.querySelector('.content');
  if (!contentArea) {
    console.warn('[dock] No content area found');
    return;
  }

  console.log('[dock] initializing delegated handlers');

  const storeOriginal = (modal) => {
    if (!modal._originalParent) {
      modal._originalParent = modal.parentNode;
      modal._originalNext = modal.nextElementSibling;
    }
  }

  // Delegated click handler for dock buttons
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.modal-dock-btn');
    if (!btn) return;
    
    const modal = btn.closest('.modal');
    if (!modal) return;
    
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
      sectionWrapper.className = 'section active modal-as-section';
      sectionWrapper.id = modal.id + '-section';
      
      // Клонируем и адаптируем контент модалки
      const dockedContainer = document.createElement('div');
      dockedContainer.className = 'docked-container';
      
      // Хэдер с кнопкой возврата
      const header = modal.querySelector('.modal-header');
      const headerClone = header.cloneNode(true);
      dockedContainer.appendChild(headerClone);
      
      // Контент body - ПЕРЕНОСИМ canvas вместо клонирования
      const body = modal.querySelector('.crypto-detail-body');
      const bodyClone = body.cloneNode(true);
      bodyClone.className = 'docked-body';
      
      // Находим оригинальный canvas и переносим его в клон
      const originalCanvas = body.querySelector('canvas');
      const clonedCanvas = bodyClone.querySelector('canvas');
      if (originalCanvas && clonedCanvas) {
        // Заменяем клонированный canvas на оригинальный
        clonedCanvas.parentNode.replaceChild(originalCanvas.cloneNode(false), clonedCanvas);
        // Сохраняем ссылку на оригинал для восстановления
        modal._originalCanvas = originalCanvas;
        modal._originalCanvasParent = originalCanvas.parentNode;
        // Переносим оригинальный canvas в docked версию
        const newCanvasContainer = bodyClone.querySelector('canvas').parentNode;
        newCanvasContainer.replaceChild(originalCanvas, bodyClone.querySelector('canvas'));
      }
      
      dockedContainer.appendChild(bodyClone);
      
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
          // Проверяем наличие контейнеров в docked версии
          const priceContainer = bodyClone.querySelector('#stockPriceChartContainer');
          const volumeContainer = bodyClone.querySelector('#stockVolumeChartContainer');
          
          if (!priceContainer || !volumeContainer) {
            console.error('Контейнеры графиков не найдены в docked версии');
            return;
          }
          
          console.log('Контейнеры найдены, пересоздаём графики...');
          
          // Пересоздаём графики в docked режиме
          if (window.stockPriceChart && window.stockPriceChart.remove) {
            window.stockPriceChart.remove();
            window.stockPriceChart = null;
          }
          if (window.stockVolumeChart && window.stockVolumeChart.remove) {
            window.stockVolumeChart.remove();
            window.stockVolumeChart = null;
          }
          
          // Перезагружаем графики с задержкой для корректного рендера
          if (window.currentStockDetail && window.currentStockDetail.symbol && typeof window.loadStockChart === 'function') {
            const currentPeriod = modal.querySelector('.period-btn.active')?.getAttribute('data-period') || '30';
            console.log(`Загружаем график для ${window.currentStockDetail.symbol}, период: ${currentPeriod}`);
            
            setTimeout(() => {
              window.loadStockChart(window.currentStockDetail.symbol, currentPeriod).catch(err => {
                console.error('Ошибка загрузки графика:', err);
              });
            }, 300);
          } else {
            console.error('loadStockChart не найдена или нет данных акции');
          }
        }
        
        // Для графиков криптовалют (TradingView Lightweight Charts)
        if (modal.id === 'cryptoDetailModal' && window.currentCryptoSymbol) {
          console.log('Recreating crypto chart for docked mode');
          const chartContainer = bodyClone.querySelector('#cryptoDetailPriceChart');
          
          if (chartContainer) {
            // Удаляем старый график полностью
            if (window.tvChart) {
              try {
                window.tvChart.remove();
                console.log('Old chart removed');
              } catch (e) {
                console.warn('Chart removal warning:', e);
              }
              window.tvChart = null;
              window.lineSeries = null;
              window.candlestickSeries = null;
              window.volumeSeries = null;
            }
            
            // Пересоздаем график после небольшой задержки для рендера контейнера
            setTimeout(() => {
              if (window.currentCryptoSymbol && typeof window.loadCryptoDetailCharts === 'function') {
                const currentInterval = modal.querySelector('.period-btn.active')?.getAttribute('data-period') || '1w';
                console.log(`Recreating chart for ${window.currentCryptoSymbol}, interval: ${currentInterval}`);
                window.loadCryptoDetailCharts(window.currentCryptoSymbol, currentInterval).catch(err => {
                  console.error('Error recreating chart:', err);
                });
              }
            }, 200);
          }
        }
      }, 150);
      
      console.log('[dock] docked to content area', modal.id);
      
    } else {
      // === UNDOCK MODE: Возвращаем в модальное окно ===
      btn.classList.remove('active');
      btn.innerHTML = '<i class="bi bi-window"></i>'; // Возвращаем иконку
      btn.title = 'Прикрепить';
      
      modal.classList.remove('docked');
      
      // Возвращаем canvas обратно в модалку
      const sectionWrapper = document.getElementById(modal.id + '-section');
      if (sectionWrapper && modal._originalCanvas && modal._originalCanvasParent) {
        const dockedCanvas = sectionWrapper.querySelector('canvas');
        if (dockedCanvas) {
          modal._originalCanvasParent.appendChild(dockedCanvas);
        }
      }
      
      // Удаляем wrapper-секцию
      if (sectionWrapper) {
        contentArea.removeChild(sectionWrapper);
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
          console.log('Recreating crypto chart for undocked mode');
          
          // Удаляем старый график
          if (window.tvChart) {
            try {
              window.tvChart.remove();
              console.log('Old docked chart removed');
            } catch (e) {
              console.warn('Chart removal warning:', e);
            }
            window.tvChart = null;
            window.lineSeries = null;
            window.candlestickSeries = null;
            window.volumeSeries = null;
          }
          
          // Пересоздаем график в модальном окне
          setTimeout(() => {
            const chartContainer = modal.querySelector('#cryptoDetailPriceChart');
            if (chartContainer && window.currentCryptoSymbol && typeof window.loadCryptoDetailCharts === 'function') {
              const currentInterval = modal.querySelector('.period-btn.active')?.getAttribute('data-period') || '1w';
              console.log(`Recreating chart in modal for ${window.currentCryptoSymbol}, interval: ${currentInterval}`);
              window.loadCryptoDetailCharts(window.currentCryptoSymbol, currentInterval).catch(err => {
                console.error('Error recreating chart in modal:', err);
              });
            }
          }, 350);
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
          if (window.currentStockDetail && window.currentStockDetail.symbol && typeof window.loadStockChart === 'function') {
            const currentPeriod = modal.querySelector('.period-btn.active')?.getAttribute('data-period') || '30';
            console.log(` Возврат в модалку: загружаем график ${window.currentStockDetail.symbol}, период: ${currentPeriod}`);
            
            setTimeout(() => {
              window.loadStockChart(window.currentStockDetail.symbol, currentPeriod).catch(err => {
                console.error('Ошибка загрузки графика при undock:', err);
              });
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
      
      console.log('[dock] undocked from content area', modal.id);
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
      console.log(` Инициализация ${periodButtons.length} кнопок периодов в docked режиме`);
      
      periodButtons.forEach(btn => {
        btn.addEventListener('click', async function(e) {
          e.preventDefault();
          e.stopPropagation();
          
          const days = this.getAttribute('data-period');
          console.log(`Переключение периода: ${days}`);
          
          // Обновляем активную кнопку
          periodButtons.forEach(b => b.classList.remove('active'));
          this.classList.add('active');
          
          if (window.currentStockDetail && window.currentStockDetail.symbol && typeof window.loadStockChart === 'function') {
            try {
              await window.loadStockChart(window.currentStockDetail.symbol, days);
              console.log('График обновлён');
            } catch (err) {
              console.error('Ошибка обновления графика:', err);
            }
          } else {
            console.error('Не удалось переключить период - нет данных');
          }
        });
      });
    }
  }

  // Delegated resize: mousedown / touchstart on .modal-resize-handle
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

console.log('Crypto Modal Vue app loaded');

