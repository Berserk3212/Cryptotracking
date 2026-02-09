describe('Тест авторизации', () => {
  const SUPABASE_URL = 'https://yvliktxpfglofdgvxrcl.supabase.co';

  /**
   * Создаёт mock JWT-токен.
   * gotrue-js декодирует payload через atob().
   */
  const createMockJwt = (payload) => {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = btoa(JSON.stringify(payload));
    return `${header}.${body}.mock_signature`;
  };

  beforeEach(() => {
    // Подавляем ошибки от Supabase / сторонних скриптов
    cy.on('uncaught:exception', () => false);

    // Блокируем GET-запросы к Supabase Auth (проверка сессии, refresh)
    cy.intercept('GET', `${SUPABASE_URL}/auth/v1/**`, { statusCode: 401, body: {} });

    // Stub для index.html — подменяем тяжёлую страницу лёгкой заглушкой,
    // чтобы Cypress не ждал 60 сек загрузки всех скриптов/ресурсов
    cy.intercept('GET', '**/index.html', {
      statusCode: 200,
      headers: { 'content-type': 'text/html' },
      body: '<!DOCTYPE html><html><head><title>InvestApp</title></head><body><h1>Dashboard</h1></body></html>',
    });
  });

  it('успешный вход', () => {
    // --- Mock: Supabase возвращает успешную авторизацию ---
    const mockAccessToken = createMockJwt({
      sub: '00000000-0000-0000-0000-000000000001',
      aud: 'authenticated',
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 7200,
      iat: Math.floor(Date.now() / 1000),
      email: 'viralius1@gmail.com',
    });

    cy.intercept('POST', `${SUPABASE_URL}/auth/v1/token*`, {
      statusCode: 200,
      body: {
        access_token: mockAccessToken,
        token_type: 'bearer',
        expires_in: 7200,
        refresh_token: 'mock-refresh-token',
        user: {
          id: '00000000-0000-0000-0000-000000000001',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'viralius1@gmail.com',
          email_confirmed_at: '2024-01-01T00:00:00.000Z',
          confirmed_at: '2024-01-01T00:00:00.000Z',
          last_sign_in_at: new Date().toISOString(),
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: {},
          identities: [],
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: new Date().toISOString(),
        },
      },
    }).as('loginRequest');

    cy.visit('/login.html', {
      onBeforeLoad(win) {
        win.localStorage.clear();
        win.sessionStorage.clear();
      },
    });

    cy.get('#email', { timeout: 10000 }).should('be.visible');
    cy.get('#email').clear().type('viralius1@gmail.com', { delay: 50 });
    cy.get('#password').clear().type('123123123', { delay: 50 });
    cy.get('button.submit-btn').click();

    // Ждём ответа от mock-API
    cy.wait('@loginRequest');

    // Toast «Успешный вход» подтверждает, что login.js обработал ответ
    cy.get('.toast.success', { timeout: 5000 }).should('be.visible');

    // Проверяем, что Supabase-клиент сохранил токен в localStorage (до редиректа)
    cy.window().should((win) => {
      const keys = Object.keys(win.localStorage);
      const hasToken = keys.some((key) => {
        const val = win.localStorage.getItem(key);
        return val && val.includes('access_token');
      });
      expect(hasToken, 'Токен авторизации Supabase найден в localStorage').to.be.true;
    });

    // Ждём редиректа на index.html (1.5 с setTimeout в login.js + stub-страница грузится мгновенно)
    cy.url({ timeout: 10000 }).should('include', 'index.html');
  });

  it('неверные учётные данные', () => {
    // --- Mock: Supabase возвращает ошибку авторизации ---
    cy.intercept('POST', `${SUPABASE_URL}/auth/v1/token*`, {
      statusCode: 400,
      body: {
        error: 'invalid_grant',
        error_description: 'Invalid login credentials',
      },
    }).as('loginRequest');

    cy.visit('/login.html', {
      onBeforeLoad(win) {
        win.localStorage.clear();
        win.sessionStorage.clear();
      },
    });

    cy.get('#email', { timeout: 10000 }).should('be.visible');
    cy.get('#email').clear().type('wrong@example.com', { delay: 50 });
    cy.get('#password').clear().type('wrongpassword', { delay: 50 });
    cy.get('button.submit-btn').click();

    // Ждём ответа mock-API (1.5 с искусственная задержка + мгновенный ответ)
    cy.wait('@loginRequest');

    // Toast с ошибкой должен появиться
    cy.get('.toast.error', { timeout: 5000 }).should('be.visible');
    cy.get('.toast-content').should('contain.text', 'Ошибка');

    // URL не изменился — остаёмся на login.html
    cy.url().should('include', 'login.html');
  });

  it('валидация пустых полей', () => {
    cy.visit('/login.html', {
      onBeforeLoad(win) {
        win.localStorage.clear();
        win.sessionStorage.clear();
      },
    });

    cy.get('#email', { timeout: 10000 }).should('be.visible');

    // Снимаем атрибут required с инпутов, чтобы обойти нативную HTML5-валидацию
    // и дать сработать кастомной валидации Vue (handleLogin → validateForm)
    cy.get('#email').invoke('removeAttr', 'required');
    cy.get('#password').invoke('removeAttr', 'required');

    // Нажимаем без заполнения полей — теперь form submit пройдёт и handleLogin вызовется
    cy.get('button.submit-btn').click();

    // Toast с ошибкой валидации (showToast вызывается ПЕРВЫМ в handleLogin)
    cy.get('.toast.error', { timeout: 5000 }).should('be.visible');

    // Поля формы получают класс error через Vue reactivity
    cy.get('.form-field.error').should('exist');

    // Остаёмся на login.html
    cy.url().should('include', 'login.html');
  });
});
