let isPersonalized = false;
let sentimentFilter = null;
let originalNews = null;

const initNewsPersonalization = () => {
  const personalizeBtn = document.getElementById('personalizeNewsBtn');
  const sentimentBtn = document.getElementById('sentimentFilterBtn');
  const personalizedBadge = document.getElementById('personalizedBadge');
  
  if (personalizeBtn) {
    personalizeBtn.addEventListener('click', togglePersonalization);
  }
  
  if (sentimentBtn) {
    sentimentBtn.addEventListener('click', toggleSentimentFilter);
  }
  
  console.log('[NewsPersonalization] Initialized');
};

const togglePersonalization = async () => {
  const btn = document.getElementById('personalizeNewsBtn');
  const badge = document.getElementById('personalizedBadge');
  
  isPersonalized = !isPersonalized;
  
  if (isPersonalized) {
    btn.classList.add('active');
    btn.innerHTML = '<i class="bi bi-person-check-fill"></i> Мои активы';
    btn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    btn.style.color = 'white';
    if (badge) badge.style.display = 'flex';
  } else {
    btn.classList.remove('active');
    btn.innerHTML = '<i class="bi bi-person-check"></i> Мои активы';
    btn.style.background = '';
    btn.style.color = '';
    if (badge) badge.style.display = 'none';
  }
  
  await applyFilters();
};

const toggleSentimentFilter = async () => {
  const btn = document.getElementById('sentimentFilterBtn');
  
  if (sentimentFilter === null) {
    sentimentFilter = 'positive';
    btn.innerHTML = '<i class="bi bi-emoji-smile-fill"></i> Позитивные';
    btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    btn.style.color = 'white';
  } else if (sentimentFilter === 'positive') {
    sentimentFilter = 'negative';
    btn.innerHTML = '<i class="bi bi-emoji-frown-fill"></i> Негативные';
    btn.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
    btn.style.color = 'white';
  } else if (sentimentFilter === 'negative') {
    sentimentFilter = 'neutral';
    btn.innerHTML = '<i class="bi bi-emoji-neutral-fill"></i> Нейтральные';
    btn.style.background = 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)';
    btn.style.color = 'white';
  } else {
    sentimentFilter = null;
    btn.innerHTML = '<i class="bi bi-emoji-smile"></i> Тональность';
    btn.style.background = '';
    btn.style.color = '';
  }
  
  await applyFilters();
};

const applyFilters = async () => {
  try {
    if (!window.newsCache || !window.newsCache.data) {
      console.warn('[NewsPersonalization] No data for filtering');
      return;
    }
    
    let filteredNews = [...window.newsCache.data];
    
    // Применяем персонализацию по активам
    if (isPersonalized && window.newsSentiment) {
      const { filterNewsByUserAssets } = window.newsSentiment;
      const personalizedNews = await filterNewsByUserAssets(filteredNews);
      
      // ВАЖНО: Помечаем персонализированные новости специальным флагом
      // чтобы показать их первыми
      const markedPersonalized = personalizedNews.map(item => ({
        ...item,
        _isPersonalized: true,
        _personalizedScore: 100 // Высокий приоритет
      }));
      
      // Помечаем непрошедшие фильтрацию как обычные
      const nonPersonalizedSymbols = new Set(personalizedNews.map(n => n.link));
      const markedOthers = filteredNews
        .filter(item => !nonPersonalizedSymbols.has(item.link))
        .map(item => ({
          ...item,
          _isPersonalized: false,
          _personalizedScore: 0
        }));
      
      // Сортируем: сначала персонализированные, потом остальные
      filteredNews = [...markedPersonalized, ...markedOthers];
      
      console.log(`[NewsPersonalization] Персонализация: ${personalizedNews.length} персонализированных + ${markedOthers.length} остальных = ${filteredNews.length} новостей`);
    }
    
    // Применяем фильтр по sentiment
    if (sentimentFilter && window.newsSentiment) {
      // Добавляем sentiment если его нет
      filteredNews = filteredNews.map(item => {
        if (!item.sentiment) {
          const text = `${item.title} ${item.description}`;
          const sentiment = window.newsSentiment.analyzeSentiment(text);
          return {
            ...item,
            sentiment: sentiment.sentiment,
            sentimentScore: sentiment.score,
            sentimentConfidence: sentiment.confidence
          };
        }
        return item;
      });
      
      // Фильтруем по выбранному sentiment
      filteredNews = filteredNews.filter(item => item.sentiment === sentimentFilter);
      console.log(`[NewsPersonalization] Фильтр по ${sentimentFilter}: ${filteredNews.length} новостей`);
    }
    
    // Обновляем счетчик и показываем информацию о фильтрации
    const newsCount = document.getElementById('newsCount');
    if (newsCount) {
      newsCount.textContent = filteredNews.length;
    }
    
    // Показываем сколько новостей отфильтровано
    const originalCount = window.newsCache.data.length;
    if (originalCount > filteredNews.length) {
      console.log(`[NewsPersonalization] Отфильтровано: ${filteredNews.length} из ${originalCount} новостей (скрыто ${originalCount - filteredNews.length})`);
    }
    
    // Перерисовываем новости (skipCategoryFilter=true чтобы не перефильтровывать)
    const currentCategory = document.querySelector('.category-btn.active')?.dataset.category || 'all';
    if (window.renderNews) {
      window.renderNews(filteredNews, currentCategory, true);
    }
    
  } catch (error) {
    console.error('[NewsPersonalization] Ошибка применения фильтров:', error);
  }
}

/**
 * Сброс всех фильтров
 */
const resetFilters = () => {
  isPersonalized = false;
  sentimentFilter = null;
  
  const personalizeBtn = document.getElementById('personalizeNewsBtn');
  const sentimentBtn = document.getElementById('sentimentFilterBtn');
  const badge = document.getElementById('personalizedBadge');
  
  if (personalizeBtn) {
    personalizeBtn.classList.remove('active');
    personalizeBtn.innerHTML = '<i class="bi bi-person-check"></i> Мои активы';
    personalizeBtn.style.background = '';
    personalizeBtn.style.color = '';
  }
  
  if (sentimentBtn) {
    sentimentBtn.innerHTML = '<i class="bi bi-emoji-smile"></i> Тональность';
    sentimentBtn.style.background = '';
    sentimentBtn.style.color = '';
  }
  
  if (badge) badge.style.display = 'none';
}

// Экспортируем для использования
window.newsPersonalization = {
  initNewsPersonalization,
  resetFilters,
  applyFilters,
  getState: () => ({ isPersonalized, sentimentFilter })
};

// Автоинициализация
document.addEventListener('DOMContentLoaded', () => {
  initNewsPersonalization();
});
