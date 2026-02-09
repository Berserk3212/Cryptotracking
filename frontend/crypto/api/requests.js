const DEFAULT_MIN_INTERVAL = 1200;
const DEFAULT_CG_TTL = 5 * 60 * 1000;
const DEFAULT_PRICE_TTL = 30 * 1000;

const useLocalForage = typeof localforage !== 'undefined' && localforage.setItem;
const storage = {
  async get(key) {
    try {
      if (useLocalForage) return await localforage.getItem(key);
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('storage.get error', e);
      return null;
    }
  },
  async set(key, val) {
    try {
      if (useLocalForage) return await localforage.setItem(key, val);
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.warn('storage.set error', e);
    }
  },
  async remove(key) {
    try {
      if (useLocalForage) return await localforage.removeItem(key);
      localStorage.removeItem(key);
    } catch (e) {
      console.warn('storage.remove', e);
    }
  }
};

let limiter = null;

if (typeof Bottleneck !== 'undefined') {
  try {
    limiter = new Bottleneck({ minTime: DEFAULT_MIN_INTERVAL });
  } catch (e) {
    console.warn('Bottleneck init failed', e);
    limiter = null;
  }
}

const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('cg_requests_v1') : null;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function _fetchWithRetries(url, options = {}, maxRetries = 3) {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      const resp = await fetch(url, options);
      if (resp.status === 429) {
        const backoff = 500 * Math.pow(2, attempt) + Math.floor(Math.random() * 300);
        await sleep(backoff);
        attempt++;
        continue;
      }
      return resp;
    } catch (e) {
      const backoff = 400 * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
      await sleep(backoff);
      attempt++;
      continue;
    }
  }
  return null;
}

const localInFlight = new Map();

async function _performFetch(url, options, maxRetries) {
  const call = () => _fetchWithRetries(url, options, maxRetries);
  if (limiter) return limiter.schedule(call);
  return call();
}

export async function safeFetch(url, opts = {}) {
  const { ttl = 0, maxRetries = 3 } = opts;
  const cacheKey = 'req_cache:' + url;

  if (ttl > 0) {
    const cached = await storage.get(cacheKey);
    if (cached && cached.ts && (Date.now() - cached.ts) <= ttl) return cached.data;
  }

  if (localInFlight.has(url)) return localInFlight.get(url);

  let bcWaiter = null;
  
  if (bc) {
    bcWaiter = new Promise(resolve => {
      const handler = (msg) => {
        try {
          if (!msg || !msg.data) return;
          const d = msg.data;
          if (d.type === 'req_result' && d.url === url) {
            bc.removeEventListener('message', handler);
            resolve(d.payload || null);
          }
        } catch (e) { /* ignore */ }
      };
      bc.addEventListener('message', handler);
      // timeout to avoid hanging
      setTimeout(() => { bc.removeEventListener('message', handler); resolve(null); }, 10000);
    });
    // notify others we want this url (they may be working on it)
    try { bc.postMessage({ type: 'req_watch', url }); } catch (e) { /* ignore */ }
  }

  // If other tab already has result shortly, use it
  if (bcWaiter) {
    const maybe = await bcWaiter;
    if (maybe !== null) {
      // store and return
      if (ttl > 0) await storage.set(cacheKey, { ts: Date.now(), data: maybe });
      return maybe;
    }
  }

  // perform fetch (dedupe promise in this tab)
  const p = (async () => {
    try {
      // announce start
      if (bc) try { bc.postMessage({ type: 'req_start', url }); } catch (e) {}

      const resp = await _performFetch(url, {}, maxRetries);
      if (!resp) return null;
      const ct = resp.headers && resp.headers.get ? (resp.headers.get('content-type') || '') : '';
      if (!resp.ok || !ct.includes('application/json')) return null;
      const json = await resp.json();

      if (ttl > 0) await storage.set(cacheKey, { ts: Date.now(), data: json });

      // announce result to other tabs
      if (bc) try { bc.postMessage({ type: 'req_result', url, payload: json }); } catch (e) {}

      return json;
    } finally {
      localInFlight.delete(url);
    }
  })();

  localInFlight.set(url, p);
  return p;
}

// Convenience wrappers for CoinGecko endpoints
export function fetchCoinGeckoGlobal(ttl = DEFAULT_CG_TTL) {
  return safeFetch('https://api.coingecko.com/api/v3/global', { ttl });
}

export function fetchCoinGeckoSimplePrice(idsParam, ttl = DEFAULT_PRICE_TTL) {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(idsParam)}&vs_currencies=usd`;
  return safeFetch(url, { ttl });
}

// Export storage utilities for manual cache invalidation
export const requestsCache = {
  async clearPrefix(prefix = 'req_cache:') {
    // localForage doesn't support listing keys reliably without config; attempt best-effort for localStorage
    if (useLocalForage) {
      console.warn('clearPrefix: not implemented for localForage in this helper');
      return;
    }
    Object.keys(localStorage).forEach(k => { if (k.startsWith(prefix)) localStorage.removeItem(k); });
  }
};

export default {
  safeFetch,
  fetchCoinGeckoGlobal,
  fetchCoinGeckoSimplePrice,
  requestsCache
};
