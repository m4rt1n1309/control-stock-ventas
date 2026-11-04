-- =====================================================================
-- Kiosco: esquema de base de datos para Supabase
-- Ejecutar completo en: Supabase > SQL Editor > New query > Run
-- =====================================================================

-- ---------- Tablas ----------

create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  barcode     text unique,                       -- puede ser null (productos sin código)
  name        text not null,
  category    text,
  cost_price  numeric(12,2) not null default 0,  -- precio de costo
  sale_price  numeric(12,2) not null default 0,  -- precio de venta
  stock       integer not null default 0,
  min_stock   integer not null default 0,        -- alerta de stock bajo
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists products_name_idx on public.products (lower(name));
create index if not exists products_category_idx on public.products (category);

create table if not exists public.stock_movements (
  id          bigint generated always as identity primary key,
  product_id  uuid not null references public.products(id) on delete cascade,
  type        text not null check (type in ('entrada', 'venta', 'ajuste')),
  quantity    integer not null,                  -- positivo suma, negativo resta
  note        text,
  user_id     uuid default auth.uid() references auth.users(id),
  created_at  timestamptz not null default now()
);

create index if not exists stock_movements_product_idx on public.stock_movements (product_id, created_at desc);

create table if not exists public.sales (
  id              bigint generated always as identity primary key,
  total           numeric(12,2) not null default 0,
  paid            numeric(12,2),                 -- con cuánto pagó (efectivo)
  change_given    numeric(12,2),                 -- vuelto
  payment_method  text not null default 'efectivo',
  user_id         uuid default auth.uid() references auth.users(id),
  created_at      timestamptz not null default now()
);

create index if not exists sales_created_idx on public.sales (created_at desc);

create table if not exists public.sale_items (
  id          bigint generated always as identity primary key,
  sale_id     bigint not null references public.sales(id) on delete cascade,
  product_id  uuid references public.products(id) on delete set null,
  name        text not null,                     -- copia del nombre al momento de la venta
  quantity    integer not null check (quantity > 0),
  unit_price  numeric(12,2) not null,
  subtotal    numeric(12,2) not null
);

create index if not exists sale_items_sale_idx on public.sale_items (sale_id);

-- ---------- Seguridad (RLS) ----------
-- Solo usuarios logueados pueden ver y modificar datos.
-- Los usuarios se crean desde Supabase > Authentication > Users.

alter table public.products        enable row level security;
alter table public.stock_movements enable row level security;
alter table public.sales           enable row level security;
alter table public.sale_items      enable row level security;

drop policy if exists "auth_all_products" on public.products;
create policy "auth_all_products" on public.products
  for all to authenticated using (true) with check (true);

drop policy if exists "auth_all_movements" on public.stock_movements;
create policy "auth_all_movements" on public.stock_movements
  for all to authenticated using (true) with check (true);

drop policy if exists "auth_all_sales" on public.sales;
create policy "auth_all_sales" on public.sales
  for all to authenticated using (true) with check (true);

drop policy if exists "auth_all_sale_items" on public.sale_items;
create policy "auth_all_sale_items" on public.sale_items
  for all to authenticated using (true) with check (true);

-- ---------- Funciones ----------

-- Registra una venta completa en una sola transacción:
-- toma los precios de la base (no del celular), descuenta stock y deja el movimiento.
-- p_items: [{"product_id": "...", "quantity": 2}, ...]
create or replace function public.register_sale(
  p_items jsonb,
  p_paid numeric default null,
  p_payment_method text default 'efectivo'
) returns json
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sale_id bigint;
  v_total   numeric(12,2) := 0;
  v_item    jsonb;
  v_product public.products%rowtype;
  v_qty     integer;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos';
  end if;

  insert into public.sales (total, paid, payment_method)
  values (0, p_paid, coalesce(p_payment_method, 'efectivo'))
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Cantidad inválida';
    end if;

    select * into v_product
    from public.products
    where id = (v_item->>'product_id')::uuid
    for update;

    if not found then
      raise exception 'Producto no encontrado: %', v_item->>'product_id';
    end if;

    insert into public.sale_items (sale_id, product_id, name, quantity, unit_price, subtotal)
    values (v_sale_id, v_product.id, v_product.name, v_qty, v_product.sale_price, v_product.sale_price * v_qty);

    update public.products
    set stock = stock - v_qty, updated_at = now()
    where id = v_product.id;

    insert into public.stock_movements (product_id, type, quantity, note)
    values (v_product.id, 'venta', -v_qty, 'Venta #' || v_sale_id);

    v_total := v_total + v_product.sale_price * v_qty;
  end loop;

  update public.sales
  set total = v_total,
      change_given = case when p_paid is not null then p_paid - v_total end
  where id = v_sale_id;

  return json_build_object('sale_id', v_sale_id, 'total', v_total);
end;
$$;

-- Suma (o resta, con cantidad negativa) stock y registra el movimiento.
create or replace function public.add_stock(
  p_product_id uuid,
  p_quantity integer,
  p_note text default null
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_stock integer;
begin
  if p_quantity is null or p_quantity = 0 then
    raise exception 'La cantidad no puede ser 0';
  end if;

  update public.products
  set stock = stock + p_quantity, updated_at = now()
  where id = p_product_id
  returning stock into v_stock;

  if not found then
    raise exception 'Producto no encontrado';
  end if;

  insert into public.stock_movements (product_id, type, quantity, note)
  values (p_product_id, case when p_quantity > 0 then 'entrada' else 'ajuste' end, p_quantity, p_note);

  return v_stock;
end;
$$;

-- Aumento (o baja) de precios de venta por porcentaje.
-- p_category null = todos los productos.
create or replace function public.update_prices_by_percent(
  p_percent numeric,
  p_category text default null
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_percent is null or p_percent = 0 then
    raise exception 'El porcentaje no puede ser 0';
  end if;

  update public.products
  set sale_price = round(sale_price * (1 + p_percent / 100), 2),
      updated_at = now()
  where p_category is null or category = p_category;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.register_sale(jsonb, numeric, text) from public, anon;
revoke execute on function public.add_stock(uuid, integer, text) from public, anon;
revoke execute on function public.update_prices_by_percent(numeric, text) from public, anon;
grant execute on function public.register_sale(jsonb, numeric, text) to authenticated;
grant execute on function public.add_stock(uuid, integer, text) to authenticated;
grant execute on function public.update_prices_by_percent(numeric, text) to authenticated;
