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
  // Link usado o vencido: Supabase lo informa en la URL (#error_code=otp_expired…)
  const [expirado,  setExpirado]  = useState(() =>
    /error_code=|error=access_denied/.test(window.location.hash + window.location.search))

  // Si en unos segundos no aparece la sesión, el link no sirve: no quedar girando para siempre
  useEffect(() => {
    if (sessionOk || expirado) return
    const t = setTimeout(() => setExpirado(true), 6000)
    return () => clearTimeout(t)
  }, [sessionOk, expirado])

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
          {expirado ? (
            <div className="setpass-estado">
              <i className="ti ti-link-off setpass-estado-icon" />
              <p className="setpass-estado-titulo">Este link ya se usó o venció</p>
              <p className="setpass-estado-txt">
                Los links para crear contraseña sirven una sola vez y duran 1 hora.
                Pedí uno nuevo desde el inicio de sesión con “¿Olvidaste tu contraseña?”.
              </p>
              <button type="button" className="btn-login" onClick={() => navigate('/login', { replace: true })}>
                Pedir un nuevo link
              </button>
            </div>
          ) : (
            <div className="setpass-estado">
              <i className="ti ti-loader-2 setpass-estado-icon setpass-spin" />
              <p className="setpass-estado-titulo">Verificando enlace...</p>
            </div>
          )}
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
              placeholder="Mínimo 8 caracteres"
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
