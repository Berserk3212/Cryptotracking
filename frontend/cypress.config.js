const { defineConfig } = require('cypress');

module.exports = defineConfig({
  e2e: {
    baseUrl: 'http://127.0.0.1:5500/frontend',
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    supportFile: 'cypress/support/e2e.js',
    viewportWidth: 1920,
    viewportHeight: 1080,
    video: true,
    screenshotOnRunFailure: true,
    
    // Таймауты
    defaultCommandTimeout: 10000,
    pageLoadTimeout: 60000,
    
    // Retry
    retries: {
      runMode: 2,
      openMode: 0
    },

    env: {
      // Тестовые данные
      testUser: {
        email: 'viralius1@gmail.com',
        password: '123123123'
      },
      supabaseUrl: 'https://yvliktxpfglofdgvxrcl.supabase.co',
      supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2bGlrdHhwZmdsb2ZkZ3Z4cmNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExNDcyOTcsImV4cCI6MjA3NjcyMzI5N30.gJWKm8rZYDu-x4vdKIA4HJ8PZo_JcqBTpttseJCpDJU'
    }
  }
});
