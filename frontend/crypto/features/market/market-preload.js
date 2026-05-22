import { loadStocks, loadCrypto, loadCryptoList, loadIndices } from '../../api/api.js';

if (!window.app) window.app = {};


window.app.loadStocks = loadStocks;
window.app.loadCrypto = loadCrypto;  
window.app.loadCryptoList = loadCryptoList;  
window.app.loadIndices = loadIndices;

