-- ════════════════════════════════════════════════════════
-- 005_promociones.sql
-- Tabla de promociones y descuentos
-- Ejecutar en Supabase SQL Editor
-- ════════════════════════════════════════════════════════

CREATE TABLE promociones (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  comercio_id     UUID        NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  nombre          TEXT        NOT NULL,
  tipo            TEXT        NOT NULL CHECK (tipo IN ('descuento_pct', 'nxm')),
  activo          BOOLEAN     NOT NULL DEFAULT true,
  fecha_desde     DATE,
  fecha_hasta     DATE,
  combina         BOOLEAN     NOT NULL DEFAULT true,
  -- Para descuento_pct:
  descuento_pct   NUMERIC(5,2),
  medio_pago      TEXT,
  -- Para nxm:
  cantidad_lleva  INTEGER,
  cantidad_paga   INTEGER,
  -- Scope:
  aplica_a        TEXT        NOT NULL DEFAULT 'todo'
                    CHECK (aplica_a IN ('todo','categoria','subcategoria','producto')),
  categoria_id    UUID        REFERENCES categorias(id)    ON DELETE SET NULL,
  subcategoria_id UUID        REFERENCES subcategorias(id) ON DELETE SET NULL,
  producto_id     UUID        REFERENCES productos(id)     ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_promociones_comercio ON promociones(comercio_id);

ALTER TABLE promociones ENABLE ROW LEVEL SECURITY;

CREATE POLICY promo_select ON promociones
  FOR SELECT TO authenticated
  USING (comercio_id = (SELECT comercio_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY promo_write ON promociones
  FOR ALL TO authenticated
  USING (comercio_id = (SELECT comercio_id FROM usuarios WHERE id = auth.uid()))
  WITH CHECK (
    comercio_id = (SELECT comercio_id FROM usuarios WHERE id = auth.uid()) AND
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol IN ('propietario','data_entry'))
  );
