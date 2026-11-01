import { useCallback, useEffect, useState } from 'react'
import { useConfirm } from '../components/ConfirmDialog'
import PageHead from '../components/PageHead'
import { IconEdit, IconPlus, IconTrash, IconWallet } from '../components/Icons'
import { useApp } from '../context/AppContext'
import { useAccounts } from '../hooks/useMonth'
import { friendlyError, KIND_ORDER, KINDS, money, parseAmount } from '../lib/format'
import { ACCOUNT_COLORS } from '../lib/palette'
import { supabase } from '../lib/supabase'

const SUGGESTED = [
  { name: 'Arriendo / Dividendo', kind: 'fijo' },
  { name: 'Luz', kind: 'fijo' },
  { name: 'Agua', kind: 'fijo' },
  { name: 'Gas', kind: 'fijo' },
  { name: 'Internet y teléfono', kind: 'fijo' },
  { name: 'Suscripciones', kind: 'fijo' },
  { name: 'Supermercado', kind: 'variable' },
  { name: 'Transporte', kind: 'variable' },
  { name: 'Salidas y delivery', kind: 'variable' },
  { name: 'Salud', kind: 'variable' },
  { name: 'Fondo de emergencia', kind: 'ahorro' },
  { name: 'Inversión', kind: 'ahorro' },
  { name: 'Bonos y extras', kind: 'ingreso' }
]

const EMPTY = { id: null, name: '', kind: 'fijo', default_amount: '', due_day: '', opening_balance: '', color: ACCOUNT_COLORS[0] }

const parseDay = (v) => {
  const n = Number.parseInt(v, 10)
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null
}

export default function Cuentas() {
  const { currency, notify } = useApp()
  const confirm = useConfirm()
  const { accounts, reload } = useAccounts({ includeArchived: true })
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [balances, setBalances] = useState({})

  // Saldo acumulado de cada ahorro (saldo inicial + aportes de todos los meses)
  const loadBalances = useCallback(async () => {
    const { data, error } = await supabase.from('account_balances').select('account_id, opening_balance, contributed, balance')
    if (!error) setBalances(Object.fromEntries(data.map((b) => [b.account_id, b])))
  }, [])
  useEffect(() => { loadBalances() }, [loadBalances, accounts])

  // La cuenta de sistema "Saldo libre" no se edita aquí
  const active = (accounts ?? []).filter((a) => !a.archived && !a.is_free)
  const archived = (accounts ?? []).filter((a) => a.archived && !a.is_free)

  async function save(e) {
    e.preventDefault()
    if (!form.name.trim()) return notify('Ponle un nombre a la cuenta', 'error')
    setBusy(true)
    const payload = {
      name: form.name.trim(),
      kind: form.kind,
      default_amount: parseAmount(form.default_amount),
      due_day: form.kind === 'fijo' ? parseDay(form.due_day) : null,
      color: form.color,
      ...(form.kind === 'ahorro' ? { opening_balance: parseAmount(form.opening_balance) } : {})
    }
    const { error } = form.id
      ? await supabase.from('accounts').update(payload).eq('id', form.id)
      : await supabase.from('accounts').insert({ ...payload, sort: active.length })
    setBusy(false)
    if (error) return notify(friendlyError(error), 'error')
    notify(form.id ? 'Cuenta actualizada' : 'Cuenta creada. Se suma a la imagen de los próximos meses.')
    setForm({ ...EMPTY, kind: form.kind, color: ACCOUNT_COLORS[(active.length + 1) % ACCOUNT_COLORS.length] })
    reload()
  }

  async function loadSuggested() {
    setBusy(true)
    const rows = SUGGESTED.map((s, i) => ({ ...s, default_amount: 0, sort: i, color: ACCOUNT_COLORS[i % ACCOUNT_COLORS.length] }))
    const { error } = await supabase.from('accounts').upsert(rows, { onConflict: 'user_id,name', ignoreDuplicates: true })
    setBusy(false)
    if (error) return notify(friendlyError(error), 'error')
    notify('Cuentas sugeridas cargadas. Ajusta los montos por defecto.')
    reload()
  }

  async function setArchived(a, value) {
    const { error } = await supabase.from('accounts').update({ archived: value }).eq('id', a.id)
    if (error) return notify(friendlyError(error), 'error')
    notify(value ? `${a.name} archivada` : `${a.name} reactivada`)
    reload()
  }

  async function remove(a) {
    if (!(await confirm({ tone: 'danger', title: `¿Eliminar "${a.name}"?`, message: 'Se quitará de la imagen de todos los meses. Esta acción no se puede deshacer.', confirmText: 'Eliminar cuenta' }))) return
    const { error } = await supabase.from('accounts').delete().eq('id', a.id)
    if (error) return notify(friendlyError(error), 'error')
    notify('Cuenta eliminada')
    reload()
  }

  return (
    <>
      <PageHead eyebrow="Cuentas" title="Tus cuentas" accent="fijas y variables" lead="Crea las cuentas que componen tu mes. El monto por defecto se usa al crear la imagen de un mes nuevo." picker={false} />

      <div className="grid grid-main dc-rise" style={{ alignItems: 'start' }}>
        <div className="card">
          {accounts === null ? (
            <div className="skeleton" style={{ height: 260 }} />
          ) : active.length === 0 ? (
            <div className="empty">
              <div className="empty-icon"><IconWallet size={26} /></div>
              <h3>Todavía no tienes cuentas</h3>
              <p className="lead" style={{ margin: '10px auto 20px' }}>Crea la primera o carga un set sugerido para empezar rápido.</p>
              <button className="btn dc-cta" onClick={loadSuggested} disabled={busy}>Cargar cuentas sugeridas</button>
            </div>
          ) : (
            KIND_ORDER.map((kind) => {
              const list = active.filter((a) => a.kind === kind)
              if (!list.length) return null
              return (
                <div key={kind}>
                  <div className="group-title">
                    <span className="dc-mono muted">{KINDS[kind].plural}</span>
                    <span className="dc-mono muted num">
                      {kind === 'ahorro'
                        ? `Acumulado ${money(list.reduce((s, a) => s + Number(balances[a.id]?.balance ?? a.opening_balance ?? 0), 0), currency)}`
                        : money(list.reduce((s, a) => s + Number(a.default_amount), 0), currency)}
                    </span>
                  </div>
                  <div className="list">
                    {list.map((a) => (
                      <div key={a.id} className="list-row" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto auto' }}>
                        <div className="row" style={{ minWidth: 0 }}>
                          <span className="swatch" style={{ background: a.color }} />
                          <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                          {a.kind === 'fijo' && a.due_day && <span className="badge">vence día {a.due_day}</span>}
                          {a.kind === 'ahorro' && <span className="badge badge-ok num">Ahorrado {money(balances[a.id]?.balance ?? a.opening_balance ?? 0, currency)}</span>}
                        </div>
                        <span className="num muted" style={{ fontSize: 14 }}>{a.kind === 'ahorro' ? `+${money(a.default_amount, currency)}/mes` : money(a.default_amount, currency)}</span>
                        <div className="row" style={{ gap: 6 }}>
                          <button className="dc-icon-btn" style={{ width: 32, height: 32 }} onClick={() => setForm({ ...a, default_amount: String(a.default_amount), due_day: a.due_day ? String(a.due_day) : '', opening_balance: a.opening_balance ? String(a.opening_balance) : '' })} aria-label={`Editar ${a.name}`}>
                            <IconEdit size={14} />
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setArchived(a, true)}>Archivar</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          )}

          {archived.length > 0 && (
            <>
              <div className="group-title"><span className="dc-mono muted">Archivadas</span></div>
              <div className="list">
                {archived.map((a) => (
                  <div key={a.id} className="list-row" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
                    <span className="muted">{a.name} · {KINDS[a.kind].label}</span>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setArchived(a, false)}>Reactivar</button>
                      <button className="dc-icon-btn" style={{ width: 32, height: 32 }} onClick={() => remove(a)} aria-label={`Eliminar ${a.name}`}>
                        <IconTrash size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <form className="card dc-current side-form" onSubmit={save}>
          <h3 className="card-title">{form.id ? 'Editar cuenta' : 'Nueva cuenta'}</h3>
          <p className="card-sub" style={{ marginBottom: 18 }}>{KINDS[form.kind].hint}</p>
          <div className="stack" style={{ gap: 14 }}>
            <label className="field">
              <span className="label">Nombre</span>
              <input className="input" maxLength={60} placeholder="Ej: Arriendo" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <div className="field">
              <span className="label">Tipo</span>
              <div className="segmented" role="radiogroup" style={{ flexWrap: 'wrap' }}>
                {KIND_ORDER.map((k) => (
                  <button type="button" key={k} role="radio" aria-checked={form.kind === k} className={form.kind === k ? 'on' : ''} onClick={() => setForm({ ...form, kind: k })}>
                    {{ fijo: 'Fijo', variable: 'Variable', ahorro: 'Ahorro', ingreso: 'Ingreso' }[k]}
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span className="label">{form.kind === 'ahorro' ? 'Meta mensual' : form.kind === 'ingreso' ? 'Monto estimado' : 'Monto mensual por defecto'}</span>
              <input className="input input-money" inputMode="decimal" placeholder="0" value={form.default_amount} onChange={(e) => setForm({ ...form, default_amount: e.target.value })} />
            </label>
            {form.kind === 'ahorro' && (
              <label className="field">
                <span className="label">¿Cuánto tienes ya ahorrado aquí?</span>
                <input className="input input-money" inputMode="decimal" placeholder="0" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} />
                <span className="muted" style={{ fontSize: 12 }}>Saldo inicial: lo que juntaste antes de usar Flowcheck. Los aportes de cada mes se suman a este monto.</span>
              </label>
            )}
            {form.kind === 'fijo' && (
              <label className="field">
                <span className="label">Día de vencimiento (opcional)</span>
                <input className="input" type="number" min={1} max={31} inputMode="numeric" placeholder="Ej: 5" value={form.due_day} onChange={(e) => setForm({ ...form, due_day: e.target.value })} />
                <span className="muted" style={{ fontSize: 12 }}>Te avisamos por notificación antes de que venza si aún no está pagado.</span>
              </label>
            )}
            <div className="field">
              <span className="label">Color</span>
              <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                {ACCOUNT_COLORS.map((col) => (
                  <button
                    type="button"
                    key={col}
                    onClick={() => setForm({ ...form, color: col })}
                    aria-label={`Color ${col}`}
                    style={{ width: 28, height: 28, borderRadius: 8, background: col, cursor: 'pointer', border: form.color === col ? '2px solid var(--text)' : '2px solid transparent', outline: '2px solid var(--bg)', outlineOffset: -4 }}
                  />
                ))}
              </div>
            </div>
            <div className="row">
              <button className="btn dc-cta" style={{ flex: 1 }} disabled={busy}><IconPlus size={16} /> {form.id ? 'Guardar cambios' : 'Crear cuenta'}</button>
              {form.id && <button type="button" className="btn btn-ghost" onClick={() => setForm(EMPTY)}>Cancelar</button>}
            </div>
          </div>
        </form>
      </div>
    </>
  )
}
