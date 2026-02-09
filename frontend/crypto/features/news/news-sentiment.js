const SENTIMENT_KEYWORDS = {
  positive: [
    'bull', 'bullish', 'rally', 'surge', 'soar', 'jump', 'spike', 'climb', 'rise', 'gain',
    'бычий', 'рост', 'взлет', 'скачок', 'подъем', 'прирост',
    'breakthrough', 'success', 'profit', 'win', 'boom', 'hit high', 'record', 'all-time high', 'ath',
    'прорыв', 'успех', 'прибыль', 'рекорд', 'максимум', 'исторический максимум',
    'buy', 'invest', 'opportunity', 'strong', 'positive', 'optimistic', 'upgrade', 'outperform',
    'покупка', 'инвестиции', 'возможность', 'сильный', 'позитивный', 'оптимистичный', 'апгрейд',
    'approve', 'adoption', 'partnership', 'launch', 'announce', 'expand', 'growth',
    'одобрение', 'внедрение', 'партнерство', 'запуск', 'объявление', 'расширение',
    'profit', 'revenue', 'earnings beat', 'exceed', 'above expectations',
    'доход', 'прибыль', 'превышение', 'выше ожиданий'
  ],
  
  negative: [
    'bear', 'bearish', 'crash', 'plunge', 'drop', 'fall', 'decline', 'slump', 'sink', 'loss',
    'медвежий', 'крах', 'падение', 'обвал', 'снижение', 'просадка', 'убыток',
    'crisis', 'collapse', 'fail', 'bankrupt', 'scam', 'fraud', 'hack', 'breach', 'vulnerability',
    'кризис', 'коллапс', 'банкротство', 'мошенничество', 'взлом', 'уязвимость',
    'sell', 'dump', 'liquidate', 'panic', 'fear', 'risk', 'warning', 'alert', 'concern',
    'продажа', 'сброс', 'ликвидация', 'паника', 'страх', 'риск', 'предупреждение', 'опасность',
    'ban', 'restrict', 'regulate', 'lawsuit', 'investigation', 'sue', 'penalty', 'fine',
    'запрет', 'ограничение', 'регулирование', 'иск', 'расследование', 'штраф',
    'miss', 'below expectations', 'disappointing', 'weak', 'poor', 'downgrade',
    'промах', 'ниже ожиданий', 'разочарование', 'слабый', 'понижение рейтинга'
  ],
  
  neutral: [
    'stable', 'unchanged', 'flat', 'consolidate', 'sideways', 'range',
    'стабильно', 'без изменений', 'консолидация', 'боковой тренд'
  ]
};


const analyzeSentiment = (text) => {
  if (!text) {
    return { sentiment: 'neutral', score: 0, confidence: 0 };
  }
  
  const lowerText = text.toLowerCase();
  
  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;
  
  SENTIMENT_KEYWORDS.positive.forEach(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    const matches = lowerText.match(regex);
    if (matches) {
      positiveCount += matches.length;
    }
  });
  
  SENTIMENT_KEYWORDS.negative.forEach(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    const matches = lowerText.match(regex);
    if (matches) {
      negativeCount += matches.length;
    }
  });
  
  SENTIMENT_KEYWORDS.neutral.forEach(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    const matches = lowerText.match(regex);
    if (matches) {
      neutralCount += matches.length;
    }
  });
  
  const totalCount = positiveCount + negativeCount + neutralCount;
  
  if (totalCount === 0) {
    return { sentiment: 'neutral', score: 0, confidence: 0 };
  }
  
  const score = (positiveCount - negativeCount) / totalCount;
  
  // Уверенность в оценке (0-1)
  const confidence = Math.min(totalCount / 5, 1); // Максимум 5 ключевых слов для 100% уверенности
  
  let sentiment;
  if (score > 0.2) {
    sentiment = 'positive';
  } else if (score < -0.2) {
    sentiment = 'negative';
  } else {
    sentiment = 'neutral';
  }
  
  return {
    sentiment,
    score: Math.round(score * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
    keywords: {
      positive: positiveCount,
      negative: negativeCount,
      neutral: neutralCount
    }
  };
}

/**
 * Получает иконку и цвет для тональности
 */
const getSentimentBadge = (sentiment) => {
  const badges = {
    positive: {
      icon: 'bi-arrow-up-circle-fill',
      color: '#10b981',
      bgColor: 'rgba(16, 185, 129, 0.1)',
      label: 'Позитивная',
      emoji: ''
    },
    negative: {
      icon: 'bi-arrow-down-circle-fill',
      color: '#ef4444',
      bgColor: 'rgba(239, 68, 68, 0.1)',
      label: 'Негативная',
      emoji: ''
    },
    neutral: {
      icon: 'bi-dash-circle-fill',
      color: '#6b7280',
      bgColor: 'rgba(107, 114, 128, 0.1)',
      label: 'Нейтральная',
      emoji: '➖'
    }
  };
  
  return badges[sentiment] || badges.neutral;
};

const extractAssetMentions = (text) => {
  if (!text) return [];
  
  const mentions = new Set();
  const upperText = text.toUpperCase();
  
  // Получаем ВСЕ доступные криптовалюты из глобальной конфигурации
  let allCryptos = ['BTC', 'ETH', 'USDT', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'AVAX', 'MATIC', 'DOT', 'SHIB', 'TRX', 'LINK', 'UNI', 'ATOM', 'LTC', 'ETC', 'XLM', 'ALGO'];
  
  // Добавляем все криптовалюты из CRYPTO_INFO если доступен
  if (window.CRYPTO_INFO && typeof window.CRYPTO_INFO === 'object') {
    const cryptoSymbols = Object.keys(window.CRYPTO_INFO);
    allCryptos = [...new Set([...allCryptos, ...cryptoSymbols])];
  }
  
  // Популярные акции
  const stocks = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'AMD', 'NFLX', 'DIS', 'COIN', 'PYPL', 'SQ', 'SHOP', 'UBER'];
  
  // Добавляем все акции из STOCK_INFO если доступен
  if (window.STOCK_INFO && typeof window.STOCK_INFO === 'object') {
    const stockSymbols = Object.keys(window.STOCK_INFO);
    stocks.push(...stockSymbols);
  }
  
  // Также ищем полные названия
  const fullNames = {
    'BITCOIN': 'BTC',
    'БИТКОИН': 'BTC',
    'БИТКОЙН': 'BTC',
    'ETHEREUM': 'ETH',
    'ЭФИРИУМ': 'ETH',
    'ЭФИР': 'ETH',
    'RIPPLE': 'XRP',
    'CARDANO': 'ADA',
    'DOGECOIN': 'DOGE',
    'DOGE': 'DOGE',
    'SOLANA': 'SOL',
    'POLKADOT': 'DOT',
    'POLYGON': 'MATIC',
    'AVALANCHE': 'AVAX',
    'CHAINLINK': 'LINK',
    'UNISWAP': 'UNI',
    'LITECOIN': 'LTC',
    'STELLAR': 'XLM',
    'APPLE': 'AAPL',
    'MICROSOFT': 'MSFT',
    'GOOGLE': 'GOOGL',
    'AMAZON': 'AMZN',
    'TESLA': 'TSLA',
    'NVIDIA': 'NVDA',
    'FACEBOOK': 'META',
    'COINBASE': 'COIN',
    'NETFLIX': 'NFLX',
    'DISNEY': 'DIS',
    'PAYPAL': 'PYPL',
    'SQUARE': 'SQ',
    'SHOPIFY': 'SHOP',
    'UBER': 'UBER'
  };
  
  // Проверяем тикеры (с границами слова для точности)
  [...allCryptos, ...stocks].forEach(symbol => {
    const regex = new RegExp(`\\b${symbol}\\b`, 'g');
    if (regex.test(upperText)) {
      mentions.add(symbol);
    }
  });
  
  // Проверяем полные названия
  Object.entries(fullNames).forEach(([name, symbol]) => {
    if (upperText.includes(name)) {
      mentions.add(symbol);
    }
  });
  
  return Array.from(mentions);
};

const filterNewsByUserAssets = async (news) => {
  try {
    const { getFavorites } = await import('../../core/data.js');
    const favorites = await getFavorites() || [];
    
    if (favorites.length === 0) {
      console.log('[filterNewsByUserAssets] Нет избранных активов - показываем все новости');
      return news; // Если нет избранного, показываем все новости
    }
    
    const userSymbols = favorites.map(f => String(f.symbol || '').toUpperCase());
    console.log('[filterNewsByUserAssets] Избранные активы пользователя:', userSymbols);
    
    // Фильтруем новости, которые упоминают активы пользователя
    const filtered = news.filter(item => {
      const text = `${item.title} ${item.description}`.toUpperCase();
      const mentions = extractAssetMentions(text);
      
      // Если новость упоминает хотя бы один актив пользователя
      const hasUserAsset = mentions.some(symbol => userSymbols.includes(symbol));
      
      // Дополнительная проверка: ищем символы напрямую в тексте (fallback)
      // Это поможет найти новости даже если extractAssetMentions их пропустил
      let hasDirectMention = false;
      if (!hasUserAsset) {
        hasDirectMention = userSymbols.some(symbol => {
          // Проверяем наличие символа в тексте (с границами слова)
          const regex = new RegExp(`\\b${symbol}\\b`, 'i');
          return regex.test(text);
        });
      }
      
      if (hasUserAsset || hasDirectMention) {
        // Добавляем информацию о том, какие активы упоминаются
        const relevantMentions = hasUserAsset 
          ? mentions.filter(symbol => userSymbols.includes(symbol))
          : userSymbols.filter(symbol => new RegExp(`\\b${symbol}\\b`, 'i').test(text));
        
        item.mentionedAssets = relevantMentions;
        
        console.log(`[filterNewsByUserAssets] Новость релевантна: "${item.title.substring(0, 50)}..." упоминает [${relevantMentions.join(', ')}]`);
      }
      
      return hasUserAsset || hasDirectMention;
    });
    
    console.log(`[filterNewsByUserAssets] Результат: ${filtered.length} из ${news.length} новостей релевантны портфелю (${userSymbols.join(', ')})`);
    
    if (filtered.length === 0) {
      console.warn('[filterNewsByUserAssets] Не найдено новостей по активам пользователя. Возможно новости не содержат упоминаний этих символов.');
    }
    
    return filtered;
  } catch (error) {
    console.error('[filterNewsByUserAssets] Ошибка фильтрации:', error);
    return news;
  }
};

export const enrichNewsWithSentiment = (news) => {
  return news.map(item => {
    const text = `${item.title} ${item.description}`;
    const sentiment = analyzeSentiment(text);
    const mentions = extractAssetMentions(text);
    
    return {
      ...item,
      sentiment: sentiment.sentiment,
      sentimentScore: sentiment.score,
      sentimentConfidence: sentiment.confidence,
      mentionedAssets: mentions
    };
  });
}

// Экспортируем для использования в других модулях
window.newsSentiment = {
  analyzeSentiment,
  getSentimentBadge,
  extractAssetMentions,
  filterNewsByUserAssets,
  enrichNewsWithSentiment
};
