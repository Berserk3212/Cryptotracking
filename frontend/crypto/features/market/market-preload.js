import { loadStocks, loadCrypto, loadCryptoList, loadIndices } from '../../api/api.js';

if (!window.app) window.app = {};

// КРИТИЧНО: loadCrypto для раздела "Рынок" → таб "Криптовалюты" (marketCryptoGrid)
//           loadCryptoList для раздела "Криптовалюты" (mainCryptoGrid)
window.app.loadStocks = loadStocks;
window.app.loadCrypto = loadCrypto;  // ← ИСПРАВЛЕНО: используем loadCrypto, а не loadCryptoList
window.app.loadCryptoList = loadCryptoList;  // ← добавляем отдельно для секции "Криптовалюты"
window.app.loadIndices = loadIndices;

