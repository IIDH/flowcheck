import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import EmptyMonth from '../components/EmptyMonth'
import { useConfirm } from '../components/ConfirmDialog'
import PageHead from '../components/PageHead'
import { useQuickAdd } from '../components/QuickAdd'
import { IconPlus, IconTrash } from '../components/Icons'
import { useApp } from '../context/AppContext'
import { useAccounts, useMonth } from '../hooks/useMonth'
import { friendlyError, KINDS, money } from '../lib/format'
import { cacheGet, cacheSet, dropQueued, getOutbox, isNetworkError, subscribeOutbox } from '../lib/offline'
import { FREE_LABEL } from '../lib/freeBalance'
import { supabase } from '../lib/supabase'

const FILTERS = [
  { key: 'all', label: 'Todo', test: () => true },
  { key: 'gasto', label: 'Gastos', test: (t) => ['fijo', 'variable'].includes(t.accounts?.kind) && t.kind !== 'retiro' },
  { key: 'ingreso', label: 'Ingresos', test: (t) => t.accounts?.kind === 'ingreso' },
  { key: 'ahorro', label: 'Ahorro', test: (t) => t.accounts?.kind === 'ahorro' }
]

/** Todo lo anotado en el mes: gastos, ingresos y ahorro. Para anotar se usa la hoja "+". */
export default function Movimientos() {
  const { period, currency, notify, user } = useApp()
  const confirm = useConfirm()
  const openAdd = useQuickAdd()
  const { loading, month, reload: reloadMonth } = useMonth()
  const { accounts } = useAccounts()
  const [params, setParams] = useSearchParams()
  const [txs, setTxs] = useState(null)
  const [filter, setFilter] = useState('all')
  const [outbox, setOutbox] = useState(getOutbox)
  useEffect(() => subscribeOutbox(setOutbox), [])

  // Enlaces antiguos (/movimientos?nuevo=1) abren directo la hoja para anotar
  useEffect(() => {
    if (params.get('nuevo')) {
      openAdd({ mode: 'gasto' })
      setParams({}, { replace: true })
    }
  }, [params, setParams, openAdd])

  const loadTxs = useCallback(async () => {
    if (!month) return setTxs([])
    const { data, error } = await supabase
      .from('transactions')
      .select('*, accounts(name, kind, color, is_free)')
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
    window.addEventListener('fa-synced', loadTxs)
    return () => window.removeEventListener('fa-synced', loadTxs)
  }, [loadTxs])

  const test = FILTERS.find((x) => x.key === filter).test
  const all = useMemo(() => {
    const queued = month ? outbox.filter((t) => t.month_id === month.id).map((t) => ({ ...t, pending: true })) : []
    const ids = new Set(queued.map((t) => t.id))
    return [...queued, ...(txs ?? []).filter((t) => !ids.has(t.id))].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))
  }, [txs, outbox, month])
  const filtered = useMemo(() => all.filter(test), [all, test])

  const isPlus = (t) => t.accounts?.kind === 'ingreso' || t.kind === 'retiro'
  const totals = useMemo(() => {
    let out = 0
    let inn = 0
    for (const t of all) {
      if (isPlus(t)) inn += Number(t.amount)
      else if (t.accounts?.kind !== 'ahorro') out += Number(t.amount)
    }
    return { out, inn }
  }, [all])

  const byDay = useMemo(() => {
    const map = new Map()
    for (const t of filtered) {
      if (!map.has(t.occurred_on)) map.set(t.occurred_on, [])
      map.get(t.occurred_on).push(t)
    }
    return [...map.entries()]
  }, [filtered])

  async function remove(t) {
    if (!(await confirm({ tone: 'danger', title: '¿Borrar esto?', message: <><b>{t.accounts?.is_free ? FREE_LABEL : t.accounts?.name}</b> · {money(t.amount, currency)}{t.description ? ` · ${t.description}` : ''}<br />No se puede deshacer.</>, confirmText: 'Borrar' }))) return
    if (t.pending) return dropQueued(t.id)
    const { error } = await supabase.from('transactions').delete().eq('id', t.id)
    if (error) return notify(friendlyError(error), 'error')
    notify('Borrado')
    loadTxs()
    reloadMonth()
  }

  const head = (
    <PageHead eyebrow="Gastos" title="Lo que" accent="anotaste">
      {month && !month.closed && <button className="btn dc-cta fa-hide-sm" onClick={() => openAdd({ mode: 'gasto' })}><IconPlus size={16} /> Anotar</button>}
    </PageHead>
  )

  if (loading) return <>{head}<div className="skeleton" style={{ height: 380 }} /></>
  if (!month) return <>{head}<EmptyMonth hasAccounts={(accounts?.length ?? 1) > 0} onOpened={reloadMonth} /></>

  const dayLabel = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <>
      {head}
      <div className="card dc-rise">
        <div className="tx-summary num">
          <div><span className="dc-mono muted">Gastado</span><b>{money(totals.out, currency)}</b></div>
          <div><span className="dc-mono muted">Otros ingresos</span><b style={{ color: 'var(--ok)' }}>+{money(totals.inn, currency)}</b></div>
          <div><span className="dc-mono muted">Registros</span><b>{all.length}</b></div>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', margin: '16px 0' }}>
          {FILTERS.map((x) => (
            <button key={x.key} className={`chip ${filter === x.key ? 'on' : ''}`} onClick={() => setFilter(x.key)}>{x.label}</button>
          ))}
        </div>
        {txs === null ? (
          <div className="skeleton" style={{ height: 200 }} />
        ) : byDay.length === 0 ? (
          <div className="empty" style={{ padding: '32px 8px' }}>
            <p className="muted">{filter === 'all' ? 'Aún no anotas nada este mes.' : 'Nada de este tipo en el mes.'}</p>
            {!month.closed && <button className="btn dc-cta btn-sm" style={{ marginTop: 14 }} onClick={() => openAdd({ mode: filter === 'ingreso' ? 'ingreso' : filter === 'ahorro' ? 'ahorro' : 'gasto' })}><IconPlus size={14} /> Anotar</button>}
          </div>
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
                        <div style={{ fontWeight: 600 }}>{t.accounts?.is_free ? FREE_LABEL : t.accounts?.name}</div>
                        <div className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.pending && <span className="badge badge-warn" style={{ marginRight: 6 }}>Por sincronizar</span>}
                          {t.kind === 'retiro' && <span className="badge badge-danger" style={{ marginRight: 6 }}>Sacado de ahorro</span>}
                          {KINDS[t.accounts?.kind]?.label}{t.description ? ` · ${t.description}` : ''}
                        </div>
                      </div>
                    </div>
                    <b className="num" style={{ color: isPlus(t) ? 'var(--ok)' : 'var(--text)' }}>
                      {isPlus(t) ? '+' : '−'}{money(t.amount, currency)}
                    </b>
                    {!month.closed && (
                      <button className="dc-icon-btn" style={{ width: 32, height: 32 }} onClick={() => remove(t)} aria-label="Borrar">
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
    </>
  )
}
