-- ============================================================
-- FIX MISSING PROFILES
-- Запустите в Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================
-- Проблема: пользователи есть в auth.users, но нет в public.profiles
-- Из-за этого они не видны в админ-панели (запрос идёт к profiles, не к auth.users)
-- ============================================================

-- ─── 1. Создаём профили для всех auth-пользователей без профиля ─────────────
INSERT INTO public.profiles (id, email, full_name, role, is_blocked, created_at, updated_at)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
  'user',
  false,
  u.created_at,
  now()
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = u.id
);

-- Сколько профилей создано — увидите в результате:
SELECT count(*) AS "Создано профилей" FROM (
  SELECT u.id
  FROM auth.users u
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
) sub;

-- ─── 2. Синхронизируем email из auth.users → profiles (если пустой) ─────────
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND (p.email IS NULL OR p.email = '');

-- ─── 3. Триггер: автоматически создавать профиль при регистрации ─────────────
-- Теперь каждый новый пользователь сразу появится в profiles.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, is_blocked, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    'user',
    false,
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;   -- безопасно при повторном запуске
  RETURN NEW;
END;
$$;

-- Удаляем старый триггер (если был) и создаём заново
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ─── 4. Проверяем результат ──────────────────────────────────────────────────
-- После выполнения здесь должны быть все пользователи (включая тех, кто был только в auth.users)
SELECT
  p.id,
  p.email,
  p.full_name,
  p.role,
  p.is_blocked,
  p.created_at
FROM public.profiles p
ORDER BY p.created_at DESC;

-- Сравнение: все auth-пользователи vs наличие профиля
SELECT
  u.email,
  u.created_at                    AS "Регистрация",
  CASE WHEN p.id IS NOT NULL THEN 'Есть' ELSE 'ОТСУТСТВУЕТ' END AS "Профиль"
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
ORDER BY u.created_at DESC;
