-- Fecha de vencimiento (opcional) de cada producto: la del próximo lote que vence.
alter table public.products add column if not exists expires_on date;

create index if not exists products_expires_idx on public.products (expires_on) where expires_on is not null;
