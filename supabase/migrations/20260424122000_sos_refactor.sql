-- Adiciona campos novos na tabela sos_alerts
ALTER TABLE sos_alerts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE sos_alerts ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE sos_alerts ADD COLUMN IF NOT EXISTS resolution_note TEXT;
ALTER TABLE sos_alerts ADD COLUMN IF NOT EXISTS whatsapp_contact_id UUID REFERENCES emergency_contacts(id);

-- Valores possíveis de status: 'active', 'false_alarm', 'resolved'

-- Tabela de tokens de push (pra cada amiga receber alertas)
CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  expo_push_token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own push tokens" ON push_tokens;
CREATE POLICY "Users can manage own push tokens" ON push_tokens
  FOR ALL USING (auth.uid() = user_id);
