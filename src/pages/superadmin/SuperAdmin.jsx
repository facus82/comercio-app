import { useState, useEffect, useCallback } from 'react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import './SuperAdmin.css'

// ── Constantes ────────────────────────────────────────────

const TABS = [
  { key: 'comercios', label: 'Comercios',      icon: 'ti-building-store'  },
  { key: 'usuarios',  label: 'Usuarios',       icon: 'ti-users'           },
  { key: 'planes',    label: 'Planes y accesos', icon: 'ti-shield-check'  },
]

const PLANES = ['basic', 'pro', 'enterprise']

const ROLES_USUARIO = ['cajero', 'data_entry', 'readonly']

const DEPARTAMENTOS_LR = [
  'Capital', 'Arauco', 'Castro Barros', 'Chilecito', 'Coronel Felipe Varela',
  'Famatina', 'Gral. Ángel V. Peñaloza', 'General Belgrano', 'Gral. Juan F. Quiroga',
  'General Lamadrid', 'Gral. Ortiz de Ocampo', 'General San Martín',
  'Independencia', 'Rosario Vera Peñaloza', 'Sanagasta', 'Vinchina',
]

const TODOS_MODULOS = [
  { key: 'stock',        label: 'Stock'          },
  { key: 'compras',      label: 'Compras'        },
  { key: 'ventas',       label: 'Ventas'         },
  { key: 'caja',         label: 'Caja'           },
  { key: 'clientes',     label: 'Clientes'       },
  { key: 'presupuestos', label: 'Presupuestos'   },
  { key: 'proveedores',  label: 'Proveedores'    },
  { key: 'obligaciones', label: 'Obligaciones'   },
  { key: 'reportes',     label: 'Reportes'       },
  { key: 'config',       label: 'Configuración'  },
]

const PLAN_MODULOS = {
  basic:      ['stock', 'compras', 'ventas', 'caja', 'clientes'],
  pro:        ['stock', 'compras', 'ventas', 'caja', 'clientes', 'presupuestos', 'proveedores', 'obligaciones'],
  enterprise: TODOS_MODULOS.map(m => m.key),
}

const FORM_COMERCIO_VACIO = {
  nombre: '', nombre_fantasia: '', cuit: '', departamento: 'Capital', localidad: '',
  plan: 'basic', email_propietario: '', nombre_propietario: '',
}

const FORM_USUARIO_VACIO = {
  comercio_id: '', email: '', nombre: '', rol: 'cajero',
}

// ── Helpers ───────────────────────────────────────────────

function fmt(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtFull(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── Componentes reutilizables ─────────────────────────────

function PlanBadge({ plan }) {
  const cls = { basic: 'badge--neutral', pro: 'badge--info', enterprise: 'badge--success' }
  return <span className={`badge ${cls[plan ?? 'basic'] ?? 'badge--neutral'}`}>{plan ?? 'basic'}</span>
}

function RolBadge({ rol }) {
  const map = {
    propietario: 'badge--info',
    cajero:      'badge--neutral',
    data_entry:  'badge--warning',
    readonly:    'badge--neutral',
    superadmin:  'badge--success',
  }
  return <span className={`badge ${map[rol] ?? 'badge--neutral'}`}>{rol ?? '—'}</span>
}

function EstadoBadge({ activo }) {
  return activo !== false
    ? <span className="badge badge--success">Activo</span>
    : <span className="badge badge--danger">Inactivo</span>
}

function NoAdminKey() {
  return (
    <div className="sa-warning">
      <i className="ti ti-alert-triangle" />
      <div>
        <strong>Falta VITE_SUPABASE_SERVICE_KEY</strong>
        <p>Agregá tu service_role key al archivo <code>.env</code> para habilitar la creación de usuarios y envío de invitaciones. Encontrala en Supabase → Project Settings → API → service_role.</p>
      </div>
    </div>
  )
}

// ── Tab Comercios ─────────────────────────────────────────

function TabComercios() {
  const [comercios,  setComercios]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [showForm,   setShowForm]   = useState(false)
  const [form,       setForm]       = useState(FORM_COMERCIO_VACIO)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')
  const [ok,         setOk]         = useState('')
  const [editPlan,        setEditPlan]       = useState(null)  // { id, plan }
  const [entrandoComo,    setEntrandoComo]   = useState(null)  // comercioId
  const [asignandoProp,   setAsignandoProp]  = useState(null)  // comercioId del form abierto
  const [formProp,        setFormProp]       = useState({ email: '', nombre: '' })
  const [savingProp,      setSavingProp]     = useState(false)

  const cargar = useCallback(() => {
    if (!supabaseAdmin) { setLoading(false); return }
    supabaseAdmin
      .from('comercios')
      .select(`
        id, nombre, nombre_fantasia, plan, activo, created_at, localidad, cuit,
        propietario:usuarios!usuarios_comercio_id_fkey(id, nombre, email)
      `)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        // propietario puede venir como array — quedarnos con el primero que sea propietario
        const norm = (data ?? []).map(c => ({
          ...c,
          propietario: Array.isArray(c.propietario)
            ? (c.propietario.find(u => u) ?? null)
            : c.propietario ?? null,
        }))
        setComercios(norm)
        setLoading(false)
      })
  }, [])

  useEffect(() => { cargar() }, [cargar])

  function setF(k, v) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.nombre.trim() || !form.email_propietario.trim()) {
      setError('Nombre del comercio y email del propietario son obligatorios.')
      return
    }
    if (!supabaseAdmin) { setError('Falta VITE_SUPABASE_SERVICE_KEY en .env'); return }
    setSaving(true); setError(''); setOk('')
    try {
      // 1. Crear registro en comercios
      const { data: comercio, error: errC } = await supabaseAdmin
        .from('comercios')
        .insert({
          nombre:          form.nombre.trim(),
          nombre_fantasia: form.nombre_fantasia.trim() || null,
          cuit:            form.cuit.trim() || null,
          localidad:       form.localidad.trim() || form.departamento || null,
          provincia:       'La Rioja',
          plan:            form.plan,
          activo:          true,
        })
        .select()
        .single()
      if (errC) throw new Error(`Comercio: ${errC.message}`)

      // 2. Invitar al propietario (crea cuenta en Supabase Auth + envía email)
      const { data: invData, error: errI } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        form.email_propietario.trim(),
        { redirectTo: `${window.location.origin}/set-password` }
      )
      if (errI) throw new Error(`Invitación: ${errI.message}`)

      // 3. Registrar en tabla usuarios
      const { error: errU } = await supabaseAdmin
        .from('usuarios')
        .insert({
          id:          invData.user.id,
          email:       form.email_propietario.trim(),
          nombre:      form.nombre_propietario.trim() || form.email_propietario.split('@')[0],
          rol:         'propietario',
          comercio_id: comercio.id,
          activo:      true,
        })
      if (errU) throw new Error(`Usuario: ${errU.message}`)

      setComercios(p => [comercio, ...p])
      setForm(FORM_COMERCIO_VACIO)
      setShowForm(false)
      setOk(`✓ Comercio creado. Invitación enviada a ${form.email_propietario}.`)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleActivo(id, activo) {
    if (!supabaseAdmin) return
    await supabaseAdmin.from('comercios').update({ activo }).eq('id', id)
    setComercios(p => p.map(c => c.id === id ? { ...c, activo } : c))
  }

  async function guardarPlan(id, plan) {
    if (!supabaseAdmin) return
    await supabaseAdmin.from('comercios').update({ plan }).eq('id', id)
    setComercios(p => p.map(c => c.id === id ? { ...c, plan } : c))
    setEditPlan(null)
  }

  async function asignarPropietario(comercioId) {
    if (!supabaseAdmin || !formProp.email.trim()) return
    setSavingProp(true); setError('')
    try {
      // Verificar si ya existe en Auth
      const { data: existing } = await supabaseAdmin
        .from('usuarios')
        .select('id, rol, comercio_id')
        .eq('email', formProp.email.trim())
        .maybeSingle()

      let userId

      if (existing) {
        // Ya existe — actualizar su rol y comercio
        userId = existing.id
        const { error: errU } = await supabaseAdmin
          .from('usuarios')
          .update({ rol: 'propietario', comercio_id: comercioId, activo: true,
                    nombre: formProp.nombre.trim() || undefined })
          .eq('id', existing.id)
        if (errU) throw new Error(errU.message)
      } else {
        // Usuario nuevo — invitar
        const { data: invData, error: errI } = await supabaseAdmin.auth.admin.inviteUserByEmail(
          formProp.email.trim(),
          { redirectTo: `${window.location.origin}/set-password` }
        )
        if (errI) throw new Error(`Invitación: ${errI.message}`)
        userId = invData.user.id
        const { error: errU } = await supabaseAdmin.from('usuarios').insert({
          id:          userId,
          email:       formProp.email.trim(),
          nombre:      formProp.nombre.trim() || formProp.email.split('@')[0],
          rol:         'propietario',
          comercio_id: comercioId,
          activo:      true,
        })
        if (errU) throw new Error(errU.message)
      }

      setOk(`✓ Propietario asignado${!existing ? '. Email de invitación enviado.' : '.'}`)
      setAsignandoProp(null)
      setFormProp({ email: '', nombre: '' })
      cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setSavingProp(false)
    }
  }

  async function entrarComo(comercioId) {
    if (!supabaseAdmin) return
    setEntrandoComo(comercioId)
    try {
      // Buscar el propietario del comercio
      const { data: prop, error: errP } = await supabaseAdmin
        .from('usuarios')
        .select('email')
        .eq('comercio_id', comercioId)
        .eq('rol', 'propietario')
        .maybeSingle()
      if (errP) throw new Error(`Error buscando propietario: ${errP.message}`)
      if (!prop) throw new Error('Este comercio no tiene un propietario asignado.')

      // Generar magic link de sesión
      const { data, error: errL } = await supabaseAdmin.auth.admin.generateLink({
        type:  'magiclink',
        email: prop.email,
        options: { redirectTo: `${window.location.origin}/dashboard` },
      })
      if (errL) throw new Error(errL.message)

      // Navegar al link — inicia sesión como propietario
      window.location.href = data.properties.action_link
    } catch (e) {
      setOk('')
      setError(e.message)
    } finally {
      setEntrandoComo(null)
    }
  }

  return (
    <div className="sa-tab-content">
      {!supabaseAdmin && <NoAdminKey />}

      {ok && (
        <div className="sa-ok">
          <i className="ti ti-circle-check" /> {ok}
          <button className="sa-dismiss" onClick={() => setOk('')}><i className="ti ti-x" /></button>
        </div>
      )}

      <div className="sa-toolbar">
        <h2 className="sa-section-title">
          <i className="ti ti-building-store" />
          Comercios registrados
        </h2>
        <button
          className="btn btn--primary"
          onClick={() => { setShowForm(p => !p); setError('') }}
          disabled={!supabaseAdmin}
        >
          <i className={`ti ${showForm ? 'ti-x' : 'ti-plus'}`} />
          {showForm ? 'Cancelar' : 'Nuevo comercio'}
        </button>
      </div>

      {/* Formulario nuevo comercio */}
      {showForm && (
        <div className="sa-form-card">
          <p className="sa-form-title">Crear nuevo comercio</p>
          {error && <div className="sa-error"><i className="ti ti-alert-circle" /> {error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="sa-form-grid">
              <div className="field">
                <label className="field-label">Nombre legal *</label>
                <input className="field-input" value={form.nombre} onChange={e => setF('nombre', e.target.value)} placeholder="Razón social" required />
              </div>
              <div className="field">
                <label className="field-label">Nombre fantasía</label>
                <input className="field-input" value={form.nombre_fantasia} onChange={e => setF('nombre_fantasia', e.target.value)} placeholder="Como aparece en el sistema" />
              </div>
              <div className="field">
                <label className="field-label">CUIT</label>
                <input className="field-input" value={form.cuit} onChange={e => setF('cuit', e.target.value)} placeholder="20-12345678-9" />
              </div>
              <div className="field">
                <label className="field-label">Plan</label>
                <select className="field-select" value={form.plan} onChange={e => setF('plan', e.target.value)}>
                  {PLANES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="field-label">Departamento (La Rioja)</label>
                <select className="field-select" value={form.departamento} onChange={e => setF('departamento', e.target.value)}>
                  {DEPARTAMENTOS_LR.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="field-label">Localidad / ciudad</label>
                <input className="field-input" value={form.localidad} onChange={e => setF('localidad', e.target.value)} placeholder="Ciudad dentro del departamento" />
              </div>
              <div className="field">
                <label className="field-label">Nombre del propietario</label>
                <input className="field-input" value={form.nombre_propietario} onChange={e => setF('nombre_propietario', e.target.value)} placeholder="Nombre y apellido" />
              </div>
              <div className="field">
                <label className="field-label">Email del propietario *</label>
                <input className="field-input" type="email" value={form.email_propietario} onChange={e => setF('email_propietario', e.target.value)} placeholder="propietario@email.com" required />
                <span className="field-hint">Se enviará un email de bienvenida con link para setear contraseña.</span>
              </div>
            </div>
            <div className="sa-form-actions">
              <button type="submit" className="btn btn--filled" disabled={saving}>
                <i className={`ti ${saving ? 'ti-loader-2' : 'ti-building-store'}`} />
                {saving ? 'Creando...' : 'Crear comercio y enviar invitación'}
              </button>
              <button type="button" className="btn" onClick={() => { setShowForm(false); setError('') }}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabla */}
      <div className="table-wrap">
        {loading ? (
          <div className="table-loading"><i className="ti ti-loader-2" style={{ fontSize: 24, opacity: 0.4 }} /></div>
        ) : comercios.length === 0 ? (
          <div className="sa-empty"><i className="ti ti-building-store" /><p>No hay comercios registrados.</p></div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Comercio</th>
                <th>Propietario</th>
                <th>Plan</th>
                <th>Localidad</th>
                <th>Alta</th>
                <th>Estado</th>
                <th />
                <th />
              </tr>
            </thead>
            <tbody>
              {comercios.map(c => (
                <>
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>
                    {c.nombre_fantasia || c.nombre}
                    {c.nombre_fantasia && <span className="td-muted" style={{ fontWeight: 400 }}> · {c.nombre}</span>}
                  </td>
                  <td>
                    {c.propietario ? (
                      <div className="sa-prop-cell">
                        <span style={{ fontWeight: 500, fontSize: 11 }}>{c.propietario.nombre}</span>
                        <span className="td-muted">{c.propietario.email}</span>
                      </div>
                    ) : (
                      <button
                        className="sa-btn-asignar"
                        disabled={!supabaseAdmin}
                        onClick={() => { setAsignandoProp(c.id); setFormProp({ email: '', nombre: '' }); setError('') }}
                      >
                        <i className="ti ti-user-plus" /> Asignar propietario
                      </button>
                    )}
                  </td>
                  <td>
                    {editPlan?.id === c.id ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <select
                          className="field-select"
                          style={{ fontSize: 11, padding: '3px 6px' }}
                          defaultValue={c.plan ?? 'basic'}
                          onChange={e => guardarPlan(c.id, e.target.value)}
                          autoFocus
                        >
                          {PLANES.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <button className="btn-icon" onClick={() => setEditPlan(null)}><i className="ti ti-x" /></button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <PlanBadge plan={c.plan} />
                        <button
                          className="btn-icon"
                          title="Cambiar plan"
                          disabled={!supabaseAdmin}
                          onClick={() => setEditPlan({ id: c.id, plan: c.plan })}
                        >
                          <i className="ti ti-pencil" style={{ fontSize: 11 }} />
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="td-muted">{c.localidad || '—'}</td>
                  <td className="td-muted">{fmt(c.created_at)}</td>
                  <td><EstadoBadge activo={c.activo} /></td>
                  <td className="td-actions">
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      {c.propietario && (
                        <button
                          className="btn-icon"
                          title="Cambiar propietario"
                          disabled={!supabaseAdmin}
                          onClick={() => { setAsignandoProp(c.id); setFormProp({ email: '', nombre: '' }); setError('') }}
                        >
                          <i className="ti ti-user-edit" />
                        </button>
                      )}
                      <button
                        className={`btn-icon${c.activo !== false ? ' btn-icon--danger' : ''}`}
                        title={c.activo !== false ? 'Desactivar' : 'Activar'}
                        disabled={!supabaseAdmin}
                        onClick={() => toggleActivo(c.id, c.activo === false)}
                      >
                        <i className={`ti ${c.activo !== false ? 'ti-eye-off' : 'ti-eye'}`} />
                      </button>
                    </div>
                  </td>
                  <td>
                    <button
                      className="sa-btn-entrar"
                      title={c.propietario ? 'Entrar como propietario' : 'Asignar propietario primero'}
                      disabled={!supabaseAdmin || !c.propietario || entrandoComo === c.id}
                      onClick={() => entrarComo(c.id)}
                    >
                      <i className={`ti ${entrandoComo === c.id ? 'ti-loader-2' : 'ti-login-2'}`} />
                      {entrandoComo === c.id ? 'Entrando...' : 'Entrar'}
                    </button>
                  </td>
                </tr>
                {/* Fila expandida — formulario asignar propietario */}
                {asignandoProp === c.id && (
                  <tr key={`${c.id}-prop`} className="sa-tr-expand">
                    <td colSpan={8}>
                      <div className="sa-inline-form">
                        <span className="sa-inline-label">
                          <i className="ti ti-user-plus" />
                          {c.propietario ? 'Cambiar propietario de' : 'Asignar propietario a'} <strong>{c.nombre_fantasia || c.nombre}</strong>
                        </span>
                        {error && <div className="sa-error" style={{ margin: 0 }}><i className="ti ti-alert-circle" /> {error}</div>}
                        <input
                          className="field-input"
                          type="email"
                          placeholder="email@ejemplo.com"
                          value={formProp.email}
                          onChange={e => setFormProp(p => ({ ...p, email: e.target.value }))}
                          autoFocus
                        />
                        <input
                          className="field-input"
                          placeholder="Nombre (opcional)"
                          value={formProp.nombre}
                          onChange={e => setFormProp(p => ({ ...p, nombre: e.target.value }))}
                        />
                        <button
                          className="btn btn--filled"
                          style={{ fontSize: 11 }}
                          disabled={savingProp || !formProp.email.trim()}
                          onClick={() => asignarPropietario(c.id)}
                        >
                          <i className={`ti ${savingProp ? 'ti-loader-2' : 'ti-check'}`} />
                          {savingProp ? 'Guardando...' : 'Confirmar'}
                        </button>
                        <button
                          className="btn"
                          style={{ fontSize: 11 }}
                          onClick={() => { setAsignandoProp(null); setError('') }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Tab Usuarios ─────────────────────────────────────────

function TabUsuarios() {
  const [usuarios,   setUsuarios]   = useState([])
  const [comercios,  setComercios]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [showForm,   setShowForm]   = useState(false)
  const [form,       setForm]       = useState(FORM_USUARIO_VACIO)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')
  const [ok,         setOk]         = useState('')
  const [resetting,  setResetting]  = useState(null) // userId en proceso de reset

  const cargar = useCallback(async () => {
    if (!supabaseAdmin) { setLoading(false); return }
    const [{ data: u }, { data: c }] = await Promise.all([
      supabaseAdmin
        .from('usuarios')
        .select('id, nombre, email, rol, activo, ultimo_acceso, created_at, comercio:comercios(nombre, nombre_fantasia)')
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('comercios')
        .select('id, nombre, nombre_fantasia, activo')
        .eq('activo', true)
        .order('nombre'),
    ])
    setUsuarios(u ?? [])
    setComercios(c ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  function setF(k, v) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.comercio_id || !form.email.trim()) {
      setError('Comercio y email son obligatorios.')
      return
    }
    if (!supabaseAdmin) { setError('Falta VITE_SUPABASE_SERVICE_KEY'); return }
    setSaving(true); setError(''); setOk('')
    try {
      // Invitar al usuario
      const { data: invData, error: errI } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        form.email.trim(),
        { redirectTo: `${window.location.origin}/set-password` }
      )
      if (errI) throw new Error(`Invitación: ${errI.message}`)

      // Registrar en tabla usuarios
      const { error: errU } = await supabaseAdmin
        .from('usuarios')
        .insert({
          id:          invData.user.id,
          email:       form.email.trim(),
          nombre:      form.nombre.trim() || form.email.split('@')[0],
          rol:         form.rol,
          comercio_id: form.comercio_id,
          activo:      true,
        })
      if (errU) throw new Error(`Usuario: ${errU.message}`)

      setOk(`✓ Invitación enviada a ${form.email}.`)
      setForm(FORM_USUARIO_VACIO)
      setShowForm(false)
      cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleActivo(id, activo) {
    if (!supabaseAdmin) return
    await supabaseAdmin.from('usuarios').update({ activo }).eq('id', id)
    setUsuarios(p => p.map(u => u.id === id ? { ...u, activo } : u))
  }

  async function resetPassword(userId, email) {
    if (!supabaseAdmin) return
    setResetting(userId)
    try {
      const { error } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email,
      })
      if (error) throw error
      setOk(`✓ Link de recuperación generado para ${email}. Supabase enviará el email automáticamente.`)
    } catch (e) {
      setError(e.message)
    } finally {
      setResetting(null)
    }
  }

  const comercioNombre = c =>
    c?.nombre_fantasia || c?.nombre || '—'

  return (
    <div className="sa-tab-content">
      {!supabaseAdmin && <NoAdminKey />}

      {ok && (
        <div className="sa-ok">
          <i className="ti ti-circle-check" /> {ok}
          <button className="sa-dismiss" onClick={() => setOk('')}><i className="ti ti-x" /></button>
        </div>
      )}

      <div className="sa-toolbar">
        <h2 className="sa-section-title">
          <i className="ti ti-users" />
          Usuarios del sistema
        </h2>
        <button
          className="btn btn--primary"
          onClick={() => { setShowForm(p => !p); setError('') }}
          disabled={!supabaseAdmin}
        >
          <i className={`ti ${showForm ? 'ti-x' : 'ti-user-plus'}`} />
          {showForm ? 'Cancelar' : 'Nuevo usuario'}
        </button>
      </div>

      {/* Formulario nuevo usuario */}
      {showForm && (
        <div className="sa-form-card">
          <p className="sa-form-title">Agregar usuario a un comercio</p>
          {error && <div className="sa-error"><i className="ti ti-alert-circle" /> {error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="sa-form-grid">
              <div className="field">
                <label className="field-label">Comercio *</label>
                <select className="field-select" value={form.comercio_id} onChange={e => setF('comercio_id', e.target.value)} required>
                  <option value="">— Seleccionar comercio —</option>
                  {comercios.map(c => (
                    <option key={c.id} value={c.id}>{comercioNombre(c)}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field-label">Rol</label>
                <select className="field-select" value={form.rol} onChange={e => setF('rol', e.target.value)}>
                  {ROLES_USUARIO.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="field-label">Nombre</label>
                <input className="field-input" value={form.nombre} onChange={e => setF('nombre', e.target.value)} placeholder="Nombre y apellido" />
              </div>
              <div className="field">
                <label className="field-label">Email *</label>
                <input className="field-input" type="email" value={form.email} onChange={e => setF('email', e.target.value)} placeholder="usuario@email.com" required />
                <span className="field-hint">Recibirá un email de invitación para setear su contraseña.</span>
              </div>
            </div>
            <div className="sa-form-actions">
              <button type="submit" className="btn btn--filled" disabled={saving}>
                <i className={`ti ${saving ? 'ti-loader-2' : 'ti-user-plus'}`} />
                {saving ? 'Enviando...' : 'Crear usuario y enviar invitación'}
              </button>
              <button type="button" className="btn" onClick={() => { setShowForm(false); setError('') }}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabla */}
      <div className="table-wrap">
        {loading ? (
          <div className="table-loading"><i className="ti ti-loader-2" style={{ fontSize: 24, opacity: 0.4 }} /></div>
        ) : usuarios.length === 0 ? (
          <div className="sa-empty"><i className="ti ti-users" /><p>No hay usuarios registrados.</p></div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Comercio</th>
                <th>Último acceso</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {usuarios.map(u => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 500 }}>{u.nombre || '—'}</td>
                  <td className="td-muted">{u.email}</td>
                  <td><RolBadge rol={u.rol} /></td>
                  <td className="td-muted">{comercioNombre(u.comercio)}</td>
                  <td className="td-muted">{fmtFull(u.ultimo_acceso)}</td>
                  <td><EstadoBadge activo={u.activo} /></td>
                  <td className="td-actions">
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button
                        className="btn-icon"
                        title="Resetear contraseña"
                        disabled={!supabaseAdmin || resetting === u.id}
                        onClick={() => resetPassword(u.id, u.email)}
                      >
                        <i className={`ti ${resetting === u.id ? 'ti-loader-2' : 'ti-key'}`} />
                      </button>
                      <button
                        className={`btn-icon${u.activo !== false ? ' btn-icon--danger' : ''}`}
                        title={u.activo !== false ? 'Desactivar usuario' : 'Activar usuario'}
                        disabled={!supabaseAdmin || u.rol === 'superadmin'}
                        onClick={() => toggleActivo(u.id, u.activo === false)}
                      >
                        <i className={`ti ${u.activo !== false ? 'ti-eye-off' : 'ti-eye'}`} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Tab Planes y accesos ─────────────────────────────────

function TabPlanes() {
  const [comercios,  setComercios]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(null) // id comercio guardando
  const [overrides,  setOverrides]  = useState({})  // { [comercioId]: Set<modulo> }

  useEffect(() => {
    if (!supabaseAdmin) { setLoading(false); return }
    supabaseAdmin
      .from('comercios')
      .select('id, nombre, nombre_fantasia, plan, activo, modulos_custom')
      .order('nombre')
      .then(({ data }) => {
        setComercios(data ?? [])
        // Inicializar overrides desde modulos_custom
        const ov = {}
        ;(data ?? []).forEach(c => {
          ov[c.id] = new Set(c.modulos_custom ?? [])
        })
        setOverrides(ov)
        setLoading(false)
      })
  }, [])

  function modulosEfectivos(c) {
    const base = new Set(PLAN_MODULOS[c.plan ?? 'basic'] ?? PLAN_MODULOS.basic)
    const custom = overrides[c.id] ?? new Set()
    // custom sobreescribe completamente (si tiene items, usa custom; si no, usa base)
    return custom.size > 0 ? custom : base
  }

  function toggleModulo(comercioId, moduloKey) {
    setOverrides(prev => {
      const comercio = comercios.find(c => c.id === comercioId)
      const base = new Set(PLAN_MODULOS[comercio?.plan ?? 'basic'] ?? PLAN_MODULOS.basic)
      const actual = prev[comercioId]?.size > 0 ? new Set(prev[comercioId]) : new Set(base)
      if (actual.has(moduloKey)) actual.delete(moduloKey)
      else actual.add(moduloKey)
      return { ...prev, [comercioId]: actual }
    })
  }

  async function guardarOverrides(comercioId) {
    if (!supabaseAdmin) return
    setSaving(comercioId)
    const modulos = [...(overrides[comercioId] ?? [])]
    await supabaseAdmin
      .from('comercios')
      .update({ modulos_custom: modulos })
      .eq('id', comercioId)
    setSaving(null)
  }

  function resetOverrides(comercioId) {
    setOverrides(prev => ({ ...prev, [comercioId]: new Set() }))
  }

  return (
    <div className="sa-tab-content">
      {!supabaseAdmin && <NoAdminKey />}

      {/* Tabla estática de planes */}
      <div className="sa-section">
        <h2 className="sa-section-title"><i className="ti ti-table" /> Módulos por plan</h2>
        <div className="table-wrap">
          <table className="data-table sa-plan-table">
            <thead>
              <tr>
                <th>Módulo</th>
                <th className="tc">Basic</th>
                <th className="tc">Pro</th>
                <th className="tc">Enterprise</th>
              </tr>
            </thead>
            <tbody>
              {TODOS_MODULOS.map(m => (
                <tr key={m.key}>
                  <td style={{ fontWeight: 500 }}>{m.label}</td>
                  {PLANES.map(p => (
                    <td key={p} className="tc">
                      {PLAN_MODULOS[p].includes(m.key)
                        ? <i className="ti ti-circle-check" style={{ color: 'var(--color-success)', fontSize: 15 }} />
                        : <i className="ti ti-circle-x"    style={{ color: 'var(--color-border-input)', fontSize: 15 }} />
                      }
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Overrides por comercio */}
      <div className="sa-section">
        <h2 className="sa-section-title">
          <i className="ti ti-adjustments-horizontal" />
          Accesos individuales por comercio
        </h2>
        <p className="sa-section-desc">
          Habilitá o deshabilitá módulos específicos por comercio, independientemente del plan.
          Los cambios personalizados se marcan con fondo azul.
        </p>

        {loading ? (
          <div className="table-loading"><i className="ti ti-loader-2" style={{ fontSize: 24, opacity: 0.4 }} /></div>
        ) : comercios.length === 0 ? (
          <div className="sa-empty"><i className="ti ti-building-store" /><p>No hay comercios registrados.</p></div>
        ) : (
          <div className="sa-overrides-list">
            {comercios.map(c => {
              const efectivos = modulosEfectivos(c)
              const base      = new Set(PLAN_MODULOS[c.plan ?? 'basic'] ?? PLAN_MODULOS.basic)
              const isDirty   = JSON.stringify([...(overrides[c.id] ?? [])].sort()) !== JSON.stringify([])
              return (
                <div key={c.id} className="sa-override-card">
                  <div className="sa-override-header">
                    <div>
                      <span className="sa-override-nombre">
                        {c.nombre_fantasia || c.nombre}
                      </span>
                      <PlanBadge plan={c.plan} />
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {isDirty && (
                        <button
                          className="btn"
                          style={{ fontSize: 11 }}
                          onClick={() => resetOverrides(c.id)}
                        >
                          <i className="ti ti-restore" /> Resetear al plan
                        </button>
                      )}
                      <button
                        className="btn btn--primary"
                        style={{ fontSize: 11 }}
                        disabled={!supabaseAdmin || saving === c.id}
                        onClick={() => guardarOverrides(c.id)}
                      >
                        <i className={`ti ${saving === c.id ? 'ti-loader-2' : 'ti-check'}`} />
                        {saving === c.id ? 'Guardando...' : 'Guardar'}
                      </button>
                    </div>
                  </div>
                  <div className="sa-modulos-grid">
                    {TODOS_MODULOS.map(m => {
                      const habilitado  = efectivos.has(m.key)
                      const esPlanBase  = base.has(m.key)
                      const esCustom    = (overrides[c.id]?.size > 0) && habilitado !== esPlanBase
                      return (
                        <button
                          key={m.key}
                          className={`sa-modulo-btn ${habilitado ? 'sa-modulo-btn--on' : 'sa-modulo-btn--off'} ${esCustom ? 'sa-modulo-btn--custom' : ''}`}
                          onClick={() => toggleModulo(c.id, m.key)}
                          disabled={!supabaseAdmin}
                        >
                          <i className={`ti ${habilitado ? 'ti-check' : 'ti-x'}`} />
                          {m.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── SuperAdmin principal ──────────────────────────────────

export default function SuperAdmin() {
  const [tab, setTab] = useState('comercios')

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <div>
          <h1 className="sa-page-title">Panel de administración</h1>
          <p className="sa-page-sub">Gestioná comercios, usuarios y planes del sistema GestCom.</p>
        </div>
      </div>

      <div className="sa-tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`sa-tab${tab === t.key ? ' sa-tab--active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <i className={`ti ${t.icon}`} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="sa-tab-body">
        {tab === 'comercios' && <TabComercios />}
        {tab === 'usuarios'  && <TabUsuarios  />}
        {tab === 'planes'    && <TabPlanes    />}
      </div>
    </div>
  )
}
