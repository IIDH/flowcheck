import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { IconAlert, IconInfo } from './Icons'

const ConfirmCtx = createContext(null)

/**
 * Confirmaciones con el diseño de la app (reemplaza window.confirm).
 * Uso: const confirm = useConfirm()
 *      if (!(await confirm({ title, message, confirmText, tone: 'danger' }))) return
 */
export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null)
  const resolver = useRef(null)

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      resolver.current = resolve
      setDialog({ confirmText: 'Confirmar', cancelText: 'Cancelar', tone: 'primary', ...opts })
    })
  }, [])

  const close = useCallback((value) => {
    resolver.current?.(value)
    resolver.current = null
    setDialog(null)
  }, [])

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {dialog && <Dialog {...dialog} onClose={close} />}
    </ConfirmCtx.Provider>
  )
}

function Dialog({ title, message, confirmText, cancelText, tone, onClose }) {
  const confirmRef = useRef(null)

  useEffect(() => {
    confirmRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const danger = tone === 'danger'
  const warn = tone === 'warn'

  return (
    <div className="modal-backdrop confirm-backdrop" onClick={() => onClose(false)}>
      <div className="modal card confirm-card dc-rise" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-msg" onClick={(e) => e.stopPropagation()}>
        <div className={`confirm-icon ${danger ? 'danger' : warn ? 'warn' : ''}`}>
          {danger || warn ? <IconAlert size={22} /> : <IconInfo size={22} />}
        </div>
        <h2 id="confirm-title" style={{ fontSize: 20, marginTop: 16 }}>{title}</h2>
        {message && <div id="confirm-msg" className="confirm-msg">{message}</div>}
        <div className="row" style={{ marginTop: 22, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => onClose(false)}>{cancelText}</button>
          <button ref={confirmRef} className={`btn ${danger ? 'btn-danger-solid' : 'dc-cta'}`} onClick={() => onClose(true)}>{confirmText}</button>
        </div>
      </div>
    </div>
  )
}

export const useConfirm = () => useContext(ConfirmCtx)
