-- ================================================================
-- Migración: Soporte superadmin + columnas plan/activo
-- Ejecutar en Supabase → SQL Editor
-- ================================================================

-- 1. Agregar columnas a comercios (ignorar si ya existen)
ALTER TABLE comercios
  ADD COLUMN IF NOT EXISTS plan        TEXT    DEFAULT 'basic'
    CHECK (plan IN ('basic','pro','enterprise')),
  ADD COLUMN IF NOT EXISTS activo      BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS modulos_custom JSONB DEFAULT NULL;

-- 2. Agregar columnas a usuarios (ignorar si ya existen)
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS activo         BOOLEAN     DEFAULT true,
  ADD COLUMN IF NOT EXISTS ultimo_acceso  TIMESTAMPTZ DEFAULT NULL;

-- 3. Actualizar CHECK constraint de rol para incluir 'superadmin'
--    Primero buscamos el nombre del constraint existente
--    (en Supabase suele llamarse "usuarios_rol_check")
DO $$
BEGIN
  -- Quitar constraint viejo si existe
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'usuarios'
      AND constraint_type = 'CHECK'
      AND constraint_name LIKE '%rol%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE usuarios DROP CONSTRAINT ' || constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'usuarios'
        AND constraint_type = 'CHECK'
        AND constraint_name LIKE '%rol%'
      LIMIT 1
    );
  END IF;
END $$;

-- Crear nuevo constraint con los 5 roles
ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_rol_check
    CHECK (rol IN ('propietario', 'cajero', 'data_entry', 'readonly', 'superadmin'));

-- 4. RLS: permitir que superadmin lea TODAS las tablas
--    (o podés usar supabaseAdmin con service_role que bypasea RLS)
-- Opcional: policy para superadmin
-- CREATE POLICY "superadmin puede todo en comercios"
--   ON comercios FOR ALL
--   USING (
--     EXISTS (
--       SELECT 1 FROM usuarios
--       WHERE id = auth.uid() AND rol = 'superadmin'
--     )
--   );

-- 5. Activar todos los comercios existentes
UPDATE comercios SET activo = true WHERE activo IS NULL;
UPDATE usuarios  SET activo = true WHERE activo IS NULL;

-- ================================================================
-- PASO FINAL: Crear tu usuario superadmin
-- Hacé esto DESPUÉS de loguearte una vez con tu email en el sistema
-- para que el registro en auth.users exista.
-- ================================================================

-- Ejecutar REEMPLAZANDO tu email real:
UPDATE usuarios
  SET rol = 'superadmin'
  WHERE email = 'crnunezfacundo@gmail.com';

-- Verificar:
SELECT id, email, rol FROM usuarios WHERE rol = 'superadmin';
