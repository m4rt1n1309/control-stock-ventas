-- Arreglo: "La caja está cerrada" al cobrar aunque la caja esté abierta.
-- register_sale corre con los permisos del usuario (security invoker) y hacía
-- "select ... for share" sobre cash_sessions. Con RLS, FOR SHARE también exige una
-- política de UPDATE, y cash_sessions solo tiene política de lectura: la fila abierta
-- quedaba invisible y la venta fallaba.
-- Solución: buscar (y trabar) la caja abierta con una función security definer.

create or replace function public.lock_open_cash_session()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;
  -- "for share": si alguien está cerrando la caja en este momento, espera y después falla limpio
  select id into v_id from public.cash_sessions where closed_at is null for share;
  return v_id;
end;
$$;

revoke execute on function public.lock_open_cash_session() from public, anon;
grant execute on function public.lock_open_cash_session() to authenticated;

-- Venta (misma lógica que 005_venta_por_peso.sql, solo cambia cómo se busca la caja)
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

  v_session_id := public.lock_open_cash_session();
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
