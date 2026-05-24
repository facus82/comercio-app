import { NavLink } from 'react-router-dom'
import './BottomNav.css'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Inicio',  icon: 'ti-layout-dashboard' },
  { to: '/ventas',    label: 'Ventas',  icon: 'ti-shopping-cart'    },
  { to: '/caja',      label: 'Caja',    icon: 'ti-cash'             },
  { to: '/stock',     label: 'Stock',   icon: 'ti-package'          },
]

export default function BottomNav({ onMenuOpen }) {
  return (
    <nav className="bottom-nav">
      {NAV_ITEMS.map(({ to, label, icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `bottom-nav-item${isActive ? ' bottom-nav-item--active' : ''}`
          }
        >
          <i className={`ti ${icon} bottom-nav-icon`} />
          <span className="bottom-nav-label">{label}</span>
        </NavLink>
      ))}

      {/* Botón "Más" abre el sidebar completo */}
      <button className="bottom-nav-item" onClick={onMenuOpen}>
        <i className="ti ti-menu-2 bottom-nav-icon" />
        <span className="bottom-nav-label">Más</span>
      </button>
    </nav>
  )
}
