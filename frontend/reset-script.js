// Supabase Configuration
const supabaseUrl = 'https://yvliktxpfglofdgvxrcl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2bGlrdHhwZmdsb2ZkZ3Z4cmNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExNDcyOTcsImV4cCI6MjA3NjcyMzI5N30.gJWKm8rZYDu-x4vdKIA4HJ8PZo_JcqBTpttseJCpDJU';

// Initialize Supabase
const supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

document.addEventListener('DOMContentLoaded', function() {
  // DOM Elements
  const resetForm = document.getElementById('resetForm');
  const newPasswordInput = document.getElementById('newPassword');
  const confirmPasswordInput = document.getElementById('confirmPassword');
  const passwordToggle = document.getElementById('passwordToggle');
  const btnResetPassword = document.getElementById('btnResetPassword');
  const resetMessage = document.getElementById('resetMessage');
  const passwordStrength = document.getElementById('passwordStrength');

  // Check if this is a valid password reset request
  const urlParams = new URLSearchParams(window.location.hash.substring(1));
  const type = urlParams.get('type');
  const accessToken = urlParams.get('access_token');

  if (type !== 'recovery' || !accessToken) {
    showMessage('Недействительная ссылка для сброса пароля', 'error');
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 3000);
    return;
  }

  // Set Supabase session from URL token
  supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: urlParams.get('refresh_token') || ''
  }).then(({ error }) => {
    if (error) {
      showMessage('Ссылка для сброса пароля недействительна или устарела', 'error');
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 3000);
    }
  });

  // Password Toggle
  passwordToggle.addEventListener('click', function() {
    const isPassword = newPasswordInput.type === 'password';
    newPasswordInput.type = isPassword ? 'text' : 'password';
    this.querySelector('i').className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
    this.setAttribute('aria-label', isPassword ? 'Скрыть пароль' : 'Показать пароль');
  });

  // Password Strength Check
  newPasswordInput.addEventListener('input', function() {
    checkPasswordStrength(this.value);
    validatePasswords();
  });

  confirmPasswordInput.addEventListener('input', validatePasswords);

  // Form Submission
  resetForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    await resetPassword();
  });

  // Password Strength Calculation
  function checkPasswordStrength(password) {
    if (!password) {
      passwordStrength.classList.remove('visible', 'weak', 'medium', 'strong');
      return;
    }

    passwordStrength.classList.add('visible');

    let strength = 0;
    if (password.length >= 6) strength++;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    passwordStrength.classList.remove('weak', 'medium', 'strong');
    
    if (strength <= 2) {
      passwordStrength.classList.add('weak');
      passwordStrength.querySelector('.strength-text').textContent = 'Слабый пароль';
    } else if (strength <= 4) {
      passwordStrength.classList.add('medium');
      passwordStrength.querySelector('.strength-text').textContent = 'Средний пароль';
    } else {
      passwordStrength.classList.add('strong');
      passwordStrength.querySelector('.strength-text').textContent = 'Надежный пароль';
    }
  }

  // Form Validation
  function validateForm() {
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (!newPassword || newPassword.length < 6) {
      showMessage('Пароль должен содержать минимум 6 символов', 'error');
      newPasswordInput.focus();
      return false;
    }

    if (newPassword !== confirmPassword) {
      showMessage('Пароли не совпадают', 'error');
      confirmPasswordInput.focus();
      return false;
    }

    return true;
  }

  function validatePasswords() {
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    
    btnResetPassword.disabled = !newPassword || !confirmPassword || newPassword !== confirmPassword;
  }

  // Password Reset Function
  async function resetPassword() {
    const newPassword = newPasswordInput.value;

    // Show loading state
    btnResetPassword.classList.add('loading');
    btnResetPassword.disabled = true;

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      showMessage('Пароль успешно изменен! Перенаправление на страницу входа...', 'success');
      
      // Clear form
      resetForm.reset();
      passwordStrength.classList.remove('visible');

      // Redirect to login
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 2000);

    } catch (error) {
      console.error('Password reset error:', error);
      
      let errorMessage = 'Ошибка при смене пароля';
      if (error.message.includes('Password should be at least 6 characters')) {
        errorMessage = 'Пароль должен содержать минимум 6 символов';
      } else if (error.message.includes('Auth session missing')) {
        errorMessage = 'Ссылка для сброса пароля устарела';
      }

      showMessage(errorMessage, 'error');
    } finally {
      btnResetPassword.classList.remove('loading');
      validatePasswords();
    }
  }

  // Message Display
  function showMessage(message, type = 'info') {
    resetMessage.textContent = message;
    resetMessage.className = `reset-message visible ${type}`;
    
    // Auto-hide info messages
    if (type === 'info') {
      setTimeout(() => {
        resetMessage.classList.remove('visible');
      }, 5000);
    }
  }

  // Initialize form validation
  validatePasswords();
});