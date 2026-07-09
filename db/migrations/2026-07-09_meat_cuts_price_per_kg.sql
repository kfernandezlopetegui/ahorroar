-- ============================================================
-- Fix comparador de cortes: backfill de price_per_kg
--
-- La migración 2026-07-09_meat_cuts.sql etiqueta meat_cut_id en las
-- ofertas ya scrapeadas, pero NO calcula price_per_kg (lo deja NULL).
-- El endpoint /meat-cuts filtra price_per_kg IS NOT NULL, así que hasta
-- que los scrapers vuelvan a correr el comparador aparece vacío.
--
-- Este script define la normalización a $/kg como función SQL (misma
-- lógica que parsePricePerKg en scrapers/src/meat/meat-cut-matcher.ts) y
-- backfillea las filas ya etiquetadas. La próxima corrida de scrapers
-- sigue seteando price_per_kg desde el pipeline como siempre.
-- ============================================================

create extension if not exists unaccent;

-- Normaliza el precio publicado a $/kg leyendo la presentación del nombre.
-- Reglas (en orden), idénticas a parsePricePerKg:
--   1. "1/2 kg"                       → price / 0.5
--   2. peso explícito en kg           → price / kg   (ej "bandeja 1kg", "x 2,5 kg")
--   3. peso en gramos                 → price / (g/1000)  (ej "500 g")
--   4. menciona kg/kilo sin peso      → el precio ya es por kg (ej "x kg", "por kilo")
--   5. nada de lo anterior            → NULL (queda fuera del comparador)
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
  if p_price is null or p_price <= 0 then
    return null;
  end if;

  -- 1) media res: "1/2 kg"
  if t ~ '\y1\s*/\s*2\s*(kg|kgs|kilo|kilos)\y' then
    return round(p_price / 0.5, 2);
  end if;

  -- 2) peso explícito en kg
  m := regexp_match(t, '(\d+(?:[.,]\d+)?)\s*(kg|kgs|kilo|kilos)\y');
  if m is not null then
    w := replace(m[1], ',', '.')::numeric;
    if w > 0 then return round(p_price / w, 2); end if;
    return null;
  end if;

  -- 3) peso en gramos
  m := regexp_match(t, '(\d+(?:[.,]\d+)?)\s*(g|gr|grs|gramos)\y');
  if m is not null then
    w := replace(m[1], ',', '.')::numeric / 1000;
    if w > 0 then return round(p_price / w, 2); end if;
    return null;
  end if;

  -- 4) menciona kg/kilo sin peso → se asume que el precio ya es por kg
  if t ~ '\y(kg|kgs|kilo|kilos)\y' then
    return round(p_price, 2);
  end if;

  -- 5) presentación desconocida → fuera del comparador
  return null;
end;
$$;

-- Backfill: normaliza las ofertas ya etiquetadas que sigan activas.
update supermarket_offers
set price_per_kg = meat_price_per_kg(product_name, offer_price)
where meat_cut_id is not null
  and price_per_kg is null
  and is_active = true
  and meat_price_per_kg(product_name, offer_price) is not null;

-- Diagnóstico: cuántas ofertas quedaron listas para el comparador.
-- select count(*) filter (where meat_cut_id is not null)                       as etiquetadas,
--        count(*) filter (where meat_cut_id is not null and price_per_kg is not null) as con_precio_kg
-- from supermarket_offers where is_active = true;
