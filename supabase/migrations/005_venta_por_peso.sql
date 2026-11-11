-- Productos que se venden por peso (fiambres, quesos, sueltos).
-- Si sold_by_weight = true: el precio es por kilo y el stock / cantidades van en kilos (con decimales).

alter table public.products
  add column if not exists sold_by_weight boolean not null default false;

alter table public.sale_items
  add column if not exists sold_by_weight boolean not null default false;  -- copia al momento de la venta

-- Cantidades con hasta 3 decimales (gramos)
alter table public.products        alter column stock     type numeric(12,3);
alter table public.products        alter column min_stock type numeric(12,3);
alter table public.stock_movements alter column quantity  type numeric(12,3);
alter table public.sale_items      alter column quantity  type numeric(12,3);

-- Venta: acepta cantidades con decimales solo en productos por peso.
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
  v_sale_id  bigint;
  v_total    numeric(12,2) := 0;
  v_item     jsonb;
  v_product  public.products%rowtype;
  v_qty      numeric(12,3);
  v_subtotal numeric(12,2);
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos';
  end if;

  select id into v_session_id from public.cash_sessions where closed_at is null for share;
  if v_session_id is null then
    raise exception 'La caja está cerrada. Abrila para poder vender.';
  end if;

  insert into public.sales (total, paid, payment_method, session_id)
  values (0, p_paid, coalesce(p_payment_method, 'efectivo'), v_session_id)
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := round((v_item->>'quantity')::numeric, 3);
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

    if not v_product.sold_by_weight and v_qty <> trunc(v_qty) then
      raise exception '"%" se vende por unidad, no por peso', v_product.name;
    end if;

    if v_product.stock < v_qty then
      raise exception 'No hay stock suficiente de "%": quedan %', v_product.name, greatest(v_product.stock, 0)::float8;
    end if;

    v_subtotal := round(v_product.sale_price * v_qty, 2);

    insert into public.sale_items (sale_id, product_id, name, quantity, unit_price, subtotal, sold_by_weight)
    values (v_sale_id, v_product.id, v_product.name, v_qty, v_product.sale_price, v_subtotal, v_product.sold_by_weight);

    update public.products
    set stock = stock - v_qty, updated_at = now()
    where id = v_product.id;

    insert into public.stock_movements (product_id, type, quantity, note)
    values (v_product.id, 'venta', -v_qty, 'Venta #' || v_sale_id);

    v_total := v_total + v_subtotal;
  end loop;

  update public.sales
  set total = v_total,
      change_given = case when p_paid is not null then p_paid - v_total end
  where id = v_sale_id;

  return json_build_object('sale_id', v_sale_id, 'total', v_total);
end;
$$;

-- Mover stock: ahora con decimales (kilos). Se reemplaza la versión de enteros.
drop function if exists public.add_stock(uuid, integer, text);

create or replace function public.add_stock(
  p_product_id uuid,
  p_quantity numeric,
  p_note text default null
) returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current numeric(12,3);
  v_stock   numeric(12,3);
  v_weight  boolean;
begin
  p_quantity := round(p_quantity, 3);
  if p_quantity is null or p_quantity = 0 then
    raise exception 'La cantidad no puede ser 0';
  end if;

  select stock, sold_by_weight into v_current, v_weight from public.products where id = p_product_id for update;
  if not found then
    raise exception 'Producto no encontrado';
  end if;

  if not v_weight and p_quantity <> trunc(p_quantity) then
    raise exception 'Este producto se cuenta por unidad: usá números enteros';
  end if;

  if p_quantity < 0 and v_current + p_quantity < 0 then
    raise exception 'No podés restar %: solo hay % en stock', (-p_quantity)::float8, v_current::float8;
  end if;

  update public.products
  set stock = stock + p_quantity, updated_at = now()
  where id = p_product_id
  returning stock into v_stock;

  insert into public.stock_movements (product_id, type, quantity, note)
  values (p_product_id, case when p_quantity > 0 then 'entrada' else 'ajuste' end, p_quantity, p_note);

  return v_stock;
end;
$$;

revoke execute on function public.add_stock(uuid, numeric, text) from public, anon;
grant execute on function public.add_stock(uuid, numeric, text) to authenticated;
