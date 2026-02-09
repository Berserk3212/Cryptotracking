// Глобальные настройки для всех тестов
import '@testing-library/jest-dom';
import 'jest-localstorage-mock';

// Мок для fetch API
global.fetch = jest.fn();

// Мок для console методов (чтобы не засорять вывод тестов)
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
  log: jest.fn(),
};

// Мок для localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock;

// Мок для window.location
delete window.location;
window.location = {
  href: '',
  pathname: '/',
  search: '',
  hash: '',
  reload: jest.fn(),
};

// Мок для Supabase
global.window.supabase = {
  createClient: jest.fn(() => ({
    auth: {
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
    })),
  })),
};

// Мок для Vue
global.Vue = {
  createApp: jest.fn(() => ({
    mount: jest.fn(),
  })),
  ref: jest.fn((val) => ({ value: val })),
  reactive: jest.fn((obj) => obj),
  onMounted: jest.fn((cb) => cb()),
  computed: jest.fn((fn) => ({ value: fn() })),
  watch: jest.fn(),
};

// Очистка всех моков перед каждым тестом
beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  fetch.mockClear();
});

// Глобальная обработка необработанных отклонений промисов
process.on('unhandledRejection', (error) => {
  console.error('Unhandled Promise Rejection:', error);
});
