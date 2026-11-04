import { useEffect, useState } from 'react'
import { CHROME_STORE_URL, chromeIntentUrl, dismissInstall, installDismissed, installPlan, promptInstall, subscribeInstall } from '../lib/install'
import { IconDownload, IconX } from './Icons'

function useInstallPlan() {
  const [plan, setPlan] = useState(installPlan)
  useEffect(() => {
    const refresh = () => setPlan(installPlan())
    const mq = window.matchMedia?.('(display-mode: standalone)')
    mq?.addEventListener?.('change', refresh)
    const unsub = subscribeInstall(refresh)
    return () => {
      unsub()
      mq?.removeEventListener?.('change', refresh)
    }
  }, [])
  return plan
}

/** Instrucciones y acción para instalar, según navegador y dispositivo. */
function Steps({ plan, compact }) {
  const [busy, setBusy] = useState(false)
  const install = async () => {
    setBusy(true)
    await promptInstall()
    setBusy(false)
  }

  switch (plan.kind) {
    case 'prompt':
      return (
        <>
          {!compact && <p className="install-text">Queda en tu pantalla de inicio como cualquier app y funciona sin conexión.</p>}
          <button className="btn dc-cta btn-sm" onClick={install} disabled={busy}><IconDownload size={14} /> Instalar app</button>
        </>
      )
    case 'chrome-menu':
      return <p className="install-text">Toca <b>⋮</b> arriba a la derecha y elige <b>Instalar app</b> (o <b>Agregar a pantalla principal</b>).</p>
    case 'other-android':
      return (
        <>
          <p className="install-text">
            En Android instala la app desde <b>Chrome</b>. Si la instalas desde {plan.browser}, Android puede bloquearla con el aviso "se diseñó para una versión anterior": ese paquete lo arma el navegador, no la app.
          </p>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <a className="btn dc-cta btn-sm" href={chromeIntentUrl()}>Abrir en Chrome</a>
            {!compact && <a className="btn btn-ghost btn-sm" href={CHROME_STORE_URL} target="_blank" rel="noreferrer">No tengo Chrome</a>}
          </div>
          {!compact && <p className="install-note">Ya en Chrome: toca <b>⋮</b> → <b>Instalar app</b>.</p>}
        </>
      )
    case 'in-app':
      return (
        <>
          <p className="install-text">
            Estás viendo Flowcheck dentro de {plan.app}, donde no se puede instalar. {plan.ios ? <>Toca <b>···</b> y elige <b>Abrir en Safari</b>.</> : <>Ábrela en tu navegador desde el menú <b>⋮</b> → <b>Abrir en Chrome</b>.</>}
          </p>
          {plan.android && <a className="btn dc-cta btn-sm" href={chromeIntentUrl()}>Abrir en Chrome</a>}
        </>
      )
    case 'ios-safari':
      return <p className="install-text">Toca <b>Compartir</b> <span className="ios-share" aria-hidden="true">⬆︎</span> abajo y elige <b>Agregar a inicio</b>.</p>
    case 'ios-other':
      return <p className="install-text">Toca <b>Compartir</b> y elige <b>Agregar a inicio</b>. Si no aparece, ábrela en <b>Safari</b> y hazlo desde ahí.</p>
    case 'desktop-manual':
      return <p className="install-text">En Chrome o Edge, usa el ícono de instalar en la barra de direcciones. En Safari (Mac): Archivo → <b>Agregar al Dock</b>.</p>
    default:
      return null
  }
}

/** Aviso compacto y descartable (arriba en el inicio y en el login). */
export function InstallBanner() {
  const plan = useInstallPlan()
  const [hidden, setHidden] = useState(installDismissed)
  // En escritorio sin botón nativo no insistimos; ahí basta la tarjeta de Ajustes
  if (hidden || plan.kind === 'installed' || plan.kind === 'desktop-manual') return null
  return (
    <div className={`install-banner ${plan.kind === 'other-android' || plan.kind === 'in-app' ? 'warn' : ''}`} role="region" aria-label="Instalar la app">
      <div style={{ minWidth: 0, flex: 1 }}>
        <b className="install-title">{plan.kind === 'other-android' ? 'Para instalar la app usa Chrome' : plan.kind === 'in-app' ? 'Ábrela en tu navegador' : 'Instala Flowcheck en tu celular'}</b>
        <Steps plan={plan} compact />
      </div>
      <button className="icon-mini" onClick={() => { dismissInstall(); setHidden(true) }} aria-label="Ocultar"><IconX size={13} /></button>
    </div>
  )
}

/** Tarjeta completa (Ajustes y Más). */
export function InstallCard() {
  const plan = useInstallPlan()
  return (
    <div className="install-card">
      <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
        <b>Instalar Flowcheck</b>
        {plan.kind === 'installed' && <span className="badge badge-ok">Instalada</span>}
      </div>
      {plan.kind === 'installed' ? <p className="install-text">Ya estás usando la app instalada.</p> : <Steps plan={plan} />}
    </div>
  )
}
