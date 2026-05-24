import { Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import './SuperAdminLayout.css'

export default function SuperAdminLayout() {
  const { perfil, loading, signOut } = useAuth()

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-spinner" />
      </div>
    )
  }

  if (!perfil) return <Navigate to="/login" replace />
  if (perfil.rol !== 'superadmin') return <Navigate to="/" replace />

  return (
    <div className="sa-layout">
      <header className="sa-header">
        <div className="sa-header-brand">
          {/* Mini logo GestCom */}
          <div className="sa-logo-icon">
            <span className="sa-logo-lines" />
            <span className="sa-logo-dot" />
          </div>
          <div className="sa-header-title">
            <span className="sa-brand-gest">Gest</span>
            <span className="sa-brand-com">Com</span>
            <span className="sa-badge-sa">superadmin</span>
          </div>
        </div>

        <div className="sa-header-right">
          <span className="sa-user-email">
            <i className="ti ti-user-circle" />
            {perfil.nombre ?? perfil.email}
          </span>
          <button className="sa-btn-logout" onClick={signOut}>
            <i className="ti ti-logout" />
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="sa-main">
        <Outlet />
      </main>
    </div>
  )
}
