(function() {
  'use strict';
  
  // КРИТИЧЕСКИ ВАЖНО: Добавляем CSS ДО загрузки Google Translate
  const hideStyle = document.createElement('style');
  hideStyle.id = 'google-translate-killer';
  hideStyle.textContent = `
    /* МАКСИМАЛЬНО АГРЕССИВНОЕ СКРЫТИЕ ВСЕХ ЭЛЕМЕНТОВ GOOGLE TRANSLATE */
    /* Скрываем все возможные варианты селекторов */
    .goog-te-banner-frame,
    iframe.goog-te-banner-frame,
    .skiptranslate:not(select):not(:has(select)),
    body > .skiptranslate:not(:has(select)),
    div.skiptranslate:not(:has(select)),
    span.skiptranslate:not(:has(select)),
    #google_translate_element .skiptranslate:not(select),
    .goog-te-gadget,
    .goog-te-gadget-simple,
    .goog-logo-link,
    .goog-te-gadget-icon,
    .goog-te-spinner-pos,
    .goog-te-ftab,
    .VIpgJd-ZVi9od-ORHb-OEVmcd,
    .VIpgJd-ZVi9od-xl07Ob-lTBxed,
    iframe[id^="goog-gt"]:not([id*="element"]),
    iframe.goog-te-menu-frame,
    iframe.goog-te-menu2-frame,
    iframe.goog-te-balloon-frame,
    #goog-gt-tt,
    img[src*="cleardot.gif"],
    img[src*="te_ctrl"],
    img[src*="translate.google"],
    a[href*="translate.google.com"],
    div[style*="color: rgb(155, 185, 210)"],
    div[style*="color: rgb(204, 204, 204)"],
    div[style*="background-color: rgba(0, 0, 0, 0.2)"],
    div[id^="goog-gt-"],
    font[color="#FFFFFF"],
    font[color="white"] {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      position: fixed !important;
      left: -999999px !important;
      top: -999999px !important;
      width: 0px !important;
      height: 0px !important;
      max-width: 0px !important;
      max-height: 0px !important;
      pointer-events: none !important;
      z-index: -999999999 !important;
      overflow: hidden !important;
      clip: rect(0,0,0,0) !important;
      clip-path: inset(100%) !important;
      transform: scale(0) !important;
    }
    
    /* Скрываем контейнер элемента */
    #google_translate_element {
      display: none !important;
      position: fixed !important;
      left: -999999px !important;
      top: -999999px !important;
    }
    
    /* Убираем отступ от body */
    body {
      top: 0px !important;
      margin-top: 0px !important;
      padding-top: 0px !important;
    }
    
    /* Специально для верхней панели Google */
    body > div:first-child.skiptranslate,
    body > :first-child:not(#app):not(main):not(header):not(nav):not(.container) {
      display: none !important;
      height: 0 !important;
    }
  `;
  
  // Добавляем стили НЕМЕДЛЕННО
  if (document.head) {
    document.head.insertBefore(hideStyle, document.head.firstChild);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      document.head.insertBefore(hideStyle, document.head.firstChild);
    });
  }
  
  // MutationObserver только для применения CSS к новым элементам (БЕЗ удаления)
  const styleObserver = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === 1) { // Element node
          const el = node;
          const classList = el.classList ? Array.from(el.classList) : [];
          const id = el.id || '';
          const tagName = el.tagName ? el.tagName.toLowerCase() : '';
          
          // Применяем стили скрытия к элементам Google (НО НЕ удаляем!)
          const isGoogleElement = 
            classList.some(c => c.startsWith('goog-te') || c.includes('skiptranslate') || c.includes('VIpgJd')) ||
            (id.startsWith('goog-gt') && id !== 'google_translate_element') ||
            (tagName === 'iframe' && el.src && el.src.includes('translate.google') && !el.src.includes('translate_a/element'));
          
          // Проверяем, это НЕ функциональный элемент
          const hasSelect = el.tagName === 'SELECT' || el.querySelector('select');
          const isFunctionalContainer = id === 'google_translate_element';
          
          if (isGoogleElement && !hasSelect && !isFunctionalContainer) {
            // ТОЛЬКО скрываем через inline styles, НЕ удаляем
            el.style.cssText = 'display:none!important;visibility:hidden!important;opacity:0!important;position:fixed!important;left:-99999px!important;top:-99999px!important;width:0!important;height:0!important;pointer-events:none!important;z-index:-999999!important;';
          }
        }
      });
    });
  });
  
  // Запускаем observer после загрузки
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (document.body) {
        styleObserver.observe(document.body, {
          childList: true,
          subtree: true
        });
      }
    });
  } else {
    if (document.body) {
      styleObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }
  
  function loadGoogleTranslate() {
    // Создаем скрытый контейнер
    let container = document.querySelector('#google_translate_element');
    
    if (!container) {
      container = document.createElement('div');
      container.id = 'google_translate_element';
      container.style.cssText = 'display:none!important;visibility:hidden!important;position:absolute!important;left:-99999px!important;';
      document.body.appendChild(container);
    }
    
    if (typeof google !== 'undefined' && google.translate) {
      window.googleTranslateElementInit();
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    script.async = true;
    document.body.appendChild(script);
  }
  
  window.googleTranslateElementInit = function() {

    
    if (typeof google === 'undefined' || !google.translate) {


      return;
    }
    

    
    try {
      const container = document.querySelector('#google_translate_element');
      if (!container) {

        return;
      }
      
      const element = new google.translate.TranslateElement({
        pageLanguage: 'ru',
        includedLanguages: 'en,ru,es,zh-CN,de,fr,it,ja,ar,pt,ko,tr,hi,pl,uk,vi',
        layout: google.translate.TranslateElement.InlineLayout.VERTICAL,
        multilanguagePage: true,
        autoDisplay: false
      }, 'google_translate_element');
      
      let checkCount = 0;
      const checkWidget = setInterval(() => {
        checkCount++;
        
        const select1 = document.querySelector('.goog-te-combo');
        const select2 = document.querySelector('select.goog-te-combo');
        const select3 = container.querySelector('select');
        const link = document.querySelector('.VIpgJd-ZVi9od-xl07Ob-lTBxed');
        const allSelects = document.querySelectorAll('select');
        
        const foundSelect = select1 || select2 || select3;
        
        if (foundSelect) {
          clearInterval(checkWidget);
          window.googleTranslateSelect = foundSelect;
          
          // Восстанавливаем язык
          const savedLanguage = localStorage.getItem('app_language');
          if (savedLanguage && savedLanguage !== 'ru') {
            setTimeout(() => {
              window.changeLanguageGoogle(savedLanguage);
            }, 500);
          }
        } else if (link && checkCount === 10) {
          // Если через 1 секунду нашлась только ссылка - используем Cookie метод
          clearInterval(checkWidget);
          window.googleTranslateCookieMethod = true;
          const savedLanguage = localStorage.getItem('app_language');
          if (savedLanguage && savedLanguage !== 'ru') {
            setTimeout(() => {
              window.changeLanguageGoogle(savedLanguage);
            }, 500);
          }
        } else if (checkCount > 150) {
          // Таймаут после 15 секунд
          clearInterval(checkWidget);
          window.googleTranslateCookieMethod = true;
        }
      }, 100);
      
      // Скрываем все элементы Google UI после инициализации
      setTimeout(() => {
        hideGoogleElements();
      }, 1000);
      
    } catch (error) {

    }
  };
  
  // Функция для СКРЫТИЯ (не удаления) UI элементов Google через CSS
  function hideGoogleElements() {
    // Скрываем контейнер но НЕ удаляем (нужен для работы)
    const container = document.querySelector('#google_translate_element');
    if (container) {
      container.style.cssText = 'display:none!important;position:fixed!important;left:-99999px!important;top:-99999px!important;';
    }
    
    // Убираем отступ body
    if (document.body) {
      document.body.style.top = '0';
      document.body.style.marginTop = '0';
      document.body.style.paddingTop = '0';
    }
    if (document.documentElement) {
      document.documentElement.style.marginTop = '0';
      document.documentElement.style.paddingTop = '0';
    }
  }
  
  // Вызываем один раз при загрузке и при событиях навигации
  hideGoogleElements();
  
  // Скрываем при навигации (не слишком часто)
  window.addEventListener('hashchange', hideGoogleElements);
  
  // Функция смены языка
  window.changeLanguageGoogle = function(langCode, retryCount = 0) {
    const maxRetries = 20;
    const retryDelay = 500;
    
    // Маппинг кодов языков
    const langMap = {
      'en': 'en', 'ru': 'ru', 'es': 'es', 'zh': 'zh-CN',
      'de': 'de', 'fr': 'fr', 'it': 'it', 'ja': 'ja'
    };
    
    const googleLang = langMap[langCode] || langCode;
    
    // Метод 1: Использование select элемента (старый виджет)
    const select = window.googleTranslateSelect || 
                   document.querySelector('.goog-te-combo') || 
                   document.querySelector('select.goog-te-combo');
    
    if (select && select.options.length > 1) {

      select.value = googleLang;
      const event = new Event('change', { bubbles: true, cancelable: true });
      select.dispatchEvent(event);
      if (typeof select.onchange === 'function') {
        select.onchange(event);
      }
      
      localStorage.setItem('app_language', langCode);

      
      showLanguageNotification(langCode);
      return;
    }
    
    // Метод 2: Использование Cookie (новый виджет с ссылкой)
    if (window.googleTranslateCookieMethod || retryCount > 10) {

      
      // Удаляем старые cookies
      document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=' + window.location.hostname;
      
      if (langCode === 'ru') {
        // Возврат к русскому - просто перезагружаем
        localStorage.setItem('app_language', 'ru');

        showLanguageNotification('ru');
        setTimeout(() => location.reload(), 500);
      } else {
        // Устанавливаем cookie для перевода: /исходный/целевой
        const cookieValue = `/ru/${googleLang}`;
        document.cookie = `googtrans=${cookieValue}; path=/;`;
        document.cookie = `googtrans=${cookieValue}; path=/; domain=${window.location.hostname}`;
        
        localStorage.setItem('app_language', langCode);

        showLanguageNotification(langCode);
        
        // Перезагружаем страницу для применения перевода
        setTimeout(() => location.reload(), 500);
      }
      return;
    }
    
    // Retry если виджет еще не готов
    if (retryCount < maxRetries) {
      if (retryCount === 0) {

      }
      setTimeout(() => {
        window.changeLanguageGoogle(langCode, retryCount + 1);
      }, retryDelay);
    } else {

      window.googleTranslateCookieMethod = true;
      window.changeLanguageGoogle(langCode, 0);
    }
  };
  
  // Вспомогательная функция для уведомлений
  function showLanguageNotification(langCode) {
    if (window.showNotification) {
      const langNames = {
        'en': 'English', 'ru': 'Русский', 'es': 'Español', 'zh': '中文',
        'de': 'Deutsch', 'fr': 'Français', 'it': 'Italiano', 'ja': '日本語'
      };
      setTimeout(() => {
        window.showNotification('Language: ' + langNames[langCode], 'success');
      }, 300);
    }
  }
  
  // Функция для добавления класса notranslate к элементам с валютами и тикерами
  function markNoTranslateElements() {
    try {
      // ================================================================
      // ПРАВИЛО: переводим ЛЕЙБЛЫ, НЕ переводим ДАННЫЕ.
      //
      // ЧТО НЕ ПЕРЕВОДИТЬ (notranslate):
      //   - Цены, суммы, проценты ($8.1K, +5.0%, ₽611 933)
      //   - Тикеры крипто/акций (BTC, ETH, AAPL, TSLA)
      //   - Имя пользователя (userName — это имя, не слово интерфейса)
      //   - Числовые счётчики (portfolioCount, cryptoCount и т.д.)
      //   - Данные графиков (SVG, canvas — их портит перевод)
      //   - Торговые пары (BTC/USDT)
      //
      // ЧТО ПЕРЕВОДИТЬ:
      //   - Лейблы навигации ("Дашборд", "Аналитика", "Настройки")
      //   - Лейблы секций ("Общая стоимость", "Доходность", "Акции")
      //   - Кнопки действий ("Добавить", "Сохранить", "Удалить")
      //   - Сообщения об ошибках и уведомления
      //   - Подсказки и описания
      // ================================================================

      // 1. Точечные ID-селекторы — финансовые данные дашборда
      const dataIds = [
        'totalValue', 'totalChange', 'miniChartBadge', 'miniLow', 'miniHigh',
        'miniChart', 'portfolioCount', 'totalReturn', 'cryptoCount', 'stocksCount',
        'userName',
        'totalVolume', 'totalInvested', 'totalReceived',
        'totalBuys', 'totalSells', 'totalTransactions',
        'analyticsTotalValue', 'analyticsPnL', 'analyticsROI',
        'analyticsAssets', 'analyticsSharpe', 'analyticsDiversification',
        'favTotalValue'
      ];
      dataIds.forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.classList.contains('notranslate')) {
          el.classList.add('notranslate');
          el.setAttribute('translate', 'no');
        }
      });

      // 2. Точечные селекторы по классам для динамических карточек криптовалют/акций
      //    Берём только контейнеры с ДАННЫМИ (цена, изменение, тикер),
      //    а не родительские блоки, которые содержат переводимые лейблы.
      const dataClassSelectors = [
        // Тикеры и символы
        '.crypto-symbol', '.stock-symbol', '.asset-symbol',
        '.coin-symbol', '.ticker-symbol', '.fav-symbol',
        // Цены
        '.crypto-price', '.stock-price', '.asset-price',
        '.current-price', '.price-value', '.coin-price',
        '.fav-price', '.fav-change',
        // Проценты изменения
        '.price-change', '.change-percent', '.crypto-change',
        '.stock-change', '.asset-change',
        // Общие числовые значения в карточках транзакций/позиций
        '.tx-amount', '.tx-price', '.position-value',
        '.holding-value', '.holding-amount', '.pnl-value',
        // Статусы ордеров (buy/sell — не переводить, это термины)
        '.order-type', '.trade-type', '.tx-type'
      ];
      dataClassSelectors.forEach(selector => {
        try {
          document.querySelectorAll(selector).forEach(el => {
            if (!el.classList.contains('notranslate')) {
              el.classList.add('notranslate');
              el.setAttribute('translate', 'no');
            }
          });
        } catch (e) {}
      });

      // 3. Тексты — тикеры (2-6 заглавных) и финансовые числа
      //    Обрабатываем только листовые текстовые узлы чтобы не заблокировать
      //    родителей с переводимыми лейблами
      document.querySelectorAll('span, div, td, th, strong, b').forEach(el => {
        if (el.classList.contains('notranslate')) return;
        // Пропускаем если у элемента больше 0 дочерних узлов-элементов
        // (сложный контейнер — не трогаем, чтобы не заблокировать лейблы)
        if (el.children.length > 0) return;

        const text = el.textContent.trim();
        if (!text) return;

        // Символы валюты (одиночные): $, €, ₽, £, ¥
        if (/^[$€£¥₽₴₸₩₪₹฿]$/.test(text)) {
          el.classList.add('notranslate');
          el.setAttribute('translate', 'no');
          return;
        }

        // Финансовые числа: $1,234 | ₽611 933 | +5.0% | -2.3K
        if (/^[+\-]?[$€£¥₽₴₸₩₪₹฿]?\s*[\d\s,\.]+[KMBkмб%]?$/.test(text) &&
            /\d/.test(text)) {
          el.classList.add('notranslate');
          el.setAttribute('translate', 'no');
          return;
        }

        // Тикеры: 2-6 заглавных латинских + цифр, без пробелов
        if (/^[A-Z][A-Z0-9]{1,5}$/.test(text)) {
          const skipWords = new Set([
            'OK','IS','IN','ON','TO','DO','GO','UP','AT','BY','IF',
            'OR','NO','YES','NEW','OLD','ALL','ANY','SET','GET','API',
            'ID','TV','UI','UX','PC','iOS','NaN','INF'
          ]);
          if (!skipWords.has(text)) {
            el.classList.add('notranslate');
            el.setAttribute('translate', 'no');
          }
          return;
        }

        // Торговые пары: BTC/USDT, AAPL/USD
        if (/^[A-Z]{2,6}\/[A-Z]{2,6}$/.test(text)) {
          el.classList.add('notranslate');
          el.setAttribute('translate', 'no');
        }
      });

      // 4. Защищаем placeholder у input-полей с translate="no" от перезаписи GT
      //    Google Translate может изменить placeholder даже у input.notranslate,
      //    поэтому запоминаем оригинальное значение и восстанавливаем его.
      document.querySelectorAll('input[translate="no"]').forEach(input => {
        const orig = input.getAttribute('placeholder');
        if (!orig) return;
        if (!input.dataset.placeholderOrig) {
          input.dataset.placeholderOrig = orig;
        }
        // Восстанавливаем если GT успел перезаписать
        if (input.placeholder !== input.dataset.placeholderOrig) {
          input.placeholder = input.dataset.placeholderOrig;
        }
      });

    } catch (e) {

    }
  }
  
  // Запускаем при загрузке
  function initNoTranslate() {
    // Запускаем СРАЗУ, не дожидаясь

    markNoTranslateElements();
    
    // Повторяем через короткие интервалы в начале
    setTimeout(markNoTranslateElements, 100);
    setTimeout(markNoTranslateElements, 300);
    setTimeout(markNoTranslateElements, 500);
    setTimeout(markNoTranslateElements, 1000);
    setTimeout(markNoTranslateElements, 2000);
    
    // Отслеживаем добавление новых элементов (но не слишком часто)
    let updateTimeout = null;
    const observer = new MutationObserver((mutations) => {
      if (updateTimeout) return; // Уже запланировано
      
      let hasNewElements = false;
      for (let mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          hasNewElements = true;
          break;
        }
      }
      
      if (hasNewElements) {
        updateTimeout = setTimeout(() => {
          markNoTranslateElements();
          updateTimeout = null;
        }, 0); // Мгновенно, до того как GT успеет перевести
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  // Экспортируем функцию глобально для использования в других модулях
  window.markNoTranslateElements = markNoTranslateElements;
  
  // Загружаем при старте
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      loadGoogleTranslate();
      initNoTranslate();
      // Скрываем контейнер Google после загрузки
      setTimeout(hideGoogleElements, 1000);
    });
  } else {
    loadGoogleTranslate();
    initNoTranslate();
    // Скрываем контейнер Google после загрузки
    setTimeout(hideGoogleElements, 1000);
  }
  
})();
