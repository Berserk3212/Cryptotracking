-- ============================================================
-- ADMIN FIX SQL — запустить вместо admin_setup.sql
-- Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

-- ─── 1. Добавляем колонки в profiles ──────────────────────
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

-- ─── 2. Вспомогательная функция (SECURITY DEFINER) ─────────
-- Нужна чтобы избежать RLS infinite recursion
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ─── 3. RLS для profiles (без рекурсии) ────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile"     ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles"   ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles"     ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile"   ON public.profiles;

-- Каждый видит свой профиль
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Администратор видит все профили (через SECURITY DEFINER — без рекурсии)
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin());

-- Пользователь обновляет свой профиль
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Администратор может обновлять любой профиль
CREATE POLICY "Admins can update profiles"
  ON public.profiles FOR UPDATE
  USING (public.is_admin());

-- ─── 4. activity_logs ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  action text NOT NULL,
  section text,
  details jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_logs_user_id_idx   ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS activity_logs_action_idx    ON public.activity_logs(action);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own logs" ON public.activity_logs;
CREATE POLICY "Users can insert own logs"
  ON public.activity_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can read all logs" ON public.activity_logs;
CREATE POLICY "Admins can read all logs"
  ON public.activity_logs FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert logs" ON public.activity_logs;
CREATE POLICY "Admins can insert logs"
  ON public.activity_logs FOR INSERT
  WITH CHECK (public.is_admin());

-- ─── 5. system_settings (value text + value_type text) ──────
CREATE TABLE IF NOT EXISTS public.system_settings (
  key         text PRIMARY KEY,
  value       text NOT NULL DEFAULT '',
  value_type  text NOT NULL DEFAULT 'string'
                CHECK (value_type IN ('string','number','boolean','json')),
  description text,
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  timestamptz DEFAULT now()
);

-- Дефолтные настройки
INSERT INTO public.system_settings (key, value, value_type, description) VALUES
  ('data_refresh_interval',    '60',                                         'number',  'Интервал обновления рыночных данных (сек)'),
  ('news_refresh_interval',    '15',                                         'number',  'Интервал обновления новостей (мин)'),
  ('api_rate_limit',           '30',                                         'number',  'Лимит запросов в минуту'),
  ('max_portfolios_per_user',  '10',                                         'number',  'Макс. портфелей на пользователя'),
  ('maintenance_mode',         'false',                                      'boolean', 'Режим обслуживания'),
  ('registration_enabled',     'true',                                       'boolean', 'Разрешена регистрация'),
  ('guest_mode_enabled',       'true',                                       'boolean', 'Разрешён гостевой вход'),
  ('maintenance_message',      'Ведутся технические работы...',              'string',  'Сообщение при обслуживании'),
  ('notification_thresholds',  '{"price_change":5,"volume_spike":200}',      'json',    'Пороги уведомлений')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read settings" ON public.system_settings;
CREATE POLICY "Authenticated can read settings"
  ON public.system_settings FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can write settings" ON public.system_settings;
CREATE POLICY "Admins can write settings"
  ON public.system_settings FOR ALL
  USING (public.is_admin());

-- ─── 6. system_events ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.system_events (
  id          bigserial PRIMARY KEY,
  level       text NOT NULL CHECK (level IN ('info','warning','error','critical')),
  source      text NOT NULL,
  message     text NOT NULL,
  details     jsonb DEFAULT '{}'::jsonb,
  resolved    boolean NOT NULL DEFAULT false,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS system_events_level_idx      ON public.system_events(level);
CREATE INDEX IF NOT EXISTS system_events_created_at_idx ON public.system_events(created_at DESC);
CREATE INDEX IF NOT EXISTS system_events_resolved_idx   ON public.system_events(resolved);

ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage system events" ON public.system_events;
CREATE POLICY "Admins manage system events"
  ON public.system_events FOR ALL
  USING (public.is_admin());

-- ─── 7. Триггер updated_at ───────────────────────────────────
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

-- ─── 8. НАЗНАЧИТЬ СЕБЯ АДМИНИСТРАТОРОМ ──────────────────────
-- ЗАМЕНИТЕ email на свой и выполните:
--
--   UPDATE public.profiles
--   SET role = 'admin'
--   WHERE email = 'ваш@email.com';
--
-- Или по UUID из Authentication → Users:
--
--   UPDATE public.profiles
--   SET role = 'admin'
--   WHERE id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
--
-- После этого зайдите на /frontend/admin/index.html
-- ────────────────────────────────────────────────────────────

-- ─── 9. ИСПРАВЛЕНИЕ system_settings (value_type) ─────────────
-- Если таблица уже существует с типом value=jsonb (без value_type),
-- добавляем колонку и мигрируем данные.

-- 9.1 Добавляем value_type (для существующих строк ставим 'string' по умолчанию)
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS value_type text NOT NULL DEFAULT 'string'
    CHECK (value_type IN ('string','number','boolean','json'));

-- 9.2 Upsert дефолтных настроек с правильным value_type.
--     Значения хранятся как jsonb-строки (to_jsonb('...'::text)),
--     чтобы admin.js мог читать их как обычные строки через PostgREST.
INSERT INTO public.system_settings (key, value, value_type, description) VALUES
  ('data_refresh_interval',   to_jsonb('60'::text),    'number',  'Интервал обновления рыночных данных (сек)'),
  ('news_refresh_interval',   to_jsonb('15'::text),    'number',  'Интервал обновления новостей (мин)'),
  ('api_rate_limit',          to_jsonb('30'::text),    'number',  'Лимит запросов в минуту'),
  ('max_portfolios_per_user', to_jsonb('10'::text),    'number',  'Макс. портфелей на пользователя'),
  ('maintenance_mode',        to_jsonb('false'::text), 'boolean', 'Режим обслуживания'),
  ('registration_enabled',    to_jsonb('true'::text),  'boolean', 'Разрешена регистрация'),
  ('guest_mode_enabled',      to_jsonb('true'::text),  'boolean', 'Разрешён гостевой вход'),
  ('maintenance_message',     to_jsonb('Ведутся технические работы...'::text), 'string', 'Сообщение при обслуживании'),
  ('notification_thresholds', to_jsonb('{"price_change":5,"volume_spike":200}'::text), 'json', 'Пороги уведомлений'),
  ('price_change_threshold',  to_jsonb('5'::text),     'number',  'Порог изменения цены для уведомлений (%)'),
  ('volume_spike_threshold',  to_jsonb('200'::text),   'number',  'Порог всплеска объёма для уведомлений (%)')
ON CONFLICT (key) DO UPDATE
  SET value_type  = EXCLUDED.value_type,
      description = COALESCE(public.system_settings.description, EXCLUDED.description);

-- 9.3 Обновляем value_type для строк, которые были добавлены без него
UPDATE public.system_settings SET value_type = 'number'
  WHERE key IN ('data_refresh_interval','news_refresh_interval','api_rate_limit',
                'max_portfolios_per_user','price_change_threshold','volume_spike_threshold')
    AND value_type = 'string';

UPDATE public.system_settings SET value_type = 'boolean'
  WHERE key IN ('maintenance_mode','registration_enabled','guest_mode_enabled')
    AND value_type = 'string';

UPDATE public.system_settings SET value_type = 'json'
  WHERE key IN ('notification_thresholds')
    AND value_type = 'string';

-- 9.4 RLS-политики для system_settings (на случай если они не были созданы)
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read settings" ON public.system_settings;
CREATE POLICY "Authenticated can read settings"
  ON public.system_settings FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can write settings" ON public.system_settings;
CREATE POLICY "Admins can write settings"
  ON public.system_settings FOR ALL
  USING (public.is_admin());
-- ────────────────────────────────────────────────────────────

-- ─── 10. ДОПОЛНИТЕЛЬНЫЕ ИСПРАВЛЕНИЯ ───────────────────────────

-- 10.1 INSERT-политика для profiles (нужна для регистрации новых пользователей).
--      Без неё новые профили не смогут создаваться при регистрации.
DROP POLICY IF EXISTS "profiles_insert_own"          ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- 10.2 Hard-reset значений system_settings до валидных дефолтов.
--      Исправляет случай, когда старый saveSettings сохранил пустые
--      строки или "NaN" в поле value (из-за бага в UI до этого фикса).
UPDATE public.system_settings SET value = to_jsonb('60'::text)
  WHERE key = 'data_refresh_interval'   AND value::text IN ('""', '"NaN"', '"nan"', 'null', '""');
UPDATE public.system_settings SET value = to_jsonb('15'::text)
  WHERE key = 'news_refresh_interval'   AND value::text IN ('""', '"NaN"', '"nan"', 'null');
UPDATE public.system_settings SET value = to_jsonb('30'::text)
  WHERE key = 'api_rate_limit'          AND value::text IN ('""', '"NaN"', '"nan"', 'null');
UPDATE public.system_settings SET value = to_jsonb('10'::text)
  WHERE key = 'max_portfolios_per_user' AND value::text IN ('""', '"NaN"', '"nan"', 'null');
UPDATE public.system_settings SET value = to_jsonb('5'::text)
  WHERE key = 'price_change_threshold'  AND value::text IN ('""', '"NaN"', '"nan"', 'null');
UPDATE public.system_settings SET value = to_jsonb('200'::text)
  WHERE key = 'volume_spike_threshold'  AND value::text IN ('""', '"NaN"', '"nan"', 'null');
UPDATE public.system_settings SET value = to_jsonb('{"price_change":5,"volume_spike":200}'::text)
  WHERE key = 'notification_thresholds' AND (
    value::text IN ('""', '"NaN"', 'null')
    OR value::text LIKE '%null%'
  );

-- 10.3 ПОЛНЫЙ СБРОС всех настроек до дефолтов — раскомментируйте если нужно:
-- INSERT INTO public.system_settings (key, value, value_type, description) VALUES
--   ('data_refresh_interval',   to_jsonb('60'::text),    'number',  'Интервал обновления данных (сек)'),
--   ('news_refresh_interval',   to_jsonb('15'::text),    'number',  'Интервал новостей (мин)'),
--   ('api_rate_limit',          to_jsonb('30'::text),    'number',  'Лимит запросов/мин'),
--   ('max_portfolios_per_user', to_jsonb('10'::text),    'number',  'Макс. портфелей на пользователя'),
--   ('maintenance_mode',        to_jsonb('false'::text), 'boolean', 'Режим обслуживания'),
--   ('registration_enabled',    to_jsonb('true'::text),  'boolean', 'Разрешена регистрация'),
--   ('guest_mode_enabled',      to_jsonb('true'::text),  'boolean', 'Разрешён гостевой вход'),
--   ('maintenance_message',     to_jsonb('Ведутся технические работы...'::text), 'string', 'Сообщение'),
--   ('notification_thresholds', to_jsonb('{"price_change":5,"volume_spike":200}'::text), 'json', 'Пороги уведомлений'),
--   ('price_change_threshold',  to_jsonb('5'::text),     'number',  'Порог изменения цены (%)'),
--   ('volume_spike_threshold',  to_jsonb('200'::text),   'number',  'Порог всплеска объёма (%)')
-- ON CONFLICT (key) DO UPDATE
--   SET value = EXCLUDED.value, value_type = EXCLUDED.value_type;

-- 10.4 Диагностика: проверьте результаты в SQL Editor после запуска
SELECT key, value_type, value::text FROM public.system_settings ORDER BY key;
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'profiles' ORDER BY policyname;
-- ────────────────────────────────────────────────────────────

