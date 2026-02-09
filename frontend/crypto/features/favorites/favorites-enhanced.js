// favorites-enhanced.js
// Расширенный функционал для раздела избранного с сохранением в Supabase

// Хранилище данных избранного
let favoritesData = {
  enhancedData: {}, // { symbol: { note, target_price, target_direction, categories } }
  selected: new Set() // Выбранные активы для массовых операций
};

// Режим выделения
let selectModeActive = false;

// Получение Supabase клиента
async function getSupabaseClient() {
  // Импортируем supabase из profile.js как в data.js
  const { supabase } = await import('../../core/profile.js');
  return supabase;
}

// Загрузка данных из Supabase
async function loadFavoritesEnhancedData() {
  try {
    const supabase = await getSupabaseClient();
    if (!supabase) {
      console.warn('Supabase не инициализирован');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('favorites_enhanced')
      .select('*')
      .eq('user_id', user.id);

    if (error) {
      console.error('Ошибка загрузки данных избранного:', error);
      return;
    }

    // Преобразуем массив в объект по символам
    favoritesData.enhancedData = {};
    if (data) {
      data.forEach(item => {
        favoritesData.enhancedData[item.symbol] = {
          id: item.id,
          note: item.note,
          target_price: item.target_price,
          target_direction: item.target_direction,
          categories: item.categories || []
        };
      });
    }

    console.log('Данные избранного загружены:', Object.keys(favoritesData.enhancedData).length, 'активов');
  } catch (e) {
    console.error('Ошибка загрузки данных избранного:', e);
  }
}

// Сохранение/обновление данных для актива в Supabase
async function saveFavoriteEnhancedData(symbol, data) {
  try {
    const supabase = await getSupabaseClient();
    if (!supabase) return false;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const existingData = favoritesData.enhancedData[symbol];
    
    const payload = {
      user_id: user.id,
      symbol: symbol,
      note: data.note || null,
      target_price: data.target_price || null,
      target_direction: data.target_direction || null,
      categories: data.categories || []
    };

    let result;
    if (existingData && existingData.id) {
      // Обновляем существующую запись
      result = await supabase
        .from('favorites_enhanced')
        .update(payload)
        .eq('id', existingData.id);
    } else {
      // Создаем новую запись
      result = await supabase
        .from('favorites_enhanced')
        .upsert(payload, { onConflict: 'user_id,symbol' })
        .select();
      
      if (result.data && result.data[0]) {
        // Сохраняем ID для последующих обновлений
        if (!favoritesData.enhancedData[symbol]) {
          favoritesData.enhancedData[symbol] = {};
        }
        favoritesData.enhancedData[symbol].id = result.data[0].id;
      }
    }

    if (result.error) {
      console.error('Ошибка сохранения данных:', result.error);
      showNotification('Ошибка сохранения данных', 'error');
      return false;
    }

    // Обновляем локальный кеш
    favoritesData.enhancedData[symbol] = { ...data, id: existingData?.id || result.data?.[0]?.id };
    
    return true;
  } catch (e) {
    console.error('Ошибка сохранения данных избранного:', e);
    showNotification('Ошибка сохранения данных', 'error');
    return false;
  }
}

// Удаление данных для актива из Supabase
async function deleteFavoriteEnhancedData(symbol) {
  try {
    const supabase = await getSupabaseClient();
    if (!supabase) return;

    const existingData = favoritesData.enhancedData[symbol];
    if (!existingData || !existingData.id) return;

    const { error } = await supabase
      .from('favorites_enhanced')
      .delete()
      .eq('id', existingData.id);

    if (error) {
      console.error('Ошибка удаления данных:', error);
      return;
    }

    delete favoritesData.enhancedData[symbol];
  } catch (e) {
    console.error('Ошибка удаления данных избранного:', e);
  }
}

// Добавление кнопок удаления и дополнительных действий к карточкам
export function enhanceFavoriteCards() {
  const cards = document.querySelectorAll('#favoritesCryptoGrid .crypto-card');
  
  cards.forEach(card => {
    const symbol = card.getAttribute('data-symbol');
    if (!symbol) return;
    
    // Предотвращаем открытие модалки при клике на чекбокс и кнопки
    const stopPropagation = (e) => {
      e.stopPropagation();
    };
    
    // Добавляем панель действий внизу карточки если её нет
    if (!card.querySelector('.favorite-actions-panel')) {
      const actionsPanel = document.createElement('div');
      actionsPanel.className = 'favorite-actions-panel';
      actionsPanel.onclick = stopPropagation;
      actionsPanel.innerHTML = `
        <button class="fav-panel-btn fav-remove-btn" data-symbol="${symbol}" title="Удалить из избранного">
          <i class="fas fa-star"></i>
        </button>
        <button class="fav-panel-btn fav-note-btn" data-symbol="${symbol}" title="Заметка">
          <i class="fas fa-sticky-note"></i>
        </button>
        <button class="fav-panel-btn fav-target-btn" data-symbol="${symbol}" title="Целевая цена">
          <i class="fas fa-bullseye"></i>
        </button>
        <button class="fav-panel-btn fav-category-btn" data-symbol="${symbol}" title="Категория">
          <i class="fas fa-tags"></i>
        </button>
      `;
      
      card.appendChild(actionsPanel);
    }
    
    // Добавляем чекбокс для режима выделения если его нет
    if (!card.querySelector('.favorite-checkbox')) {
      const checkbox = document.createElement('div');
      checkbox.className = 'favorite-checkbox';
      checkbox.style.display = selectModeActive ? 'flex' : 'none';
      checkbox.onclick = stopPropagation;
      checkbox.innerHTML = `
        <input type="checkbox" class="fav-select-checkbox" data-symbol="${symbol}">
      `;
      card.insertBefore(checkbox, card.firstChild);
    }
    
    // Показываем индикаторы
    updateCardIndicators(card, symbol);
  });
  
  // Привязываем обработчики событий
  attachEventHandlers();
}

// Обновление индикаторов на карточке
function updateCardIndicators(card, symbol) {
  const oldIndicators = card.querySelector('.card-indicators');
  if (oldIndicators) oldIndicators.remove();
  
  const data = favoritesData.enhancedData[symbol];
  if (!data) return;
  
  const indicators = [];
  
  if (data.note) {
    indicators.push(`<span class="card-indicator note-indicator" title="Есть заметка">
      <i class="fas fa-sticky-note"></i>
    </span>`);
  }
  
  if (data.target_price) {
    const icon = data.target_direction === 'above' ? 'fa-arrow-up' : 'fa-arrow-down';
    indicators.push(`<span class="card-indicator target-indicator" title="Целевая цена: $${data.target_price}">
      <i class="fas fa-bullseye"></i> <i class="fas ${icon}"></i>
    </span>`);
  }
  
  if (data.categories && data.categories.length > 0) {
    indicators.push(`<span class="card-indicator category-indicator" title="${data.categories.join(', ')}">
      <i class="fas fa-tag"></i> ${data.categories.length}
    </span>`);
  }
  
  if (indicators.length > 0) {
    const indicatorsDiv = document.createElement('div');
    indicatorsDiv.className = 'card-indicators';
    indicatorsDiv.innerHTML = indicators.join('');
    
    const header = card.querySelector('.crypto-header');
    if (header) {
      header.appendChild(indicatorsDiv);
    }
  }
}

// Привязка обработчиков событий
function attachEventHandlers() {
  document.querySelectorAll('.fav-remove-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const symbol = btn.getAttribute('data-symbol');
      await removeFavoriteAsset(symbol);
    };
  });
  
  document.querySelectorAll('.fav-note-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const symbol = btn.getAttribute('data-symbol');
      showNoteModal(symbol);
    };
  });
  
  document.querySelectorAll('.fav-target-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const symbol = btn.getAttribute('data-symbol');
      showTargetPriceModal(symbol);
    };
  });
  
  document.querySelectorAll('.fav-category-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const symbol = btn.getAttribute('data-symbol');
      showCategoryModal(symbol);
    };
  });
  
  document.querySelectorAll('.fav-select-checkbox').forEach(checkbox => {
    checkbox.onchange = (e) => {
      e.stopPropagation();
      const symbol = checkbox.getAttribute('data-symbol');
      if (checkbox.checked) {
        favoritesData.selected.add(symbol);
      } else {
        favoritesData.selected.delete(symbol);
      }
      updateSelectedBar();
    };
    
    checkbox.onclick = (e) => {
      e.stopPropagation();
    };
  });
}

// Удаление актива из избранного
async function removeFavoriteAsset(symbol) {
  try {
    const { removeFavorite, getFavorites } = await import('../../core/data.js');
    
    const favorites = await getFavorites();
    const fav = favorites.find(f => f.symbol === symbol);
    
    if (!fav) {
      showNotification(`Актив ${symbol} не найден в избранном`, 'warning');
      return;
    }
    
    if (!confirm(`Удалить ${symbol} из избранного?`)) {
      return;
    }
    
    await removeFavorite(fav.id);
    await deleteFavoriteEnhancedData(symbol);
    
    showNotification(`${symbol} удален из избранного`, 'success');
    
    if (window.renderFavoritesSection) {
      await window.renderFavoritesSection();
      enhanceFavoriteCards();
      updateStats();
    }
  } catch (error) {
    console.error('Ошибка удаления из избранного:', error);
    showNotification('Ошибка при удалении актива', 'error');
  }
}

// Показать модальное окно для заметки
function showNoteModal(symbol) {
  const currentData = favoritesData.enhancedData[symbol] || {};
  const currentNote = currentData.note || '';
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay-news';
  modal.innerHTML = `
    <div class="modal-container-news" style="max-width: 600px;" onclick="event.stopPropagation();">
      <div class="modal-header-news">
        <h3>Заметка для ${symbol}</h3>
        <button class="modal-close-news">&times;</button>
      </div>
      <div class="modal-body-news">
        <textarea id="noteInput" class="note-textarea" placeholder="Введите заметку об активе...">${currentNote}</textarea>
        <div class="info-block">
          <i class="fas fa-cloud"></i>
          <span>Заметка будет сохранена в вашем аккаунте</span>
        </div>
      </div>
      <div class="modal-footer-news">
        <button class="btn btn-outline" id="cancelNoteBtn">Отмена</button>
        ${currentNote ? '<button class="btn btn-danger" id="deleteNoteBtn" style="background: #ef4444; color: white;">Удалить заметку</button>' : ''}
        <button class="btn btn-primary" id="saveNoteBtn">Сохранить</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const closeModal = () => modal.remove();
  
  modal.querySelector('.modal-close-news').onclick = closeModal;
  modal.querySelector('#cancelNoteBtn').onclick = closeModal;
  
  modal.querySelector('#saveNoteBtn').onclick = async () => {
    const noteText = modal.querySelector('#noteInput').value.trim();
    const data = favoritesData.enhancedData[symbol] || {};
    data.note = noteText || null;
    
    const success = await saveFavoriteEnhancedData(symbol, data);
    if (success) {
      showNotification(`Заметка для ${symbol} сохранена`, 'success');
      enhanceFavoriteCards();
      updateStats();
    }
    closeModal();
  };
  
  if (currentNote) {
    modal.querySelector('#deleteNoteBtn').onclick = async () => {
      const data = favoritesData.enhancedData[symbol] || {};
      data.note = null;
      const success = await saveFavoriteEnhancedData(symbol, data);
      if (success) {
        showNotification(`Заметка для ${symbol} удалена`, 'success');
        enhanceFavoriteCards();
        updateStats();
      }
      closeModal();
    };
  }
  
  modal.onclick = (e) => {
    if (e.target === modal) closeModal();
  };
}

// Показать модальное окно для целевой цены
function showTargetPriceModal(symbol) {
  const currentData = favoritesData.enhancedData[symbol] || {};
  const targetPrice = currentData.target_price || '';
  const targetDirection = currentData.target_direction || 'above';
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay-news';
  modal.innerHTML = `
    <div class="modal-container-news" style="max-width: 550px;" onclick="event.stopPropagation();">
      <div class="modal-header-news">
        <h3>Целевая цена для ${symbol}</h3>
        <button class="modal-close-news">&times;</button>
      </div>
      <div class="modal-body-news">
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 10px; font-weight: 600; font-size: 14px; color: #1e293b;">
            Целевая цена ($)
          </label>
          <input type="number" id="targetPriceInput" class="input-field" 
                 placeholder="Например, 50000" value="${targetPrice}" step="0.00000001">
        </div>
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 10px; font-weight: 600; font-size: 14px; color: #1e293b;">
            Направление
          </label>
          <div style="display: flex; gap: 16px;">
            <label style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; 
                          padding: 14px; border: 2px solid ${targetDirection === 'above' ? '#3b82f6' : '#e2e8f0'}; 
                          border-radius: 10px; cursor: pointer; transition: all 0.2s;
                          background: ${targetDirection === 'above' ? 'rgba(59, 130, 246, 0.05)' : 'white'};" 
                   class="direction-option">
              <input type="radio" name="direction" value="above" ${targetDirection === 'above' ? 'checked' : ''}
                     style="width: 18px; height: 18px;">
              <i class="fas fa-arrow-up" style="color: #10b981; font-size: 18px;"></i>
              <span style="font-weight: 600;">Выше</span>
            </label>
            <label style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; 
                          padding: 14px; border: 2px solid ${targetDirection === 'below' ? '#3b82f6' : '#e2e8f0'}; 
                          border-radius: 10px; cursor: pointer; transition: all 0.2s;
                          background: ${targetDirection === 'below' ? 'rgba(59, 130, 246, 0.05)' : 'white'};" 
                   class="direction-option">
              <input type="radio" name="direction" value="below" ${targetDirection === 'below' ? 'checked' : ''}
                     style="width: 18px; height: 18px;">
              <i class="fas fa-arrow-down" style="color: #ef4444; font-size: 18px;"></i>
              <span style="font-weight: 600;">Ниже</span>
            </label>
          </div>
        </div>
        <div style="padding: 16px; background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); 
                    border-radius: 10px; border-left: 4px solid #3b82f6;">
          <div style="display: flex; align-items: center; gap: 10px; color: #1e40af; font-weight: 600;">
            <i class="fas fa-bell"></i>
            <span style="font-size: 14px;">Вы получите уведомление при достижении целевой цены</span>
          </div>
        </div>
      </div>
      <div class="modal-footer-news">
        <button class="btn btn-outline" id="cancelTargetBtn">Отмена</button>
        ${targetPrice ? '<button class="btn btn-danger" id="deleteTargetBtn" style="background: #ef4444; color: white;">Удалить</button>' : ''}
        <button class="btn btn-primary" id="saveTargetBtn">Установить</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.querySelectorAll('.direction-option').forEach(label => {
    const radio = label.querySelector('input[type="radio"]');
    radio.onchange = () => {
      modal.querySelectorAll('.direction-option').forEach(l => {
        const r = l.querySelector('input[type="radio"]');
        if (r.checked) {
          l.style.borderColor = '#3b82f6';
          l.style.background = 'rgba(59, 130, 246, 0.05)';
        } else {
          l.style.borderColor = '#e2e8f0';
          l.style.background = 'white';
        }
      });
    };
  });
  
  const closeModal = () => modal.remove();
  
  modal.querySelector('.modal-close-news').onclick = closeModal;
  modal.querySelector('#cancelTargetBtn').onclick = closeModal;
  
  modal.querySelector('#saveTargetBtn').onclick = async () => {
    const price = parseFloat(modal.querySelector('#targetPriceInput').value);
    const direction = modal.querySelector('input[name="direction"]:checked').value;
    
    if (price && price > 0) {
      const data = favoritesData.enhancedData[symbol] || {};
      data.target_price = price;
      data.target_direction = direction;
      
      const success = await saveFavoriteEnhancedData(symbol, data);
      if (success) {
        // Создаем price alert в базе данных для мониторинга
        try {
          const { createPriceAlert } = await import('../notifications/notifications.js');
          const assetType = window.CRYPTO_INFO[symbol] ? 'crypto' : 'stock';
          await createPriceAlert(symbol, price, direction, assetType, data.note || '');
          showNotification(`Целевая цена и алерт для ${symbol} установлены: $${price}`, 'success');
        } catch (alertError) {
          console.warn('Не удалось создать price alert:', alertError);
          showNotification(`Целевая цена для ${symbol} установлена: $${price}`, 'success');
        }
        enhanceFavoriteCards();
        updateStats();
      }
      closeModal();
    } else {
      showNotification('Введите корректную цену', 'warning');
    }
  };
  
  if (targetPrice) {
    modal.querySelector('#deleteTargetBtn').onclick = async () => {
      const data = favoritesData.enhancedData[symbol] || {};
      data.target_price = null;
      data.target_direction = null;
      const success = await saveFavoriteEnhancedData(symbol, data);
      if (success) {
        showNotification(`Целевая цена для ${symbol} удалена`, 'success');
        enhanceFavoriteCards();
        updateStats();
      }
      closeModal();
    };
  }
  
  modal.onclick = (e) => {
    if (e.target === modal) closeModal();
  };
}

// Показать модальное окно для категорий
function showCategoryModal(symbol) {
  const currentData = favoritesData.enhancedData[symbol] || {};
  const currentCategories = currentData.categories || [];
  const allCategories = ['DeFi', 'NFT', 'AI', 'Gaming', 'Infrastructure', 'Meme', 'Layer 1', 'Layer 2', 'Privacy', 'Exchange', 'Stablecoin', 'Oracle'];
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay-news';
  modal.innerHTML = `
    <div class="modal-container-news" style="max-width: 650px;" onclick="event.stopPropagation();">
      <div class="modal-header-news">
        <h3>Категории для ${symbol}</h3>
        <button class="modal-close-news">&times;</button>
      </div>
      <div class="modal-body-news">
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 12px; font-weight: 600; font-size: 14px; color: #1e293b;">
            Выберите категории
          </label>
          <div class="category-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px;">
            ${allCategories.map(cat => {
              const isChecked = currentCategories.includes(cat);
              return `
                <label style="display: flex; align-items: center; gap: 10px; padding: 12px; 
                              border: 2px solid ${isChecked ? '#3b82f6' : '#e2e8f0'}; 
                              border-radius: 10px; cursor: pointer; transition: all 0.2s; 
                              background: ${isChecked ? 'rgba(59, 130, 246, 0.05)' : 'white'};" 
                       class="category-option">
                  <input type="checkbox" name="category" value="${cat}" 
                         ${isChecked ? 'checked' : ''}
                         style="width: 18px; height: 18px; accent-color: #3b82f6;">
                  <span style="font-size: 14px; font-weight: 500;">${cat}</span>
                </label>
              `;
            }).join('')}
          </div>
        </div>
        <div style="margin-top: 20px;">
          <label style="display: block; margin-bottom: 10px; font-weight: 600; font-size: 14px; color: #1e293b;">
            Или добавьте свою категорию
          </label>
          <div style="display: flex; gap: 10px;">
            <input type="text" id="customCategoryInput" placeholder="Новая категория" 
                   style="flex: 1;">
            <button class="btn btn-primary" id="addCustomCategoryBtn" style="padding: 12px 20px;">
              <i class="fas fa-plus"></i> Добавить
            </button>
          </div>
        </div>
        <div style="margin-top: 20px;">
          <strong style="display: block; margin-bottom: 10px; font-size: 14px; color: #1e293b;">Выбрано:</strong>
          <div id="selectedCategoriesPreview" style="display: flex; flex-wrap: wrap; gap: 8px; min-height: 40px; 
                                                      padding: 12px; background: #f8fafc; border-radius: 10px; 
                                                      border: 2px dashed #cbd5e1;">
            ${currentCategories.length > 0 
              ? currentCategories.map(cat => `
                  <span class="category-tag" style="background: linear-gradient(135deg, #3b82f6, #2563eb); 
                                                     color: white; padding: 6px 14px; border-radius: 20px; 
                                                     font-size: 13px; font-weight: 600; 
                                                     box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);">
                    ${cat}
                  </span>
                `).join('') 
              : '<span style="color: #94a3b8; font-size: 14px;">Категории не выбраны</span>'}
          </div>
        </div>
      </div>
      <div class="modal-footer-news">
        <button class="btn btn-outline" id="cancelCategoryBtn">Отмена</button>
        ${currentCategories.length > 0 ? '<button class="btn btn-danger" id="clearCategoriesBtn" style="background: #ef4444; color: white;">Очистить все</button>' : ''}
        <button class="btn btn-primary" id="saveCategoryBtn">Сохранить</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.querySelectorAll('.category-option').forEach(label => {
    const checkbox = label.querySelector('input[type="checkbox"]');
    checkbox.onchange = () => {
      if (checkbox.checked) {
        label.style.borderColor = '#3b82f6';
        label.style.background = 'rgba(59, 130, 246, 0.05)';
      } else {
        label.style.borderColor = '#e2e8f0';
        label.style.background = 'white';
      }
      updatePreview();
    };
  });
  
  const updatePreview = () => {
    const checked = Array.from(modal.querySelectorAll('input[name="category"]:checked')).map(cb => cb.value);
    const preview = modal.querySelector('#selectedCategoriesPreview');
    if (checked.length > 0) {
      preview.innerHTML = checked.map(cat => `
        <span class="category-tag" style="background: linear-gradient(135deg, #3b82f6, #2563eb); 
                                           color: white; padding: 6px 14px; border-radius: 20px; 
                                           font-size: 13px; font-weight: 600; 
                                           box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);">
          ${cat}
        </span>
      `).join('');
    } else {
      preview.innerHTML = '<span style="color: #94a3b8; font-size: 14px;">Категории не выбраны</span>';
    }
  };
  
  modal.querySelector('#addCustomCategoryBtn').onclick = () => {
    const input = modal.querySelector('#customCategoryInput');
    const customCat = input.value.trim();
    if (customCat) {
      const grid = modal.querySelector('.category-grid');
      const label = document.createElement('label');
      label.className = 'category-option';
      label.style.cssText = 'display: flex; align-items: center; gap: 10px; padding: 12px; border: 2px solid #3b82f6; border-radius: 10px; cursor: pointer; transition: all 0.2s; background: rgba(59, 130, 246, 0.05);';
      label.innerHTML = `
        <input type="checkbox" name="category" value="${customCat}" checked style="width: 18px; height: 18px; accent-color: #3b82f6;">
        <span style="font-size: 14px; font-weight: 500;">${customCat}</span>
      `;
      grid.appendChild(label);
      
      const checkbox = label.querySelector('input');
      checkbox.onchange = () => {
        if (checkbox.checked) {
          label.style.borderColor = '#3b82f6';
          label.style.background = 'rgba(59, 130, 246, 0.05)';
        } else {
          label.style.borderColor = '#e2e8f0';
          label.style.background = 'white';
        }
        updatePreview();
      };
      
      input.value = '';
      updatePreview();
    }
  };
  
  const closeModal = () => modal.remove();
  
  modal.querySelector('.modal-close-news').onclick = closeModal;
  modal.querySelector('#cancelCategoryBtn').onclick = closeModal;
  
  modal.querySelector('#saveCategoryBtn').onclick = async () => {
    const selected = Array.from(modal.querySelectorAll('input[name="category"]:checked')).map(cb => cb.value);
    const data = favoritesData.enhancedData[symbol] || {};
    data.categories = selected.length > 0 ? selected : [];
    
    const success = await saveFavoriteEnhancedData(symbol, data);
    if (success) {
      showNotification(`Категории для ${symbol} обновлены`, 'success');
      enhanceFavoriteCards();
      updateStats();
    }
    closeModal();
  };
  
  if (currentCategories.length > 0) {
    modal.querySelector('#clearCategoriesBtn').onclick = async () => {
      const data = favoritesData.enhancedData[symbol] || {};
      data.categories = [];
      const success = await saveFavoriteEnhancedData(symbol, data);
      if (success) {
        showNotification(`Категории для ${symbol} очищены`, 'success');
        enhanceFavoriteCards();
        updateStats();
      }
      closeModal();
    };
  }
  
  modal.onclick = (e) => {
    if (e.target === modal) closeModal();
  };
}

// Переключение режима выделения
export function toggleSelectMode() {
  selectModeActive = !selectModeActive;
  
  const checkboxes = document.querySelectorAll('.favorite-checkbox');
  checkboxes.forEach(cb => {
    cb.style.display = selectModeActive ? 'flex' : 'none';
  });
  
  const selectBtn = document.getElementById('favSelectModeBtn');
  if (selectBtn) {
    if (selectModeActive) {
      selectBtn.classList.add('active');
      selectBtn.innerHTML = '<i class="fas fa-times"></i> Отменить';
    } else {
      selectBtn.classList.remove('active');
      selectBtn.innerHTML = '<i class="fas fa-check-square"></i> Выделить';
      favoritesData.selected.clear();
      document.querySelectorAll('.fav-select-checkbox').forEach(cb => cb.checked = false);
      updateSelectedBar();
    }
  }
}

// Обновление панели выбранных активов
function updateSelectedBar() {
  const selectedBar = document.getElementById('favSelectedBar');
  const selectedCount = document.getElementById('favSelectedCount');
  
  if (selectedBar && selectedCount) {
    selectedCount.textContent = favoritesData.selected.size;
    selectedBar.style.display = favoritesData.selected.size > 0 ? 'flex' : 'none';
  }
}

// Сравнение выбранных активов
async function compareSelectedAssets() {
  if (favoritesData.selected.size < 2) {
    showNotification('Выберите минимум 2 актива для сравнения', 'warning');
    return;
  }
  
  const symbols = Array.from(favoritesData.selected);
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay-news';
  modal.innerHTML = `
    <div class="modal-container-news" style="max-width: 1000px;" onclick="event.stopPropagation();">
      <div class="modal-header-news">
        <h3>Сравнение активов</h3>
        <button class="modal-close-news">&times;</button>
      </div>
      <div class="modal-body-news" style="overflow-x: auto;">
        <div class="comparison-table-container">
          <table class="comparison-table" style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);">
                <th style="padding: 16px; text-align: left; border-bottom: 2px solid #cbd5e1; font-weight: 700; color: #1e293b;">Параметр</th>
                ${symbols.map(s => `<th style="padding: 16px; text-align: center; border-bottom: 2px solid #cbd5e1; font-weight: 700; color: #1e293b;">${s}</th>`).join('')}
              </tr>
            </thead>
            <tbody id="comparisonTableBody">
              <tr>
                <td colspan="${symbols.length + 1}" style="text-align: center; padding: 60px;">
                  <div class="loader-small" style="margin: 0 auto;"></div>
                  <div style="margin-top: 16px; color: #64748b; font-size: 15px;">Загрузка данных...</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="modal-footer-news">
        <button class="btn btn-outline" id="closeComparisonBtn">Закрыть</button>
        <button class="btn btn-primary" id="exportComparisonBtn">
          <i class="fas fa-download"></i> Экспортировать
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  try {
    const { getPriceSync } = await import('../../core/data.js');
    
    const comparisonData = await Promise.all(symbols.map(async symbol => {
      let price = getPriceSync(symbol);
      
      if (!price || price === 0) {
        const isStock = window.STOCK_INFO && window.STOCK_INFO[symbol];
        if (isStock) {
          try {
            const FINNHUB_TOKEN = 'd49lflpr01qlaebhu1egd49lflpr01qlaebhu1f0';
            const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_TOKEN}`);
            if (response.ok) {
              const data = await response.json();
              if (data && data.c) {
                price = data.c;
              }
            }
          } catch (e) {
            console.warn(`Не удалось загрузить цену для ${symbol}:`, e);
          }
        }
      }
      
      const enhancedData = favoritesData.enhancedData[symbol] || {};
      const note = enhancedData.note || '—';
      const target = enhancedData.target_price 
        ? `$${Number(enhancedData.target_price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })} ${enhancedData.target_direction === 'above' ? '↑' : '↓'}` 
        : '—';
      const categories = enhancedData.categories && enhancedData.categories.length > 0 
        ? enhancedData.categories.join(', ') 
        : '—';
      
      return {
        symbol,
        price: price ? Number(price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 }) : '—',
        note: note.length > 50 ? note.substring(0, 50) + '...' : note,
        target,
        categories
      };
    }));
    
    const tbody = modal.querySelector('#comparisonTableBody');
    tbody.innerHTML = `
      <tr>
        <td style="padding: 16px; font-weight: 700; border-bottom: 1px solid #e2e8f0; background: #fafafa; color: #475569;">Текущая цена</td>
        ${comparisonData.map(d => `
          <td style="padding: 16px; text-align: center; border-bottom: 1px solid #e2e8f0; font-weight: 700; 
                     color: #3b82f6; font-size: 16px;">$${d.price}</td>
        `).join('')}
      </tr>
      <tr>
        <td style="padding: 16px; font-weight: 700; border-bottom: 1px solid #e2e8f0; background: #fafafa; color: #475569;">Целевая цена</td>
        ${comparisonData.map(d => `
          <td style="padding: 16px; text-align: center; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 14px;">${d.target}</td>
        `).join('')}
      </tr>
      <tr>
        <td style="padding: 16px; font-weight: 700; border-bottom: 1px solid #e2e8f0; background: #fafafa; color: #475569;">Категории</td>
        ${comparisonData.map(d => `
          <td style="padding: 16px; text-align: center; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">${d.categories}</td>
        `).join('')}
      </tr>
      <tr>
        <td style="padding: 16px; font-weight: 700; background: #fafafa; color: #475569;">Заметка</td>
        ${comparisonData.map(d => `
          <td style="padding: 16px; text-align: center; font-size: 12px; color: #64748b; font-style: italic;">${d.note}</td>
        `).join('')}
      </tr>
    `;
    
    modal.querySelector('#exportComparisonBtn').onclick = () => {
      exportComparisonData(comparisonData);
    };
  } catch (error) {
    console.error('Ошибка загрузки данных для сравнения:', error);
    modal.querySelector('#comparisonTableBody').innerHTML = `
      <tr>
        <td colspan="${symbols.length + 1}" style="text-align: center; padding: 40px; color: #ef4444;">
          <i class="fas fa-exclamation-triangle" style="font-size: 32px; margin-bottom: 12px; display: block;"></i>
          Ошибка загрузки данных
        </td>
      </tr>
    `;
  }
  
  const closeModal = () => modal.remove();
  modal.querySelector('.modal-close-news').onclick = closeModal;
  modal.querySelector('#closeComparisonBtn').onclick = closeModal;
  modal.onclick = (e) => {
    if (e.target === modal) closeModal();
  };
}

// Экспорт данных сравнения
function exportComparisonData(comparisonData) {
  try {
    const headers = ['Symbol', 'Price', 'Target Price', 'Categories', 'Note'];
    const rows = comparisonData.map(d => [
      d.symbol,
      d.price,
      d.target,
      d.categories,
      d.note.replace(/"/g, '""')
    ]);
    
    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `favorites_comparison_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    showNotification('Данные экспортированы', 'success');
  } catch (error) {
    console.error('Ошибка экспорта данных сравнения:', error);
    showNotification('Ошибка при экспорте', 'error');
  }
}

// Массовое удаление выбранных активов
async function deleteSelectedAssets() {
  if (favoritesData.selected.size === 0) {
    showNotification('Не выбрано ни одного актива', 'warning');
    return;
  }
  
  const count = favoritesData.selected.size;
  if (!confirm(`Удалить ${count} активов из избранного?`)) {
    return;
  }
  
  try {
    const { removeFavorite, getFavorites } = await import('../../core/data.js');
    const favorites = await getFavorites();
    
    for (const symbol of favoritesData.selected) {
      const fav = favorites.find(f => f.symbol === symbol);
      if (fav) {
        await removeFavorite(fav.id);
        await deleteFavoriteEnhancedData(symbol);
      }
    }
    
    favoritesData.selected.clear();
    
    showNotification(`${count} активов удалено из избранного`, 'success');
    
    if (window.renderFavoritesSection) {
      await window.renderFavoritesSection();
      enhanceFavoriteCards();
      updateStats();
      toggleSelectMode();
    }
  } catch (error) {
    console.error('Ошибка массового удаления:', error);
    showNotification('Ошибка при удалении активов', 'error');
  }
}

// Обновление статистики избранного
async function updateStats() {
  try {
    const { getFavorites } = await import('../../core/data.js');
    const favorites = await getFavorites();
    
    let withTargets = 0;
    let withNotes = 0;
    
    favorites.forEach(fav => {
      const data = favoritesData.enhancedData[fav.symbol];
      if (data) {
        if (data.target_price) withTargets++;
        if (data.note) withNotes++;
      }
    });
    
    const statsBar = document.getElementById('favoritesStats');
    if (statsBar && favorites.length > 0) {
      statsBar.style.display = 'flex';
      document.getElementById('favTotalAssets').textContent = favorites.length;
      document.getElementById('favWithTargets').textContent = withTargets;
      document.getElementById('favWithNotes').textContent = withNotes;
      document.getElementById('favTotalValue').textContent = `${favorites.length} активов`;
    } else if (statsBar) {
      statsBar.style.display = 'none';
    }
  } catch (error) {
    console.error('Ошибка обновления статистики:', error);
  }
}

// Экспорт всех данных избранного
async function exportFavoritesData() {
  try {
    const { getFavorites, getPriceSync } = await import('../../core/data.js');
    const favorites = await getFavorites();
    
    const data = await Promise.all(favorites.map(async fav => {
      let price = getPriceSync(fav.symbol) || 'N/A';
      
      if (price === 'N/A') {
        const isStock = window.STOCK_INFO && window.STOCK_INFO[fav.symbol];
        if (isStock) {
          try {
            const FINNHUB_TOKEN = 'd49lflpr01qlaebhu1egd49lflpr01qlaebhu1f0';
            const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${fav.symbol}&token=${FINNHUB_TOKEN}`);
            if (response.ok) {
              const stockData = await response.json();
              if (stockData && stockData.c) {
                price = stockData.c;
              }
            }
          } catch (e) {
            console.warn(`Не удалось загрузить цену для ${fav.symbol}:`, e);
          }
        }
      }
      
      const enhancedData = favoritesData.enhancedData[fav.symbol] || {};
      
      return {
        Symbol: fav.symbol,
        'Current Price': price,
        'Note': enhancedData.note || '',
        'Target Price': enhancedData.target_price || '',
        'Target Direction': enhancedData.target_direction || '',
        'Categories': enhancedData.categories ? enhancedData.categories.join('; ') : '',
        'Added Date': fav.created_at || ''
      };
    }));
    
    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(','),
      ...data.map(row => headers.map(h => `"${row[h]}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `favorites_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    showNotification('Данные избранного экспортированы', 'success');
  } catch (error) {
    console.error('Ошибка экспорта данных:', error);
    showNotification('Ошибка при экспорте данных', 'error');
  }
}

// Показать модальное окно категорий (фильтр)
function showCategoriesFilterModal() {
  const allCategories = new Set();
  Object.values(favoritesData.enhancedData).forEach(data => {
    if (data.categories) {
      data.categories.forEach(cat => allCategories.add(cat));
    }
  });
  
  const categoriesArray = Array.from(allCategories).sort();
  
  if (categoriesArray.length === 0) {
    showNotification('Нет активов с категориями', 'info');
    return;
  }
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay-news';
  modal.innerHTML = `
    <div class="modal-container-news" style="max-width: 600px;" onclick="event.stopPropagation();">
      <div class="modal-header-news">
        <h3>Фильтр по категориям</h3>
        <button class="modal-close-news">&times;</button>
      </div>
      <div class="modal-body-news">
        <div class="categories-filter-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
          ${categoriesArray.map(cat => {
            const count = Object.values(favoritesData.enhancedData).filter(data => 
              data.categories && data.categories.includes(cat)
            ).length;
            return `
              <button class="category-filter-btn" data-category="${cat}" 
                      style="padding: 16px; border: 2px solid #e2e8f0; border-radius: 12px; 
                             background: white; cursor: pointer; text-align: left; 
                             transition: all 0.2s; display: flex; justify-content: space-between; 
                             align-items: center; font-weight: 600;">
                <span style="color: #1e293b;">${cat}</span>
                <span style="background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; 
                             padding: 4px 12px; border-radius: 12px; font-size: 13px; 
                             box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);">${count}</span>
              </button>
            `;
          }).join('')}
        </div>
      </div>
      <div class="modal-footer-news">
        <button class="btn btn-outline" id="closeCategoriesBtn">Закрыть</button>
        <button class="btn btn-primary" id="showAllFavoritesBtn">
          <i class="fas fa-redo"></i> Показать все
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const closeModal = () => modal.remove();
  modal.querySelector('.modal-close-news').onclick = closeModal;
  modal.querySelector('#closeCategoriesBtn').onclick = closeModal;
  
  modal.querySelector('#showAllFavoritesBtn').onclick = async () => {
    if (window.renderFavoritesSection) {
      await window.renderFavoritesSection();
      enhanceFavoriteCards();
    }
    showNotification('Фильтр сброшен, показаны все активы', 'info');
    closeModal();
  };
  
  modal.querySelectorAll('.category-filter-btn').forEach(btn => {
    btn.onmouseover = () => {
      btn.style.borderColor = '#3b82f6';
      btn.style.background = 'rgba(59, 130, 246, 0.05)';
      btn.style.transform = 'translateY(-2px)';
      btn.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.2)';
    };
    btn.onmouseout = () => {
      btn.style.borderColor = '#e2e8f0';
      btn.style.background = 'white';
      btn.style.transform = 'translateY(0)';
      btn.style.boxShadow = 'none';
    };
    
    btn.onclick = async () => {
      const category = btn.getAttribute('data-category');
      
      const cards = document.querySelectorAll('#favoritesCryptoGrid .crypto-card');
      let visibleCount = 0;
      
      cards.forEach(card => {
        const symbol = card.getAttribute('data-symbol');
        const data = favoritesData.enhancedData[symbol];
        const cardCategories = data?.categories || [];
        
        if (cardCategories.includes(category)) {
          card.style.display = '';
          visibleCount++;
        } else {
          card.style.display = 'none';
        }
      });
      
      showNotification(`Показано ${visibleCount} активов из категории "${category}"`, 'info');
      closeModal();
    };
  });
  
  modal.onclick = (e) => {
    if (e.target === modal) closeModal();
  };
}

// Инициализация расширенного функционала
export async function initFavoritesEnhanced() {
  await loadFavoritesEnhancedData();
  
  const compareModeBtn = document.getElementById('favCompareModeBtn');
  const categoriesBtn = document.getElementById('favCategoriesBtn');
  const exportBtn = document.getElementById('favExportBtn');
  const selectModeBtn = document.getElementById('favSelectModeBtn');
  
  if (compareModeBtn) {
    compareModeBtn.onclick = () => {
      if (favoritesData.selected.size >= 2) {
        compareSelectedAssets();
      } else {
        showNotification('Включите режим выделения и выберите минимум 2 актива', 'info');
        toggleSelectMode();
      }
    };
  }
  
  if (categoriesBtn) {
    categoriesBtn.onclick = showCategoriesFilterModal;
  }
  
  if (exportBtn) {
    exportBtn.onclick = exportFavoritesData;
  }
  
  if (selectModeBtn) {
    selectModeBtn.onclick = toggleSelectMode;
  }
  
  const compareSelectedBtn = document.getElementById('favCompareSelectedBtn');
  const deleteSelectedBtn = document.getElementById('favDeleteSelectedBtn');
  const cancelSelectBtn = document.getElementById('favCancelSelectBtn');
  
  if (compareSelectedBtn) {
    compareSelectedBtn.onclick = compareSelectedAssets;
  }
  
  if (deleteSelectedBtn) {
    deleteSelectedBtn.onclick = deleteSelectedAssets;
  }
  
  if (cancelSelectBtn) {
    cancelSelectBtn.onclick = toggleSelectMode;
  }
  
  // Устанавливаем MutationObserver для отслеживания перерисовки карточек
  const favoritesGrid = document.getElementById('favoritesCryptoGrid');
  if (favoritesGrid) {
    const observer = new MutationObserver((mutations) => {
      // Проверяем, добавлены ли новые карточки
      let hasNewCards = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.classList && node.classList.contains('crypto-card')) {
              hasNewCards = true;
              break;
            }
          }
        }
      }
      
      if (hasNewCards) {
        // Отложенное добавление элементов, чтобы избежать множественных вызовов
        clearTimeout(window._favEnhanceTimeout);
        window._favEnhanceTimeout = setTimeout(() => {
          enhanceFavoriteCards();
          updateStats();
        }, 100);
      }
    });
    
    observer.observe(favoritesGrid, {
      childList: true,
      subtree: true
    });
    
    // Сохраняем observer для возможности остановки
    window._favoritesObserver = observer;
  }
  
  enhanceFavoriteCards();
  updateStats();
  
  console.log('✅ Расширенный функционал избранного инициализирован');
}

// Вспомогательная функция для уведомлений
function showNotification(message, type = 'info') {
  if (window.showNotification) {
    window.showNotification(message, type);
  } else {
    console.log(`[${type.toUpperCase()}] ${message}`);
  }
}

// Проверка целевых цен
async function checkTargetPrices() {
  try {
    const { getPriceSync } = await import('../../core/data.js');
    
    for (const [symbol, data] of Object.entries(favoritesData.enhancedData)) {
      if (!data.target_price) continue;
      
      const currentPrice = getPriceSync(symbol);
      if (!currentPrice) continue;
      
      const reached = data.target_direction === 'above' 
        ? currentPrice >= data.target_price 
        : currentPrice <= data.target_price;
      
      if (reached) {
        const message = `🎯 ${symbol} достиг целевой цены $${data.target_price}! Текущая цена: $${currentPrice}`;
        showNotification(message, 'success');
      }
    }
  } catch (error) {
    console.error('Ошибка проверки целевых цен:', error);
  }
}

setInterval(checkTargetPrices, 30000);

export { favoritesData, loadFavoritesEnhancedData, updateStats };
