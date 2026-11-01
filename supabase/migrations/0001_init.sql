-- Flowcheck — esquema inicial
-- Ejecutar en Supabase → SQL Editor (o `supabase db push` con la CLI).
--
-- Modelo:
--   accounts      Cuentas/categorías del usuario (Arriendo, Luz, Supermercado, Ahorro…)
--                 kind: fijo | variable | ahorro | ingreso
--   months        Un registro por mes con la renta (ingreso base) del mes
--   budget_items  La "imagen" del mes: monto planificado por cuenta
--   transactions  Lo que realmente se va gastando / ahorrando / ingresando

create extension if not exists pgcrypto;

do $$ begin
  create type public.account_kind as enum ('fijo', 'variable', 'ahorro', 'ingreso');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  full_name   text,
  currency    text not null default 'CLP',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- accounts
create table if not exists public.accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users on delete cascade,
  name            text not null check (length(trim(name)) between 1 and 60),
  kind            public.account_kind not null,
  default_amount  numeric(14,2) not null default 0 check (default_amount >= 0),
  color           text not null default '#2a78d6',
  archived        boolean not null default false,
  sort            int not null default 0,
  created_at      timestamptz not null default now(),
  unique (user_id, name)
);
create index if not exists accounts_user_idx on public.accounts (user_id);

-- ---------------------------------------------------------------- months
create table if not exists public.months (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  year        int not null check (year between 2000 and 2100),
  month       int not null check (month between 1 and 12),
  income      numeric(14,2) not null default 0 check (income >= 0),
  closed      boolean not null default false,
  notes       text,
  created_at  timestamptz not null default now(),
  unique (user_id, year, month)
);
create index if not exists months_user_period_idx on public.months (user_id, year desc, month desc);

-- ---------------------------------------------------------------- budget_items
create table if not exists public.budget_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  month_id    uuid not null references public.months on delete cascade,
  account_id  uuid not null references public.accounts on delete cascade,
  planned     numeric(14,2) not null default 0 check (planned >= 0),
  unique (month_id, account_id)
);
create index if not exists budget_items_account_idx on public.budget_items (account_id);

-- ---------------------------------------------------------------- transactions
create table if not exists public.transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  month_id     uuid not null references public.months on delete cascade,
  account_id   uuid not null references public.accounts on delete restrict,
  amount       numeric(14,2) not null check (amount > 0),
  occurred_on  date not null default current_date,
  description  text check (description is null or length(description) <= 140),
  created_at   timestamptz not null default now()
);
create index if not exists transactions_month_idx on public.transactions (month_id);
create index if not exists transactions_account_idx on public.transactions (account_id);

-- ---------------------------------------------------------------- vista resumen plan vs real
create or replace view public.month_account_summary
with (security_invoker = true) as
select
  m.id          as month_id,
  m.user_id,
  m.year,
  m.month,
  a.id          as account_id,
  a.name,
  a.kind,
  a.color,
  a.sort,
  coalesce(b.planned, 0)  as planned,
  coalesce(t.actual, 0)   as actual,
  (b.id is not null)      as in_plan
from public.months m
join public.accounts a on a.user_id = m.user_id
left join public.budget_items b on b.month_id = m.id and b.account_id = a.id
left join (
  select month_id, account_id, sum(amount) as actual
  from public.transactions
  group by month_id, account_id
) t on t.month_id = m.id and t.account_id = a.id
where b.id is not null or t.actual is not null;

-- ---------------------------------------------------------------- mes cerrado = solo lectura
create or replace function public.guard_closed_month()
returns trigger language plpgsql as $$
declare
  v_month uuid := coalesce(new.month_id, old.month_id);
begin
  if exists (select 1 from public.months where id = v_month and closed) then
    raise exception 'El mes está cerrado. Reábrelo para modificarlo.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists budget_items_closed_guard on public.budget_items;
create trigger budget_items_closed_guard
  before insert or update or delete on public.budget_items
  for each row execute function public.guard_closed_month();

drop trigger if exists transactions_closed_guard on public.transactions;
create trigger transactions_closed_guard
  before insert or update or delete on public.transactions
  for each row execute function public.guard_closed_month();

-- ---------------------------------------------------------------- perfil automático
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- RLS
alter table public.profiles     enable row level security;
alter table public.accounts     enable row level security;
alter table public.months       enable row level security;
alter table public.budget_items enable row level security;
alter table public.transactions enable row level security;

drop policy if exists "profiles_own" on public.profiles;
create policy "profiles_own" on public.profiles
  for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "accounts_own" on public.accounts;
create policy "accounts_own" on public.accounts
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "months_own" on public.months;
create policy "months_own" on public.months
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "budget_items_own" on public.budget_items;
create policy "budget_items_own" on public.budget_items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.months m where m.id = month_id and m.user_id = (select auth.uid()))
    and exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid()))
  );

drop policy if exists "transactions_own" on public.transactions;
create policy "transactions_own" on public.transactions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.months m where m.id = month_id and m.user_id = (select auth.uid()))
    and exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid()))
  );

grant select, insert, update          on public.profiles     to authenticated;
grant select, insert, update, delete  on public.accounts     to authenticated;
grant select, insert, update, delete  on public.months       to authenticated;
grant select, insert, update, delete  on public.budget_items to authenticated;
grant select, insert, update, delete  on public.transactions to authenticated;
grant select                          on public.month_account_summary to authenticated;
