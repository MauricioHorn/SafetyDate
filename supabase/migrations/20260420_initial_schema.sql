-- SafetyDate - Schema do banco de dados
-- Rodar no SQL Editor do Supabase

-- ============================================
-- TABELA: profiles (estende auth.users)
-- ============================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  plan text not null default 'free' check (plan in ('free', 'annual')),
  plan_expires_at timestamptz,
  searches_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger: cria profile automaticamente quando user se cadastra
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- TABELA: background_checks
-- ============================================
create table if not exists public.background_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_name text not null,
  target_cpf text,
  target_birth_date text,
  target_phone text,
  flag text not null check (flag in ('green', 'yellow', 'red')),
  summary text not null,
  processes_count integer not null default 0,
  criminal_processes_count integer not null default 0,
  raw_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_background_checks_user
  on public.background_checks(user_id, created_at desc);

-- ============================================
-- TABELA: payments (histórico de transações)
-- O RevenueCat é fonte da verdade; esta tabela é só para histórico/relatórios
-- ============================================
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id text unique,           -- ID da transação (Apple/Google via RevenueCat)
  plan text not null check (plan in ('single', 'annual')),
  amount numeric(10,2) not null,
  status text not null default 'approved'
    check (status in ('pending', 'approved', 'refunded')),
  raw_event jsonb,                       -- payload original do webhook RevenueCat
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payments_user on public.payments(user_id);
create index if not exists idx_payments_transaction on public.payments(transaction_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
alter table public.profiles enable row level security;
alter table public.background_checks enable row level security;
alter table public.payments enable row level security;

-- Profiles: usuário só vê e edita o próprio
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Background checks: usuário só vê os próprios
drop policy if exists "checks_select_own" on public.background_checks;
create policy "checks_select_own" on public.background_checks
  for select using (auth.uid() = user_id);

-- Inserção só via edge function (service_role)
drop policy if exists "checks_insert_service" on public.background_checks;
create policy "checks_insert_service" on public.background_checks
  for insert with check (auth.uid() = user_id);

-- Payments: usuário só vê os próprios
drop policy if exists "payments_select_own" on public.payments;
create policy "payments_select_own" on public.payments
  for select using (auth.uid() = user_id);
