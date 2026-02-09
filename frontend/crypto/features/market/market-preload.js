import { loadStocks, loadCryptoList, loadIndices } from '../../api/api.js';

if (!window.app) window.app = {};

window.app.loadStocks = loadStocks;
window.app.loadCrypto = loadCryptoList;
window.app.loadIndices = loadIndices;

console.log('Market preload functions ready');
console.log('   - window.app.loadStocks');
console.log('   - window.app.loadCrypto');
console.log('   - window.app.loadIndices');
