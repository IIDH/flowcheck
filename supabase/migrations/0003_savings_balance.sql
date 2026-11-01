-- Flowcheck — saldo inicial y saldo acumulado de cuentas de ahorro
-- Ejecutar en Supabase → SQL Editor después de 0002

-- Lo que ya tenías ahorrado en la cuenta antes de usar la app
alter table public.accounts add column if not exists opening_balance numeric(14,2) not null default 0 check (opening_balance >= 0);

-- Saldo acumulado = saldo inicial + todos los aportes registrados (todos los meses)
create or replace view public.account_balances
with (security_invoker = true) as
select
  a.id               as account_id,
  a.user_id,
  a.name,
  a.kind,
  a.color,
  a.archived,
  a.opening_balance,
  coalesce(sum(t.amount), 0)                     as contributed,
  a.opening_balance + coalesce(sum(t.amount), 0) as balance
from public.accounts a
left join public.transactions t on t.account_id = a.id
where a.kind = 'ahorro'
group by a.id;

grant select on public.account_balances to authenticated;
