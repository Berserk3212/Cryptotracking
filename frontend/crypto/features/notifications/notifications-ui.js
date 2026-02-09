import { 
  getNotifications, 
  markAsRead, 
  markAllAsRead,
  clearAllNotifications,
  deleteNotification,
  createPriceAlert,
  updatePriceAlert,
  deletePriceAlert,
  getPriceAlerts,
  updateNotificationPreferences,
  notificationsState
} from './notifications.js';

const uiState = {
  currentTab: 'notifications',
  currentFilter: 'all',
  isAlertFormOpen: false
};

export function initNotificationsUI() {
  setupTabSwitching();
  setupFilters();
  setupAlertForm();
  setupSettingsModal();
  setupNotificationButtons();
  
  if (document.getElementById('notificationsList')) {
    loadNotificationsUI().catch(err => console.error('Error loading notifications:', err));
  }
  
  if (document.getElementById('alertsList')) {
    loadAlertsUI().catch(err => console.error('Error loading alerts:', err));
  }
}

function setupNotificationButtons() {
  const markAllBtn = document.getElementById('markAllReadBtn');
  if (markAllBtn) {
    markAllBtn.addEventListener('click', async () => {
      const success = await markAllAsRead();
      if (success) {
        loadNotificationsUI();
      }
    });
  }
  
  // Кнопка "Очистить все"
  const clearAllBtn = document.getElementById('clearAllBtn');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', async () => {
      const success = await clearAllNotifications();
      if (success) {
        loadNotificationsUI();
      }
    });
  }
}

/**
 * Переключение вкладок
 */
function setupTabSwitching() {
  const tabs = document.querySelectorAll('.notification-tab');
  const contents = document.querySelectorAll('.notifications-tab-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      
      // Обновляем активную вкладку
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Показываем соответствующий контент
      contents.forEach(content => {
        if (content.dataset.content === tabName) {
          content.classList.add('active');
        } else {
          content.classList.remove('active');
        }
      });
      
      uiState.currentTab = tabName;
      
      // Загружаем данные для активной вкладки
      if (tabName === 'notifications') {
        loadNotificationsUI();
      } else if (tabName === 'alerts') {
        loadAlertsUI();
      }
    });
  });
}

/**
 * Фильтры уведомлений
 */
function setupFilters() {
  const filterChips = document.querySelectorAll('.filter-chip');
  
  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      filterChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      
      uiState.currentFilter = chip.dataset.filter;
      loadNotificationsUI();
    });
  });
}

/**
 * Форма создания алерта
 */
function setupAlertForm() {
  const createBtn = document.getElementById('createAlertBtn');
  const cancelBtn = document.getElementById('cancelAlertBtn');
  const saveBtn = document.getElementById('saveAlertBtn');
  const formContainer = document.getElementById('alertFormContainer');
  
  if (createBtn) {
    createBtn.addEventListener('click', () => {
      uiState.isAlertFormOpen = !uiState.isAlertFormOpen;
      formContainer.style.display = uiState.isAlertFormOpen ? 'block' : 'none';
      
      if (uiState.isAlertFormOpen) {
        createBtn.innerHTML = '<i class="fas fa-times"></i> Закрыть';
      } else {
        createBtn.innerHTML = '<i class="fas fa-plus"></i> Создать алерт';
      }
    });
  }
  
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      formContainer.style.display = 'none';
      uiState.isAlertFormOpen = false;
      createBtn.innerHTML = '<i class="fas fa-plus"></i> Создать алерт';
      clearAlertForm();
    });
  }
  
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      await handleSaveAlert();
    });
  }
}

/**
 * Сохранение нового алерта
 */
async function handleSaveAlert() {
  const symbol = document.getElementById('alertSymbol').value.trim().toUpperCase();
  const assetType = document.getElementById('alertAssetType').value;
  const targetPrice = parseFloat(document.getElementById('alertTargetPrice').value);
  const direction = document.getElementById('alertDirection').value;
  const note = document.getElementById('alertNote').value.trim();
  
  // Валидация
  if (!symbol) {
    showToast('Укажите символ актива', 'error');
    return;
  }
  
  if (!targetPrice || targetPrice <= 0) {
    showToast('Укажите корректную целевую цену', 'error');
    return;
  }
  
  try {
    document.getElementById('saveAlertBtn').disabled = true;
    document.getElementById('saveAlertBtn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Сохранение...';
    
    await createPriceAlert(symbol, targetPrice, direction, assetType, note);
    
    showToast('Алерт успешно создан!', 'success');
    clearAlertForm();
    document.getElementById('alertFormContainer').style.display = 'none';
    document.getElementById('createAlertBtn').innerHTML = '<i class="fas fa-plus"></i> Создать алерт';
    uiState.isAlertFormOpen = false;
    
    // Обновляем список
    await loadAlertsUI();
    
  } catch (error) {
    console.error('Ошибка создания алерта:', error);
    showToast('Ошибка создания алерта', 'error');
  } finally {
    document.getElementById('saveAlertBtn').disabled = false;
    document.getElementById('saveAlertBtn').innerHTML = '<i class="fas fa-save"></i> Сохранить';
  }
}

/**
 * Очистка формы
 */
function clearAlertForm() {
  document.getElementById('alertSymbol').value = '';
  document.getElementById('alertTargetPrice').value = '';
  document.getElementById('alertNote').value = '';
  document.getElementById('alertAssetType').value = 'crypto';
  document.getElementById('alertDirection').value = 'above';
}

/**
 * Загрузка уведомлений в UI
 */
export async function loadNotificationsUI() {
  const container = document.getElementById('notificationsList');
  
  if (!container) {
    console.warn('Контейнер notificationsList не найден');
    return;
  }
  
  try {
    const filter = uiState.currentFilter === 'all' ? {} : { type: uiState.currentFilter };
    const notifications = await getNotifications(filter);
    
    if (!notifications || notifications.length === 0) {
      container.innerHTML = `
        <div class="notifications-empty">
          <i class="fas fa-bell-slash"></i>
          <p>Нет уведомлений</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = notifications.map(notif => renderNotificationItem(notif)).join('');
    
    // Добавляем обработчики
    setupNotificationHandlers(notifications);
    
  } catch (error) {
    console.error('Ошибка загрузки уведомлений:', error);
    container.innerHTML = `
      <div class="notifications-empty">
        <i class="fas fa-exclamation-triangle"></i>
        <p>Ошибка загрузки уведомлений</p>
      </div>
    `;
  }
}

/**
 * Рендер элемента уведомления
 */
function renderNotificationItem(notification) {
  const priorityColors = {
    low: '#64748b',
    normal: '#3b82f6',
    high: '#f59e0b',
    urgent: '#ef4444'
  };
  
  const typeIcons = {
    price_alert: 'chart-line',
    portfolio: 'briefcase',
    news: 'newspaper',
    system: 'cog',
    recommendation: 'lightbulb'
  };
  
  const unreadClass = notification.is_read ? '' : 'unread';
  const priorityColor = priorityColors[notification.priority] || priorityColors.normal;
  const icon = typeIcons[notification.type] || 'bell';
  const timeAgo = formatTimeAgo(new Date(notification.created_at));
  
  return `
    <div class="notification-item ${unreadClass}" data-id="${notification.id}" style="border-left-color: ${priorityColor}">
      <div class="notification-icon" style="color: ${priorityColor}">
        <i class="fas fa-${icon}"></i>
      </div>
      <div class="notification-content">
        <div class="notification-header">
          <div class="notification-title">${notification.title}</div>
          <div class="notification-time">${timeAgo}</div>
        </div>
        <div class="notification-message">${notification.message}</div>
        ${notification.related_symbol ? `
          <div class="notification-meta">
            <span class="notification-symbol">${notification.related_symbol}</span>
          </div>
        ` : ''}
      </div>
      <div class="notification-actions-dropdown">
        <button class="notification-btn mark-read-btn" data-id="${notification.id}" title="Отметить прочитанным">
          <i class="fas fa-check"></i>
        </button>
        <button class="notification-btn delete-btn" data-id="${notification.id}" title="Удалить">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `;
}

/**
 * Обработчики для уведомлений
 */
function setupNotificationHandlers(notifications) {
  // Отметить как прочитанное
  document.querySelectorAll('.mark-read-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      await markAsRead(id);
      await loadNotificationsUI();
    });
  });
  
  // Удалить
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (confirm('Удалить это уведомление?')) {
        await deleteNotification(id);
        await loadNotificationsUI();
      }
    });
  });
}

/**
 * Загрузка алертов цен в UI
 */
async function loadAlertsUI() {
  const container = document.getElementById('alertsList');
  
  if (!container) {
    console.warn('Контейнер alertsList не найден');
    return;
  }
  
  try {
    container.innerHTML = `
      <div class="alerts-loading">
        <div class="loader-small"></div>
        <p>Загрузка алертов...</p>
      </div>
    `;
    
    const alerts = await getPriceAlerts();
    
    if (!alerts || alerts.length === 0) {
      container.innerHTML = `
        <div class="alerts-empty">
          <i class="fas fa-chart-line"></i>
          <p>Нет активных алертов</p>
          <button class="btn btn-primary btn-sm" onclick="document.getElementById('createAlertBtn').click()">
            <i class="fas fa-plus"></i> Создать первый алерт
          </button>
        </div>
      `;
      return;
    }
    
    container.innerHTML = alerts.map(alert => renderAlertItem(alert)).join('');
    
    // Добавляем обработчики
    setupAlertHandlers();
    
  } catch (error) {
    console.error('Ошибка загрузки алертов:', error);
    container.innerHTML = `
      <div class="alerts-empty">
        <i class="fas fa-exclamation-triangle"></i>
        <p>Ошибка загрузки алертов</p>
      </div>
    `;
  }
}

/**
 * Рендер элемента алерта
 */
function renderAlertItem(alert) {
  const triggered = alert.is_triggered ? 'triggered' : '';
  const direction = alert.direction === 'above' ? 'выше' : 'ниже';
  const directionIcon = alert.direction === 'above' ? 'arrow-up' : 'arrow-down';
  const directionColor = alert.direction === 'above' ? '#10b981' : '#ef4444';
  const statusIcon = alert.is_active ? 'check-circle' : 'pause-circle';
  const statusColor = alert.is_active ? '#10b981' : '#64748b';
  
  return `
    <div class="alert-item ${triggered}" data-id="${alert.id}">
      <div class="alert-header">
        <div class="alert-symbol">
          <span>${alert.symbol}</span>
          <span class="alert-badge ${alert.asset_type}">${alert.asset_type}</span>
        </div>
        <div class="alert-actions">
          <button class="icon-btn" title="Статус: ${alert.is_active ? 'Активен' : 'Приостановлен'}">
            <i class="fas fa-${statusIcon}" style="color: ${statusColor}"></i>
          </button>
          <button class="icon-btn toggle-alert-btn" data-id="${alert.id}" data-active="${alert.is_active}" title="Переключить">
            <i class="fas fa-${alert.is_active ? 'pause' : 'play'}"></i>
          </button>
          <button class="icon-btn delete-alert-btn" data-id="${alert.id}" title="Удалить">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      
      <div class="alert-details">
        <div class="alert-detail">
          <span class="alert-detail-label">Целевая цена</span>
          <span class="alert-detail-value">$${parseFloat(alert.target_price).toFixed(2)}</span>
        </div>
        <div class="alert-detail">
          <span class="alert-detail-label">Условие</span>
          <span class="alert-detail-value" style="color: ${directionColor}">
            <i class="fas fa-${directionIcon}"></i> ${direction}
          </span>
        </div>
        ${alert.current_price ? `
          <div class="alert-detail">
            <span class="alert-detail-label">Текущая цена</span>
            <span class="alert-detail-value">$${parseFloat(alert.current_price).toFixed(2)}</span>
          </div>
        ` : ''}
      </div>
      
      ${alert.note ? `
        <div class="alert-note">
          <i class="fas fa-sticky-note"></i> ${alert.note}
        </div>
      ` : ''}
      
      ${alert.is_triggered ? `
        <div class="alert-note" style="background: rgba(16, 185, 129, 0.1); color: #10b981;">
          <i class="fas fa-check-circle"></i> Сработал ${formatTimeAgo(new Date(alert.triggered_at))}
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Обработчики для алертов
 */
function setupAlertHandlers() {
  // Переключить активность
  document.querySelectorAll('.toggle-alert-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const isActive = btn.dataset.active === 'true';
      
      try {
        await updatePriceAlert(id, { is_active: !isActive });
        await loadAlertsUI();
        showToast(isActive ? 'Алерт приостановлен' : 'Алерт активирован', 'success');
      } catch (error) {
        console.error('Ошибка обновления алерта:', error);
        showToast('Ошибка обновления алерта', 'error');
      }
    });
  });
  
  // Удалить
  document.querySelectorAll('.delete-alert-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      
      if (confirm('Удалить этот алерт?')) {
        try {
          await deletePriceAlert(id);
          await loadAlertsUI();
          showToast('Алерт удален', 'success');
        } catch (error) {
          console.error('Ошибка удаления алерта:', error);
          showToast('Ошибка удаления алерта', 'error');
        }
      }
    });
  });
}

/**
 * Модальное окно настроек
 */
function setupSettingsModal() {
  const settingsBtn = document.getElementById('notificationSettingsBtn');
  const modal = document.getElementById('notificationSettingsModal');
  const closeBtn = document.getElementById('closeSettingsModal');
  const cancelBtn = document.getElementById('cancelSettingsBtn');
  const saveBtn = document.getElementById('saveSettingsBtn');
  
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      loadCurrentSettings();
      modal.style.display = 'flex';
    });
  }
  
  const closeModal = () => {
    modal.style.display = 'none';
  };
  
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  
  // Закрытие по клику вне модального окна
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      await handleSaveSettings();
    });
  }
}

/**
 * Загрузка текущих настроек
 */
function loadCurrentSettings() {
  const prefs = notificationsState.preferences || {};
  
  document.getElementById('settingEnabled').checked = prefs.enabled !== false;
  document.getElementById('settingPushNotifications').checked = prefs.push_notifications !== false;
  document.getElementById('settingPriceAlerts').checked = prefs.price_alerts_enabled !== false;
  document.getElementById('settingPortfolioAlerts').checked = prefs.portfolio_alerts_enabled !== false;
  document.getElementById('settingNewsAlerts').checked = prefs.news_alerts_enabled !== false;
  document.getElementById('settingRecommendationAlerts').checked = prefs.recommendation_alerts_enabled !== false;
  
  document.getElementById('settingPriceChangeThreshold').value = prefs.price_change_threshold || 5;
  document.getElementById('settingPortfolioChangeThreshold').value = prefs.portfolio_change_threshold || 10;
}

/**
 * Сохранение настроек
 */
async function handleSaveSettings() {
  const settings = {
    enabled: document.getElementById('settingEnabled').checked,
    push_notifications: document.getElementById('settingPushNotifications').checked,
    price_alerts_enabled: document.getElementById('settingPriceAlerts').checked,
    portfolio_alerts_enabled: document.getElementById('settingPortfolioAlerts').checked,
    news_alerts_enabled: document.getElementById('settingNewsAlerts').checked,
    recommendation_alerts_enabled: document.getElementById('settingRecommendationAlerts').checked,
    price_change_threshold: parseFloat(document.getElementById('settingPriceChangeThreshold').value),
    portfolio_change_threshold: parseFloat(document.getElementById('settingPortfolioChangeThreshold').value)
  };
  
  try {
    document.getElementById('saveSettingsBtn').disabled = true;
    document.getElementById('saveSettingsBtn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Сохранение...';
    
    await updateNotificationPreferences(settings);
    
    showToast('Настройки сохранены!', 'success');
    document.getElementById('notificationSettingsModal').style.display = 'none';
    
  } catch (error) {
    console.error('Ошибка сохранения настроек:', error);
    showToast('Ошибка сохранения настроек', 'error');
  } finally {
    document.getElementById('saveSettingsBtn').disabled = false;
    document.getElementById('saveSettingsBtn').innerHTML = '<i class="fas fa-save"></i> Сохранить';
  }
}

/**
 * Форматирование времени
 */
function formatTimeAgo(date) {
  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}д назад`;
  if (hours > 0) return `${hours}ч назад`;
  if (minutes > 0) return `${minutes}м назад`;
  return 'только что';
}

/**
 * Toast уведомление
 */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `notification-toast ${type}`;
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  setTimeout(() => toast.classList.add('show'), 100);
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
