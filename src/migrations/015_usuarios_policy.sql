-- 015_usuarios_policy.sql
-- La policy "usuarios_write" sólo pedía rol propietario, sin mirar el comercio ni el rol
-- que se asigna: un propietario podía modificar usuarios de otros comercios y asignar
-- cualquier rol. Se reemplaza por policies separadas que:
--   · limitan todo al comercio del propietario,
--   · sólo permiten asignar roles de comercio (nunca 'superadmin'),
--   · no dejan tocar filas de superadmin ni mover usuarios a otro comercio.
-- El panel de superadmin no se afecta: va por la Edge Function admin-ops (service_role).

-- Comercio del usuario logueado, sin pasar por RLS (igual que auth_rol())
CREATE OR REPLACE FUNCTION auth_comercio_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT comercio_id FROM public.usuarios WHERE id = auth.uid()
$$;

DROP POLICY IF EXISTS "usuarios_write"  ON usuarios;
DROP POLICY IF EXISTS "usuarios_insert" ON usuarios;
DROP POLICY IF EXISTS "usuarios_update" ON usuarios;
DROP POLICY IF EXISTS "usuarios_delete" ON usuarios;

CREATE POLICY "usuarios_insert" ON usuarios
  FOR INSERT TO authenticated
  WITH CHECK (
    auth_rol() = 'propietario'
    AND comercio_id = auth_comercio_id()
    AND rol IN ('propietario', 'cajero', 'data_entry', 'readonly')
  );

CREATE POLICY "usuarios_update" ON usuarios
  FOR UPDATE TO authenticated
  USING (
    auth_rol() = 'propietario'
    AND comercio_id = auth_comercio_id()
    AND rol <> 'superadmin'
  )
  WITH CHECK (
    comercio_id = auth_comercio_id()
    AND rol IN ('propietario', 'cajero', 'data_entry', 'readonly')
  );

CREATE POLICY "usuarios_delete" ON usuarios
  FOR DELETE TO authenticated
  USING (
    auth_rol() = 'propietario'
    AND comercio_id = auth_comercio_id()
    AND rol <> 'superadmin'
    AND id <> auth.uid()
  );

-- Verificación: después de ejecutar, esta consulta tiene que mostrar sólo
-- usuarios_select, usuarios_insert, usuarios_update y usuarios_delete.
-- Si aparece otra policy de escritura (ALL / INSERT / UPDATE / DELETE), avisar:
-- las policies se suman, y una vieja más permisiva dejaría el agujero abierto.
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'usuarios'
ORDER BY policyname;
