/**
 * activity-logger.js
 * Запись действий пользователей в таблицу activity_logs для админ-панели.
 * Все ошибки логгирования игнорируются (fire-and-forget) — 
 * они не должны прерывать основные операции пользователя.
 */
import { supabase } from './profile.js';

/**
 * @param {string} action  - код действия: 'create_portfolio', 'add_transaction', …
 * @param {string} section - раздел приложения: 'portfolios', 'transactions', …
 * @param {object} [details] - произвольные детали (будут записаны как jsonb)
 */
export async function logActivity(action, section, details = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return; // анонимные действия не логируем

    await supabase.from('activity_logs').insert({
      user_id:    session.user.id,
      user_email: session.user.email,
      action,
      section,
      details,
    });
  } catch {
    // Логгирование никогда не должно ломать приложение
  }
}
