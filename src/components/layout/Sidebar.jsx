import { NavLink } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import './Sidebar.css'

const SECTIONS = [
  {
    label: 'OPERACIÓN',
    items: [
      { to: '/dashboard',    label: 'Inicio',       icon: 'ti-layout-dashboard' },
      { to: '/ventas',       label: 'Ventas',        icon: 'ti-shopping-cart'    },
      { to: '/caja',         label: 'Caja',          icon: 'ti-cash'             },
      { to: '/presupuestos', label: 'Presupuestos',  icon: 'ti-file-invoice'     },
    ],
  },
  {
    label: 'INVENTARIO',
    items: [
      { to: '/stock',   label: 'Stock',   icon: 'ti-package' },
      { to: '/compras', label: 'Compras', icon: 'ti-truck'   },
    ],
  },
  {
    label: 'REGISTRO',
    items: [
      { to: '/clientes',    label: 'Clientes',    icon: 'ti-users'          },
      { to: '/proveedores', label: 'Proveedores', icon: 'ti-building-store' },
    ],
  },
  {
    label: 'ADMIN',
    adminOnly: true,
    items: [
      { to: '/obligaciones', label: 'Obligaciones',  icon: 'ti-receipt-tax'      },
      { to: '/reportes',     label: 'Reportes',      icon: 'ti-chart-bar'        },
      { to: '/config',       label: 'Configuración', icon: 'ti-settings'         },
    ],
  },
]

export default function Sidebar() {
  const { perfil } = useAuth()

  const esPropietario = perfil?.rol === 'propietario'
  const comercioNombre = perfil?.comercio?.nombre_fantasia || perfil?.comercio?.nombre || 'Mi Comercio'
  const localidad      = perfil?.comercio?.localidad || 'Argentina'

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo">
          {perfil?.comercio?.logo_url
            ? <img src={perfil.comercio.logo_url} alt="Logo" className="sidebar-logo-img" />
            : comercioNombre.slice(0, 2).toUpperCase()
          }
        </div>
        <div className="sidebar-brand-text">
          <span className="sidebar-brand-name">{comercioNombre}</span>
          <span className="sidebar-brand-sub">{localidad} · Pro</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {SECTIONS.map(section => {
          if (section.adminOnly && !esPropietario) return null
          return (
            <div className="sidebar-section" key={section.label}>
              <span className="sidebar-section-label">{section.label}</span>
              {section.items.map(({ to, label, icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `sidebar-link${isActive ? ' sidebar-link--active' : ''}`
                  }
                >
                  <i className={`ti ${icon} sidebar-icon`} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-avatar">
            {perfil?.nombre?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className="sidebar-user-info">
            <span className="sidebar-user-name">{perfil?.nombre ?? '...'}</span>
            <span className="sidebar-user-rol">{perfil?.rol ?? ''}</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
