-- Flowcheck — deuda de cierre de mes en cuotas
-- Ejecutar en Supabase → SQL Editor después de 0008
--
-- Al cerrar un mes en negativo el usuario elige: descontarlo el mes siguiente,
-- pagarlo en cuotas (se crea un gasto fijo "Crédito <mes>" que aparece solo en
-- los meses de las cuotas) o empezar sin deuda.

-- Cuotas: cuántas y desde qué mes (día 1 del primer mes que se paga)
alter table public.accounts add column if not exists installments integer
  check (installments is null or installments between 1 and 60);
alter table public.accounts add column if not exists installment_start date;
-- Mes cuyo déficit originó la deuda (al reabrir ese mes se deshace)
alter table public.accounts add column if not exists debt_month_id uuid
  references public.months on delete set null;

-- Qué se decidió con el déficit al cerrar (historial)
alter table public.months add column if not exists debt_choice text
  check (debt_choice is null or debt_choice in ('carry', 'installments', 'forgive'));
