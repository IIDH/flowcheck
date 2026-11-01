import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import EmptyMonth from '../components/EmptyMonth'
import ImageBar from '../components/ImageBar'
import PageHead from '../components/PageHead'
import { IconAlert, IconArrow, IconCoins, IconInfo, IconPiggy, IconTrend, IconWallet } from '../components/Icons'
import { useApp } from '../context/AppContext'
import { fetchSummary } from '../lib/api'
import { compact, friendlyError, KINDS, money, pct, periodShort } from '../lib/format'
import { CHART } from '../lib/palette'
import { cacheGet, cacheSet, isNetworkError } from '../lib/offline'
import { supabase } from '../lib/supabase'

function ChartTooltip({ active, payload, label, currency, colorFor }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tip">
      <div className="dc-mono muted">{label}</div>
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

function Kpi({ icon: Icon, label, value, sub, progress, tone }) {
  return (
    <div className="card dc-lift">
      <div className="kpi-label">
        <span className="kpi-icon"><Icon size={16} /></span>
        <span className="dc-mono muted">{label}</span>
      </div>
      <div className="kpi-value" title={value}>{value}</div>
      {progress != null && (
        <div className={`progress ${tone || ''}`} style={{ marginTop: 12 }}>
          <span style={{ width: `${Math.min(progress * 100, 100)}%` }} />
        </div>
      )}
      <div className="kpi-sub">{sub}</div>
    </div>
  )
}

function alertText(a, currency) {
  const m = money(a.amount, currency)
  switch (a.type) {
    case 'plan_over_income': return <>Tu imagen planificada supera la renta en <b>{m}</b>. Ajusta montos en Mi mes.</>
    case 'over_budget': return <><b>{a.account}</b> superó lo planificado en <b>{m}</b>.</>
    case 'unplanned': return <><b>{a.account}</b> tiene {m} en gastos sin presupuesto asignado.</>
    case 'pending_fixed': return <>{a.count} {a.count === 1 ? 'gasto fijo pendiente' : 'gastos fijos pendientes'} por <b>{m}</b>: {a.accounts.slice(0, 4).join(', ')}{a.accounts.length > 4 ? '…' : ''}.</>
    case 'saving_short': return <>Quedaste <b>{m}</b> bajo tu meta de ahorro del mes.</>
    case 'withdrawn': return <>Retiraste <b>{m}</b> de ahorros este mes ({a.accounts.join(', ')}). Queda como saldo libre para cubrir el gasto.</>
    case 'free_over': return <>Gastaste <b>{m}</b> más de lo que tenías como saldo libre.</>
    case 'pace': return <>Al ritmo actual, tus gastos variables cerrarían el mes <b>{m}</b> sobre lo planificado.</>
    default: return null
  }
}

export default function Dashboard() {
  const { period, currency, theme, user } = useApp()
  const [stale, setStale] = useState(false)
  const c = CHART[theme]
  const [data, setData] = useState(null)
  const [hasAccounts, setHasAccounts] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    const key = `${user?.id}:summary:${period.year}-${period.month}`
    try {
      const d = await fetchSummary(period)
      cacheSet(key, d)
      setData(d)
      setStale(false)
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
    supabase.from('accounts').select('id', { count: 'exact', head: true }).then(({ count }) => setHasAccounts((count ?? 0) > 0))
  }, [load])

  const head = <PageHead eyebrow="Dashboard" title="Tu imagen" accent="del mes" lead="Lo que planificaste contra lo que va pasando: gastos fijos, variables, ahorro y lo disponible." />

  if (error) {
    return (
      <>
        {head}
        <div className="alert alert-danger"><IconAlert size={18} /><div>No se pudo cargar el resumen: {error}. Revisa que la API esté corriendo (<code>npm run dev</code>) y las variables de entorno.</div></div>
      </>
    )
  }
  if (!data) {
    return (
      <>
        {head}
        <div className="grid grid-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 140 }} />)}</div>
        <div className="skeleton" style={{ height: 320, marginTop: 18 }} />
      </>
    )
  }
  if (!data.month) return <>{head}<EmptyMonth hasAccounts={hasAccounts} onOpened={load} /></>

  const { kpis: k, byKind, accounts, history, alerts, projection, savings } = data

  const planSegments = [
    { key: 'fijo', label: 'Fijos', value: byKind.fijo.planned, color: c.fijo },
    { key: 'variable', label: 'Variables', value: byKind.variable.planned, color: c.variable },
    { key: 'ahorro', label: 'Ahorro', value: byKind.ahorro.planned, color: c.ahorro },
    { key: 'free', label: 'Sin asignar', value: Math.max(k.unassigned, 0), color: c.free }
  ]
  const realSegments = [
    { key: 'fijo', label: 'Fijos', value: byKind.fijo.actual, color: c.fijo },
    { key: 'variable', label: 'Variables', value: byKind.variable.actual, color: c.variable },
    { key: 'ahorro', label: 'Ahorro', value: byKind.ahorro.actual, color: c.ahorro },
    { key: 'free', label: 'Disponible', value: Math.max(k.available, 0), color: c.free }
  ]

  const kindData = ['fijo', 'variable', 'ahorro'].map((key) => ({
    key,
    label: KINDS[key].plural.replace(' e inversión', ''),
    plan: byKind[key].planned,
    real: byKind[key].actual
  }))

  const histData = history.map((h) => ({ ...h, label: periodShort(h) }))
  const accountRows = accounts.filter((a) => a.kind !== 'ingreso' && !a.is_free)

  return (
    <>
      {head}
      {stale && <div className="alert alert-warn" style={{ marginBottom: 18 }}><IconInfo size={18} /><div>Sin conexión: mostrando los últimos datos guardados en este dispositivo.</div></div>}
      <div className="stack dc-rise">
        <div className="grid grid-4">
          <Kpi icon={IconWallet} label="Ingresos del mes" value={money(k.totalIncome, currency)} sub={[
              k.extra > 0 && `+${money(k.extra, currency)} extra`,
              k.withdrawn > 0 && `+${money(k.withdrawn, currency)} retirado de ahorros`,
              k.carryIn !== 0 && `${k.carryIn > 0 ? '+' : '−'}${money(Math.abs(k.carryIn), currency)} del mes anterior`
            ].filter(Boolean).join(' · ') || 'Ingreso base del mes'} />
          <Kpi
            icon={IconCoins}
            label="Gastado"
            value={money(k.spent, currency)}
            progress={k.plannedSpend > 0 ? k.spent / k.plannedSpend : 0}
            tone={k.spent > k.plannedSpend ? 'over' : ''}
            sub={`de ${money(k.plannedSpend, currency)} planificado`}
          />
          <Kpi
            icon={IconPiggy}
            label="Ahorrado"
            value={money(k.saved, currency)}
            progress={k.plannedSave > 0 ? k.saved / k.plannedSave : 0}
            tone="ok"
            sub={savings ? `este mes de ${money(k.plannedSave, currency)} · total acumulado ${money(savings.total, currency)}` : `meta ${money(k.plannedSave, currency)} · ${pct(k.savingsRate)} de tus ingresos`}
          />
          <Kpi icon={IconTrend} label="Disponible" value={money(k.available, currency)} sub={projection ? `≈ ${money(projection.dailyBudgetLeft, currency)} por día en variables` : 'Ingresos − gastos − ahorro'} />
        </div>

        <div className="grid grid-main">
          <div className="card">
            <div className="card-head">
              <div>
                <h3 className="card-title">Imagen vs realidad</h3>
                <p className="card-sub">Cómo planificaste repartir la renta y cómo se está repartiendo de verdad.</p>
              </div>
              <Link to="/mes" className="btn btn-ghost btn-sm dc-cta">Editar imagen <IconArrow className="arrow" size={14} /></Link>
            </div>
            <div className="dc-mono muted" style={{ marginBottom: 8 }}>Planificado</div>
            <ImageBar segments={planSegments} total={k.planBase ?? k.renta} currency={currency} />
            {(k.unassigned + (k.withdrawn || 0)) > 0 && (
              <div className="card-soft row" style={{ marginTop: 14, justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 14 }}>
                  <b>Saldo libre</b> <span className="muted">· lo sin asignar que puedes gastar{k.freeUsed > 0 ? ` · usado ${money(k.freeUsed, currency)}` : ''}</span>
                </span>
                <b className="num" style={{ color: k.freeLeft < 0 ? 'var(--danger)' : 'var(--text)' }}>Quedan {money(k.freeLeft ?? k.unassigned, currency)}</b>
              </div>
            )}
            <div className="dc-mono muted" style={{ margin: '22px 0 8px' }}>Real a la fecha</div>
            <ImageBar segments={realSegments} total={k.totalIncome} currency={currency} />
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3 className="card-title">Alertas</h3>
                <p className="card-sub">{alerts.length ? 'Lo que conviene mirar este mes' : 'Todo en orden'}</p>
              </div>
            </div>
            <div className="stack" style={{ gap: 10 }}>
              {alerts.length === 0 && (
                <div className="alert alert-ok"><IconInfo size={18} /><div>Vas dentro de lo planificado. ¡Bien!</div></div>
              )}
              {alerts.map((a, i) => (
                <div key={i} className={`alert alert-${a.level}`}>
                  {a.level === 'info' ? <IconInfo size={18} /> : <IconAlert size={18} />}
                  <div>{alertText(a, currency)}</div>
                </div>
              ))}
              {projection && projection.variablePlanned > 0 && (
                <div className="card-soft" style={{ marginTop: 4 }}>
                  <div className="dc-mono muted">Proyección variables · día {projection.day}/{projection.daysInMonth}</div>
                  <div className="row" style={{ marginTop: 8, justifyContent: 'space-between' }}>
                    <span className="num" style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 20 }}>{money(projection.projectedVariable, currency)}</span>
                    <span className="muted" style={{ fontSize: 13 }}>vs {money(projection.variablePlanned, currency)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-2">
          <div className="card">
            <div className="card-head">
              <div>
                <h3 className="card-title">Plan vs real por tipo</h3>
                <p className="card-sub">Barra gris = planificado · barra de color = real</p>
              </div>
              <div className="legend">
                <span className="legend-item"><span className="swatch" style={{ background: c.plan }} />Planificado</span>
                <span className="legend-item"><span className="swatch" style={{ background: `linear-gradient(90deg, ${c.fijo}, ${c.variable}, ${c.ahorro})` }} />Real</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={kindData} barGap={2} barCategoryGap="30%" margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={c.grid} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: c.axis, fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: c.axis, fontSize: 11 }} tickFormatter={compact} width={48} />
                <Tooltip
                  cursor={{ fill: c.grid }}
                  content={<ChartTooltip currency={currency} colorFor={(p) => (p.dataKey === 'plan' ? c.plan : c[p.payload.key])} />}
                />
                <Bar dataKey="plan" name="Planificado" fill={c.plan} radius={[4, 4, 0, 0]} maxBarSize={44} />
                <Bar dataKey="real" name="Real" radius={[4, 4, 0, 0]} maxBarSize={44}>
                  {kindData.map((d) => <Cell key={d.key} fill={c[d.key]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3 className="card-title">Historial</h3>
                <p className="card-sub">Últimos {histData.length} {histData.length === 1 ? 'mes' : 'meses'} registrados</p>
              </div>
              <div className="legend">
                <span className="legend-item"><span className="swatch" style={{ background: c.variable }} />Gastos</span>
                <span className="legend-item"><span className="swatch" style={{ background: c.ahorro }} />Ahorro</span>
                <span className="legend-item"><span className="swatch" style={{ background: c.renta, height: 2 }} />Ingresos</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={250}>
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

        {savings && savings.accounts.length > 0 && (
          <div className="card">
            <div className="card-head">
              <div>
                <h3 className="card-title">Tus ahorros</h3>
                <p className="card-sub">Saldo inicial + aportes − retiros</p>
                <Link to="/ahorros" className="btn btn-ghost btn-sm dc-cta" style={{ marginTop: 10 }}>Ver historia y retirar <IconArrow className="arrow" size={14} /></Link>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="dc-mono muted">Total acumulado</div>
                <div className="num" style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 26 }}>{money(savings.total, currency)}</div>
              </div>
            </div>
            <div className="grid grid-3">
              {savings.accounts.map((b) => (
                <div key={b.account_id} className="card-soft dc-step">
                  <div className="row"><span className="swatch" style={{ background: b.color }} /><b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</b></div>
                  <div className="num" style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 22, marginTop: 10 }}>{money(b.balance, currency)}</div>
                  <div className="muted num" style={{ fontSize: 12, marginTop: 4 }}>
                    {money(b.opening_balance, currency)} inicial · +{money(b.contributed, currency)} aportado{b.withdrawn > 0 ? ` · −${money(b.withdrawn, currency)} retirado` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Cuentas del mes</h3>
              <p className="card-sub">Avance de cada cuenta contra su monto planificado</p>
            </div>
            <Link to="/movimientos?nuevo=1" className="btn btn-sm dc-cta">Registrar movimiento <IconArrow className="arrow" size={14} /></Link>
          </div>
          {accountRows.length === 0 ? (
            <p className="muted">Este mes no tiene cuentas en su imagen todavía.</p>
          ) : (
            <div className="list">
              {accountRows.map((a) => {
                const ratio = a.planned > 0 ? a.actual / a.planned : a.actual > 0 ? 1.01 : 0
                const over = a.kind !== 'ahorro' && ratio > 1
                return (
                  <div key={a.account_id} className="list-row acc-row">
                    <div className="row" style={{ minWidth: 0 }}>
                      <span className="swatch" style={{ background: a.color }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{KINDS[a.kind].label}</div>
                      </div>
                    </div>
                    <div className={`progress ${over ? 'over' : a.kind === 'ahorro' ? 'ok' : ''}`}>
                      <span style={{ width: `${Math.min(ratio * 100, 100)}%` }} />
                    </div>
                    <div className="num" style={{ textAlign: 'right', fontSize: 14 }}>
                      <b style={{ color: over ? 'var(--danger)' : 'var(--text)' }}>{money(a.actual, currency)}</b>
                      <span className="muted"> / {money(a.planned, currency)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
