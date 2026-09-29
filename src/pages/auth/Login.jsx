import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import './Login.css'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [recupero, setRecupero] = useState(null)   // null | 'enviando' | 'enviado'

  // Envía el link de recuperación; vuelve a /set-password para elegir la nueva contraseña
  async function handleOlvide() {
    setError('')
    if (!email.trim()) { setError('Escribí tu email arriba y tocá de nuevo "¿Olvidaste tu contraseña?".'); return }
    setRecupero('enviando')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/set-password`,
    })
    if (error) { setRecupero(null); setError('No se pudo enviar el email. Probá de nuevo en unos minutos.'); return }
    setRecupero('enviado')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) {
      setError('Email o contraseña incorrectos.')
    } else {
      navigate('/', { replace: true })
    }
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
            <p className="gestcom-sub">Gestión comercial</p>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@email.com"
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className="btn-login" disabled={loading}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>

          {recupero === 'enviado' ? (
            <p className="login-recupero login-recupero--ok">
              Si <strong>{email}</strong> tiene una cuenta, te enviamos un email con el link para crear una nueva contraseña.
            </p>
          ) : (
            <button type="button" className="login-olvide" onClick={handleOlvide} disabled={recupero === 'enviando'}>
              {recupero === 'enviando' ? 'Enviando...' : '¿Olvidaste tu contraseña?'}
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
