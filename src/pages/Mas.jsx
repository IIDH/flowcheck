import { Link } from 'react-router-dom'
import PageHead from '../components/PageHead'
import { IconArrow, IconGear, IconLogout, IconMoon, IconPiggy, IconSun } from '../components/Icons'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'

/** "Más" (móvil): lo que no cabe en la barra inferior. */
export default function Mas() {
  const { theme, toggleTheme, user } = useApp()
  return (
    <>
      <PageHead eyebrow="Más" title="Más" accent="opciones" picker={false} />
      <div className="card more-list dc-rise">
        <Link to="/ahorros" className="more-row">
          <span className="kpi-icon"><IconPiggy size={16} /></span>
          <span><b>Ahorros</b><small>Lo que llevas juntado y retiros</small></span>
          <IconArrow size={16} className="arrow" />
        </Link>
        <Link to="/ajustes" className="more-row">
          <span className="kpi-icon"><IconGear size={16} /></span>
          <span><b>Ajustes</b><small>Perfil, moneda, recordatorios y seguridad</small></span>
          <IconArrow size={16} className="arrow" />
        </Link>
        <button className="more-row" onClick={toggleTheme}>
          <span className="kpi-icon">{theme === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}</span>
          <span><b>Tema {theme === 'dark' ? 'claro' : 'oscuro'}</b><small>Cambiar la apariencia</small></span>
        </button>
        <button className="more-row" onClick={() => supabase.auth.signOut()}>
          <span className="kpi-icon"><IconLogout size={16} /></span>
          <span><b>Cerrar sesión</b><small>{user?.email}</small></span>
        </button>
      </div>
    </>
  )
}
