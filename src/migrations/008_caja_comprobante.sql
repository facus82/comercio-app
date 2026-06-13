-- 008_caja_comprobante.sql
-- Vinculación de movimiento de caja con comprobante (factura, remito, etc.)
ALTER TABLE caja_movimientos
  ADD COLUMN IF NOT EXISTS nro_comprobante TEXT;
