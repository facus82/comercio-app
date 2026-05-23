import { useAuth } from '../../hooks/useAuth'
import { Icon } from '../../lib/icons'
import './Header.css'

export default function Header() {
  const { perfil, signOut } = useAuth()

  const iniciales = perfil
    ? `${perfil.nombre?.[0] ?? ''}${perfil.apellido?.[0] ?? ''}`.toUpperCase() || 'U'
    : 'U'

  return (
    <header className="app-header">
      <div className="header-left" />

      <div className="header-right">
        <div className="header-user">
          <div className="header-avatar">{iniciales}</div>
          <div className="header-user-info">
            <span className="header-user-name">
              {perfil ? `${perfil.nombre} ${perfil.apellido ?? ''}`.trim() : '...'}
            </span>
            <span className="header-user-rol">{perfil?.rol ?? ''}</span>
          </div>
        </div>

        <button
          className="header-logout"
          onClick={signOut}
          title="Cerrar sesión"
          type="button"
        >
          <Icon name="logout" size={18} />
        </button>
      </div>
    </header>
  )
}
