-- ============================================================
-- Migración 2026-07-08 — correr en el SQL Editor de Supabase
-- 1) Canasta personal: el usuario elige explícitamente los
--    productos de su canasta y la app evalúa cuánto aumentó.
-- 2) Seed de ofertas de transporte (billeteras / QR / SUBE)
--    que ningún scraper cubre hoy.
-- ============================================================

-- 1) Canasta personal
create table if not exists basket_items (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  ean             text not null,
  producto_nombre text not null,
  cantidad        integer not null default 1 check (cantidad between 1 and 99),
  created_at      timestamptz not null default now(),
  unique (user_id, ean)
);

create index if not exists idx_basket_items_user on basket_items (user_id);

alter table basket_items enable row level security;

drop policy if exists "basket_own_rows" on basket_items;
create policy "basket_own_rows" on basket_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- 2) Ofertas de transporte (recarga SUBE / pago con QR).
--    Los scrapers solo cubren Galicia, Naranja X y BBVA; las
--    ofertas de SUBE/QR viven en billeteras que no se scrapean
--    (Cuenta DNI, Mercado Pago, MODO, BNA+, etc.), por eso la
--    categoría "transporte" quedaba casi vacía.
--    Se usan bancos/billeteras NO scrapeados para que los
--    scrapers no las desactiven al correr.
-- ============================================================

-- Por si este proyecto todavía no tiene la tabla (mismo esquema
-- que usan los scrapers y el backend). Si ya existe, no hace nada.
create table if not exists promotions (
  id           uuid primary key default gen_random_uuid(),
  bank         text not null,
  title        text not null,
  description  text not null default '',
  discount_pct numeric not null default 0,
  max_discount numeric,
  category     text not null default 'otros',
  store        text,
  valid_from   date not null default current_date,
  valid_until  date not null default current_date,
  days_of_week integer[] not null default array[1,2,3,4,5,6,7],
  is_active    boolean not null default true,
  scraped_at   timestamptz not null default now()
);

insert into promotions
  (bank, title, description, discount_pct, max_discount, category, store,
   valid_from, valid_until, days_of_week, is_active)
select * from (values
  ('Cuenta DNI',
   'Recarga SUBE con 40% de descuento',
   'Recargá la SUBE desde la app Cuenta DNI del Banco Provincia y obtené 40% de descuento. Verificá el tope y las condiciones vigentes en la app.',
   40, 800, 'transporte', 'SUBE',
   date '2026-07-01', date '2026-12-31', array[1,2,3,4,5,6,7], true),

  ('Mercado Pago',
   'Descuento al recargar la SUBE',
   'Recargá tu tarjeta SUBE desde Mercado Pago y aprovechá los descuentos vigentes para usuarios del nivel Mercado Puntos. Consultá condiciones en la app.',
   15, 500, 'transporte', 'SUBE',
   date '2026-07-01', date '2026-12-31', array[1,2,3,4,5,6,7], true),

  ('MODO',
   'Reintegro pagando transporte con QR',
   'Pagá con QR de MODO desde la app de tu banco en viajes y recargas de transporte y recibí reintegro según tu banco. Verificá los bancos adheridos en la app MODO.',
   20, 1000, 'transporte', 'QR MODO',
   date '2026-07-01', date '2026-12-31', array[1,2,3,4,5,6,7], true),

  ('BNA+',
   'Recarga SUBE con reintegro',
   'Recargá la SUBE desde la billetera BNA+ del Banco Nación y obtené reintegro. Tope y condiciones según la promoción vigente del banco.',
   30, 600, 'transporte', 'SUBE',
   date '2026-07-01', date '2026-12-31', array[1,2,3,4,5,6,7], true),

  ('Personal Pay',
   'Descuento recargando la SUBE',
   'Recargá la SUBE con Personal Pay y obtené descuento según tu nivel. Consultá topes y condiciones vigentes en la app.',
   25, 400, 'transporte', 'SUBE',
   date '2026-07-01', date '2026-12-31', array[1,2,3,4,5,6,7], true),

  ('Ualá',
   'Reintegro en recargas de transporte',
   'Recargá la SUBE o pagá el transporte con la tarjeta prepaga de Ualá y recibí reintegro según la promoción vigente.',
   20, 500, 'transporte', 'SUBE',
   date '2026-07-01', date '2026-12-31', array[1,2,3,4,5,6,7], true)
) as seed (bank, title, description, discount_pct, max_discount, category, store,
           valid_from, valid_until, days_of_week, is_active)
where not exists (
  select 1 from promotions p
  where p.bank = seed.bank and p.title = seed.title
);
