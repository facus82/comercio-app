import { useState } from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import Sidebar from './Sidebar'
import Header from './Header'
import BottomNav from './BottomNav'
import './AppLayout.css'

export default function AppLayout() {
  const { session, perfil, loading } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-spinner" />
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />
  if (perfil?.rol === 'superadmin') return <Navigate to="/superadmin" replace />

  return (
    <div className="app-layout">
      {/* Sidebar — visible en desktop, overlay en mobile */}
      <Sidebar menuOpen={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* Overlay oscuro al abrir menú en mobile */}
      {menuOpen && (
        <div className="sidebar-overlay" onClick={() => setMenuOpen(false)} />
      )}

      <div className="app-body">
        <Header onMenuToggle={() => setMenuOpen(p => !p)} />
        <main className="app-content">
          <Outlet />
        </main>
        {/* Barra inferior solo en mobile */}
        <BottomNav perfil={perfil} onMenuOpen={() => setMenuOpen(true)} />
      </div>
    </div>
  )
}
