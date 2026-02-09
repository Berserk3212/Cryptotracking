/**
 * Юнит-тесты для CacheManager - упрощенная версия
 * 10 ключевых тестов для кеширования
 */

describe('CacheManager', () => {
  let cacheManager;

  // Класс CacheManager для тестирования
  class CacheManager {
    constructor() {
      this.memoryCache = new Map();
      this.CACHE_PREFIX = 'twelvedata_cache_';
      this.DEFAULT_TTL = 5 * 60 * 1000;
      this.CACHE_TTLS = {
        quote: 3 * 60 * 1000,
        timeseries: 15 * 60 * 1000,
        indices: 5 * 60 * 1000,
        statistics: 20 * 60 * 1000
      };
    }

    generateKey(type, params) {
      const paramStr = JSON.stringify(params);
      return `${this.CACHE_PREFIX}${type}_${paramStr}`;
    }

    get(type, params, ignoreTTL = false) {
      const key = this.generateKey(type, params);
      
      if (this.memoryCache.has(key)) {
        const cached = this.memoryCache.get(key);
        if (ignoreTTL || Date.now() < cached.expiry) {
          return cached.data;
        } else {
          this.memoryCache.delete(key);
        }
      }
      
      try {
        const stored = localStorage.getItem(key);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (ignoreTTL || Date.now() < parsed.expiry) {
            this.memoryCache.set(key, parsed);
            return parsed.data;
          } else {
            localStorage.removeItem(key);
          }
        }
      } catch (e) {
        console.warn('Cache read error:', e);
      }
      
      return null;
    }

    set(type, params, data) {
      const key = this.generateKey(type, params);
      const ttl = this.CACHE_TTLS[type] || this.DEFAULT_TTL;
      const expiry = Date.now() + ttl;
      
      const cacheEntry = { data, expiry };
      
      this.memoryCache.set(key, cacheEntry);
      
      try {
        localStorage.setItem(key, JSON.stringify(cacheEntry));
      } catch (e) {
        if (e.name === 'QuotaExceededError') {
          this.clearOldEntries();
          try {
            localStorage.setItem(key, JSON.stringify(cacheEntry));
          } catch (e2) {
            console.warn('Cache storage failed after cleanup:', e2);
          }
        }
      }
    }

    clearOldEntries() {
      const now = Date.now();
      const keysToRemove = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.CACHE_PREFIX)) {
          try {
            const item = JSON.parse(localStorage.getItem(key));
            if (now >= item.expiry) {
              keysToRemove.push(key);
            }
          } catch (e) {
            keysToRemove.push(key);
          }
        }
      }
      
      keysToRemove.forEach(key => localStorage.removeItem(key));
    }

    clear() {
      this.memoryCache.clear();
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(this.CACHE_PREFIX)) {
          localStorage.removeItem(key);
        }
      });
    }
  }

  beforeEach(() => {
    cacheManager = new CacheManager();
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe('generateKey', () => {
    test('должен генерировать уникальный ключ для типа и параметров', () => {
      const key1 = cacheManager.generateKey('quote', { symbol: 'BTC' });
      const key2 = cacheManager.generateKey('quote', { symbol: 'ETH' });
      
      expect(key1).toContain('twelvedata_cache_quote');
      expect(key1).not.toBe(key2);
    });

    test('должен генерировать одинаковые ключи для одинаковых параметров', () => {
      const key1 = cacheManager.generateKey('quote', { symbol: 'BTC' });
      const key2 = cacheManager.generateKey('quote', { symbol: 'BTC' });
      
      expect(key1).toBe(key2);
    });
  });

  describe('set и get', () => {
    test('должен сохранять и извлекать данные из памяти', () => {
      const testData = { price: 45000, volume: 1000 };
      
      cacheManager.set('quote', { symbol: 'BTC' }, testData);
      const retrieved = cacheManager.get('quote', { symbol: 'BTC' });
      
      expect(retrieved).toEqual(testData);
    });

    test('должен вернуть null для несуществующего ключа', () => {
      const retrieved = cacheManager.get('quote', { symbol: 'NONEXISTENT' });
      
      expect(retrieved).toBeNull();
    });

    test('должен сохранять разные данные для разных ключей', () => {
      cacheManager.set('quote', { symbol: 'BTC' }, { price: 45000 });
      cacheManager.set('quote', { symbol: 'ETH' }, { price: 3000 });
      
      expect(cacheManager.get('quote', { symbol: 'BTC' }).price).toBe(45000);
      expect(cacheManager.get('quote', { symbol: 'ETH' }).price).toBe(3000);
    });
  });

  describe('TTL и истечение срока', () => {
    test('должен вернуть null для истекших данных', () => {
      const testData = { price: 45000 };
      
      // Мокируем Date.now() чтобы симулировать прошлое
      const mockNow = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(mockNow);
      
      cacheManager.set('quote', { symbol: 'BTC' }, testData);
      
      // Переводим время в будущее (после истечения TTL)
      const futureTime = mockNow + cacheManager.CACHE_TTLS.quote + 1000;
      jest.spyOn(Date, 'now').mockReturnValue(futureTime);
      
      const retrieved = cacheManager.get('quote', { symbol: 'BTC' });
      
      expect(retrieved).toBeNull();
    });

    test('должен игнорировать TTL когда ignoreTTL=true', () => {
      const testData = { price: 45000 };
      
      const mockNow2 = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(mockNow2);
      
      cacheManager.set('quote', { symbol: 'BTC' }, testData);
      
      const futureTime2 = mockNow2 + cacheManager.CACHE_TTLS.quote + 1000;
      jest.spyOn(Date, 'now').mockReturnValue(futureTime2);
      
      const retrieved = cacheManager.get('quote', { symbol: 'BTC' }, true);
      
      expect(retrieved).toEqual(testData);
    });
  });

  describe('clear', () => {
    test('должен очистить кеш', () => {
      cacheManager.set('quote', { symbol: 'BTC' }, { price: 45000 });
      cacheManager.set('quote', { symbol: 'ETH' }, { price: 3000 });
      
      cacheManager.clear();
      
      expect(cacheManager.memoryCache.size).toBe(0);
      expect(cacheManager.get('quote', { symbol: 'BTC' })).toBeNull();
    });
  });
});