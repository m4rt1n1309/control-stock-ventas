-- Cierre de caja: apertura con fondo inicial, ingresos/retiros de efectivo y cierre con arqueo.

-- ---------- Tablas ----------

create table if not exists public.cash_sessions (
  id               bigint generated always as identity primary key,
  opened_at        timestamptz not null default now(),
  opened_by        uuid default auth.uid() references auth.users(id),
  opened_by_email  text default (auth.jwt() ->> 'email'),
  opening_amount   numeric(12,2) not null default 0 check (opening_amount >= 0),
  closed_at        timestamptz,
  closed_by        uuid references auth.users(id),
  closed_by_email  text,
  expected_cash    numeric(12,2),   -- efectivo que debería haber
  counted_cash     numeric(12,2),   -- efectivo que se contó
  difference       numeric(12,2),   -- contado - esperado (negativo = faltante)
  summary          jsonb,           -- resumen congelado al cerrar
  notes            text
);

-- Solo puede haber una caja abierta a la vez
create unique index if not exists cash_sessions_one_open on public.cash_sessions ((true)) where closed_at is null;
create index if not exists cash_sessions_opened_idx on public.cash_sessions (opened_at desc);

create table if not exists public.cash_movements (
  id          bigint generated always as identity primary key,
  session_id  bigint not null references public.cash_sessions(id) on delete cascade,
  type        text not null check (type in ('ingreso', 'egreso')),
  amount      numeric(12,2) not null check (amount > 0),
  reason      text not null,
  user_id     uuid default auth.uid() references auth.users(id),
  user_email  text default (auth.jwt() ->> 'email'),
  created_at  timestamptz not null default now()
);

create index if not exists cash_movements_session_idx on public.cash_movements (session_id);

alter table public.sales add column if not exists session_id bigint references public.cash_sessions(id);
alter table public.sales add column if not exists user_email text default (auth.jwt() ->> 'email');
create index if not exists sales_session_idx on public.sales (session_id);

-- ---------- Seguridad ----------

alter table public.cash_sessions  enable row level security;
alter table public.cash_movements enable row level security;

-- Las cajas solo se abren/cierran con las funciones de abajo; desde la app solo se leen.
drop policy if exists "auth_read_sessions" on public.cash_sessions;
create policy "auth_read_sessions" on public.cash_sessions
  for select to authenticated using (true);

drop policy if exists "auth_read_cash_movements" on public.cash_movements;
create policy "auth_read_cash_movements" on public.cash_movements
  for select to authenticated using (true);

-- ---------- Funciones ----------

create or replace function public.open_cash_session(p_opening_amount numeric default 0)
returns public.cash_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.cash_sessions;
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;
  if p_opening_amount is null or p_opening_amount < 0 then
    raise exception 'El monto inicial no puede ser negativo';
  end if;

  insert into public.cash_sessions (opened_by, opened_by_email, opening_amount)
  values (auth.uid(), auth.jwt() ->> 'email', p_opening_amount)
  returning * into v_row;

  return v_row;
exception
  when unique_violation then
    raise exception 'Ya hay una caja abierta';
end;
$$;

create or replace function public.add_cash_movement(p_type text, p_amount numeric, p_reason text)
returns public.cash_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id bigint;
  v_row public.cash_movements;
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;
  if p_type not in ('ingreso', 'egreso') then
    raise exception 'Tipo inválido';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto tiene que ser mayor a 0';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Escribí el motivo';
  end if;

  select id into v_session_id from public.cash_sessions where closed_at is null for share;
  if v_session_id is null then
    raise exception 'La caja está cerrada';
  end if;

  insert into public.cash_movements (session_id, type, amount, reason, user_id, user_email)
  values (v_session_id, p_type, p_amount, trim(p_reason), auth.uid(), auth.jwt() ->> 'email')
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.cash_session_summary(p_session_id bigint)
returns json
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  s        public.cash_sessions%rowtype;
  v_count  integer;
  v_total  numeric(12,2);
  v_cash   numeric(12,2);
  v_by     jsonb;
  v_in     numeric(12,2);
  v_out    numeric(12,2);
begin
  select * into s from public.cash_sessions where id = p_session_id;
  if not found then
    raise exception 'Caja no encontrada';
  end if;

  select count(*), coalesce(sum(total), 0), coalesce(sum(total) filter (where payment_method = 'efectivo'), 0)
  into v_count, v_total, v_cash
  from public.sales where session_id = p_session_id;

  select coalesce(jsonb_object_agg(payment_method, t), '{}'::jsonb) into v_by
  from (select payment_method, sum(total) as t from public.sales where session_id = p_session_id group by 1) x;

  select coalesce(sum(amount) filter (where type = 'ingreso'), 0),
         coalesce(sum(amount) filter (where type = 'egreso'), 0)
  into v_in, v_out
  from public.cash_movements where session_id = p_session_id;

  return json_build_object(
    'session_id', s.id,
    'opening_amount', s.opening_amount,
    'sales_count', v_count,
    'total_sales', v_total,
    'by_method', v_by,
    'cash_sales', v_cash,
    'cash_in', v_in,
    'cash_out', v_out,
    'expected_cash', s.opening_amount + v_cash + v_in - v_out
  );
end;
$$;

create or replace function public.close_cash_session(p_session_id bigint, p_counted numeric, p_notes text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s          public.cash_sessions%rowtype;
  v_sum      jsonb;
  v_expected numeric(12,2);
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;

  select * into s from public.cash_sessions where id = p_session_id for update;
  if not found then
    raise exception 'Caja no encontrada';
  end if;
  if s.closed_at is not null then
    raise exception 'Esta caja ya fue cerrada';
  end if;
  if p_counted is null or p_counted < 0 then
    raise exception 'Monto contado inválido';
  end if;

  v_sum := public.cash_session_summary(p_session_id)::jsonb;
  v_expected := (v_sum ->> 'expected_cash')::numeric;

  update public.cash_sessions
  set closed_at = now(),
      closed_by = auth.uid(),
      closed_by_email = auth.jwt() ->> 'email',
      expected_cash = v_expected,
      counted_cash = p_counted,
      difference = p_counted - v_expected,
      summary = v_sum,
      notes = nullif(trim(p_notes), '')
  where id = p_session_id;

  return (v_sum || jsonb_build_object('counted_cash', p_counted, 'difference', p_counted - v_expected))::json;
end;
$$;

-- Venta: ahora exige caja abierta y queda asociada a ella.
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
  v_session_id bigint;
  v_sale_id bigint;
  v_total   numeric(12,2) := 0;
  v_item    jsonb;
  v_product public.products%rowtype;
  v_qty     integer;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos';
  end if;

  -- "for share": si alguien está cerrando la caja en este momento, espera y después falla limpio
  select id into v_session_id from public.cash_sessions where closed_at is null for share;
  if v_session_id is null then
    raise exception 'La caja está cerrada. Abrila para poder vender.';
  end if;

  insert into public.sales (total, paid, payment_method, session_id)
  values (0, p_paid, coalesce(p_payment_method, 'efectivo'), v_session_id)
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

    if v_product.stock < v_qty then
      raise exception 'No hay stock suficiente de "%": quedan %', v_product.name, greatest(v_product.stock, 0);
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

revoke execute on function public.open_cash_session(numeric) from public, anon;
revoke execute on function public.add_cash_movement(text, numeric, text) from public, anon;
revoke execute on function public.cash_session_summary(bigint) from public, anon;
revoke execute on function public.close_cash_session(bigint, numeric, text) from public, anon;
grant execute on function public.open_cash_session(numeric) to authenticated;
grant execute on function public.add_cash_movement(text, numeric, text) to authenticated;
grant execute on function public.cash_session_summary(bigint) to authenticated;
grant execute on function public.close_cash_session(bigint, numeric, text) to authenticated;
