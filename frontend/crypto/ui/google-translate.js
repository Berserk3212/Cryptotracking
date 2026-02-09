(function() {
  'use strict';
  
  function loadGoogleTranslate() {
    const container = document.createElement('div');
    container.id = 'google_translate_element';
    container.style.display = 'none';
    document.body.appendChild(container);
    
    if (typeof google !== 'undefined' && google.translate) {
      console.log('Google Translate already loaded, initializing...');
      window.googleTranslateElementInit();
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    script.async = true;
    script.onload = function() {
      console.log('Google Translate script loaded successfully');
    };
    script.onerror = function() {
      console.error('Failed to load Google Translate script - may be blocked by adblocker or firewall');
    };
    document.body.appendChild(script);
    
    console.log('Loading Google Translate...');
  }
  
  window.googleTranslateElementInit = function() {
    console.log('googleTranslateElementInit called');
    
    if (typeof google === 'undefined' || !google.translate) {
      console.error('Google Translate API not available');
      console.log('Check: typeof google =', typeof google);
      return;
    }
    
    console.log('Google Translate API available');
    
    try {
      const container = document.querySelector('#google_translate_element');
      if (!container) {
        console.error('Container #google_translate_element not found');
        return;
      }
      console.log('Container found:', container);
      
      const element = new google.translate.TranslateElement({
        pageLanguage: 'ru',
        includedLanguages: 'en,ru,es,zh-CN,de,fr,it,ja,ar,pt,ko,tr,hi,pl,uk,vi',
        layout: google.translate.TranslateElement.InlineLayout.VERTICAL,
        multilanguagePage: true,
        autoDisplay: false
      }, 'google_translate_element');
      
      console.log('TranslateElement created:', element);
      
      let checkCount = 0;
      const checkWidget = setInterval(() => {
        checkCount++;
        
        const select1 = document.querySelector('.goog-te-combo');
        const select2 = document.querySelector('select.goog-te-combo');
        const select3 = container.querySelector('select');
        const link = document.querySelector('.VIpgJd-ZVi9od-xl07Ob-lTBxed');
        const allSelects = document.querySelectorAll('select');
        
        if (checkCount === 1) {
          console.log('Searching for widget...');
        }
        
        if (checkCount === 30) {
          console.log('Widget analysis:');
          console.log('  - Container HTML:', container.innerHTML.substring(0, 300));
          console.log('  - All selects:', allSelects.length);
          console.log('  - Link found:', !!link);
          console.log('  - Google API:', !!google.translate);
        }
        
        const foundSelect = select1 || select2 || select3;
        
        if (foundSelect) {
          clearInterval(checkWidget);
          console.log('Widget select found!', foundSelect);
          console.log('   Options:', foundSelect.options.length);
          
          window.googleTranslateSelect = foundSelect;
          
          // Восстанавливаем язык
          const savedLanguage = localStorage.getItem('app_language');
          if (savedLanguage && savedLanguage !== 'ru') {
            console.log('Restoring saved language:', savedLanguage);
            setTimeout(() => {
              window.changeLanguageGoogle(savedLanguage);
            }, 500);
          }
        } else if (link && checkCount === 10) {
          // Если через 1 секунду нашлась только ссылка - используем Cookie метод
          console.log('Old-style select not found, using Cookie-based translation');
          clearInterval(checkWidget);
          window.googleTranslateCookieMethod = true;
          
          const savedLanguage = localStorage.getItem('app_language');
          if (savedLanguage && savedLanguage !== 'ru') {
            setTimeout(() => {
              window.changeLanguageGoogle(savedLanguage);
            }, 500);
          }
        }
      }, 100);
      
      // Таймаут через 15 секунд
      setTimeout(() => {
        clearInterval(checkWidget);
        if (!window.googleTranslateSelect && !window.googleTranslateCookieMethod) {
          console.error('Widget not initialized after 15 seconds');
          console.log('Trying cookie method as fallback');
          window.googleTranslateCookieMethod = true;
        }
        
        // Скрываем все элементы Google UI после инициализации
        hideGoogleElements();
      }, 15000);
      
    } catch (error) {
      console.error('Google Translate initialization error:', error);
    }
  };
  
  // Функция для скрытия всех элементов Google UI
  function hideGoogleElements() {
    const selectorsToHide = [
      '.goog-te-banner-frame',
      '.goog-te-gadget',
      '.goog-te-gadget-simple',
      '.goog-logo-link',
      '.goog-te-gadget-icon',
      '.skiptranslate',
      'iframe.goog-te-menu-frame',
      'img[src*="cleardot.gif"]',
      'img[src*="te_ctrl"]'
    ];
    
    selectorsToHide.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        el.style.display = 'none';
        el.style.opacity = '0';
        el.style.visibility = 'hidden';
      });
    });
  }
  
  // Периодически проверяем и скрываем элементы Google
  setInterval(hideGoogleElements, 2000);
  
  // Функция смены языка через Google Translate
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
      console.log('Using SELECT method, changing to:', langCode);
      select.value = googleLang;
      const event = new Event('change', { bubbles: true, cancelable: true });
      select.dispatchEvent(event);
      if (typeof select.onchange === 'function') {
        select.onchange(event);
      }
      
      localStorage.setItem('app_language', langCode);
      console.log('Language changed successfully to:', langCode);
      
      showLanguageNotification(langCode);
      return;
    }
    
    // Метод 2: Использование Cookie (новый виджет с ссылкой)
    if (window.googleTranslateCookieMethod || retryCount > 10) {
      console.log('Using COOKIE method. Changing to:', langCode);
      
      // Удаляем старые cookies
      document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=' + window.location.hostname;
      
      if (langCode === 'ru') {
        // Возврат к русскому - просто перезагружаем
        localStorage.setItem('app_language', 'ru');
        console.log('Returning to Russian (original)');
        showLanguageNotification('ru');
        setTimeout(() => location.reload(), 500);
      } else {
        // Устанавливаем cookie для перевода: /исходный/целевой
        const cookieValue = `/ru/${googleLang}`;
        document.cookie = `googtrans=${cookieValue}; path=/;`;
        document.cookie = `googtrans=${cookieValue}; path=/; domain=${window.location.hostname}`;
        
        localStorage.setItem('app_language', langCode);
        console.log('Cookie set:', cookieValue);
        showLanguageNotification(langCode);
        
        // Перезагружаем страницу для применения перевода
        setTimeout(() => location.reload(), 500);
      }
      return;
    }
    
    // Retry если виджет еще не готов
    if (retryCount < maxRetries) {
      if (retryCount === 0) {
        console.log('Waiting for Google Translate widget...');
      }
      setTimeout(() => {
        window.changeLanguageGoogle(langCode, retryCount + 1);
      }, retryDelay);
    } else {
      console.error('Widget not ready, trying cookie method as last resort');
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
  
  // Скрываем баннер Google Translate
  const style = document.createElement('style');
  style.textContent = `
    /* Скрываем верхний баннер Google Translate */
    .goog-te-banner-frame {
      display: none !important;
    }
    
    body {
      top: 0 !important;
    }
    
    .skiptranslate {
      display: none !important;
    }
    
    /* Скрываем виджет Google */
    #google_translate_element {
      display: none !important;
    }
    
    /* Скрываем логотип и иконку Google в углу */
    .goog-logo-link,
    .goog-te-gadget-icon,
    img[src*="cleardot.gif"],
    img[src*="te_ctrl"],
    .goog-te-gadget img,
    .VIpgJd-ZVi9od-xl07Ob-lTBxed img {
      display: none !important;
      opacity: 0 !important;
      visibility: hidden !important;
    }
    
    /* Скрываем весь gadget полностью */
    .goog-te-gadget,
    .goog-te-gadget-simple {
      display: none !important;
    }
    
    /* Скрываем iframe если появится */
    iframe.goog-te-menu-frame {
      display: none !important;
    }
    
    /* Улучшаем отображение переведённого текста */
    .translated-ltr {
      font-smoothing: antialiased;
      -webkit-font-smoothing: antialiased;
    }
    
    /* Не переводить валюты, цены и тикеры активов */
    .notranslate {
      font-family: inherit !important;
    }
  `;
  document.head.appendChild(style);
  
  // Функция для добавления класса notranslate к элементам с валютами и тикерами
  function markNoTranslateElements() {
    try {
      // Находим все элементы с классами, содержащими ключевые слова
      const classSelectors = [
        '[class*="symbol"]',
        '[class*="ticker"]',
        '[class*="crypto"]',
        '[class*="stock"]',
        '[class*="asset"]',
        '[class*="price"]',
        '[class*="value"]',
        '[class*="amount"]',
        '[class*="balance"]',
        '[class*="currency"]',
        '[class*="fav-symbol"]',
        '[class*="fav-name"]',
        '[class*="fav-price"]'
      ];
      
      classSelectors.forEach(selector => {
        try {
          document.querySelectorAll(selector).forEach(el => {
            if (!el.classList.contains('notranslate')) {
              el.classList.add('notranslate');
              el.setAttribute('translate', 'no');
            }
          });
        } catch (e) {
          // Игнорируем ошибки
        }
      });
      
      // Обрабатываем все элементы, проверяя содержимое
      document.querySelectorAll('span, div, td, th, p, h1, h2, h3, h4, h5, h6, button, a, strong').forEach(el => {
        // Получаем только прямой текст (без вложенных элементов)
        let text = '';
        for (let node of el.childNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            text += node.textContent;
          }
        }
        text = text.trim();
        
        if (!text) return;
        
        // 1. Проверяем на символы валют в начале
        if (text.match(/^[$€£¥₽₴₸₩₪₹฿]\s*[\d,\.]+/)) {
          el.classList.add('notranslate');
          el.setAttribute('translate', 'no');
          return;
        }
        
        // 2. Тикеры криптовалют и акций (2-6 заглавных букв)
        if (text.length >= 2 && text.length <= 6 && 
            text === text.toUpperCase() && 
            /^[A-Z0-9]+$/.test(text)) {
          // Исключаем обычные слова
          const commonWords = ['OK', 'YES', 'NO', 'NEW', 'OLD', 'ADD', 'ALL', 'ANY', 'SET', 'GET', 'PUT', 'DEL', 'API', 'GO', 'STOP', 'SAVE', 'EDIT', 'VIEW', 'OPEN'];
          if (!commonWords.includes(text)) {
            el.classList.add('notranslate');
            el.setAttribute('translate', 'no');
            console.log('Protected ticker:', text);
            return;
          }
        }
        
        // 3. Известные тикеры криптовалют (прямое сравнение)
        const knownCryptoTickers = ['BTC', 'ETH', 'USDT', 'BNB', 'XRP', 'ADA', 'DOGE', 'SOL', 'DOT', 'MATIC', 'SHIB', 'AVAX', 'UNI', 'LINK', 'LTC', 'ATOM', 'ETC', 'XLM', 'ALGO', 'FIL', 'TRX', 'XMR', 'VET'];
        const knownStockTickers = [
          'AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX', 
          'PYPL', 'ADBE', 'CRM', 'INTC', 'AMD', 'ORCL', 'IBM', 'CSCO',
          'QCOM', 'TXN', 'AVGO', 'SHOP', 'SQ', 'SNAP', 'UBER', 'LYFT',
          'ABNB', 'COIN', 'RBLX', 'PINS', 'SPOT', 'ZM', 'DOCU', 'TWLO',
          'PLTR', 'SNOW', 'NET', 'DDOG', 'MDB', 'CRWD', 'ZS', 'OKTA'
        ];
        
        if (knownCryptoTickers.includes(text) || knownStockTickers.includes(text)) {
          el.classList.add('notranslate');
          el.setAttribute('translate', 'no');
          return;
        }
        
        // 4. Если текст содержит название + тикер (например "Bitcoin BTC")
        if (text.match(/\b[A-Z]{2,6}\b$/)) {
          el.classList.add('notranslate');
          el.setAttribute('translate', 'no');
        }
      });
    } catch (e) {
      console.error('markNoTranslateElements error:', e);
    }
  }
  
  // Запускаем при загрузке
  function initNoTranslate() {
    // Запускаем СРАЗУ, не дожидаясь
    console.log('Marking non-translatable elements...');
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
        }, 200); // Быстрее реагируем на новые элементы
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
      // Скрываем элементы Google сразу и через 1 секунду после загрузки
      setTimeout(hideGoogleElements, 100);
      setTimeout(hideGoogleElements, 1000);
      setTimeout(hideGoogleElements, 3000);
    });
  } else {
    loadGoogleTranslate();
    initNoTranslate();
    // Скрываем элементы Google сразу и через 1 секунду после загрузки
    setTimeout(hideGoogleElements, 100);
    setTimeout(hideGoogleElements, 1000);
    setTimeout(hideGoogleElements, 3000);
  }
  
})();
