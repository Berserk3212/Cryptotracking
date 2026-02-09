-- Миграции для базы данных Supabase
-- Выполните эти запросы в SQL Editor вашего проекта Supabase

-- =====================================================
-- 1. Добавление колонки updated_at в таблицу profiles
-- =====================================================

-- Проверяем, существует ли колонка updated_at
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name = 'updated_at'
    ) THEN
        -- Добавляем колонку updated_at
        ALTER TABLE profiles 
        ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        
        -- Обновляем существующие записи
        UPDATE profiles 
        SET updated_at = created_at 
        WHERE updated_at IS NULL AND created_at IS NOT NULL;
        
        UPDATE profiles 
        SET updated_at = NOW() 
        WHERE updated_at IS NULL;
    END IF;
END $$;

-- =====================================================
-- 2. Создание триггера для автоматического обновления updated_at
-- =====================================================

-- Создаем функцию для обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Удаляем старый триггер если существует
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;

-- Создаем триггер
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 3. Убедимся что created_at существует
-- =====================================================

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE profiles 
        ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
        
        UPDATE profiles 
        SET created_at = NOW() 
        WHERE created_at IS NULL;
    END IF;
END $$;

-- =====================================================
-- 4. Создание индексов для производительности
-- =====================================================

-- Индекс для быстрого поиска по user_id
CREATE INDEX IF NOT EXISTS idx_profiles_id ON profiles(id);

-- Индекс для поиска по email
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- =====================================================
-- 5. Проверка структуры таблицы profiles
-- =====================================================

-- Выполните этот запрос чтобы увидеть текущую структуру таблицы
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM 
    information_schema.columns
WHERE 
    table_name = 'profiles'
ORDER BY 
    ordinal_position;

-- =====================================================
-- 6. НАСТРОЙКА ROW LEVEL SECURITY (RLS) ПОЛИТИК
-- =====================================================

-- Включаем RLS для таблицы profiles (если еще не включен)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Удаляем старые политики если существуют
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON profiles;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON profiles;
DROP POLICY IF EXISTS "Enable update for users based on id" ON profiles;

-- Политика для чтения (SELECT) - пользователь может читать только свой профиль
CREATE POLICY "Users can view their own profile"
ON profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Политика для вставки (INSERT) - пользователь может создать только свой профиль
CREATE POLICY "Users can insert their own profile"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Политика для обновления (UPDATE) - пользователь может обновлять только свой профиль
CREATE POLICY "Users can update their own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Политика для удаления (DELETE) - опционально, если нужно
-- DROP POLICY IF EXISTS "Users can delete their own profile" ON profiles;
-- CREATE POLICY "Users can delete their own profile"
-- ON profiles FOR DELETE
-- TO authenticated
-- USING (auth.uid() = id);

-- =====================================================
-- 7. ПРОВЕРКА ПОЛИТИК
-- =====================================================

-- Посмотреть все политики для таблицы profiles
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM 
    pg_policies
WHERE 
    tablename = 'profiles';

-- =====================================================
-- Готово!
-- =====================================================
-- После выполнения этих миграций:
-- ✅ Колонка updated_at будет автоматически обновляться при изменении профиля
-- ✅ Все записи будут иметь корректные временные метки
-- ✅ Индексы ускорят запросы к базе данных
