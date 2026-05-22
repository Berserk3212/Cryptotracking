(function() {
  // Хелперы валюты (читаем из localStorage, как currency.js)
  function _idxCurrencySymbol() {
    const cur = localStorage.getItem('selectedCurrency') || 'USD';
    const map = { USD:'$', EUR:'€', RUB:'₽', GBP:'£', JPY:'¥', CNY:'¥', CAD:'$', AUD:'$', CHF:'Fr' };
    return map[cur] || '$';
  }
  function _idxCurrencyRate() {
    const rate = parseFloat(localStorage.getItem('currencyRate'));
    return (rate && rate > 0) ? rate : 1;
  }
  function _idxFmt(usdValue) {
    const v = parseFloat(usdValue);
    if (isNaN(v)) return usdValue;
    const converted = v * _idxCurrencyRate();
    const sym = _idxCurrencySymbol();
    // Форматируем с локалью: большие числа с разделителями
    const formatted = converted >= 1000
      ? converted.toLocaleString('ru-RU', { maximumFractionDigits: 2 })
      : converted.toFixed(2);
    return sym + formatted;
  }
  const catmullRom2bezier = (points, tension = 0.5) => {
    const d = [];
    for (let i = 0; i < points.length; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1] || p1;
      const p3 = points[i + 2] || p2;
      if (i === 0) d.push(`M${p1[0]},${p1[1]}`);
      const cp1x = p1[0] + (p2[0] - p0[0]) / 6 * tension * 2;
      const cp1y = p1[1] + (p2[1] - p0[1]) / 6 * tension * 2;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6 * tension * 2;
      const cp2y = p2[1] - (p3[1] - p1[1]) / 6 * tension * 2;
      d.push(`C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`);
    }
    return d.join(' ');
  };

  const createPathFromValues = (values, w = 140, h = 36, pad = 6) => {
    const len = values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = (max - min) || 1;
    const step = (w - pad * 2) / Math.max(len - 1, 1);
    const points = values.map((v, i) => {
      const x = pad + i * step;
      const y = pad + (1 - (v - min) / range) * (h - pad * 2);
      return [x, y];
    });
    const d = catmullRom2bezier(points);
    const area = d + ` L ${w - pad},${h - pad} L ${pad},${h - pad} Z`;
    return { path: d, area };
  };

  const mountApp = (indices) => {
    const { createApp } = window.Vue;
    if (!createApp) return;
    
    const App = {
      data() {
        return { indices: indices || window.indicesData || [] };
      },
      template: `
        <div class="indices-grid">
          <index-card v-for="(idx, i) in indices" :key="idx.symbol" :item="idx" :index="i"></index-card>
        </div>
      `
    };

    const IndexCard = {
      props: ['item', 'index'],
      template: `
        <div class="index-card" :style="{ animationDelay: (index * 70) + 'ms' }" @mouseenter="hover=true" @mouseleave="hover=false">
          <div class="index-header">
            <div class="index-left">
              <div class="index-icon notranslate" translate="no">{{item.symbol.charAt(0)}}</div>
              <div class="index-meta">
                <div class="index-name notranslate" translate="no">{{item.name}}</div>
                <div class="index-symbol notranslate" translate="no">{{item.symbol}}</div>
              </div>
            </div>
            <div class="index-right">
              <div class="index-value notranslate" translate="no">{{fmtVal(item.value)}}</div>
              <div :class="['index-change', parseFloat(item.changePercent) >= 0 ? 'positive' : 'negative']" class="notranslate" translate="no">{{formatChange(item.changePercent)}}</div>
            </div>
          </div>
          <div class="index-body">
            <div class="index-sparkline-placeholder" ref="spark" aria-hidden="true">
              <svg viewBox="0 0 180 48" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="decor-grad" x1="0" x2="1">
                    <stop offset="0%" stop-color="currentColor" stop-opacity="0.18"/>
                    <stop offset="60%" stop-color="currentColor" stop-opacity="0.06"/>
                    <stop offset="100%" stop-color="currentColor" stop-opacity="0.02"/>
                  </linearGradient>
                </defs>
                <path class="decor-area" d="" />
                <path class="decor-path" d="" />
              </svg>
            </div>
            <div class="index-details">
              <div class="notranslate" translate="no"><small translate="no">Мин:</small> {{fmtVal(item.low)}}</div>
              <div class="notranslate" translate="no"><small translate="no">Объём:</small> {{item.volume}}</div>
            </div>
          </div>
        </div>
      `,
      data(){ return { hover:false }},
      mounted(){ this.renderDecorativeSpark(); },
      methods:{
        fmtVal(v){ return _idxFmt(v); },
        formatChange(v){ return (parseFloat(v) >=0 ? '+' : '') + v + '%'; },

        renderDecorativeSpark(){
          const el = this.$refs.spark;
          if (!el) return;
          const svg = el.querySelector('svg');
          if (!svg) return;
          const pathEl = svg.querySelector('.decor-path');
          const areaEl = svg.querySelector('.decor-area');
          const w = 180, h = 48, pad = 8;

          // seeded pseudo-random for consistent decorative shapes per symbol
          const seed = (this.item && this.item.symbol) ? Array.from(this.item.symbol).reduce((s,ch)=>s + ch.charCodeAt(0), 0) : Date.now();
          const rnd = this.seededRandom(seed);
          const base = parseFloat(this.item && this.item.value) || 100;
          const trend = parseFloat(this.item && this.item.changePercent) || 0;
          const len = 22;
          const values = [];
          for (let i = 0; i < len; i++) {
            const t = i / (len - 1);
            const noise = (Math.sin(i * 1.3 + seed % 10) + (rnd() - 0.5) * 2) * 0.012;
            const trendOff = (trend / 100) * (t - 0.5) * 0.6; // subtle trending
            const v = base * (1 + trendOff + noise);
            values.push(v);
          }

          const { path, area } = createPathFromValues(values, w, h, pad);
          try {
            pathEl.setAttribute('d', path);
            areaEl.setAttribute('d', area);

            // stroke animation: draw from left to right
            const L = pathEl.getTotalLength();
            pathEl.style.strokeDasharray = `${L}`;
            pathEl.style.strokeDashoffset = `${L}`;
            pathEl.style.transition = 'stroke-dashoffset 900ms cubic-bezier(.2,.9,.2,1)';
            // small timeout to allow paint
            setTimeout(()=>{ pathEl.style.strokeDashoffset = '0'; }, 40 + (seed % 120));
          } catch(e) {
            // some browsers may fail getTotalLength if not rendered yet
            pathEl.setAttribute('d', path);
            areaEl.setAttribute('d', area);
          }
        },

        seededRandom(seed){
          let t = seed % 2147483647;
          if (t <= 0) t += 2147483646;
          return function(){ t = (t * 48271) % 2147483647; return (t - 1) / 2147483646; };
        }
      }
    };

    const app = createApp(App);
    app.component('index-card', IndexCard);
    // mount or remount
    const mountPoint = document.getElementById('indicesGrid');
    if (!mountPoint) return;
    // Unmount previous instance before remounting to prevent Vue double-mount warning
    if (window._indicesVueApp) {
      try { window._indicesVueApp.unmount(); } catch (e) {}
      window._indicesVueApp = null;
    }
    mountPoint.innerHTML = '';
    app.mount(mountPoint);
    window._indicesVueApp = app;
    // expose updater
    window.updateIndexCards = (newData) => { app._instance.data.indices = newData; };
  }

  // expose mount function
  window.mountIndexCards = mountApp;
})();
