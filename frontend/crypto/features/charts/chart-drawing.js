/**
 * Chart Drawing Tools
 * ───────────────────
 * Добавляет панель инструментов разметки графиков (как на CoinMarketCap/TradingView):
 *   Курсор · Горизонтальная линия · Линия тренда · Луч · Расширенная линия
 *   Прямоугольник · Fibonacci Retracement · Текст · Ластик · Отмена · Очистить
 *
 * Использует нативный LightweightCharts.createPriceLine() для горизонтальных линий
 * и canvas overlay для остальных инструментов (синхронизируется с pan/zoom).
 *
 * Запуск: другой модуль диспатчит CustomEvent 'lwcChartReady' с полями:
 *   { chart, series, containerId, toolbarId }
 */

(function (global) {
  'use strict';

  // ─── DRAWING MANAGER ─────────────────────────────────────────────────────────

  class DrawingManager {
    constructor(containerId, toolbarId) {
      this.containerId = containerId;
      this.toolbarId   = toolbarId;

      this.chart        = null;
      this.series       = null;
      this.activeTool   = 'cursor';
      this.activeColor  = '#3b82f6';
      this.activeWidth  = 1.5;

      this.drawings    = [];  // canvas-drawn objects
      this.priceLines  = [];  // native LightweightCharts price lines { pl, price }

      this.isDrawing   = false;
      this.tempStart   = null;
      this.tempEnd     = null;

      this._canvas      = null;
      this._ctx         = null;
      this._ro          = null;
      this._unsubs      = [];
      this._eventsBound = false;
      this._keyHandler  = null;
    }

    // ── Публичный init ──────────────────────────────────────────────────────
    init(chart, series) {
      this.chart  = chart;
      this.series = series;
      this._buildCanvas();
      this._subscribeChart();
      this._bindToolbar();
      this._bindKeyboard();
    }

    // ── Canvas overlay ──────────────────────────────────────────────────────
    _buildCanvas() {
      const host = document.getElementById(this.containerId);
      if (!host) return;

      const old = host.querySelector('.cdt-canvas');
      if (old) old.remove();

      this._canvas = document.createElement('canvas');
      this._canvas.className = 'cdt-canvas';
      Object.assign(this._canvas.style, {
        position: 'absolute', top: '0', left: '0',
        width: '100%', height: '100%',
        zIndex: '6', pointerEvents: 'none',
        borderRadius: 'inherit',
      });
      host.appendChild(this._canvas);
      this._ctx = this._canvas.getContext('2d');
      this._sizeCanvas();

      this._ro = new ResizeObserver(() => {
        this._sizeCanvas();
        this._redraw();
      });
      this._ro.observe(host);
    }

    _sizeCanvas() {
      if (!this._canvas) return;
      const host = document.getElementById(this.containerId);
      if (!host) return;
      const r   = host.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this._canvas.width  = Math.round(r.width  * dpr);
      this._canvas.height = Math.round(r.height * dpr);
      this._canvas.style.width  = r.width  + 'px';
      this._canvas.style.height = r.height + 'px';
      this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // ── Подписка на события графика (pan/zoom → перерисовка) ───────────────
    _subscribeChart() {
      if (!this.chart) return;
      const u1 = this.chart.timeScale().subscribeVisibleTimeRangeChange(() => this._redraw());
      const u2 = this.chart.subscribeCrosshairMove(() => this._redraw());
      this._unsubs.push(u1, u2);
    }

    // ── Toolbar события ─────────────────────────────────────────────────────
    _bindToolbar() {
      const tb = document.getElementById(this.toolbarId);
      if (!tb) return;

      tb.querySelectorAll('[data-tool]').forEach(btn => {
        btn.addEventListener('click', e => { e.stopPropagation(); this.setTool(btn.dataset.tool); });
      });

      tb.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          if (btn.dataset.action === 'undo')  this.undo();
          if (btn.dataset.action === 'clear') this.clear();
        });
      });

      tb.querySelectorAll('[data-color]').forEach(swatch => {
        swatch.addEventListener('click', e => {
          e.stopPropagation();
          this.activeColor = swatch.dataset.color;
          tb.querySelectorAll('[data-color]').forEach(s => s.classList.remove('active'));
          swatch.classList.add('active');
        });
      });

      tb.querySelectorAll('[data-width]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          this.activeWidth = parseFloat(btn.dataset.width);
          tb.querySelectorAll('[data-width]').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        });
      });
    }

    _bindKeyboard() {
      this._keyHandler = e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
          e.preventDefault();
          this.undo();
        }
        if (e.key === 'Escape') this.setTool('cursor');
      };
      document.addEventListener('keydown', this._keyHandler);
    }

    // ── Выбор инструмента ───────────────────────────────────────────────────
    setTool(tool) {
      this.activeTool = tool;
      const tb = document.getElementById(this.toolbarId);
      if (tb) {
        tb.querySelectorAll('[data-tool]').forEach(b =>
          b.classList.toggle('active', b.dataset.tool === tool)
        );
      }
      if (!this._canvas) return;

      if (tool === 'cursor') {
        this._canvas.style.pointerEvents = 'none';
        this._canvas.style.cursor = 'default';
      } else {
        this._canvas.style.pointerEvents = 'auto';
        const CURSORS = {
          hline: 'crosshair', trendline: 'crosshair', ray: 'crosshair',
          extended: 'crosshair', fib: 'crosshair', rect: 'crosshair',
          text: 'text', eraser: 'cell',
        };
        this._canvas.style.cursor = CURSORS[tool] || 'crosshair';
        if (!this._eventsBound) {
          this._bindCanvas();
          this._eventsBound = true;
        }
      }
    }

    // ── Canvas события мыши/тач ─────────────────────────────────────────────
    _bindCanvas() {
      const c = this._canvas;
      c.addEventListener('mousedown',  e => this._onDown(e));
      c.addEventListener('mousemove',  e => this._onMove(e));
      c.addEventListener('mouseup',    e => this._onUp(e));
      c.addEventListener('mouseleave', e => { if (this.isDrawing) this._onUp(e); });
      c.addEventListener('touchstart', e => { e.preventDefault(); this._onDown(this._t2m(e)); }, { passive: false });
      c.addEventListener('touchmove',  e => { e.preventDefault(); this._onMove(this._t2m(e)); }, { passive: false });
      c.addEventListener('touchend',   e => { e.preventDefault(); this._onUp(this._t2m(e));   }, { passive: false });
    }

    _t2m(e) {
      const t = e.touches[0] || e.changedTouches[0];
      return { clientX: t.clientX, clientY: t.clientY };
    }

    _xy(e) {
      const r = this._canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    _toChart(x, y) {
      if (!this.chart || !this.series) return null;
      return {
        x, y,
        time:  this.chart.timeScale().coordinateToTime(x),
        price: this.series.coordinateToPrice(y),
      };
    }

    _toPixel(time, price) {
      if (!this.chart || !this.series) return null;
      return {
        x: this.chart.timeScale().timeToCoordinate(time),
        y: this.series.priceToCoordinate(price),
      };
    }

    // ── Обработчики pointer ─────────────────────────────────────────────────
    _onDown(e) {
      const { x, y } = this._xy(e);
      const pt = this._toChart(x, y);

      // Горизонтальная линия: одиночный клик → native createPriceLine
      if (this.activeTool === 'hline') {
        if (pt && pt.price != null) {
          const pl = this.series.createPriceLine({
            price:            pt.price,
            color:            this.activeColor,
            lineWidth:        Math.max(1, Math.round(this.activeWidth)),
            lineStyle:        (global.LightweightCharts?.LineStyle?.Dashed ?? 1),
            axisLabelVisible: true,
            title: '',
          });
          this.priceLines.push({ pl, price: pt.price });
        }
        return;
      }

      // Ластик
      if (this.activeTool === 'eraser') {
        this._erase(x, y);
        return;
      }

      // Текст: prompt открывается после mouseup (не блокирует UI)
      if (this.activeTool === 'text') {
        if (pt && pt.time != null && pt.price != null) {
          setTimeout(() => {
            const txt = prompt('Введите текст для аннотации:');
            if (txt && txt.trim()) {
              this.drawings.push({
                type: 'text', time: pt.time, price: pt.price,
                text: txt.trim(), color: this.activeColor,
              });
              this._redraw();
            }
          }, 50);
        }
        return;
      }

      // Drag-tools
      const DRAG = ['trendline', 'ray', 'extended', 'fib', 'rect'];
      if (DRAG.includes(this.activeTool) && pt && pt.time != null) {
        this.isDrawing = true;
        this.tempStart = pt;
        this.tempEnd   = null;
      }
    }

    _onMove(e) {
      if (!this.isDrawing || !this.tempStart) return;
      const { x, y } = this._xy(e);
      this.tempEnd = this._toChart(x, y);
      this._redraw();
      if (this.tempEnd && this.tempEnd.time != null) {
        this._drawOne({
          type:  this.activeTool,
          start: { time: this.tempStart.time, price: this.tempStart.price },
          end:   { time: this.tempEnd.time,   price: this.tempEnd.price   },
          color: this.activeColor, width: this.activeWidth,
        }, true);
      }
    }

    _onUp(e) {
      if (!this.isDrawing || !this.tempStart) return;
      const { x, y } = this._xy(e);
      const end = this._toChart(x, y);
      const moved = end && (Math.abs(end.x - this.tempStart.x) > 3 ||
                            Math.abs(end.y - this.tempStart.y) > 3);

      if (moved && end.time != null) {
        this.drawings.push({
          type:  this.activeTool,
          start: { time: this.tempStart.time, price: this.tempStart.price },
          end:   { time: end.time, price: end.price },
          color: this.activeColor, width: this.activeWidth,
        });
      }

      this.isDrawing = false;
      this.tempStart = null;
      this.tempEnd   = null;
      this._redraw();
    }

    // ── Рендеринг ──────────────────────────────────────────────────────────
    _redraw() {
      if (!this._ctx || !this._canvas) return;
      const host = document.getElementById(this.containerId);
      if (!host) return;
      const r = host.getBoundingClientRect();
      this._ctx.clearRect(0, 0, r.width, r.height);
      for (const d of this.drawings) this._drawOne(d, false);
    }

    _drawOne(d, preview) {
      const ctx  = this._ctx;
      const host = document.getElementById(this.containerId);
      if (!host || !ctx) return;
      const r = host.getBoundingClientRect();

      ctx.save();
      ctx.globalAlpha = preview ? 0.62 : 1;

      const color = d.color || '#3b82f6';
      const width = d.width || 1.5;

      if (d.type === 'trendline') {
        const p1 = this._toPixel(d.start.time, d.start.price);
        const p2 = this._toPixel(d.end.time,   d.end.price);
        if (!this._validPx(p1, p2)) { ctx.restore(); return; }
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        if (!preview) this._dots(ctx, [p1, p2], color);

      } else if (d.type === 'ray') {
        const p1 = this._toPixel(d.start.time, d.start.price);
        const p2 = this._toPixel(d.end.time,   d.end.price);
        if (!this._validPx(p1, p2)) { ctx.restore(); return; }
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        if (Math.hypot(dx, dy) < 0.5) { ctx.restore(); return; }
        // extend to right edge
        const scale = dx !== 0 ? (r.width - p1.x) / dx : 0;
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p1.x + dx * scale, p1.y + dy * scale); ctx.stroke();
        // small arrowhead
        this._arrowhead(ctx, p1.x, p1.y, p1.x + dx * scale, p1.y + dy * scale, color, width);
        if (!preview) this._dots(ctx, [p1], color);

      } else if (d.type === 'extended') {
        const p1 = this._toPixel(d.start.time, d.start.price);
        const p2 = this._toPixel(d.end.time,   d.end.price);
        if (!this._validPx(p1, p2)) { ctx.restore(); return; }
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash([6, 4]);
        ctx.beginPath();
        if (Math.abs(dx) < 0.5) {
          ctx.moveTo(p1.x, 0); ctx.lineTo(p1.x, r.height);
        } else {
          const tL = -p1.x / dx, tR = (r.width - p1.x) / dx;
          ctx.moveTo(0, p1.y + tL * dy); ctx.lineTo(r.width, p1.y + tR * dy);
        }
        ctx.stroke();

      } else if (d.type === 'rect') {
        const p1 = this._toPixel(d.start.time, d.start.price);
        const p2 = this._toPixel(d.end.time,   d.end.price);
        if (!this._validPx(p1, p2)) { ctx.restore(); return; }
        const rx = Math.min(p1.x, p2.x), ry = Math.min(p1.y, p2.y);
        const rw = Math.abs(p2.x - p1.x), rh = Math.abs(p2.y - p1.y);
        ctx.fillStyle   = color + '22';
        ctx.strokeStyle = color;
        ctx.lineWidth   = width;
        ctx.setLineDash([]);
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeRect(rx, ry, rw, rh);

      } else if (d.type === 'fib') {
        this._drawFib(d, r);

      } else if (d.type === 'text') {
        const p = this._toPixel(d.time, d.price);
        if (!p || p.x == null || p.y == null) { ctx.restore(); return; }
        ctx.font = 'bold 13px Inter,-apple-system,sans-serif';
        const m = ctx.measureText(d.text), pad = 5, bh = 22;
        // pill background
        ctx.fillStyle = 'rgba(10,14,23,0.78)';
        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(p.x - pad, p.y - 17, m.width + pad * 2, bh, 4);
          ctx.fill();
        } else {
          ctx.fillRect(p.x - pad, p.y - 17, m.width + pad * 2, bh);
        }
        ctx.fillStyle = color;
        ctx.fillText(d.text, p.x, p.y);
      }

      ctx.restore();
    }

    _validPx(p1, p2) {
      return p1 && p2 && p1.x != null && p1.y != null && p2.x != null && p2.y != null;
    }

    _dots(ctx, pts, color) {
      ctx.save();
      ctx.fillStyle = color;
      pts.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }

    _arrowhead(ctx, x1, y1, x2, y2, color, lw) {
      const SIZE = 8;
      const angle = Math.atan2(y2 - y1, x2 - x1);
      ctx.save();
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - SIZE * Math.cos(angle - 0.45), y2 - SIZE * Math.sin(angle - 0.45));
      ctx.lineTo(x2 - SIZE * Math.cos(angle + 0.45), y2 - SIZE * Math.sin(angle + 0.45));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    _drawFib(d, r) {
      const ctx = this._ctx;
      if (!this.series) return;
      const pxL = this._toPixel(d.start.time, d.start.price);
      const pxR = this._toPixel(d.end.time,   d.end.price);
      if (!this._validPx(pxL, pxR)) return;

      const lx = Math.min(pxL.x, pxR.x);
      const rx = Math.max(pxL.x, pxR.x);

      const LEVELS = [
        { r: 0,     label: '0%',     col: '#ef4444' },
        { r: 0.236, label: '23.6%',  col: '#f97316' },
        { r: 0.382, label: '38.2%',  col: '#eab308' },
        { r: 0.5,   label: '50%',    col: '#22c55e' },
        { r: 0.618, label: '61.8%',  col: '#3b82f6' },
        { r: 0.786, label: '78.6%',  col: '#8b5cf6' },
        { r: 1,     label: '100%',   col: '#ef4444' },
      ];

      const p0 = d.start.price, p1 = d.end.price;
      const fullWidth = r.width;

      LEVELS.forEach(({ r: ratio, label, col }) => {
        const price = p1 - (p1 - p0) * ratio;
        const y     = this.series.priceToCoordinate(price);
        if (y == null) return;

        ctx.save();
        ctx.strokeStyle = col;
        ctx.lineWidth   = 1;
        ctx.setLineDash([5, 4]);
        ctx.globalAlpha = 0.82;
        // full-width dashed line
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(r.width, y); ctx.stroke();

        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.font = '11px Inter,-apple-system,sans-serif';
        ctx.fillStyle = col;
        // price label
        const priceStr = Math.abs(price) >= 1 ? price.toFixed(2) : price.toPrecision(4);
        ctx.fillText(`${label}  ${priceStr}`, lx + 4, y - 3);
        ctx.restore();
      });

      // Shaded Fibonacci zones (between adjacent levels)
      for (let i = 0; i < LEVELS.length - 1; i++) {
        const priceA = p1 - (p1 - p0) * LEVELS[i].r;
        const priceB = p1 - (p1 - p0) * LEVELS[i + 1].r;
        const yA = this.series.priceToCoordinate(priceA);
        const yB = this.series.priceToCoordinate(priceB);
        if (yA == null || yB == null) continue;
        ctx.save();
        ctx.fillStyle = LEVELS[i].col + '0D'; // 5% opacity
        ctx.fillRect(lx, Math.min(yA, yB), rx - lx, Math.abs(yB - yA));
        ctx.restore();
      }
    }

    // ── Ластик ──────────────────────────────────────────────────────────────
    _erase(x, y) {
      const THR = 12;

      // 1. Нативные price lines (горизонталь)
      let bestI = -1, bestD = THR + 1;
      this.priceLines.forEach((item, i) => {
        const py = this.series?.priceToCoordinate(item.price) ?? null;
        if (py != null) {
          const dist = Math.abs(py - y);
          if (dist < bestD) { bestD = dist; bestI = i; }
        }
      });
      if (bestI >= 0) {
        try { this.series.removePriceLine(this.priceLines[bestI].pl); } catch (_) {}
        this.priceLines.splice(bestI, 1);
        return;
      }

      // 2. Canvas drawings
      const idx = this.drawings.findIndex(d => this._hitTest(d, x, y, THR));
      if (idx >= 0) {
        this.drawings.splice(idx, 1);
        this._redraw();
      }
    }

    _hitTest(d, x, y, thr) {
      if (d.type === 'trendline' || d.type === 'ray' || d.type === 'extended') {
        const p1 = this._toPixel(d.start.time, d.start.price);
        const p2 = this._toPixel(d.end.time,   d.end.price);
        if (!this._validPx(p1, p2)) return false;
        return this._segDist(x, y, p1.x, p1.y, p2.x, p2.y) < thr;
      }
      if (d.type === 'rect' || d.type === 'fib') {
        const p1 = this._toPixel(d.start.time, d.start.price);
        const p2 = this._toPixel(d.end.time,   d.end.price);
        if (!p1 || p1.x == null) return false;
        return (x > Math.min(p1.x, p2.x) - thr && x < Math.max(p1.x, p2.x) + thr &&
                y > Math.min(p1.y, p2.y) - thr && y < Math.max(p1.y, p2.y) + thr);
      }
      if (d.type === 'text') {
        const p = this._toPixel(d.time, d.price);
        return p && p.x != null && Math.hypot(p.x - x, p.y - y) < thr * 2;
      }
      return false;
    }

    _segDist(px, py, x1, y1, x2, y2) {
      const dx = x2 - x1, dy = y2 - y1;
      const lenSq = dx * dx + dy * dy;
      if (!lenSq) return Math.hypot(px - x1, py - y1);
      const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
      return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    // ── История ─────────────────────────────────────────────────────────────
    undo() {
      if (this.drawings.length > 0) {
        this.drawings.pop();
        this._redraw();
      } else if (this.priceLines.length > 0) {
        const last = this.priceLines.pop();
        try { this.series.removePriceLine(last.pl); } catch (_) {}
      }
    }

    clear() {
      if (this.drawings.length === 0 && this.priceLines.length === 0) return;
      if (!confirm('Очистить все разметки на графике?')) return;
      this.priceLines.forEach(item => {
        try { this.series.removePriceLine(item.pl); } catch (_) {}
      });
      this.priceLines = [];
      this.drawings   = [];
      this._redraw();
    }

    // ── Уничтожение ─────────────────────────────────────────────────────────
    destroy() {
      if (this._ro)         this._ro.disconnect();
      if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler);
      this._unsubs.forEach(u => { try { u(); } catch (_) {} });
      this._unsubs = [];
      if (this._canvas) { this._canvas.remove(); this._canvas = null; }
      this.drawings    = [];
      this.priceLines  = [];
      this.isDrawing   = false;
      this._eventsBound = false;
    }
  }

  // ─── РЕЕСТР МЕНЕДЖЕРОВ ───────────────────────────────────────────────────────

  const _managers = {};

  function initDrawingTools(containerId, toolbarId, chart, series) {
    if (_managers[containerId]) _managers[containerId].destroy();
    const mgr = new DrawingManager(containerId, toolbarId);
    mgr.init(chart, series);
    _managers[containerId] = mgr;
    mgr.setTool('cursor'); // default: cursor
    return mgr;
  }

  // ─── ГЛОБАЛЬНОЕ СОБЫТИЕ ───────────────────────────────────────────────────────

  document.addEventListener('lwcChartReady', function (e) {
    const { chart, series, containerId, toolbarId } = e.detail || {};
    if (!chart || !series || !containerId || !toolbarId) return;
    // Задержка 150 мс — LightweightCharts должен завершить первый рендер и fitContent
    setTimeout(() => {
      if (document.getElementById(containerId) && document.getElementById(toolbarId)) {
        initDrawingTools(containerId, toolbarId, chart, series);
      }
    }, 200);
  });

  // ─── PUBLIC API ───────────────────────────────────────────────────────────────

  global.ChartDrawing = {
    initDrawingTools,
    getManager: id => _managers[id] || null,
  };

})(window);
