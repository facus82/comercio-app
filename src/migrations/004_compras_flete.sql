-- ════════════════════════════════════════════════════════
-- 004_compras_flete.sql
-- Agrega campo flete a la tabla compras
-- Ejecutar en Supabase SQL Editor
-- ════════════════════════════════════════════════════════

ALTER TABLE compras
  ADD COLUMN IF NOT EXISTS flete NUMERIC(12,2) NOT NULL DEFAULT 0;
