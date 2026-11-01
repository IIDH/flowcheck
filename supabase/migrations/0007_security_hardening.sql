-- Flowcheck — endurecimiento de seguridad (revisión OWASP, SECURITY_REVIEW.md)
-- Ejecutar en Supabase → SQL Editor después de 0006

-- ============================================================ A2 · SSRF en push
-- Solo se aceptan endpoints HTTPS de los servicios push oficiales.
delete from public.push_subscriptions
where endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com)/';

alter table public.push_subscriptions drop constraint if exists push_endpoint_allowed;
alter table public.push_subscriptions add constraint push_endpoint_allowed check (
  endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com)/'
  and length(endpoint) <= 1000
);

-- ============================================================ B4 · límites de tamaño y cantidad
alter table public.push_subscriptions drop constraint if exists push_sizes;
alter table public.push_subscriptions add constraint push_sizes check (
  length(p256dh) <= 200 and length(auth) <= 100 and (user_agent is null or length(user_agent) <= 300)
);
alter table public.months drop constraint if exists months_notes_len;
alter table public.months add constraint months_notes_len check (notes is null or length(notes) <= 500);

create or replace function public.enforce_row_limits()
returns trigger language plpgsql as $$
begin
  if tg_table_name = 'push_subscriptions'
     and (select count(*) from public.push_subscriptions where user_id = new.user_id) >= 10 then
    raise exception 'Máximo 10 dispositivos con notificaciones' using errcode = 'P0001';
  end if;
  if tg_table_name = 'accounts'
     and (select count(*) from public.accounts where user_id = new.user_id) >= 150 then
    raise exception 'Alcanzaste el máximo de cuentas' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists push_row_limit on public.push_subscriptions;
create trigger push_row_limit before insert on public.push_subscriptions
  for each row execute function public.enforce_row_limits();
drop trigger if exists accounts_row_limit on public.accounts;
create trigger accounts_row_limit before insert on public.accounts
  for each row execute function public.enforce_row_limits();

-- ============================================================ B5 · el rol anónimo no toca datos
revoke all on public.profiles, public.accounts, public.months, public.budget_items,
              public.transactions, public.push_subscriptions, public.reminder_log
  from anon;
revoke all on public.month_account_summary, public.account_balances from anon;

-- ============================================================ A5 · aceptación de términos
alter table public.profiles add column if not exists terms_accepted_at timestamptz;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, terms_accepted_at)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    case when new.raw_user_meta_data ? 'terms_accepted_at' then now() end
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- ============================================================ M4 · registro de auditoría
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users on delete cascade,
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  detail      jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_user_idx on public.audit_log (user_id, created_at desc);
alter table public.audit_log enable row level security;
drop policy if exists "audit_log_read_own" on public.audit_log;
create policy "audit_log_read_own" on public.audit_log
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.audit_log to authenticated;
revoke all on public.audit_log from anon;

create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('app.purge', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'transactions' then
    if tg_op = 'INSERT' and new.kind = 'retiro' then
      insert into public.audit_log (user_id, action, entity, entity_id, detail)
      values (new.user_id, 'retiro', 'transaction', new.id,
              jsonb_build_object('amount', new.amount, 'account_id', new.account_id, 'motivo', new.description, 'fecha', new.occurred_on));
    elsif tg_op = 'DELETE' then
      insert into public.audit_log (user_id, action, entity, entity_id, detail)
      values (old.user_id, 'eliminar', 'transaction', old.id,
              jsonb_build_object('amount', old.amount, 'account_id', old.account_id, 'kind', old.kind, 'fecha', old.occurred_on, 'detalle', old.description));
    end if;

  elsif tg_table_name = 'months' then
    if tg_op = 'DELETE' then
      insert into public.audit_log (user_id, action, entity, entity_id, detail)
      values (old.user_id, 'eliminar', 'month', old.id, jsonb_build_object('year', old.year, 'month', old.month, 'income', old.income));
    elsif tg_op = 'UPDATE' and new.closed is distinct from old.closed then
      insert into public.audit_log (user_id, action, entity, entity_id, detail)
      values (new.user_id, case when new.closed then 'cerrar' else 'reabrir' end, 'month', new.id,
              jsonb_build_object('year', new.year, 'month', new.month, 'carry_out', new.carry_out));
    end if;

  elsif tg_table_name = 'accounts' then
    if tg_op = 'DELETE' then
      insert into public.audit_log (user_id, action, entity, entity_id, detail)
      values (old.user_id, 'eliminar', 'account', old.id, jsonb_build_object('name', old.name, 'kind', old.kind));
    elsif tg_op = 'UPDATE' and new.archived is distinct from old.archived then
      insert into public.audit_log (user_id, action, entity, entity_id, detail)
      values (new.user_id, case when new.archived then 'archivar' else 'reactivar' end, 'account', new.id,
              jsonb_build_object('name', new.name, 'kind', new.kind));
    end if;
  end if;

  return coalesce(new, old);
end $$;

drop trigger if exists transactions_audit on public.transactions;
create trigger transactions_audit after insert or delete on public.transactions
  for each row execute function public.audit_trigger();
drop trigger if exists months_audit on public.months;
create trigger months_audit after update or delete on public.months
  for each row execute function public.audit_trigger();
drop trigger if exists accounts_audit on public.accounts;
create trigger accounts_audit after update or delete on public.accounts
  for each row execute function public.audit_trigger();

-- ============================================================ M3 · límite de peticiones a la API
create table if not exists public.api_rate_limits (
  user_id       uuid not null references auth.users on delete cascade,
  bucket        text not null,
  window_start  timestamptz not null default now(),
  hits          int not null default 0,
  primary key (user_id, bucket)
);
alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from anon, authenticated;

-- Devuelve true si la petición está dentro del límite (ventana fija por usuario y bucket)
create or replace function public.hit_rate_limit(p_bucket text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_hits int;
begin
  if v_uid is null then return false; end if;
  insert into public.api_rate_limits as l (user_id, bucket, window_start, hits)
  values (v_uid, left(p_bucket, 40), now(), 1)
  on conflict (user_id, bucket) do update set
    hits = case when l.window_start < now() - make_interval(secs => p_window_seconds) then 1 else l.hits + 1 end,
    window_start = case when l.window_start < now() - make_interval(secs => p_window_seconds) then now() else l.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;
end $$;
revoke all on function public.hit_rate_limit(text, int, int) from public, anon;
grant execute on function public.hit_rate_limit(text, int, int) to authenticated;

-- ============================================================ A5 · eliminar cuenta (derecho de supresión)
-- El guard de mes cerrado se salta solo durante el borrado total de la cuenta.
create or replace function public.guard_closed_month()
returns trigger language plpgsql as $$
declare
  v_month uuid := coalesce(new.month_id, old.month_id);
begin
  if coalesce(current_setting('app.purge', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if exists (select 1 from public.months where id = v_month and closed) then
    raise exception 'El mes está cerrado. Reábrelo para modificarlo.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

-- Borra TODOS los datos del usuario que la llama (luego la API elimina el usuario de Auth)
create or replace function public.delete_my_data()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  perform set_config('app.purge', 'on', true);
  delete from public.transactions      where user_id = v_uid;
  delete from public.budget_items      where user_id = v_uid;
  delete from public.months            where user_id = v_uid;
  delete from public.reminder_log      where user_id = v_uid;
  delete from public.push_subscriptions where user_id = v_uid;
  delete from public.accounts          where user_id = v_uid;
  delete from public.api_rate_limits   where user_id = v_uid;
  delete from public.audit_log         where user_id = v_uid;
  delete from public.profiles          where id = v_uid;
end $$;
revoke all on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated;
