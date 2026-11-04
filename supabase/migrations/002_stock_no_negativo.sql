-- No permitir vender ni restar más stock del que hay.

-- 1) Corregir productos que hayan quedado en negativo (dejarlos en 0 con un ajuste registrado)
insert into public.stock_movements (product_id, type, quantity, note)
select id, 'ajuste', -stock, 'Corrección: stock negativo llevado a 0'
from public.products where stock < 0;

update public.products set stock = 0, updated_at = now() where stock < 0;

-- 2) Red de seguridad: el stock nunca puede quedar negativo
alter table public.products drop constraint if exists products_stock_no_negativo;
alter table public.products add constraint products_stock_no_negativo check (stock >= 0);

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
  v_current integer;
  v_stock   integer;
begin
  if p_quantity is null or p_quantity = 0 then
    raise exception 'La cantidad no puede ser 0';
  end if;

  select stock into v_current from public.products where id = p_product_id for update;
  if not found then
    raise exception 'Producto no encontrado';
  end if;

  if p_quantity < 0 and v_current + p_quantity < 0 then
    raise exception 'No podés restar %: solo hay % en stock', -p_quantity, v_current;
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
