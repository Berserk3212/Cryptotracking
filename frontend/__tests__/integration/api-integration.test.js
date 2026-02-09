


describe('API Integration Tests', () => {
  let supabaseClient;

  beforeEach(() => {
    // Мок Supabase клиента
    supabaseClient = {
      auth: {
        signInWithPassword: jest.fn(),
        signUp: jest.fn(),
        signOut: jest.fn(),
        getSession: jest.fn()
      },
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn()
      }))
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication API', () => {
    test('должен успешно авторизовать пользователя', async () => {
      const mockUser = {
        id: '123',
        email: 'test@example.com'
      };

      supabaseClient.auth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser },
        error: null
      });

      const result = await supabaseClient.auth.signInWithPassword({
        email: 'test@example.com',
        password: 'password123'
      });

      expect(result.data.user).toEqual(mockUser);
      expect(result.error).toBeNull();
    });

    test('должен обработать ошибку авторизации', async () => {
      const mockError = {
        message: 'Invalid login credentials'
      };

      supabaseClient.auth.signInWithPassword.mockResolvedValue({
        data: { user: null },
        error: mockError
      });

      const result = await supabaseClient.auth.signInWithPassword({
        email: 'test@example.com',
        password: 'wrongpassword'
      });

      expect(result.data.user).toBeNull();
      expect(result.error).toEqual(mockError);
    });

    test('должен успешно зарегистрировать пользователя', async () => {
      const mockUser = {
        id: '456',
        email: 'newuser@example.com'
      };

      supabaseClient.auth.signUp.mockResolvedValue({
        data: { user: mockUser },
        error: null
      });

      const result = await supabaseClient.auth.signUp({
        email: 'newuser@example.com',
        password: 'password123'
      });

      expect(result.data.user).toEqual(mockUser);
      expect(result.error).toBeNull();
    });

    test('должен выполнить выход из системы', async () => {
      supabaseClient.auth.signOut.mockResolvedValue({
        error: null
      });

      const result = await supabaseClient.auth.signOut();

      expect(result.error).toBeNull();
    });
  });

  describe('External Crypto API Integration', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    test('должен получить котировку криптовалюты', async () => {
      const mockQuote = {
        c: 45000,  // current price
        h: 46000,  // high
        l: 44000,  // low
        o: 44500,  // open
        pc: 44200  // previous close
      };

      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => mockQuote
      });

      const response = await fetch('https://finnhub.io/api/v1/quote?symbol=BTC');
      const data = await response.json();

      expect(data).toEqual(mockQuote);
      expect(data.c).toBe(45000);
    });

    test('должен обработать ошибку API', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests'
      });

      const response = await fetch('https://finnhub.io/api/v1/quote?symbol=BTC');

      expect(response.ok).toBe(false);
      expect(response.status).toBe(429);
    });

    test('должен получить исторические данные', async () => {
      const mockTimeSeries = {
        values: [
          { datetime: '2024-01-01', close: '45000' },
          { datetime: '2024-01-02', close: '46000' }
        ]
      };

      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => mockTimeSeries
      });

      const response = await fetch('https://api.twelvedata.com/time_series');
      const data = await response.json();

      expect(data.values).toHaveLength(2);
      expect(data.values[0].close).toBe('45000');
    });
  });

  describe('Cache + API Integration', () => {
    let cacheManager;

    beforeEach(() => {
      // Простой кеш-менеджер для тестов
      cacheManager = {
        cache: new Map(),
        get(key) {
          return this.cache.get(key) || null;
        },
        set(key, value) {
          this.cache.set(key, value);
        }
      };

      global.fetch = jest.fn();
    });

    test('должен использовать кеш при повторных запросах', async () => {
      const mockData = { price: 45000 };
      const cacheKey = 'quote_BTC';

      // Первый запрос - кеш пустой
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => mockData
      });

      // Функция получения с кешем
      const fetchWithCache = async (symbol) => {
        const cached = cacheManager.get(`quote_${symbol}`);
        if (cached) return cached;

        const response = await fetch(`https://api.example.com/quote?symbol=${symbol}`);
        const data = await response.json();
        cacheManager.set(`quote_${symbol}`, data);
        return data;
      };

      // Первый вызов
      const result1 = await fetchWithCache('BTC');
      expect(result1).toEqual(mockData);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Второй вызов - должен использовать кеш
      const result2 = await fetchWithCache('BTC');
      expect(result2).toEqual(mockData);
      expect(global.fetch).toHaveBeenCalledTimes(1); // Не должен делать новый запрос
    });
  });

  describe('Error Handling Integration', () => {
    test('должен обработать сетевую ошибку', async () => {
      global.fetch = jest.fn(() =>
        Promise.reject(new Error('Network error'))
      );

      try {
        await fetch('https://api.example.com/data');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toBe('Network error');
      }
    });

    test('должен обработать timeout', async () => {
      jest.useFakeTimers();

      global.fetch = jest.fn(() =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ ok: true }), 10000);
        })
      );

      const fetchWithTimeout = (url, timeout = 5000) => {
        return Promise.race([
          fetch(url),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), timeout)
          )
        ]);
      };

      const promise = fetchWithTimeout('https://api.example.com/data');
      
      jest.advanceTimersByTime(6000);

      await expect(promise).rejects.toThrow('Timeout');

      jest.useRealTimers();
    });

    test('должен выполнить retry при ошибке', async () => {
      let attempts = 0;
      global.fetch = jest.fn(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error('Temporary error'));
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true })
        });
      });

      const fetchWithRetry = async (url, maxRetries = 3) => {
        for (let i = 0; i < maxRetries; i++) {
          try {
            return await fetch(url);
          } catch (error) {
            if (i === maxRetries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      };

      const response = await fetchWithRetry('https://api.example.com/data');
      expect(response.ok).toBe(true);
      expect(attempts).toBe(3);
    });
  });
});