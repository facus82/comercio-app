import { createBrowserRouter, Navigate } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'
import SuperAdminLayout from '../components/layout/SuperAdminLayout'
import Login from '../pages/auth/Login'
import SetPassword from '../pages/auth/SetPassword'
import Dashboard from '../pages/dashboard/Dashboard'
import Stock from '../pages/stock/Stock'
import Compras from '../pages/compras/Compras'
import Proveedores from '../pages/proveedores/Proveedores'
import Ventas from '../pages/ventas/Ventas'
import Presupuestos from '../pages/presupuestos/Presupuestos'
import Caja from '../pages/caja/Caja'
import Clientes from '../pages/clientes/Clientes'
import Obligaciones from '../pages/obligaciones/Obligaciones'
import Config from '../pages/config/Config'
import ComingSoon from '../components/shared/ComingSoon'
import SuperAdmin from '../pages/superadmin/SuperAdmin'

const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/set-password',
    element: <SetPassword />,
  },
  // ── Panel superadmin (layout propio, guard por rol) ──────
  {
    path: '/superadmin',
    element: <SuperAdminLayout />,
    children: [
      { index: true, element: <SuperAdmin /> },
    ],
  },
  // ── App normal (sidebar de comercio) ─────────────────────
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true,          element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard',    element: <Dashboard /> },
      { path: 'ventas',       element: <Ventas /> },
      { path: 'caja',         element: <Caja /> },
      { path: 'presupuestos', element: <Presupuestos /> },
      { path: 'stock',        element: <Stock /> },
      { path: 'compras',      element: <Compras /> },
      { path: 'clientes',     element: <Clientes /> },
      { path: 'proveedores',  element: <Proveedores /> },
      { path: 'obligaciones', element: <Obligaciones /> },
      { path: 'reportes',     element: <ComingSoon titulo="Reportes" /> },
      { path: 'config',       element: <Config /> },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
])

export default router
