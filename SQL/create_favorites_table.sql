-- Создать таблицу favorites для хранения избранных активов пользователей
-- Поля:
-- id (uuid primary key), user_id (uuid) -> auth.users.id, symbol (text), metadata (jsonb), created_at (timestamptz)

CREATE TABLE IF NOT EXISTS public.favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS favorites_user_id_idx ON public.favorites(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS favorites_user_symbol_unique ON public.favorites(user_id, symbol);
