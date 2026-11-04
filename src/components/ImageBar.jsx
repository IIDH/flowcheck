import { useState } from 'react'
import { money, pct } from '../lib/format'

/**
 * Barra 100% que reparte lo que entra en el mes: cuánto va a fijos,
 * variables, ahorro y qué queda libre.
 */
export default function ImageBar({ segments, total, currency, showLegend = true }) {
  const [hover, setHover] = useState(null)
  const sum = segments.reduce((s, x) => s + Math.max(x.value, 0), 0)
  const base = Math.max(total, sum, 1)
  const visible = segments.filter((s) => s.value > 0)
  const h = hover && segments.find((s) => s.key === hover)

  return (
    <div>
      <div className="imgbar" role="img" aria-label={segments.map((s) => `${s.label}: ${money(s.value, currency)}`).join(', ')}>
        {visible.map((s) => (
          <div
            key={s.key}
            style={{ flexGrow: s.value / base, flexBasis: 0, background: s.color }}
            onMouseEnter={() => setHover(s.key)}
            onMouseLeave={() => setHover(null)}
            onClick={() => setHover(s.key)}
          />
        ))}
      </div>
      <div className="imgbar-tip num">
        {h ? (
          <>
            <b style={{ color: 'var(--text)' }}>{h.label}</b> · {money(h.value, currency)} · {pct(total > 0 ? h.value / total : 0)} de lo que entra
          </>
        ) : sum > total && total > 0 ? (
          <span style={{ color: 'var(--danger)' }}>Supera lo que entra en {money(sum - total, currency)}</span>
        ) : null}
      </div>
      {showLegend && (
        <div className="legend" style={{ marginTop: 6 }}>
          {segments.map((s) => (
            <span key={s.key} className="legend-item">
              <span className="swatch" style={{ background: s.color }} />
              {s.label} <b>{money(s.value, currency)}</b>
              <span>{pct(total > 0 ? s.value / total : 0)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
