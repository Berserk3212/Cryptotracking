// crypto-manager.js - Менеджер криптовалют с масштабируемой архитектурой

class CryptoConfigManager {
  constructor() {
    this.config = null;
    this.cache = new Map();
    this.requestQueue = [];
    this.isProcessing = false;
  }

  // Загрузка конфигурации из JSON
  async loadConfig() {
    if (this.config) {

      return this.config;
    }
    

    
    try {
      // Пробуем разные пути
      const possiblePaths = [
        './config/crypto-config.json',
        '../config/crypto-config.json',
        'config/crypto-config.json',
        '/config/crypto-config.json'
      ];
      
      let response = null;
      let successPath = null;
      
      for (const path of possiblePaths) {
        try {

          response = await fetch(path);
          if (response.ok) {
            successPath = path;

            break;
          } else {

          }
        } catch (err) {

        }
      }
      
      if (!response || !response.ok) {
        throw new Error(`Не удалось загрузить конфигурацию ни из одного пути. Попробовано: ${possiblePaths.join(', ')}`);
      }
      
      this.config = await response.json();

      return this.config;
    } catch (error) {

      throw error;
    }
  }

  // Получить все активы определенных tier'ов
  getAssetsByTiers(tiers = ['tier1', 'tier2']) {
    if (!this.config) {

      return [];
    }

    const assets = [];
    tiers.forEach(tier => {
      if (this.config.cryptoAssets[tier]) {
        assets.push(...this.config.cryptoAssets[tier].assets);
      }
    });

    return assets;
  }

  // Получить активы по категории
  getAssetsByCategory(category) {
    if (!this.config) return [];

    const allAssets = this.getAllAssets();
    return allAssets.filter(asset => asset.category === category);
  }

  // Получить все активы
  getAllAssets() {
    if (!this.config) return [];

    const assets = [];
    Object.keys(this.config.cryptoAssets).forEach(tier => {
      assets.push(...this.config.cryptoAssets[tier].assets);
    });

    return assets;
  }

  // Получить топ N активов по рангу
  getTopAssets(count = 20) {
    const allAssets = this.getAllAssets();

    const sorted = allAssets.sort((a, b) => a.rank - b.rank);
    const topAssets = sorted.slice(0, count);

    return topAssets;
  }

  // Получить информацию о категориях
  getCategories() {
    return this.config?.categories || {};
  }

  // Получить настройки
  getSettings() {
    return this.config?.settings || {};
  }

  // Пакетная загрузка данных с учетом rate limits
  async batchLoadPrices(assets, apiBaseUrl = 'https://api.binance.com/api/v3/ticker/24hr') {

    
    const results = [];
    

    const allResults = await Promise.allSettled(assets.map(asset => this.loadAssetPrice(asset, apiBaseUrl)));
    

    
    // Обрабатываем результаты
    allResults.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value);
      } else {

      }
    });
    

    return results;
  }

  // Загрузка цены одного актива с кэшированием
  async loadAssetPrice(asset, apiBaseUrl) {
    const cacheKey = asset.pair;
    const cached = this.cache.get(cacheKey);
    const settings = this.getSettings();
    const cacheTime = settings.cacheTime || 30000;
    
    // Проверяем кэш
    if (cached && Date.now() - cached.timestamp < cacheTime) {

      return cached.data;
    }
    
    try {
      const url = `${apiBaseUrl}?symbol=${asset.pair}`;

      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      // Умное форматирование цены в зависимости от величины
      const price = parseFloat(data.lastPrice);
      let formattedPrice;
      if (price < 0.000001) {
        formattedPrice = price.toFixed(8);
      } else if (price < 0.0001) {
        formattedPrice = price.toFixed(6);
      } else if (price < 0.01) {
        formattedPrice = price.toFixed(4);
      } else if (price < 1) {
        formattedPrice = price.toFixed(3);
      } else {
        formattedPrice = price.toFixed(2);
      }
      
      const result = {
        ...asset,
        price: formattedPrice,
        change: parseFloat(data.priceChange).toFixed(2),
        changePercent: parseFloat(data.priceChangePercent).toFixed(2),
        volume: this.formatVolume(parseFloat(data.volume) * parseFloat(data.lastPrice)),
        high: parseFloat(data.highPrice).toFixed(2),
        low: parseFloat(data.lowPrice).toFixed(2),
        trades: data.count || 0,
        isReal: true,
        timestamp: Date.now()
      };
      
      // Сохраняем в кэш
      this.cache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });
      
      return result;
    } catch (error) {

      // Если загрузка из Binance не удалась из-за CORS/сети — попробуем CoinGecko как fallback
      try {

        // Импортируем helper из core/data.js который уже умеет маппить символы и кешировать
        const { getPricesForSymbols } = await import('../../core/data.js');
        const cg = await getPricesForSymbols([asset.symbol], { useCoinGecko: true });
        const cgPrice = cg && cg[asset.symbol];
        if (cgPrice && Number.isFinite(cgPrice)) {
          const price = Number(cgPrice);
          let formattedPrice;
          if (price < 0.000001) {
            formattedPrice = price.toFixed(8);
          } else if (price < 0.0001) {
            formattedPrice = price.toFixed(6);
          } else if (price < 0.01) {
            formattedPrice = price.toFixed(4);
          } else if (price < 1) {
            formattedPrice = price.toFixed(3);
          } else {
            formattedPrice = price.toFixed(2);
          }

          const fallbackResult = {
            ...asset,
            price: formattedPrice,
            change: '0.00',
            changePercent: '0.00',
            volume: this.formatVolume(0),
            high: '0.00',
            low: '0.00',
            trades: 0,
            isReal: false,
            source: 'coingecko',
            timestamp: Date.now()
          };

          this.cache.set(cacheKey, {
            data: fallbackResult,
            timestamp: Date.now()
          });

          // Покажем пользователю уведомление о fallback (если доступно)
          try { if (window.showNotification) window.showNotification(`Binance недоступен — используем CoinGecko для ${asset.symbol}`, 'warning'); } catch (e) { /* ignore */ }

          return fallbackResult;
        }
      } catch (e) {

      }
      
      // Возвращаем кэшированные данные даже если устарели
      if (cached) {

        return cached.data;
      }
      
      throw error;
    }
  }

  // Форматирование объема
  formatVolume(volume) {
    if (volume >= 1e9) return `$${(volume / 1e9).toFixed(2)}B`;
    if (volume >= 1e6) return `$${(volume / 1e6).toFixed(2)}M`;
    if (volume >= 1e3) return `$${(volume / 1e3).toFixed(2)}K`;
    return `$${volume.toFixed(2)}`;
  }

  // Утилита для задержки
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Очистка кэша
  clearCache() {
    this.cache.clear();

  }

  // Очистка устаревшего кэша
  cleanStaleCache() {
    const settings = this.getSettings();
    const cacheTime = settings.cacheTime || 30000;
    const now = Date.now();
    
    let cleaned = 0;
    this.cache.forEach((value, key) => {
      if (now - value.timestamp > cacheTime * 2) {
        this.cache.delete(key);
        cleaned++;
      }
    });
    
    if (cleaned > 0) {

    }
  }

  // Получить статистику по категориям
  getCategoryStats(loadedAssets) {
    const stats = {};
    
    loadedAssets.forEach(asset => {
      if (!stats[asset.category]) {
        stats[asset.category] = {
          count: 0,
          totalVolume: 0,
          avgChange: 0,
          totalChange: 0
        };
      }
      
      stats[asset.category].count++;
      stats[asset.category].totalVolume += parseFloat(asset.volume.replace(/[$BMK]/g, ''));
      stats[asset.category].totalChange += parseFloat(asset.changePercent);
    });
    
    // Вычисляем средние значения
    Object.keys(stats).forEach(category => {
      stats[category].avgChange = (stats[category].totalChange / stats[category].count).toFixed(2);
    });
    
    return stats;
  }

  // Поиск активов
  searchAssets(query) {
    const allAssets = this.getAllAssets();
    const lowerQuery = query.toLowerCase();
    
    return allAssets.filter(asset => 
      asset.symbol.toLowerCase().includes(lowerQuery) ||
      asset.name.toLowerCase().includes(lowerQuery) ||
      asset.category.toLowerCase().includes(lowerQuery));
  }

  // Фильтрация активов
  filterAssets(filters = {}) {
    let assets = this.getAllAssets();
    
    if (filters.category) {
      assets = assets.filter(a => a.category === filters.category);
    }
    
    if (filters.minRank) {
      assets = assets.filter(a => a.rank >= filters.minRank);
    }
    
    if (filters.maxRank) {
      assets = assets.filter(a => a.rank <= filters.maxRank);
    }
    
    if (filters.minMarketCap) {
      assets = assets.filter(a => a.marketCap >= filters.minMarketCap);
    }
    
    if (filters.tier) {
      assets = this.getAssetsByTiers([filters.tier]);
    }
    
    return assets;
  }

  // Сортировка активов
  sortAssets(assets, sortBy = 'rank', order = 'asc') {
    return [...assets].sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];
      
      // Конвертируем строковые числа
      if (typeof aVal === 'string' && !isNaN(parseFloat(aVal))) {
        aVal = parseFloat(aVal);
        bVal = parseFloat(bVal);
      }
      
      if (order === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  }

  // Экспорт конфигурации
  exportConfig() {
    return JSON.stringify(this.config, null, 2);
  }

  // Добавить новый актив (runtime)
  addAsset(tier, asset) {
    if (!this.config || !this.config.cryptoAssets[tier]) {

      return false;
    }
    
    this.config.cryptoAssets[tier].assets.push(asset);

    return true;
  }

  // Удалить актив (runtime)
  removeAsset(symbol) {
    if (!this.config) return false;
    
    Object.keys(this.config.cryptoAssets).forEach(tier => {
      const index = this.config.cryptoAssets[tier].assets.findIndex(a => a.symbol === symbol);
      if (index !== -1) {
        this.config.cryptoAssets[tier].assets.splice(index, 1);

      }
    });
    
    return true;
  }
}

// Создаем глобальный инстанс

if (window.location.protocol === 'file:') {

}

window.cryptoManager = new CryptoConfigManager();

// Экспортируем для использования в других модулях
export default window.cryptoManager;
