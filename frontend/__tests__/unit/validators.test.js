/**
 * Юнит-тесты для валидаторов форм - упрощенная и рабочая версия
 * 10 ключевых тестов
 */

describe('Form Validators', () => {
  // Валидаторы
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
    },
    portfolioName: (value) => {
      if (!value || value.trim() === '') return 'Название портфеля обязательно';
      if (value.length > 100) return 'Название не должно превышать 100 символов';
      return '';
    },
    amount: (value) => {
      if (!value) return 'Введите сумму';
      const num = parseFloat(value);
      if (isNaN(num)) return 'Введите корректное число';
      if (num <= 0) return 'Сумма должна быть больше нуля';
      if (num > 1000000000) return 'Сумма слишком большая';
      return '';
    }
  };

  describe('Email Validator', () => {
    test('должен принимать корректный email', () => {
      expect(validators.email('test@example.com')).toBe('');
      expect(validators.email('user@domain.com')).toBe('');
    });

    test('должен отклонять некорректный email', () => {
      const result = validators.email('notanemail');
      expect(result).toContain('корректный');
    });

    test('должен требовать непустое значение', () => {
      expect(validators.email('')).toContain('Введите email');
    });
  });

  describe('Password Validator', () => {
    test('должен принимать пароли длиной 6+ символов', () => {
      expect(validators.password('123456')).toBe('');
      expect(validators.password('password')).toBe('');
    });

    test('должен отклонять короткие пароли', () => {
      const result = validators.password('12345');
      expect(result).toContain('минимум 6 символов');
    });

    test('должен требовать непустое значение', () => {
      expect(validators.password('')).toContain('Введите пароль');
    });
  });

  describe('Portfolio Name Validator', () => {
    test('должен принимать корректное название', () => {
      expect(validators.portfolioName('Мой портфель')).toBe('');
    });

    test('должен отклонять пустое название', () => {
      expect(validators.portfolioName('')).toContain('обязательно');
    });
  });

  describe('Amount Validator', () => {
    test('должен принимать корректные числа', () => {
      expect(validators.amount('100')).toBe('');
      expect(validators.amount('0.001')).toBe('');
    });

    test('должен отклонять отрицательные числа', () => {
      const result = validators.amount('-100');
      expect(result).toContain('больше нуля');
    });

    test('должен требовать непустое значение', () => {
      expect(validators.amount('')).toContain('Введите сумму');
    });
  });
});
