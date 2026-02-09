// notification-integrations.js

import { supabase } from '../../core/profile.js';

let lastPortfolioValue = null;
let lastPortfolioData = null;
let processedNewsIds = new Set();
let lastPriceCheck = {};
const lastConcentrationNotifications = new Map();

async function createNotification({ title, message, type, priority = 'normal', related_symbol = null }) {
  try {
    console.log('createNotification called:', { title, message, type, priority });
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.warn('User not authorized');
      return null;
    }

    console.log('User:', user.id);

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recentNotifications } = await supabase
      .from('notifications')
      .select('id, title, message')
      .eq('user_id', user.id)
      .eq('title', title)
      .eq('message', message)
      .gte('created_at', fiveMinutesAgo)
      .limit(1);

    if (recentNotifications && recentNotifications.length > 0) {
      console.log('Skipping duplicate notification:', title);
      return null;
    }

    const { data: prefs, error: prefsError } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (prefsError && prefsError.code !== 'PGRST116') {
      console.warn('Error fetching preferences:', prefsError);
    }

    console.log('Notification preferences:', prefs);

    if (prefs && !prefs.enabled) {
      console.warn('Notifications disabled in settings');
      return null;
    }

    if (prefs) {
      if (type === 'price_alert' && !prefs.price_alerts_enabled) {
        console.warn('Price alerts disabled');
        return null;
      }
      if (type === 'portfolio' && !prefs.portfolio_alerts_enabled) {
        console.warn('Portfolio alerts disabled');
        return null;
      }
      if (type === 'news' && !prefs.news_alerts_enabled) {
        console.warn('News alerts disabled');
        return null;
      }
      if (type === 'recommendation' && !prefs.recommendation_alerts_enabled) {
        console.warn('Recommendation alerts disabled');
        return null;
      }
    }

    console.log('Creating notification in DB...');

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
      console.error('Ошибка создания уведомления:', error);
      return null;
    }

    console.log('Уведомление успешно создано:', data);
    return data;
  } catch (error) {
    console.error('Исключение при создании уведомления:', error);
    return null;
  }
}

/**
 * Уведомления о новостях
 */
export async function notifyAboutNews(news) {
  try {
    console.log('notifyAboutNews вызвана для новости:', news.title);
    
    // Проверяем, не обрабатывали ли мы эту новость
    const newsId = news.id || `${news.title}_${news.datetime || news.publishedAt}`;
    if (processedNewsIds.has(newsId)) {
      console.log('⏭️ Новость уже обработана, пропускаем');
      return;
    }
    
    // Загружаем активы пользователя из портфелей
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.warn('Пользователь не авторизован');
      return;
    }

    console.log('Пользователь авторизован:', user.id);

    const { data: portfolios } = await supabase
      .from('portfolios')
      .select('*')
      .eq('user_id', user.id);

    console.log('Портфели:', portfolios?.length || 0);

    if (!portfolios || portfolios.length === 0) {
      console.warn('Нет портфелей');
      return;
    }

    // Получаем все транзакции для поиска активов
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id);

    console.log('Транзакции:', transactions?.length || 0);

    if (!transactions || transactions.length === 0) {
      console.warn('Нет транзакций');
      return;
    }

    // Собираем все уникальные символы из транзакций
    const userSymbols = new Set(
      transactions.map(t => String(t.symbol || '').toUpperCase())
    );

    console.log('🪙 Активы пользователя:', Array.from(userSymbols));

    // Проверяем, связана ли новость с активами пользователя
    const newsText = `${news.title} ${news.summary || news.description || ''}`.toUpperCase();
    let relatedSymbol = null;
    
    for (const symbol of userSymbols) {
      if (newsText.includes(symbol)) {
        relatedSymbol = symbol;
        console.log('Найдено совпадение с активом:', symbol);
        break;
      }
    }

    // Если новость связана с активами пользователя, создаем уведомление
    if (relatedSymbol) {
      console.log('Создаем уведомление о новости...');
      
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
      console.log('⏭️ Новость не связана с активами пользователя');
    }
  } catch (error) {
    console.error('Ошибка при создании уведомления о новости:', error);
  }
}

/**
 * Уведомления об изменениях портфеля
 */
export async function notifyAboutPortfolioChange(currentValue, portfolioData) {
  try {
    console.log('notifyAboutPortfolioChange вызвана:', { currentValue, lastPortfolioValue });
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.warn('Пользователь не авторизован');
      return;
    }

    // Первый запуск - сохраняем начальное значение
    if (lastPortfolioValue === null) {
      lastPortfolioValue = currentValue;
      lastPortfolioData = portfolioData;
      console.log('Сохранено начальное значение портфеля:', currentValue);
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

    console.log('Порог срабатывания:', threshold + '%');

    // Если изменение превышает порог
    if (Math.abs(change) >= threshold) {
      const isPositive = change > 0;
      const verb = isPositive ? 'вырос' : 'упал';
      const priority = Math.abs(change) >= 15 ? 'high' : 'normal';

      console.log('Создаем уведомление об изменении портфеля...');

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
      console.log('Обновлено последнее значение портфеля');
    } else {
      console.log('⏭️ Изменение не достигло порога (' + Math.abs(change).toFixed(2) + '% < ' + threshold + '%)');
    }
  } catch (error) {
    console.error('Ошибка при создании уведомления об изменении портфеля:', error);
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
    console.error('Ошибка при создании уведомления об изменении цены:', error);
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
    console.error('Ошибка при создании уведомления о рекомендации:', error);
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
        // Проверяем, отправляли ли мы уже такое уведомление недавно
        const notificationKey = `concentration_${symbol}_${percentage.toFixed(1)}`;
        const lastNotificationTime = lastConcentrationNotifications.get(notificationKey);
        
        if (!lastNotificationTime || (now - lastNotificationTime) > NOTIFICATION_COOLDOWN) {
          await notifyAboutRecommendation(
            'Высокая концентрация',
            `${symbol} составляет ${percentage.toFixed(1)}% портфеля. Рассмотрите диверсификацию для снижения рисков.`,
            'normal'
          );
          lastConcentrationNotifications.set(notificationKey, now);
        } else {
          console.log(`⏭️ Пропускаем дубликат уведомления о концентрации ${symbol}`);
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
        console.log(`⏭️ Пропускаем дубликат уведомления о диверсификации`);
      }
    }
  } catch (error) {
    console.error('Ошибка при проверке диверсификации:', error);
  }
}

/**
 * Инициализация интеграции - вызывается один раз при загрузке приложения
 */
export function initNotificationIntegrations() {
  console.log('Инициализация интеграции уведомлений с приложением');
  
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
      console.log('🧪 Создаем тестовое уведомление типа:', type);
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
        console.log('Тестовое уведомление создано:', result);
      } else {
        console.error('Не удалось создать тестовое уведомление');
      }
      return result;
    }
  };
  
  console.log('Интеграция уведомлений готова');
  console.log('📋 Доступные функции:', Object.keys(window.notificationIntegrations));
  console.log('');
  console.log('Для тестирования выполните в консоли:');
  console.log('   await window.notificationIntegrations.testNotification("portfolio")');
  console.log('   await window.notificationIntegrations.testNotification("news")');
}

// Экспорт для использования в других модулях
export {
  createNotification
};
