// script.js — ВСЁ РАБОТАЕТ
import { initApp, showSection, loadPortfolios, loadTransactions, initAnalytics } from '../ui/ui.js';
import { initData, deletePortfolio, getTransactions, getPricesForSymbols, getTransactionsSync } from './data.js';
import { updateUserUI } from './profile.js';
import { initDashboard as initDashboardWidgets, loadDashboardData } from '../features/dashboard/dashboard.js';

// === ИМПОРТИРУЕМ API ===
import { loadStocks, loadCrypto, loadIndices, loadCryptoList, loadStocksList } from '../api/api.js';

window.app = window.app || {};

Object.assign(window.app, {
  showSection,
  loadPortfolios,
  loadTransactions,
  loadStocks,
  loadCrypto,
  loadIndices,
  loadCryptoList,
  loadStocksList,


  addTransaction: async (symbol) => {
    const modal = document.getElementById('transactionModal');
    if (modal) {
      // Убеждаемся что модальное окно видимо
      modal.style.display = 'flex';
      // Небольшая задержка для применения стилей
      setTimeout(() => {
        modal.classList.add('active');
      }, 10);
      console.log('Transaction modal opened');
      
      if (symbol) document.getElementById('transactionSymbol').value = symbol;
      
      // Правильное локальное время
      const now = new Date();
      const offset = now.getTimezoneOffset() * 60000;
      const localTime = new Date(now - offset);
      document.getElementById('transactionDate').value = localTime.toISOString().slice(0, 16);
      
      // Инициализируем поиск криптовалют/акций
      if (window.initCryptoSearch) {
        setTimeout(() => window.initCryptoSearch(), 100);
      }
    }
  },
  
  showCreatePortfolioModal: () => {
    const modal = document.getElementById('createPortfolioModal');
    if (modal) {
      modal.style.display = 'flex';
      setTimeout(() => {
        modal.classList.add('active');
        console.log('Create portfolio modal opened');
      }, 10);
    }
  },
  showTransactionModal: async (type = 'BUY', portfolioId = null, symbol = null) => {
    const modal = document.getElementById('transactionModal');
    if (!modal) return;
    
    // Убеждаемся что модальное окно видимо
    modal.style.display = 'flex';
    setTimeout(() => {
      modal.classList.add('active');
      console.log('Transaction modal opened');
    }, 10);
    
    document.getElementById('transactionType').value = type;
    if (portfolioId) document.getElementById('transactionPortfolio').value = portfolioId;
    if (symbol) document.getElementById('transactionSymbol').value = symbol;
    
    // Правильное локальное время
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const localTime = new Date(now - offset);
    document.getElementById('transactionDate').value = localTime.toISOString().slice(0, 16);
    
    // Инициализируем поиск криптовалют/акций
    if (window.initCryptoSearch) {
      setTimeout(() => window.initCryptoSearch(), 100);
    }
    
    // Проверяем наличие данных акций и криптовалют
    const hasStocks = window.stocksRealData && Object.keys(window.stocksRealData).length > 0;
    const hasCrypto = window.cryptoList && window.cryptoList.length > 0;
    
    // Загружаем данные, если их еще нет
    if (!hasStocks && window.app?.loadStocks) {
      console.log('Загрузка данных акций для транзакции...');
      window.app.loadStocks().then(() => {
        if (window.renderCryptoDropdown) {
          window.renderCryptoDropdown();
          console.log('Dropdown обновлен с данными акций');
        }
      }).catch(e => console.warn('Ошибка загрузки акций:', e));
    }
    
    if (!hasCrypto && window.app?.loadCrypto) {
      console.log('Загрузка данных криптовалют для транзакции...');
      window.app.loadCrypto().then(() => {
        if (window.renderCryptoDropdown) {
          window.renderCryptoDropdown();
          console.log('Dropdown обновлен с данными криптовалют');
        }
      }).catch(e => console.warn('Ошибка загрузки криптовалют:', e));
    }
    
    // Обновляем dropdown с актуальными данными акций и криптовалют
    if (window.renderCryptoDropdown) {
      setTimeout(() => {
        try {
          window.renderCryptoDropdown();
          console.log('Dropdown updated with current data');
        } catch (e) {
          console.warn('Could not update dropdown:', e);
        }
      }, 150);
    }
  },
  deletePortfolio: async (id) => {
    if (!confirm('Удалить портфель и все транзакции?')) return;
    try {
      await deletePortfolio(id);
      await loadPortfolios();
      await loadTransactions();
    } catch (err) {
      alert('Ошибка: ' + err.message);
    }
  },
  closeModal: (id) => {
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.remove('active');
      // Очищаем текущий символ при закрытии крипто-модалки
      if (id === 'cryptoDetailModal') {
        if (window.currentCryptoSymbol) {
          console.log('Clearing currentCryptoSymbol:', window.currentCryptoSymbol);
          window.currentCryptoSymbol = null;
        }
        // Destroy chart on close
        if (window.tvChart) {
          try {
            window.tvChart.remove();
            console.log('Chart destroyed on modal close');
          } catch (e) {
            console.warn('Chart cleanup warning:', e);
          }
          window.tvChart = null;
        }
      }
      // Даем время на анимацию закрытия
      setTimeout(() => {
        modal.style.display = 'none';
      }, 300);
      console.log(`Modal ${id} closed`);
    }
  },
  backToCryptoList: () => {
    document.getElementById('cryptoListPage').style.display = 'block';
    document.getElementById('cryptoDetailPage').style.display = 'none';
  },
  
  // НОВАЯ ФУНКЦИЯ: Обновление рыночных данных
  refreshMarketData: async () => {
    try {
      // Показываем индикатор загрузки
      const notification = document.createElement('div');
      notification.className = 'notification info';
      notification.innerHTML = `
        <div class="notification-content">
          <i class="fas fa-sync-alt fa-spin"></i>
          <span>Обновление рыночных данных...</span>
        </div>
      `;
      document.body.appendChild(notification);
      
      // Очищаем кэш API
      if (window.cache) {
        window.cache.clear();
      }
      
      // Перезагружаем данные в зависимости от текущей секции
      const currentSection = window.location.hash.slice(1) || 'dashboard';
      
      switch (currentSection) {
        case 'market':
          await loadStocks();
          await loadCrypto();
          await loadIndices();
          break;
        case 'crypto':
          await loadCryptoList();
          break;
                case 'stocks': 
                    setTimeout(() => {
                        if (window.app.loadStocksList) window.app.loadStocksList();
                    }, 100);
                    break;
        case 'dashboard':
          initDashboardWidgets();
          break;
      }
      
      // Убираем уведомление и показываем успех
      setTimeout(() => {
        notification.remove();
        const successNotification = document.createElement('div');
        successNotification.className = 'notification success';
        successNotification.innerHTML = `
          <div class="notification-content">
            <i class="fas fa-check-circle"></i>
            <span>Данные успешно обновлены</span>
          </div>
        `;
        document.body.appendChild(successNotification);
        setTimeout(() => successNotification.remove(), 3000);
      }, 1000);
      
    } catch (error) {
      console.error('Error refreshing market data:', error);
      const errorNotification = document.createElement('div');
      errorNotification.className = 'notification error';
      errorNotification.innerHTML = `
        <div class="notification-content">
          <i class="fas fa-exclamation-circle"></i>
          <span>Ошибка при обновлении данных</span>
        </div>
      `;
      document.body.appendChild(errorNotification);
      setTimeout(() => errorNotification.remove(), 3000);
    }
  },
  
  // Функция для принудительного обновления конкретного раздела
  refreshSection: async (section) => {
    switch (section) {
      case 'stocks':
        await loadStocks();
        break;
      case 'crypto':
        await loadCrypto();
        break;
                case 'stocks': 
                    setTimeout(() => {
                        if (window.app.loadStocksList) window.app.loadStocksList();
                    }, 100);
                    break;
      case 'indices':
        await loadIndices();
        break;
      case 'all':
        await loadStocks();
        await loadCrypto();
        await loadIndices();
        break;
    }
  }
});

async function router() {
  const hash = window.location.hash.slice(1) || 'dashboard';
  console.log('Router navigating to:', hash);
  
  showSection(hash);

  try {
    switch (hash) {
      case 'portfolios': 
        await loadPortfolios(); 
        break;
      case 'transactions': 
        await loadTransactions(); 
        break;
      case 'market':
        // Не загружаем сразу, загрузим только активную вкладку
        setTimeout(() => {
          if (window.app.loadStocks) window.app.loadStocks();
        }, 100);
        break;
      case 'crypto': 
        setTimeout(() => {
          if (window.app.loadCryptoList) window.app.loadCryptoList();
        }, 100);
        break;
                case 'stocks': 
                    setTimeout(() => {
                        if (window.app.loadStocksList) window.app.loadStocksList();
                    }, 100);
                    break;
      case 'dashboard':
        await updateUserUI().catch(err => console.warn('updateUserUI error:', err));
        // Инициализируем дашборд с реальными данными
        await initDashboardWidgets();
        break;
      case 'analytics':
        try {
          console.log('Preparing analytics: prefetching transactions...');
          const t0 = performance.now();
          await getTransactions();
          
          // Также префетчим цены для всех символов
          const txs = getTransactionsSync();
          const symbols = [...new Set(txs.map(t => t.symbol))];
          if (symbols.length > 0) {
            console.log('Prefetching prices for:', symbols);
            try {
              await getPricesForSymbols(symbols);
            } catch (priceErr) {
              console.warn('Price prefetch failed:', priceErr);
            }
          }
          
          const t1 = performance.now();
          console.log(`Prefetch done in ${Math.round(t1 - t0)}ms`);
        } catch (err) {
          console.warn('Prefetch transactions failed:', err);
        }
        await initAnalytics();
        break;
    }
  } catch (error) {
    console.error('Router error:', error);
  }
}

// Автоматическое обновление данных каждые 2 минуты
function startAutoRefresh() {
  setInterval(() => {
    const currentSection = window.location.hash.slice(1);
    if (currentSection === 'market' || currentSection === 'crypto') {
      console.log('Auto-refreshing market data...');
      window.app.refreshSection('all');
    }
  }, 120000); // 2 минуты
}

window.addEventListener('DOMContentLoaded', async () => {
  console.log('App starting...');
  
  try {
    // СРАЗУ показываем приложение (убираем экран загрузки)
    const loadingScreen = document.getElementById('loadingScreen');
    const appContainer = document.getElementById('app');
    
    if (loadingScreen) loadingScreen.style.display = 'none';
    if (appContainer) appContainer.style.display = 'flex';
    console.log('App displayed');
    
    // Инициализируем UI
    console.log('Initializing app...');
    initApp();
    console.log('App initialized');

    // --- Критический фикс: ждём scheduleLoadNews если стартуем сразу с новостей ---
    const hash = window.location.hash.slice(1) || 'dashboard';
    async function waitForScheduleLoadNews(maxAttempts = 50, delay = 100) {
      for (let i = 0; i < maxAttempts; i++) {
        if (typeof window.scheduleLoadNews === 'function') return true;
        await new Promise(res => setTimeout(res, delay));
      }
      return false;
    }
    if (hash === 'news') {
      console.log('[INIT] Стартуем с раздела новости, ждём scheduleLoadNews...');
      const ok = await waitForScheduleLoadNews();
      if (!ok) {
        console.warn('[INIT] scheduleLoadNews так и не определена после ожидания! Новости могут не загрузиться.');
      }
        showSection('news');
        // Явно вызываем загрузку новостей, если функция уже определена
        if (typeof window.scheduleLoadNews === 'function') {
          window.scheduleLoadNews('all', 10, 200, false);
          console.log('scheduleLoadNews вызвана при старте');
        }
        console.log('News section shown (after wait)');
    } else {
      // Показываем дашборд
      console.log('📍 Showing dashboard...');
      showSection('dashboard');
      console.log('Dashboard section shown');
    }

    // Загружаем данные дашборда сразу после отображения
    console.log('Loading dashboard data...');
    await initDashboardWidgets().catch(err => console.warn('Dashboard widgets error:', err));
    console.log('Dashboard data loaded');
    
    // Загружаем данные пользователя в фоне
    console.log('👤 Loading user data...');
    updateUserUI().catch(err => console.warn('User UI error:', err));
    
    // Предзагружаем кэш акций в фоне
    if (window.preloadStockCache) {
      console.log('Preloading stock cache...');
      window.preloadStockCache().catch(err => console.warn('Stock cache error:', err));
    }
    
    // Запускаем авто-обновление
    console.log('Starting auto-refresh...');
    startAutoRefresh();
    
    console.log('App ready!');
  } catch (error) {
    console.error('CRITICAL Error:', error);
    alert('Ошибка запуска приложения. Откройте консоль (F12) для деталей.');
  }
});

window.addEventListener('hashchange', router);

// Глобальная функция для очистки кэша
window.clearApiCache = () => {
  if (window.cache) {
    window.cache.clear();
    console.log('API cache cleared');
  }
};

// === ОБРАБОТЧИК ВЫХОДА ===
document.addEventListener('DOMContentLoaded', function() {
  // Обработчик для кнопки выхода
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function(e) {
      e.preventDefault();
      console.log('Logout button clicked');
      window.app.logout();
    });
    console.log('Logout handler attached');
  } else {
    console.error('Logout button #logoutBtn not found');
  }

  // Обработчик для кнопки профиля
  const profileBtn = document.getElementById('profileBtn');
  if (profileBtn) {
    profileBtn.addEventListener('click', function(e) {
      e.preventDefault();
      console.log('Profile button clicked');
      if (window.app.showProfileModal) {
        window.app.showProfileModal();
      } else {
        console.error('showProfileModal not found in window.app');
      }
    });
    console.log('Profile handler attached');
  }

  // Обработчики для закрытия модалок
  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      const modal = this.closest('.modal');
      if (modal) {
        modal.classList.remove('active');
        // Очищаем текущий символ при закрытии крипто-модалки
        if (modal.id === 'cryptoDetailModal') {
          if (window.currentCryptoSymbol) {
            console.log('Clearing currentCryptoSymbol (close button):', window.currentCryptoSymbol);
            window.currentCryptoSymbol = null;
          }
          // Destroy chart on close
          if (window.tvChart) {
            try {
              window.tvChart.remove();
              console.log('Chart destroyed on modal close (close button)');
            } catch (e) {
              console.warn('Chart cleanup warning:', e);
            }
            window.tvChart = null;
          }
        }
        console.log('Modal closed:', modal.id);
      }
    });
  });

  // Обработчик клика по backdrop модалки (закрытие при клике вне содержимого)
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', function(e) {
      // Закрываем только если клик был по самой модалке, а не по её содержимому
      if (e.target === modal) {
        modal.classList.remove('active');
        // Очищаем текущий символ при закрытии крипто-модалки
        if (modal.id === 'cryptoDetailModal') {
          if (window.currentCryptoSymbol) {
            console.log('Clearing currentCryptoSymbol (backdrop click):', window.currentCryptoSymbol);
            window.currentCryptoSymbol = null;
          }
          // Destroy chart on backdrop close
          if (window.tvChart) {
            try {
              window.tvChart.remove();
              console.log('Chart destroyed on backdrop close');
            } catch (e) {
              console.warn('Chart cleanup warning:', e);
            }
            window.tvChart = null;
          }
        }
        console.log('Modal closed (backdrop):', modal.id);
      }
    });
  });
});

// === ПРОВЕРКА АВТОРИЗАЦИИ ===
async function checkAuth() {
  try {
    const { supabase } = await import('./profile.js');
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      console.log('No session found, redirecting to login...');
      window.location.href = '../login.html';
      return false;
    }
    
    console.log('User authenticated:', session.user.email);
    return true;
  } catch (error) {
    console.error('Auth check error:', error);
    return false;
  }
}

// Добавляем функцию logout в window.app если её нет
if (!window.app.logout) {
  window.app.logout = async function() {
    try {
      console.log('Starting logout process...');
      
      const { supabase } = await import('./profile.js');
      
      // Показываем уведомление о выходе
      const notification = document.createElement('div');
      notification.className = 'notification info';
      notification.innerHTML = `
        <div class="notification-content">
          <i class="fas fa-sign-out-alt"></i>
          <span>Выход из системы...</span>
        </div>
      `;
      document.body.appendChild(notification);
      
      // Выполняем выход
      const { error } = await supabase.auth.signOut();
      
      if (error) throw error;
      
      console.log('Logout successful, redirecting...');
      
      // Обновляем уведомление
      notification.className = 'notification success';
      notification.innerHTML = `
        <div class="notification-content">
          <i class="fas fa-check-circle"></i>
          <span>Выход выполнен успешно</span>
        </div>
      `;
      
      // Редирект после небольшой задержки
      setTimeout(() => {
        window.location.href = '../login.html';
      }, 1000);
      
    } catch (err) {
      console.error('Logout error:', err);
      
      const errorNotification = document.createElement('div');
      errorNotification.className = 'notification error';
      errorNotification.innerHTML = `
        <div class="notification-content">
          <i class="fas fa-exclamation-circle"></i>
          <span>Ошибка выхода: ${err.message}</span>
        </div>
      `;
      document.body.appendChild(errorNotification);
      
      setTimeout(() => errorNotification.remove(), 3000);
    }
  };
}

// Проверяем авторизацию при загрузке
document.addEventListener('DOMContentLoaded', async () => {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    return;
  }
});