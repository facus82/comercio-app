// ── admin-ops Edge Function ───────────────────────────────────────────────────
// Corre server-side en Supabase. La service_role key NUNCA llega al browser.
// El frontend la llama con el JWT del usuario logueado y acá verificamos
// que sea superadmin antes de ejecutar cualquier operación privilegiada.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  // ── 1. Verificar que viene con JWT válido ───────────────────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return json({ error: 'No autorizado' }, 401)
  }

  const supabaseUrl     = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey         = Deno.env.get('SUPABASE_ANON_KEY')!

  // Cliente con anon key + JWT del usuario para verificar identidad
  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })

  // Verificar sesión
  const { data: { user }, error: authErr } = await supabaseUser.auth.getUser()
  if (authErr || !user) {
    return json({ error: 'Sesión inválida' }, 401)
  }

  // Verificar rol superadmin en la tabla usuarios
  const { data: perfil } = await supabaseUser
    .from('usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (perfil?.rol !== 'superadmin') {
    return json({ error: 'Acceso denegado: se requiere rol superadmin' }, 403)
  }

  // ── 2. Cliente admin (service_role) — vive solo server-side ────────────
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── 3. Parsear operación ────────────────────────────────────────────────
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Body inválido' }, 400)
  }

  const { op } = body

  // ── 4. Dispatch de operaciones ──────────────────────────────────────────

  // ── COMERCIOS ────────────────────────────────────────────────────────────

  if (op === 'listar_comercios') {
    const { data, error } = await admin
      .from('comercios')
      .select(`
        id, nombre, nombre_fantasia, plan, activo, created_at, localidad, cuit,
        propietario:usuarios!usuarios_comercio_id_fkey(id, nombre, email)
      `)
      .order('created_at', { ascending: false })
    if (error) return json({ error: error.message }, 500)
    return json({ data })
  }

  if (op === 'crear_comercio') {
    const { comercio, email_propietario, nombre_propietario, plan, redirectTo } = body as any

    // 1. Crear comercio
    const { data: c, error: errC } = await admin
      .from('comercios')
      .insert({ ...comercio, plan, activo: true })
      .select()
      .single()
    if (errC) return json({ error: `Comercio: ${errC.message}` }, 400)

    // 2. Invitar propietario
    const { data: inv, error: errI } = await admin.auth.admin.inviteUserByEmail(
      email_propietario,
      { redirectTo }
    )
    if (errI) return json({ error: `Invitación: ${errI.message}` }, 400)

    // 3. Registrar en usuarios
    const { error: errU } = await admin.from('usuarios').insert({
      id:          inv.user.id,
      email:       email_propietario,
      nombre:      nombre_propietario || email_propietario.split('@')[0],
      rol:         'propietario',
      comercio_id: c.id,
      activo:      true,
    })
    if (errU) return json({ error: `Usuario: ${errU.message}` }, 400)

    return json({ data: c })
  }

  if (op === 'toggle_comercio') {
    const { id, activo } = body as any
    const { error } = await admin.from('comercios').update({ activo }).eq('id', id)
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  if (op === 'cambiar_plan') {
    const { id, plan } = body as any
    const { error } = await admin.from('comercios').update({ plan }).eq('id', id)
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  if (op === 'asignar_propietario') {
    const { comercio_id, email, nombre, redirectTo } = body as any

    const { data: existing } = await admin
      .from('usuarios')
      .select('id, rol, comercio_id')
      .eq('email', email)
      .maybeSingle()

    if (existing) {
      const { error } = await admin
        .from('usuarios')
        .update({ rol: 'propietario', comercio_id, activo: true, ...(nombre ? { nombre } : {}) })
        .eq('id', existing.id)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true, created: false })
    }

    // Usuario nuevo — invitar
    const { data: inv, error: errI } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })
    if (errI) return json({ error: `Invitación: ${errI.message}` }, 400)

    const { error: errU } = await admin.from('usuarios').insert({
      id:          inv.user.id,
      email,
      nombre:      nombre || email.split('@')[0],
      rol:         'propietario',
      comercio_id,
      activo:      true,
    })
    if (errU) return json({ error: errU.message }, 400)
    return json({ ok: true, created: true })
  }

  if (op === 'entrar_como') {
    const { comercio_id, redirectTo } = body as any

    const { data: prop, error: errP } = await admin
      .from('usuarios')
      .select('email')
      .eq('comercio_id', comercio_id)
      .eq('rol', 'propietario')
      .maybeSingle()

    if (errP || !prop) return json({ error: prop ? errP?.message : 'Sin propietario asignado' }, 400)

    const { data, error: errL } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: prop.email,
      options: { redirectTo },
    })
    if (errL) return json({ error: errL.message }, 500)
    return json({ action_link: data.properties.action_link })
  }

  // ── USUARIOS ─────────────────────────────────────────────────────────────

  if (op === 'listar_usuarios') {
    const [{ data: u }, { data: c }] = await Promise.all([
      admin
        .from('usuarios')
        .select('id, nombre, email, rol, activo, ultimo_acceso, created_at, comercio:comercios(nombre, nombre_fantasia)')
        .order('created_at', { ascending: false }),
      admin
        .from('comercios')
        .select('id, nombre, nombre_fantasia, activo')
        .eq('activo', true)
        .order('nombre'),
    ])
    return json({ usuarios: u ?? [], comercios: c ?? [] })
  }

  if (op === 'crear_usuario') {
    const { email, nombre, rol, comercio_id, redirectTo } = body as any

    const { data: inv, error: errI } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })
    if (errI) return json({ error: `Invitación: ${errI.message}` }, 400)

    const { error: errU } = await admin.from('usuarios').insert({
      id:          inv.user.id,
      email,
      nombre:      nombre || email.split('@')[0],
      rol,
      comercio_id,
      activo:      true,
    })
    if (errU) return json({ error: `Usuario: ${errU.message}` }, 400)
    return json({ ok: true })
  }

  if (op === 'toggle_usuario') {
    const { id, activo } = body as any
    const { error } = await admin.from('usuarios').update({ activo }).eq('id', id)
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  if (op === 'reset_password') {
    const { email, redirectTo } = body as any
    const { error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    })
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  // ── PLANES / MÓDULOS ─────────────────────────────────────────────────────

  if (op === 'listar_planes') {
    const { data, error } = await admin
      .from('comercios')
      .select('id, nombre, nombre_fantasia, plan, activo, modulos_custom')
      .order('nombre')
    if (error) return json({ error: error.message }, 500)
    return json({ data })
  }

  if (op === 'guardar_modulos') {
    const { comercio_id, modulos } = body as any
    const { error } = await admin
      .from('comercios')
      .update({ modulos_custom: modulos })
      .eq('id', comercio_id)
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  return json({ error: `Operación desconocida: ${op}` }, 400)
})

// ── Helper ────────────────────────────────────────────────────────────────────
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
