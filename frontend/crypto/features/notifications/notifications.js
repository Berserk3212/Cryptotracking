// notifications.js

import { supabase } from '../../core/profile.js';

let notificationsState = {
  unread: [],
  all: [],
  preferences: null,
  isLoading: false,
  realtimeSubscription: null
};

let unreadCount = 0;

export async function initNotifications() {
  try {

    
    await loadNotificationPreferences();
    await loadNotifications();
    subscribeToNotifications();
    updateNotificationBadge();
    renderNotificationPanel();
    

  } catch (error) {

  }
}

async function loadNotificationPreferences() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single();
    
    if (error && error.code !== 'PGRST116') {

      return;
    }
    
    if (!data) {
      const { data: newPrefs, error: createError } = await supabase
        .from('notification_preferences')
        .insert([{ user_id: user.id }])
        .select()
        .single();
      
      if (!createError) {
        notificationsState.preferences = newPrefs;
      }
    } else {
      notificationsState.preferences = data;
    }
  } catch (error) {

  }
}

export async function loadNotifications(limit = 50) {
  try {
    notificationsState.isLoading = true;
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_dismissed', false)
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) {

      return;
    }
    
    notificationsState.all = data || [];
    notificationsState.unread = data?.filter(n => !n.is_read) || [];
    unreadCount = notificationsState.unread.length;
    
    updateNotificationBadge();
    
  } catch (error) {

  } finally {
    notificationsState.isLoading = false;
  }
}

/**
 * Подписка на realtime обновления уведомлений
 */
function subscribeToNotifications() {
  try {
    // Отписываемся от предыдущей подписки если есть
    if (notificationsState.realtimeSubscription) {
      supabase.removeChannel(notificationsState.realtimeSubscription);
    }
    
    // Подписываемся на новые уведомления
    notificationsState.realtimeSubscription = supabase
      .channel('notifications_channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications'
        },
        (payload) => {
          handleNewNotification(payload.new);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications'
        },
        (payload) => {
          handleNotificationUpdate(payload.new);
        }
      )
      .subscribe();
    

  } catch (error) {

  }
}

/**
 * Обработка нового уведомления
 */
function handleNewNotification(notification) {
  // Добавляем в список
  notificationsState.all.unshift(notification);
  
  if (!notification.is_read) {
    notificationsState.unread.unshift(notification);
    unreadCount++;
  }
  
  // Обновляем UI
  updateNotificationBadge();
  renderNotificationPanel();
  
  // Показываем toast уведомление
  showNotificationToast(notification);
  
  // Воспроизводим звук (опционально)
  if (notificationsState.preferences?.enabled) {
    playNotificationSound();
  }
}

/**
 * Обработка обновления уведомления
 */
function handleNotificationUpdate(notification) {
  const index = notificationsState.all.findIndex(n => n.id === notification.id);
  
  if (index !== -1) {
    notificationsState.all[index] = notification;
    // Пересортируем по created_at desc, чтобы обновлённое уведомление встало наверх
    notificationsState.all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    // Обновляем непрочитанные
    if (notification.is_read) {
      notificationsState.unread = notificationsState.unread.filter(n => n.id !== notification.id);
    } else if (!notificationsState.unread.find(n => n.id === notification.id)) {
      notificationsState.unread.unshift(notification);
    }
    unreadCount = notificationsState.unread.length;
    
    updateNotificationBadge();
    renderNotificationPanel();
  }
}

/**
 * Отметить уведомление как прочитанное
 */
export async function markAsRead(notificationId) {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ 
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq('id', notificationId);
    
    if (error) {

      return false;
    }
    
    // Обновляем локальное состояние
    const notification = notificationsState.all.find(n => n.id === notificationId);
    if (notification) {
      notification.is_read = true;
      notification.read_at = new Date().toISOString();
    }
    
    notificationsState.unread = notificationsState.unread.filter(n => n.id !== notificationId);
    unreadCount = notificationsState.unread.length;
    
    updateNotificationBadge();
    renderNotificationPanel();
    
    return true;
  } catch (error) {

    return false;
  }
}

/**
 * Отметить все уведомления как прочитанные
 */
export async function markAllAsRead() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    
    const { error } = await supabase
      .from('notifications')
      .update({ 
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq('user_id', user.id)
      .eq('is_read', false);
    
    if (error) {

      return false;
    }
    
    // Обновляем локальное состояние
    notificationsState.all.forEach(n => {
      if (!n.is_read) {
        n.is_read = true;
        n.read_at = new Date().toISOString();
      }
    });
    
    notificationsState.unread = [];
    unreadCount = 0;
    
    updateNotificationBadge();
    renderNotificationPanel();
    
    return true;
  } catch (error) {

    return false;
  }
}

/**
 * Удалить уведомление
 */
export async function dismissNotification(notificationId) {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_dismissed: true })
      .eq('id', notificationId);
    
    if (error) {

      return false;
    }
    
    // Удаляем из локального состояния
    notificationsState.all = notificationsState.all.filter(n => n.id !== notificationId);
    notificationsState.unread = notificationsState.unread.filter(n => n.id !== notificationId);
    unreadCount = notificationsState.unread.length;
    
    updateNotificationBadge();
    renderNotificationPanel();
    
    return true;
  } catch (error) {

    return false;
  }
}

/**
 * Создать Price Alert
 */
export async function createPriceAlert(symbol, targetPrice, direction, assetType = 'crypto', note = '') {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Пользователь не авторизован');
    }
    
    const { data, error } = await supabase
      .from('price_alerts')
      .insert([{
        user_id: user.id,
        symbol: symbol,
        asset_type: assetType,
        target_price: targetPrice,
        direction: direction,
        note: note,
        is_active: true
      }])
      .select()
      .single();
    
    if (error) {
      throw error;
    }
    
    return data;
  } catch (error) {

    throw error;
  }
}

/**
 * Получить активные Price Alerts
 */
export async function getActivePriceAlerts() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    
    const { data, error } = await supabase
      .from('price_alerts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    
    if (error) {

      return [];
    }
    
    return data || [];
  } catch (error) {

    return [];
  }
}

/**
 * Деактивировать Price Alert
 */
export async function deactivatePriceAlert(alertId) {
  try {
    const { error } = await supabase
      .from('price_alerts')
      .update({ is_active: false })
      .eq('id', alertId);
    
    if (error) {
      throw error;
    }
    
    return true;
  } catch (error) {

    return false;
  }
}

/**
 * Обновление счетчика непрочитанных уведомлений
 */
function updateNotificationBadge() {
  const badge = document.getElementById('notificationBadge');
  const bellIcon = document.getElementById('notificationBellIcon');
  
  if (badge) {
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
      badge.style.display = 'flex';
      
      // Добавляем анимацию колокольчику
      if (bellIcon) {
        bellIcon.classList.add('notification-shake');
        setTimeout(() => bellIcon.classList.remove('notification-shake'), 500);
      }
    } else {
      badge.style.display = 'none';
    }
  }
}

/**
 * Рендеринг панели уведомлений
 */
function renderNotificationPanel() {
  const panel = document.getElementById('notificationsPanel');
  if (!panel) return;
  
  const container = panel.querySelector('.notifications-list');
  if (!container) return;
  
  if (notificationsState.all.length === 0) {
    container.innerHTML = `
      <div class="no-notifications">
        <i class="fas fa-bell-slash"></i>
        <p>Нет уведомлений</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = notificationsState.all
    .slice(0, 20)  // Показываем последние 20
    .map(notification => createNotificationHTML(notification))
    .join('');
  
  // Принудительно задаём белый цвет заголовков (обходим любой конфликт CSS)
  container.querySelectorAll('.notification-header h4').forEach(el => {
    el.style.setProperty('color', '#ffffff', 'important');
  });
  
  // Привязываем обработчики
  attachNotificationHandlers();
}

/**
 * Создание HTML для уведомления
 */
function createNotificationHTML(notification) {
  const isUnread = !notification.is_read;
  const icon = getNotificationIcon(notification.type);
  const priorityClass = `priority-${notification.priority}`;
  const timeAgo = getTimeAgo(notification.created_at);
  
  return `
    <div class="notification-item ${isUnread ? 'unread' : ''} ${priorityClass}" 
         data-notification-id="${notification.id}">
      <div class="notification-icon">
        <i class="${icon}"></i>
      </div>
      <div class="notification-content">
        <div class="notification-header">
          <h4 style="color:#ffffff;font-weight:600;">${notification.title}</h4>
          <span class="notification-time">${timeAgo}</span>
        </div>
        <p class="notification-message">${notification.message}</p>
        ${notification.related_symbol ? `
          <div class="notification-symbol">
            <i class="fas fa-tag"></i>
            <span>${notification.related_symbol}</span>
          </div>
        ` : ''}
      </div>
      <div class="notification-actions">
        ${isUnread ? `
          <button class="notification-btn mark-read" title="Отметить прочитанным">
            <i class="fas fa-check"></i>
          </button>
        ` : ''}
        <button class="notification-btn dismiss" title="Удалить">
          <i class="fas fa-times"></i>
        </button>
      </div>
    </div>
  `;
}

/**
 * Получить иконку для типа уведомления
 */
function getNotificationIcon(type) {
  const icons = {
    'price_alert': 'fas fa-bell',
    'portfolio': 'fas fa-briefcase',
    'news': 'fas fa-newspaper',
    'system': 'fas fa-info-circle',
    'recommendation': 'fas fa-lightbulb'
  };
  return icons[type] || 'fas fa-bell';
}

/**
 * Получить относительное время
 */
function getTimeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  
  if (seconds < 60) return 'Только что';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} мин назад`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ч назад`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} д назад`;
  
  return date.toLocaleDateString('ru-RU');
}

/**
 * Привязка обработчиков для уведомлений
 */
function attachNotificationHandlers() {
  document.querySelectorAll('.notification-item .mark-read').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const item = btn.closest('.notification-item');
      const id = item.getAttribute('data-notification-id');
      await markAsRead(id);
    };
  });
  
  document.querySelectorAll('.notification-item .dismiss').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const item = btn.closest('.notification-item');
      const id = item.getAttribute('data-notification-id');
      await dismissNotification(id);
    };
  });
  
  // Клик по уведомлению - отметить прочитанным и перейти к связан activ
  document.querySelectorAll('.notification-item').forEach(item => {
    item.onclick = async () => {
      const id = item.getAttribute('data-notification-id');
      const notification = notificationsState.all.find(n => n.id === id);
      
      if (notification && !notification.is_read) {
        await markAsRead(id);
      }
      
      // Переход к связанному объекту если есть
      if (notification?.related_symbol) {
        handleNotificationClick(notification);
      }
    };
  });
}

/**
 * Обработка клика по уведомлению
 */
function handleNotificationClick(notification) {
  // Закрываем панель уведомлений
  const panel = document.getElementById('notificationsPanel');
  if (panel) panel.classList.remove('active');
  
  // В зависимости от типа переходим к разным разделам
  if (notification.type === 'price_alert' && notification.related_symbol) {
    // Открываем модальное окно актива
    if (window.showCryptoModal) {
      window.showCryptoModal(notification.related_symbol);
    }
  }
}

/**
 * Toast уведомление
 */
function showNotificationToast(notification) {
  const toast = document.createElement('div');
  toast.className = `notification-toast priority-${notification.priority} type-${notification.type}`;
  toast.innerHTML = `
    <div class="toast-icon">
      <i class="${getNotificationIcon(notification.type)}"></i>
    </div>
    <div class="toast-content">
      <h4>${notification.title}</h4>
      <p>${notification.message}</p>
    </div>
    <button class="toast-close">
      <i class="fas fa-times"></i>
    </button>
  `;
  
  document.body.appendChild(toast);
  
  // Автозакрытие через 5 секунд
  const autoClose = setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 5000);
  
  // Закрытие по клику
  toast.querySelector('.toast-close').onclick = () => {
    clearTimeout(autoClose);
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  };
  
  // Показываем toast
  setTimeout(() => toast.classList.add('show'), 100);
}

/**
 * Воспроизведение звука уведомления
 */
function playNotificationSound() {
  try {
    // Создаем простой звук программно
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (error) {

  }
}

/**
 * Получить все уведомления с фильтрацией
 */
export async function getNotifications(filter = {}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    
    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_dismissed', false)
      .order('created_at', { ascending: false });
    
    // Фильтры (проверяем что filter не null)
    if (filter && filter.type) {
      query = query.eq('type', filter.type);
    }
    
    if (filter && filter.unread) {
      query = query.eq('is_read', false);
    }
    
    const { data, error } = await query;
    
    if (error) {

      return [];
    }
    
    return data || [];
  } catch (error) {

    return [];
  }
}

/**
 * Удалить уведомление
 */
export async function deleteNotification(notificationId) {
  try {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId);
    
    if (error) throw error;
    
    // Обновляем локальное состояние
    notificationsState.all = notificationsState.all.filter(n => n.id !== notificationId);
    notificationsState.unread = notificationsState.unread.filter(n => n.id !== notificationId);
    updateNotificationBadge();
    
    return true;
  } catch (error) {

    throw error;
  }
}

/**
 * Очистить все уведомления
 */
export async function clearAllNotifications() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    
    // Подтверждение от пользователя
    if (!confirm('Удалить все уведомления? Это действие нельзя отменить.')) {
      return false;
    }
    
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', user.id);
    
    if (error) {

      return false;
    }
    
    // Очищаем локальное состояние
    notificationsState.all = [];
    notificationsState.unread = [];
    unreadCount = 0;
    
    updateNotificationBadge();
    renderNotificationPanel();
    

    return true;
  } catch (error) {

    return false;
  }
}

/**
 * Получить все price alerts
 */
export async function getPriceAlerts() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    
    const { data, error } = await supabase
      .from('price_alerts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    
    if (error) {

      return [];
    }
    
    return data || [];
  } catch (error) {

    return [];
  }
}

/**
 * Обновить price alert
 */
export async function updatePriceAlert(alertId, updates) {
  try {
    const { data, error } = await supabase
      .from('price_alerts')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', alertId)
      .select()
      .single();
    
    if (error) throw error;
    
    return data;
  } catch (error) {

    throw error;
  }
}

/**
 * Удалить price alert
 */
export async function deletePriceAlert(alertId) {
  try {
    const { error } = await supabase
      .from('price_alerts')
      .delete()
      .eq('id', alertId);
    
    if (error) throw error;
    
    return true;
  } catch (error) {

    throw error;
  }
}

/**
 * Обновить настройки уведомлений
 */
export async function updateNotificationPreferences(preferences) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Пользователь не авторизован');
    
    const { data, error } = await supabase
      .from('notification_preferences')
      .upsert({
        user_id: user.id,
        ...preferences,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      })
      .select()
      .single();
    
    if (error) throw error;
    
    notificationsState.preferences = data;
    return data;
  } catch (error) {

    throw error;
  }
}

/**
 * Создать тестовое уведомление
 */
export async function createTestNotification(type = 'portfolio') {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Пользователь не авторизован');
    
    const testNotifications = {
      'portfolio': {
        title: 'Отличные новости!',
        message: 'Ваш портфель вырос на 12.5% за последнюю неделю. Общая прибыль составила $1,250.',
        type: 'portfolio',
        priority: 'normal',
        related_symbol: null
      },
      'news': {
        title: 'Важная новость',
        message: 'Bitcoin достиг нового исторического максимума $75,000. Аналитики прогнозируют дальнейший рост.',
        type: 'news',
        priority: 'normal',
        related_symbol: 'BTC'
      },
      'recommendation': {
        title: 'Рекомендация',
        message: 'Рассмотрите возможность диверсификации. Ваш портфель на 80% состоит из криптовалют.',
        type: 'recommendation',
        priority: 'normal',
        related_symbol: null
      },
      'price_alert': {
        title: 'Ценовой алерт',
        message: 'Ethereum достиг целевой цены $4,000! Рост составил +8.3% за день.',
        type: 'price_alert',
        priority: 'urgent',
        related_symbol: 'ETH'
      }
    };
    
    const notification = testNotifications[type] || testNotifications['portfolio'];
    
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id: user.id,
        ...notification
      })
      .select()
      .single();
    
    if (error) throw error;
    

    
    // Обновляем UI
    await loadNotifications();
    updateNotificationBadge();
    
    return data;
  } catch (error) {

    throw error;
  }
}

// Экспортируем состояние
export { notificationsState };

// Экспорт для глобального доступа
window.notificationsModule = {
  initNotifications,
  loadNotifications,
  getNotifications,
  markAsRead,
  markAllAsRead,
  dismissNotification,
  deleteNotification,
  clearAllNotifications,
  createPriceAlert,
  getActivePriceAlerts,
  getPriceAlerts,
  updatePriceAlert,
  deletePriceAlert,
  deactivatePriceAlert,
  updateNotificationPreferences,
  notificationsState
};
