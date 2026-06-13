-- 007_caja_mov_cc.sql
-- Agrega centro de costo a movimientos de caja (para trazabilidad de retiros)
ALTER TABLE caja_movimientos
  ADD COLUMN IF NOT EXISTS centro_costo_id UUID REFERENCES centros_costos(id) ON DELETE SET NULL;
