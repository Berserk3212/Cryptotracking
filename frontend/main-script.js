const { createApp, ref, reactive, onMounted, computed } = Vue;

// ─── Вспомогательные функции для работы с валютой ─────────────────────────
// Дублируем логику currency.js, т.к. main-script.js не является ES-модулем
const CURRENCY_SYMBOLS = { USD: '$', RUB: '₽', EUR: '€', GBP: '£', CNY: '¥' };

function getCurrencySymbol() {
  const cur = localStorage.getItem('selectedCurrency') || 'USD';
  return CURRENCY_SYMBOLS[cur] || cur;
}

function getCurrencyRate() {
  const rate = parseFloat(localStorage.getItem('currencyRate'));
  return (!isNaN(rate) && rate > 0) ? rate : 1;
}

async function fetchSelectedCurrencyRate(currency) {
  if (!currency || currency === 'USD') {
    localStorage.setItem('currencyRate', '1');
    return 1;
  }
  // Проверяем per-currency кэш (1 час)
  const cachedRate = parseFloat(localStorage.getItem(`currency_rate_${currency}`));
  const cachedTime = parseInt(localStorage.getItem(`currency_rate_time_${currency}`) || '0');
  if (cachedRate > 0 && !isNaN(cachedRate) && Date.now() - cachedTime < 3_600_000) {
    localStorage.setItem('currencyRate', cachedRate.toString());
    return cachedRate;
  }
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${currency}`);
    const json = await res.json();
    const rate = json?.rates?.[currency];
    if (rate && !isNaN(rate) && rate > 0) {
      localStorage.setItem('currencyRate', rate.toString());
      localStorage.setItem(`currency_rate_${currency}`, rate.toString());
      localStorage.setItem(`currency_rate_time_${currency}`, Date.now().toString());
      return rate;
    }
  } catch (e) { /* fallback */ }
  return getCurrencyRate();
}

createApp({
  setup() {
    // Состояние приложения
    const loading = ref(true);
    const isAuthenticated = ref(false);
    const user = reactive({
      fullName: 'Пользователь',
      email: '—',
      shortId: '--------'
    });
    const balance = ref(0);
    const profit = ref(0);
    const theme = ref('dark');
    
    // Уведомления (как в login.html)
    const toast = reactive({
      show: false,
      type: 'success',
      title: '',
      message: '',
      icon: 'fas fa-check',
      id: 0
    });

    // Supabase клиент
    const supabase = window.supabase.createClient(
      'https://yvliktxpfglofdgvxrcl.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2bGlrdHhwZmdsb2ZkZ3Z4cmNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExNDcyOTcsImV4cCI6MjA3NjcyMzI5N30.gJWKm8rZYDu-x4vdKIA4HJ8PZo_JcqBTpttseJCpDJU'
    );

    // Вычисляемые свойства
    const balanceDisplay = computed(() => {
      try {
        // Читаем символ валюты из currency.js (через localStorage как фоллбэк)
        const sym = getCurrencySymbol();
        return `${sym}${new Intl.NumberFormat('ru-RU').format(balance.value || 0)}`;
      } catch (e) {
        return `₽0`;
      }
    });

    const profitDisplay = computed(() => {
      return `${profit.value > 0 ? '+' : ''}${profit.value}%`;
    });

    const profitColor = computed(() => {
      return profit.value > 0 ? 'var(--success)' : (profit.value < 0 ? 'var(--error)' : 'var(--text-secondary)');
    });

    // Показ уведомлений
    const showToast = (type, title, message, duration = 4000) => {
      const icons = {
        success: 'fas fa-check',
        error: 'fas fa-times',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
      };

      Object.assign(toast, {
        type,
        title,
        message,
        icon: icons[type] || 'fas fa-info-circle',
        show: true,
        id: Date.now()
      });

      setTimeout(() => {
        toast.show = false;
      }, duration);
    };

    // Переключение темы
    const toggleTheme = () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      
      theme.value = newTheme;
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      
      // Анимация кнопки
      const themeBtn = document.querySelector('.theme-toggle');
      if (themeBtn) {
        themeBtn.style.transform = 'scale(1.1)';
        setTimeout(() => {
          themeBtn.style.transform = '';
        }, 300);
      }
      
      showToast('info', 'Тема изменена', 
        newTheme === 'dark' 
          ? 'Темная тема активирована' 
          : 'Светлая тема активирована'
      );
    };

    // Инициализация темы
    const initializeTheme = () => {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
        theme.value = savedTheme;
      } else {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        theme.value = currentTheme;
        localStorage.setItem('theme', currentTheme);
      }
    };

    // Проверка аутентификации через onAuthStateChange (Supabase v2 стреляет INITIAL_SESSION сразу)
    const checkAuth = () => {
      return new Promise((resolve) => {
        let resolved = false;
        let authSubscription = null;

        const resolveOnce = (user) => {
          if (resolved) return;
          resolved = true;
          if (authSubscription) authSubscription.unsubscribe();
          resolve(user);
        };

        // Таймаут-страховка: если Supabase не ответил за 5 секунд — гостевой режим
        const timeout = setTimeout(() => resolveOnce(null), 5000);

        // onAuthStateChange в Supabase v2 немедленно стреляет INITIAL_SESSION
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
          clearTimeout(timeout);
          resolveOnce(session?.user || null);
        });

        authSubscription = subscription;
      });
    };

    // Загрузка профиля пользователя
    const loadUserProfile = async (userId) => {
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('full_name, email, avatar_url')
          .eq('id', userId)
          .single();

        if (error) {
          console.error('Profile load error:', error);
          // Используем данные из аутентификации
          const { data: { user } } = await supabase.auth.getUser();
          user.fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Пользователь';
          user.email = user.email || '—';
          user.shortId = user.id?.substring(0, 8) + '...' || '--------';
          user.avatarUrl = null;
          return user;
        }

        const { data: { user } } = await supabase.auth.getUser();
        user.fullName = profile.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Пользователь';
        user.email = profile.email || user.email || '—';
        user.shortId = user.id?.substring(0, 8) + '...' || '--------';
        user.avatarUrl = profile.avatar_url;
        
        // Обновление аватарки в UI
        console.log('🖼️ Загрузка аватарки:', profile.avatar_url);
        const avatarContainer = document.getElementById('userAvatar');
        if (profile.avatar_url && avatarContainer) {
          console.log('📍 Avatar container найден, загружаем изображение...');
          const img = document.createElement('img');
          img.src = profile.avatar_url;
          img.alt = 'Avatar';
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.objectFit = 'cover';
          img.style.borderRadius = '50%';
          img.onload = () => {
            console.log('Аватарка загружена успешно');
            avatarContainer.innerHTML = '';
            avatarContainer.appendChild(img);
          };
          img.onerror = (err) => {
            console.error('Ошибка загрузки аватарки:', err);
            avatarContainer.innerHTML = '<i class="fas fa-user-circle"></i>';
          };
        } else if (avatarContainer) {
          console.log('Аватарка не установлена');
          avatarContainer.innerHTML = '<i class="fas fa-user-circle"></i>';
        }
        
        return user;
      } catch (error) {
        console.error('Profile load error:', error);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          user.fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Пользователь';
          user.email = user.email || '—';
          user.shortId = user.id?.substring(0, 8) + '...' || '--------';
        }
        return user;
      }
    };

    // Загрузка статистики (реальные данные пользователя)
    const loadUserStats = async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) {
          console.warn('loadUserStats: пользователь не авторизован');
          return;
        }

        // Получаем портфели и транзакции пользователя
        const { data: portfolios } = await supabase
          .from('portfolios')
          .select('id')
          .eq('user_id', authUser.id);

        const { data: transactions, error: txError } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', authUser.id)
          .order('date', { ascending: false });

        if (txError) {
          console.error('Supabase transactions error:', txError);
          balance.value = 0;
          profit.value = 0;
          return;
        }

        if (!transactions || transactions.length === 0) {
          // Нет транзакций — показываем нули
          balance.value = 0;
          profit.value = 0;
          return;
        }

        // Группируем позиции (как в dashboard.js calculatePortfolioStats)
        const assets = {};

        transactions.forEach(tx => {
          const symbol = tx.symbol;
          if (!assets[symbol]) {
            assets[symbol] = { quantity: 0, totalCost: 0, totalBought: 0 };
          }
          const qty = Number(tx.quantity) || 0;
          const price = Number(tx.price) || 0;
          if (tx.type === 'BUY') {
            assets[symbol].quantity += qty;
            assets[symbol].totalCost += qty * price;
            assets[symbol].totalBought += qty;
          } else if (tx.type === 'SELL') {
            assets[symbol].quantity -= qty;
          }
        });

        // Только активы с положительным остатком (как в dashboard.js)
        const symbols = Object.keys(assets).filter(s => assets[s].quantity > 0);
        const binanceMap = symbolListToBinance(symbols);

        // Запрос цен к Binance
        const prices = await fetchBinancePrices(Object.values(binanceMap));

        // Считаем вложения и стоимость только по оставшимся активам
        let totalInvestedUSD = 0;
        let totalCurrentUSD = 0;
        for (const sym of symbols) {
          const asset = assets[sym];
          totalInvestedUSD += asset.totalCost; // все покупки по этому активу
          const binSym = binanceMap[sym];
          const currentPrice = prices[binSym] || 0;
          // Фоллбэк для акций и неизвестных активов (как в dashboard.js)
          const avgBuyPrice = asset.totalBought > 0 ? asset.totalCost / asset.totalBought : 0;
          if (currentPrice > 0) {
            totalCurrentUSD += asset.quantity * currentPrice;
          } else if (avgBuyPrice > 0) {
            totalCurrentUSD += asset.quantity * avgBuyPrice;
          }
        }

        // Конвертируем в выбранную валюту
        balance.value = Math.round(totalCurrentUSD * getCurrencyRate());

        // Доходность в процентах
        let profitPct = 0;
        if (totalInvestedUSD > 0) {
          profitPct = ((totalCurrentUSD - totalInvestedUSD) / totalInvestedUSD) * 100;
        }
        profit.value = parseFloat(profitPct.toFixed(1));

      } catch (error) {
        console.error('loadUserStats error:', error);
        // fallback to zeros
        balance.value = balance.value || 0;
        profit.value = profit.value || 0;
      }
    };

    // Вспомогательная: маппинг символов в Binance пары
    function symbolListToBinance(symbols) {
      const map = {};
      symbols.forEach(s => {
        const up = s.toUpperCase();
        // простая логика: предпочитаем USDT пары
        map[s] = `${up}USDT`;
      });
      return map;
    }

    // Вспомогательная: fetch Binance prices for list of pairs
    async function fetchBinancePrices(binanceSymbols) {
      const prices = {};
      if (!binanceSymbols || binanceSymbols.length === 0) return prices;
      try {
        const url = 'https://api.binance.com/api/v3/ticker/price';
        const resp = await fetch(url);
        if (!resp.ok) return prices;
        const data = await resp.json();
        const lookup = {};
        data.forEach(item => lookup[item.symbol] = parseFloat(item.price));
        binanceSymbols.forEach(s => {
          if (lookup[s]) prices[s] = lookup[s];
        });
      } catch (e) {
        console.warn('fetchBinancePrices failed', e.message);
      }
      return prices;
    }

    // Настройка обработчиков событий
    const setupEventListeners = () => {
      // Портфель
      const btnPortfolio = document.getElementById('btnPortfolio');
      if (btnPortfolio) {
        btnPortfolio.addEventListener('click', () => {
          window.location.href = 'crypto/cryptotracking.html';
        });
      }

      // Профиль
      const btnProfile = document.getElementById('btnProfile');
      if (btnProfile) {
        btnProfile.addEventListener('click', openProfileModal);
      }

      // Закрытие профиля
      const closeProfileModal = document.getElementById('closeProfileModal');
      if (closeProfileModal) {
        closeProfileModal.addEventListener('click', () => closeModal('profileModal'));
      }

      const cancelProfileBtn = document.getElementById('cancelProfileBtn');
      if (cancelProfileBtn) {
        cancelProfileBtn.addEventListener('click', () => closeModal('profileModal'));
      }

      // Клик вне модалки профиля
      const profileModal = document.getElementById('profileModal');
      if (profileModal) {
        profileModal.addEventListener('click', (e) => {
          if (e.target === profileModal) closeModal('profileModal');
        });
      }

      // Закрытие настроек
      const closeSettingsModal = document.getElementById('closeSettingsModal');
      if (closeSettingsModal) {
        closeSettingsModal.addEventListener('click', () => closeModal('settingsModal'));
      }

      const settingsModal = document.getElementById('settingsModal');
      if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
          if (e.target === settingsModal) closeModal('settingsModal');
        });
      }

      // Загрузка аватара
      const avatarFileInput = document.getElementById('avatarFileInput');
      if (avatarFileInput) {
        avatarFileInput.addEventListener('change', handleAvatarUpload);
      }

      // Сохранение профиля
      const profileForm = document.getElementById('profileForm');
      if (profileForm) {
        profileForm.addEventListener('submit', handleProfileSave);
      }

      // Настройки
      const btnSettings = document.getElementById('btnSettings');
      if (btnSettings) {
        btnSettings.addEventListener('click', openSettingsModal);
      }

      // Выход
      const btnLogout = document.getElementById('btnLogout');
      if (btnLogout) {
        btnLogout.addEventListener('click', handleLogout);
      }
    };

    // Настройка гостевых обработчиков
    const setupGuestEventListeners = () => {
      // Обзор — переход в cryptotracking в гостевом режиме
      const btnGuestExplore = document.getElementById('btnGuestExplore');
      if (btnGuestExplore) {
        btnGuestExplore.addEventListener('click', async () => {
          // Проверяем, разрешён ли гостевой режим системными настройками
          try {
            const { data } = await supabase
              .from('system_settings')
              .select('value')
              .eq('key', 'guest_mode_enabled')
              .maybeSingle();
            const guestAllowed = data ? (data.value === 'true' || data.value === true) : true;
            if (!guestAllowed) {
              alert('Гостевой доступ временно отключён. Пожалуйста, войдите в аккаунт.');
              return;
            }
          } catch {
            // при ошибке сети — разрешаем гостевой доступ
          }
          localStorage.setItem('guestMode', 'true');
          window.location.href = 'crypto/cryptotracking.html';
        });
      }

      // Войти
      const btnGuestLogin = document.getElementById('btnGuestLogin');
      if (btnGuestLogin) {
        btnGuestLogin.addEventListener('click', () => {
          window.location.href = 'login.html';
        });
      }

      // Регистрация
      const btnGuestRegister = document.getElementById('btnGuestRegister');
      if (btnGuestRegister) {
        btnGuestRegister.addEventListener('click', () => {
          window.location.href = 'register.html';
        });
      }
    };

    // Открытие модального окна профиля
    const openProfileModal = async () => {
      try {
        const { data: { user: authUser }, error } = await supabase.auth.getUser();
        if (error) throw error;

        // Получаем профиль из БД
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, email, avatar_url')
          .eq('id', authUser.id)
          .single();

        // Заполняем форму
        const nameInput = document.getElementById('profileNameInput');
        const emailInput = document.getElementById('profileEmailInput');
        const avatarInput = document.getElementById('profileAvatarInput');
        const avatarPreview = document.getElementById('avatarPreviewModal');

        if (nameInput) nameInput.value = profile?.full_name || user.fullName || '';
        if (emailInput) emailInput.value = profile?.email || user.email || '';
        if (avatarInput) avatarInput.value = profile?.avatar_url || '';

        // Показываем аватар
        if (profile?.avatar_url && avatarPreview) {
          const img = document.createElement('img');
          img.src = profile.avatar_url;
          img.alt = 'Avatar';
          img.onload = () => {
            avatarPreview.innerHTML = '';
            avatarPreview.appendChild(img);
            avatarPreview.classList.add('has-image');
          };
          img.onerror = () => {
            avatarPreview.innerHTML = '<i class="fas fa-user-circle"></i>';
            avatarPreview.classList.remove('has-image');
          };
        } else if (avatarPreview) {
          avatarPreview.innerHTML = '<i class="fas fa-user-circle"></i>';
          avatarPreview.classList.remove('has-image');
        }

        // Показываем модалку
        const modal = document.getElementById('profileModal');
        if (modal) {
          modal.style.display = 'flex';
        }
      } catch (error) {
        console.error('Error opening profile modal:', error);
        showToast('error', 'Ошибка', 'Не удалось загрузить профиль');
      }
    };

    // Закрытие модального окна (универсальное)
    const closeModal = (id) => {
      const modalId = id || 'profileModal';
      const modal = document.getElementById(modalId);
      if (modal) {
        modal.style.display = 'none';
      }
    };
    // Глобальный доступ (для onclick-атрибутов)
    window.closeModal = closeModal;

    // Загрузка аватара
    const handleAvatarUpload = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // Проверка размера
      if (file.size > 2 * 1024 * 1024) {
        showToast('error', 'Ошибка', 'Размер файла не должен превышать 2MB');
        return;
      }

      // Проверка типа
      if (!file.type.startsWith('image/')) {
        showToast('error', 'Ошибка', 'Можно загружать только изображения');
        return;
      }

      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) throw new Error('Пользователь не авторизован');

        // Загрузка в Supabase Storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${authUser.id}-${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { data, error } = await supabase.storage
          .from('avatars')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: true
          });

        if (error) throw error;

        // Получаем публичный URL
        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(filePath);

        // Обновляем превью
        const avatarPreview = document.getElementById('avatarPreviewModal');
        const avatarInput = document.getElementById('profileAvatarInput');
        
        if (avatarInput) avatarInput.value = publicUrl;
        
        if (avatarPreview) {
          const img = document.createElement('img');
          img.src = publicUrl;
          img.alt = 'Avatar';
          img.onload = () => {
            avatarPreview.innerHTML = '';
            avatarPreview.appendChild(img);
            avatarPreview.classList.add('has-image');
          };
        }

        showToast('success', 'Успешно', 'Фото загружено');
      } catch (error) {
        console.error('Avatar upload error:', error);
        showToast('error', 'Ошибка', 'Не удалось загрузить фото');
      }
    };

    // Сохранение профиля
    const handleProfileSave = async (e) => {
      e.preventDefault();

      try {
        const nameInput = document.getElementById('profileNameInput');
        const avatarInput = document.getElementById('profileAvatarInput');

        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) throw new Error('Пользователь не авторизован');

        const fullName = nameInput?.value || '';
        const avatarUrl = avatarInput?.value || null;

        // Обновляем профиль в БД
        const { error } = await supabase
          .from('profiles')
          .upsert({
            id: authUser.id,
            full_name: fullName,
            email: authUser.email,
            avatar_url: avatarUrl
          }, {
            onConflict: 'id'
          });

        if (error) throw error;

        // Обновляем UI
        user.fullName = fullName;
        
        // Обновляем аватарку на странице
        const userAvatar = document.getElementById('userAvatar');
        if (avatarUrl && userAvatar) {
          const img = document.createElement('img');
          img.src = avatarUrl;
          img.alt = 'Avatar';
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.objectFit = 'cover';
          img.style.borderRadius = '50%';
          img.onload = () => {
            userAvatar.innerHTML = '';
            userAvatar.appendChild(img);
          };
        }

        showToast('success', 'Сохранено', 'Профиль успешно обновлен');
        closeModal();
      } catch (error) {
        console.error('Profile save error:', error);
        showToast('error', 'Ошибка', 'Не удалось сохранить профиль');
      }
    };


    // НАСТРОЙКИ


    // Открытие модала настроек
    const openSettingsModal = () => {
      const modal = document.getElementById('settingsModal');
      if (!modal) return;
      modal.style.display = 'flex';
      initSettingsModal();
    };

    // Инициализация состояния (выделить сохранённые значения)
    const initSettingsModal = () => {
      // Язык — читаем из app_language (ключ google-translate.js), с фоллбэком на preferredLanguage
      const savedLang = localStorage.getItem('app_language') || localStorage.getItem('preferredLanguage') || 'ru';
      document.querySelectorAll('#settingsModal [data-value]').forEach(card => {
        const tab = card.closest('.settings-tab-content');
        if (tab && tab.id === 'languageTab') {
          card.classList.toggle('selected', card.dataset.value === savedLang);
        }
      });

      // Валюта — читаем из selectedCurrency (ключ currency.js), с фоллбэком на preferredCurrency
      const savedCurrency = localStorage.getItem('selectedCurrency') || localStorage.getItem('preferredCurrency') || 'USD';
      document.querySelectorAll('#settingsModal [data-value]').forEach(card => {
        const tab = card.closest('.settings-tab-content');
        if (tab && tab.id === 'currencyTab') {
          card.classList.toggle('selected', card.dataset.value === savedCurrency);
        }
      });

      // Тема
      const savedTheme = localStorage.getItem('theme') || 'dark';
      document.querySelectorAll('#settingsModal .theme-card').forEach(card => {
        card.classList.toggle('active', card.dataset.theme === savedTheme);
      });

      // Слушатели вкладок
      document.querySelectorAll('#settingsModal .settings-tab').forEach(btn => {
        btn.onclick = () => switchSettingsTab(btn.dataset.tab);
      });

      // Слушатели язык/валюта
      document.querySelectorAll('#settingsModal #languageTab .settings-card').forEach(card => {
        card.onclick = () => selectSetting('language', card.dataset.value);
      });
      document.querySelectorAll('#settingsModal #currencyTab .settings-card').forEach(card => {
        card.onclick = () => selectSetting('currency', card.dataset.value);
      });

      // Слушатели темы
      document.querySelectorAll('#settingsModal .theme-card').forEach(card => {
        card.onclick = () => applySettingsTheme(card.dataset.theme);
      });

      // Поиск языков
      const langSearch = document.getElementById('languageSearch');
      if (langSearch) {
        langSearch.oninput = (e) => {
          const q = e.target.value.toLowerCase();
          document.querySelectorAll('#languageTab .settings-card').forEach(card => {
            const text = card.textContent.toLowerCase();
            card.style.display = text.includes(q) ? '' : 'none';
          });
        };
      }

      // Поиск валют
      const currSearch = document.getElementById('currencySearch');
      if (currSearch) {
        currSearch.oninput = (e) => {
          const q = e.target.value.toLowerCase();
          document.querySelectorAll('#currencyTab .settings-card').forEach(card => {
            const text = card.textContent.toLowerCase();
            card.style.display = text.includes(q) ? '' : 'none';
          });
        };
      }
    };

    // Переключение вкладок настроек
    const switchSettingsTab = (tab) => {
      document.querySelectorAll('#settingsModal .settings-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
      });
      document.querySelectorAll('#settingsModal .settings-tab-content').forEach(content => {
        content.classList.toggle('active', content.id === tab + 'Tab');
      });
    };

    // Выбор языка / валюты
    const selectSetting = (type, value) => {
      if (type === 'language') {
        localStorage.setItem('preferredLanguage', value);
        localStorage.setItem('app_language', value);
        document.querySelectorAll('#languageTab .settings-card').forEach(card => {
          card.classList.toggle('selected', card.dataset.value === value);
        });
        showToast('success', 'Язык изменён', `Выбран: ${value.toUpperCase()}`);
        // Применяем через Google Translate (google-translate.js загружен в head)
        if (typeof window.changeLanguageGoogle === 'function') {
          window.changeLanguageGoogle(value);
        }
      } else if (type === 'currency') {
        localStorage.setItem('preferredCurrency', value);
        localStorage.setItem('selectedCurrency', value);   // ключ currency.js
        // Сбрасываем кэш курса чтобы fetchCurrencyRate перезагрузился
        localStorage.removeItem('currencyRate');
        document.querySelectorAll('#currencyTab .settings-card').forEach(card => {
          card.classList.toggle('selected', card.dataset.value === value);
        });
        showToast('success', 'Валюта изменена', `Выбрана: ${value}`);
        // Перезагружаем курс и обновляем баланс
        fetchSelectedCurrencyRate(value).then(() => loadUserStats());
      }
    };

    // Применение темы из настроек
    const applySettingsTheme = (themeName) => {
      let resolved = themeName;
      if (themeName === 'system') {
        resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      document.documentElement.setAttribute('data-theme', resolved);
      theme.value = resolved;
      localStorage.setItem('theme', themeName); // сохраняем оригинальное (system/dark/light)

      document.querySelectorAll('#settingsModal .theme-card').forEach(card => {
        card.classList.toggle('active', card.dataset.theme === themeName);
      });

      const names = { light: 'Светлая', dark: 'Темная', system: 'Системная' };
      showToast('success', 'Тема изменена', names[themeName] || themeName);
    };

    // Выход из системы
    const handleLogout = async () => {
      try {
        const btnLogout = document.getElementById('btnLogout');
        if (btnLogout) {
          btnLogout.disabled = true;
          btnLogout.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Выход...';
        }

        const { error } = await supabase.auth.signOut();
        
        if (error) throw error;

        // Очистка локального хранилища
        localStorage.clear();
        sessionStorage.clear();

        showToast('success', 'Выход выполнен', 'Вы успешно вышли из системы');
        
        setTimeout(() => {
          window.location.href = 'login.html';
        }, 1500);

      } catch (error) {
        console.error('Logout error:', error);
        showToast('error', 'Ошибка', 'Не удалось выйти из системы');
        
        const btnLogout = document.getElementById('btnLogout');
        if (btnLogout) {
          btnLogout.disabled = false;
          btnLogout.innerHTML = '<i class="fas fa-sign-out-alt"></i> Выйти из аккаунта';
        }
      }
    };

    // Инициализация приложения
    const initializeApp = async () => {
      try {
        // Инициализация темы
        initializeTheme();

        // Проверка аутентификации
        const authUser = await checkAuth();
        
        if (authUser) {
          // АВТОРИЗОВАННЫЙ РЕЖИМ
          isAuthenticated.value = true;

          // Загрузка профиля
          const userData = await loadUserProfile(authUser.id);
          if (userData) {
            user.fullName = userData.fullName || userData.full_name || 'Пользователь';
            user.email = userData.email || '—';
            user.shortId = userData.shortId || userData.id?.substring(0, 8) + '...' || '--------';
          }

          // Загрузка статистики
          loadUserStats();

          // Настройка обработчиков событий
          setupEventListeners();

          // Показ приветственного сообщения
          setTimeout(() => {
            showToast('success', 'Добро пожаловать!', 'Успешный вход в InvestApp');
          }, 1000);

        } else {
          // ===== ГОСТЕВОЙ РЕЖИМ =====
          isAuthenticated.value = false;

          // Настройка гостевых обработчиков
          setupGuestEventListeners();

          // Приветствие гостя
          setTimeout(() => {
            showToast('info', 'Гостевой режим', 'Авторизуйтесь для полного доступа к функциям');
          }, 1000);
        }

        // Анимация появления
        setTimeout(() => {
          const card = document.querySelector('.main-card');
          if (card) {
            card.style.animation = 'cardAppear 1s cubic-bezier(0.34, 1.56, 0.64, 1)';
          }
        }, 300);

        // Эффекты наведения для фичей
        document.querySelectorAll('.feature').forEach(feature => {
          feature.addEventListener('mouseenter', function() {
            const icon = this.querySelector('.feature-icon');
            if (icon) {
              icon.style.transform = 'rotate(10deg) scale(1.2)';
              icon.style.boxShadow = '0 20px 40px rgba(37, 99, 235, 0.4)';
            }
            this.style.transform = 'translateY(-15px)';
          });
          
          feature.addEventListener('mouseleave', function() {
            const icon = this.querySelector('.feature-icon');
            if (icon) {
              icon.style.transform = '';
              icon.style.boxShadow = '';
            }
            this.style.transform = '';
          });
        });

        // Эффекты наведения для карточек статистики
        document.querySelectorAll('.stat-card').forEach(stat => {
          stat.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-8px) scale(1.05)';
            this.style.boxShadow = 'var(--shadow-2xl)';
          });
          
          stat.addEventListener('mouseleave', function() {
            this.style.transform = '';
            this.style.boxShadow = '';
          });
        });

      } catch (error) {
        console.error('App initialization error:', error);
        // Даже при ошибке — показываем гостевой режим
        isAuthenticated.value = false;
        setupGuestEventListeners();
        showToast('error', 'Ошибка', 'Не удалось загрузить данные. Доступен гостевой режим.');
      } finally {
        loading.value = false;
      }
    };

    // Инициализация при загрузке
    onMounted(() => {
      // Убираем заглушку-скелетон как только Vue смонтировался
      const skeleton = document.getElementById('appSkeleton');
      if (skeleton) skeleton.remove();

      // Загружаем актуальный курс при старте (async, не блокирует)
      const savedCur = localStorage.getItem('selectedCurrency') || 'USD';
      fetchSelectedCurrencyRate(savedCur);

      initializeApp();
      
      // Добавляем глобальную функцию showToast для использования из других скриптов
      window.showToast = showToast;

      // При смене валюты в других вкладках — перезагружаем статистику
      window.addEventListener('storage', (e) => {
        if (e.key === 'selectedCurrency' || e.key === 'currencyRate') {
          loadUserStats().catch(() => {});
        }
      });
    });

    return {
      loading,
      isAuthenticated,
      user,
      balance,
      profit,
      theme,
      toast,
      balanceDisplay,
      profitDisplay,
      profitColor,
      toggleTheme,
      showToast
    };
  }
}).mount('#app');