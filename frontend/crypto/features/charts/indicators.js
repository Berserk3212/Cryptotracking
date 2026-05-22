function calculateSMA(data, period) {
  const result = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j];
    }
    result.push(sum / period);
  }
  
  return result;
}

function calculateEMA(data, period) {
  const result = [];
  const multiplier = 2 / (period + 1);
  
  let sum = 0;
  for (let i = 0; i < period; i++) {
    if (i < data.length) {
      sum += data[i];
    }
  }
  const firstEMA = sum / period;
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else if (i === period - 1) {
      result.push(firstEMA);
    } else {
      const ema = (data[i] - result[i - 1]) * multiplier + result[i - 1];
      result.push(ema);
    }
  }
  
  return result;
}

function calculateRSI(prices, period = 14) {
  const rsi = [];
  
  if (prices.length < period + 1) {
    return prices.map(() => null);
  }
  
  const changes = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }
  
  let avgGain = 0;
  let avgLoss = 0;
  
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) {
      avgGain += changes[i];
    } else {
      avgLoss += Math.abs(changes[i]);
    }
  }
  
  avgGain /= period;
  avgLoss /= period;
  
  for (let i = 0; i <= period; i++) {
    rsi.push(null);
  }
  
  if (avgLoss === 0) {
    rsi.push(100);
  } else {
    const rs = avgGain / avgLoss;
    rsi.push(100 - (100 / (1 + rs)));
  }
  
  // Расчёт RSI методом сглаживания Уайлдера (RMA)
  for (let i = period + 1; i < changes.length; i++) {
    const change = changes[i];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    
    // сглаживание Уайлдера: avgGain = (prevAvgGain * (period - 1) + currentGain) / period
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    
    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }
  }
  
  return rsi;
}

/**
 * Расчёт MACD (Moving Average Convergence Divergence)
 * @param {Array} prices - Массив цен закрытия
 * @param {Number} fastPeriod - Период быстрой EMA (по умолчанию 12)
 * @param {Number} slowPeriod - Период медленной EMA (по умолчанию 26)
 * @param {Number} signalPeriod - Период сигнальной линии (по умолчанию 9)
 * @returns {Object} - {macd, signal, histogram}
 */
function calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const fastEMA = calculateEMA(prices, fastPeriod);
  const slowEMA = calculateEMA(prices, slowPeriod);
  
  // Вычисляем линию MACD
  const macdLine = [];
  for (let i = 0; i < prices.length; i++) {
    if (fastEMA[i] === null || slowEMA[i] === null) {
      macdLine.push(null);
    } else {
      macdLine.push(fastEMA[i] - slowEMA[i]);
    }
  }
  
  // Сигнальная линия — EMA от MACD
  const validMacd = macdLine.filter(v => v !== null);
  const signalEMA = calculateEMA(validMacd, signalPeriod);
  
  // Синхронизируем сигнальную линию с линией MACD
  const signal = [];
  let signalIndex = 0;
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] === null) {
      signal.push(null);
    } else {
      signal.push(signalEMA[signalIndex] || null);
      signalIndex++;
    }
  }
  
  // Гистограмма
  const histogram = [];
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] === null || signal[i] === null) {
      histogram.push(null);
    } else {
      histogram.push(macdLine[i] - signal[i]);
    }
  }
  
  return { macd: macdLine, signal, histogram };
}

/**
 * Расчёт полос Боллинджера
 * @param {Array} prices - Массив цен закрытия
 * @param {Number} period - Период средней (по умолчанию 20)
 * @param {Number} stdDev - Множитель стандартного отклонения (по умолчанию 2)
 * @returns {Object} - {upper, middle, lower}
 */
function calculateBollingerBands(prices, period = 20, stdDev = 2) {
  const middle = calculateSMA(prices, period);
  const upper = [];
  const lower = [];
  
  for (let i = 0; i < prices.length; i++) {
    if (middle[i] === null) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    
    // Стандартное отклонение
    let sumSquares = 0;
    for (let j = 0; j < period; j++) {
      const diff = prices[i - j] - middle[i];
      sumSquares += diff * diff;
    }
    const sd = Math.sqrt(sumSquares / period);
    
    upper.push(middle[i] + (stdDev * sd));
    lower.push(middle[i] - (stdDev * sd));
  }
  
  return { upper, middle, lower };
}

/**
 * Отрисовка графика индикаторов
 * @param {Array} klines - данные OHLCV от Binance
 * @param {String} symbol - Тикер криптовалюты
 */
window.renderIndicatorsChart = async function(klines, symbol) {

  
  try {
    const outerContainer = document.getElementById('tradingViewChartContainer');
    if (!outerContainer) return;
    
    // Скрываем легенду и OHLC-строку в режиме индикаторов
    const legend = document.getElementById('chartLegend');
    const ohlc = document.getElementById('chartOhlcDisplay');
    if (legend) legend.style.display = 'none';
    if (ohlc) ohlc.style.display = 'none';

    // Скрываем только toolbar, но не chartAreaWrapper — потому что cryptoDetailPriceChart находится внутри него
    const drawingToolbarInd = document.getElementById('cryptoDrawingToolbar');
    if (drawingToolbarInd) drawingToolbarInd.style.display = 'none';
    
    // Получаем или создаём контейнер индикаторов
    let container = document.getElementById('cryptoDetailPriceChart');
    if (!container) return;
    
    // Очищаем предыдущий график
    container.innerHTML = '';
    
    // Адаптивные размеры — измеряем ДО применения indicators-mode
    const isMobile = window.innerWidth <= 768;
    // clientWidth может быть 0 если контейнер ещё не отрендерен — берём offsetWidth как fallback
    const rawWidth = container.clientWidth || container.offsetWidth || container.parentElement?.clientWidth || 800;
    const chartWidth = Math.max(100, rawWidth - (isMobile ? 16 : 56));
    const mainChartHeight = isMobile ? 220 : 300;
    const subChartHeight = isMobile ? 120 : 150;

    // Добавляем класс режима индикаторов для CSS
    outerContainer.classList.add('indicators-mode');
    
    // Извлекаем цены и временные метки
    const closePrices = klines.map(k => parseFloat(k[4]));
    const timestamps = klines.map(k => Math.floor(k[0] / 1000));
    
    // Рассчитываем все индикаторы
    const rsi = calculateRSI(closePrices, 14);
    const macd = calculateMACD(closePrices, 12, 26, 9);
    const ma50 = calculateSMA(closePrices, 50);
    const ma200 = calculateSMA(closePrices, 200);
    const bollingerBands = calculateBollingerBands(closePrices, 20, 2);
    

    
    // Обёртка для удобной раскладки
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `display: flex; flex-direction: column; gap: ${isMobile ? '0.75rem' : '1.5rem'}; padding: ${isMobile ? '0.5rem' : '1rem'};`;
    container.appendChild(wrapper);
    
    // === MAIN CHART WITH PRICE AND MAs ===
    const mainSection = document.createElement('div');
    mainSection.innerHTML = `<h3 style="color: #F8FAFC; margin: 0 0 0.5rem 0; font-size: ${isMobile ? '0.75rem' : '0.875rem'}; font-weight: 600;">Цена + MA + Bollinger Bands</h3>`;
    wrapper.appendChild(mainSection);
    
    const mainContainer = document.createElement('div');
    // Явная высота обязательна: mobile-charts-fix.js убирает height из опций createChart,
    // а autoSize читает clientHeight — без style.height контейнер = 0px → пустой чарт
    mainContainer.style.cssText = `width: 100%; height: ${mainChartHeight}px; position: relative; flex-shrink: 0;`;
    mainSection.appendChild(mainContainer);
    
    const mainChart = LightweightCharts.createChart(mainContainer, {
      autoSize: true,
      height: mainChartHeight,
      layout: {
        background: { color: '#1a1d28' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(197, 203, 206, 0.4)',
      },
      timeScale: {
        borderColor: 'rgba(197, 203, 206, 0.4)',
        timeVisible: true,
      },
    });
    
    // График цены
    const priceData = timestamps.map((time, i) => ({
      time,
      value: closePrices[i]
    }));
    
    const priceSeries = mainChart.addLineSeries({
      color: '#2962FF',
      lineWidth: 2,
      title: 'Price',
    });
    priceSeries.setData(priceData);
    
    // MA50
    const ma50Data = timestamps.map((time, i) => ({
      time,
      value: ma50[i]
    })).filter(d => d.value !== null);
    
    if (ma50Data.length > 0) {
      const ma50Series = mainChart.addLineSeries({
        color: '#f59e0b',
        lineWidth: 1.5,
      });
      ma50Series.setData(ma50Data);
    }
    
    // MA200
    const ma200Data = timestamps.map((time, i) => ({
      time,
      value: ma200[i]
    })).filter(d => d.value !== null);
    
    if (ma200Data.length > 0) {
      const ma200Series = mainChart.addLineSeries({
        color: '#ef4444',
        lineWidth: 1.5,
      });
      ma200Series.setData(ma200Data);
    }
    
    // Полосы Боллинджера
    const upperBandData = timestamps.map((time, i) => ({
      time,
      value: bollingerBands.upper[i]
    })).filter(d => d.value !== null);
    
    const lowerBandData = timestamps.map((time, i) => ({
      time,
      value: bollingerBands.lower[i]
    })).filter(d => d.value !== null);
    
    if (upperBandData.length > 0) {
      const upperBandSeries = mainChart.addLineSeries({
        color: 'rgba(33, 150, 243, 0.5)',
        lineWidth: 1,
        lineStyle: 2,
      });
      upperBandSeries.setData(upperBandData);
    }
    
    if (lowerBandData.length > 0) {
      const lowerBandSeries = mainChart.addLineSeries({
        color: 'rgba(33, 150, 243, 0.5)',
        lineWidth: 1,
        lineStyle: 2,
      });
      lowerBandSeries.setData(lowerBandData);
    }
    
    mainChart.timeScale().fitContent();
    
    // Вручную добавляем легенду
    const mainLegend = document.createElement('div');
    mainLegend.style.cssText = `display: flex; gap: ${isMobile ? '0.5rem' : '1rem'}; flex-wrap: wrap; margin-top: 0.375rem; font-size: ${isMobile ? '0.65rem' : '0.75rem'};`;
    mainLegend.innerHTML = `
      <span style="color: #2962FF;">■ Price</span>
      <span style="color: #f59e0b;">■ MA50</span>
      <span style="color: #ef4444;">■ MA200</span>
      <span style="color: rgba(33, 150, 243, 0.7);">- - BB Upper/Lower</span>
    `;
    mainSection.appendChild(mainLegend);
    
    // === RSI CHART ===
    const rsiSection = document.createElement('div');
    rsiSection.innerHTML = `<h3 style="color: #F8FAFC; margin: 0 0 0.5rem 0; font-size: ${isMobile ? '0.75rem' : '0.875rem'}; font-weight: 600;">RSI (14)</h3>`;
    wrapper.appendChild(rsiSection);
    
    const rsiContainer = document.createElement('div');
    rsiContainer.style.cssText = `width: 100%; height: ${subChartHeight}px; position: relative; flex-shrink: 0;`;
    rsiSection.appendChild(rsiContainer);
    
    const rsiChart = LightweightCharts.createChart(rsiContainer, {
      autoSize: true,
      height: subChartHeight,
      layout: {
        background: { color: '#1a1d28' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(197, 203, 206, 0.4)',
      },
      timeScale: {
        borderColor: 'rgba(197, 203, 206, 0.4)',
        visible: false,
      },
    });
    
    const rsiData = timestamps.map((time, i) => ({
      time,
      value: rsi[i]
    })).filter(d => d.value !== null);
    
    const rsiSeries = rsiChart.addLineSeries({
      color: '#9c27b0',
      lineWidth: 2,
    });
    rsiSeries.setData(rsiData);
    
    // Линии перекупленности/перепроданности
    const rsiOverBought = rsiChart.addLineSeries({
      color: 'rgba(239, 68, 68, 0.5)',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    rsiOverBought.setData([
      { time: timestamps[0], value: 70 },
      { time: timestamps[timestamps.length - 1], value: 70 }
    ]);
    
    const rsiOverSold = rsiChart.addLineSeries({
      color: 'rgba(16, 185, 129, 0.5)',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    rsiOverSold.setData([
      { time: timestamps[0], value: 30 },
      { time: timestamps[timestamps.length - 1], value: 30 }
    ]);
    
    rsiChart.timeScale().fitContent();
    
    const rsiLegend = document.createElement('div');
    rsiLegend.style.cssText = `display: flex; gap: ${isMobile ? '0.5rem' : '1rem'}; flex-wrap: wrap; margin-top: 0.375rem; font-size: ${isMobile ? '0.6rem' : '0.75rem'}; color: #94A3B8;`;
    rsiLegend.innerHTML = `
      <span>Период: 14</span>
      <span style="color: #ef4444;">Перекупленность: &gt;70</span>
      <span style="color: #10b981;">Перепроданность: &lt;30</span>
    `;
    rsiSection.appendChild(rsiLegend);
    
    // === MACD CHART ===
    const macdSection = document.createElement('div');
    macdSection.innerHTML = `<h3 style="color: #F8FAFC; margin: 0 0 0.5rem 0; font-size: ${isMobile ? '0.75rem' : '0.875rem'}; font-weight: 600;">MACD (12, 26, 9)</h3>`;
    wrapper.appendChild(macdSection);
    
    const macdContainer = document.createElement('div');
    macdContainer.style.cssText = `width: 100%; height: ${subChartHeight}px; position: relative; flex-shrink: 0;`;
    macdSection.appendChild(macdContainer);
    
    const macdChart = LightweightCharts.createChart(macdContainer, {
      autoSize: true,
      height: subChartHeight,
      layout: {
        background: { color: '#1a1d28' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(197, 203, 206, 0.4)',
      },
      timeScale: {
        borderColor: 'rgba(197, 203, 206, 0.4)',
        timeVisible: true,
      },
    });
    
    // Линия MACD
    const macdLineData = timestamps.map((time, i) => ({
      time,
      value: macd.macd[i]
    })).filter(d => d.value !== null);
    
    const macdLineSeries = macdChart.addLineSeries({
      color: '#2196F3',
      lineWidth: 2,
    });
    macdLineSeries.setData(macdLineData);
    
    // Сигнальная линия
    const signalData = timestamps.map((time, i) => ({
      time,
      value: macd.signal[i]
    })).filter(d => d.value !== null);
    
    const signalSeries = macdChart.addLineSeries({
      color: '#FF6D00',
      lineWidth: 2,
    });
    signalSeries.setData(signalData);
    
    // Гистограмма
    const histogramData = timestamps.map((time, i) => ({
      time,
      value: macd.histogram[i],
      color: macd.histogram[i] >= 0 ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)'
    })).filter(d => d.value !== null);
    
    const histogramSeries = macdChart.addHistogramSeries({
      priceFormat: {
        type: 'price',
        precision: 4,
        minMove: 0.0001,
      },
    });
    histogramSeries.setData(histogramData);
    
    macdChart.timeScale().fitContent();
    
    const macdLegend = document.createElement('div');
    macdLegend.style.cssText = `display: flex; gap: ${isMobile ? '0.5rem' : '1rem'}; flex-wrap: wrap; margin-top: 0.375rem; font-size: ${isMobile ? '0.65rem' : '0.75rem'};`;
    macdLegend.innerHTML = `
      <span style="color: #2196F3;">■ MACD Line (12,26)</span>
      <span style="color: #FF6D00;">■ Signal Line (9)</span>
      <span style="color: #26a69a;">■ Histogram (разница)</span>
    `;
    macdSection.appendChild(macdLegend);
    
    // Синхронизация временных шкал
    mainChart.timeScale().subscribeVisibleTimeRangeChange((timeRange) => {
      rsiChart.timeScale().setVisibleRange(timeRange);
      macdChart.timeScale().setVisibleRange(timeRange);
    });
    
    // autoSize: true уже обеспечивает ресайз — отдельный ResizeObserver не нужен
    if (window._indicatorsResizeObserver) {
      window._indicatorsResizeObserver.disconnect();
      window._indicatorsResizeObserver = null;
    }
    

    
  } catch (error) {

    if (typeof window.showNotification === 'function') {
      window.showNotification('Ошибка отображения индикаторов', 'error');
    }
  }
};

// Вспомогательные функции для отдельных индикаторов

// Стохастический осциллятор (Stochastic)
function calculateStochastic(highs, lows, closes, kPeriod = 9, dPeriod = 3) {
  const k = [];
  for (let i = kPeriod - 1; i < closes.length; i++) {
    const highestHigh = Math.max(...highs.slice(i - kPeriod + 1, i + 1));
    const lowestLow = Math.min(...lows.slice(i - kPeriod + 1, i + 1));
    const currentClose = closes[i];
    const kValue = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
    k.push(kValue);
  }
  const d = calculateSMA(k, dPeriod);
  return { k, d };
}

// Стохастический RSI
function calculateStochRSI(prices, rsiPeriod = 14, stochPeriod = 14) {
  const rsi = calculateRSI(prices, rsiPeriod);
  const validRsi = rsi.filter(v => v !== null);
  
  const stochRsi = [];
  for (let i = stochPeriod - 1; i < validRsi.length; i++) {
    const slice = validRsi.slice(i - stochPeriod + 1, i + 1);
    const maxRsi = Math.max(...slice);
    const minRsi = Math.min(...slice);
    const value = ((validRsi[i] - minRsi) / (maxRsi - minRsi)) * 100;
    stochRsi.push(isNaN(value) ? 50 : value);
  }
  return stochRsi;
}

// ADX (Average Directional Index — индекс направленности тренда)
function calculateADX(highs, lows, closes, period = 14) {
  if (closes.length < period * 2) return null;
  
  const tr = [];
  const plusDM = [];
  const minusDM = [];
  
  // Вычисляем TR, +DM, -DM
  for (let i = 1; i < closes.length; i++) {
    const high = highs[i];
    const low = lows[i];
    const prevHigh = highs[i - 1];
    const prevLow = lows[i - 1];
    const prevClose = closes[i - 1];
    
    const trueRange = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    tr.push(trueRange);
    
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  
  // Сглаживание Уайлдера (RMA)
  let smoothedTR = tr.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);
  
  const dx = [];
  
  for (let i = period; i < tr.length; i++) {
    smoothedTR = smoothedTR - (smoothedTR / period) + tr[i];
    smoothedPlusDM = smoothedPlusDM - (smoothedPlusDM / period) + plusDM[i];
    smoothedMinusDM = smoothedMinusDM - (smoothedMinusDM / period) + minusDM[i];
    
    const plusDI = (smoothedPlusDM / smoothedTR) * 100;
    const minusDI = (smoothedMinusDM / smoothedTR) * 100;
    
    const dxValue = (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100;
    dx.push(dxValue);
  }
  
  // ADX = RMA от DX
  if (dx.length < period) return null;
  
  let adx = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < dx.length; i++) {
    adx = ((adx * (period - 1)) + dx[i]) / period;
  }
  
  return adx;
}

// Williams %R
function calculateWilliamsR(highs, lows, closes, period = 14) {
  const values = [];
  for (let i = period - 1; i < closes.length; i++) {
    const highestHigh = Math.max(...highs.slice(i - period + 1, i + 1));
    const lowestLow = Math.min(...lows.slice(i - period + 1, i + 1));
    const value = ((highestHigh - closes[i]) / (highestHigh - lowestLow)) * -100;
    values.push(value);
  }
  return values;
}

// CCI (Commodity Channel Index — индекс товарного канала)
function calculateCCI(highs, lows, closes, period = 20) {
  const tp = closes.map((c, i) => (highs[i] + lows[i] + c) / 3);
  const sma = calculateSMA(tp, period);
  
  const cci = [];
  
  // Заполняем начальные значения null
  for (let i = 0; i < period - 1; i++) {
    cci.push(null);
  }
  
  for (let i = period - 1; i < tp.length; i++) {
    const slice = tp.slice(i - period + 1, i + 1);
    const smaVal = sma[i];
    
    if (smaVal === null) {
      cci.push(null);
      continue;
    }
    
    const meanDev = slice.reduce((sum, val) => sum + Math.abs(val - smaVal), 0) / period;
    const value = meanDev > 0 ? (tp[i] - smaVal) / (0.015 * meanDev) : 0;
    cci.push(value);
  }
  
  return cci;
}

// ATR (Average True Range — средний истинный диапазон)
function calculateATR(highs, lows, closes, period = 14) {
  if (closes.length < 2) return 0;
  
  const tr = [];
  for (let i = 1; i < closes.length; i++) {
    const trueRange = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    tr.push(trueRange);
  }
  const atr = calculateSMA(tr, period);
  return atr.length > 0 ? atr[atr.length - 1] : 0;
}

// ROC (Rate of Change — скорость изменения)
function calculateROC(closes, period = 12) {
  if (closes.length <= period) return 0;
  
  const currentPrice = closes[closes.length - 1];
  const pastPrice = closes[closes.length - 1 - period];
  return ((currentPrice - pastPrice) / pastPrice) * 100;
}

// Ultimate Oscillator
function calculateUltimateOscillator(highs, lows, closes) {
  if (closes.length < 29) return 50; // недостаточно данных
  
  const bp = [];
  const tr = [];
  
  for (let i = 1; i < closes.length; i++) {
    bp.push(closes[i] - Math.min(lows[i], closes[i - 1]));
    tr.push(Math.max(highs[i], closes[i - 1]) - Math.min(lows[i], closes[i - 1]));
  }
  
  const sum7bp = bp.slice(-7).reduce((a, b) => a + b, 0);
  const sum7tr = tr.slice(-7).reduce((a, b) => a + b, 0);
  const avg7 = sum7tr > 0 ? sum7bp / sum7tr : 0;
  
  const sum14bp = bp.slice(-14).reduce((a, b) => a + b, 0);
  const sum14tr = tr.slice(-14).reduce((a, b) => a + b, 0);
  const avg14 = sum14tr > 0 ? sum14bp / sum14tr : 0;
  
  const sum28bp = bp.slice(-28).reduce((a, b) => a + b, 0);
  const sum28tr = tr.slice(-28).reduce((a, b) => a + b, 0);
  const avg28 = sum28tr > 0 ? sum28bp / sum28tr : 0;
  
  return ((4 * avg7) + (2 * avg14) + avg28) / 7 * 100;
}

// Bull/Bear Power
function calculateBullBearPower(highs, lows, closes, period = 13) {
  const ema = calculateEMA(closes, period);
  if (ema.length === 0) return { bull: 0, bear: 0, power: 0 };
  
  const bullPower = highs[highs.length - 1] - ema[ema.length - 1];
  const bearPower = lows[lows.length - 1] - ema[ema.length - 1];
  return { bull: bullPower, bear: bearPower, power: bullPower + bearPower };
}

// Показатель максимумов/минимумов
function calculateHighsLows(highs, lows, period = 14) {
  if (highs.length < period) return 0;
  
  const recentHighs = highs.slice(-period);
  const recentLows = lows.slice(-period);
  const currentPrice = highs[highs.length - 1];
  const highestHigh = Math.max(...recentHighs);
  const lowestLow = Math.min(...recentLows);
  
  if (currentPrice === highestHigh) return 1;
  if (currentPrice === lowestLow) return -1;
  return 0;
}

// Calculate Awesome Oscillator (Чудесный осциллятор Билла Вильямса)
function calculateAwesomeOscillator(highs, lows, closes) {
  // AO = SMA(median price, 5) - SMA(median price, 34)
  const medianPrices = closes.map((c, i) => (highs[i] + lows[i]) / 2);
  const sma5 = calculateSMA(medianPrices, 5);
  const sma34 = calculateSMA(medianPrices, 34);
  
  if (sma5.length === 0 || sma34.length === 0) return null;
  
  const ao = [];
  const minLength = Math.min(sma5.length, sma34.length);
  
  for (let i = 0; i < minLength; i++) {
    if (sma5[i] !== null && sma34[i] !== null) {
      ao.push(sma5[i] - sma34[i]);
    } else {
      ao.push(null);
    }
  }
  
  return ao;
}

// Calculate Momentum
function calculateMomentum(closes, period = 10) {
  if (closes.length <= period + 1) return null;
  
  const momentum = [];
  
  for (let i = period; i < closes.length; i++) {
    const current = closes[i];
    const past = closes[i - period];
    momentum.push(current - past);
  }
  
  return momentum;
}

// Calculate all technical indicators and return table data
window.calculateTechnicalIndicators = function(klines, interval = '1d') {

  
  try {
    // Validate input
    if (!klines || klines.length < 30) {

      return {
        oscillators: [],
        movingAverages: [],
        summary: {
          oscillators: { buy: 0, sell: 0, neutral: 0 },
          movingAverages: { buy: 0, sell: 0, neutral: 0 }
        },
        error: 'Недостаточно данных для расчета индикаторов (минимум 30 свечей)'
      };
    }
    
    const closes = klines.map(k => parseFloat(k[4]));
    const highs = klines.map(k => parseFloat(k[2]));
    const lows = klines.map(k => parseFloat(k[3]));
    const opens = klines.map(k => parseFloat(k[1]));
    
    // Check for invalid data
    if (closes.some(isNaN) || highs.some(isNaN) || lows.some(isNaN)) {

      return {
        oscillators: [],
        movingAverages: [],
        summary: {
          oscillators: { buy: 0, sell: 0, neutral: 0 },
          movingAverages: { buy: 0, sell: 0, neutral: 0 }
        },
        error: 'Некорректные данные цен'
      };
    }
    
    const currentPrice = closes[closes.length - 1];
    

    
    // Helper to safely get last value - returns null if no valid data
    const getLastValue = (arr) => {
      if (!arr || arr.length === 0) return null;
      const filtered = arr.filter(v => v !== null && !isNaN(v) && isFinite(v));
      return filtered.length > 0 ? filtered[filtered.length - 1] : null;
    };
    
    // Helper to safely calculate indicator
    const safeCalculate = (calcFn, ...args) => {
      try {
        return calcFn(...args);
      } catch (e) {

        return null;
      }
    };
    
    // Determine signal for each indicator
    const getSignalForIndicator = (indicator, value, prevValue = null) => {
      switch(indicator) {
        case 'RSI':
          if (value >= 70) return { action: 'sell', text: 'Продавать' };
          if (value <= 30) return { action: 'buy', text: 'Покупать' };
          return { action: 'neutral', text: 'Нейтрально' };
        
        case 'STOCH':
        case 'STOCHRSI':
          if (value >= 80) return { action: 'sell', text: 'Продавать' };
          if (value <= 20) return { action: 'buy', text: 'Покупать' };
          return { action: 'neutral', text: 'Нейтрально' };
        
        case 'MACD':
          if (value > 0) return { action: 'buy', text: 'Покупать' };
          if (value < 0) return { action: 'sell', text: 'Продавать' };
          return { action: 'neutral', text: 'Нейтрально' };
        
        case 'ADX':
          // ADX just shows neutral - it indicates trend strength, not direction
          return { action: 'neutral', text: 'Нейтрально' };
        
        case 'WILLIAMS':
          if (value >= -20) return { action: 'sell', text: 'Продавать' };
          if (value <= -80) return { action: 'buy', text: 'Покупать' };
          return { action: 'neutral', text: 'Нейтрально' };
        
        case 'CCI':
          if (value >= 100) return { action: 'sell', text: 'Продавать' };
          if (value <= -100) return { action: 'buy', text: 'Покупать' };
          return { action: 'neutral', text: 'Нейтрально' };
        
        case 'AO':
        case 'MOMENTUM':
          // TradingView checks the TREND (current vs previous value)
          if (prevValue !== null) {
            if (value > prevValue) return { action: 'buy', text: 'Покупать' };
            if (value < prevValue) return { action: 'sell', text: 'Продавать' };
          }
          // Fallback to simple logic if no previous value
          if (value > 0) return { action: 'buy', text: 'Покупать' };
          if (value < 0) return { action: 'sell', text: 'Продавать' };
          return { action: 'neutral', text: 'Нейтрально' };
          
        case 'MA':
          // TradingView logic: price ABOVE MA = BUY (uptrend), price BELOW MA = SELL (downtrend)
          // value is the difference: currentPrice - MA
          if (value > 0) { // price > MA
            return { action: 'buy', text: 'Покупать' };
          } else if (value < 0) { // price < MA
            return { action: 'sell', text: 'Продавать' };
          }
          return { action: 'neutral', text: 'Нейтрально' };
        
        default:
          return { action: 'neutral', text: 'Нейтрально' };
      }
    };
    
    // Calculate all indicators and collect only valid results
    const indicators = [];
    
    // RSI(14) - matches TradingView
    const rsi = safeCalculate(calculateRSI, closes, 14);
    const rsiCurrent = rsi ? getLastValue(rsi.filter(v => v !== null)) : null;
    if (rsiCurrent !== null) {
      indicators.push({
        type: 'oscillator',
        name: 'Индекс относительной силы (14)',
        value: rsiCurrent.toFixed(2),
        signal: getSignalForIndicator('RSI', rsiCurrent)
      });
    }
    
    // Stochastic(14, 3, 3)
    const stoch = safeCalculate(calculateStochastic, highs, lows, closes, 14, 3);
    const stochValue = stoch && stoch.k ? getLastValue(stoch.k) : null;
    if (stochValue !== null) {
      indicators.push({
        type: 'oscillator',
        name: 'Стохастик %K (14, 3, 3)',
        value: stochValue.toFixed(2),
        signal: getSignalForIndicator('STOCH', stochValue)
      });
    }
    
    // CCI(20)
    const cci = safeCalculate(calculateCCI, highs, lows, closes, 20);
    const cciValue = cci ? getLastValue(cci) : null;
    if (cciValue !== null) {
      indicators.push({
        type: 'oscillator',
        name: 'Индекс товарного канала (20)',
        value: cciValue.toFixed(2),
        signal: getSignalForIndicator('CCI', cciValue)
      });
    }
    
    // ADX(14)
    const adxValue = safeCalculate(calculateADX, highs, lows, closes, 14);
    if (adxValue !== null && !isNaN(adxValue)) {
      indicators.push({
        type: 'oscillator',
        name: 'ADX (14)',
        value: adxValue.toFixed(2),
        signal: getSignalForIndicator('ADX', adxValue)
      });
    }
    
    // Awesome Oscillator
    const ao = safeCalculate(calculateAwesomeOscillator, highs, lows, closes);
    const aoValue = ao ? getLastValue(ao) : null;
    const aoPrevValue = ao && ao.length > 1 ? ao[ao.length - 2] : null;
    if (aoValue !== null) {
      indicators.push({
        type: 'oscillator',
        name: 'Чудесный осциллятор Билла Вильямса',
        value: aoValue.toFixed(2),
        signal: getSignalForIndicator('AO', aoValue, aoPrevValue)
      });
    }
    
    // Momentum(10)
    const momentum = safeCalculate(calculateMomentum, closes, 10);
    const momentumValue = momentum ? getLastValue(momentum) : null;
    const momentumPrevValue = momentum && momentum.length > 1 ? momentum[momentum.length - 2] : null;
    if (momentumValue !== null) {
      indicators.push({
        type: 'oscillator',
        name: 'Моментум (Momentum)',
        value: momentumValue.toFixed(2),
        signal: getSignalForIndicator('MOMENTUM', momentumValue, momentumPrevValue)
      });
    }
    
    // MACD(12, 26, 9)
    const macd = safeCalculate(calculateMACD, closes, 12, 26, 9);
    const macdValue = macd && macd.macd ? getLastValue(macd.macd) : null;
    if (macdValue !== null) {
      indicators.push({
        type: 'oscillator',
        name: 'Уровень MACD (12, 26)',
        value: macdValue.toFixed(2),
        signal: getSignalForIndicator('MACD', macdValue)
      });
    }
    
    // Stochastic RSI(14, 14)
    const stochRsi = safeCalculate(calculateStochRSI, closes, 14, 14);
    const stochRsiValue = stochRsi ? getLastValue(stochRsi) : null;
    if (stochRsiValue !== null) {
      indicators.push({
        type: 'oscillator',
        name: 'Быстрый стохастик RSI (3, 3, 14, 14)',
        value: stochRsiValue.toFixed(2),
        signal: getSignalForIndicator('STOCHRSI', stochRsiValue)
      });
    }
    
    // Williams %R(14)
    const williamsR = safeCalculate(calculateWilliamsR, highs, lows, closes, 14);
    const williamsRValue = williamsR ? getLastValue(williamsR) : null;
    if (williamsRValue !== null) {
      indicators.push({
        type: 'oscillator',
        name: 'Процентный диапазон Вильямса (14)',
        value: williamsRValue.toFixed(2),
        signal: getSignalForIndicator('WILLIAMS', williamsRValue)
      });
    }
    
    // Moving Averages - calculate for different periods
    const maPeriods = [10, 20, 30, 50, 100, 200];
    
    maPeriods.forEach(period => {
      if (closes.length >= period) {
        const ma = safeCalculate(calculateSMA, closes, period);
        const ema = safeCalculate(calculateEMA, closes, period);
        
        const maValue = ma ? getLastValue(ma) : null;
        const emaValue = ema ? getLastValue(ema) : null;
        
        if (emaValue !== null) {
          indicators.push({
            type: 'ma',
            name: `EMA (${period})`,
            value: emaValue.toFixed(2),
            signal: getSignalForIndicator('MA', currentPrice - emaValue)
          });
        }
        
        if (maValue !== null) {
          indicators.push({
            type: 'ma',
            name: `SMA (${period})`,
            value: maValue.toFixed(2),
            signal: getSignalForIndicator('MA', currentPrice - maValue)
          });
        }
      }
    });
    
    // Separate oscillators and moving averages
    const oscillators = indicators.filter(i => i.type === 'oscillator');
    const movingAverages = indicators.filter(i => i.type === 'ma');
    
    console.log('Calculated indicators:', {
      oscillators: oscillators.length,
      movingAverages: movingAverages.length,
      dataPoints: closes.length
    });
  
    // Return structured data
    return {
      oscillators,
      movingAverages,
      summary: {
        oscillators: {
          buy: oscillators.filter(i => i.signal.action === 'buy').length,
          sell: oscillators.filter(i => i.signal.action === 'sell').length,
          neutral: oscillators.filter(i => !['buy', 'sell'].includes(i.signal.action)).length
        },
        movingAverages: {
          buy: movingAverages.filter(i => i.signal.action === 'buy').length,
          sell: movingAverages.filter(i => i.signal.action === 'sell').length,
          neutral: movingAverages.filter(i => i.signal.action === 'neutral').length
        }
      }
    };
  
  } catch (error) {

    return {
      oscillators: [],
      movingAverages: [],
      summary: {
        oscillators: { buy: 0, sell: 0, neutral: 0 },
        movingAverages: { buy: 0, sell: 0, neutral: 0 }
      },
      error: error.message || 'Ошибка расчета индикаторов'
    };
  }
};

// Map Binance symbols to CoinGecko IDs
function getCoinGeckoId(symbol) {
  const mapping = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'BNB': 'binancecoin',
    'SOL': 'solana',
    'XRP': 'ripple',
    'ADA': 'cardano',
    'DOGE': 'dogecoin',
    'AVAX': 'avalanche-2',
    'DOT': 'polkadot',
    'MATIC': 'matic-network',
    'LINK': 'chainlink',
    'UNI': 'uniswap',
    'LTC': 'litecoin',
    'ATOM': 'cosmos',
    'XLM': 'stellar',
    'ALGO': 'algorand',
    'FIL': 'filecoin',
    'TRX': 'tron',
    'NEAR': 'near',
    'APT': 'aptos',
    'ARB': 'arbitrum',
    'OP': 'optimism',
    'INJ': 'injective-protocol',
    'SUI': 'sui',
    'PEPE': 'pepe',
    'SHIB': 'shiba-inu',
    'AAVE': 'aave',
    'MKR': 'maker',
    'RUNE': 'thorchain',
    'FTM': 'fantom',
    'SAND': 'the-sandbox',
    'MANA': 'decentraland',
    'AXS': 'axie-infinity',
    'GRT': 'the-graph',
    'EGLD': 'elrond-erd-2',
    'XTZ': 'tezos',
    'FLOW': 'flow',
    'ICP': 'internet-computer',
    'EOS': 'eos',
    'THETA': 'theta-token',
    'HBAR': 'hedera-hashgraph',
    'VET': 'vechain'
  };
  return mapping[symbol] || null;
}

// Calculate sentiment from technical indicators
window.calculateSentimentFromIndicators = async function(symbol, interval) {
  try {
    // Use technical analysis and market data for sentiment calculation
    const intervalMap = {
      '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
      '1h': '1h', '2h': '2h', '4h': '4h', '1d': '1d',
      '1w': '1w', '1M': '1M', '1Y': '1M', 'all': '1w'
    };
    
    const binanceInterval = intervalMap[interval] || '1d';
    const limit = interval === 'all' ? 1000 : 500;
    
    const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=${binanceInterval}&limit=${limit}`);
    const klines = await response.json();
    
    if (!klines || klines.length === 0) {
      return { bullish: 50, bearish: 50 };
    }
    
    // Use the same calculation as in renderTechIndicatorsTable
    const closes = klines.map(k => parseFloat(k[4]));
    const highs = klines.map(k => parseFloat(k[2]));
    const lows = klines.map(k => parseFloat(k[3]));
    const volumes = klines.map(k => parseFloat(k[5]));
    
    // Calculate all indicators
    const oscillators = [];
    const movingAverages = [];
    
    // Oscillators
    const rsi = calculateRSI(closes, 14);
    const latestRSI = rsi[rsi.length - 1];
    if (latestRSI !== null) {
      oscillators.push({
        signal: latestRSI > 70 ? 'sell' : latestRSI > 50 ? 'buy' : latestRSI < 30 ? 'buy' : 'sell'
      });
    }
    
    const stoch = calculateStochastic(highs, lows, closes, 14, 3, 3);
    const latestStoch = stoch[stoch.length - 1];
    if (latestStoch && latestStoch.k !== null) {
      oscillators.push({
        signal: latestStoch.k > 80 ? 'sell' : latestStoch.k > 50 ? 'buy' : latestStoch.k < 20 ? 'buy' : 'sell'
      });
    }
    
    const cci = calculateCCI(highs, lows, closes, 20);
    const latestCCI = cci[cci.length - 1];
    if (latestCCI !== null) {
      oscillators.push({
        signal: latestCCI > 100 ? 'buy' : latestCCI < -100 ? 'sell' : 'neutral'
      });
    }
    
    const adx = calculateADX(highs, lows, closes, 14);
    oscillators.push({ signal: 'neutral' }); // ADX always neutral
    
    const ao = calculateAwesomeOscillator(highs, lows, closes);
    if (ao && ao.length >= 2) {
      const latestAO = ao[ao.length - 1];
      const prevAO = ao[ao.length - 2];
      oscillators.push({
        signal: latestAO > prevAO ? 'buy' : latestAO < prevAO ? 'sell' : 'neutral'
      });
    }
    
    const momentum = calculateMomentum(closes, 10);
    if (momentum && momentum.length >= 2) {
      const latestMom = momentum[momentum.length - 1];
      const prevMom = momentum[momentum.length - 2];
      oscillators.push({
        signal: latestMom > prevMom ? 'buy' : latestMom < prevMom ? 'sell' : 'neutral'
      });
    }
    
    const macd = calculateMACD(closes, 12, 26, 9);
    const latestMACD = macd[macd.length - 1];
    if (latestMACD && latestMACD.histogram !== null) {
      oscillators.push({
        signal: latestMACD.histogram > 0 ? 'buy' : 'sell'
      });
    }
    
    // Skip Stochastic RSI for sentiment calculation (complex calculation)
    
    const willR = calculateWilliamsR(highs, lows, closes, 14);
    const latestWillR = willR[willR.length - 1];
    if (latestWillR !== null) {
      oscillators.push({
        signal: latestWillR > -20 ? 'sell' : latestWillR > -50 ? 'buy' : latestWillR < -80 ? 'buy' : 'sell'
      });
    }
    
    // Moving Averages
    const currentPrice = closes[closes.length - 1];
    const periods = [10, 20, 30, 50, 100, 200];
    
    periods.forEach(period => {
      const emaValues = calculateEMA(closes, period);
      const smaValues = calculateSMA(closes, period);
      
      const latestEMA = emaValues[emaValues.length - 1];
      const latestSMA = smaValues[smaValues.length - 1];
      
      if (latestEMA !== null) {
        movingAverages.push({
          signal: currentPrice > latestEMA ? 'buy' : 'sell'
        });
      }
      
      if (latestSMA !== null) {
        movingAverages.push({
          signal: currentPrice > latestSMA ? 'buy' : 'sell'
        });
      }
    });
    
    // Count signals
    const allIndicators = [...oscillators, ...movingAverages];
    const buyCount = allIndicators.filter(ind => ind.signal === 'buy').length;
    const sellCount = allIndicators.filter(ind => ind.signal === 'sell').length;
    const neutralCount = allIndicators.filter(ind => ind.signal === 'neutral').length;
    
    // Calculate price momentum for additional context
    const recentPriceChange = ((closes[closes.length - 1] - closes[closes.length - 30]) / closes[closes.length - 30]) * 100;
    const veryRecentChange = ((closes[closes.length - 1] - closes[closes.length - 7]) / closes[closes.length - 7]) * 100;
    
    // Calculate volume trend (increasing volume = stronger sentiment)
    const recentVolume = volumes.slice(-7).reduce((a, b) => a + b, 0) / 7;
    const oldVolume = volumes.slice(-30, -7).reduce((a, b) => a + b, 0) / 23;
    const volumeIncrease = ((recentVolume - oldVolume) / oldVolume) * 100;
    
    // Adjust sentiment based on multiple factors
    let momentumBonus = 0;
    
    // Price momentum (30-day) - biggest weight
    if (recentPriceChange > 20) momentumBonus += 20;
    else if (recentPriceChange > 10) momentumBonus += 15;
    else if (recentPriceChange > 5) momentumBonus += 10;
    else if (recentPriceChange > 0) momentumBonus += 5;
    else if (recentPriceChange < -20) momentumBonus -= 20;
    else if (recentPriceChange < -10) momentumBonus -= 15;
    else if (recentPriceChange < -5) momentumBonus -= 10;
    else if (recentPriceChange < 0) momentumBonus -= 5;
    
    // Recent momentum (7-day) - medium weight
    if (veryRecentChange > 10) momentumBonus += 10;
    else if (veryRecentChange > 5) momentumBonus += 7;
    else if (veryRecentChange > 0) momentumBonus += 3;
    else if (veryRecentChange < -10) momentumBonus -= 10;
    else if (veryRecentChange < -5) momentumBonus -= 7;
    else if (veryRecentChange < 0) momentumBonus -= 3;
    
    // Volume trend - smaller weight
    if (volumeIncrease > 50) momentumBonus += 5;
    else if (volumeIncrease > 20) momentumBonus += 3;
    else if (volumeIncrease < -50) momentumBonus -= 5;
    else if (volumeIncrease < -20) momentumBonus -= 3;
    
    const total = buyCount + sellCount + neutralCount;
    let bullishPercent = ((buyCount + (neutralCount * 0.5)) / total) * 100;
    let bearishPercent = ((sellCount + (neutralCount * 0.5)) / total) * 100;
    
    // Apply momentum bonus
    bullishPercent = Math.max(0, Math.min(100, bullishPercent + momentumBonus));
    bearishPercent = 100 - bullishPercent;
    
    return {
      bullish: Math.round(bullishPercent),
      bearish: Math.round(bearishPercent)
    };
  } catch (error) {

    return { bullish: 50, bearish: 50 };
  }
};

// Render Technical Indicators Table
window.renderTechIndicatorsTable = function(klines, symbol, interval = '1d') {

  if (klines && klines.length > 0) {

  }

  
  try {
    const outerContainer = document.getElementById('tradingViewChartContainer');
    if (!outerContainer) return;
    
    // Hide legend and OHLC
    const legend = document.getElementById('chartLegend');
    const ohlc = document.getElementById('chartOhlcDisplay');
    if (legend) legend.style.display = 'none';
    if (ohlc) ohlc.style.display = 'none';
    
    // Get chart container
    let container = document.getElementById('cryptoDetailPriceChart');
    if (!container) return;
    
    // Скрываем только toolbar, не весь chartAreaWrapper (cryptoDetailPriceChart внутри него)
    const toolbarTT = document.getElementById('cryptoDrawingToolbar');
    if (toolbarTT) toolbarTT.style.display = 'none';

    // Clear container
    container.innerHTML = '';
    outerContainer.classList.add('indicators-mode');
    
    // Calculate indicators
    const data = window.calculateTechnicalIndicators(klines, interval);
    
    console.log('Indicators calculated:', {
      oscillators: data.oscillators?.length || 0,
      movingAverages: data.movingAverages?.length || 0,
      summary: data.summary
    });
    
    // Check for errors
    if (data.error) {
      container.innerHTML = `
        <div style="padding: 3rem; text-align: center;">
          <div style="font-size: 3rem; margin-bottom: 1rem;"></div>
          <div style="font-size: 1.2rem; color: #ef4444; margin-bottom: 0.5rem;">
            ${data.error}
          </div>
          <div style="color: #94a3b8; font-size: 0.9rem;">
            Доступно свечей: ${klines?.length || 0}
          </div>
        </div>
      `;
      return;
    }
    
    if (!data || !data.oscillators || !data.movingAverages) {
      container.innerHTML = '<div style="padding: 2rem; color: #ef4444;">Ошибка расчета индикаторов</div>';
      return;
    }
    
    const { oscillators, movingAverages, summary } = data;
    
    // Check if we have any indicators
    if (oscillators.length === 0 && movingAverages.length === 0) {
      container.innerHTML = `
        <div style="padding: 3rem; text-align: center;">
          <div style="font-size: 3rem; margin-bottom: 1rem;"></div>
          <div style="font-size: 1.2rem; color: #94a3b8;">
            Нет данных для отображения индикаторов
          </div>
        </div>
      `;
      return;
    }
    
    // Determine overall signal - use score-based logic to match needle position
    const totalBuy = summary.oscillators.buy + summary.movingAverages.buy;
    const totalSell = summary.oscillators.sell + summary.movingAverages.sell;
    const totalNeutral = summary.oscillators.neutral + summary.movingAverages.neutral;
    const totalCount = totalBuy + totalSell + totalNeutral;
    
    // Calculate overall score (same as needle calculation)
    const overallBuyRatio = totalBuy / totalCount;
    const overallSellRatio = totalSell / totalCount;
    const overallScore = overallBuyRatio - overallSellRatio;
    
    let overallSignal = 'Нейтрально';
    let overallClass = 'neutral';
    
    // Score-based thresholds to match needle position
    if (overallScore > 0.4) {
      overallSignal = 'Активно покупать';
      overallClass = 'buy';
    } else if (overallScore > 0.1) {
      overallSignal = 'Покупать';
      overallClass = 'buy';
    } else if (overallScore < -0.4) {
      overallSignal = 'Активно продавать';
      overallClass = 'sell';
    } else if (overallScore < -0.1) {
      overallSignal = 'Продавать';
      overallClass = 'sell';
    }
    
    // Determine signals for each section - use same score-based logic
    const getSignalForSection = (buy, sell, neutral) => {
      const total = buy + sell + neutral;
      const buyRatio = buy / total;
      const sellRatio = sell / total;
      const score = buyRatio - sellRatio;
      
      if (score > 0.4) return { text: 'Активно покупать', class: 'buy' };
      if (score > 0.1) return { text: 'Покупать', class: 'buy' };
      if (score < -0.4) return { text: 'Активно продавать', class: 'sell' };
      if (score < -0.1) return { text: 'Продавать', class: 'sell' };
      return { text: 'Нейтрально', class: 'neutral' };
    };
    
    const oscillatorsSignal = getSignalForSection(
      summary.oscillators.buy,
      summary.oscillators.sell,
      summary.oscillators.neutral
    );
    
    const maSignal = getSignalForSection(
      summary.movingAverages.buy,
      summary.movingAverages.sell,
      summary.movingAverages.neutral
    );
    
    // Helper function to create gauge SVG with gradient scale
    const createGauge = (buy, sell, neutral, signalClass) => {
      const total = buy + sell + neutral;
      if (total === 0) return '';
      
      // Calculate score from -1 (all sell) to +1 (all buy)
      const buyRatio = buy / total;
      const sellRatio = sell / total;
      const score = (buyRatio - sellRatio);
      
      // Map score to specific needle angles that align with labels
      // Labels positioned at: -75°, -45°, 0°, +45°, +75°
      let needleAngle;
      if (score <= -0.4) {
        // Active Sell: map -1.0 to -0.4 → -90° to -60°
        needleAngle = -90 + (score + 1) * 50; // -90° to -60°
      } else if (score < -0.1) {
        // Sell: map -0.4 to -0.1 → -60° to -30°
        needleAngle = -60 + ((score + 0.4) / 0.3) * 30; // -60° to -30°
      } else if (score <= 0.1) {
        // Neutral: map -0.1 to 0.1 → -30° to +30°
        needleAngle = (score / 0.1) * 30; // -30° to +30°
      } else if (score < 0.4) {
        // Buy: map 0.1 to 0.4 → +30° to +60°
        needleAngle = 30 + ((score - 0.1) / 0.3) * 30; // +30° to +60°
      } else {
        // Active Buy: map 0.4 to 1.0 → +60° to +90°
        needleAngle = 60 + (score - 0.4) * 50; // +60° to +90°
      }
      
      // Determine needle color based on score
      let needleColor = '#94a3b8'; // neutral gray
      if (score <= -0.4) needleColor = '#ef4444'; // active sell - dark red
      else if (score < -0.1) needleColor = '#f87171'; // sell - light red
      else if (score >= 0.4) needleColor = '#10b981'; // active buy - dark green
      else if (score > 0.1) needleColor = '#4ade80'; // buy - light green
      
      // Create gradient arc paths
      const centerX = 100;
      const centerY = 100;
      const radius = 80;
      
      // Full semicircle background (gray)
      const bgArcPath = `M 20 100 A 80 80 0 0 1 180 100`;
      
      // Calculate which segments to color based on needle position
      const createArcSegment = (startAngle, endAngle) => {
        const startRad = (startAngle * Math.PI) / 180;
        const endRad = (endAngle * Math.PI) / 180;
        const startX = centerX + radius * Math.cos(startRad);
        const startY = centerY + radius * Math.sin(startRad);
        const endX = centerX + radius * Math.cos(endRad);
        const endY = centerY + radius * Math.sin(endRad);
        const largeArcFlag = (endAngle - startAngle) > 180 ? 1 : 0;
        return `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`;
      };
      
      // Convert needle angle to arc angle
      // needleAngle: -90° (full sell) to 0° (neutral) to 90° (full buy)
      // arcAngle: 180° (full sell) to 270° (neutral) to 360° (full buy right edge) to 45° (strong buy)
      // For angles > 360°, we wrap around: 360° + x = x in the next circle
      const arcAngle = 270 + needleAngle; // Range: 180° to 360°
      
      // Determine which segments to show (always from left 180° to needle position)
      let coloredSegments = '';
      
      // Segment boundaries in arc coordinates:
      // 180° - 225°: Dark Red (#ef4444)
      // 225° - 270°: Light Red (#f87171)
      // 270° - 315°: Gray (#94a3b8)
      // 315° - 360°: Light Green (#4ade80)
      // 360°+ (= 0°+): Dark Green (#10b981) - only in upper right
      
      // Always start from 180° (leftmost) and fill up to arcAngle
      
      // Dark Red zone (180° - 225°)
      if (arcAngle > 180) {
        coloredSegments += `<path class="gauge-arc" d="${createArcSegment(180, Math.min(arcAngle, 225))}" stroke="#ef4444" fill="none" stroke-width="16" stroke-linecap="round"/>`;
      }
      
      // Light Red zone (225° - 270°)
      if (arcAngle > 225) {
        coloredSegments += `<path class="gauge-arc" d="${createArcSegment(225, Math.min(arcAngle, 270))}" stroke="#f87171" fill="none" stroke-width="16" stroke-linecap="round"/>`;
      }
      
      // Gray zone (270° - 315°)
      if (arcAngle > 270) {
        coloredSegments += `<path class="gauge-arc" d="${createArcSegment(270, Math.min(arcAngle, 315))}" stroke="#94a3b8" fill="none" stroke-width="16" stroke-linecap="round"/>`;
      }
      
      // Light Green zone (315° - 360°)
      if (arcAngle > 315) {
        coloredSegments += `<path class="gauge-arc" d="${createArcSegment(315, Math.min(arcAngle, 360))}" stroke="#4ade80" fill="none" stroke-width="16" stroke-linecap="round"/>`;
      }
      

      return `
        <div class="gauge-chart">
          <svg class="gauge-svg" viewBox="0 0 200 120">
            <!-- Background arc -->
            <path class="gauge-bg" d="${bgArcPath}"/>
            
            <!-- Gradient colored arc segments up to needle -->
            ${coloredSegments}
          </svg>
          
          <!-- Labels around gauge - 5 positions -->
          <div class="gauge-labels">
            <div class="gauge-label-text active-sell-label">Активно<br>продавать</div>
            <div class="gauge-label-text sell-label">Продавать</div>
            <div class="gauge-label-text neutral-label">Нейтрально</div>
            <div class="gauge-label-text buy-label">Покупать</div>
            <div class="gauge-label-text active-buy-label">Активно<br>покупать</div>
          </div>
          
          <!-- Needle -->
          <div class="gauge-needle" style="transform: translateX(-50%) rotate(${needleAngle}deg); --needle-color: ${needleColor};"></div>
        </div>
      `;
    };
    
    // Create table HTML
    const tableHTML = `
      <div class="tech-indicators-table-wrapper">
        <div class="tech-indicators-header">
          <h3>Тех. индикаторы - ${symbol}</h3>
          
          <!-- Gauges Container -->
          <div class="tech-gauges-container">
            <!-- Oscillators Gauge -->
            ${oscillators.length > 0 ? `
            <div class="tech-gauge">
              <div class="tech-gauge-title">Осцилляторы</div>
              ${createGauge(summary.oscillators.buy, summary.oscillators.sell, summary.oscillators.neutral, oscillatorsSignal.class)}
              <div class="gauge-label">
                <div class="gauge-signal ${oscillatorsSignal.class}">${oscillatorsSignal.text}</div>
                <div class="gauge-counts">
                  <div class="gauge-count-item sell">Продавать: <strong>${summary.oscillators.sell}</strong></div>
                  <div class="gauge-count-item neutral">Нейтрально: <strong>${summary.oscillators.neutral}</strong></div>
                  <div class="gauge-count-item buy">Покупать: <strong>${summary.oscillators.buy}</strong></div>
                </div>
              </div>
            </div>
            ` : ''}
            
            <!-- Overall Gauge -->
            <div class="tech-gauge">
              <div class="tech-gauge-title">Общая оценка</div>
              ${createGauge(totalBuy, totalSell, totalNeutral, overallClass)}
              <div class="gauge-label">
                <div class="gauge-signal ${overallClass}">${overallSignal}</div>
                <div class="gauge-counts">
                  <div class="gauge-count-item sell">Продавать: <strong>${totalSell}</strong></div>
                  <div class="gauge-count-item neutral">Нейтрально: <strong>${totalNeutral}</strong></div>
                  <div class="gauge-count-item buy">Покупать: <strong>${totalBuy}</strong></div>
                </div>
              </div>
            </div>
            
            <!-- Moving Averages Gauge -->
            ${movingAverages.length > 0 ? `
            <div class="tech-gauge">
              <div class="tech-gauge-title">Скользящие средние</div>
              ${createGauge(summary.movingAverages.buy, summary.movingAverages.sell, summary.movingAverages.neutral, maSignal.class)}
              <div class="gauge-label">
                <div class="gauge-signal ${maSignal.class}">${maSignal.text}</div>
                <div class="gauge-counts">
                  <div class="gauge-count-item sell">Продавать: <strong>${summary.movingAverages.sell}</strong></div>
                  <div class="gauge-count-item neutral">Нейтрально: <strong>${summary.movingAverages.neutral}</strong></div>
                  <div class="gauge-count-item buy">Покупать: <strong>${summary.movingAverages.buy}</strong></div>
                </div>
              </div>
            </div>
            ` : ''}
          </div>
        </div>
        
        <div class="tech-sections-row">
          <!-- Oscillators Section -->
          ${oscillators.length > 0 ? `
          <div class="tech-section">
            <div class="tech-section-header">
              <h4>Осцилляторы</h4>
              <div class="tech-section-summary">
                <span class="summary-label">Продавать: <strong class="summary-sell">${summary.oscillators.sell}</strong></span>
                <span class="summary-label">Нейтрально: <strong class="summary-neutral">${summary.oscillators.neutral}</strong></span>
                <span class="summary-label">Покупать: <strong class="summary-buy">${summary.oscillators.buy}</strong></span>
              </div>
            </div>
            
            <div class="tech-indicators-table">
              <div class="tech-table-body">
                ${oscillators.map(ind => `
                  <div class="tech-table-row">
                    <div class="tech-table-cell tech-name">${ind.name}</div>
                    <div class="tech-table-cell tech-value">${ind.value}</div>
                    <div class="tech-table-cell tech-action tech-action-${ind.signal.action}">
                      ${ind.signal.text}
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
          ` : ''}
          
          <!-- Moving Averages Section -->
          ${movingAverages.length > 0 ? `
          <div class="tech-section">
            <div class="tech-section-header">
              <h4>Скользящие средние</h4>
              <div class="tech-section-summary">
                <span class="summary-label">Продавать: <strong class="summary-sell">${summary.movingAverages.sell}</strong></span>
                <span class="summary-label">Нейтрально: <strong class="summary-neutral">${summary.movingAverages.neutral}</strong></span>
                <span class="summary-label">Покупать: <strong class="summary-buy">${summary.movingAverages.buy}</strong></span>
              </div>
            </div>
            
            <div class="tech-indicators-table">
              <div class="tech-table-body">
                ${movingAverages.map(ind => `
                  <div class="tech-table-row">
                    <div class="tech-table-cell tech-name">${ind.name}</div>
                    <div class="tech-table-cell tech-value">${ind.value}</div>
                    <div class="tech-table-cell tech-action tech-action-${ind.signal.action}">
                      ${ind.signal.text}
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
          ` : ''}
        </div>
      </div>
    `;
    
    container.innerHTML = tableHTML;
    
  } catch (error) {

    const container = document.getElementById('cryptoDetailPriceChart');
    if (container) {
      container.innerHTML = `
        <div style="padding: 3rem; text-align: center;">
          <div style="font-size: 3rem; margin-bottom: 1rem;"></div>
          <div style="font-size: 1.2rem; color: #ef4444; margin-bottom: 0.5rem;">
            Ошибка отображения индикаторов
          </div>
          <div style="color: #94a3b8; font-size: 0.9rem;">
            ${error.message}
          </div>
        </div>
      `;
    }
  }
};

