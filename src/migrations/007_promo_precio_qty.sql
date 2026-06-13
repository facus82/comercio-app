-- ════════════════════════════════════════════════════════
-- 007_promo_precio_qty.sql
-- Nuevo tipo de promoción: precio especial por cantidad (bundle)
-- Ej: 5 cartulinas por $400 total
-- Ejecutar en Supabase SQL Editor
-- ════════════════════════════════════════════════════════

-- 1. Nuevas columnas en promociones
ALTER TABLE promociones
  ADD COLUMN IF NOT EXISTS cantidad_min  INTEGER,
  ADD COLUMN IF NOT EXISTS precio_bundle NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS precio_final  NUMERIC(12,2);

-- 2. Ampliar CHECK de tipo en promociones
ALTER TABLE promociones DROP CONSTRAINT IF EXISTS promociones_tipo_check;
ALTER TABLE promociones ADD CONSTRAINT promociones_tipo_check
  CHECK (tipo IN ('descuento_pct', 'nxm', 'precio_qty'));

-- 3. Ampliar CHECK de tipo en venta_promociones
ALTER TABLE venta_promociones DROP CONSTRAINT IF EXISTS venta_promociones_tipo_check;
ALTER TABLE venta_promociones ADD CONSTRAINT venta_promociones_tipo_check
  CHECK (tipo IN ('descuento_pct', 'nxm', 'precio_qty'));
