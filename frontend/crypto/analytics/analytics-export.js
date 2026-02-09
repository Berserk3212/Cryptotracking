import { getPortfolios, getTransactions, getPricesForSymbols, getPriceSync } from '../core/data.js';
import { convertToSelectedCurrency, getCurrencySymbol } from '../core/currency.js';

export async function exportAnalyticsToPDF(portfolioId = '') {
  try {
    showLoadingNotification('Подготовка отчета...');
    
    const data = await collectAnalyticsData(portfolioId);
    const symbols = [...new Set(data.topAssets.map(a => a.symbol))];
    if (symbols.length > 0) {
      showLoadingNotification('Загрузка актуальных цен...');
      await getPricesForSymbols(symbols, { useCoinGecko: true });
    }
    
    const charts = await captureCharts();
    await generatePDFDocument(data, charts);
    
    showSuccessNotification('Отчет успешно сгенерирован!');
  } catch (error) {
    console.error('Ошибка экспорта в PDF:', error);
    showErrorNotification('Ошибка при создании PDF отчета');
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
        charts[name] = canvas.toDataURL('image/png', 0.9);
      } catch (e) {
        console.warn(`Не удалось захватить график ${id}:`, e);
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
  const maxContentHeight = pageHeight - 2 * margin;
  
  let currentY = margin;
  const { metrics } = data;
  const currencySymbol = getCurrencySymbol();
  
  const addNewPage = () => {
    doc.addPage();
    currentY = margin;
  };
  
  const checkSpace = (requiredHeight) => {
    if (currentY + requiredHeight > pageHeight - margin) {
      addNewPage();
      return true;
    }
    return false;
  };
  
  const renderTextBlock = async (htmlContent, width = contentWidth) => {
    const tempDiv = document.createElement('div');
    tempDiv.style.cssText = `
      position: fixed;
      left: -9999px;
      top: 0;
      width: ${width * 3.78}px;
      background: #ffffff;
      font-family: Arial, sans-serif;
      box-sizing: border-box;
    `;
    tempDiv.innerHTML = htmlContent;
    document.body.appendChild(tempDiv);
    
    try {
      const canvas = await html2canvas(tempDiv, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true
      });
      
      const imgData = canvas.toDataURL('image/png', 1.0);
      const imgHeight = (canvas.height * width) / canvas.width;
      
      return { imgData, imgHeight };
    } finally {
      document.body.removeChild(tempDiv);
    }
  };
  
  const headerHtml = `
    <div style="padding: 15px;">
      <h1 style="font-size: 32px; margin: 0 0 8px 0; color: #1a1a1a; font-weight: 700; letter-spacing: -0.5px;">
        Отчет по аналитике портфеля
      </h1>
      <div style="display: flex; gap: 20px; margin-top: 12px;">
        <p style="font-size: 15px; color: #666; margin: 0;">
          <strong style="color: #333;">Портфель:</strong> ${data.portfolioName}
        </p>
        <p style="font-size: 15px; color: #666; margin: 0;">
          <strong style="color: #333;">Дата:</strong> ${data.date}
        </p>
      </div>
      <div style="height: 3px; background: linear-gradient(90deg, #3b82f6 0%, #8b5cf6 100%); margin-top: 15px; border-radius: 2px;"></div>
    </div>
  `;
  
  const header = await renderTextBlock(headerHtml);
  doc.addImage(header.imgData, 'PNG', margin, currentY, contentWidth, header.imgHeight);
  currentY += header.imgHeight + 5;
  
  const metricsHtml = `
    <div style="padding: 10px;">
      <h2 style="font-size: 24px; margin: 0 0 15px 0; color: #1f2937; font-weight: 700;">
        Ключевые показатели
      </h2>
      
      <!-- Первая строка метрик -->
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
      
      <!-- Вторая строка метрик -->
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
      
      <!-- Третья строка метрик -->
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
  
  const metricsBlock = await renderTextBlock(metricsHtml);
  checkSpace(metricsBlock.imgHeight + 10);
  doc.addImage(metricsBlock.imgData, 'PNG', margin, currentY, contentWidth, metricsBlock.imgHeight);
  currentY += metricsBlock.imgHeight + 10;
  
  addNewPage();
  
  const chartsHeaderHtml = `
    <div style="padding: 10px 15px;">
      <h2 style="font-size: 24px; margin: 0; color: #1f2937; font-weight: 700;">
        Графики и визуализация
      </h2>
      <p style="font-size: 13px; color: #6b7280; margin: 5px 0 0 0;">
        Детальный анализ динамики и структуры портфеля
      </p>
    </div>
  `;
  
  const chartsHeader = await renderTextBlock(chartsHeaderHtml);
  doc.addImage(chartsHeader.imgData, 'PNG', margin, currentY, contentWidth, chartsHeader.imgHeight);
  currentY += chartsHeader.imgHeight + 8;
  
  if (charts.valueChart) {
    const titleHtml = `
      <div style="padding: 8px 12px; background: #f1f5f9; border-left: 3px solid #3b82f6; border-radius: 4px;">
        <p style="font-size: 14px; color: #1e293b; margin: 0; font-weight: 600;">
          История стоимости портфеля
        </p>
      </div>
    `;
    
    const title = await renderTextBlock(titleHtml);
    const chartHeight = 75;
    
    checkSpace(title.imgHeight + chartHeight + 12);
    
    doc.addImage(title.imgData, 'PNG', margin, currentY, contentWidth, title.imgHeight);
    currentY += title.imgHeight + 3;
    
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, currentY, contentWidth, chartHeight, 2, 2, 'S');
    doc.addImage(charts.valueChart, 'PNG', margin + 1, currentY + 1, contentWidth - 2, chartHeight - 2);
    currentY += chartHeight + 12;
  }
  
  const smallChartWidth = (contentWidth - 8) / 2;
  const smallChartHeight = 65;
  
  if (charts.typeChart || charts.topChart) {
    checkSpace(smallChartHeight + 25);
    
    let xPos = margin;
    
    if (charts.typeChart) {
      const titleHtml = `
        <div style="padding: 6px 10px; background: #f1f5f9; border-left: 3px solid #8b5cf6; border-radius: 4px;">
          <p style="font-size: 13px; color: #1e293b; margin: 0; font-weight: 600;">
            Распределение по типам
          </p>
        </div>
      `;
      
      const title = await renderTextBlock(titleHtml, smallChartWidth);
      doc.addImage(title.imgData, 'PNG', xPos, currentY, smallChartWidth, title.imgHeight);
      
      const chartY = currentY + title.imgHeight + 2;
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.roundedRect(xPos, chartY, smallChartWidth, smallChartHeight, 2, 2, 'S');
      doc.addImage(charts.typeChart, 'PNG', xPos + 1, chartY + 1, smallChartWidth - 2, smallChartHeight - 2);
      
      xPos += smallChartWidth + 8;
    }
    
    if (charts.topChart) {
      const titleHtml = `
        <div style="padding: 6px 10px; background: #f1f5f9; border-left: 3px solid #f59e0b; border-radius: 4px;">
          <p style="font-size: 13px; color: #1e293b; margin: 0; font-weight: 600;">
            Топ активов
          </p>
        </div>
      `;
      
      const title = await renderTextBlock(titleHtml, smallChartWidth);
      doc.addImage(title.imgData, 'PNG', xPos, currentY, smallChartWidth, title.imgHeight);
      
      const chartY = currentY + title.imgHeight + 2;
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.roundedRect(xPos, chartY, smallChartWidth, smallChartHeight, 2, 2, 'S');
      doc.addImage(charts.topChart, 'PNG', xPos + 1, chartY + 1, smallChartWidth - 2, smallChartHeight - 2);
    }
    
    currentY += 8 + smallChartHeight + 12;
  }
  
  if (charts.returnsChart || charts.riskChart) {
    checkSpace(smallChartHeight + 25);
    
    let xPos = margin;
    
    if (charts.returnsChart) {
      const titleHtml = `
        <div style="padding: 6px 10px; background: #f1f5f9; border-left: 3px solid #10b981; border-radius: 4px;">
          <p style="font-size: 13px; color: #1e293b; margin: 0; font-weight: 600;">
            Доходность по месяцам
          </p>
        </div>
      `;
      
      const title = await renderTextBlock(titleHtml, smallChartWidth);
      doc.addImage(title.imgData, 'PNG', xPos, currentY, smallChartWidth, title.imgHeight);
      
      const chartY = currentY + title.imgHeight + 2;
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.roundedRect(xPos, chartY, smallChartWidth, smallChartHeight, 2, 2, 'S');
      doc.addImage(charts.returnsChart, 'PNG', xPos + 1, chartY + 1, smallChartWidth - 2, smallChartHeight - 2);
      
      xPos += smallChartWidth + 8;
    }
    
    if (charts.riskChart) {
      const titleHtml = `
        <div style="padding: 6px 10px; background: #f1f5f9; border-left: 3px solid #ef4444; border-radius: 4px;">
          <p style="font-size: 13px; color: #1e293b; margin: 0; font-weight: 600;">
            Риск-профиль
          </p>
        </div>
      `;
      
      const title = await renderTextBlock(titleHtml, smallChartWidth);
      doc.addImage(title.imgData, 'PNG', xPos, currentY, smallChartWidth, title.imgHeight);
      
      const chartY = currentY + title.imgHeight + 2;
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.roundedRect(xPos, chartY, smallChartWidth, smallChartHeight, 2, 2, 'S');
      doc.addImage(charts.riskChart, 'PNG', xPos + 1, chartY + 1, smallChartWidth - 2, smallChartHeight - 2);
    }
  }
  
  addNewPage();
  
  const tableHeaderHtml = `
    <div style="padding: 10px 15px;">
      <h2 style="font-size: 24px; margin: 0; color: #1f2937; font-weight: 700;">
        Детальная статистика активов
      </h2>
      <p style="font-size: 13px; color: #6b7280; margin: 5px 0 0 0;">
        Топ ${Math.min(15, data.topAssets.length)} активов по стоимости
      </p>
    </div>
  `;
  
  const tableHeader = await renderTextBlock(tableHeaderHtml);
  doc.addImage(tableHeader.imgData, 'PNG', margin, currentY, contentWidth, tableHeader.imgHeight);
  currentY += tableHeader.imgHeight + 5;
  
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
  
  const tableHtml = `
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
  
  const table = await renderTextBlock(tableHtml);
  const maxTableHeight = pageHeight - currentY - margin - 20;
  
  if (table.imgHeight > maxTableHeight) {
    const rowsPerPage = Math.floor((maxTableHeight / table.imgHeight) * data.topAssets.slice(0, 15).length);
    let remainingAssets = [...data.topAssets.slice(0, 15)];
    
    while (remainingAssets.length > 0) {
      const assetsChunk = remainingAssets.splice(0, Math.max(rowsPerPage, 5));
      const chunkRows = assetsChunk.map((asset, index) => {
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
      
      const chunkHtml = `
        <div style="padding: 0 10px;">
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
            ${remainingAssets.length === data.topAssets.slice(0, 15).length ? `
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
      
      const chunkBlock = await renderTextBlock(chunkHtml);
      checkSpace(chunkBlock.imgHeight + 10);
      doc.addImage(chunkBlock.imgData, 'PNG', margin, currentY, contentWidth, chunkBlock.imgHeight);
      currentY += chunkBlock.imgHeight + 5;
      
      if (remainingAssets.length > 0) {
        addNewPage();
      }
    }
  } else {
    doc.addImage(table.imgData, 'PNG', margin, currentY, contentWidth, table.imgHeight);
  }
  
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    
    const footerHtml = `
      <div style="padding: 8px 0; text-align: center; border-top: 2px solid #e5e7eb;">
        <p style="font-size: 10px; color: #9ca3af; margin: 0; font-weight: 500;">
          Страница ${i} из ${pageCount}
        </p>
        <p style="font-size: 9px; color: #d1d5db; margin: 2px 0 0 0;">
          CryptoPortfolio © ${new Date().getFullYear()} • Ваш инвестиционный помощник
        </p>
      </div>
    `;
    
    const footer = await renderTextBlock(footerHtml);
    doc.addImage(footer.imgData, 'PNG', margin, pageHeight - margin - footer.imgHeight + 5, contentWidth, footer.imgHeight);
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

/**
 * Форматирование чисел
 */
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
