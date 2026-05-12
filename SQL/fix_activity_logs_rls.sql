-- ============================================================
-- ACTIVITY LOGS — RLS + last_sign_in_at update trigger
-- Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

-- ─── 1. Убедимся что RLS на activity_logs настроена правильно ───────────────
-- Пользователи могут вставлять только свои записи
DROP POLICY IF EXISTS "Users can insert own logs" ON public.activity_logs;
CREATE POLICY "Users can insert own logs"
  ON public.activity_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Администратор читает все логи
DROP POLICY IF EXISTS "Admins can read all logs" ON public.activity_logs;
CREATE POLICY "Admins can read all logs"
  ON public.activity_logs FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Администратор тоже может вставлять логи (системные события)
DROP POLICY IF EXISTS "Admins can insert logs" ON public.activity_logs;
CREATE POLICY "Admins can insert logs"
  ON public.activity_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- ─── 2. Триггер: обновлять last_sign_in_at и sign_in_count при логине ───────
-- Supabase не обновляет profiles при входе автоматически.
-- Этот триггер срабатывает при изменении last_sign_in_at в auth.users.
CREATE OR REPLACE FUNCTION public.handle_user_login()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Обновляем только если last_sign_in_at изменился
  IF NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at THEN
    UPDATE public.profiles
    SET
      last_sign_in_at = NEW.last_sign_in_at,
      sign_in_count   = COALESCE(sign_in_count, 0) + 1,
      updated_at      = now()
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_login ON auth.users;
CREATE TRIGGER on_auth_user_login
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_login();

-- ─── 3. Проверка ─────────────────────────────────────────────────────────────
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'activity_logs' ORDER BY policyname;
