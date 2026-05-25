/**
 * adminOps — proxy seguro para operaciones de superadmin.
 *
 * En vez de usar supabaseAdmin (que expone la service_role key en el bundle),
 * llama a la Edge Function `admin-ops` que corre server-side en Supabase.
 * El JWT del usuario logueado se valida allá; la service_role key nunca
 * llega al browser.
 */
import { supabase } from './supabase'

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-ops`

async function call(op, payload = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Sin sesión activa')

  const res = await fetch(FUNCTION_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ op, ...payload }),
  })

  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`)
  return json
}

// ── Comercios ──────────────────────────────────────────────────────────────
export const adminOps = {
  listarComercios: () =>
    call('listar_comercios'),

  crearComercio: ({ comercio, email_propietario, nombre_propietario, plan }) =>
    call('crear_comercio', {
      comercio, email_propietario, nombre_propietario, plan,
      redirectTo: `${window.location.origin}/set-password`,
    }),

  toggleComercio: (id, activo) =>
    call('toggle_comercio', { id, activo }),

  cambiarPlan: (id, plan) =>
    call('cambiar_plan', { id, plan }),

  asignarPropietario: (comercio_id, email, nombre) =>
    call('asignar_propietario', {
      comercio_id, email, nombre,
      redirectTo: `${window.location.origin}/set-password`,
    }),

  entrarComo: (comercio_id) =>
    call('entrar_como', {
      comercio_id,
      redirectTo: `${window.location.origin}/dashboard`,
    }),

  // ── Usuarios ─────────────────────────────────────────────────────────────
  listarUsuarios: () =>
    call('listar_usuarios'),

  crearUsuario: ({ email, nombre, rol, comercio_id }) =>
    call('crear_usuario', {
      email, nombre, rol, comercio_id,
      redirectTo: `${window.location.origin}/set-password`,
    }),

  toggleUsuario: (id, activo) =>
    call('toggle_usuario', { id, activo }),

  editarUsuario: (id, { nombre, rol, comercio_id }) =>
    call('editar_usuario', { id, nombre, rol, comercio_id }),

  resetPassword: (email) =>
    call('reset_password', {
      email,
      redirectTo: `${window.location.origin}/set-password`,
    }),

  // ── Planes / módulos ──────────────────────────────────────────────────────
  listarPlanes: () =>
    call('listar_planes'),

  guardarModulos: (comercio_id, modulos) =>
    call('guardar_modulos', { comercio_id, modulos }),
}
