import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import './Login.css'

export default function SetPassword() {
  const navigate  = useNavigate()
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [error,     setError]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [sessionOk, setSessionOk] = useState(false)

  useEffect(() => {
    // Supabase procesa automáticamente el token del hash de la URL
    // y dispara PASSWORD_RECOVERY (reset) o SIGNED_IN (invite)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) {
        setSessionOk(true)
      }
    })
    // Por si la sesión ya fue procesada antes de montar este componente
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionOk(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (password.length < 8)    { setError('La contraseña debe tener al menos 8 caracteres.'); return }
    if (password !== confirm)    { setError('Las contraseñas no coinciden.'); return }
    setLoading(true); setError('')
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) { setError(error.message); return }
    // Redirigir al dashboard (AppLayout se encarga de verificar el rol)
    navigate('/', { replace: true })
  }

  // Token inválido o link expirado
  if (!sessionOk) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-header">
            <div className="gestcom-icon-wrap">
              <div className="gestcom-icon">
                <span className="gestcom-lines" />
                <span className="gestcom-dot" />
              </div>
              <h1 className="gestcom-name">
                <span className="gestcom-gest">Gest</span><span className="gestcom-com">Com</span>
              </h1>
            </div>
          </div>
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <i className="ti ti-loader-2" style={{ fontSize: 28, color: '#94A3B8', display: 'block', marginBottom: 12 }} />
            <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>Verificando enlace...</p>
            <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 8 }}>
              Si este mensaje no desaparece, el link puede haber expirado.<br />
              Pedí un nuevo enlace al administrador.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="gestcom-icon-wrap">
            <div className="gestcom-icon">
              <span className="gestcom-lines" />
              <span className="gestcom-dot" />
            </div>
            <h1 className="gestcom-name">
              <span className="gestcom-gest">Gest</span><span className="gestcom-com">Com</span>
            </h1>
            <p className="gestcom-sub">Crear contraseña</p>
          </div>
        </div>

        <p style={{ fontSize: 13, color: '#64748B', textAlign: 'center', margin: '-8px 0 20px' }}>
          Bienvenido a GestCom. Creá tu contraseña para acceder al sistema.
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          {error && (
            <div className="login-error" role="alert">{error}</div>
          )}

          <div className="field">
            <label htmlFor="pw">Nueva contraseña</label>
            <input
              id="pw"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              required
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="pw2">Confirmar contraseña</label>
            <input
              id="pw2"
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repetir contraseña"
              required
            />
          </div>

          <button type="submit" className="btn-login" disabled={loading}>
            {loading ? 'Guardando...' : 'Crear contraseña e ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
