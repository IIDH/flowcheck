import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import EmptyMonth from '../components/EmptyMonth'
import { useConfirm } from '../components/ConfirmDialog'
import PageHead from '../components/PageHead'
import { IconArrow, IconPlus, IconTrash } from '../components/Icons'
import { useApp } from '../context/AppContext'
import { useAccounts, useMonth } from '../hooks/useMonth'
import { todayISO } from '../lib/api'
import { friendlyError, KIND_ORDER, KINDS, money, parseAmount } from '../lib/format'
import { cacheGet, cacheSet, dropQueued, enqueue, getOutbox, isNetworkError, subscribeOutbox } from '../lib/offline'
import { ensureFreeAccount, FREE_COLOR, FREE_NAME, freeBalance } from '../lib/freeBalance'
import { supabase } from '../lib/supabase'

const FREE = '__free__'

const pad = (n) => String(n).padStart(2, '0')

export default function Movimientos() {
  const { period, currency, notify, user } = useApp()
  const confirm = useConfirm()
  const { loading, month, rows, carryIn, reload: reloadMonth } = useMonth()
  const { accounts, reload: reloadAccounts } = useAccounts()
  const [params, setParams] = useSearchParams()
  const amountRef = useRef(null)

  const first = `${period.year}-${pad(period.month)}-01`
  const last = `${period.year}-${pad(period.month)}-${pad(new Date(period.year, period.month, 0).getDate())}`
  const defaultDate = todayISO() >= first && todayISO() <= last ? todayISO() : first

  const [form, setForm] = useState({ account_id: '', amount: '', occurred_on: defaultDate, description: '' })
  const [busy, setBusy] = useState(false)
  const [txs, setTxs] = useState(null)
  const [filter, setFilter] = useState('all')
  const [outbox, setOutbox] = useState(getOutbox)
  useEffect(() => subscribeOutbox(setOutbox), [])

  useEffect(() => setForm((f) => ({ ...f, occurred_on: defaultDate })), [defaultDate])

  const loadTxs = useCallback(async () => {
    if (!month) return setTxs([])
    const { data, error } = await supabase
      .from('transactions')
      .select('*, accounts(name, kind, color)')
      .eq('month_id', month.id)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
    const key = `${user?.id}:txs:${month.id}`
    if (error) {
      if (isNetworkError(error)) return setTxs(cacheGet(key) ?? [])
      notify(friendlyError(error), 'error')
    }
    cacheSet(key, data ?? [])
    setTxs(data ?? [])
  }, [month, notify, user?.id])
  useEffect(() => { loadTxs() }, [loadTxs])
  useEffect(() => {
    const onSync = () => loadTxs()
    window.addEventListener('fa-synced', onSync)
    return () => window.removeEventListener('fa-synced', onSync)
  }, [loadTxs])

  useEffect(() => {
    if (params.get('nuevo') && month && amountRef.current) {
      amountRef.current.focus()
      setParams({}, { replace: true })
    }
  }, [params, month, setParams])

  const filtered = useMemo(() => {
    const queued = month ? outbox.filter((t) => t.month_id === month.id).map((t) => ({ ...t, pending: true })) : []
    const ids = new Set(queued.map((t) => t.id))
    return [...queued, ...(txs ?? []).filter((t) => !ids.has(t.id))]
      .filter((t) => filter === 'all' || t.accounts?.kind === filter)
      .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))
  }, [txs, outbox, month, filter])
  const total = filtered.reduce((s, t) => s + Number(t.amount), 0)
  const byDay = useMemo(() => {
    const map = new Map()
    for (const t of filtered) {
      if (!map.has(t.occurred_on)) map.set(t.occurred_on, [])
      map.get(t.occurred_on).push(t)
    }
    return [...map.entries()]
  }, [filtered])

  async function submit(e) {
    e.preventDefault()
    const amount = parseAmount(form.amount)
    if (!form.account_id) return notify('Elige una cuenta', 'error')
    if (!(amount > 0)) return notify('Ingresa un monto mayor a 0', 'error')
    if (!form.occurred_on || form.occurred_on < first || form.occurred_on > last) return notify('La fecha debe estar dentro del mes seleccionado', 'error')

    // Gasto desde el saldo libre: se registra en la cuenta de sistema "Saldo libre"
    let accountId = form.account_id
    if (accountId === FREE) {
      if (amount > free.left && !(await confirm({ tone: 'warn', title: 'Supera tu saldo libre', message: <>Te quedan <b>{money(Math.max(free.left, 0), currency)}</b> de saldo libre y este gasto es de <b>{money(amount, currency)}</b>. ¿Registrarlo igual?</>, confirmText: 'Registrar igual' }))) return
      try {
        const cached = accounts?.find((a) => a.is_free)
        accountId = cached ? cached.id : await ensureFreeAccount(accounts)
        if (!cached) reloadAccounts()
      } catch (err) {
        return notify(isNetworkError(err) ? 'Sin conexión: el primer gasto desde el saldo libre necesita internet' : friendlyError(err), 'error')
      }
    }
    const row = {
      id: crypto.randomUUID(),
      month_id: month.id,
      account_id: accountId,
      amount,
      occurred_on: form.occurred_on,
      description: form.description.trim() || null
    }
    const acc = accounts.find((a) => a.id === accountId) ?? (form.account_id === FREE ? { name: FREE_NAME, kind: 'variable', color: FREE_COLOR } : null)
    const queue = () => {
      enqueue({ ...row, accounts: { name: acc?.name, kind: acc?.kind, color: acc?.color } })
      notify('Sin conexión: guardado en el dispositivo, se sincroniza al volver la red')
      setForm((f) => ({ ...f, amount: '', description: '' }))
    }
    if (!navigator.onLine) return queue()
    setBusy(true)
    const { error } = await supabase.from('transactions').insert(row)
    setBusy(false)
    if (error) return isNetworkError(error) ? queue() : notify(friendlyError(error), 'error')
    notify(form.account_id === FREE ? 'Gasto registrado desde tu saldo libre' : 'Movimiento registrado')
    setForm((f) => ({ ...f, amount: '', description: '' }))
    amountRef.current?.focus()
    loadTxs()
    reloadMonth()
  }

  async function remove(id, pending) {
    const t = filtered.find((x) => x.id === id)
    if (!(await confirm({ tone: 'danger', title: '¿Eliminar este movimiento?', message: t ? <><b>{t.accounts?.name}</b> · {money(t.amount, currency)}{t.description ? ` · ${t.description}` : ''}<br />Esta acción no se puede deshacer.</> : 'Esta acción no se puede deshacer.', confirmText: 'Eliminar' }))) return
    if (pending) return dropQueued(id)
    const { error } = await supabase.from('transactions').delete().eq('id', id)
    if (error) return notify(friendlyError(error), 'error')
    notify('Movimiento eliminado')
    loadTxs()
  }

  const head = <PageHead eyebrow="Movimientos" title="Lo que vamos" accent="gastando" lead="Registra cada gasto, ahorro o ingreso extra. Se descuenta en vivo contra la imagen del mes." />

  if (loading) return <>{head}<div className="skeleton" style={{ height: 380 }} /></>
  if (!month) return <>{head}<EmptyMonth hasAccounts={(accounts?.length ?? 1) > 0} onOpened={reloadMonth} /></>

  const free = freeBalance({ income: month.income, carryIn, rows })

  const dayLabel = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <>
      {head}
      <div className="grid grid-main dc-rise" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Movimientos del mes</h3>
              <p className="card-sub num">{filtered.length} registros · {money(total, currency)}</p>
            </div>
          </div>
          <div className="row" style={{ flexWrap: 'wrap', marginBottom: 16 }}>
            <button className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>Todos</button>
            {KIND_ORDER.map((k) => (
              <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{KINDS[k].plural}</button>
            ))}
          </div>
          {txs === null ? (
            <div className="skeleton" style={{ height: 200 }} />
          ) : byDay.length === 0 ? (
            <p className="muted" style={{ padding: '24px 0' }}>Aún no hay movimientos {filter !== 'all' ? 'de este tipo ' : ''}en el mes.</p>
          ) : (
            byDay.map(([day, list]) => (
              <div key={day}>
                <div className="group-title"><span className="dc-mono muted">{dayLabel(day)}</span></div>
                <div className="list">
                  {list.map((t) => (
                    <div key={t.id} className="list-row tx-row">
                      <div className="row" style={{ minWidth: 0 }}>
                        <span className="swatch" style={{ background: t.accounts?.color }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>{t.accounts?.name}</div>
                          <div className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.pending && <span className="badge badge-warn" style={{ marginRight: 6 }}>Pendiente de sincronizar</span>}
                            {t.kind === 'retiro' && <span className="badge badge-danger" style={{ marginRight: 6 }}>Retiro de ahorro</span>}
                            {KINDS[t.accounts?.kind]?.label}{t.description ? ` · ${t.description}` : ''}
                          </div>
                        </div>
                      </div>
                      <b className="num" style={{ color: t.accounts?.kind === 'ingreso' || t.kind === 'retiro' ? 'var(--ok)' : 'var(--text)' }}>
                        {t.accounts?.kind === 'ingreso' || t.kind === 'retiro' ? '+' : '−'}{money(t.amount, currency)}
                      </b>
                      {!month.closed && (
                        <button className="dc-icon-btn" style={{ width: 32, height: 32 }} onClick={() => remove(t.id, t.pending)} aria-label="Eliminar movimiento">
                          <IconTrash size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <form className="card dc-current side-form" onSubmit={submit} noValidate>
          <h3 className="card-title">Nuevo movimiento</h3>
          <p className="card-sub" style={{ marginBottom: 18 }}>Se asigna a {month.closed ? 'un mes cerrado (solo lectura)' : 'la imagen de este mes'}.</p>
          {accounts && accounts.length === 0 ? (
            <Link to="/cuentas" className="btn dc-cta btn-block">Crea tus cuentas primero <IconArrow className="arrow" size={16} /></Link>
          ) : (
            <fieldset disabled={month.closed || busy} style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label className="field">
                <span className="label">Monto</span>
                <input ref={amountRef} className="input input-money" inputMode="decimal" placeholder="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={{ fontSize: 22, height: 54, fontFamily: 'var(--font-display)', fontWeight: 600 }} />
              </label>
              <label className="field">
                <span className="label">Cuenta</span>
                <select className="input" value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
                  <option value="">Elegir cuenta…</option>
                  {free.pool > 0 && (
                    <optgroup label="Plata sin asignar">
                      <option value={FREE}>{FREE_NAME} · quedan {money(Math.max(free.left, 0), currency)}</option>
                    </optgroup>
                  )}
                  {KIND_ORDER.map((k) => {
                    const list = (accounts ?? []).filter((a) => a.kind === k && !a.is_free)
                    return list.length ? (
                      <optgroup key={k} label={KINDS[k].plural}>
                        {list.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </optgroup>
                    ) : null
                  })}
                </select>
                {form.account_id === FREE && (
                  <span className="num" style={{ fontSize: 12, color: free.left - parseAmount(form.amount) < 0 ? 'var(--danger)' : 'var(--muted)' }}>
                    Sale de lo que no asignaste a ninguna cuenta. Después de este gasto te quedarían {money(free.left - parseAmount(form.amount), currency)}.
                  </span>
                )}
              </label>
              <label className="field">
                <span className="label">Fecha</span>
                <input type="date" className="input" min={first} max={last} value={form.occurred_on} onChange={(e) => setForm({ ...form, occurred_on: e.target.value })} required />
              </label>
              <label className="field">
                <span className="label">Detalle (opcional)</span>
                <input className="input" maxLength={140} placeholder="Ej: compra semanal" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </label>
              <button className="btn dc-cta btn-block"><IconPlus size={16} /> {busy ? 'Guardando…' : 'Registrar'}</button>
            </fieldset>
          )}
        </form>
      </div>
    </>
  )
}
