module.exports = {
  // Использовать jsdom для эмуляции браузерной среды
  testEnvironment: 'jsdom',

  // Файлы настройки, которые выполняются перед тестами
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],

  // Шаблоны для поиска тестовых файлов
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/?(*.)+(spec|test).js'
  ],

  // Игнорировать определенные директории
  testPathIgnorePatterns: [
    '/node_modules/',
    '/cypress/'
  ],

  // Покрытие кода
  collectCoverageFrom: [
    '**/*.js',
    '!**/__tests__/**',
    '!**/node_modules/**',
    '!**/cypress/**',
    '!jest.config.js',
    '!**/coverage/**'
  ],

  // Пороги покрытия кода
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 75,
      lines: 80,
      statements: 80
    }
  },

  // Сопоставление модулей для моков
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': '<rootDir>/__tests__/__mocks__/styleMock.js'
  },

  // Таймаут для тестов (мс)
  testTimeout: 10000,

  // Очистка моков между тестами
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true
};
