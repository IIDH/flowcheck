-- Flowcheck — gastar desde el "saldo libre" (lo sin asignar de la imagen)
-- Ejecutar en Supabase → SQL Editor después de 0004

-- Cuenta de sistema "Saldo libre": una por usuario, la crea la app al primer uso.
-- No tiene monto planificado; lo que se gasta en ella sale de lo sin asignar.
alter table public.accounts add column if not exists is_free boolean not null default false;
create unique index if not exists accounts_one_free_per_user on public.accounts (user_id) where is_free;

-- La vista resumen expone is_free (columna agregada al final)
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
  (b.id is not null)      as in_plan,
  a.is_free
from public.months m
join public.accounts a on a.user_id = m.user_id
left join public.budget_items b on b.month_id = m.id and b.account_id = a.id
left join (
  select month_id, account_id, sum(amount) as actual
  from public.transactions
  group by month_id, account_id
) t on t.month_id = m.id and t.account_id = a.id
where b.id is not null or t.actual is not null;
