(function() {
  const cache = new Map();
  const queue = new Set();
  let running = false;
  let pauseUntil = 0;

  const DEFAULT_OUTPUTSIZE = 60;
  const MAX_RETRIES = 4;
  const PARALLEL = 1;

  async function fetchFor(symbol, apiKey, outputsize = DEFAULT_OUTPUTSIZE) {
    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1day&outputsize=${outputsize}&format=JSON&apikey=${apiKey}`;
    try {
      const r = await fetch(url);
      const j = await r.json();
      if (j && j.status === 'error') {
        const msg = (j.message || '').toLowerCase();
        if (msg.includes('run out of api credits') || msg.includes('exceeded') || msg.includes('limit')) {
          pauseUntil = Date.now() + 65000;
          console.warn('sparklineService: rate limit hit, pausing until', new Date(pauseUntil).toISOString());
        }
        return null;
      }
      if (j && j.values) {
        const dates = j.values.map(v => v.datetime).reverse();
        const values = j.values.map(v => parseFloat(v.close)).reverse();
        cache.set(symbol, { dates, values });
        console.log(`sparklineService: cached ${symbol} (${values.length} points)`);
        return { dates, values };
      }
    } catch (e) {
      console.warn('Sparkline fetch error', symbol, e);
    }
    return null;
  }

  async function processQueue(apiKey) {
    if (running) return;
    running = true;
    try {
      const items = Array.from(queue);
      queue.clear();
      let idx = 0;
      while (idx < items.length) {
        const now = Date.now();
        if (pauseUntil > now) {
          const waitMs = pauseUntil - now + 200;
          console.log(`sparklineService: waiting ${waitMs}ms due to rate limit`);
          await new Promise(r => setTimeout(r, waitMs));
        }

        const batch = items.slice(idx, idx + PARALLEL);
        idx += PARALLEL;

        const tasks = batch.map(sym => (async () => {
          if (cache.has(sym)) return;
          let attempt = 0;
          let backoff = 300;
          while (attempt < MAX_RETRIES) {
            if (pauseUntil > Date.now()) return;
            if (attempt > 0) await new Promise(r => setTimeout(r, backoff));
            try {
              const res = await fetchFor(sym, apiKey);
              if (res) return;
            } catch (e) {
              console.warn('sparklineService: fetch attempt error', sym, e);
            }
            attempt++;
            backoff = Math.min(5000, backoff * 2);
          }
          // failed after retries — requeue for later
          queue.add(sym);
        })());

        await Promise.all(tasks);

        // if a rate-limit triggered during batch, requeue remaining and break
        if (pauseUntil > Date.now()) {
          for (let j = idx; j < items.length; j++) queue.add(items[j]);
          break;
        }
      }
    } finally {
      running = false;
    }
  }

  function request(symbol) {
    const apiKey = window.TWELVEDATA_API_KEY || '';
    if (cache.has(symbol)) return Promise.resolve(cache.get(symbol));
    queue.add(symbol);
    // schedule processing
    setTimeout(()=>processQueue(apiKey), 120);
    // return a promise that waits until cache filled
    return new Promise((resolve) => {
      const check = () => {
        if (cache.has(symbol)) return resolve(cache.get(symbol));
        const now = Date.now();
        if (pauseUntil > now) {
          setTimeout(check, Math.max(500, pauseUntil - now + 50));
        } else {
          setTimeout(check, 150);
        }
      };
      check();
    });
  }

  function prefetch(symbols) {
    symbols.forEach(s=>{ if (!cache.has(s)) queue.add(s); });
    setTimeout(()=>processQueue(window.TWELVEDATA_API_KEY || ''), 120);
  }

  window.sparklineService = { request, prefetch, _cache: cache };
})();
