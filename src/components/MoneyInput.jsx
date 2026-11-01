import { useEffect, useState } from 'react'
import { parseAmount } from '../lib/format'

const display = (n) => (Number(n) ? new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(n) : '')

/** Input de monto que guarda al salir del campo (o con Enter) solo si cambió. */
export default function MoneyInput({ value, onCommit, className = '', ...rest }) {
  const [text, setText] = useState(display(value))
  useEffect(() => setText(display(value)), [value])

  function commit() {
    const n = parseAmount(text)
    setText(display(n))
    if (n !== Number(value)) onCommit(n)
  }

  return (
    <input
      className={`input input-money ${className}`}
      inputMode="decimal"
      value={text}
      placeholder="0"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      onFocus={(e) => e.currentTarget.select()}
      {...rest}
    />
  )
}
