// settings-service.js — загружает системные настройки из Supabase
// и кэширует их в window.appSettings для использования всем приложением.

import { supabase } from './profile.js';

const DEFAULT_SETTINGS = {
  data_refresh_interval:  120,    // секунды
  news_refresh_interval:  300,    // секунды
  api_rate_limit:         100,    // запросов/мин
  max_portfolios_per_user: 10,
  notification_thresholds: { price_change: 5, volume_change: 20 },
  registration_enabled:   true,
  guest_mode_enabled:     true,
  maintenance_mode:       false,
  maintenance_message:    'Сервис временно недоступен. Пожалуйста, попробуйте позже.'
};

function parseValue(value, valueType) {
  try {
    switch (valueType) {
      case 'boolean': return value === 'true' || value === true;
      case 'integer': return parseInt(value, 10);
      case 'float':   return parseFloat(value);
      case 'json':    return typeof value === 'string' ? JSON.parse(value) : value;
      default:        return value;
    }
  } catch {
    return value;
  }
}

/**
 * Загружает настройки из таблицы system_settings и сохраняет в window.appSettings.
 * При ошибке применяет дефолтные значения.
 * @returns {Promise<object>} — объект настроек
 */
export async function loadAppSettings() {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('key, value, value_type');

    const settings = { ...DEFAULT_SETTINGS };

    if (!error && data) {
      data.forEach(({ key, value, value_type }) => {
        settings[key] = parseValue(value, value_type);
      });
    } else if (error) {
      // нестрашно — используем значения по умолчанию
    }

    window.appSettings = settings;
    return settings;
  } catch (_) {
    window.appSettings = { ...DEFAULT_SETTINGS };
    return window.appSettings;
  }
}

/**
 * Читает одну настройку из кэша window.appSettings.
 * @param {string} key
 * @param {*} [fallback] — если ключ отсутствует
 */
export function getSetting(key, fallback) {
  const val = window.appSettings?.[key];
  if (val !== undefined) return val;
  if (fallback !== undefined) return fallback;
  return DEFAULT_SETTINGS[key];
}
