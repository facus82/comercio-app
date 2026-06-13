-- ════════════════════════════════════════════════════════
-- 006_venta_promociones.sql
-- Trazabilidad de promociones aplicadas en cada venta
-- Ejecutar en Supabase SQL Editor
-- ════════════════════════════════════════════════════════

CREATE TABLE venta_promociones (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  venta_id        UUID          NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  promo_id        UUID          REFERENCES promociones(id) ON DELETE SET NULL,
  promo_nombre    TEXT          NOT NULL,
  tipo            TEXT          NOT NULL CHECK (tipo IN ('descuento_pct', 'nxm')),
  descuento_monto NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_venta_promociones_venta ON venta_promociones(venta_id);
CREATE INDEX idx_venta_promociones_promo ON venta_promociones(promo_id);

ALTER TABLE venta_promociones ENABLE ROW LEVEL SECURITY;

CREATE POLICY vp_select ON venta_promociones
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ventas
      WHERE id = venta_id
        AND comercio_id = (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    )
  );

CREATE POLICY vp_insert ON venta_promociones
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ventas
      WHERE id = venta_id
        AND comercio_id = (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    )
  );
