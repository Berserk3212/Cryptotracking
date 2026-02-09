// Команды и настройки для E2E тестов
import './commands';

// Перехват необработанных исключений
Cypress.on('uncaught:exception', (err, runnable) => {
  // Возвращаем false чтобы предотвратить падение теста
  // при некритичных ошибках в приложении
  console.error('Uncaught exception:', err);
  return false;
});

// Настройка перед каждым тестом
beforeEach(() => {
  // Очистка localStorage и cookies
  cy.clearLocalStorage();
  cy.clearCookies();
  
  // Сбрасываем сессию Cypress
  cy.window().then((win) => {
    win.sessionStorage.clear();
  });
});

// Настройка после каждого теста
afterEach(() => {
  // Дополнительная очистка если нужно
  cy.log(`Test "${Cypress.currentTest.title}" completed`);
});
