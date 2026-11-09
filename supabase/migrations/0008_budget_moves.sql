-- Flowcheck — historial de ajustes de presupuesto entre categorías
-- Ejecutar en Supabase → SQL Editor después de 0007
--
-- Cuando un gasto fijo sale distinto a lo presupuestado, la diferencia se mueve
-- entre categorías (o hacia/desde la plata libre). Esto NO es plata que entra o sale:
-- solo cambia el presupuesto del mes. Esta tabla deja el registro para mostrarlo
-- en Gastos ("Abono por diferencia en Internet", "Gasto por exceso en Luz").

create table if not exists public.budget_moves (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users on delete cascade,
  month_id         uuid not null references public.months on delete cascade,
  -- El gasto que originó el ajuste (si se borra el gasto, la app revierte y borra el ajuste)
  transaction_id   uuid references public.transactions on delete set null,
  -- La cuenta fija que se pasó o salió más barata
  account_id       uuid not null references public.accounts on delete cascade,
  -- De dónde salió / adónde fue la diferencia; null = plata libre
  other_account_id uuid references public.accounts on delete set null,
  reason           text not null check (reason in ('exceso', 'sobrante')),
  amount           numeric(14,2) not null check (amount > 0),
  occurred_on      date not null default current_date,
  created_at       timestamptz not null default now()
);
create index if not exists budget_moves_month_idx on public.budget_moves (month_id);
create index if not exists budget_moves_tx_idx on public.budget_moves (transaction_id);

alter table public.budget_moves enable row level security;

drop policy if exists "budget_moves_own" on public.budget_moves;
create policy "budget_moves_own" on public.budget_moves
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.months m where m.id = month_id and m.user_id = (select auth.uid()))
    and exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid()))
    and (other_account_id is null or exists (select 1 from public.accounts a where a.id = other_account_id and a.user_id = (select auth.uid())))
    and (transaction_id is null or exists (select 1 from public.transactions t where t.id = transaction_id and t.user_id = (select auth.uid())))
  );

revoke all on public.budget_moves from anon;

-- Un mes cerrado no se modifica (misma regla que gastos y presupuesto)
drop trigger if exists budget_moves_closed_guard on public.budget_moves;
create trigger budget_moves_closed_guard
  before insert or update or delete on public.budget_moves
  for each row execute function public.guard_closed_month();
