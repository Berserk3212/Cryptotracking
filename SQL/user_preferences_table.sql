-- Создание таблицы для хранения пользовательских настроек
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    preference_key TEXT NOT NULL,
    preference_value JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, preference_key)
);

-- Создание индекса для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_key ON user_preferences(preference_key);

-- RLS политики
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Пользователи могут читать только свои настройки
CREATE POLICY "Users can view own preferences" ON user_preferences
    FOR SELECT
    USING (auth.uid() = user_id);

-- Пользователи могут создавать свои настройки
CREATE POLICY "Users can insert own preferences" ON user_preferences
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Пользователи могут обновлять свои настройки
CREATE POLICY "Users can update own preferences" ON user_preferences
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Пользователи могут удалять свои настройки
CREATE POLICY "Users can delete own preferences" ON user_preferences
    FOR DELETE
    USING (auth.uid() = user_id);

-- Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Триггер для автоматического обновления updated_at
CREATE TRIGGER update_user_preferences_updated_at
    BEFORE UPDATE ON user_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
