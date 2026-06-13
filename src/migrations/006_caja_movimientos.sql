-- 006_caja_movimientos.sql
-- Tabla para ingresos y retiros manuales durante una sesión de caja
CREATE TABLE IF NOT EXISTS caja_movimientos (
  id           UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  caja_id      UUID          NOT NULL REFERENCES cierres_caja(id) ON DELETE CASCADE,
  comercio_id  UUID          NOT NULL REFERENCES comercios(id)    ON DELETE CASCADE,
  usuario_id   UUID          REFERENCES usuarios(id)              ON DELETE SET NULL,
  tipo         TEXT          NOT NULL CHECK (tipo IN ('ingreso', 'retiro')),
  monto        NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  concepto     TEXT,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_caja_movimientos_caja     ON caja_movimientos(caja_id);
CREATE INDEX IF NOT EXISTS idx_caja_movimientos_comercio ON caja_movimientos(comercio_id);

ALTER TABLE caja_movimientos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cm_select" ON caja_movimientos
  FOR SELECT USING (
    comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
  );

CREATE POLICY "cm_insert" ON caja_movimientos
  FOR INSERT WITH CHECK (
    comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
  );
