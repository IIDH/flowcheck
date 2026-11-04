import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import EmptyMonth from '../components/EmptyMonth'
import Onboarding from '../components/Onboarding'
import PageHead from '../components/PageHead'
import { useQuickAdd } from '../components/QuickAdd'
import { IconAlert, IconArrow, IconCheck, IconInfo, IconPlus } from '../components/Icons'
import { useApp } from '../context/AppContext'
import { fetchSummary } from '../lib/api'
import { daysLeftIn, monthFigures } from '../lib/figures'
import { compact, friendlyError, KINDS, MONTHS_SHORT, money, periodLabel } from '../lib/format'
import { FREE_LABEL } from '../lib/freeBalance'
import { CHART } from '../lib/palette'
import { cacheGet, cacheSet, isNetworkError } from '../lib/offline'
import { supabase } from '../lib/supabase'

function ChartTooltip({ active, payload, label, currency, colorFor }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tip">
      <div className="dc-mono muted">{payload[0]?.payload?.full ?? label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="chart-tip-row">
          <span className="swatch" style={{ background: colorFor ? colorFor(p) : p.color }} />
          <span>{p.name}</span>
          <b>{money(p.value, currency)}</b>
        </div>
      ))}
    </div>
  )
}

function alertText(a, currency) {
  const m = money(a.amount, currency)
  switch (a.type) {
    case 'plan_over_income': return <>Tu presupuesto reparte <b>{m}</b> más de lo que entra este mes. Ajusta montos en Presupuesto.</>
    case 'over_budget': return <><b>{a.account}</b> se pasó <b>{m}</b> de lo presupuestado.</>
    case 'unplanned': return <><b>{a.account}</b> tiene {m} gastados sin monto presupuestado.</>
    case 'saving_short': return <>Te faltaron <b>{m}</b> para tu meta de ahorro del mes.</>
    case 'free_over': return <>Gastaste <b>{m}</b> más de tu plata libre.</>
    case 'pace': return <>A este ritmo, tus gastos variables terminarían el mes <b>{m}</b> sobre lo presupuestado.</>
    default: return null
  }
}

/** Barra de avance de un grupo (fijos, variables, ahorro). */
function GroupCard({ title, actual, planned, sub, tone, done }) {
  const ratio = planned > 0 ? actual / planned : actual > 0 ? 1 : 0
  return (
    <div className="card group-card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="dc-mono muted">{title}</span>
        {done && <span className="badge badge-ok"><IconCheck size={11} /> Listo</span>}
      </div>
      <div className="group-value num">{actual}<span> / {planned}</span></div>
      <div className={`progress ${tone || ''}`} style={{ marginTop: 10 }}>
        <span style={{ width: `${Math.min(ratio * 100, 100)}%` }} />
      </div>
      <div className="kpi-sub">{sub}</div>
    </div>
  )
}

export default function Dashboard() {
  const { period, currency, theme, user } = useApp()
  const openAdd = useQuickAdd()
  const [stale, setStale] = useState(false)
  const c = CHART[theme]
  const [data, setData] = useState(null)
  const [recent, setRecent] = useState([])
  const [hasAccounts, setHasAccounts] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    const key = `${user?.id}:summary:${period.year}-${period.month}`
    supabase
      .from('accounts')
      .select('id', { count: 'exact', head: true })
      .then(({ count, error: e }) => setHasAccounts(e ? true : (count ?? 0) > 0))
    try {
      const d = await fetchSummary(period)
      cacheSet(key, d)
      setData(d)
      setStale(false)
      if (d.month) {
        const r = await supabase
          .from('transactions')
          .select('*, accounts(name, kind, color, is_free)')
          .eq('month_id', d.month.id)
          .order('occurred_on', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(5)
        setRecent(r.data ?? [])
      }
    } catch (err) {
      const cached = cacheGet(key)
      if (cached && isNetworkError(err)) {
        setData(cached)
        setStale(true)
      } else setError(isNetworkError(err) ? 'Sin conexión y sin datos guardados para este mes' : friendlyError(err))
    }
  }, [period, user?.id])

  useEffect(() => {
    window.addEventListener('fa-synced', load)
    window.addEventListener('online', load)
    return () => {
      window.removeEventListener('fa-synced', load)
      window.removeEventListener('online', load)
    }
  }, [load])

  useEffect(() => {
    setData(null)
    load()
  }, [load])

  const head = <PageHead eyebrow="Inicio" title="Tu" accent="mes" />

  if (error) {
    return (
      <>
        {head}
        <div className="alert alert-danger"><IconAlert size={18} /><div>No se pudo cargar el resumen: {error}.</div></div>
      </>
    )
  }
  if (!data || hasAccounts === null) {
    return (
      <>
        {head}
        <div className="skeleton" style={{ height: 220 }} />
        <div className="grid grid-3" style={{ marginTop: 18 }}>{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 130 }} />)}</div>
      </>
    )
  }
  if (!hasAccounts) return <Onboarding onDone={load} />
  if (!data.month) return <>{head}<EmptyMonth hasAccounts onOpened={load} /></>

  const { kpis: k, byKind, accounts, history, alerts, savings } = data
  const f = monthFigures({ income: k.renta, carryIn: k.carryIn, rows: accounts })
  const days = daysLeftIn(period)
  const m = (v) => money(v, currency)

  const pendingFixed = f.fijo.list.filter((a) => a.actual < a.planned)
  const shownAlerts = alerts.filter((a) => !['pending_fixed', 'withdrawn'].includes(a.type))
  // Sin monto ni gasto (p. ej. un ahorro cerrado que solo tuvo un retiro) no aporta nada a la lista
  const accountRows = accounts.filter((a) => a.kind !== 'ingreso' && !a.is_free && (a.planned > 0 || a.actual > 0))

  const kindData = ['fijo', 'variable', 'ahorro'].map((key) => ({ key, label: KINDS[key].plural, plan: byKind[key].planned, real: byKind[key].actual }))
  // Eje: "nov" (con año "nov 2025" solo si el historial cruza años); tooltip: "noviembre 2026"
  const multiYear = new Set(history.map((h) => h.year)).size > 1
  const histData = history.map((h) => ({ ...h, label: `${MONTHS_SHORT[h.month - 1]}${multiYear ? ` ${h.year}` : ''}`, full: periodLabel(h) }))

  return (
    <>
      {head}
      {stale && <div className="alert alert-warn" style={{ marginBottom: 18 }}><IconInfo size={18} /><div>Sin conexión: mostrando los últimos datos guardados en este dispositivo.</div></div>}
      <div className="stack dc-rise">
        <div className="grid grid-main">
          <section className="card dc-current hero">
            <span className="dc-mono muted">{f.canSpend >= 0 ? 'Te quedan para gastar' : 'Te pasaste por'}</span>
            <div className={`hero-value num ${f.canSpend < 0 ? 'neg' : ''}`}>{m(Math.abs(f.canSpend))}</div>
            <p className="hero-sub">
              {f.canSpend >= 0 ? (
                <>
                  {f.variable.left > 0 && <><b>{m(f.variable.left)}</b> en tus gastos variables · </>}
                  <b>{m(Math.max(f.free, 0))}</b> libres
                  {f.free < 0 && <span style={{ color: 'var(--danger)' }}> (te pasaste {m(-f.free)} de lo libre)</span>}
                </>
              ) : (
                <>Gastaste más de lo que entró este mes después de tus gastos fijos y ahorro.</>
              )}
            </p>
            {days && f.canSpend > 0 && <p className="hero-day num">≈ {m(f.canSpend / days)} por día · quedan {days} {days === 1 ? 'día' : 'días'}</p>}
            <p className="hero-note">Ya descontamos lo que falta pagar de tus gastos fijos y tu meta de ahorro.</p>
            <div className="row hero-actions">
              <button className="btn dc-cta" onClick={() => openAdd({ mode: 'gasto' })}><IconPlus size={16} /> Anotar gasto</button>
              <button className="btn btn-ghost" onClick={() => openAdd({ mode: 'ingreso' })}><IconPlus size={16} /> Ingreso</button>
            </div>
          </section>

          <section className="card">
            <div className="card-head" style={{ marginBottom: 8 }}>
              <h3 className="card-title">Plata del mes</h3>
              <b className="num" style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>{m(f.totalIncome)}</b>
            </div>
            <div className="list income-list">
              <div className="list-row"><span>Sueldo</span><b className="num">{m(f.salary)}</b></div>
              <div className="list-row">
                <span>Otros ingresos <span className="muted">· abonos, transferencias</span></span>
                <b className="num" style={{ color: f.extra > 0 ? 'var(--ok)' : 'var(--muted)' }}>{f.extra > 0 ? '+' : ''}{m(f.extra)}</b>
              </div>
              {f.carryIn !== 0 && <div className="list-row"><span>Del mes anterior</span><b className="num" style={{ color: f.carryIn < 0 ? 'var(--danger)' : 'var(--ok)' }}>{f.carryIn > 0 ? '+' : '−'}{m(Math.abs(f.carryIn))}</b></div>}
              {f.withdrawn > 0 && <div className="list-row"><span>Sacado de ahorros</span><b className="num" style={{ color: 'var(--ok)' }}>+{m(f.withdrawn)}</b></div>}
            </div>
            <button className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 14 }} onClick={() => openAdd({ mode: 'ingreso' })}>
              <IconPlus size={14} /> Me llegó un abono o transferencia
            </button>
          </section>
        </div>

        <div className="grid grid-3">
          <GroupCard
            title="Gastos fijos"
            actual={m(f.fijo.actual)}
            planned={m(f.fijo.planned)}
            done={f.fijo.planned > 0 && pendingFixed.length === 0}
            sub={pendingFixed.length ? <>Falta pagar <b>{m(f.fijo.left)}</b>: {pendingFixed.slice(0, 3).map((a) => a.name).join(', ')}{pendingFixed.length > 3 ? '…' : ''}</> : f.fijo.planned > 0 ? 'Todo pagado este mes' : 'Sin gastos fijos'}
          />
          <GroupCard
            title="Gastos variables"
            actual={m(f.variable.actual + f.freeSpent)}
            planned={m(f.variable.planned)}
            tone={f.variable.actual > f.variable.planned ? 'over' : ''}
            sub={f.variable.over > 0 ? <span style={{ color: 'var(--danger)' }}>Te pasaste {m(f.variable.over)} en alguna categoría</span> : <>Quedan <b>{m(f.variable.left)}</b> en tus categorías</>}
          />
          <GroupCard
            title="Ahorro"
            actual={m(f.ahorro.actual)}
            planned={m(f.ahorro.planned)}
            tone="ok"
            done={f.ahorro.planned > 0 && f.ahorro.left === 0}
            sub={<>{f.ahorro.left > 0 ? <>Faltan {m(f.ahorro.left)} para tu meta · </> : null}<Link to="/ahorros" className="legal-link">Total ahorrado {m(savings?.total ?? 0)}</Link></>}
          />
        </div>

        {shownAlerts.length > 0 && (
          <div className="stack" style={{ gap: 10 }}>
            {shownAlerts.slice(0, 3).map((a, i) => (
              <div key={i} className={`alert alert-${a.level}`}>
                {a.level === 'info' ? <IconInfo size={18} /> : <IconAlert size={18} />}
                <div>{alertText(a, currency)}</div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-2">
          <section className="card">
            <div className="card-head">
              <h3 className="card-title">Últimos movimientos</h3>
              <Link to="/gastos" className="btn btn-ghost btn-sm">Ver todos <IconArrow className="arrow" size={14} /></Link>
            </div>
            {recent.length === 0 ? (
              <div className="empty" style={{ padding: '22px 8px' }}>
                <p className="muted">Aún no anotas nada este mes.</p>
                <button className="btn dc-cta btn-sm" style={{ marginTop: 12 }} onClick={() => openAdd({ mode: 'gasto' })}><IconPlus size={14} /> Anotar el primero</button>
              </div>
            ) : (
              <div className="list">
                {recent.map((t) => {
                  const plus = t.accounts?.kind === 'ingreso' || t.kind === 'retiro'
                  return (
                    <div key={t.id} className="list-row tx-mini">
                      <span className="swatch" style={{ background: t.accounts?.color }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.accounts?.is_free ? FREE_LABEL : t.accounts?.name}</div>
                        <div className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{new Date(`${t.occurred_on}T12:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short' })}{t.description ? ` · ${t.description}` : ''}</div>
                      </div>
                      <b className="num" style={{ color: plus ? 'var(--ok)' : 'var(--text)' }}>{plus ? '+' : '−'}{m(t.amount)}</b>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h3 className="card-title">Por categoría</h3>
              <Link to="/presupuesto" className="btn btn-ghost btn-sm">Ajustar <IconArrow className="arrow" size={14} /></Link>
            </div>
            {accountRows.length === 0 ? (
              <p className="muted">Este mes no tiene categorías todavía.</p>
            ) : (
              <div className="list">
                {accountRows.map((a) => {
                  const ratio = a.planned > 0 ? a.actual / a.planned : a.actual > 0 ? 1.01 : 0
                  const over = a.kind !== 'ahorro' && ratio > 1
                  return (
                    <div key={a.account_id} className="list-row cat-row">
                      <div className="row" style={{ minWidth: 0, gap: 8 }}>
                        <span className="swatch" style={{ background: a.color }} />
                        <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                      </div>
                      <span className="num" style={{ fontSize: 13, textAlign: 'right' }}>
                        <b style={{ color: over ? 'var(--danger)' : 'var(--text)' }}>{m(a.actual)}</b>
                        <span className="muted"> / {m(a.planned)}</span>
                      </span>
                      <div className={`progress ${over ? 'over' : a.kind === 'ahorro' ? 'ok' : ''}`}>
                        <span style={{ width: `${Math.min(ratio * 100, 100)}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>

        <details className="card charts">
          <summary>
            <span className="card-title">Gráficos del mes</span>
            <span className="muted" style={{ fontSize: 13 }}>Presupuesto vs real e historial</span>
          </summary>
          <div className="grid grid-2" style={{ marginTop: 18 }}>
            <div>
              <div className="card-head">
                <div>
                  <h3 className="card-title" style={{ fontSize: 15 }}>Presupuesto vs real</h3>
                  <p className="card-sub">Gris = presupuesto · color = real</p>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={kindData} barGap={2} barCategoryGap="30%" margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={c.grid} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: c.axis, fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: c.axis, fontSize: 11 }} tickFormatter={compact} width={48} />
                  <Tooltip cursor={{ fill: c.grid }} content={<ChartTooltip currency={currency} colorFor={(p) => (p.dataKey === 'plan' ? c.plan : c[p.payload.key])} />} />
                  <Bar dataKey="plan" name="Presupuesto" fill={c.plan} radius={[4, 4, 0, 0]} maxBarSize={44} />
                  <Bar dataKey="real" name="Real" radius={[4, 4, 0, 0]} maxBarSize={44}>
                    {kindData.map((d) => <Cell key={d.key} fill={c[d.key]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <div className="card-head">
                <div>
                  <h3 className="card-title" style={{ fontSize: 15 }}>Historial</h3>
                  <p className="card-sub">{histData.length === 1 ? 'Por ahora solo este mes: se va llenando mes a mes' : `Últimos ${histData.length} meses`}</p>
                </div>
                <div className="legend">
                  <span className="legend-item"><span className="swatch" style={{ background: c.variable }} />Gastos</span>
                  <span className="legend-item"><span className="swatch" style={{ background: c.ahorro }} />Ahorro</span>
                  <span className="legend-item"><span className="swatch" style={{ background: c.renta, height: 2 }} />Ingresos</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={histData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={c.grid} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: c.axis, fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: c.axis, fontSize: 11 }} tickFormatter={compact} width={48} />
                  <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ stroke: c.axis, strokeDasharray: '3 3' }} />
                  <Line type="monotone" dataKey="renta" name="Ingresos" stroke={c.renta} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                  <Line type="monotone" dataKey="gastado" name="Gastos" stroke={c.variable} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: 'var(--bg)' }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="ahorrado" name="Ahorro" stroke={c.ahorro} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: 'var(--bg)' }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </details>
      </div>
    </>
  )
}
