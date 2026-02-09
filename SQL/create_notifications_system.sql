-- =====================================================
-- СИСТЕМА УВЕДОМЛЕНИЙ ДЛЯ КРИПТОПОРТФОЛИО
-- =====================================================
-- Этот файл содержит SQL для создания полной системы уведомлений
-- Выполните эти запросы в SQL Editor вашего проекта Supabase

-- =====================================================
-- 1. Таблица уведомлений (notifications)
-- =====================================================

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN (
        'price_alert',      -- Уведомление о достижении целевой цены
        'portfolio',        -- Уведомление о портфеле
        'news',            -- Важная новость об активе
        'system',          -- Системное уведомление
        'recommendation'   -- Рекомендация по оптимизации
    )),
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    related_symbol VARCHAR(20),  -- Связанный актив (если применимо)
    related_id UUID,              -- ID связанного объекта (портфель, транзакция и т.д.)
    data JSONB,                   -- Дополнительные данные в формате JSON
    is_read BOOLEAN DEFAULT FALSE,
    is_dismissed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    read_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,       -- Срок действия уведомления (опционально)
    CONSTRAINT valid_expires_at CHECK (expires_at IS NULL OR expires_at > created_at)
);

-- Индексы для быстрого доступа
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_symbol ON notifications(related_symbol) WHERE related_symbol IS NOT NULL;

-- Composite index для запросов непрочитанных уведомлений пользователя
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread 
    ON notifications(user_id, is_read, created_at DESC) 
    WHERE is_read = FALSE AND is_dismissed = FALSE;

-- RLS (Row Level Security)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Политики доступа
CREATE POLICY "Users can view their own notifications"
    ON notifications FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
    ON notifications FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notifications"
    ON notifications FOR DELETE
    USING (auth.uid() = user_id);

-- Система может создавать уведомления (используйте service_role для backend)
CREATE POLICY "System can insert notifications"
    ON notifications FOR INSERT
    WITH CHECK (true);

-- =====================================================
-- 2. Таблица мониторинга цен (price_alerts)
-- =====================================================

CREATE TABLE IF NOT EXISTS price_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    symbol VARCHAR(20) NOT NULL,
    asset_type VARCHAR(20) DEFAULT 'crypto' CHECK (asset_type IN ('crypto', 'stock')),
    target_price DECIMAL(20, 8) NOT NULL,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('above', 'below')),
    current_price DECIMAL(20, 8),
    is_active BOOLEAN DEFAULT TRUE,
    is_triggered BOOLEAN DEFAULT FALSE,
    triggered_at TIMESTAMPTZ,
    notification_sent BOOLEAN DEFAULT FALSE,
    notification_id UUID REFERENCES notifications(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    note TEXT,
    CONSTRAINT valid_target_price CHECK (target_price > 0),
    CONSTRAINT valid_current_price CHECK (current_price IS NULL OR current_price >= 0)
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_price_alerts_user_id ON price_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_symbol ON price_alerts(symbol);
CREATE INDEX IF NOT EXISTS idx_price_alerts_active 
    ON price_alerts(is_active, is_triggered) 
    WHERE is_active = TRUE AND is_triggered = FALSE;
CREATE INDEX IF NOT EXISTS idx_price_alerts_user_symbol 
    ON price_alerts(user_id, symbol, is_active);

-- RLS
ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;

-- Политики доступа
CREATE POLICY "Users can view their own price alerts"
    ON price_alerts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own price alerts"
    ON price_alerts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own price alerts"
    ON price_alerts FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own price alerts"
    ON price_alerts FOR DELETE
    USING (auth.uid() = user_id);

-- =====================================================
-- 3. Таблица настроек уведомлений (notification_preferences)
-- =====================================================

CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    
    -- Глобальные настройки
    enabled BOOLEAN DEFAULT TRUE,
    email_notifications BOOLEAN DEFAULT FALSE,
    push_notifications BOOLEAN DEFAULT TRUE,
    
    -- Настройки по типам уведомлений
    price_alerts_enabled BOOLEAN DEFAULT TRUE,
    portfolio_alerts_enabled BOOLEAN DEFAULT TRUE,
    news_alerts_enabled BOOLEAN DEFAULT TRUE,
    recommendation_alerts_enabled BOOLEAN DEFAULT TRUE,
    
    -- Настройки частоты
    digest_frequency VARCHAR(20) DEFAULT 'none' CHECK (digest_frequency IN ('none', 'daily', 'weekly')),
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    
    -- Пороги для уведомлений
    price_change_threshold DECIMAL(5, 2) DEFAULT 5.0,  -- Процент изменения цены для уведомления
    portfolio_change_threshold DECIMAL(5, 2) DEFAULT 10.0,  -- Процент изменения портфеля
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id 
    ON notification_preferences(user_id);

-- RLS
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Политики доступа
CREATE POLICY "Users can view their own notification preferences"
    ON notification_preferences FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notification preferences"
    ON notification_preferences FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notification preferences"
    ON notification_preferences FOR UPDATE
    USING (auth.uid() = user_id);

-- =====================================================
-- 4. Функции и триггеры
-- =====================================================

-- Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_notification_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер для price_alerts
CREATE TRIGGER update_price_alerts_updated_at
    BEFORE UPDATE ON price_alerts
    FOR EACH ROW
    EXECUTE FUNCTION update_notification_updated_at();

-- Триггер для notification_preferences
CREATE TRIGGER update_notification_preferences_updated_at
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_notification_updated_at();

-- Функция для автоматического создания настроек уведомлений при регистрации
CREATE OR REPLACE FUNCTION create_default_notification_preferences()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO notification_preferences (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер для автоматического создания настроек при регистрации пользователя
DROP TRIGGER IF EXISTS on_auth_user_created_notification_prefs ON auth.users;
CREATE TRIGGER on_auth_user_created_notification_prefs
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION create_default_notification_preferences();

-- Функция для очистки старых уведомлений
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS void AS $$
BEGIN
    -- Удаляем прочитанные уведомления старше 30 дней
    DELETE FROM notifications
    WHERE is_read = TRUE 
    AND created_at < NOW() - INTERVAL '30 days';
    
    -- Удаляем отклоненные уведомления старше 7 дней
    DELETE FROM notifications
    WHERE is_dismissed = TRUE 
    AND created_at < NOW() - INTERVAL '7 days';
    
    -- Удаляем просроченные уведомления
    DELETE FROM notifications
    WHERE expires_at IS NOT NULL 
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Функция для создания уведомления о достижении целевой цены
CREATE OR REPLACE FUNCTION create_price_alert_notification(
    p_user_id UUID,
    p_symbol VARCHAR,
    p_target_price DECIMAL,
    p_current_price DECIMAL,
    p_direction VARCHAR,
    p_alert_id UUID
)
RETURNS UUID AS $$
DECLARE
    v_notification_id UUID;
    v_title VARCHAR;
    v_message TEXT;
BEGIN
    -- Формируем заголовок и сообщение
    IF p_direction = 'above' THEN
        v_title := format('%s достиг целевой цены!', p_symbol);
        v_message := format('%s вырос до $%s (целевая цена: $%s)', 
            p_symbol, 
            p_current_price, 
            p_target_price
        );
    ELSE
        v_title := format('%s достиг целевой цены!', p_symbol);
        v_message := format('%s упал до $%s (целевая цена: $%s)', 
            p_symbol, 
            p_current_price, 
            p_target_price
        );
    END IF;
    
    -- Создаем уведомление
    INSERT INTO notifications (
        user_id,
        title,
        message,
        type,
        priority,
        related_symbol,
        related_id,
        data
    ) VALUES (
        p_user_id,
        v_title,
        v_message,
        'price_alert',
        'high',
        p_symbol,
        p_alert_id,
        jsonb_build_object(
            'target_price', p_target_price,
            'current_price', p_current_price,
            'direction', p_direction,
            'alert_id', p_alert_id
        )
    ) RETURNING id INTO v_notification_id;
    
    RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 5. Представления (Views) для удобства
-- =====================================================

-- Представление для непрочитанных уведомлений
CREATE OR REPLACE VIEW unread_notifications AS
SELECT 
    n.*,
    CASE 
        WHEN n.created_at > NOW() - INTERVAL '1 hour' THEN 'new'
        WHEN n.created_at > NOW() - INTERVAL '24 hours' THEN 'recent'
        ELSE 'old'
    END as age_category
FROM notifications n
WHERE n.is_read = FALSE 
  AND n.is_dismissed = FALSE
  AND (n.expires_at IS NULL OR n.expires_at > NOW())
ORDER BY n.priority DESC, n.created_at DESC;

-- Представление для активных алертов
CREATE OR REPLACE VIEW active_price_alerts AS
SELECT 
    pa.*,
    CASE 
        WHEN pa.direction = 'above' THEN 
            CASE WHEN pa.current_price >= pa.target_price THEN TRUE ELSE FALSE END
        ELSE 
            CASE WHEN pa.current_price <= pa.target_price THEN TRUE ELSE FALSE END
    END as should_trigger
FROM price_alerts pa
WHERE pa.is_active = TRUE 
  AND pa.is_triggered = FALSE
  AND (pa.expires_at IS NULL OR pa.expires_at > NOW());

-- =====================================================
-- 6. Комментарии к таблицам
-- =====================================================

COMMENT ON TABLE notifications IS 'Таблица уведомлений пользователей (цены, новости, рекомендации)';
COMMENT ON TABLE price_alerts IS 'Таблица мониторинга целевых цен для активов';
COMMENT ON TABLE notification_preferences IS 'Настройки уведомлений пользователей';

COMMENT ON COLUMN notifications.type IS 'Тип уведомления: price_alert, portfolio, news, system, recommendation';
COMMENT ON COLUMN notifications.priority IS 'Приоритет: low, normal, high, urgent';
COMMENT ON COLUMN notifications.data IS 'Дополнительные данные в формате JSON';

COMMENT ON COLUMN price_alerts.direction IS 'Направление срабатывания: above (выше), below (ниже)';
COMMENT ON COLUMN price_alerts.is_triggered IS 'Флаг срабатывания алерта';

-- =====================================================
-- 7. Начальные данные (опционально)
-- =====================================================

-- Можно добавить примеры уведомлений или настроек

-- =====================================================
-- Готово!
-- =====================================================
-- После выполнения этих миграций у вас будет:
-- ✅ Полная система уведомлений
-- ✅ Мониторинг целевых цен
-- ✅ Настройки уведомлений для каждого пользователя
-- ✅ RLS политики безопасности
-- ✅ Автоматические триггеры и функции
-- ✅ Представления для удобного доступа

-- Для проверки выполните:
SELECT 'notifications table' as table_name, COUNT(*) as rows FROM notifications
UNION ALL
SELECT 'price_alerts table', COUNT(*) FROM price_alerts
UNION ALL
SELECT 'notification_preferences table', COUNT(*) FROM notification_preferences;
