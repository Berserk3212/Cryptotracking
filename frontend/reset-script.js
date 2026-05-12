const { createApp, ref, reactive, computed, onMounted } = Vue;

createApp({
  setup() {
    // Состояние формы
    const form = reactive({
      password: '',
      confirm: ''
    });

    const errors = reactive({
      password: '',
      confirm: ''
    });

    const showPassword = ref(false);
    const showConfirm = ref(false);
    const loading = ref(false);
    const theme = ref('dark');
    const invalidLink = ref(false);
    const resetSuccess = ref(false);

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

    // Расчёт сложности пароля
    const passwordStrength = computed(() => {
      const pwd = form.password;
      if (!pwd) return 0;

      let strength = 0;
      if (pwd.length >= 6) strength++;
      if (pwd.length >= 8) strength++;
      if (/[A-Z]/.test(pwd)) strength++;
      if (/[0-9]/.test(pwd)) strength++;
      if (/[^A-Za-z0-9]/.test(pwd)) strength++;

      return strength;
    });

    const strengthPercent = computed(() => {
      return (passwordStrength.value / 5) * 100;
    });

    const strengthColor = computed(() => {
      const s = passwordStrength.value;
      if (s <= 1) return '#ef4444';
      if (s <= 2) return '#f97316';
      if (s <= 3) return '#eab308';
      if (s <= 4) return '#22c55e';
      return '#10b981';
    });

    const strengthText = computed(() => {
      const s = passwordStrength.value;
      if (s <= 1) return 'Очень слабый';
      if (s <= 2) return 'Слабый';
      if (s <= 3) return 'Средний';
      if (s <= 4) return 'Хороший';
      return 'Надёжный';
    });

    const canSubmit = computed(() => {
      return form.password.length >= 6 &&
             form.confirm.length > 0 &&
             form.password === form.confirm &&
             !errors.password &&
             !errors.confirm;
    });

    // Валидация полей
    const validators = {
      password: (value) => {
        if (!value) return 'Введите новый пароль';
        if (value.length < 6) return 'Пароль должен содержать минимум 6 символов';
        return '';
      },
      confirm: (value) => {
        if (!value) return 'Подтвердите пароль';
        if (value !== form.password) return 'Пароли не совпадают';
        return '';
      }
    };

    const validateField = (field) => {
      const value = form[field];
      errors[field] = validators[field](value);
      return !errors[field];
    };

    const clearError = (field) => {
      if (errors[field]) {
        errors[field] = '';
      }
    };

    const onPasswordInput = () => {
      clearError('password');
      // Перепроверяем подтверждение, если оно заполнено
      if (form.confirm) {
        validateField('confirm');
      }
    };

    // Уведомления
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

      const themeBtn = document.querySelector('.theme-toggle');
      if (themeBtn) {
        themeBtn.style.transform = 'scale(1.1)';
        setTimeout(() => {
          themeBtn.style.transform = '';
        }, 300);
      }

      showToast('info', 'Тема изменена',
        newTheme === 'dark'
          ? 'Тёмная тема активирована'
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

    // Сброс пароля
    const handleReset = async () => {
      // Валидируем оба поля
      const passwordValid = validateField('password');
      const confirmValid = validateField('confirm');

      if (!passwordValid || !confirmValid) {
        showToast('error', 'Ошибка', 'Пожалуйста, проверьте введённые данные');

        document.querySelectorAll('.form-field.error').forEach(field => {
          field.style.animation = 'errorShake 0.5s ease';
          setTimeout(() => {
            field.style.animation = '';
          }, 500);
        });
        return;
      }

      loading.value = true;

      const submitBtn = document.querySelector('.submit-btn');
      if (submitBtn) {
        submitBtn.style.transform = 'scale(0.98)';
      }

      try {
        const { error } = await supabase.auth.updateUser({
          password: form.password
        });

        if (error) throw error;

        showToast('success', 'Пароль изменён', 'Ваш пароль успешно обновлён!');

        resetSuccess.value = true;

        // Перенаправление на страницу входа
        setTimeout(() => {
          window.location.href = 'login.html';
        }, 2500);

      } catch (error) {
        console.error('Password reset error:', error);

        let message = 'Ошибка при смене пароля';
        if (error.message.includes('Password should be at least 6 characters')) {
          message = 'Пароль должен содержать минимум 6 символов';
        } else if (error.message.includes('Auth session missing')) {
          message = 'Ссылка для сброса пароля устарела. Запросите новую.';
          invalidLink.value = true;
        } else if (error.message.includes('same_password')) {
          message = 'Новый пароль не может совпадать со старым';
        }

        showToast('error', 'Ошибка', message);

        const formEl = document.querySelector('.login-form');
        if (formEl) {
          formEl.style.animation = 'errorShake 0.5s ease';
          setTimeout(() => {
            formEl.style.animation = '';
          }, 500);
        }

      } finally {
        loading.value = false;
        if (submitBtn) {
          submitBtn.style.transform = '';
        }
      }
    };

    // Инициализация
    onMounted(async () => {
      // Инициализируем тему
      initializeTheme();

      // Проверяем URL-хеш на наличие токена восстановления
      const hash = window.location.hash.substring(1);
      const urlParams = new URLSearchParams(hash);
      const type = urlParams.get('type');
      const accessToken = urlParams.get('access_token');
      const refreshToken = urlParams.get('refresh_token') || '';

      if (type !== 'recovery' || !accessToken) {
        invalidLink.value = true;
        showToast('error', 'Ошибка', 'Недействительная ссылка для сброса пароля');
        return;
      }

      // Устанавливаем сессию Supabase из токена
      try {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });

        if (error) {
          console.error('Session error:', error);
          invalidLink.value = true;
          showToast('error', 'Ошибка', 'Ссылка для сброса пароля устарела или недействительна');
          return;
        }

        // Убираем хеш из URL для чистоты
        window.history.replaceState({}, '', window.location.pathname);

        showToast('info', 'Сброс пароля', 'Введите новый пароль для вашего аккаунта');

      } catch (err) {
        console.error('Session setup error:', err);
        invalidLink.value = true;
        showToast('error', 'Ошибка', 'Не удалось обработать ссылку для сброса');
      }

      // Анимации полей ввода
      document.querySelectorAll('.input-container input').forEach(input => {
        input.addEventListener('focus', function () {
          this.parentElement.style.transform = 'translateY(-3px)';
          this.parentElement.style.boxShadow = 'var(--shadow-xl)';
        });

        input.addEventListener('blur', function () {
          this.parentElement.style.transform = '';
          this.parentElement.style.boxShadow = '';
        });
      });

      // Анимация появления карточки
      const card = document.querySelector('.login-card');
      if (card) {
        card.style.animation = 'cardAppear 1s cubic-bezier(0.34, 1.56, 0.64, 1)';
      }

      // Автофокус на первое поле
      setTimeout(() => {
        const passwordInput = document.getElementById('newPassword');
        if (passwordInput && !invalidLink.value) {
          passwordInput.focus();
        }
      }, 800);

      console.log('Страница сброса пароля инициализирована');
    });

    return {
      form,
      errors,
      showPassword,
      showConfirm,
      loading,
      theme,
      toast,
      invalidLink,
      resetSuccess,
      strengthPercent,
      strengthColor,
      strengthText,
      canSubmit,
      validateField,
      clearError,
      onPasswordInput,
      toggleTheme,
      handleReset
    };
  }
}).mount('#app');