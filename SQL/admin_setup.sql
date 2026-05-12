-- ============================================================
-- ADMIN PANEL SETUP SQL
-- Выполнить в Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Добавляем поле role в таблицу profiles
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

-- 2. Таблица логов действий пользователей
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  action text NOT NULL,          -- 'login', 'logout', 'add_transaction', 'create_portfolio', etc.
  section text,                   -- раздел приложения
  details jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_logs_user_id_idx ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS activity_logs_action_idx ON public.activity_logs(action);

-- 3. Таблица глобальных настроек системы
CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now()
);

-- Вставляем дефолтные настройки
INSERT INTO public.system_settings (key, value, description) VALUES
  ('data_refresh_interval',  '{"seconds": 60}',                    'Интервал обновления рыночных данных (секунды)'),
  ('notification_thresholds', '{"price_change_pct": 5, "volume_spike_pct": 200}', 'Пороги для уведомлений'),
  ('max_portfolios_per_user', '{"count": 10}',                      'Максимальное количество портфелей на пользователя'),
  ('maintenance_mode',        '{"enabled": false, "message": ""}',  'Режим обслуживания'),
  ('registration_enabled',    '{"enabled": true}',                  'Разрешена ли регистрация новых пользователей'),
  ('guest_mode_enabled',      '{"enabled": true}',                  'Разрешён ли гостевой вход'),
  ('api_rate_limit',          '{"requests_per_minute": 30}',        'Ограничение запросов к внешним API'),
  ('news_refresh_interval',   '{"minutes": 15}',                    'Интервал обновления новостей (минуты)')
ON CONFLICT (key) DO NOTHING;

-- 4. Таблица системных событий (ошибки, предупреждения)
CREATE TABLE IF NOT EXISTS public.system_events (
  id bigserial PRIMARY KEY,
  level text NOT NULL CHECK (level IN ('info', 'warning', 'error', 'critical')),
  source text NOT NULL,          -- 'api', 'auth', 'database', 'cron', etc.
  message text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  resolved boolean NOT NULL DEFAULT false,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS system_events_level_idx ON public.system_events(level);
CREATE INDEX IF NOT EXISTS system_events_created_at_idx ON public.system_events(created_at DESC);
CREATE INDEX IF NOT EXISTS system_events_resolved_idx ON public.system_events(resolved);

-- 5. RLS политики

-- profiles: администратор может читать всех
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Пользователь видит только свой профиль
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Администратор видит все профили
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Администратор может обновлять профили пользователей
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
CREATE POLICY "Admins can update profiles"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- activity_logs: только администраторы читают все логи, пользователи пишут свои
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own logs" ON public.activity_logs;
CREATE POLICY "Users can insert own logs"
  ON public.activity_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can read all logs" ON public.activity_logs;
CREATE POLICY "Admins can read all logs"
  ON public.activity_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- system_settings: читать могут все авторизованные, писать — только admin
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read settings" ON public.system_settings;
CREATE POLICY "Authenticated can read settings"
  ON public.system_settings FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can update settings" ON public.system_settings;
CREATE POLICY "Admins can update settings"
  ON public.system_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- system_events: только администраторы
ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage system events" ON public.system_events;
CREATE POLICY "Admins manage system events"
  ON public.system_events FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- 6. Триггер для автоматического обновления updated_at в profiles
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. Назначить первого пользователя администратором (замени EMAIL на свой)
-- UPDATE public.profiles SET role = 'admin' WHERE email = 'your@email.com';

-- 8. Проверить результат
SELECT id, email, role, is_blocked, created_at FROM public.profiles ORDER BY created_at LIMIT 10;
