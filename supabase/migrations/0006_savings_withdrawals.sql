-- Flowcheck — retiros de ahorro con motivo (historial)
-- Ejecutar en Supabase → SQL Editor después de 0005

-- Tipo de movimiento: normal (gasto/aporte/ingreso) o retiro (sale plata de un ahorro)
alter table public.transactions add column if not exists kind text not null default 'normal'
  check (kind in ('normal', 'retiro'));

-- Un retiro solo puede salir de una cuenta de ahorro y siempre lleva motivo
create or replace function public.guard_withdrawal()
returns trigger language plpgsql as $$
begin
  if new.kind = 'retiro' then
    if not exists (select 1 from public.accounts where id = new.account_id and kind = 'ahorro') then
      raise exception 'Los retiros solo pueden hacerse desde una cuenta de ahorro' using errcode = 'P0001';
    end if;
    if coalesce(length(trim(new.description)), 0) < 3 then
      raise exception 'Indica el motivo del retiro' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists transactions_withdrawal_guard on public.transactions;
create trigger transactions_withdrawal_guard
  before insert or update on public.transactions
  for each row execute function public.guard_withdrawal();

-- Resumen plan vs real: "actual" son aportes/gastos; "withdrawn" lo retirado (columna al final)
create or replace view public.month_account_summary
with (security_invoker = true) as
select
  m.id as month_id, m.user_id, m.year, m.month,
  a.id as account_id, a.name, a.kind, a.color, a.sort,
  coalesce(b.planned, 0) as planned,
  coalesce(t.actual, 0)  as actual,
  (b.id is not null)     as in_plan,
  a.is_free,
  coalesce(t.withdrawn, 0) as withdrawn
from public.months m
join public.accounts a on a.user_id = m.user_id
left join public.budget_items b on b.month_id = m.id and b.account_id = a.id
left join (
  select month_id, account_id,
         sum(amount) filter (where kind = 'normal') as actual,
         sum(amount) filter (where kind = 'retiro') as withdrawn
  from public.transactions
  group by month_id, account_id
) t on t.month_id = m.id and t.account_id = a.id
where b.id is not null or t.month_id is not null;

-- Saldo de ahorros: inicial + aportes − retiros
create or replace view public.account_balances
with (security_invoker = true) as
select
  a.id as account_id, a.user_id, a.name, a.kind, a.color, a.archived, a.opening_balance,
  coalesce(sum(t.amount) filter (where t.kind = 'normal'), 0) as contributed,
  a.opening_balance
    + coalesce(sum(t.amount) filter (where t.kind = 'normal'), 0)
    - coalesce(sum(t.amount) filter (where t.kind = 'retiro'), 0) as balance,
  coalesce(sum(t.amount) filter (where t.kind = 'retiro'), 0) as withdrawn
from public.accounts a
left join public.transactions t on t.account_id = a.id
where a.kind = 'ahorro'
group by a.id;
