import { Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import Sidebar from './Sidebar'
import Header from './Header'
import './AppLayout.css'

export default function AppLayout() {
  const { session, perfil, loading } = useAuth()

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-spinner" />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  // Superadmin tiene su propio layout — no usa el sidebar de comercio
  if (perfil?.rol === 'superadmin') {
    return <Navigate to="/superadmin" replace />
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="app-body">
        <Header />
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
