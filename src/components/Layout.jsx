import { Link, NavLink, Outlet } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { IconCalendar, IconGear, IconHome, IconList, IconLogo, IconLogout, IconMoon, IconPiggy, IconPlus, IconSun, IconWallet } from './Icons'

const NAV = [
  { to: '/', label: 'Dashboard', short: 'Inicio', icon: IconHome, end: true },
  { to: '/mes', label: 'Mi mes', short: 'Mi mes', icon: IconCalendar },
  { to: '/movimientos', label: 'Movimientos', short: 'Gastos', icon: IconList },
  { to: '/ahorros', label: 'Ahorros', short: 'Ahorros', icon: IconPiggy },
  { to: '/cuentas', label: 'Cuentas', short: 'Cuentas', icon: IconWallet }
]

export function Logo() {
  return (
    <Link to="/" className="fa-logo" aria-label="Flowcheck inicio">
      <span className="fa-logo-mark"><IconLogo size={18} /></span>
      <span>flow<b>check</b></span>
    </Link>
  )
}

export default function Layout() {
  const { theme, toggleTheme, online, pending } = useApp()

  return (
    <>
      {/* Destellos de fondo: capa fija a pantalla completa, detrás de todo */}
      <div className="fa-glows" aria-hidden="true">
        <div className="dc-glow" style={{ width: 560, height: 560, top: -220, right: -160, background: 'color-mix(in oklab, var(--primary) 18%, transparent)' }} />
        <div className="dc-glow" style={{ width: 420, height: 420, top: '45%', left: -200, background: 'color-mix(in oklab, var(--primary-2) 12%, transparent)', animationDelay: '-6s' }} />
      </div>
      <header className="fa-header">
        <div className="fa-header-inner">
          <Logo />
          <nav className="fa-nav" aria-label="Principal">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className="dc-nav-link">
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="fa-header-actions">
            <button className="dc-icon-btn" onClick={toggleTheme} aria-label="Cambiar tema" title="Cambiar tema">
              {theme === 'dark' ? <IconSun size={17} /> : <IconMoon size={17} />}
            </button>
            <Link to="/ajustes" className="dc-icon-btn" aria-label="Ajustes" title="Ajustes">
              <IconGear size={17} />
            </Link>
            <button className="dc-icon-btn fa-hide-sm" onClick={() => supabase.auth.signOut()} aria-label="Cerrar sesión" title="Cerrar sesión">
              <IconLogout size={17} />
            </button>
            <Link to="/movimientos?nuevo=1" className="btn btn-sm dc-cta">
              <IconPlus size={16} /> <span className="fa-hide-sm">Registrar gasto</span>
            </Link>
          </div>
        </div>
      </header>

      {(!online || pending > 0) && (
        <div className={`fa-offline ${online ? 'syncing' : ''}`} role="status">
          <span className="pill-dot" />
          {!online
            ? `Sin conexión · tus movimientos se guardan en este dispositivo${pending ? ` (${pending} pendiente${pending === 1 ? '' : 's'})` : ''}`
            : `Sincronizando ${pending} movimiento${pending === 1 ? '' : 's'}…`}
        </div>
      )}

      <main className="fa-main">
        <Outlet />
      </main>

      <nav className="fa-tabbar" aria-label="Navegación móvil">
        {NAV.map(({ to, short, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}>
            <Icon size={20} />
            {short}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
