-- ════════════════════════════════════════════════════════
-- 003_subcategorias.sql
-- Agrega subcategorías de productos y columna en productos
-- Ejecutar en Supabase SQL Editor
-- ════════════════════════════════════════════════════════

CREATE TABLE subcategorias (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  comercio_id  UUID        NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  categoria_id UUID        NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  nombre       TEXT        NOT NULL,
  activo       BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (comercio_id, categoria_id, nombre)
);

CREATE INDEX idx_subcategorias_comercio  ON subcategorias(comercio_id);
CREATE INDEX idx_subcategorias_categoria ON subcategorias(categoria_id);

ALTER TABLE productos
  ADD COLUMN subcategoria_id UUID REFERENCES subcategorias(id) ON DELETE SET NULL;

-- ── RLS ──────────────────────────────────────────────────
ALTER TABLE subcategorias ENABLE ROW LEVEL SECURITY;

CREATE POLICY sub_select ON subcategorias
  FOR SELECT TO authenticated
  USING (comercio_id = (SELECT comercio_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY sub_write ON subcategorias
  FOR ALL TO authenticated
  USING (comercio_id = (SELECT comercio_id FROM usuarios WHERE id = auth.uid()))
  WITH CHECK (
    comercio_id = (SELECT comercio_id FROM usuarios WHERE id = auth.uid()) AND
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE id = auth.uid() AND rol IN ('propietario', 'data_entry')
    )
  );
