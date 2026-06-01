-- =========================================================
-- Cofre Pessoal: schema inicial
-- =========================================================

-- Tabela vault_metadata: 1 linha por usuária. Guarda:
-- - salt único pra derivação PBKDF2
-- - hash da senha (separado do salt de derivação, pra verificar sem decifrar)
-- - bytes_used: tamanho total atual em bytes (limite 1GB = 1073741824)
-- - created_at, last_unlocked_at: pra estatísticas
CREATE TABLE public.vault_metadata (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  password_salt text NOT NULL,
  encryption_salt text NOT NULL,
  bytes_used bigint NOT NULL DEFAULT 0 CHECK (bytes_used >= 0),
  bytes_limit bigint NOT NULL DEFAULT 1073741824,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_unlocked_at timestamptz,
  reset_count integer NOT NULL DEFAULT 0
);

-- Tabela vault_items: cada arquivo/nota é uma linha.
-- - encrypted_filename: nome original criptografado (pra exibir na lista)
-- - encrypted_metadata: outros metadados criptografados (descrição, mimetype, etc) em JSON serializado e criptografado
-- - storage_path: path no bucket (apenas referência, conteúdo é criptografado lá)
-- - size_bytes: tamanho do arquivo cifrado (pra contabilizar o 1GB)
-- - item_type: 'photo' | 'video' | 'note' | 'document' | 'audio'
-- - iv (vetor de inicialização AES-GCM, único por item)
CREATE TABLE public.vault_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('photo', 'video', 'note', 'document', 'audio')),
  encrypted_filename text NOT NULL,
  encrypted_metadata text,
  storage_path text,
  size_bytes bigint NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  iv text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vault_items_user_id_idx ON public.vault_items(user_id, created_at DESC);
CREATE INDEX vault_items_user_type_idx ON public.vault_items(user_id, item_type, created_at DESC);

-- RLS
ALTER TABLE public.vault_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own vault metadata" ON public.vault_metadata
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own vault metadata" ON public.vault_metadata
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own vault metadata" ON public.vault_metadata
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own vault metadata" ON public.vault_metadata
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can read own vault items" ON public.vault_items
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own vault items" ON public.vault_items
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own vault items" ON public.vault_items
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own vault items" ON public.vault_items
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Storage bucket criado via Supabase Studio manualmente (não dá pra criar via migration SQL puro).
-- Policy do bucket vault-files (a aplicar via Studio depois):
--   - bucket privado (não público)
--   - SELECT/INSERT/UPDATE/DELETE: TO authenticated USING (bucket_id = 'vault-files' AND (storage.foldername(name))[1] = auth.uid()::text)
