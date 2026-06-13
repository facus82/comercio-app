-- 009_caja_distribucion.sql
-- Guarda el monto retirado al distribuir el efectivo entre secciones al cierre
ALTER TABLE cierres_caja
  ADD COLUMN IF NOT EXISTS monto_distribuido NUMERIC(12,2);
