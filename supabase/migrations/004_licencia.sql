-- Licencia / período de prueba.
-- Sin fila en app_license = uso sin límite (copia propia).
-- Para una prueba, insertar la fila (ver supabase/licencia_prueba.sql).

create table if not exists public.app_license (
  id                boolean primary key default true check (id),  -- una sola fila
  plan              text not null default 'activa' check (plan in ('prueba', 'activa', 'suspendida')),
  expires_at        timestamptz,                                    -- null = no vence
  contact_whatsapp  text,                                           -- ej: 5493815007424
  contact_name      text,
  updated_at        timestamptz not null default now()
);

alter table public.app_license enable row level security;

-- Desde la app solo se puede LEER. Se modifica únicamente desde el panel de Supabase.
drop policy if exists "auth_read_license" on public.app_license;
create policy "auth_read_license" on public.app_license
  for select to authenticated using (true);

create or replace function public.license_is_valid()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select plan <> 'suspendida' and (expires_at is null or expires_at > now()) from public.app_license limit 1),
    true
  );
$$;

-- Bloquea vender y cargar cuando la licencia no es válida.
-- Se aplica con triggers, así cubre la app, las funciones y cualquier otro camino.
create or replace function public.enforce_license()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.license_is_valid() then
    raise exception 'Terminó el período de prueba. Para seguir vendiendo y cargando productos, contactanos.'
      using hint = 'LICENCIA_VENCIDA';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists license_products on public.products;
create trigger license_products
  before insert or update or delete on public.products
  for each row execute function public.enforce_license();

drop trigger if exists license_sales on public.sales;
create trigger license_sales
  before insert on public.sales
  for each row execute function public.enforce_license();

drop trigger if exists license_stock_movements on public.stock_movements;
create trigger license_stock_movements
  before insert on public.stock_movements
  for each row execute function public.enforce_license();

revoke execute on function public.license_is_valid() from public, anon;
grant execute on function public.license_is_valid() to authenticated;
