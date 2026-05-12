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
      if (ignoreTTL || Date.now() < cached.expiry) return cached.data;
      this.memoryCache.delete(key);
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
    } catch (_) {}
    
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
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        this.clearOldEntries();
        try { localStorage.setItem(key, JSON.stringify(cacheEntry)); } catch (_) {}
      }
    }
  }

  // Очистить устаревшие записи из localStorage
  clearOldEntries() {
    const now = Date.now();
    try {
      for (const key of Object.keys(localStorage)) {
        if (!key.startsWith(this.CACHE_PREFIX)) continue;
        try {
          const item = JSON.parse(localStorage.getItem(key));
          if (now >= item.expiry) localStorage.removeItem(key);
        } catch (_) {
          localStorage.removeItem(key);
        }
      }
    } catch (_) {}
  }

  // Полная очистка кэша
  clear() {
    this.memoryCache.clear();
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(this.CACHE_PREFIX)) localStorage.removeItem(key);
      }
    } catch (_) {}
  }

  // Статистика кэша
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
    } catch (_) {}
    
    return {
      memoryEntries: this.memoryCache.size,
      storageEntries: storageCount,
      storageSizeKB: Math.round(storageSize / 1024)
    };
  }
}

window.cacheManager = new CacheManager();
window.cacheManager.clearOldEntries();
