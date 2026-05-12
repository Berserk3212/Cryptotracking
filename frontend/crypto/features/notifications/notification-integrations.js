// notification-integrations.js

import { supabase } from '../../core/profile.js';

let lastPortfolioValue = null;
let lastPortfolioData = null;
let processedNewsIds = new Set();
let lastPriceCheck = {};
const lastConcentrationNotifications = new Map();

async function createNotification({ title, message, type, priority = 'normal', related_symbol = null }) {
  try {

    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {

      return null;
    }

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentNotifications } = await supabase
      .from('notifications')
      .select('id, title, message')
      .eq('user_id', user.id)
      .eq('title', title)
      .eq('type', type)
      .gte('created_at', oneDayAgo)
      .limit(1);

    if (recentNotifications && recentNotifications.length > 0) {
      const existingId = recentNotifications[0].id;
      await supabase
        .from('notifications')
        .update({ created_at: new Date().toISOString(), is_read: false, is_dismissed: false })
        .eq('id', existingId);

      return existingId;
    }

    const { data: prefs, error: prefsError } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (prefsError && prefsError.code !== 'PGRST116') {

    }

    if (prefs && !prefs.enabled) {

      return null;
    }

    if (prefs) {
      if (type === 'price_alert' && !prefs.price_alerts_enabled) {

        return null;
      }
      if (type === 'portfolio' && !prefs.portfolio_alerts_enabled) {

        return null;
      }
      if (type === 'news' && !prefs.news_alerts_enabled) {

        return null;
      }
      if (type === 'recommendation' && !prefs.recommendation_alerts_enabled) {

        return null;
      }
    }

    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id: user.id,
        title,
        message,
        type,
        priority,
        related_symbol
      })
      .select()
      .single();

    if (error) {

      return null;
    }

    return data;
  } catch (error) {

    return null;
  }
}

/**
 * Уведомления о новостях
 */
export async function notifyAboutNews(news) {
  try {

    
    // Проверяем, не обрабатывали ли мы эту новость
    const newsId = news.id || `${news.title}_${news.datetime || news.publishedAt}`;
    if (processedNewsIds.has(newsId)) {

      return;
    }
    
    // Загружаем активы пользователя из портфелей
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {

      return;
    }

    const { data: portfolios } = await supabase
      .from('portfolios')
      .select('*')
      .eq('user_id', user.id);

    if (!portfolios || portfolios.length === 0) {

      return;
    }

    // Получаем все транзакции для поиска активов
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id);

    if (!transactions || transactions.length === 0) {

      return;
    }

    // Собираем все уникальные символы из транзакций
    const userSymbols = new Set(
      transactions.map(t => String(t.symbol || '').toUpperCase())
    );

    // Проверяем, связана ли новость с активами пользователя
    const newsText = `${news.title} ${news.summary || news.description || ''}`.toUpperCase();
    let relatedSymbol = null;
    
    for (const symbol of userSymbols) {
      if (newsText.includes(symbol)) {
        relatedSymbol = symbol;

        break;
      }
    }

    // Если новость связана с активами пользователя, создаем уведомление
    if (relatedSymbol) {

      
      await createNotification({
        title: `${relatedSymbol}: ${news.title}`,
        message: news.summary || news.description || 'Важная новость по вашему активу',
        type: 'news',
        priority: 'normal',
        related_symbol: relatedSymbol
      });

      processedNewsIds.add(newsId);
      
      // Ограничиваем размер Set
      if (processedNewsIds.size > 100) {
        const arr = Array.from(processedNewsIds);
        processedNewsIds = new Set(arr.slice(-50));
      }
    } else {

    }
  } catch (error) {

  }
}

/**
 * Уведомления об изменениях портфеля
 */
export async function notifyAboutPortfolioChange(currentValue, portfolioData) {
  try {

    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {

      return;
    }

    // Первый запуск - сохраняем начальное значение
    if (lastPortfolioValue === null) {
      lastPortfolioValue = currentValue;
      lastPortfolioData = portfolioData;

      return;
    }

    // Вычисляем изменение в процентах
    const change = ((currentValue - lastPortfolioValue) / lastPortfolioValue) * 100;
    
    console.log('Изменение портфеля:', {
      from: lastPortfolioValue,
      to: currentValue,
      changePercent: change.toFixed(2)
    });

    // Получаем порог из настроек
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('portfolio_change_threshold')
      .eq('user_id', user.id)
      .single();

    const threshold = prefs?.portfolio_change_threshold || 5; // Снижено с 10 до 5 для тестирования

    // Если изменение превышает порог
    if (Math.abs(change) >= threshold) {
      const isPositive = change > 0;
      const verb = isPositive ? 'вырос' : 'упал';
      const priority = Math.abs(change) >= 15 ? 'high' : 'normal';

      await createNotification({
        title: `Портфель ${verb} на ${Math.abs(change).toFixed(2)}%`,
        message: `Стоимость портфеля изменилась с $${lastPortfolioValue.toFixed(2)} до $${currentValue.toFixed(2)}`,
        type: 'portfolio',
        priority,
        related_symbol: null
      });

      // Обновляем последнее значение
      lastPortfolioValue = currentValue;
      lastPortfolioData = portfolioData;

    } else {

    }
  } catch (error) {

  }
}

/**
 * Уведомления о значительных изменениях цены актива
 */
export async function notifyAboutPriceChange(symbol, currentPrice, previousPrice) {
  try {
    if (!previousPrice || !currentPrice) return;

    const change = ((currentPrice - previousPrice) / previousPrice) * 100;
    
    // Получаем порог из настроек
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('price_change_threshold')
      .eq('user_id', user.id)
      .single();

    const threshold = prefs?.price_change_threshold || 5;

    // Проверяем, уведомляли ли мы уже об этом изменении недавно
    const lastCheck = lastPriceCheck[symbol];
    const now = Date.now();
    
    if (lastCheck && (now - lastCheck) < 3600000) return; // 1 час

    // Если изменение превышает порог
    if (Math.abs(change) >= threshold) {
      const isPositive = change > 0;
      const verb = isPositive ? 'вырос' : 'упал';

      await createNotification({
        title: `${symbol} ${verb} на ${Math.abs(change).toFixed(2)}%`,
        message: `Цена изменилась с $${previousPrice.toFixed(2)} до $${currentPrice.toFixed(2)}`,
        type: 'price_alert',
        priority: Math.abs(change) >= 10 ? 'urgent' : 'high',
        related_symbol: symbol
      });

      lastPriceCheck[symbol] = now;
    }
  } catch (error) {

  }
}

/**
 * Уведомления о рекомендациях по портфелю
 */
export async function notifyAboutRecommendation(title, message, priority = 'normal') {
  try {
    await createNotification({
      title: title,
      message,
      type: 'recommendation',
      priority
    });
  } catch (error) {

  }
}

/**
 * Проверка диверсификации портфеля
 */
export async function checkPortfolioDiversification(holdings) {
  try {
    if (!holdings || Object.keys(holdings).length === 0) return;

    const totalValue = Object.values(holdings).reduce((sum, h) => sum + h.value, 0);
    const now = Date.now();
    const NOTIFICATION_COOLDOWN = 60 * 60 * 1000; // 1 час между одинаковыми уведомлениями
    
    // Проверяем концентрацию в одном активе
    for (const [symbol, holding] of Object.entries(holdings)) {
      const percentage = (holding.value / totalValue) * 100;
      
      if (percentage > 50) {
        // Проверяем, отправляли ли мы уже такое уведомление недавно (сначала in-memory, потом Supabase)
        const notificationKey = `concentration_${symbol}`;
        const lastNotificationTime = lastConcentrationNotifications.get(notificationKey);
        const MEMORY_COOLDOWN = 10 * 60 * 1000; // 10 мин в памяти
        
        if (!lastNotificationTime || (now - lastNotificationTime) > MEMORY_COOLDOWN) {
          await notifyAboutRecommendation(
            'Высокая концентрация',
            `${symbol} составляет ${percentage.toFixed(1)}% портфеля. Рассмотрите диверсификацию для снижения рисков.`,
            'normal'
          );
          lastConcentrationNotifications.set(notificationKey, now);
        } else {

        }
      }
    }

    // Проверяем недостаточную диверсификацию
    const numAssets = Object.keys(holdings).length;
    if (numAssets < 3 && totalValue > 1000) {
      const notificationKey = `diversification_${numAssets}`;
      const lastNotificationTime = lastConcentrationNotifications.get(notificationKey);
      
      if (!lastNotificationTime || (now - lastNotificationTime) > NOTIFICATION_COOLDOWN) {
        await notifyAboutRecommendation(
          'Недостаточная диверсификация',
          `У вас только ${numAssets} актив(а) в портфеле. Рекомендуем добавить больше активов для снижения рисков.`,
          'normal'
        );
        lastConcentrationNotifications.set(notificationKey, now);
      } else {

      }
    }
  } catch (error) {

  }
}

/**
 * Инициализация интеграции - вызывается один раз при загрузке приложения
 */
export function initNotificationIntegrations() {

  
  // Очищаем старые данные
  processedNewsIds.clear();
  lastPriceCheck = {};
  lastPortfolioValue = null; // Сбрасываем для нового расчета
  
  // Экспортируем в глобальный scope для доступа из других модулей
  window.notificationIntegrations = {
    notifyAboutNews,
    notifyAboutPortfolioChange,
    notifyAboutPriceChange,
    notifyAboutRecommendation,
    checkPortfolioDiversification,
    // Тестовая функция для проверки создания уведомлений
    testNotification: async (type = 'portfolio') => {

      const testData = {
        'portfolio': {
          title: 'Тест: Портфель вырос',
          message: 'Тестовое уведомление - стоимость портфеля увеличилась',
          type: 'portfolio',
          priority: 'normal'
        },
        'news': {
          title: 'Тест: Новость',
          message: 'Тестовое уведомление - важная новость',
          type: 'news',
          priority: 'normal',
          related_symbol: 'BTC'
        },
        'price_alert': {
          title: 'Тест: Ценовой алерт',
          message: 'Тестовое уведомление - цена достигла цели',
          type: 'price_alert',
          priority: 'urgent',
          related_symbol: 'ETH'
        },
        'recommendation': {
          title: 'Тест: Рекомендация',
          message: 'Тестовое уведомление - совет по портфелю',
          type: 'recommendation',
          priority: 'normal'
        }
      };
      
      const data = testData[type] || testData['portfolio'];
      const result = await createNotification(data);
      
      if (result) {

      } else {

      }
      return result;
    }
  };
  

}

// Экспорт для использования в других модулях
export {
  createNotification
};
