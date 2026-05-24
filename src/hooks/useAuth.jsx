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

    // Superadmin no tiene comercio_id — saltear la query para evitar 400
    if (!usuario.comercio_id) {
      setPerfil({ ...usuario, comercio: null })
      return
    }

    const { data: comercio } = await supabase
      .from('comercios')
      .select('id, nombre, nombre_fantasia, localidad, provincia, condicion_iva, logo_url, cuit, direccion, telefono, ticket_pie')
      .eq('id', usuario.comercio_id)
      .single()

    setPerfil({ ...usuario, comercio: comercio ?? null })
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      if (session?.user) await fetchPerfil(session.user.id)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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

  return (
    <AuthContext.Provider value={{ session, perfil, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
