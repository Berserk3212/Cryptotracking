(function() {
  // ── In-memory cache (symbol → {dates, values}) ──────────────────────────
  const cache = new Map();
  // ── Pending resolvers: symbol → [resolve, ...] ──────────────────────────
  const pending = new Map();
  const queue = new Set();
  let running = false;
  let pauseUntil = 0;

  const DEFAULT_OUTPUTSIZE = 60;
  const MAX_RETRIES = 3;
  const PARALLEL = 1;
  // TwelveData free plan: 8 req/min → 1 req per ~7.5 s; we use 8 s gap
  const REQUEST_GAP_MS = 8000;
  // localStorage TTL: 24 hours
  const LS_TTL_MS = 24 * 60 * 60 * 1000;
  const LS_PREFIX = 'spkl_';

  // ── localStorage helpers ─────────────────────────────────────────────────
  function lsRead(symbol) {
    try {
      const raw = localStorage.getItem(LS_PREFIX + symbol);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || Date.now() - obj.ts > LS_TTL_MS) { localStorage.removeItem(LS_PREFIX + symbol); return null; }
      return { dates: obj.d, values: obj.v };
    } catch (e) { return null; }
  }
  function lsWrite(symbol, data) {
    try { localStorage.setItem(LS_PREFIX + symbol, JSON.stringify({ ts: Date.now(), d: data.dates, v: data.values })); }
    catch (e) { /* quota exceeded — ok */ }
  }

  // ── Populate memory cache from localStorage on init ──────────────────────
  function seedFromStorage() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(LS_PREFIX)) continue;
        const sym = key.slice(LS_PREFIX.length);
        if (!cache.has(sym)) {
          const data = lsRead(sym);
          if (data) cache.set(sym, data);
        }
      }
    } catch (e) {}
  }
  seedFromStorage();

  // ── Resolve all pending promises for a symbol ────────────────────────────
  function resolveSymbol(symbol) {
    const data = cache.get(symbol);
    const resolvers = pending.get(symbol) || [];
    pending.delete(symbol);
    resolvers.forEach(fn => fn(data));
  }

  // ── Fetch one symbol from TwelveData ────────────────────────────────────
  async function fetchFor(symbol, apiKey, outputsize = DEFAULT_OUTPUTSIZE) {
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=${outputsize}&format=JSON&apikey=${apiKey}`;
    try {
      const r = await fetch(url);
      const j = await r.json();
      if (j && j.status === 'error') {
        const msg = (j.message || '').toLowerCase();
        if (msg.includes('run out of api credits') || msg.includes('exceeded') || msg.includes('limit')) {
          pauseUntil = Date.now() + 65000;

        }
        return null;
      }
      if (j && j.values && j.values.length) {
        const dates = j.values.map(v => v.datetime).reverse();
        const values = j.values.map(v => parseFloat(v.close)).reverse();
        const data = { dates, values };
        cache.set(symbol, data);
        lsWrite(symbol, data);
        return data;
      }
    } catch (e) {

    }
    return null;
  }

  // ── Queue processor ──────────────────────────────────────────────────────
  async function processQueue(apiKey) {
    if (running) return;
    running = true;
    try {
      let items = Array.from(queue);
      queue.clear();

      for (let idx = 0; idx < items.length; idx++) {
        // Wait out any rate-limit pause
        const now = Date.now();
        if (pauseUntil > now) {
          const waitMs = pauseUntil - now + 500;

          await new Promise(r => setTimeout(r, waitMs));
        }

        const sym = items[idx];
        // Already resolved from localStorage seed or prior fetch
        if (cache.has(sym)) { resolveSymbol(sym); continue; }
        // Hit rate limit during this batch — requeue remainder and stop
        if (pauseUntil > Date.now()) {
          for (let j = idx; j < items.length; j++) queue.add(items[j]);
          break;
        }

        let attempt = 0;
        let backoff = 400;
        while (attempt < MAX_RETRIES) {
          if (pauseUntil > Date.now()) break;
          if (attempt > 0) await new Promise(r => setTimeout(r, backoff));
          const res = await fetchFor(sym, apiKey);
          if (res) { resolveSymbol(sym); break; }
          attempt++;
          backoff = Math.min(8000, backoff * 2);
        }
        if (!cache.has(sym)) resolveSymbol(sym); // resolve with null so consumers don't hang

        // Respect TwelveData rate limit between successful fetches
        if (idx < items.length - 1) await new Promise(r => setTimeout(r, REQUEST_GAP_MS));
      }
    } finally {
      running = false;
      // If new items were added while running, schedule another pass
      if (queue.size > 0) setTimeout(() => processQueue(apiKey), 200);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  function request(symbol) {
    const apiKey = window.TWELVEDATA_API_KEY || '';
    if (cache.has(symbol)) return Promise.resolve(cache.get(symbol));
    return new Promise((resolve) => {
      if (!pending.has(symbol)) pending.set(symbol, []);
      pending.get(symbol).push(resolve);
      if (!queue.has(symbol)) {
        queue.add(symbol);
        setTimeout(() => processQueue(apiKey), 60);
      }
    });
  }

  function prefetch(symbols) {
    const apiKey = window.TWELVEDATA_API_KEY || '';
    let added = false;
    symbols.forEach(s => {
      if (!cache.has(s) && !queue.has(s)) { queue.add(s); added = true; }
    });
    if (added) setTimeout(() => processQueue(apiKey), 60);
  }

  window.sparklineService = { request, prefetch, _cache: cache };
})();
