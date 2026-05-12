-- ============================================================
-- ПОЛНОЕ ИСПРАВЛЕНИЕ RLS PROFILES — infinite recursion fix
-- Supabase Dashboard → SQL Editor → New Query → Run ALL
-- ============================================================

-- ─── ШАГ 1: Удаляем ВСЕ существующие политики на profiles ──
-- (включая рекурсивные, созданные admin_setup.sql)
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'profiles' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
  END LOOP;
END $$;

-- ─── ШАГ 2: SECURITY DEFINER функция (без рекурсии) ────────
-- Функция выполняется с правами владельца, минует RLS → не рекурсирует
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ─── ШАГ 3: RLS включён ─────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ─── ШАГ 4: Новые политики (корректные) ────────────────────

-- Каждый видит и редактирует только свой профиль
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Администратор видит все профили (через is_admin() — без рекурсии)
CREATE POLICY "profiles_select_admin"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Администратор обновляет любой профиль
CREATE POLICY "profiles_update_admin"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- ─── ШАГ 5: Добавляем колонки если их нет ──────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user'
    CHECK (role IN ('user', 'admin', 'moderator')),
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_reason text,
  ADD COLUMN IF NOT EXISTS last_sign_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS sign_in_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ─── ШАГ 6: Проверка ────────────────────────────────────────
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'profiles' AND schemaname = 'public'
ORDER BY policyname;

-- ─── ШАГ 7: Назначить себя администратором ──────────────────
-- РАСКОММЕНТИРУЙТЕ и замените email:
--
-- UPDATE public.profiles
-- SET role = 'admin'
-- WHERE email = 'ваш@email.com';
