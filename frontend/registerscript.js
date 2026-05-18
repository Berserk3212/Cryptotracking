// Инициализация Supabase
const supabaseUrl = 'https://yvliktxpfglofdgvxrcl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2bGlrdHhwZmdsb2ZkZ3Z4cmNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExNDcyOTcsImV4cCI6MjA3NjcyMzI5N30.gJWKm8rZYDu-x4vdKIA4HJ8PZo_JcqBTpttseJCpDJU';

if (!window.supabase) {
  throw new Error('Supabase не загружен!');
}

const { createClient } = window.supabase;
const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

const { createApp, reactive, ref, computed } = Vue;

createApp({
  setup() {
    const supabase = supabaseClient;
    
    // ===== СОСТОЯНИЕ ФОРМЫ =====
    const form = reactive({
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      agreeTerms: false
    });

    // ===== СОСТОЯНИЕ ОШИБОК =====
    const errors = reactive({
      name: '',
      email: '',
      password: '',
      confirmPassword: ''
    });

    // ===== СОСТОЯНИЕ ВИДИМОСТИ ПАРОЛЕЙ =====
    const showPassword = ref(false);
    const showConfirmPassword = ref(false);

    // ===== СОСТОЯНИЕ ЗАГРУЗКИ =====
    const loading = ref(false);

    // ===== СОСТОЯНИЕ ПОДТВЕРЖДЕНИЯ EMAIL =====
    const emailSent = ref(false);
    const registeredEmail = ref('');
    const resendCooldown = ref(0);
    
    // ===== ТЕМА =====
    const currentTheme = ref(document.documentElement.getAttribute('data-theme') || 'dark');

    // ===== СОСТОЯНИЕ ТОСТА =====
    const toast = reactive({
      show: false,
      message: '',
      title: '',
      type: 'success', // success, error, warning
      icon: 'fas fa-check',
      id: 0
    });

    // ===== ВЫЧИСЛЯЕМЫЕ СВОЙСТВА =====
    const isFormValid = computed(() => {
      return (
        form.name.trim() !== '' &&
        form.email.trim() !== '' &&
        form.password.trim() !== '' &&
        form.confirmPassword.trim() !== '' &&
        form.agreeTerms &&
        !Object.values(errors).some(err => err !== '')
      );
    });

    // ===== САНИТИЗАЦИЯ =====
    // Удаляем символы, опасные для XSS и SQL-инъекций
    const sanitize = (value) => {
      return value
        .replace(/[<>"'`]/g, '')       // XSS-теги и кавычки
        .replace(/[;\\]/g, '')          // SQL: терминаторы и экранирование
        .replace(/--/g, '')             // SQL: комментарии
        .replace(/\/\*/g, '');          // SQL: блочные комментарии
    };

    // ===== ВАЛИДАЦИЯ ПОЛЕЙ =====
    // RFC 5321/5322: local@domain.tld, без consecutive dots, допустимые символы
    const validateEmail = (email) => {
      const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z]{2,}$/;
      return re.test(email) && !email.includes('..');
    };

    const validateField = (fieldName, value) => {
      // Если value не передан (вызов из @blur без аргумента), читаем из формы
      const raw = value !== undefined ? value : form[fieldName];
      errors[fieldName] = '';

      switch (fieldName) {
        case 'name': {
          const trimmed = typeof raw === 'string' ? raw.trim() : '';
          if (!trimmed) {
            errors.name = 'Введите имя пользователя';
            break;
          }
          if (trimmed.length < 2) {
            errors.name = 'Имя должно содержать минимум 2 символа';
            break;
          }
          if (trimmed.length > 50) {
            errors.name = 'Имя не должно превышать 50 символов';
            break;
          }
          if (sanitize(trimmed) !== trimmed) {
            errors.name = 'Имя содержит недопустимые символы';
            break;
          }
          // Только буквы любых алфавитов, цифры, пробел, дефис, точка, апостроф
          if (!/^[\p{L}\p{N} .'-]+$/u.test(trimmed)) {
            errors.name = 'Имя содержит недопустимые символы';
          }
          break;
        }

        case 'email': {
          const trimmed = typeof raw === 'string' ? raw.trim() : '';
          if (!trimmed) {
            errors.email = 'Введите email адрес';
            break;
          }
          if (trimmed.length > 254) {
            errors.email = 'Email адрес слишком длинный';
            break;
          }
          if (!validateEmail(trimmed)) {
            errors.email = 'Введите корректный email адрес';
          }
          break;
        }

        case 'password': {
          const val = typeof raw === 'string' ? raw : '';
          if (!val) {
            errors.password = 'Введите пароль';
            break;
          }
          if (val.length < 8) {
            errors.password = 'Пароль должен содержать минимум 8 символов';
            break;
          }
          if (val.length > 128) {
            errors.password = 'Пароль слишком длинный (максимум 128 символов)';
            break;
          }
          if (!/[A-Z]/.test(val)) {
            errors.password = 'Пароль должен содержать хотя бы одну заглавную букву';
            break;
          }
          if (!/[a-z]/.test(val)) {
            errors.password = 'Пароль должен содержать хотя бы одну строчную букву';
            break;
          }
          if (!/[0-9]/.test(val)) {
            errors.password = 'Пароль должен содержать хотя бы одну цифру';
            break;
          }
          if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(val)) {
            errors.password = 'Пароль должен содержать хотя бы один спецсимвол (!@#$%^&* и др.)';
            break;
          }
          // Пересчитываем confirmPassword при изменении пароля
          if (form.confirmPassword) {
            errors.confirmPassword = form.confirmPassword !== val ? 'Пароли не совпадают' : '';
          }
          break;
        }

        case 'confirmPassword': {
          const val = typeof raw === 'string' ? raw : '';
          if (!val) {
            errors.confirmPassword = 'Подтвердите пароль';
            break;
          }
          if (val !== form.password) {
            errors.confirmPassword = 'Пароли не совпадают';
          }
          break;
        }
      }
    };

    const onFieldInput = (fieldName, value) => {
      form[fieldName] = value;
      validateField(fieldName, value);
    };
    
    const clearError = (fieldName) => {
      errors[fieldName] = '';
    };

    // ===== ПОКАЗ ТОСТА =====
    const showToast = (message, title = '', type = 'success') => {
      const icons = {
        success: 'fas fa-check',
        error: 'fas fa-times',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
      };
      
      toast.message = message;
      toast.title = title;
      toast.type = type;
      toast.icon = icons[type] || 'fas fa-info-circle';
      toast.show = true;
      toast.id = Date.now();

      setTimeout(() => {
        toast.show = false;
      }, 5000);
    };

    // ===== ПЕРЕКЛЮЧЕНИЕ ВИДИМОСТИ ПАРОЛЯ =====
    const togglePasswordVisibility = () => {
      showPassword.value = !showPassword.value;
    };

    const toggleConfirmPasswordVisibility = () => {
      showConfirmPassword.value = !showConfirmPassword.value;
    };

    // ===== ОБРАБОТКА РЕГИСТРАЦИИ =====
    const handleRegister = async () => {
      // Валидируем все поля
      Object.keys(form).forEach(key => {
        if (key !== 'agreeTerms') {
          validateField(key, form[key]);
        }
      });

      if (!isFormValid.value) {
        showToast('Пожалуйста, исправьте ошибки в форме', 'Ошибка валидации', 'error');
        return;
      }

      loading.value = true;

      try {
        // Нормализуем данные перед отправкой
        const safeName  = sanitize(form.name.trim()).slice(0, 50);
        const safeEmail = form.email.trim().slice(0, 254);
        // Пароль не трimmируем и не санитизируем — спецсимволы в нём допустимы
        const safePassword = form.password.slice(0, 128);

        // Регистрируем пользователя в Supabase
        const { data, error } = await supabase.auth.signUp({
          email: safeEmail,
          password: safePassword,
          options: {
            data: {
              full_name: safeName
            },
            emailRedirectTo: window.location.origin + '/frontend/login.html'
          }
        });

        if (error) {
          if (error.status === 500 || error.message?.includes('unexpected_failure')) {
            showToast(
              'Сервис временно недоступен. Попробуйте через несколько минут.',
              'Ошибка сервера',
              'warning'
            );
          } else if (error.message.includes('already registered') || error.message.includes('User already registered')) {
            showToast('Этот email уже зарегистрирован', 'Ошибка', 'error');
          } else if (error.message.includes('Password')) {
            showToast('Пароль не соответствует требованиям безопасности', 'Ошибка', 'error');
          } else {
            showToast(error.message || 'Ошибка регистрации', 'Ошибка', 'error');
          }
          return;
        }

        // Если identities пустой — email уже зарегистрирован (Supabase не раскрывает это через ошибку)
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          showToast(
            'Этот email уже зарегистрирован. Войдите или восстановите пароль.',
            'Аккаунт существует',
            'error'
          );
          return;
        }

        // Если session === null — Supabase ждёт подтверждения email
        if (!data.session) {
          registeredEmail.value = safeEmail;
          emailSent.value = true;
          return;
        }

        // Сессия сразу (подтверждение отключено) — редирект
        showToast('Аккаунт создан!', 'Успешно', 'success');
        setTimeout(() => { window.location.href = 'index.html'; }, 1500);

      } catch (err) {
        // HTTP 500 от Supabase — обычно превышен лимит писем (2/час на free-плане)
        const is500 = err?.status === 500 || err?.message?.includes('500') || String(err).includes('500');
        if (is500) {
          showToast(
            'Сервис временно недоступен. Попробуйте через несколько минут.',
            'Ошибка отправки',
            'warning'
          );
        } else {
          showToast('Произошла неожиданная ошибка. Попробуйте позже', 'Ошибка', 'error');
        }
      } finally {
        loading.value = false;
      }
    };

    // ===== ПОВТОРНАЯ ОТПРАВКА ПИСЬМА =====
    const resendConfirmation = async () => {
      if (resendCooldown.value > 0 || !registeredEmail.value) return;
      try {
        const { error } = await supabase.auth.resend({
          type: 'signup',
          email: registeredEmail.value
        });
        if (error) throw error;
        showToast('Письмо отправлено повторно', 'Готово', 'success');
        // Блокируем кнопку на 60 секунд
        resendCooldown.value = 60;
        const timer = setInterval(() => {
          resendCooldown.value--;
          if (resendCooldown.value <= 0) clearInterval(timer);
        }, 1000);
      } catch (_) {
        showToast('Не удалось отправить письмо. Попробуйте позже.', 'Ошибка', 'error');
      }
    };

    // ===== ПЕРЕКЛЮЧЕНИЕ ТЕМЫ =====
    const initializeTheme = () => {
      const saved = localStorage.getItem('theme');
      if (saved) {
        currentTheme.value = saved;
      } else {
        currentTheme.value = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      document.documentElement.setAttribute('data-theme', currentTheme.value);
    };

    const toggleTheme = () => {
      currentTheme.value = currentTheme.value === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', currentTheme.value);
      localStorage.setItem('theme', currentTheme.value);
    };

    // ===== ЖИЗНЕННЫЙ ЦИКЛ =====
    const onMounted = () => {
      initializeTheme();

      // Добавляем анимационные классы после небольшой задержки
      setTimeout(() => {
        document.body.classList.add('loaded');
      }, 100);

      // Проверяем, разрешена ли регистрация (системные настройки)
      supabase.from('system_settings')
        .select('key, value')
        .eq('key', 'registration_enabled')
        .maybeSingle()
        .then(({ data }) => {
          const enabled = data ? (data.value === 'true' || data.value === true) : true;
          if (!enabled) {
            const formEl = document.querySelector('.register-form, form, .auth-form');
            if (formEl) formEl.style.display = 'none';
            const msg = document.createElement('div');
            msg.style.cssText = 'text-align:center;padding:2rem;color:#e2e8f0;font-size:1rem';
            msg.innerHTML = '<p>⚠️ Регистрация новых пользователей временно отключена.</p>'
              + '<p style="margin-top:.5rem"><a href="login.html" style="color:#6366f1">Войти в существующий аккаунт</a></p>';
            (formEl?.parentNode || document.body).appendChild(msg);
          }
        })
        .catch(() => {});
    };

    // Вызываем onMounted сразу
    onMounted();

    // ===== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ =====
    const getFieldStatus = (fieldName) => {
      if (!form[fieldName]) return null;
      return errors[fieldName] ? 'error' : 'success';
    };

    const hasFieldError = (fieldName) => {
      return errors[fieldName] !== '';
    };

    return {
      // Состояние
      form,
      errors,
      showPassword,
      showConfirmPassword,
      loading,
      toast,
      currentTheme,
      emailSent,
      registeredEmail,
      resendCooldown,

      // Вычисляемые свойства
      isFormValid,

      // Методы
      validateField,
      clearError,
      onFieldInput,
      togglePasswordVisibility,
      toggleConfirmPasswordVisibility,
      handleRegister,
      resendConfirmation,
      toggleTheme,
      showToast,
      getFieldStatus,
      hasFieldError
    };
  }
}).mount('#app');