   const { createApp, ref, reactive, onMounted } = Vue;

    createApp({
      setup() {
        // Состояние формы
        const form = reactive({
          email: '',
          password: '',
          rememberMe: false
        });

        const errors = reactive({
          email: '',
          password: ''
        });

        const showPassword = ref(false);
        const loading = ref(false);
        const theme = ref('dark');

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

        // Валидация
        const validators = {
          email: (value) => {
            if (!value) return 'Введите email адрес';
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
              return 'Введите корректный email адрес';
            }
            return '';
          },
          password: (value) => {
            if (!value) return 'Введите пароль';
            if (value.length < 6) return 'Пароль должен содержать минимум 6 символов';
            return '';
          }
        };

        const validateField = (field) => {
          const value = form[field];
          errors[field] = validators[field](value);
          return !errors[field];
        };

        const validateForm = () => {
          let isValid = true;
          Object.keys(validators).forEach(field => {
            if (!validateField(field)) {
              isValid = false;
            }
          });
          return isValid;
        };

        const clearError = (field) => {
          if (errors[field]) {
            errors[field] = '';
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

        // Переключение видимости пароля
        const togglePasswordVisibility = () => {
          showPassword.value = !showPassword.value;
          
          const toggleBtn = document.querySelector('.password-toggle');
          if (toggleBtn) {
            toggleBtn.style.transform = 'translateY(-50%) scale(0.8)';
            setTimeout(() => {
              toggleBtn.style.transform = 'translateY(-50%)';
            }, 200);
          }
        };

        // Вход
        const handleLogin = async () => {
          if (!validateForm()) {
            showToast('error', 'Ошибка', 'Пожалуйста, проверьте введенные данные');
            
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
            // Имитация задержки API
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            const { data, error } = await supabase.auth.signInWithPassword({
              email: form.email.trim(),
              password: form.password
            });

            if (error) throw error;

            // Логируем вход для админ-панели
            try {
              await supabase.from('activity_logs').insert({
                user_id:    data.user.id,
                user_email: data.user.email,
                action:     'login',
                section:    'auth',
                details:    {},
              });
            } catch { /* логгирование не должно ломать вход */ }

            if (form.rememberMe) {
              localStorage.setItem('rememberMe', 'true');
              localStorage.setItem('userEmail', form.email.trim());
            }

            showToast('success', 'Успешный вход', 'Добро пожаловать в InvestApp!');

            document.querySelectorAll('.success').forEach(el => {
              el.style.animation = 'iconPulse 0.8s ease';
            });

            const card = document.querySelector('.login-card');
            if (card) {
              card.style.animation = 'cardAppear 0.5s ease reverse forwards';
            }

            setTimeout(() => {
              window.location.href = 'index.html';
            }, 1500);

          } catch (err) {
            let message = 'Произошла ошибка при входе';
            if (err.message === 'Invalid login credentials') {
              message = 'Неверный email или пароль';
            } else if (err.message && err.message.includes('Email not confirmed')) {
              message = 'Подтвердите ваш email перед входом';
            }

            showToast('error', 'Ошибка входа', message);
            
            const formEl = document.querySelector('.login-form');
            if (formEl) {
              formEl.style.animation = 'errorShake 0.5s ease';
              setTimeout(() => {
                formEl.style.animation = '';
              }, 500);
            }

            if (!errors.email && !errors.password) {
              errors.password = message;
              setTimeout(() => {
                const passwordField = document.querySelector('.form-field:nth-child(2)');
                if (passwordField) {
                  passwordField.classList.add('error');
                  passwordField.style.animation = 'errorShake 0.5s ease';
                  setTimeout(() => {
                    passwordField.style.animation = '';
                  }, 500);
                }
              }, 100);
            }

          } finally {
            loading.value = false;
            if (submitBtn) {
              submitBtn.style.transform = '';
            }
          }
        };

        // Восстановление пароля
        const handleForgotPassword = async () => {
          if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
            showToast('error', 'Ошибка', 'Введите email для восстановления пароля');
            return;
          }

          loading.value = true;

          try {
            const { error } = await supabase.auth.resetPasswordForEmail(form.email.trim(), {
              redirectTo: window.location.origin + '/frontend/reset-password.html'
            });

            if (error) throw error;

            showToast(
              'success', 
              'Письмо отправлено', 
              'Инструкции по восстановлению пароля отправлены на ваш email'
            );

            const forgotBtn = document.querySelector('.forgot-password');
            if (forgotBtn) {
              forgotBtn.style.color = 'var(--success)';
              forgotBtn.style.transform = 'translateX(5px) scale(1.1)';
              forgotBtn.innerHTML = '<i class="fas fa-check"></i> Отправлено';
              setTimeout(() => {
                forgotBtn.style.color = '';
                forgotBtn.style.transform = '';
                forgotBtn.innerHTML = 'Забыли пароль?';
              }, 3000);
            }

          } catch (_) {
            showToast('error', 'Ошибка', 'Не удалось отправить письмо. Попробуйте позже.');
          } finally {
            loading.value = false;
          }
        };

        // Вход через Google
        const socialLogin = async (provider) => {
          loading.value = true;
          
          const btn = document.querySelector(`.social-btn.${provider}`);
          if (btn) {
            btn.style.transform = 'translateY(-3px) scale(0.95)';
            btn.style.opacity = '0.8';
          }

          try {
            const { data, error } = await supabase.auth.signInWithOAuth({
              provider: provider,
              options: {
                redirectTo: window.location.origin + '/frontend/index.html'
              }
            });

            if (error) throw error;

          } catch (_) {
            showToast('error', 'Ошибка', `Не удалось войти через ${provider}`);
          } finally {
            loading.value = false;
            if (btn) {
              btn.style.transform = '';
              btn.style.opacity = '';
            }
          }
        };

        // Переключение темы
        const toggleTheme = () => {
          const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
          const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
          
          // Обновляем состояние темы
          theme.value = newTheme;
          
          // Меняем атрибут data-theme
          document.documentElement.setAttribute('data-theme', newTheme);
          
          // Сохраняем в localStorage
          localStorage.setItem('theme', newTheme);
          
          // Анимация кнопки
          const themeBtn = document.querySelector('.theme-toggle');
          if (themeBtn) {
            themeBtn.style.transform = 'scale(1.1)';
            setTimeout(() => {
              themeBtn.style.transform = '';
            }, 300);
          }
          
          // Показываем уведомление
          showToast('info', 'Тема изменена', 
            newTheme === 'dark' 
              ? 'Темная тема активирована' 
              : 'Светлая тема активирована'
          );
        };

        // Инициализация темы
        const initializeTheme = () => {
          // 1. Проверяем сохраненную тему в localStorage
          const savedTheme = localStorage.getItem('theme');
          
          // 2. Если есть сохраненная тема - используем её
          if (savedTheme) {
            document.documentElement.setAttribute('data-theme', savedTheme);
            theme.value = savedTheme;
          } else {
            // 3. Если нет сохраненной темы, используем текущую из HTML (или 'dark' по умолчанию)
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
            theme.value = currentTheme;
            localStorage.setItem('theme', currentTheme);
          }
        };

        // Инициализация
        onMounted(async () => {
          // Инициализируем тему
          initializeTheme();


          // Загружаем сохраненный email
          if (localStorage.getItem('rememberMe') === 'true') {
            const savedEmail = localStorage.getItem('userEmail');
            if (savedEmail) {
              form.email = savedEmail;
              form.rememberMe = true;
              
              const checkbox = document.querySelector('.checkbox-box');
              if (checkbox) {
                checkbox.style.animation = 'iconPulse 1s ease';
              }
            }
          }

          // Автофокус на поле email
          setTimeout(() => {
            const emailInput = document.getElementById('email');
            if (emailInput) {
              emailInput.focus();
              emailInput.parentElement.style.transform = 'translateY(-5px)';
              emailInput.parentElement.style.boxShadow = '0 20px 40px rgba(37, 99, 235, 0.3)';
              setTimeout(() => {
                emailInput.parentElement.style.transform = '';
                emailInput.parentElement.style.boxShadow = '';
              }, 800);
            }
          }, 800);

          // Проверяем токен восстановления пароля
          const hash = window.location.hash.substring(1);
          const params = new URLSearchParams(hash);
          const tokenType = params.get('type');

          const errorCode = params.get('error_code');
          const errorParam = params.get('error');

          if (errorParam === 'access_denied' || errorCode === 'otp_expired') {
            window.history.replaceState({}, '', window.location.pathname);
            showToast(
              'error',
              'Ссылка устарела',
              'Срок действия ссылки истёк. Зарегистрируйтесь снова, чтобы получить новое письмо.'
            );
          } else if (tokenType === 'recovery') {
            showToast(
              'success',
              'Восстановление доступа',
              'Перейдите по ссылке из письма для сброса пароля'
            );
            window.history.replaceState({}, '', window.location.pathname);
          } else if (tokenType === 'signup' || tokenType === 'email_change') {
            // Supabase v2 автоматически обрабатывает хэш и создаёт сессию
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
              window.history.replaceState({}, '', window.location.pathname);
              showToast('success', 'Email подтверждён!', 'Ваш аккаунт активирован. Добро пожаловать!', 3000);
              setTimeout(() => { window.location.href = 'index.html'; }, 2000);
            }
          }

          // Анимации полей ввода
          document.querySelectorAll('.input-container input').forEach(input => {
            input.addEventListener('focus', function() {
              this.parentElement.style.transform = 'translateY(-3px)';
              this.parentElement.style.boxShadow = 'var(--shadow-xl)';
            });
            
            input.addEventListener('blur', function() {
              this.parentElement.style.transform = '';
              this.parentElement.style.boxShadow = '';
            });
          });

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

          // Анимация появления карточки
          const card = document.querySelector('.login-card');
          if (card) {
            card.style.animation = 'cardAppear 1s cubic-bezier(0.34, 1.56, 0.64, 1)';
          }
        });

        return {
          form,
          errors,
          showPassword,
          loading,
          theme,
          toast,
          validateField,
          clearError,
          togglePasswordVisibility,
          handleLogin,
          handleForgotPassword,
          socialLogin,
          toggleTheme
        };
      }
    }).mount('#app');