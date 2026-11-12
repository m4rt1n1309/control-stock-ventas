-- Limpieza mensual: borrar las ventas de un mes ya terminado (después de bajar el PDF).
-- Los detalles (sale_items) se borran solos (on delete cascade).
-- Los cierres de caja ya guardan su resumen, así que el historial de cajas no cambia.

create or replace function public.delete_sales_range(p_from timestamptz, p_to timestamptz)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'Período inválido';
  end if;
  -- Solo meses terminados (hora de Argentina)
  if p_to > date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires' then
    raise exception 'Solo se pueden borrar ventas de meses que ya terminaron';
  end if;
  -- Si alguna venta es de la caja abierta, el arqueo de hoy quedaría mal
  if exists (
    select 1 from public.sales s
    join public.cash_sessions c on c.id = s.session_id
    where c.closed_at is null and s.created_at >= p_from and s.created_at < p_to
  ) then
    raise exception 'Hay ventas de ese mes en la caja que está abierta. Cerrá la caja primero y después borrá.';
  end if;

  delete from public.sales where created_at >= p_from and created_at < p_to;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.delete_sales_range(timestamptz, timestamptz) from public, anon;
grant execute on function public.delete_sales_range(timestamptz, timestamptz) to authenticated;
