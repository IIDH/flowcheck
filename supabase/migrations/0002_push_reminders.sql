-- Flowcheck — recordatorios push de gastos fijos por vencer
-- Ejecutar en Supabase → SQL Editor después de 0001_init.sql

-- Día del mes en que vence cada gasto fijo (1–31; si el mes es más corto se usa el último día)
alter table public.accounts add column if not exists due_day int check (due_day between 1 and 31);

-- Preferencias de recordatorio por usuario
alter table public.profiles add column if not exists reminders_enabled boolean not null default true;
alter table public.profiles add column if not exists remind_days_before int not null default 2 check (remind_days_before between 0 and 10);
alter table public.profiles add column if not exists timezone text not null default 'America/Santiago';

-- Suscripciones Web Push (una por dispositivo/navegador)
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  unique (user_id, endpoint)
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists "push_subscriptions_own" on public.push_subscriptions;
create policy "push_subscriptions_own" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- Registro de envíos para no repetir el mismo aviso el mismo día (solo lo usa el cron con service role)
create table if not exists public.reminder_log (
  user_id     uuid not null references auth.users on delete cascade,
  account_id  uuid not null references public.accounts on delete cascade,
  sent_on     date not null,
  primary key (user_id, account_id, sent_on)
);
alter table public.reminder_log enable row level security;
