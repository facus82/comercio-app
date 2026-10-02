import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [loading, setLoading] = useState(true)

  async function fetchPerfil(userId) {
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', userId)
      .single()

    if (!usuario) { setPerfil(null); return }

    // Usuario desactivado por el administrador: cerrar sesión y explicar en el login
    if (usuario.activo === false) {
      await cerrarPorBloqueo('Tu usuario está desactivado. Consultá con el responsable del comercio.')
      return
    }

    // Superadmin no tiene comercio_id — saltear la query para evitar 400
    if (!usuario.comercio_id) {
      setPerfil({ ...usuario, comercio: null })
      return
    }

    const { data: comercio } = await supabase
      .from('comercios')
      .select('id, nombre, nombre_fantasia, localidad, provincia, condicion_iva, logo_url, cuit, direccion, telefono, ticket_pie, activo')
      .eq('id', usuario.comercio_id)
      .single()

    if (comercio?.activo === false) {
      await cerrarPorBloqueo('El comercio está suspendido. Comunicate con GestCom para reactivarlo.')
      return
    }

    setPerfil({ ...usuario, comercio: comercio ?? null })
  }

  async function cerrarPorBloqueo(motivo) {
    try { sessionStorage.setItem('gestcom-bloqueo', motivo) } catch {}
    setPerfil(null)
    await supabase.auth.signOut()
    if (window.location.pathname !== '/login') window.location.replace('/login')
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      if (session?.user) await fetchPerfil(session.user.id)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Link de "restablecer contraseña": aunque el mail redirija al inicio,
      // llevar al formulario de nueva contraseña (la sesión de recuperación ya está activa)
      if (_event === 'PASSWORD_RECOVERY' && window.location.pathname !== '/set-password') {
        window.location.replace('/set-password')
        return
      }
      setSession(session)
      if (session?.user) {
        fetchPerfil(session.user.id)
        // Registrar último acceso al iniciar sesión
        if (_event === 'SIGNED_IN') {
          supabase.from('usuarios')
            .update({ ultimo_acceso: new Date().toISOString() })
            .eq('id', session.user.id)
            .then(() => {})
        }
      } else {
        setPerfil(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email, password) {
    return supabase.auth.signInWithPassword({ email, password })
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function refreshPerfil() {
    if (session?.user) await fetchPerfil(session.user.id)
  }

  return (
    <AuthContext.Provider value={{ session, perfil, loading, signIn, signOut, refreshPerfil }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
