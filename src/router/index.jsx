import { lazy } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'
import SuperAdminLayout from '../components/layout/SuperAdminLayout'
import Login from '../pages/auth/Login'
import SetPassword from '../pages/auth/SetPassword'
import Dashboard from '../pages/dashboard/Dashboard'
import SuperAdmin from '../pages/superadmin/SuperAdmin'

// Páginas cargadas bajo demanda: el bundle inicial sólo trae login, layout y dashboard
const Stock           = lazy(() => import('../pages/stock/Stock'))
const Compras         = lazy(() => import('../pages/compras/Compras'))
const CompraFormPage  = lazy(() => import('../pages/compras/CompraFormPage'))
const Proveedores     = lazy(() => import('../pages/proveedores/Proveedores'))
const Ventas          = lazy(() => import('../pages/ventas/Ventas'))
const Presupuestos    = lazy(() => import('../pages/presupuestos/Presupuestos'))
const Caja            = lazy(() => import('../pages/caja/Caja'))
const Clientes        = lazy(() => import('../pages/clientes/Clientes'))
const Obligaciones    = lazy(() => import('../pages/obligaciones/Obligaciones'))
const Config          = lazy(() => import('../pages/config/Config'))
const Reportes        = lazy(() => import('../pages/reportes/Reportes'))

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
      { path: 'compras',       element: <Compras /> },
      { path: 'compras/nueva', element: <CompraFormPage /> },
      { path: 'clientes',     element: <Clientes /> },
      { path: 'proveedores',  element: <Proveedores /> },
      { path: 'obligaciones', element: <Obligaciones /> },
      { path: 'reportes',     element: <Reportes /> },
      { path: 'config',       element: <Config /> },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
])

export default router
