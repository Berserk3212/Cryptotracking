-- БЫСТРОЕ ИСПРАВЛЕНИЕ RLS ДЛЯ ТАБЛИЦЫ PROFILES
-- Выполните эти запросы в Supabase SQL Editor

-- ============================================
-- ШАГ 1: Включаем RLS
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ============================================
-- ШАГ 2: Удаляем старые политики (если есть)
-- ============================================
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON profiles;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON profiles;
DROP POLICY IF EXISTS "Enable update for users based on id" ON profiles;

-- ============================================
-- ШАГ 3: Создаем новые политики
-- ============================================

-- Политика SELECT: Пользователи могут читать только свой профиль
CREATE POLICY "Users can view their own profile"
ON profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Политика INSERT: Пользователи могут создавать только свой профиль
CREATE POLICY "Users can insert their own profile"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Политика UPDATE: Пользователи могут обновлять только свой профиль
CREATE POLICY "Users can update their own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- ============================================
-- ГОТОВО! Теперь профиль должен сохраняться
-- ============================================

-- Для проверки выполните:
SELECT * FROM pg_policies WHERE tablename = 'profiles';
