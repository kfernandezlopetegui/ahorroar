-- ============================================================
-- Monitor de scrapers v2 — correr en el SQL Editor de Supabase.
--
-- Reemplaza el esquema simple de scraper_runs (creado en
-- 2026-07-07_fase4.sql) por uno que registra el ciclo de vida
-- completo de cada corrida: se inserta en 'running' al arrancar y
-- se actualiza a success/error/partial al terminar, con contadores
-- de ítems scrapeados y upserteados y la duración.
--
-- La tabla vieja sólo guardaba el resultado final (ok/items_count),
-- así que la recreamos. Es data operativa efímera (se repuebla en
-- cada corrida), por eso no hay backfill.
-- ============================================================

-- 1) Roles de usuario (para RLS: sólo admins leen el monitor).
--    El claim de admin puede venir por JWT (app_metadata.role = 'admin')
--    o por esta tabla. Cubrimos ambos caminos en la policy.
create table if not exists user_roles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

alter table user_roles enable row level security;

-- Cada usuario puede leer su propia fila (para que el front sepa su rol).
drop policy if exists user_roles_self_read on user_roles;
create policy user_roles_self_read on user_roles
  for select
  using (auth.uid() = user_id);

-- Helper: ¿el usuario actual es admin? (por tabla o por claim del JWT)
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
      false
    )
    or exists (
      select 1 from user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'admin'
    );
$$;

-- 2) Registro de corridas — esquema v2.
drop table if exists scraper_runs cascade;

create table scraper_runs (
  id             uuid primary key default gen_random_uuid(),
  scraper        text not null,                                   -- ej: 'carrefour', 'coto', 'galicia'
  type           text not null check (type in ('supermarket', 'bank')),
  status         text not null check (status in ('running', 'success', 'error', 'partial')),
  items_scraped  integer not null default 0,
  items_upserted integer not null default 0,
  error_message  text,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  duration_ms    integer
);

create index idx_scraper_runs_scraper_started
  on scraper_runs (scraper, started_at desc);

-- 3) RLS: sólo lectura para admins. Las escrituras las hace el worker
--    con la service_role key (que bypassa RLS), así que no definimos
--    policies de insert/update para usuarios normales.
alter table scraper_runs enable row level security;

drop policy if exists scraper_runs_admin_read on scraper_runs;
create policy scraper_runs_admin_read on scraper_runs
  for select
  using (is_admin());

-- Cómo marcar un admin manualmente:
--   insert into user_roles (user_id, role)
--   values ('<uuid-del-usuario>', 'admin')
--   on conflict (user_id) do update set role = 'admin';
