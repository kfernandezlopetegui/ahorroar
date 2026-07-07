-- ============================================================
-- Migración Fase 4 — correr en el SQL Editor de Supabase
-- Inflación personal, monitor de scrapers, cupones de afiliado
-- y moderación de reportes comunitarios.
-- ============================================================

-- 1) Monitor de scrapers: registro persistente de cada corrida
create table if not exists scraper_runs (
  id          uuid primary key default gen_random_uuid(),
  scraper     text not null,                          -- ej: 'Galicia', 'Carrefour'
  kind        text not null check (kind in ('bank', 'super')),
  ok          boolean not null,
  items_count integer not null default 0,
  error       text,
  duration_ms integer not null default 0,
  ran_at      timestamptz not null default now()
);

create index if not exists idx_scraper_runs_scraper_ran_at
  on scraper_runs (scraper, ran_at desc);
create index if not exists idx_scraper_runs_ran_at
  on scraper_runs (ran_at desc);

-- 2) Cupones de afiliado
alter table coupons
  add column if not exists is_affiliate  boolean not null default false,
  add column if not exists affiliate_url text;

-- 3) Moderación de reportes comunitarios
alter table price_reports
  add column if not exists flags_count integer not null default 0,
  add column if not exists hidden      boolean not null default false;

create table if not exists report_flags (
  report_id  uuid not null references price_reports (id) on delete cascade,
  user_id    uuid not null,
  created_at timestamptz not null default now(),
  primary key (report_id, user_id)
);

-- ============================================================
-- Nota: price_history ya soporta los snapshots de precios online
-- (se guardan con sucursal_id = 'online:<Cadena>'). Si tu tabla
-- tiene lat/lng/direccion/localidad como NOT NULL, relajalos:
-- ============================================================
alter table price_history
  alter column direccion drop not null,
  alter column localidad drop not null,
  alter column lat drop not null,
  alter column lng drop not null;
