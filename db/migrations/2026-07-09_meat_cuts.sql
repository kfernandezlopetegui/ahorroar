-- ============================================================
-- Migración Comparador de cortes de carne — correr en el SQL
-- Editor de Supabase.
--
-- Los cortes no tienen EAN estándar (se venden por peso y cada
-- cadena usa nombres distintos), así que el comparador funciona
-- por categoría normalizada: cada producto scrapeado que matchea
-- las keywords de un corte se etiqueta con meat_cut_id y se
-- normaliza su precio a $/kg (price_per_kg).
-- ============================================================

-- Para el backfill del punto 4 (matching sin tildes en SQL)
create extension if not exists unaccent;

-- Normalización a $/kg en SQL (misma lógica que parsePricePerKg del pipeline).
-- Se usa en el backfill para que el comparador tenga datos antes de la
-- próxima corrida de scrapers. Ver 2026-07-09_meat_cuts_price_per_kg.sql.
create or replace function meat_price_per_kg(p_name text, p_price numeric)
returns numeric
language plpgsql
stable
as $$
declare
  t text := lower(unaccent(coalesce(p_name, '')));
  m text[];
  w numeric;
begin
  if p_price is null or p_price <= 0 then return null; end if;
  if t ~ '\y1\s*/\s*2\s*(kg|kgs|kilo|kilos)\y' then return round(p_price / 0.5, 2); end if;
  m := regexp_match(t, '(\d+(?:[.,]\d+)?)\s*(kg|kgs|kilo|kilos)\y');
  if m is not null then
    w := replace(m[1], ',', '.')::numeric;
    if w > 0 then return round(p_price / w, 2); end if;
    return null;
  end if;
  m := regexp_match(t, '(\d+(?:[.,]\d+)?)\s*(g|gr|grs|gramos)\y');
  if m is not null then
    w := replace(m[1], ',', '.')::numeric / 1000;
    if w > 0 then return round(p_price / w, 2); end if;
    return null;
  end if;
  if t ~ '\y(kg|kgs|kilo|kilos)\y' then return round(p_price, 2); end if;
  return null;
end;
$$;

-- 1) Catálogo de cortes
create table if not exists meat_cuts (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,          -- ej: 'vacio'
  display_name     text not null,                 -- ej: 'Vacío'
  category         text not null default 'vacuno',
  -- Keywords que identifican el corte en el nombre scrapeado.
  -- Se matchean por palabra completa, case-insensitive y sin tildes
  -- (se guardan las variantes con y sin tilde igual, por si se
  -- consulta directo por SQL).
  keywords         text[] not null,
  -- Palabras que descartan el match para ESTE corte (falsos positivos:
  -- "lomo de cerdo", "pollo asado", etc.). Las exclusiones globales
  -- (hamburguesa, empanada, milanesa…) viven en el matcher.
  exclude_keywords text[] not null default '{}',
  -- Prioridad de matching: menor = se evalúa primero. Importa para
  -- cortes cuyo nombre contiene a otro ("bola de lomo" antes que "lomo").
  match_priority   int not null default 100,
  created_at       timestamptz not null default now()
);

alter table meat_cuts enable row level security;

drop policy if exists "meat_cuts_read_all" on meat_cuts;
create policy "meat_cuts_read_all" on meat_cuts
  for select using (true);

-- 2) Seed de cortes (idempotente: re-correr actualiza keywords)
insert into meat_cuts (slug, display_name, category, keywords, exclude_keywords, match_priority) values
  ('bola-de-lomo',    'Bola de lomo',    'vacuno', '{"bola de lomo"}',                                              '{}',                                              10),
  ('bife-de-chorizo', 'Bife de chorizo', 'vacuno', '{"bife de chorizo","bife chorizo","bife ancho","bife angosto"}','{}',                                              20),
  ('roast-beef',      'Roast beef',      'vacuno', '{"roast beef","roastbeef","rost beef","rosbif"}',               '{}',                                              30),
  ('cuadril',         'Cuadril',         'vacuno', '{"cuadril","colita de cuadril"}',                               '{}',                                              40),
  ('peceto',          'Peceto',          'vacuno', '{"peceto"}',                                                    '{}',                                              50),
  ('nalga',           'Nalga',           'vacuno', '{"nalga"}',                                                     '{}',                                              60),
  ('matambre',        'Matambre',        'vacuno', '{"matambre","matambrito"}',                                     '{"cerdo","porcino","chancho","pizza","arrollado","relleno"}', 70),
  ('entrana',         'Entraña',         'vacuno', '{"entraña","entrana"}',                                         '{"cerdo","porcino"}',                             80),
  ('osobuco',         'Osobuco',         'vacuno', '{"osobuco","ossobuco","osso buco","oso buco"}',                 '{}',                                              90),
  ('falda',           'Falda',           'vacuno', '{"falda"}',                                                     '{"mujer","nena","nina","niña","talle","vestido","jean","pollera"}', 100),
  ('asado',           'Asado',           'vacuno', '{"asado","tira de asado","asado de tira","costillar"}',         '{"pollo","cerdo","porcino","chancho","carbon","carbón","salsa","sal parrillera"}', 110),
  ('vacio',           'Vacío',           'vacuno', '{"vacio","vacío"}',                                             '{}',                                              120),
  ('lomo',            'Lomo',            'vacuno', '{"lomo","bife de lomo"}',                                       '{"cerdo","porcino","chancho","atun","atún","ahumado","embuchado","cocido"}', 130),
  ('picada',          'Carne picada',    'vacuno', '{"carne picada","picada","picada especial","picada comun","picada común"}', '{"fiambre","fiambres","queso","quesos","mani","maní","salame","cebolla","verdura","pollo","cerdo"}', 140)
on conflict (slug) do update set
  display_name     = excluded.display_name,
  category         = excluded.category,
  keywords         = excluded.keywords,
  exclude_keywords = excluded.exclude_keywords,
  match_priority   = excluded.match_priority;

-- 3) Etiquetado de las filas de precios scrapeados
alter table supermarket_offers
  add column if not exists meat_cut_id  uuid references meat_cuts (id) on delete set null,
  -- Precio normalizado a $/kg. NULL = no se pudo inferir la presentación
  -- (el producto queda fuera del comparador de cortes).
  add column if not exists price_per_kg numeric(12,2);

create index if not exists idx_supermarket_offers_meat_cut
  on supermarket_offers (meat_cut_id, scraped_at desc)
  where meat_cut_id is not null;

-- 4) Backfill: etiquetar lo ya scrapeado que siga activo.
-- El matcher completo (exclusiones globales, "al vacío" ≠ "vacío", etc.)
-- corre en el pipeline de los scrapers; este backfill SQL es una
-- aproximación simple por keyword para no arrancar con la tabla vacía.
-- La próxima corrida de scrapers re-etiqueta todo con la lógica completa.
update supermarket_offers o
set meat_cut_id = mc.id,
    price_per_kg = meat_price_per_kg(o.product_name, o.offer_price)
from meat_cuts mc
where o.meat_cut_id is null
  and o.is_active = true
  and exists (
    select 1 from unnest(mc.keywords) kw
    where unaccent(lower(o.product_name)) ~ ('\m' || unaccent(lower(kw)) || '\M')
  )
  and not exists (
    select 1 from unnest(mc.exclude_keywords) ex
    where unaccent(lower(o.product_name)) like '%' || unaccent(lower(ex)) || '%'
  )
  and unaccent(lower(o.product_name)) !~ '(hamburguesa|medallon|empanada|milanesa de|albondiga|nugget|salchicha|escabeche|pate |caldo|sopa)';
