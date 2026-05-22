
async function downloadChartWithTooltip(format = 'png') {
  try {

    
    if (!window.tvChart) {
      showNotification('График не загружен', 'error');
      return;
    }
    
    if (typeof html2canvas === 'undefined') {
      showNotification('Библиотека html2canvas не загружена', 'error');
      return;
    }
    
    const chartContainer = document.querySelector('.crypto-detail-chart-container');
    if (!chartContainer) {
      showNotification('Контейнер графика не найден', 'error');
      return;
    }
    
    const controls = chartContainer.querySelector('.crypto-detail-chart-controls');
    const controlsDisplay = controls ? controls.style.display : null;
    if (controls) controls.style.display = 'none';
    
    const canvases = chartContainer.querySelectorAll('canvas');
    let exportedBlob = null;

    if (canvases && canvases.length > 0) {
      try {
        const containerRect = chartContainer.getBoundingClientRect();
        const scale = 2;
        const outWidth = Math.round(containerRect.width * scale);
        const outHeight = Math.round(containerRect.height * scale);

        const outCanvas = document.createElement('canvas');
        outCanvas.width = outWidth;
        outCanvas.height = outHeight;
        const outCtx = outCanvas.getContext('2d');

        outCtx.fillStyle = '#1a1d28';
        outCtx.fillRect(0, 0, outWidth, outHeight);

        canvases.forEach((c) => {
          const rect = c.getBoundingClientRect();
          const sx = 0;
          const sy = 0;
          const sWidth = c.width;
          const sHeight = c.height;

          const dx = Math.round((rect.left - containerRect.left) * scale);
          const dy = Math.round((rect.top - containerRect.top) * scale);
          const dWidth = Math.round(rect.width * scale);
          const dHeight = Math.round(rect.height * scale);

          try {
            outCtx.drawImage(c, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
          } catch (e) {

          }
        });

        // Собираем результирующий canvas в blob
        exportedBlob = await new Promise((resolve) => outCanvas.toBlob(resolve, format === 'jpg' ? 'image/jpeg' : 'image/png', format === 'jpg' ? 0.95 : undefined));
      } catch (e) {

        exportedBlob = null;
      }
    }

    // Если нативный экспорт не сработал — используем html2canvas как запасной вариант
    if (!exportedBlob) {
      const fallbackCanvas = await html2canvas(chartContainer, {
        backgroundColor: '#1a1d28',
        scale: 2, // повышенное качество
        logging: false,
        useCORS: true,
        allowTaint: true
      });

      // Восстанавливаем элементы управления
      if (controls && controlsDisplay !== null) {
        controls.style.display = controlsDisplay;
      }

      exportedBlob = await new Promise((resolve) => fallbackCanvas.toBlob(resolve, format === 'jpg' ? 'image/jpeg' : 'image/png', format === 'jpg' ? 0.95 : undefined));
    } else {
      // Восстанавливаем элементы управления после нативного экспорта
      if (controls && controlsDisplay !== null) {
        controls.style.display = controlsDisplay;
      }
    }

    if (!exportedBlob) {
      showNotification('Ошибка создания изображения', 'error');
      return;
    }

    // Создаём временную ссылку для скачивания
    const url = URL.createObjectURL(exportedBlob);
    const link = document.createElement('a');
    const symbol = window.currentCryptoSymbol || 'crypto';
    const timestamp = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `${symbol}_chart_${timestamp}.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showNotification(`График сохранён как ${format.toUpperCase()}`, 'success');

    
  } catch (error) {

    showNotification('Ошибка при сохранении графика', 'error');
  }
}

/**
 * Скачать график в формате JPG
 */
window.downloadChartAsJPG = function() {
  downloadChartWithTooltip('jpg');
};

/**
 * Скачать график в формате PNG
 */
window.downloadChartAsPNG = function() {
  downloadChartWithTooltip('png');
};

/**
 * Переключить видимость меню загрузки
 */
window.toggleDownloadMenu = function() {
  const menu = document.getElementById('downloadMenu');
  if (!menu) return;
  
  const isVisible = menu.style.display === 'block';
  menu.style.display = isVisible ? 'none' : 'block';
  
  // Закрыть меню при клике вне его
  if (!isVisible) {
    setTimeout(() => {
      document.addEventListener('click', function closeMenu(e) {
        if (!e.target.closest('.chart-download-wrapper')) {
          menu.style.display = 'none';
          document.removeEventListener('click', closeMenu);
        }
      });
    }, 0);
  }
};

