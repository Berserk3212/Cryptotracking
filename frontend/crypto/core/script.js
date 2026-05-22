import { initApp, showSection, loadPortfolios, loadTransactions, initAnalytics } from '../ui/ui.js';
import { initData, deletePortfolio, deleteTransaction as deleteTransactionFromDB, getTransactions, getPricesForSymbols, getTransactionsSync } from './data.js';
import { updateUserUI } from './profile.js';
import { initDashboard as initDashboardWidgets, loadDashboardData } from '../features/dashboard/dashboard.js';
import { loadAppSettings, getSetting } from './settings-service.js';

// === ИМПОРТИРУЕМ API ===
import { loadStocks, loadCrypto, loadIndices, loadCryptoList, loadStocksList, loadCryptoForDropdown } from '../api/api.js';

window.app = window.app || {};

Object.assign(window.app, {
  showSection,
  loadPortfolios,
  loadTransactions,
  loadStocks,              // Рынок → Акции
  loadCrypto,              // Рынок → Криптовалюты (marketCryptoGrid)
  loadCryptoList,          // Криптовалюты (mainCryptoGrid)
  loadCryptoForDropdown,   // Для дропдауна в модалах (без DOM)
  loadIndices,             // Рынок → Индексы
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

    // Запускаем загрузку в фоне если данных ещё нет; после загрузки перерисовываем дропдаун если он открыт
    const refreshDropdownIfOpen = () => {
      const dd = document.getElementById('cryptoDropdown');
      if (dd && dd.classList.contains('active') && window.renderCryptoDropdown) {
        const inp = document.getElementById('cryptoSearchInput');
        window.renderCryptoDropdown(inp?.value?.toLowerCase().trim() || '');
      }
    };

    if (!hasStocks) {
      loadStocks().then(refreshDropdownIfOpen).catch(() => {});
    }
    if (!hasCrypto) {
      // loadCryptoForDropdown не требует DOM-элементов, в отличие от loadCrypto/loadCryptoList
      loadCryptoForDropdown().then(refreshDropdownIfOpen).catch(() => {});
    }
  },
  deletePortfolio: async (id) => {
    const doDelete = async () => {
      try {
        await deletePortfolio(id);
        await loadPortfolios();
        await loadTransactions();
      } catch (err) {
        alert('Ошибка: ' + err.message);
      }
    };
    if (window.showConfirmModal) {
      window.showConfirmModal(
        'Удалить портфель?',
        'Все транзакции этого портфеля будут безвозвратно удалены. Это действие нельзя отменить.',
        doDelete
      );
    } else {
      if (confirm('Удалить портфель и все транзакции?')) doDelete();
    }
  },
  deleteTransaction: async (id) => {
    return deleteTransactionFromDB(id);
  },
  closeModal: (id) => {
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.remove('active');
      // Очищаем текущий символ при закрытии крипто-модалки
      if (id === 'cryptoDetailModal') {
        if (window.currentCryptoSymbol) {

          window.currentCryptoSymbol = null;
        }
        // Уничтожаем график при закрытии
        if (window.tvChart) {
          try {
            window.tvChart.remove();

          } catch (e) {

          }
          window.tvChart = null;
        }
      }
      // Даем время на анимацию закрытия
      setTimeout(() => {
        modal.style.display = 'none';
      }, 300);

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
        // Секция "Криптовалюты" использует loadCryptoList (рендерит в mainCryptoGrid)
        setTimeout(() => {
          if (window.app.loadCryptoList) {

            window.app.loadCryptoList();
          }
        }, 100);
        break;
                case 'stocks': 
                    setTimeout(() => {
                        if (window.app.loadStocksList) window.app.loadStocksList();
                    }, 100);
                    break;
      case 'dashboard':
        await updateUserUI().catch(() => {});
        // Инициализируем дашборд с реальными данными
        await initDashboardWidgets();
        break;
      case 'analytics':
        try {

          const t0 = performance.now();
          await getTransactions();
          
          // Также префетчим цены для всех символов
          const txs = getTransactionsSync();
          const symbols = [...new Set(txs.map(t => t.symbol))];
          if (symbols.length > 0) {

            try {
              await getPricesForSymbols(symbols);
            } catch (priceErr) {

            }
          }
          
          const t1 = performance.now();

        } catch (err) {

        }
        await initAnalytics();
        break;
    }
  } catch (error) {

  }
}

// Автоматическое обновление данных (интервал из системных настроек, дефолт 2 мин)
function startAutoRefresh() {
  const intervalMs = (getSetting('data_refresh_interval', 120)) * 1000;
  setInterval(() => {
    const currentSection = window.location.hash.slice(1);
    if (currentSection === 'market' || currentSection === 'crypto') {

      window.app.refreshSection('all');
    }
  }, intervalMs); // из system_settings.data_refresh_interval
}

window.addEventListener('DOMContentLoaded', async () => {

  
  try {
    // СРАЗУ показываем приложение (убираем экран загрузки)
    const loadingScreen = document.getElementById('loadingScreen');
    const appContainer = document.getElementById('app');
    
    if (loadingScreen) loadingScreen.style.display = 'none';
    if (appContainer) appContainer.style.display = 'flex';

    // Загружаем системные настройки из Supabase
    await loadAppSettings();

    // Режим обслуживания — показываем заглушку (администраторы проходят дальше)
    if (getSetting('maintenance_mode', false)) {
      const { supabase } = await import('./profile.js');
      const { data: { session } } = await supabase.auth.getSession();
      const isAdmin = session?.user?.user_metadata?.role === 'admin'
        || session?.user?.email?.endsWith('@admin.cryptotrack.app');
      if (!isAdmin) {
        if (appContainer) appContainer.style.display = 'none';
        const overlay = document.createElement('div');
        overlay.id = 'maintenanceOverlay';
        overlay.style.cssText = [
          'position:fixed', 'inset:0', 'z-index:99999',
          'display:flex', 'flex-direction:column',
          'align-items:center', 'justify-content:center',
          'background:#0f1117', 'color:#e2e8f0',
          'font-family:inherit', 'text-align:center', 'padding:2rem'
        ].join(';');
        overlay.innerHTML = `
          <div style="font-size:3rem;margin-bottom:1rem">🛠️</div>
          <h2 style="font-size:1.5rem;font-weight:700;margin-bottom:.75rem">Техническое обслуживание</h2>
          <p style="max-width:480px;opacity:.7;line-height:1.6">
            ${getSetting('maintenance_message', 'Сервис временно недоступен. Пожалуйста, попробуйте позже.')}
          </p>`;
        document.body.appendChild(overlay);

        return; // Останавливаем инициализацию
      }

    }

    // Инициализируем UI

    initApp();

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

      const ok = await waitForScheduleLoadNews();
      if (!ok) {

      }
        showSection('news');
        // Явно вызываем загрузку новостей, если функция уже определена
        if (typeof window.scheduleLoadNews === 'function') {
          window.scheduleLoadNews('all', 10, 200, false);

        }

    } else {
      // Показываем секцию по текущему hash (или дашборд по умолчанию)

      await router();

    }

    // Загружаем данные дашборда сразу после отображения

    await initDashboardWidgets().catch(() => {});

    // Загружаем данные пользователя в фоне (только для авторизованных)
    if (!window.isGuestMode) {
      updateUserUI().catch(() => {});
    }
    
    // Предзагружаем кэш акций в фоне
    if (window.preloadStockCache) {
      window.preloadStockCache().catch(() => {});
    }
    
    // Запускаем авто-обновление

    startAutoRefresh();

    // Фоновая предзагрузка данных для дропдауна транзакций.
    // Запускаем через 4с, чтобы не конкурировать с основной загрузкой дашборда.
    setTimeout(() => {
      if (!window.cryptoList || window.cryptoList.length === 0) {
        loadCryptoForDropdown().catch(() => {});
      }
      if (!window.stocksRealData || Object.keys(window.stocksRealData).length === 0) {
        loadStocks().catch(() => {});
      }
    }, 4000);

  } catch (error) {

    alert('Ошибка запуска приложения. Откройте консоль (F12) для деталей.');
  }
});

window.addEventListener('hashchange', router);

// Глобальная функция для очистки кэша
window.clearApiCache = () => {
  if (window.cache) {
    window.cache.clear();

  }
};

// === ОБРАБОТЧИК ВЫХОДА ===
document.addEventListener('DOMContentLoaded', function() {
  // Обработчик для кнопки «Добавить транзакцию» в разделе Транзакций
  const addTransactionBtn = document.getElementById('addTransactionBtn');
  if (addTransactionBtn) {
    addTransactionBtn.addEventListener('click', function(e) {
      e.preventDefault();
      if (window.app && window.app.showTransactionModal) {
        window.app.showTransactionModal('BUY');
      }
    });

  }

  // Обработчик для кнопки выхода
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function(e) {
      e.preventDefault();

      window.app.logout();
    });

  } else {

  }

  // Обработчик для кнопки профиля
  const profileBtn = document.getElementById('profileBtn');
  if (profileBtn) {
    profileBtn.addEventListener('click', function(e) {
      e.preventDefault();

      if (window.app.showProfileModal) {
        window.app.showProfileModal();
      } else {

      }
    });

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

            window.currentCryptoSymbol = null;
          }
          // Уничтожаем график при закрытии
          if (window.tvChart) {
            try {
              window.tvChart.remove();

            } catch (e) {

            }
            window.tvChart = null;
          }
        }

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

            window.currentCryptoSymbol = null;
          }
          // Уничтожаем график при закрытии через backdrop
          if (window.tvChart) {
            try {
              window.tvChart.remove();

            } catch (e) {

            }
            window.tvChart = null;
          }
        }

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
      // Проверяем гостевой режим
      const isGuest = localStorage.getItem('guestMode') === 'true';
      if (isGuest) {
        // Проверяем, разрешён ли гостевой доступ системными настройками
        if (!getSetting('guest_mode_enabled', true)) {

          localStorage.removeItem('guestMode');
          window.location.href = '../login.html';
          return false;
        }

        window.isGuestMode = true;
        applyGuestRestrictions();
        return true; // Разрешаем доступ
      }
      

      window.location.href = '../login.html';
      return false;
    }
    
    // Авторизованный пользователь — убираем гостевой флаг
    localStorage.removeItem('guestMode');
    window.isGuestMode = false;

    return true;
  } catch (error) {

    // При ошибке — проверяем гостевой режим
    if (localStorage.getItem('guestMode') === 'true') {
      window.isGuestMode = true;
      applyGuestRestrictions();
      return true;
    }
    return false;
  }
}

// Применение ограничений гостевого режима
function applyGuestRestrictions() {
  // Ждём загрузки DOM
  const apply = () => {
    // Показываем баннер гостя
    const guestBanner = document.createElement('div');
    guestBanner.id = 'guestBanner';
    guestBanner.className = 'guest-top-banner';
    guestBanner.innerHTML = `
      <div class="guest-banner-content">
        <i class="fas fa-eye"></i>
        <span>Вы в гостевом режиме — доступен только просмотр</span>
        <a href="../login.html" class="guest-login-link">
          <i class="fas fa-sign-in-alt"></i> Войти
        </a>
        <a href="../register.html" class="guest-register-link">
          <i class="fas fa-user-plus"></i> Регистрация
        </a>
      </div>
    `;
    
    const topBar = document.querySelector('.top-bar');
    if (topBar) {
      topBar.parentNode.insertBefore(guestBanner, topBar.nextSibling);
    }

    // Скрываем элементы, требующие авторизации
    const restrictedSelectors = [
      '#createPortfolioBtn',      // Создание портфеля
      '#addTransactionBtn',       // Добавление транзакции
      '.sidebar-footer',          // Кнопка выхода в сайдбаре
      '#logoutBtn',               // Кнопка выхода
    ];
    
    restrictedSelectors.forEach(sel => {
      const el = document.querySelector(sel);
      if (el) el.style.display = 'none';
    });

    // Блокируем кнопки транзакций/покупок в модалках
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="buy"], [data-action="sell"], .btn-buy, .btn-sell, .btn-trade');
      if (btn && window.isGuestMode) {
        e.preventDefault();
        e.stopPropagation();
        showGuestAlert();
      }
    }, true);

    // Обновляем ник пользователя в сайдбаре
    const userNameEl = document.querySelector('.sidebar-header .user-name, #userName');
    if (userNameEl) userNameEl.textContent = 'Гость';
    
    const userEmailEl = document.querySelector('.sidebar-header .user-email, #userEmail');
    if (userEmailEl) userEmailEl.textContent = 'Гостевой режим';
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    // DOM уже загружен — применяем с небольшой задержкой чтобы UI отрисовался
    setTimeout(apply, 300);
  }
}

// Всплывающее уведомление для гостя
function showGuestAlert() {
  // Используем существующую систему уведомлений или создаём свой toast
  if (typeof window.showNotification === 'function') {
    window.showNotification('Для этого действия необходима авторизация', 'warning');
    return;
  }
  
  // Запасной toast
  const existing = document.getElementById('guestToast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.id = 'guestToast';
  toast.className = 'guest-toast';
  toast.innerHTML = `
    <i class="fas fa-lock"></i>
    <span>Войдите в аккаунт для этого действия</span>
    <a href="../login.html" class="guest-toast-link">Войти</a>
  `;
  document.body.appendChild(toast);
  
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Добавляем функцию logout в window.app если её нет
if (!window.app.logout) {
  window.app.logout = async function() {
    try {

      
      const { supabase } = await import('./profile.js');
      
      // Логируем выход перед signOut (после — сессия уже не активна)
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await supabase.from('activity_logs').insert({
            user_id:    session.user.id,
            user_email: session.user.email,
            action:     'logout',
            section:    'auth',
            details:    {},
          });
        }
      } catch { /* не прерываем выход */ }

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