import { useEffect, useState } from 'react'
import PageHead from '../components/PageHead'
import { ActivityCard, DataCard, MfaCard } from '../components/SecuritySettings'
import { InstallCard } from '../components/InstallGuide'
import { IconInfo, IconLogout } from '../components/Icons'
import { useApp } from '../context/AppContext'
import { api } from '../lib/api'
import { CURRENCIES, friendlyError } from '../lib/format'
import { currentSubscription, disablePush, enablePush, pushSupported } from '../lib/push'
import { supabase } from '../lib/supabase'

export default function Ajustes() {
  const { user, profile, reloadProfile, notify, theme, toggleTheme } = useApp()
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('CLP')
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Santiago'
  const [pushOn, setPushOn] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const supported = pushSupported()
  const denied = supported && Notification.permission === 'denied'

  useEffect(() => {
    if (supported) currentSubscription().then((s) => setPushOn(Boolean(s))).catch(() => {})
  }, [supported])

  const saveProfile = (fields) => supabase.from('profiles').upsert({ id: user.id, timezone, ...fields })

  async function togglePush() {
    setPushBusy(true)
    try {
      if (pushOn) {
        await disablePush()
        setPushOn(false)
        notify('Recordatorios desactivados en este dispositivo')
      } else {
        await enablePush()
        const { error } = await saveProfile({ reminders_enabled: true })
        if (error) throw error
        setPushOn(true)
        notify('Recordatorios activados en este dispositivo')
        reloadProfile()
      }
    } catch (err) {
      notify(friendlyError(err), 'error')
    } finally {
      setPushBusy(false)
    }
  }

  async function setDaysBefore(v) {
    const { error } = await saveProfile({ remind_days_before: Number(v) })
    if (error) return notify(friendlyError(error), 'error')
    notify('Preferencia guardada')
    reloadProfile()
  }

  async function sendTest() {
    setPushBusy(true)
    try {
      const r = await api('/push/test', { method: 'POST' })
      notify(r.sent ? 'Notificación de prueba enviada' : 'No se pudo entregar la notificación', r.sent ? 'ok' : 'error')
    } catch (err) {
      notify(friendlyError(err), 'error')
    } finally {
      setPushBusy(false)
    }
  }

  useEffect(() => {
    setName(profile?.full_name ?? '')
    setCurrency(profile?.currency ?? 'CLP')
  }, [profile])

  async function save(e) {
    e.preventDefault()
    const { error } = await saveProfile({ full_name: name.trim() || null, currency })
    if (error) return notify(friendlyError(error), 'error')
    notify('Ajustes guardados')
    reloadProfile()
  }

  return (
    <>
      <PageHead eyebrow="Ajustes" title="Tu" accent="cuenta" picker={false} />
      <div className="grid grid-2 dc-rise" style={{ alignItems: 'start', gridAutoFlow: 'row dense' }}>
        <form className="card" onSubmit={save}>
          <h3 className="card-title">Perfil</h3>
          <p className="card-sub" style={{ marginBottom: 18 }}>{user?.email}</p>
          <div className="stack" style={{ gap: 14 }}>
            <label className="field">
              <span className="label">Nombre</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" />
            </label>
            <label className="field">
              <span className="label">Moneda</span>
              <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </label>
            <button className="btn dc-cta">Guardar</button>
          </div>
        </form>

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-head">
            <div>
              <h3 className="card-title">Recordatorios de gastos fijos</h3>
              <p className="card-sub">Te avisamos por notificación cuando un gasto fijo con día de vencimiento está por vencer y aún no lo marcas como pagado.</p>
            </div>
            {supported && <span className={`badge ${pushOn ? 'badge-ok' : ''}`}>{pushOn ? 'Activos en este dispositivo' : 'Inactivos'}</span>}
          </div>
          {!supported ? (
            <div className="alert alert-info"><IconInfo size={18} /><div>Este navegador no soporta notificaciones push. En iPhone primero instala la app (Compartir → "Agregar a inicio") y ábrela desde el ícono.</div></div>
          ) : denied ? (
            <div className="alert alert-warn"><IconInfo size={18} /><div>Bloqueaste las notificaciones para este sitio. Habilítalas desde el candado de la barra de direcciones y recarga.</div></div>
          ) : (
            <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
              <button className={`btn ${pushOn ? 'btn-ghost' : ''} dc-cta`} onClick={togglePush} disabled={pushBusy}>{pushOn ? 'Desactivar en este dispositivo' : 'Activar recordatorios'}</button>
              <label className="row" style={{ gap: 8 }}>
                <span className="muted" style={{ fontSize: 14 }}>Avisar</span>
                <select className="input input-sm" style={{ width: 150 }} value={profile?.remind_days_before ?? 2} onChange={(e) => setDaysBefore(e.target.value)}>
                  {[1, 2, 3, 5, 7].map((d) => <option key={d} value={d}>{d === 1 ? '1 día antes' : `${d} días antes`}</option>)}
                </select>
                <span className="muted" style={{ fontSize: 14 }}>y el mismo día</span>
              </label>
              {pushOn && <button className="btn btn-ghost btn-sm" onClick={sendTest} disabled={pushBusy}>Enviar prueba</button>}
            </div>
          )}
          <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>Configura el día de vencimiento de cada gasto fijo en Presupuesto (toca su nombre). Zona horaria: {timezone}.</p>
        </div>

        <MfaCard />
        <DataCard />
        <ActivityCard />

        <div className="card">
          <h3 className="card-title">App</h3>
          <div className="list" style={{ marginTop: 10 }}>
            <div className="list-row" style={{ gridTemplateColumns: '1fr auto' }}>
              <span>Tema</span>
              <button className="btn btn-ghost btn-sm" onClick={toggleTheme}>{theme === 'dark' ? 'Oscuro' : 'Claro'}</button>
            </div>
            <div className="list-row" style={{ gridTemplateColumns: '1fr' }}>
              <InstallCard />
            </div>
            <div className="list-row" style={{ gridTemplateColumns: '1fr auto' }}>
              <span>Sesión</span>
              <button className="btn btn-danger btn-sm" onClick={() => supabase.auth.signOut()}><IconLogout size={14} /> Cerrar sesión</button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
