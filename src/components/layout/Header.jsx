import { useAuth } from '../../hooks/useAuth'
import { Icon } from '../../lib/icons'
import { useTema, TEMA_INFO } from '../../hooks/useTema'
import './Header.css'

export default function Header({ onMenuToggle }) {
  const { perfil, signOut } = useAuth()
  const { tema, siguiente } = useTema()

  const iniciales = perfil
    ? `${perfil.nombre?.[0] ?? ''}${perfil.apellido?.[0] ?? ''}`.toUpperCase() || 'U'
    : 'U'

  return (
    <header className="app-header">
      <div className="header-left">
        {/* Botón hamburguesa — solo visible en mobile */}
        <button
          className="header-menu-btn"
          onClick={onMenuToggle}
          title="Menú"
          type="button"
        >
          <i className="ti ti-menu-2" />
        </button>
        {/* En celular no hay sidebar: el nombre del comercio va en el encabezado */}
        <span className="header-comercio">{perfil?.comercio?.nombre_fantasia || perfil?.comercio?.nombre || ''}</span>
      </div>

      <div className="header-right">
        <button
          className="header-tema"
          onClick={siguiente}
          title={`${TEMA_INFO[tema].label} — tocá para cambiar`}
          aria-label={TEMA_INFO[tema].label}
          type="button"
        >
          <i className={`ti ${TEMA_INFO[tema].icon}`} />
        </button>

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
