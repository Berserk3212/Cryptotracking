// Инициализация Supabase
const supabaseUrl = 'https://yvliktxpfglofdgvxrcl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2bGlrdHhwZmdsb2ZkZ3Z4cmNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExNDcyOTcsImV4cCI6MjA3NjcyMzI5N30.gJWKm8rZYDu-x4vdKIA4HJ8PZo_JcqBTpttseJCpDJU';

if (!window.supabase) {
  console.error('Supabase не загружен!');
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

    // ===== ВАЛИДАЦИЯ ПОЛЕЙ =====
    const validateEmail = (email) => {
      const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return re.test(email);
    };

    const validateField = (fieldName, value) => {
      errors[fieldName] = '';

      switch (fieldName) {
        case 'name':
          if (!value.trim()) {
            errors[fieldName] = 'Пожалуйста, введите ваше имя';
          } else if (value.trim().length < 2) {
            errors[fieldName] = 'Имя должно содержать минимум 2 символа';
          }
          break;

        case 'email':
          if (!value.trim()) {
            errors[fieldName] = 'Пожалуйста, введите email';
          } else if (!validateEmail(value)) {
            errors[fieldName] = 'Неверный формат email';
          }
          break;

        case 'password':
          if (!value) {
            errors[fieldName] = 'Пожалуйста, введите пароль';
          } else if (value.length < 6) {
            errors[fieldName] = 'Пароль должен содержать минимум 6 символов';
          } else if (form.confirmPassword && form.confirmPassword !== value) {
            errors['confirmPassword'] = 'Пароли не совпадают';
          } else {
            errors['confirmPassword'] = '';
          }
          break;

        case 'confirmPassword':
          if (!value) {
            errors[fieldName] = 'Пожалуйста, подтвердите пароль';
          } else if (value !== form.password) {
            errors[fieldName] = 'Пароли не совпадают';
          }
          break;
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
        // Регистрируем пользователя в Supabase
        const { data, error } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            data: {
              full_name: form.name
            }
          }
        });

        if (error) {
          console.error('Ошибка регистрации:', error);
          
          if (error.message.includes('already registered')) {
            showToast('Этот email уже зарегистрирован', 'Ошибка', 'error');
          } else if (error.message.includes('Password')) {
            showToast('Пароль не соответствует требованиям безопасности', 'Ошибка', 'error');
          } else {
            showToast(error.message || 'Ошибка регистрации', 'Ошибка', 'error');
          }
          return;
        }

        showToast(
          'Проверьте ваш email для подтверждения аккаунта',
          'Регистрация успешна!',
          'success'
        );

        // Очищаем форму
        form.name = '';
        form.email = '';
        form.password = '';
        form.confirmPassword = '';
        form.agreeTerms = false;

        // Перенаправляем на login через 2 секунды
        setTimeout(() => {
          window.location.href = '/frontend/login.html';
        }, 2000);

      } catch (error) {
        console.error('Неожиданная ошибка:', error);
        showToast('Произошла неожиданная ошибка. Попробуйте позже', 'Ошибка', 'error');
      } finally {
        loading.value = false;
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
      console.log('Vue приложение инициализировано');
      initializeTheme();

      // Добавляем анимационные классы после небольшой задержки
      setTimeout(() => {
        document.body.classList.add('loaded');
      }, 100);
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

      // Вычисляемые свойства
      isFormValid,

      // Методы
      validateField,
      clearError,
      onFieldInput,
      togglePasswordVisibility,
      toggleConfirmPasswordVisibility,
      handleRegister,
      toggleTheme,
      showToast,
      getFieldStatus,
      hasFieldError
    };
  }
}).mount('#app');