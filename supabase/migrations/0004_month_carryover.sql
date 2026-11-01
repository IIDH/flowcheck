-- Flowcheck — arrastre del sobrante/déficit al mes siguiente
-- Ejecutar en Supabase → SQL Editor después de 0003

-- Lo que el mes deja para el siguiente al cerrarse (puede ser negativo = déficit).
-- El mes siguiente lo lee como "Del mes anterior".
alter table public.months add column if not exists carry_out numeric(14,2) not null default 0;
