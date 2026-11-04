-- =====================================================================
-- Licencia de un negocio. Ejecutar en el SQL Editor del proyecto DE ESE NEGOCIO.
-- =====================================================================

-- Iniciar prueba de 7 días (vence a la medianoche del 7mo día, hora Argentina)
insert into public.app_license (id, plan, expires_at, contact_whatsapp, contact_name)
values (
  true,
  'prueba',
  (((now() at time zone 'America/Argentina/Buenos_Aires')::date + 8)::timestamp at time zone 'America/Argentina/Buenos_Aires'),
  '5493815007424',
  null
)
on conflict (id) do update
  set plan = excluded.plan, expires_at = excluded.expires_at,
      contact_whatsapp = excluded.contact_whatsapp, contact_name = excluded.contact_name, updated_at = now();

-- ---- Otras acciones (descomentar la que haga falta) ----

-- Extender la prueba 3 días más:
-- update public.app_license set expires_at = expires_at + interval '3 days', updated_at = now();

-- Activar (el negocio pagó; sin vencimiento):
-- update public.app_license set plan = 'activa', expires_at = null, updated_at = now();

-- Activar por un mes (abono mensual):
-- update public.app_license set plan = 'activa', expires_at = now() + interval '1 month', updated_at = now();

-- Suspender (bloquea vender y cargar):
-- update public.app_license set plan = 'suspendida', updated_at = now();

select plan, expires_at at time zone 'America/Argentina/Buenos_Aires' as vence_hora_argentina from public.app_license;
