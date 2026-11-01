import { useMemo, useState } from 'react'
import CloseMonthDialog from '../components/CloseMonthDialog'
import { useConfirm } from '../components/ConfirmDialog'
import EmptyMonth from '../components/EmptyMonth'
import ImageBar from '../components/ImageBar'
import MoneyInput from '../components/MoneyInput'
import PageHead from '../components/PageHead'
import { IconCheck, IconLock, IconPlus, IconTrash } from '../components/Icons'
import { useApp } from '../context/AppContext'
import { useAccounts, useMonth } from '../hooks/useMonth'
import { api, todayISO } from '../lib/api'
import { friendlyError, KIND_ORDER, KINDS, money, pct, periodLabel } from '../lib/format'
import { CHART } from '../lib/palette'
import { supabase } from '../lib/supabase'

/** Fecha por defecto para un pago dentro del mes seleccionado. */
function dateInPeriod({ year, month }) {
  const today = todayISO()
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  return today.startsWith(prefix) ? today : `${prefix}-01`
}

export default function Plan() {
  const { period, currency, theme, notify } = useApp()
  const confirm = useConfirm()
  const c = CHART[theme]
  const { loading, month, rows, carryIn, reload } = useMonth()
  const [closing, setClosing] = useState(false)
  const { accounts } = useAccounts()
  const [adding, setAdding] = useState('')
  const accountDue = useMemo(() => Object.fromEntries((accounts ?? []).map((a) => [a.id, a.due_day])), [accounts])

  const run = async (fn, okMsg) => {
    const { error } = await fn()
    if (error) return notify(friendlyError(error), 'error')
    if (okMsg) notify(okMsg)
    reload()
  }

  const totals = useMemo(() => {
    const t = { fijo: 0, variable: 0, ahorro: 0 }
    for (const r of rows) if (r.kind in t) t[r.kind] += r.planned
    return t
  }, [rows])

  const head = <PageHead eyebrow="Mi mes" title="La imagen" accent="del mes" lead="Define la renta y cuánto va a cada cuenta. Cada mes nuevo parte de esta imagen y la vas ajustando." />

  if (loading) return <>{head}<div className="skeleton" style={{ height: 420 }} /></>
  if (!month) return <>{head}<EmptyMonth hasAccounts={(accounts?.length ?? 1) > 0} onOpened={reload} /></>

  const income = Number(month.income)
  const assigned = totals.fijo + totals.variable + totals.ahorro
  const planBase = income + carryIn
  const free = planBase - assigned
  const freeUsed = rows.filter((r) => r.is_free).reduce((s, r) => s + r.actual, 0)
  const actualOf = (kind) => rows.filter((r) => r.kind === kind).reduce((s, r) => s + r.actual, 0)
  const withdrawn = rows.reduce((s, r) => s + (r.withdrawn || 0), 0)
  const available = planBase + withdrawn + actualOf('ingreso') - actualOf('fijo') - actualOf('variable') - actualOf('ahorro')
  const closed = month.closed
  const notInPlan = (accounts ?? []).filter((a) => a.kind !== 'ingreso' && !a.is_free && !rows.some((r) => r.account_id === a.id && r.in_plan))

  const segments = [
    { key: 'fijo', label: 'Fijos', value: totals.fijo, color: c.fijo },
    { key: 'variable', label: 'Variables', value: totals.variable, color: c.variable },
    { key: 'ahorro', label: 'Ahorro', value: totals.ahorro, color: c.ahorro },
    { key: 'free', label: 'Sin asignar', value: Math.max(free, 0), color: c.free }
  ]

  const setIncome = (n) => run(() => supabase.from('months').update({ income: n }).eq('id', month.id), 'Renta actualizada')
  const setPlanned = (accountId, planned) =>
    run(() => supabase.from('budget_items').upsert({ month_id: month.id, account_id: accountId, planned }, { onConflict: 'month_id,account_id' }))
  const removeFromPlan = (accountId) => run(() => supabase.from('budget_items').delete().eq('month_id', month.id).eq('account_id', accountId), 'Cuenta quitada de la imagen')
  const addToPlan = () => {
    const acc = accounts.find((a) => a.id === adding)
    if (!acc) return
    setAdding('')
    run(() => supabase.from('budget_items').upsert({ month_id: month.id, account_id: acc.id, planned: acc.default_amount }, { onConflict: 'month_id,account_id' }), `${acc.name} agregada`)
  }
  const pay = (r) =>
    run(
      () => supabase.from('transactions').insert({ month_id: month.id, account_id: r.account_id, amount: r.planned - r.actual, occurred_on: dateInPeriod(period), description: 'Pago registrado desde Mi mes' }),
      `${r.name} marcada como pagada`
    )
  const deleteMonth = async () => {
    const txCount = rows.filter((r) => r.actual > 0).length
    const ok = await confirm({
      tone: 'danger',
      title: `¿Eliminar la imagen de ${periodLabel(period)}?`,
      message: (
        <>
          Se borran la renta, lo planificado y <b>todos los movimientos</b> de ese mes{txCount ? ', incluidos los aportes a ahorros (dejarán de sumar al saldo acumulado)' : ''}. Tus cuentas no se tocan.
          <br /><br />Esta acción no se puede deshacer.
        </>
      ),
      confirmText: 'Eliminar imagen'
    })
    if (!ok) return
    const { error } = await supabase.from('months').delete().eq('id', month.id)
    if (error) return notify(friendlyError(error), 'error')
    notify(`Imagen de ${periodLabel(period)} eliminada`)
    reload()
  }

  const toggleClosed = async () => {
    if (!closed) return setClosing(true)
    if (!(await confirm({ title: `¿Reabrir ${periodLabel(period)}?`, message: 'Lo que había pasado al mes siguiente se anula. Si mandaste sobrante a un ahorro, ese aporte se mantiene en Movimientos (puedes borrarlo ahí). Al volver a cerrar se recalcula.', confirmText: 'Reabrir mes' }))) return
    try {
      await api('/months/close', { method: 'POST', body: { ...period, reopen: true } })
      notify('Mes reabierto')
      reload()
    } catch (err) {
      notify(friendlyError(err), 'error')
    }
  }

  return (
    <>
      {head}
      <div className="stack dc-rise">
        <div className="grid grid-main">
          <div className="card">
            <div className="card-head">
              <div>
                <h3 className="card-title">Renta del mes</h3>
                <p className="card-sub">Tu ingreso base. Los ingresos extra se registran como movimientos.</p>
              </div>
              {closed && <span className="badge"><IconLock size={12} /> Cerrado</span>}
            </div>
            <div style={{ maxWidth: 320 }}>
              <MoneyInput value={income} onCommit={setIncome} disabled={closed} aria-label="Renta del mes" style={{ fontSize: 22, height: 54, fontFamily: 'var(--font-display)', fontWeight: 600 }} />
            </div>
            {carryIn !== 0 && (
              <p className="num" style={{ marginTop: 12, fontSize: 14 }}>
                <span className="muted">Del mes anterior: </span>
                <b style={{ color: carryIn < 0 ? 'var(--danger)' : 'var(--ok)' }}>{carryIn < 0 ? '−' : '+'}{money(Math.abs(carryIn), currency)}</b>
                <span className="muted"> · disponible para planificar {money(planBase, currency)}</span>
              </p>
            )}
            <div style={{ marginTop: 22 }}>
              <ImageBar segments={segments} total={planBase} currency={currency} />
            </div>
          </div>

          <div className="card">
            <h3 className="card-title">Resumen de la imagen</h3>
            <div className="list" style={{ marginTop: 12 }}>
              {['fijo', 'variable', 'ahorro'].map((k) => (
                <div key={k} className="list-row" style={{ gridTemplateColumns: '1fr auto auto' }}>
                  <span className="row"><span className="swatch" style={{ background: c[k] }} />{KINDS[k].plural}</span>
                  <span className="muted num" style={{ fontSize: 13 }}>{pct(planBase > 0 ? totals[k] / planBase : 0)}</span>
                  <b className="num">{money(totals[k], currency)}</b>
                </div>
              ))}
              {carryIn !== 0 && (
                <div className="list-row" style={{ gridTemplateColumns: '1fr auto' }}>
                  <span className="muted">Del mes anterior</span>
                  <b className="num" style={{ color: carryIn < 0 ? 'var(--danger)' : 'var(--text)' }}>{carryIn < 0 ? '−' : '+'}{money(Math.abs(carryIn), currency)}</b>
                </div>
              )}
              <div className="list-row" style={{ gridTemplateColumns: '1fr auto' }}>
                <span style={{ fontWeight: 600 }}>{free >= 0 ? 'Sin asignar' : 'Exceso sobre lo disponible'}</span>
                <b className="num" style={{ color: free >= 0 ? 'var(--text)' : 'var(--danger)' }}>{money(Math.abs(free), currency)}</b>
              </div>
              {withdrawn > 0 && (
                <div className="list-row" style={{ gridTemplateColumns: '1fr auto' }}>
                  <span className="muted">Retirado de ahorros</span>
                  <b className="num">+{money(withdrawn, currency)}</b>
                </div>
              )}
              {(freeUsed > 0 || withdrawn > 0) && (
                <>
                  <div className="list-row" style={{ gridTemplateColumns: '1fr auto' }}>
                    <span className="muted">Gastado desde el saldo libre</span>
                    <b className="num">−{money(freeUsed, currency)}</b>
                  </div>
                  <div className="list-row" style={{ gridTemplateColumns: '1fr auto' }}>
                    <span style={{ fontWeight: 600 }}>Saldo libre que queda</span>
                    <b className="num" style={{ color: free + withdrawn - freeUsed < 0 ? 'var(--danger)' : 'var(--ok)' }}>{money(free + withdrawn - freeUsed, currency)}</b>
                  </div>
                </>
              )}
            </div>
            <button className={`btn ${closed ? 'btn-ghost' : 'btn-danger'} btn-block btn-sm`} style={{ marginTop: 16 }} onClick={toggleClosed}>
              <IconLock size={14} /> {closed ? 'Reabrir mes' : 'Cerrar mes (solo lectura)'}
            </button>
            {closed ? (
              <p className="muted" style={{ fontSize: 12, marginTop: 10, textAlign: 'center' }}>Para eliminar la imagen, primero reabre el mes.</p>
            ) : (
              <button className="btn btn-ghost btn-block btn-sm" style={{ marginTop: 8, color: 'var(--danger)' }} onClick={deleteMonth}>
                <IconTrash size={14} /> Eliminar imagen del mes
              </button>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Cuentas planificadas</h3>
              <p className="card-sub">Edita el monto y presiona Enter o sal del campo para guardar.</p>
            </div>
            {!closed && notInPlan.length > 0 && (
              <div className="row">
                <select className="input input-sm" value={adding} onChange={(e) => setAdding(e.target.value)} style={{ width: 200 }} aria-label="Cuenta a agregar">
                  <option value="">Agregar cuenta…</option>
                  {notInPlan.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <button className="btn btn-sm dc-cta" onClick={addToPlan} disabled={!adding}><IconPlus size={14} /> Agregar</button>
              </div>
            )}
          </div>

          {KIND_ORDER.filter((k) => k !== 'ingreso').map((kind) => {
            const list = rows.filter((r) => r.kind === kind && !r.is_free).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
            if (!list.length) return null
            return (
              <div key={kind}>
                <div className="group-title">
                  <span className="dc-mono muted row" style={{ gap: 8 }}><span className="swatch" style={{ background: c[kind] }} />{KINDS[kind].plural}</span>
                  <span className="dc-mono muted">Planificado · Real</span>
                </div>
                <div className="list">
                  {list.map((r) => {
                    const done = r.planned > 0 && r.actual >= r.planned
                    const over = kind !== 'ahorro' && r.actual > r.planned
                    return (
                      <div key={r.account_id} className="list-row plan-row">
                        <div className="row" style={{ minWidth: 0 }}>
                          <span className="swatch" style={{ background: r.color }} />
                          <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                          {kind === 'fijo' && accountDue[r.account_id] && !done && <span className="badge">día {accountDue[r.account_id]}</span>}
                          {done && <span className="badge badge-ok"><IconCheck size={11} /> {kind === 'ahorro' ? 'Meta' : 'Pagado'}</span>}
                          {over && <span className="badge badge-danger">Excedido</span>}
                        </div>
                        <MoneyInput value={r.planned} onCommit={(n) => setPlanned(r.account_id, n)} disabled={closed} className="input-sm" aria-label={`Planificado ${r.name}`} />
                        <span className="num" style={{ textAlign: 'right', fontSize: 14, color: over ? 'var(--danger)' : 'var(--muted)' }}>{money(r.actual, currency)}</span>
                        <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                          {!closed && (kind === 'fijo' || kind === 'ahorro') && r.planned > r.actual && (
                            <button className="dc-icon-btn" style={{ width: 32, height: 32 }} onClick={() => pay(r)} title={kind === 'ahorro' ? 'Registrar ahorro' : 'Marcar pagado'} aria-label="Marcar pagado">
                              <IconCheck size={14} />
                            </button>
                          )}
                          {!closed && r.actual === 0 && (
                            <button className="dc-icon-btn" style={{ width: 32, height: 32 }} onClick={() => removeFromPlan(r.account_id)} title="Quitar de la imagen" aria-label="Quitar de la imagen">
                              <IconTrash size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {rows.filter((r) => r.kind !== 'ingreso' && !r.is_free).length === 0 && <p className="muted">No hay cuentas en la imagen. Agrégalas arriba o crea cuentas nuevas.</p>}
        </div>
      </div>
      {closing && (
        <CloseMonthDialog
          available={Math.round(available * 100) / 100}
          savingsAccounts={(accounts ?? []).filter((a) => a.kind === 'ahorro')}
          onClose={() => setClosing(false)}
          onDone={() => { setClosing(false); reload() }}
        />
      )}
    </>
  )
}
