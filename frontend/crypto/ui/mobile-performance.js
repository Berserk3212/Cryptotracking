// =============================================
// ОПТИМИЗАЦИЯ ПРОИЗВОДИТЕЛЬНОСТИ ДЛЯ МОБИЛЬНЫХ
// Mobile Performance Optimization Script
// =============================================

(function() {
  'use strict';
  
  // Определяем, является ли устройство мобильным
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isSmallScreen = window.innerWidth <= 768;
  
  if (isMobile || isSmallScreen) {
    // === 1. ПРОИЗВОДИТЕЛЬНОСТЬ: только целевые оптимизации (НЕ убиваем анимации) ===
    const style = document.createElement('style');
    style.id = 'mobile-performance-optimizations';
    style.textContent = `
      @media (max-width: 768px) {
        /* Отключаем smooth scroll — тормозит на мобильных */
        html, * {
          scroll-behavior: auto !important;
        }

        /* Отключаем только тяжёлые декоративные анимации логотипа */
        .logo-icon,
        .logo-icon * {
          animation: none !important;
          transform: none !important;
        }

        /* Ускоряем UI-переходы (150ms вместо 300ms) для отзывчивости */
        .sidebar {
          transition-duration: 0.2s !important;
          will-change: transform;
        }
        .nav-item,
        .sidebar-footer-btn,
        .close-sidebar {
          transition-duration: 0.1s !important;
        }

        /* GPU-слой: backface-visibility без переопределения transform
           (transform у .sidebar управляется show/hide логикой CSS) */
        .sidebar {
          backface-visibility: hidden;
        }
        .modal-overlay-news,
        .modal-container-news {
          -webkit-transform: translateZ(0);
          transform: translateZ(0);
          backface-visibility: hidden;
        }

        /* Упрощаем тени для ускорения рендеринга */
        .news-card,
        .card {
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25) !important;
        }
      }
    `;
    document.head.appendChild(style);
    
    // === 2. DEBOUNCE ДЛЯ RESIZE И SCROLL СОБЫТИЙ ===
    function debounce(func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    }
    
    // === 3. LAZY LOADING ДЛЯ ИЗОБРАЖЕНИЙ ===
    function initLazyLoading() {
      const images = document.querySelectorAll('img[data-src]');
      
      if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const img = entry.target;
              img.src = img.dataset.src;
              img.removeAttribute('data-src');
              observer.unobserve(img);
            }
          });
        }, {
          rootMargin: '50px'
        });
        
        images.forEach(img => imageObserver.observe(img));
      } else {
        // Fallback для старых браузеров
        images.forEach(img => {
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
        });
      }
    }
    
    // === 4. УМЕНЬШЕНИЕ ЧАСТОТЫ ОБНОВЛЕНИЯ ГРАФИКОВ ===
    function optimizeCharts() {
      // Уменьшаем количество точек данных на графиках для мобильных
      window.MOBILE_CHART_OPTIMIZATION = true;
      window.MOBILE_MAX_DATA_POINTS = 50; // Вместо 100+ на десктопе
      
      // Отключаем анимации в Chart.js
      if (window.Chart) {
        Chart.defaults.animation = false;
      }
    }
    
    // === 5. ВИРТУАЛЬНЫЙ СКРОЛЛИНГ ДЛЯ БОЛЬШИХ ТАБЛИЦ ===
    function optimizeTables() {
      const tables = document.querySelectorAll('table');
      
      tables.forEach(table => {
        const tbody = table.querySelector('tbody');
        if (!tbody) return;
        
        const rows = tbody.querySelectorAll('tr');
        
        // Если таблица большая (>50 строк), показываем только видимые
        if (rows.length > 50) {
          let visibleRows = 20; // Показываем первые 20 строк
          
          // Скрываем остальные
          rows.forEach((row, index) => {
            if (index >= visibleRows) {
              row.style.display = 'none';
            }
          });
          
          // Добавляем кнопку "Показать еще"
          const loadMoreBtn = document.createElement('button');
          loadMoreBtn.textContent = 'Показать еще';
          loadMoreBtn.className = 'btn btn-secondary load-more-rows';
          loadMoreBtn.style.cssText = 'width: 100%; margin: 10px 0; padding: 12px;';
          
          loadMoreBtn.addEventListener('click', () => {
            const currentVisible = tbody.querySelectorAll('tr:not([style*="display: none"])').length;
            const nextBatch = Math.min(currentVisible + 20, rows.length);
            
            for (let i = currentVisible; i < nextBatch; i++) {
              rows[i].style.display = '';
            }
            
            if (nextBatch >= rows.length) {
              loadMoreBtn.remove();
            }
          });
          
          table.parentNode.insertBefore(loadMoreBtn, table.nextSibling);
        }
      });
    }
    
    // === 6. ОТКЛЮЧЕНИЕ ТЯЖЕЛЫХ ФОНОВЫХ ЗАДАЧ ===
    function disableHeavyBackgroundTasks() {
      // Увеличиваем интервалы обновления данных
      if (window.UPDATE_INTERVAL) {
        window.UPDATE_INTERVAL = Math.max(window.UPDATE_INTERVAL * 2, 30000); // Минимум 30 секунд
      }
      
      // Отключаем автообновление когда приложение в фоне
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {

          window.PAUSE_UPDATES = true;
        } else {

          window.PAUSE_UPDATES = false;
        }
      });
    }
    
    // === 7. ОПТИМИЗАЦИЯ SPARKLINE ГРАФИКОВ ===
    function optimizeSparklines() {
      // Уменьшаем разрешение sparkline графиков
      window.SPARKLINE_RESOLUTION = 'low';
      window.SPARKLINE_MAX_POINTS = 20; // Вместо 100
    }
    
    // === 8. TOUCH GESTURE OPTIMIZATIONS ===
    function initTouchOptimizations() {
      // Улучшаем отзывчивость touch событий
      let touchStartX = 0;
      let touchStartY = 0;
      
      document.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }, { passive: true });
      
      document.addEventListener('touchmove', (e) => {
        // Предотвращаем горизонтальный скролл на таблицах
        const touchElement = e.target.closest('table');
        if (touchElement) {
          const touchEndX = e.touches[0].clientX;
          const touchEndY = e.touches[0].clientY;
          
          const diffX = Math.abs(touchEndX - touchStartX);
          const diffY = Math.abs(touchEndY - touchStartY);
          
          // Если горизонтальный свайп, разрешаем прокрутку таблицы
          if (diffX > diffY) {
            e.stopPropagation();
          }
        }
      }, { passive: true });
    }
    
    // === 9. УМЕНЬШЕНИЕ КОЛИЧЕСТВА DOM ЭЛЕМЕНТОВ ===
    function simplifyDOM() {
      // На мобильных скрываем декоративные элементы
      const decorativeElements = document.querySelectorAll('.decoration, .ornament, .background-effect');
      decorativeElements.forEach(el => el.style.display = 'none');
    }
    
    // === 10. КЭШИРОВАНИЕ В LOCAL STORAGE ===
    function initMobileCaching() {
      // Увеличиваем время кэширования для мобильных
      if (window.CACHE_DURATION) {
        window.CACHE_DURATION = window.CACHE_DURATION * 2;
      } else {
        window.CACHE_DURATION = 600000; // 10 минут
      }
      

    }
    
    // === 11. ОПТИМИЗАЦИЯ GRIDSTACK (если используется) ===
    function optimizeGridStack() {
      if (window.GridStack) {
        document.addEventListener('DOMContentLoaded', () => {
          const grids = document.querySelectorAll('.grid-stack');
          grids.forEach(grid => {
            const gridInstance = GridStack.init({
              cellHeight: 100,
              animate: false, // Отключаем анимации
              disableResize: true, // Отключаем изменение размера на мобильных
              disableDrag: true, // Отключаем перетаскивание на мобильных
              column: 1, // Одна колонка для мобильных
              float: false
            }, grid);
          });
        });
      }
    }
    
    // === 12. УМЕНЬШЕНИЕ КАЧЕСТВА ИЗОБРАЖЕНИЙ ===
    function optimizeImages() {
      const images = document.querySelectorAll('img');
      images.forEach(img => {
        // Добавляем атрибут loading="lazy" для браузеров, которые поддерживают
        if (!img.hasAttribute('loading')) {
          img.setAttribute('loading', 'lazy');
        }
        
        // Уменьшаем качество изображений
        if (img.src && !img.src.includes('icon') && !img.src.includes('logo')) {
          // Можно добавить параметры для изменения качества, если API поддерживает
          // Например: img.src = img.src + '?quality=70&width=800';
        }
      });
    }
    
    // === 13. ОТСЛЕЖИВАНИЕ ПРОИЗВОДИТЕЛЬНОСТИ ===
    function monitorPerformance() {
      if ('performance' in window) {
        window.addEventListener('load', () => {
          setTimeout(() => {
            const perfData = performance.getEntriesByType('navigation')[0];
            const loadTime = perfData ? perfData.loadEventEnd - perfData.fetchStart : 0;
            

            
            if (loadTime > 5000) {

            }
          }, 0);
        });
      }
    }
    
    // === 14. CONTENT-VISIBILITY ДЛЯ OFF-SCREEN СЕКЦИЙ ===
    function optimizeContentVisibility() {
      // content-visibility: auto позволяет браузеру пропускать рендеринг невидимых секций
      const sections = document.querySelectorAll(
        '#market-section, #crypto-section, #transactions-section, ' +
        '#analytics-section, #favorites-section, #news-section, ' +
        '#trading-tools-section, #dashboard-section, #stocks-section'
      );
      sections.forEach(section => {
        if (!section.classList.contains('active')) {
          section.style.contentVisibility = 'auto';
          section.style.containIntrinsicSize = 'auto 500px';
        }
      });

      // Наблюдаем за переключением секций
      const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
            const el = mutation.target;
            if (el.classList.contains('active')) {
              el.style.contentVisibility = 'visible';
              el.style.containIntrinsicSize = '';
            } else {
              el.style.contentVisibility = 'auto';
              el.style.containIntrinsicSize = 'auto 500px';
            }
          }
        });
      });

      sections.forEach(section => {
        observer.observe(section, { attributes: true, attributeFilter: ['class'] });
      });
    }

    // === ИНИЦИАЛИЗАЦИЯ ===
    function init() {
      optimizeCharts();
      optimizeSparklines();
      disableHeavyBackgroundTasks();
      simplifyDOM();
      initMobileCaching();
      optimizeImages();
      initTouchOptimizations();
      monitorPerformance();
      
      // Инициализируем после загрузки DOM
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          initLazyLoading();
          optimizeTables();
          optimizeGridStack();
          optimizeContentVisibility();
        });
      } else {
        initLazyLoading();
        optimizeTables();
        optimizeGridStack();
        optimizeContentVisibility();
      }
    }
    
    // Запускаем инициализацию
    init();
    
    // Экспортируем флаг для других модулей
    window.IS_MOBILE_OPTIMIZED = true;
    window.IS_MOBILE_DEVICE = true;
  }
  
})();
