-- Создание таблицы для расширенных данных избранного
CREATE TABLE IF NOT EXISTS favorites_enhanced (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    symbol VARCHAR(20) NOT NULL,
    note TEXT,
    target_price DECIMAL(20, 8),
    target_direction VARCHAR(10) CHECK (target_direction IN ('above', 'below')),
    categories TEXT[], -- Массив категорий
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, symbol)
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_favorites_enhanced_user_id ON favorites_enhanced(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_enhanced_symbol ON favorites_enhanced(symbol);
CREATE INDEX IF NOT EXISTS idx_favorites_enhanced_categories ON favorites_enhanced USING GIN(categories);

-- RLS (Row Level Security)
ALTER TABLE favorites_enhanced ENABLE ROW LEVEL SECURITY;

-- Политики доступа
CREATE POLICY "Users can view their own favorites_enhanced"
    ON favorites_enhanced FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own favorites_enhanced"
    ON favorites_enhanced FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own favorites_enhanced"
    ON favorites_enhanced FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own favorites_enhanced"
    ON favorites_enhanced FOR DELETE
    USING (auth.uid() = user_id);

-- Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_favorites_enhanced_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер для автоматического обновления updated_at
CREATE TRIGGER update_favorites_enhanced_updated_at_trigger
    BEFORE UPDATE ON favorites_enhanced
    FOR EACH ROW
    EXECUTE FUNCTION update_favorites_enhanced_updated_at();

-- Комментарии к таблице и столбцам
COMMENT ON TABLE favorites_enhanced IS 'Расширенные данные для избранных активов (заметки, целевые цены, категории)';
COMMENT ON COLUMN favorites_enhanced.note IS 'Персональная заметка пользователя об активе';
COMMENT ON COLUMN favorites_enhanced.target_price IS 'Целевая цена для уведомлений';
COMMENT ON COLUMN favorites_enhanced.target_direction IS 'Направление достижения целевой цены (above/below)';
COMMENT ON COLUMN favorites_enhanced.categories IS 'Массив категорий актива (DeFi, NFT, AI и т.д.)';
