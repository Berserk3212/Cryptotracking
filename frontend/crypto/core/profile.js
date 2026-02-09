// crypto/profile.js — ФИНАЛЬНЫЙ, РАБОЧИЙ, БЕЗ ОШИБОК
const supabaseUrl = 'https://yvliktxpfglofdgvxrcl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2bGlrdHhwZmdsb2ZkZ3Z4cmNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExNDcyOTcsImV4cCI6MjA3NjcyMzI5N30.gJWKm8rZYDu-x4vdKIA4HJ8PZo_JcqBTpttseJCpDJU';

export const supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

// === ГЛОБАЛЬНЫЙ app ===
window.app = window.app || {};

// === ОТКРЫТИЕ МОДАЛКИ + ЗАПОЛНЕНИЕ ===
window.app.showProfileModal = async () => {
  const modal = document.getElementById('profileModal');
  if (!modal) {
    console.error('Модалка #profileModal не найдена');
    return;
  }

  modal.style.display = 'flex';
  setTimeout(() => {
    modal.classList.add('active');
  }, 10);

  const nameInput = document.getElementById('profileName');
  const emailInput = document.getElementById('profileEmail');
  const avatarInput = document.getElementById('profileAvatar');
  const avatarPreview = document.getElementById('avatarPreview');

  if (nameInput) nameInput.value = 'Загрузка...';
  if (emailInput) emailInput.value = 'Загрузка...';
  if (avatarInput) avatarInput.value = '';

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      if (nameInput) nameInput.value = 'Не авторизован';
      if (emailInput) emailInput.value = 'Войдите';
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email, avatar_url')
      .eq('id', session.user.id)
      .maybeSingle();

    let fullName = session.user.user_metadata?.full_name 
      || session.user.email.split('@')[0] 
      || 'Инвестор';

    let email = session.user.email || 'Не указан';
    let avatarUrl = '';

    if (profile) {
      fullName = profile.full_name || fullName;
      email = profile.email || email;
      avatarUrl = profile.avatar_url || '';
    }

    if (nameInput) nameInput.value = fullName;
    if (emailInput) emailInput.value = email;
    if (avatarInput) avatarInput.value = avatarUrl;
    
    // Загружаем настройки приложения из localStorage
    loadAppSettings();
    
    // Показываем текущую аватарку
    console.log('Загрузка аватарки:', avatarUrl);
    if (avatarUrl && avatarPreview) {
      console.log('Avatar preview element найден, загружаем изображение...');
      const img = avatarPreview.querySelector('img') || document.createElement('img');
      img.src = avatarUrl;
      img.onload = () => {
        console.log('Аватарка загружена успешно');
        if (!avatarPreview.querySelector('img')) {
          avatarPreview.appendChild(img);
        }
        avatarPreview.classList.add('has-image');
      };
      img.onerror = (err) => {
        console.error('Ошибка загрузки аватарки:', err);
        avatarPreview.classList.remove('has-image');
      };
    } else if (avatarPreview) {
      console.log('Аватарка не установлена или preview элемент не найден');
      avatarPreview.classList.remove('has-image');
    }

    // ОБНОВЛЯЕМ ПРИВЕТСТВИЕ В ДАШБОРДЕ
    const greeting = document.getElementById('userName');
    if (greeting) greeting.textContent = fullName;
    
    // Также синхронизируем через новую функцию если она есть
    if (window.syncUserNameToDashboard) {
        window.syncUserNameToDashboard();
    }

    nameInput?.focus();

    console.log('Модалка заполнена:', { fullName, email, avatarUrl });
  } catch (err) {
    console.error('Ошибка в showProfileModal:', err);
    if (nameInput) nameInput.value = 'Ошибка';
  }
};

// === ЗАКРЫТИЕ МОДАЛКИ ===
window.app.closeModal = (id) => {
  const modal = document.getElementById(id);
  if (!modal) return;

  // If modal is docked into the content panel, undock first and restore section
  if (modal.classList.contains('panel-docked')) {
    const section = modal.closest('.section');
    try {
      const sectionId = section?.id;
      // find grid inside the section and restore
      const grid = section?.querySelector('.crypto-grid');
      const panel = section?.querySelector('.detail-panel-area');
      if (panel) panel.style.display = 'none';
      if (grid) grid.style.display = '';
      section?.classList.remove('detail-open');

      // move modal back to its original parent if possible
      if (modal._originalParent) {
        if (modal._originalNext && modal._originalNext.parentNode === modal._originalParent) {
          modal._originalParent.insertBefore(modal, modal._originalNext);
        } else {
          modal._originalParent.appendChild(modal);
        }
      } else {
        document.body.appendChild(modal);
      }

      modal.classList.remove('panel-docked');
      // reset any inline size styles
      const content = modal.querySelector('.modal-content') || modal.querySelector('.modal-container');
      if (content) { content.style.width = ''; content.style.height = ''; }
      
      // Пересоздаем график крипты после undocking
      setTimeout(() => {
        if (id === 'cryptoDetailModal' && window.currentCryptoSymbol) {
          // Удаляем старый график
          if (window.tvChart) {
            try {
              window.tvChart.remove();
              console.log('Chart removed during undock');
            } catch (e) {
              console.warn('Chart removal warning:', e);
            }
            window.tvChart = null;
            window.lineSeries = null;
            window.candlestickSeries = null;
            window.volumeSeries = null;
          }
          
          // Пересоздаем график
          if (typeof window.loadCryptoDetailCharts === 'function') {
            const currentInterval = modal.querySelector('.period-btn.active')?.getAttribute('data-period') || '1w';
            console.log('Recreating chart after undock');
            window.loadCryptoDetailCharts(window.currentCryptoSymbol, currentInterval).catch(err => {
              console.error('Error recreating chart:', err);
            });
          }
        }
      }, 350);
      
      console.log('[dock] closeModal: undocked and restored', id);
    } catch (err) {
      console.error('Error during undock in closeModal:', err);
    }
  }

  // normal hide (for floating modal or after undocking)
  modal.classList.remove('active');
  setTimeout(() => {
    modal.style.display = 'none';
  }, 300);
};

// === ВЫХОД ===
window.app.logout = async () => {
  try {
    await supabase.auth.signOut();
    window.location.href = '../login.html';
  } catch (err) {
    console.error('Ошибка выхода:', err);
  }
};

// === ОБНОВЛЕНИЕ UI В САЙДБАРЕ + ДАШБОРД ===
export const updateUserUI = async () => {
  const nameEl = document.querySelector('.user-name');
  const emailEl = document.querySelector('.user-email');
  const avatarEl = document.querySelector('.user-avatar');

  if (!nameEl && !emailEl && !avatarEl) return;

  if (nameEl) nameEl.textContent = 'Загрузка...';
  if (emailEl) emailEl.textContent = '—';
  if (avatarEl) avatarEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      if (nameEl) nameEl.textContent = 'Не авторизован';
      if (emailEl) emailEl.textContent = 'Войдите';
      if (avatarEl) avatarEl.innerHTML = '<i class="fas fa-user"></i>';
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email, avatar_url')
      .eq('id', session.user.id)
      .maybeSingle();

    let fullName = session.user.user_metadata?.full_name 
      || session.user.email.split('@')[0] 
      || 'Инвестор';

    let email = session.user.email || 'Не указан';
    let avatarUrl = '';

    if (profile) {
      fullName = profile.full_name || fullName;
      email = profile.email || email;
      avatarUrl = profile.avatar_url || '';
    }

    if (nameEl) nameEl.textContent = fullName;
    if (emailEl) emailEl.textContent = email;

    if (avatarEl) {
      if (avatarUrl) {
        const img = new Image();
        img.src = avatarUrl;
        img.alt = 'Avatar';
        img.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;';
        img.onload = () => { avatarEl.innerHTML = ''; avatarEl.appendChild(img); };
        img.onerror = () => { avatarEl.innerHTML = '<i class="fas fa-user"></i>'; };
      } else {
        avatarEl.innerHTML = '<i class="fas fa-user"></i>';
      }
    }

    // ОБНОВЛЯЕМ ПРИВЕТСТВИЕ В ДАШБОРДЕ
    const greeting = document.getElementById('userName');
    if (greeting) greeting.textContent = fullName;
    
    // Также синхронизируем через новую функцию если она есть
    if (window.syncUserNameToDashboard) {
        window.syncUserNameToDashboard();
    }

  } catch (err) {
    console.error('updateUserUI error:', err);
    if (nameEl) nameEl.textContent = 'Ошибка загрузки';
  }
  finally {
    // Убираем спиннер если остался
    if (avatarEl) {
      const spinner = avatarEl.querySelector('.fa-spinner');
      if (spinner) avatarEl.innerHTML = '<i class="fas fa-user"></i>';
    }
    // Если всё ещё "Загрузка..." — ставим дефолт
    if (nameEl && nameEl.textContent === 'Загрузка...') {
      nameEl.textContent = 'Инвестор';
    }
  }
}

// === СОХРАНЕНИЕ ПРОФИЛЯ ===
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('profileForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('profileName')?.value.trim();
    const avatar = document.getElementById('profileAvatar')?.value.trim() || null;

    if (!name) return alert('Введите имя');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return alert('Не авторизован');

      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: session.user.id,
          full_name: name,
          avatar_url: avatar
        });

      if (error) throw error;

      // Обновляем превью аватарки в модальном окне
      const avatarPreview = document.getElementById('avatarPreview');
      if (avatar && avatarPreview) {
        const img = avatarPreview.querySelector('img') || document.createElement('img');
        img.src = avatar;
        img.onload = () => {
          if (!avatarPreview.querySelector('img')) {
            avatarPreview.appendChild(img);
          }
          avatarPreview.classList.add('has-image');
        };
      } else if (avatarPreview) {
        avatarPreview.classList.remove('has-image');
      }

      await updateUserUI();
      
      // Синхронизируем с дашбордом
      if (window.syncUserNameToDashboard) {
          setTimeout(() => window.syncUserNameToDashboard(), 100);
      }
      
      alert('Профиль сохранён!');
      window.app.closeModal('profileModal');
    } catch (err) {
      console.error('Ошибка сохранения:', err);
      alert('Ошибка: ' + err.message);
    }
  });
});

// === ОБРАБОТЧИК ЗАГРУЗКИ АВАТАРКИ ===
document.addEventListener('DOMContentLoaded', () => {
  const avatarFileInput = document.getElementById('avatarFileInput');
  const avatarPreview = document.getElementById('avatarPreview');
  const avatarUrlInput = document.getElementById('profileAvatar');

  if (avatarFileInput) {
    avatarFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // Проверка размера файла (макс 2MB)
      if (file.size > 2 * 1024 * 1024) {
        alert('Файл слишком большой. Максимальный размер: 2MB');
        avatarFileInput.value = '';
        return;
      }

      // Проверка типа файла
      if (!file.type.startsWith('image/')) {
        alert('Пожалуйста, выберите изображение');
        avatarFileInput.value = '';
        return;
      }

      try {
        // Показываем превью
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = avatarPreview.querySelector('img') || document.createElement('img');
          img.src = event.target.result;
          if (!avatarPreview.querySelector('img')) {
            avatarPreview.appendChild(img);
          }
          avatarPreview.classList.add('has-image');
        };
        reader.readAsDataURL(file);

        // Получаем текущего пользователя
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          alert('Необходимо войти в систему');
          return;
        }

        // Генерируем уникальное имя файла
        const fileExt = file.name.split('.').pop();
        const fileName = `${session.user.id}-${Date.now()}.${fileExt}`;
        const filePath = `avatars/${fileName}`;

        // Загружаем файл в Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) throw uploadError;

        // Получаем публичный URL
        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(filePath);

        // Обновляем поле URL в форме
        if (avatarUrlInput) {
          avatarUrlInput.value = publicUrl;
          // Триггерим событие input для обновления превью
          avatarUrlInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        console.log('Аватарка загружена:', publicUrl);
      } catch (err) {
        console.error('Ошибка загрузки аватарки:', err);
        alert('Ошибка загрузки: ' + err.message);
        avatarFileInput.value = '';
      }
    });
  }

  // Обновляем превью при изменении URL
  if (avatarUrlInput) {
    avatarUrlInput.addEventListener('input', (e) => {
      const url = e.target.value.trim();
      if (url) {
        const img = avatarPreview.querySelector('img') || document.createElement('img');
        img.src = url;
        img.onerror = () => {
          avatarPreview.classList.remove('has-image');
        };
        img.onload = () => {
          if (!avatarPreview.querySelector('img')) {
            avatarPreview.appendChild(img);
          }
          avatarPreview.classList.add('has-image');
        };
      } else {
        avatarPreview.classList.remove('has-image');
      }
    });
  }
});

// === НАСТРОЙКИ ПРИЛОЖЕНИЯ ===

// Открытие модалки настроек
window.app.showSettingsModal = () => {
  const modal = document.getElementById('settingsModal');
  if (!modal) {
    console.error('Модалка #settingsModal не найдена');
    return;
  }

  modal.style.display = 'flex';
  setTimeout(() => {
    modal.classList.add('active');
  }, 10);
  
  // Загружаем текущие настройки
  loadAppSettingsToCards();
  
  // Инициализируем обработчики
  initSettingsHandlers();
};

// Загрузка настроек из localStorage в карточки
const loadAppSettingsToCards = () => {
  const settings = {
    language: localStorage.getItem('app_language') || 'ru',
    currency: localStorage.getItem('app_currency') || 'USD',
    theme: localStorage.getItem('app_theme') || 'system'
  };
  
  // Выбираем карточки языка
  document.querySelectorAll('#languageTab .settings-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.value === settings.language);
  });
  
  // Выбираем карточки валюты
  document.querySelectorAll('#currencyTab .settings-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.value === settings.currency);
  });
  
  // Выбираем тему
  document.querySelectorAll('.theme-card').forEach(card => {
    card.classList.toggle('active', card.dataset.theme === settings.theme);
  });
  
  return settings;
}

// Инициализация обработчиков
const initSettingsHandlers = () => {
  // Переключение вкладок
  document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      
      // Активируем вкладку
      document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Показываем контент
      document.querySelectorAll('.settings-tab-content').forEach(content => {
        content.classList.remove('active');
      });
      document.getElementById(tabName + 'Tab').classList.add('active');
    });
  });
  
  // Выбор языка
  document.querySelectorAll('#languageTab .settings-card').forEach(card => {
    card.addEventListener('click', async () => {
      document.querySelectorAll('#languageTab .settings-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      
      const language = card.dataset.value;
      
      // Применяем переводы через Google Translate
      try {
        if (typeof window.changeLanguageGoogle === 'function') {
          window.changeLanguageGoogle(language);
          console.log('Язык изменен:', language);
        } else {
          console.warn('Google Translate не загружен');
          localStorage.setItem('app_language', language);
          setTimeout(() => location.reload(), 500);
        }
      } catch (e) {
        console.error('Ошибка изменения языка:', e);
        if (window.showNotification) {
          window.showNotification('Error changing language', 'error');
        }
      }
    });
  });
  
  // Выбор валюты — теперь асинхронно загружаем курс и диспатчим событие ПОСЛЕ успешной загрузки
  document.querySelectorAll('#currencyTab .settings-card').forEach(card => {
    card.addEventListener('click', async () => {
      document.querySelectorAll('#currencyTab .settings-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      
      const currency = card.dataset.value;
      localStorage.setItem('app_currency', currency);
      try {
        // Динамически импортируем модуль, чтобы избежать циклических зависимостей при загрузке
        const currencyModule = await import('./currency.js');
        // Устанавливаем валюту и ждём загрузки курса
        await currencyModule.setSelectedCurrencyAsync(currency);
        const rate = await currencyModule.fetchCurrencyRate();
        // Теперь можно безопасно оповестить остальную часть приложения
        window.dispatchEvent(new Event('currencyChanged'));
        console.log('Валюта изменена:', currency, 'курс:', rate);
        if (window.showNotification) window.showNotification(`Курс загружен: 1 USD = ${rate} ${currency}`, 'success');
      } catch (e) {
        console.error('Ошибка установки валюты:', e);
        // Даём возможность UI обновиться символом на случай ошибки
        window.dispatchEvent(new Event('currencyChanged'));
      }
    });
  });
  
  // Выбор темы
  document.querySelectorAll('.theme-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      
      const theme = card.dataset.theme;
      localStorage.setItem('app_theme', theme);
      applyTheme(theme);
      console.log('Тема изменена:', theme);
    });
  });
  
  // Поиск языков
  const languageSearch = document.getElementById('languageSearch');
  if (languageSearch) {
    languageSearch.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      document.querySelectorAll('#languageTab .settings-card').forEach(card => {
        const title = card.querySelector('.card-title').textContent.toLowerCase();
        const subtitle = card.querySelector('.card-subtitle').textContent.toLowerCase();
        const matches = title.includes(query) || subtitle.includes(query);
        card.style.display = matches ? 'flex' : 'none';
      });
    });
  }
  
  // Поиск валют
  const currencySearch = document.getElementById('currencySearch');
  if (currencySearch) {
    currencySearch.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      document.querySelectorAll('#currencyTab .settings-card').forEach(card => {
        const title = card.querySelector('.card-title').textContent.toLowerCase();
        const subtitle = card.querySelector('.card-subtitle').textContent.toLowerCase();
        const matches = title.includes(query) || subtitle.includes(query);
        card.style.display = matches ? 'flex' : 'none';
      });
    });
  }
}

// Загрузка настроек из localStorage (старая функция для совместимости)
const loadAppSettings = () => {
  const settings = {
    language: localStorage.getItem('app_language') || 'ru',
    currency: localStorage.getItem('app_currency') || 'USD',
    theme: localStorage.getItem('app_theme') || 'system'
  };
  
  // Применяем тему
  applyTheme(settings.theme);
  
  return settings;
}

// Сохранение настроек
const saveAppSettings = () => {
  const languageSelect = document.getElementById('settingsLanguage');
  const currencySelect = document.getElementById('settingsCurrency');
  const activeThemeBtn = document.querySelector('#settingsModal .theme-btn.active');
  
  const settings = {
    language: languageSelect?.value || 'ru',
    currency: currencySelect?.value || 'USD',
    theme: activeThemeBtn?.dataset.theme || 'dark'
  };
  
  localStorage.setItem('app_language', settings.language);
  localStorage.setItem('app_currency', settings.currency);
  localStorage.setItem('app_theme', settings.theme);
  
  // Применяем тему
  applyTheme(settings.theme);
  
  // Триггерим событие для обновления валюты в приложении — ждём загрузки курса, чтобы избежать обновления UI только по символу
  (async () => {
    try {
      const currencyModule = await import('./currency.js');
      await currencyModule.setSelectedCurrencyAsync(settings.currency);
      const rate = await currencyModule.fetchCurrencyRate();
      window.dispatchEvent(new Event('currencyChanged'));
      if (window.showNotification) window.showNotification(`Курс загружен: 1 USD = ${rate} ${settings.currency}`, 'success');
    } catch (e) {
      console.error('Ошибка установки валюты при сохранении настроек:', e);
      window.dispatchEvent(new Event('currencyChanged'));
    }
  })();
  
  console.log('Настройки сохранены:', settings);
  
  return settings;
}

// Применение темы
const applyTheme = (theme) => {
  const root = document.documentElement;
  
  if (theme === 'light') {
    root.setAttribute('data-theme', 'light');
  } else if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark');
  } else if (theme === 'system') {
    // Определяем системную тему
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  }
}

// Обработчики событий для настроек
document.addEventListener('DOMContentLoaded', () => {
  // Обработчик кнопки настроек
  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      if (window.app.showSettingsModal) {
        window.app.showSettingsModal();
      }
    });
  }
  
  // Загружаем настройки при старте
  loadAppSettings();
  
  // Слушаем изменения системной темы
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    const currentTheme = localStorage.getItem('app_theme');
    if (currentTheme === 'system') {
      applyTheme('system');
    }
  });
});

// Экспортируем функции
window.app.loadAppSettings = loadAppSettings;
window.app.saveAppSettings = saveAppSettings;
window.app.applyTheme = applyTheme;
window.app.showSettingsModal = window.app.showSettingsModal || (() => {
  const modal = document.getElementById('settingsModal');
  if (modal) {
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);
    loadAppSettingsToForm();
  }
});