// Пользовательские команды Cypress для переиспользования

/**
 * Команда для входа в систему
 */
Cypress.Commands.add('login', (email, password) => {
  const userEmail = email || Cypress.env('testUser').email;
  const userPassword = password || Cypress.env('testUser').password;

  cy.visit('/login.html');
  cy.get('input[type="email"]').type(userEmail);
  cy.get('input[type="password"]').type(userPassword);
  cy.get('button[type="submit"]').click();
  
  // Ждем перенаправления
  cy.url().should('include', 'index.html');
  
  // Проверяем наличие токена
  cy.window().its('localStorage').invoke('getItem', 'sb-yvliktxpfglofdgvxrcl-auth-token')
    .should('exist');
});

/**
 * Команда для выхода из системы
 */
Cypress.Commands.add('logout', () => {
  cy.get('[data-cy="logout-button"]').click();
  cy.url().should('include', 'login.html');
});

/**
 * Команда для создания портфеля
 */
Cypress.Commands.add('createPortfolio', (name, description) => {
  cy.get('[data-cy="create-portfolio-button"]').click();
  cy.get('[data-cy="portfolio-name-input"]').type(name);
  if (description) {
    cy.get('[data-cy="portfolio-description-input"]').type(description);
  }
  cy.get('[data-cy="save-portfolio-button"]').click();
  
  // Ждем появления нового портфеля
  cy.contains(name).should('be.visible');
});

/**
 * Команда для добавления транзакции
 */
Cypress.Commands.add('addTransaction', (portfolioName, asset, amount, price) => {
  // Открываем портфель
  cy.contains(portfolioName).click();
  
  // Открываем форму добавления транзакции
  cy.get('[data-cy="add-transaction-button"]').click();
  
  // Заполняем форму
  cy.get('[data-cy="asset-select"]').select(asset);
  cy.get('[data-cy="amount-input"]').type(amount);
  cy.get('[data-cy="price-input"]').type(price);
  cy.get('[data-cy="transaction-type-buy"]').click();
  
  // Сохраняем
  cy.get('[data-cy="save-transaction-button"]').click();
  
  // Проверяем успешное добавление
  cy.contains('Транзакция добавлена').should('be.visible');
});

/**
 * Команда для ожидания API запроса
 */
Cypress.Commands.add('waitForApi', (alias, timeout = 10000) => {
  cy.wait(alias, { timeout });
});

/**
 * Команда для проверки toast уведомления
 */
Cypress.Commands.add('checkToast', (message, type = 'success') => {
  cy.get(`.toast.${type}`)
    .should('be.visible')
    .and('contain', message);
});

/**
 * Команда для мока API ответа
 */
Cypress.Commands.add('mockApiResponse', (url, response, statusCode = 200) => {
  cy.intercept('GET', url, {
    statusCode: statusCode,
    body: response
  }).as('apiRequest');
});

/**
 * Команда для проверки элемента с retry
 */
Cypress.Commands.add('waitForElement', (selector, timeout = 10000) => {
  cy.get(selector, { timeout }).should('exist');
});

/**
 * Команда для скролла к элементу
 */
Cypress.Commands.add('scrollToElement', (selector) => {
  cy.get(selector).scrollIntoView();
});

/**
 * Команда для заполнения формы из объекта
 */
Cypress.Commands.add('fillForm', (formData) => {
  Object.keys(formData).forEach(key => {
    cy.get(`[name="${key}"]`).clear().type(formData[key]);
  });
});

/**
 * Команда для проверки loading state
 */
Cypress.Commands.add('checkLoading', (shouldBeLoading = true) => {
  if (shouldBeLoading) {
    cy.get('[data-cy="loading"]').should('exist');
  } else {
    cy.get('[data-cy="loading"]').should('not.exist');
  }
});

/**
 * Команда для очистки базы данных (для тестового окружения)
 */
Cypress.Commands.add('cleanDatabase', () => {
  // Здесь можно вызвать API endpoint для очистки тестовых данных
  cy.log('Cleaning test database...');
});
