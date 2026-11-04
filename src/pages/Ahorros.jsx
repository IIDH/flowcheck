import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHead from '../components/PageHead'
import WithdrawDialog from '../components/WithdrawDialog'
import { IconAlert, IconArrow, IconPiggy } from '../components/Icons'
import { useApp } from '../context/AppContext'
import { friendlyError, money } from '../lib/format'
import { supabase } from '../lib/supabase'

/** Ahorros: saldo de cada cuenta, retiros con motivo y la historia completa. */
export default function Ahorros() {
  const { currency } = useApp()
  const [balances, setBalances] = useState(null)
  const [history, setHistory] = useState(null)
  const [filter, setFilter] = useState('all')
  const [withdrawing, setWithdrawing] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const [b, h] = await Promise.all([
      supabase.from('account_balances').select('*').eq('archived', false).order('name'),
      supabase
        .from('transactions')
        .select('id, amount, kind, occurred_on, description, account_id, accounts!inner(name, color, kind)')
        .eq('accounts.kind', 'ahorro')
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(300)
    ])
    if (b.error || h.error) {
      setError(friendlyError(b.error || h.error))
      return
    }
    setError(null)
    setBalances(b.data.map((x) => ({ ...x, balance: Number(x.balance), opening_balance: Number(x.opening_balance), contributed: Number(x.contributed), withdrawn: Number(x.withdrawn ?? 0) })))
    setHistory(h.data)
  }, [])
  useEffect(() => { load() }, [load])

  const total = (balances ?? []).reduce((s, b) => s + b.balance, 0)
  const withdrawnTotal = (balances ?? []).reduce((s, b) => s + b.withdrawn, 0)
  const rows = useMemo(() => {
    const list = (history ?? []).filter((t) => filter === 'all' || (filter === 'retiro' ? t.kind === 'retiro' : t.account_id === filter))
    const byMonth = new Map()
    for (const t of list) {
      const key = t.occurred_on.slice(0, 7)
      if (!byMonth.has(key)) byMonth.set(key, [])
      byMonth.get(key).push(t)
    }
    return [...byMonth.entries()]
  }, [history, filter])

  const monthLabel = (key) => new Date(`${key}-15T12:00:00`).toLocaleDateString('es', { month: 'long', year: 'numeric' })
  const dayLabel = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short' })

  return (
    <>
      <PageHead eyebrow="Ahorros" title="Tus ahorros" accent="y su historia" lead="Lo que has juntado, lo que sacaste y por qué. Si pasa una emergencia, saca plata desde aquí." picker={false} />

      {error ? (
        <div className="alert alert-danger"><IconAlert size={18} /><div>{error}</div></div>
      ) : balances === null ? (
        <div className="skeleton" style={{ height: 320 }} />
      ) : balances.length === 0 ? (
        <div className="card empty">
          <div className="empty-icon"><IconPiggy size={26} /></div>
          <h3>Aún no tienes categorías de ahorro</h3>
          <p className="lead" style={{ margin: '10px auto 20px' }}>Agrégala en Presupuesto, en la sección Ahorro.</p>
          <Link to="/presupuesto" className="btn dc-cta">Ir a Presupuesto <IconArrow className="arrow" size={16} /></Link>
        </div>
      ) : (
        <div className="stack dc-rise">
          <div className="card">
            <div className="card-head">
              <div>
                <div className="dc-mono muted">Total acumulado</div>
                <div className="num" style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 34, marginTop: 6 }}>{money(total, currency)}</div>
              </div>
              {withdrawnTotal > 0 && <span className="badge">Retirado en total {money(withdrawnTotal, currency)}</span>}
            </div>
            <div className="grid grid-3">
              {balances.map((b) => (
                <div key={b.account_id} className="card-soft">
                  <div className="row"><span className="swatch" style={{ background: b.color }} /><b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</b></div>
                  <div className="num" style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 24, marginTop: 10, color: b.balance < 0 ? 'var(--danger)' : 'var(--text)' }}>{money(b.balance, currency)}</div>
                  <div className="muted num" style={{ fontSize: 12, marginTop: 4 }}>
                    {money(b.opening_balance, currency)} inicial · +{money(b.contributed, currency)}{b.withdrawn > 0 ? ` · −${money(b.withdrawn, currency)}` : ''}
                  </div>
                  <button className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 12 }} onClick={() => setWithdrawing(b)}>Retirar</button>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3 className="card-title">Historia</h3>
                <p className="card-sub">Lo que apartaste y lo que sacaste</p>
              </div>
            </div>
            <div className="row" style={{ flexWrap: 'wrap', marginBottom: 16 }}>
              <button className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>Todo</button>
              <button className={`chip ${filter === 'retiro' ? 'on' : ''}`} onClick={() => setFilter('retiro')}>Solo retiros</button>
              {balances.map((b) => (
                <button key={b.account_id} className={`chip ${filter === b.account_id ? 'on' : ''}`} onClick={() => setFilter(b.account_id)}>{b.name}</button>
              ))}
            </div>
            {rows.length === 0 ? (
              <p className="muted" style={{ padding: '16px 0' }}>{filter === 'retiro' ? 'No has hecho retiros. ¡Bien!' : 'Aún no hay movimientos de ahorro.'}</p>
            ) : (
              rows.map(([key, list]) => (
                <div key={key}>
                  <div className="group-title"><span className="dc-mono muted" style={{ textTransform: 'capitalize' }}>{monthLabel(key)}</span></div>
                  <div className="list">
                    {list.map((t) => {
                      const out = t.kind === 'retiro'
                      return (
                        <div key={t.id} className="list-row" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'start' }}>
                          <div className="row" style={{ minWidth: 0, alignItems: 'flex-start' }}>
                            <span className="swatch" style={{ background: t.accounts.color, marginTop: 5 }} />
                            <div style={{ minWidth: 0 }}>
                              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                                <b>{t.accounts.name}</b>
                                <span className={`badge ${out ? 'badge-danger' : 'badge-ok'}`}>{out ? 'Retiro' : 'Aporte'}</span>
                                <span className="muted" style={{ fontSize: 12 }}>{dayLabel(t.occurred_on)}</span>
                              </div>
                              {t.description && (
                                <div style={{ fontSize: 14, marginTop: 4, color: out ? 'var(--text)' : 'var(--muted)' }}>
                                  {out ? '“' + t.description + '”' : t.description}
                                </div>
                              )}
                            </div>
                          </div>
                          <b className="num" style={{ color: out ? 'var(--danger)' : 'var(--ok)' }}>{out ? '−' : '+'}{money(t.amount, currency)}</b>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {withdrawing && (
        <WithdrawDialog
          account={{ id: withdrawing.account_id, name: withdrawing.name }}
          balance={withdrawing.balance}
          onClose={() => setWithdrawing(null)}
          onDone={() => { setWithdrawing(null); load() }}
        />
      )}
    </>
  )
}
