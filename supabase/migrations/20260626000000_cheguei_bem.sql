-- Feature "Cheguei bem": avisar contato principal se a usuária não chegar em casa na janela definida.
-- Adiciona colunas em safety_sessions (estado da janela de chegada) e safe_places (locais temporarios).
-- Idempotente: pode rodar mais de uma vez sem erro.

-- 1. safety_sessions: estado da janela de chegada
alter table public.safety_sessions
  add column if not exists arrival_enabled boolean not null default false,
  add column if not exists arrival_window_start timestamptz,
  add column if not exists arrival_window_end timestamptz,
  add column if not exists arrival_home_place_id uuid references public.safe_places(id) on delete set null,
  add column if not exists arrival_grace_minutes integer not null default 15,
  add column if not exists arrival_asked_at timestamptz,
  add column if not exists arrival_confirmed boolean not null default false,
  add column if not exists arrival_contact_notified_at timestamptz;

-- 2. safe_places: marcar pontos criados so para uma sessao (nao poluir a lista da usuaria)
alter table public.safe_places
  add column if not exists is_temporary boolean not null default false;

-- 3. Indice para o vigia (Fase 3) achar rapido sessoes com janela ativa e ainda nao resolvidas
create index if not exists idx_safety_sessions_arrival_pending
  on public.safety_sessions (arrival_window_end)
  where arrival_enabled = true and arrival_confirmed = false and arrival_contact_notified_at is null and ended_at is null;
