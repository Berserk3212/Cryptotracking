import { getPortfolios, getTransactions, getPricesForSymbols, getPriceSync } from '../core/data.js';
import { convertToSelectedCurrency, getCurrencySymbol } from '../core/currency.js';

let isExporting = false;

export async function exportAnalyticsToPDF(portfolioId = '') {
  // Защита от множественных вызовов
  if (isExporting) {
    showLoadingNotification('Экспорт уже выполняется, пожалуйста подождите...');
    return;
  }
  
  isExporting = true;
  
  // Глобальный таймаут: экспорт не должен висеть дольше 60 секунд
  const exportTimeout = setTimeout(() => {
    if (isExporting) {
      isExporting = false;
      showErrorNotification('Экспорт превысил лимит времени (60с). Попробуйте снова.');
    }
  }, 60000);

  try {
    showLoadingNotification('Подготовка отчета...');
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const data = await collectAnalyticsData(portfolioId);
    // НЕ делаем сетевые запросы во время экспорта — используем кэшированные цены
    
    showLoadingNotification('Захват графиков...');
    const charts = await captureCharts();
    
    showLoadingNotification('Генерация PDF...');
    await new Promise(resolve => setTimeout(resolve, 50));
    await generatePDFDocument(data, charts);
    
    showSuccessNotification('Отчет успешно сгенерирован!');
  } catch (error) {

    showErrorNotification('Ошибка при создании PDF отчета');
  } finally {
    clearTimeout(exportTimeout);
    isExporting = false;
  }
}

async function collectAnalyticsData(portfolioId) {
  const [portfolios, transactions] = await Promise.all([
    getPortfolios(),
    getTransactions()
  ]);
  
  let selectedPortfolio = null;
  let filteredTransactions = transactions;
  
  if (portfolioId) {
    selectedPortfolio = portfolios.find(p => p.id === portfolioId);
    filteredTransactions = transactions.filter(t => t.portfolio_id === portfolioId);
  }
  
  const totalValue = calculateTotalValue(filteredTransactions);
  const totalInvested = calculateTotalInvested(filteredTransactions);
  const pnl = totalValue - totalInvested;
  const roi = totalInvested > 0 ? ((pnl / totalInvested) * 100) : 0;
  const assetDistribution = calculateAssetDistribution(filteredTransactions);
  const topAssets = calculateTopAssets(filteredTransactions);
  
  return {
    portfolioName: selectedPortfolio?.name || 'Все портфели',
    date: new Date().toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }),
    metrics: {
      totalValue,
      totalInvested,
      pnl,
      roi,
      sharpeRatio: parseFloat(document.getElementById('analyticsSharpe')?.textContent || '0'),
      diversification: parseFloat(document.getElementById('analyticsDiversification')?.textContent || '0'),
      assetsCount: new Set(filteredTransactions.map(t => t.symbol)).size
    },
    assetDistribution,
    topAssets
  };
}

async function captureCharts() {
  const charts = {};
  const chartSelectors = [
    { id: 'portfolioValueChart', name: 'valueChart' },
    { id: 'assetTypeChart', name: 'typeChart' },
    { id: 'topAssetsChart', name: 'topChart' },
    { id: 'monthlyReturnsChart', name: 'returnsChart' },
    { id: 'riskProfileChart', name: 'riskChart' },
    { id: 'volatilityChart', name: 'volatilityChart' }
  ];
  
  for (const { id, name } of chartSelectors) {
    const canvas = document.getElementById(id);
    if (canvas && canvas.tagName === 'CANVAS') {
      try {
        charts[name] = canvas.toDataURL('image/jpeg', 0.85);
      } catch (e) {

      }
    }
  }
  
  return charts;
}

async function generatePDFDocument(data, charts) {
  if (typeof window.jspdf === 'undefined') {
    throw new Error('Библиотека jsPDF не загружена');
  }
  if (typeof html2canvas === 'undefined') {
    throw new Error('Библиотека html2canvas не загружена');
  }
  
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;
  let currentY = margin;
  
  const { metrics } = data;
  const currencySymbol = getCurrencySymbol();
  
  const addNewPage = () => {
    doc.addPage();
    currentY = margin;
  };
  
  const checkSpace = (requiredHeight) => {
    if (currentY + requiredHeight > pageHeight - margin - 15) {
      addNewPage();
      return true;
    }
    return false;
  };
  
  // Функция для рендеринга HTML в изображение (с таймаутом)
  const renderHTML = async (htmlContent, width = contentWidth) => {
    const tempDiv = document.createElement('div');
    tempDiv.style.cssText = `
      position: absolute;
      left: -9999px;
      top: 0;
      width: ${width * 2.5}px;
      background: #ffffff;
      font-family: Arial, sans-serif;
      box-sizing: border-box;
    `;
    tempDiv.innerHTML = htmlContent;
    document.body.appendChild(tempDiv);
    
    try {
      const canvasPromise = html2canvas(tempDiv, {
        scale: 1.0,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: false,
        allowTaint: true,
        imageTimeout: 5000
      });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('html2canvas timeout')), 10000)
      );
      const canvas = await Promise.race([canvasPromise, timeoutPromise]);
      
      const imgData = canvas.toDataURL('image/jpeg', 0.80);
      const imgHeight = (canvas.height * width) / canvas.width;
      
      return { imgData, imgHeight };
    } finally {
      document.body.removeChild(tempDiv);
    }
  };
  

  const page1HTML = `
    <div style="padding: 15px;">
      <div style="height: 3px; background: linear-gradient(90deg, #3b82f6 0%, #8b5cf6 100%); margin-bottom: 10px; border-radius: 2px;"></div>
      <h1 style="font-size: 32px; margin: 0 0 8px 0; color: #1a1a1a; font-weight: 700;">
        Отчет по аналитике портфеля
      </h1>
      <div style="display: flex; gap: 20px; margin-bottom: 20px;">
        <p style="font-size: 15px; color: #666; margin: 0;">
          <strong style="color: #333;">Портфель:</strong> ${data.portfolioName}
        </p>
        <p style="font-size: 15px; color: #666; margin: 0;">
          <strong style="color: #333;">Дата:</strong> ${data.date}
        </p>
      </div>
      
      <h2 style="font-size: 24px; margin: 20px 0 15px 0; color: #1f2937; font-weight: 700;">
        Ключевые показатели
      </h2>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
        <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); padding: 15px; border-radius: 8px; border-left: 4px solid #3b82f6;">
          <div style="font-size: 12px; color: #64748b; font-weight: 600; margin-bottom: 4px;">ОБЩАЯ СТОИМОСТЬ</div>
          <div style="font-size: 22px; color: #1e293b; font-weight: 700;">${currencySymbol}${formatNumber(metrics.totalValue)}</div>
        </div>
        <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b;">
          <div style="font-size: 12px; color: #78350f; font-weight: 600; margin-bottom: 4px;">ИНВЕСТИРОВАНО</div>
          <div style="font-size: 22px; color: #78350f; font-weight: 700;">${currencySymbol}${formatNumber(metrics.totalInvested)}</div>
        </div>
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
        <div style="background: linear-gradient(135deg, ${metrics.pnl >= 0 ? '#d1fae5' : '#fee2e2'} 0%, ${metrics.pnl >= 0 ? '#a7f3d0' : '#fecaca'} 100%); padding: 15px; border-radius: 8px; border-left: 4px solid ${metrics.pnl >= 0 ? '#10b981' : '#ef4444'};">
          <div style="font-size: 12px; color: ${metrics.pnl >= 0 ? '#065f46' : '#7f1d1d'}; font-weight: 600; margin-bottom: 4px;">ПРИБЫЛЬ/УБЫТОК</div>
          <div style="font-size: 22px; color: ${metrics.pnl >= 0 ? '#065f46' : '#7f1d1d'}; font-weight: 700;">${currencySymbol}${formatNumber(metrics.pnl)}</div>
        </div>
        <div style="background: linear-gradient(135deg, ${metrics.roi >= 0 ? '#d1fae5' : '#fee2e2'} 0%, ${metrics.roi >= 0 ? '#a7f3d0' : '#fecaca'} 100%); padding: 15px; border-radius: 8px; border-left: 4px solid ${metrics.roi >= 0 ? '#10b981' : '#ef4444'};">
          <div style="font-size: 12px; color: ${metrics.roi >= 0 ? '#065f46' : '#7f1d1d'}; font-weight: 600; margin-bottom: 4px;">ROI</div>
          <div style="font-size: 22px; color: ${metrics.roi >= 0 ? '#065f46' : '#7f1d1d'}; font-weight: 700;">${formatNumber(metrics.roi)}%</div>
        </div>
      </div>
      
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
        <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
          <div style="font-size: 11px; color: #64748b; font-weight: 600; margin-bottom: 3px;">ШАРП</div>
          <div style="font-size: 18px; color: #1e293b; font-weight: 700;">${formatNumber(metrics.sharpeRatio)}</div>
        </div>
        <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
          <div style="font-size: 11px; color: #64748b; font-weight: 600; margin-bottom: 3px;">ДИВЕРСИФ.</div>
          <div style="font-size: 18px; color: #1e293b; font-weight: 700;">${formatNumber(metrics.diversification)}%</div>
        </div>
        <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
          <div style="font-size: 11px; color: #64748b; font-weight: 600; margin-bottom: 3px;">АКТИВОВ</div>
          <div style="font-size: 18px; color: #1e293b; font-weight: 700;">${metrics.assetsCount}</div>
        </div>
      </div>
    </div>
  `;
  
  const page1Block = await renderHTML(page1HTML);
  doc.addImage(page1Block.imgData, 'JPEG', margin, currentY, contentWidth, page1Block.imgHeight);
  currentY += page1Block.imgHeight + 5;
  
  // === СТРАНИЦА 2: ГРАФИКИ ===
  addNewPage();
  
  // Заголовок секции графиков
  const chartsHeaderHTML = `
    <div style="padding: 10px 15px;">
      <h2 style="font-size: 24px; margin: 0; color: #1f2937; font-weight: 700;">
        Графики и визуализация
      </h2>
      <p style="font-size: 13px; color: #6b7280; margin: 5px 0 0 0;">
        Детальный анализ динамики и структуры портфеля
      </p>
    </div>
  `;
  
  const chartsHeader = await renderHTML(chartsHeaderHTML);
  doc.addImage(chartsHeader.imgData, 'JPEG', margin, currentY, contentWidth, chartsHeader.imgHeight);
  currentY += chartsHeader.imgHeight + 5;
  
  // График стоимости портфеля
  if (charts.valueChart) {
    const titleHTML = `
      <div style="padding: 8px 12px; background: #f1f5f9; border-left: 3px solid #3b82f6; border-radius: 4px;">
        <p style="font-size: 14px; color: #1e293b; margin: 0; font-weight: 600;">
          История стоимости портфеля
        </p>
      </div>
    `;
    
    const title = await renderHTML(titleHTML);
    const chartHeight = 70;
    
    checkSpace(title.imgHeight + chartHeight + 12);
    
    doc.addImage(title.imgData, 'JPEG', margin, currentY, contentWidth, title.imgHeight);
    currentY += title.imgHeight + 3;
    
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, currentY, contentWidth, chartHeight, 2, 2, 'S');
    doc.addImage(charts.valueChart, 'JPEG', margin + 1, currentY + 1, contentWidth - 2, chartHeight - 2);
    currentY += chartHeight + 10;
  }
  
  // Маленькие графики (объединенные заголовки)
  const smallChartWidth = (contentWidth - 6) / 2;
  const smallChartHeight = 60;
  
  if (charts.typeChart && charts.topChart) {
    const titlesHTML = `
      <div style="display: flex; gap: 6px; padding: 0 10px;">
        <div style="flex: 1; padding: 6px 10px; background: #f1f5f9; border-left: 3px solid #8b5cf6; border-radius: 4px;">
          <p style="font-size: 13px; color: #1e293b; margin: 0; font-weight: 600;">Распределение по типам</p>
        </div>
        <div style="flex: 1; padding: 6px 10px; background: #f1f5f9; border-left: 3px solid #f59e0b; border-radius: 4px;">
          <p style="font-size: 13px; color: #1e293b; margin: 0; font-weight: 600;">Топ активов</p>
        </div>
      </div>
    `;
    
    const titles = await renderHTML(titlesHTML);
    checkSpace(titles.imgHeight + smallChartHeight + 15);
    
    doc.addImage(titles.imgData, 'JPEG', margin, currentY, contentWidth, titles.imgHeight);
    currentY += titles.imgHeight + 3;
    
    // Графики
    let xPos = margin;
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(xPos, currentY, smallChartWidth, smallChartHeight, 2, 2, 'S');
    doc.addImage(charts.typeChart, 'JPEG', xPos + 1, currentY + 1, smallChartWidth - 2, smallChartHeight - 2);
    
    xPos += smallChartWidth + 6;
    doc.roundedRect(xPos, currentY, smallChartWidth, smallChartHeight, 2, 2, 'S');
    doc.addImage(charts.topChart, 'JPEG', xPos + 1, currentY + 1, smallChartWidth - 2, smallChartHeight - 2);
    
    currentY += smallChartHeight + 10;
  }
  
  // Вторая пара графиков
  if (charts.returnsChart && charts.riskChart) {
    const titlesHTML = `
      <div style="display: flex; gap: 6px; padding: 0 10px;">
        <div style="flex: 1; padding: 6px 10px; background: #f1f5f9; border-left: 3px solid #10b981; border-radius: 4px;">
          <p style="font-size: 13px; color: #1e293b; margin: 0; font-weight: 600;">Доходность по месяцам</p>
        </div>
        <div style="flex: 1; padding: 6px 10px; background: #f1f5f9; border-left: 3px solid #ef4444; border-radius: 4px;">
          <p style="font-size: 13px; color: #1e293b; margin: 0; font-weight: 600;">Риск-профиль</p>
        </div>
      </div>
    `;
    
    const titles = await renderHTML(titlesHTML);
    checkSpace(titles.imgHeight + smallChartHeight + 15);
    
    doc.addImage(titles.imgData, 'JPEG', margin, currentY, contentWidth, titles.imgHeight);
    currentY += titles.imgHeight + 3;
    
    // Графики
    let xPos = margin;
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(xPos, currentY, smallChartWidth, smallChartHeight, 2, 2, 'S');
    doc.addImage(charts.returnsChart, 'JPEG', xPos + 1, currentY + 1, smallChartWidth - 2, smallChartHeight - 2);
    
    xPos += smallChartWidth + 6;
    doc.roundedRect(xPos, currentY, smallChartWidth, smallChartHeight, 2, 2, 'S');
    doc.addImage(charts.riskChart, 'JPEG', xPos + 1, currentY + 1, smallChartWidth - 2, smallChartHeight - 2);
    
    currentY += smallChartHeight;
  }
  
  // === СТРАНИЦА 3: ТАБЛИЦА АКТИВОВ ===
  addNewPage();
  
  // Заголовок таблицы
  const tableHeaderHTML = `
    <div style="padding: 10px 15px;">
      <h2 style="font-size: 24px; margin: 0; color: #1f2937; font-weight: 700;">
        Детальная статистика активов
      </h2>
      <p style="font-size: 13px; color: #6b7280; margin: 5px 0 0 0;">
        Топ ${Math.min(15, data.topAssets.length)} активов по стоимости
      </p>
    </div>
  `;
  
  const tableHeader = await renderHTML(tableHeaderHTML);
  doc.addImage(tableHeader.imgData, 'JPEG', margin, currentY, contentWidth, tableHeader.imgHeight);
  currentY += tableHeader.imgHeight + 5;
  
  // Таблица активов (один большой блок)
  const tableRows = data.topAssets.slice(0, 15).map((asset, index) => {
    const pnl = asset.pnl || 0;
    const pnlColor = pnl >= 0 ? '#059669' : '#dc2626';
    const pnlBg = pnl >= 0 ? '#d1fae5' : '#fee2e2';
    const rowBg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
    
    return `
      <tr style="background: ${rowBg};">
        <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0;">
          <div style="font-weight: 700; font-size: 14px; color: #1e293b;">${asset.symbol}</div>
        </td>
        <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">
          <span style="font-size: 13px; color: #475569;">${formatNumber(asset.quantity)}</span>
        </td>
        <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">
          <span style="font-size: 13px; color: #475569; font-weight: 600;">${currencySymbol}${formatNumber(asset.price)}</span>
        </td>
        <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">
          <span style="font-size: 13px; color: #1e293b; font-weight: 700;">${currencySymbol}${formatNumber(asset.value)}</span>
        </td>
        <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">
          <span style="display: inline-block; padding: 4px 8px; background: ${pnlBg}; color: ${pnlColor}; font-weight: 700; font-size: 13px; border-radius: 4px;">
            ${pnl >= 0 ? '+' : ''}${formatNumber(pnl)}%
          </span>
        </td>
      </tr>
    `;
  }).join('');
  
  const tableHTML = `
    <div style="padding: 0 10px;">
      <table style="width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <thead>
          <tr style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%);">
            <th style="padding: 14px 10px; text-align: left; font-weight: 700; font-size: 12px; color: #ffffff; letter-spacing: 0.5px;">АКТИВ</th>
            <th style="padding: 14px 10px; text-align: right; font-weight: 700; font-size: 12px; color: #ffffff; letter-spacing: 0.5px;">КОЛ-ВО</th>
            <th style="padding: 14px 10px; text-align: right; font-weight: 700; font-size: 12px; color: #ffffff; letter-spacing: 0.5px;">ЦЕНА</th>
            <th style="padding: 14px 10px; text-align: right; font-weight: 700; font-size: 12px; color: #ffffff; letter-spacing: 0.5px;">СТОИМОСТЬ</th>
            <th style="padding: 14px 10px; text-align: right; font-weight: 700; font-size: 12px; color: #ffffff; letter-spacing: 0.5px;">P&L</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </div>
  `;
  
  const table = await renderHTML(tableHTML);
  
  // Если таблица слишком большая, разбиваем на страницы
  const availableHeight = pageHeight - currentY - margin - 15;
  
  if (table.imgHeight > availableHeight && data.topAssets.length > 5) {
    // Разделяем активы на группы
    const avgRowHeight = table.imgHeight / Math.max(data.topAssets.slice(0, 15).length, 1);
    const assetsPerPage = Math.max(Math.floor(availableHeight / avgRowHeight) - 1, 2);
    let remainingAssets = [...data.topAssets.slice(0, 15)];
    let isFirstChunk = true;
    let safetyCounter = 0; // Защита от бесконечного цикла
    const maxIterations = 20;
    
    while (remainingAssets.length > 0 && safetyCounter < maxIterations) {
      safetyCounter++;
      
      const chunkSize = Math.min(Math.max(assetsPerPage, 2), remainingAssets.length);
      const chunk = remainingAssets.splice(0, chunkSize);
      
      if (chunk.length === 0) break; // Дополнительная защита
      
      const chunkRows = chunk.map((asset, index) => {
        const pnl = asset.pnl || 0;
        const pnlColor = pnl >= 0 ? '#059669' : '#dc2626';
        const pnlBg = pnl >= 0 ? '#d1fae5' : '#fee2e2';
        const rowBg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
        
        return `
          <tr style="background: ${rowBg};">
            <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0;">
              <div style="font-weight: 700; font-size: 14px; color: #1e293b;">${asset.symbol}</div>
            </td>
            <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">
              <span style="font-size: 13px; color: #475569;">${formatNumber(asset.quantity)}</span>
            </td>
            <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">
              <span style="font-size: 13px; color: #475569; font-weight: 600;">${currencySymbol}${formatNumber(asset.price)}</span>
            </td>
            <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">
              <span style="font-size: 13px; color: #1e293b; font-weight: 700;">${currencySymbol}${formatNumber(asset.value)}</span>
            </td>
            <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">
              <span style="display: inline-block; padding: 4px 8px; background: ${pnlBg}; color: ${pnlColor}; font-weight: 700; font-size: 13px; border-radius: 4px;">
                ${pnl >= 0 ? '+' : ''}${formatNumber(pnl)}%
              </span>
            </td>
          </tr>
        `;
      }).join('');
      
      const chunkHTML = `
        <div style="padding: 0 10px;">
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
            ${isFirstChunk ? `
            <thead>
              <tr style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%);">
                <th style="padding: 14px 10px; text-align: left; font-weight: 700; font-size: 12px; color: #ffffff;">АКТИВ</th>
                <th style="padding: 14px 10px; text-align: right; font-weight: 700; font-size: 12px; color: #ffffff;">КОЛ-ВО</th>
                <th style="padding: 14px 10px; text-align: right; font-weight: 700; font-size: 12px; color: #ffffff;">ЦЕНА</th>
                <th style="padding: 14px 10px; text-align: right; font-weight: 700; font-size: 12px; color: #ffffff;">СТОИМОСТЬ</th>
                <th style="padding: 14px 10px; text-align: right; font-weight: 700; font-size: 12px; color: #ffffff;">P&L</th>
              </tr>
            </thead>
            ` : ''}
            <tbody>
              ${chunkRows}
            </tbody>
          </table>
        </div>
      `;
      
      const chunkBlock = await renderHTML(chunkHTML);
      checkSpace(chunkBlock.imgHeight + 5);
      doc.addImage(chunkBlock.imgData, 'JPEG', margin, currentY, contentWidth, chunkBlock.imgHeight);
      currentY += chunkBlock.imgHeight + 5;
      
      if (remainingAssets.length > 0) {
        addNewPage();
      }
      
      isFirstChunk = false;
    }
  } else {
    doc.addImage(table.imgData, 'JPEG', margin, currentY, contentWidth, table.imgHeight);
  }
  
  // Футеры на всех страницах (без html2canvas для скорости)
  const pageCount = doc.internal.getNumberOfPages();
  const footerY = pageHeight - margin - 10;
  
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    
    // Линия сверху
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.5);
    doc.line(margin, footerY, pageWidth - margin, footerY);
    
    // Номер страницы
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.setFont('helvetica', 'normal');
    
    const pageText = `Page ${i} of ${pageCount}`;
    const pageTextWidth = doc.getTextWidth(pageText);
    doc.text(pageText, (pageWidth - pageTextWidth) / 2, footerY + 4);
    
    // Копирайт
    doc.setFontSize(7);
    doc.setTextColor(209, 213, 219);
    const copyrightText = `CryptoPortfolio © ${new Date().getFullYear()}`;
    const copyrightWidth = doc.getTextWidth(copyrightText);
    doc.text(copyrightText, (pageWidth - copyrightWidth) / 2, footerY + 7.5);
  }
  
  const filename = `analytics_${data.portfolioName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}

function calculateTotalValue(transactions) {
  let total = 0;
  const holdings = {};
  
  transactions.forEach(t => {
    const qty = parseFloat(t.quantity) || 0;
    if (!holdings[t.symbol]) holdings[t.symbol] = 0;
    holdings[t.symbol] += t.type === 'BUY' ? qty : -qty;
  });
  
  Object.entries(holdings).forEach(([symbol, qty]) => {
    if (qty > 0) {
      const price = getPriceSync(symbol);
      total += qty * price;
    }
  });
  
  return total;
}

function calculateTotalInvested(transactions) {
  return transactions
    .filter(t => t.type === 'BUY')
    .reduce((sum, t) => sum + (parseFloat(t.quantity) || 0) * (parseFloat(t.price) || 0), 0);
}

function calculateAssetDistribution(transactions) {
  const holdings = {};
  
  transactions.forEach(t => {
    const qty = parseFloat(t.quantity) || 0;
    if (!holdings[t.symbol]) holdings[t.symbol] = 0;
    holdings[t.symbol] += t.type === 'BUY' ? qty : -qty;
  });
  
  const distribution = {};
  let totalValue = 0;
  
  Object.entries(holdings).forEach(([symbol, qty]) => {
    if (qty > 0) {
      const price = getPriceSync(symbol);
      const value = qty * price;
      distribution[symbol] = value;
      totalValue += value;
    }
  });
  
  return Object.entries(distribution).map(([symbol, value]) => ({
    symbol,
    value,
    percentage: totalValue > 0 ? (value / totalValue) * 100 : 0
  }));
}

function calculateTopAssets(transactions) {
  const holdings = {};
  const invested = {};
  
  transactions.forEach(t => {
    const qty = parseFloat(t.quantity) || 0;
    const price = parseFloat(t.price) || 0;
    
    if (!holdings[t.symbol]) {
      holdings[t.symbol] = 0;
      invested[t.symbol] = 0;
    }
    
    if (t.type === 'BUY') {
      holdings[t.symbol] += qty;
      invested[t.symbol] += qty * price;
    } else {
      holdings[t.symbol] -= qty;
      invested[t.symbol] -= qty * price;
    }
  });
  
  const assets = [];
  Object.entries(holdings).forEach(([symbol, qty]) => {
    if (qty > 0) {
      const currentPrice = getPriceSync(symbol);
      const value = qty * currentPrice;
      const investedAmount = invested[symbol] || 0;
      const pnl = investedAmount > 0 ? ((value - investedAmount) / investedAmount) * 100 : 0;
      
      assets.push({
        symbol,
        quantity: qty,
        price: currentPrice,
        value,
        pnl
      });
    }
  });
  
  return assets.sort((a, b) => b.value - a.value);
}

// Форматирование чисел
 
function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return '0';
  
  const absNum = Math.abs(num);
  
  if (absNum >= 1000000) {
    return (num / 1000000).toFixed(2) + 'M';
  } else if (absNum >= 1000) {
    return (num / 1000).toFixed(2) + 'K';
  }
  
  if (absNum < 0.01 && absNum > 0) {
    return num.toFixed(6);
  }
  
  return num.toFixed(2);
}

function showLoadingNotification(message) {
  if (typeof showNotification === 'function') {
    showNotification(message, 'info');
  }
}

function showSuccessNotification(message) {
  if (typeof showNotification === 'function') {
    showNotification(message, 'success');
  }
}

function showErrorNotification(message) {
  if (typeof showNotification === 'function') {
    showNotification(message, 'error');
  }
}
