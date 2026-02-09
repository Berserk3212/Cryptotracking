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
        console.log(`[Cache HIT - Memory${ignoreTTL ? ' (TTL ignored)' : ''}] ${type}`, params);
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
          console.log(`[Cache HIT - Storage${ignoreTTL ? ' (TTL ignored)' : ''}] ${type}`, params);
          this.memoryCache.set(key, parsed);
          return parsed.data;
        } else {
          localStorage.removeItem(key);
        }
      }
    } catch (e) {
      console.warn('Cache read error:', e);
    }
    
    console.log(`[Cache MISS] ${type}`, params);
    return null;
  }

  set(type, params, data) {
    const key = this.generateKey(type, params);
    const ttl = this.CACHE_TTLS[type] || this.DEFAULT_TTL;
    const expiry = Date.now() + ttl;
    
    const cacheEntry = { data, expiry };
    
    // Сохраняем в память
    this.memoryCache.set(key, cacheEntry);
    
    // Сохраняем в localStorage
    try {
      localStorage.setItem(key, JSON.stringify(cacheEntry));
      console.log(`[Cache SET] ${type}`, params, `TTL: ${ttl / 1000}s`);
    } catch (e) {
      // localStorage переполнен - очищаем старые записи
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

  /**
   * Очистить устаревшие записи из localStorage
   */
  clearOldEntries() {
    const now = Date.now();
    let cleared = 0;
    
    try {
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.startsWith(this.CACHE_PREFIX)) {
          try {
            const item = JSON.parse(localStorage.getItem(key));
            if (now >= item.expiry) {
              localStorage.removeItem(key);
              cleared++;
            }
          } catch (e) {
            // Невалидная запись - удаляем
            localStorage.removeItem(key);
            cleared++;
          }
        }
      }
      console.log(`[Cache] Cleared ${cleared} expired entries`);
    } catch (e) {
      console.warn('Cache cleanup error:', e);
    }
  }

  /**
   * Полная очистка кеша
   */
  clear() {
    this.memoryCache.clear();
    try {
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.startsWith(this.CACHE_PREFIX)) {
          localStorage.removeItem(key);
        }
      }
      console.log('[Cache] Full cache cleared');
    } catch (e) {
      console.warn('Cache clear error:', e);
    }
  }

  /**
   * Получить статистику кеша
   */
  getStats() {
    let storageCount = 0;
    let storageSize = 0;
    
    try {
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.startsWith(this.CACHE_PREFIX)) {
          storageCount++;
          storageSize += localStorage.getItem(key).length;
        }
      }
    } catch (e) {
      console.warn('Cache stats error:', e);
    }
    
    return {
      memoryEntries: this.memoryCache.size,
      storageEntries: storageCount,
      storageSizeKB: Math.round(storageSize / 1024)
    };
  }
}

// Создаем глобальный экземпляр
window.cacheManager = new CacheManager();

// Очищаем устаревшие записи при загрузке
window.cacheManager.clearOldEntries();

console.log('[CacheManager] Initialized', window.cacheManager.getStats());
