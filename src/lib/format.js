export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export const periodLabel = ({ year, month }) => `${MONTHS[month - 1]} ${year}`
export const periodShort = ({ year, month }) => `${MONTHS_SHORT[month - 1]} ${String(year).slice(2)}`

export const KINDS = {
  fijo: { label: 'Gasto fijo', plural: 'Gastos fijos', hint: 'Arriendo, servicios, créditos, suscripciones' },
  variable: { label: 'Gasto variable', plural: 'Gastos variables', hint: 'Supermercado, transporte, salidas' },
  ahorro: { label: 'Ahorro', plural: 'Ahorro e inversión', hint: 'Fondo de emergencia, metas, inversión' },
  ingreso: { label: 'Ingreso extra', plural: 'Ingresos extra', hint: 'Bonos, ventas, trabajos puntuales' }
}
export const KIND_ORDER = ['fijo', 'variable', 'ahorro', 'ingreso']

export const CURRENCIES = [
  { code: 'CLP', label: 'Peso chileno (CLP)', decimals: 0 },
  { code: 'ARS', label: 'Peso argentino (ARS)', decimals: 0 },
  { code: 'COP', label: 'Peso colombiano (COP)', decimals: 0 },
  { code: 'MXN', label: 'Peso mexicano (MXN)', decimals: 2 },
  { code: 'PEN', label: 'Sol peruano (PEN)', decimals: 2 },
  { code: 'UYU', label: 'Peso uruguayo (UYU)', decimals: 0 },
  { code: 'USD', label: 'Dólar (USD)', decimals: 2 },
  { code: 'EUR', label: 'Euro (EUR)', decimals: 2 }
]

const fmtCache = new Map()
export function money(value, currency = 'CLP') {
  const key = currency
  if (!fmtCache.has(key)) {
    const decimals = CURRENCIES.find((c) => c.code === currency)?.decimals ?? 0
    fmtCache.set(key, new Intl.NumberFormat('es-CL', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: decimals }))
  }
  return fmtCache.get(key).format(Number(value) || 0)
}

const compactFmt = new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 })
export const compact = (v) => compactFmt.format(Number(v) || 0)

export const pct = (v, digits = 0) => `${((Number(v) || 0) * 100).toFixed(digits)}%`

/** Convierte lo que escribe el usuario ("1.250.000", "1250,5") en número. */
export function parseAmount(input) {
  if (typeof input === 'number') return input
  const s = String(input ?? '').trim().replace(/[^\d.,-]/g, '')
  if (!s) return 0
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  let normalized
  if (lastComma > lastDot) normalized = s.replace(/\./g, '').replace(',', '.')
  else if (lastDot > -1 && s.length - lastDot - 1 === 3 && s.split('.').length >= 2 && lastComma === -1) normalized = s.replace(/\./g, '')
  else normalized = s.replace(/,/g, '')
  const n = Number.parseFloat(normalized)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0
}

export function friendlyError(err) {
  const msg = err?.message || String(err)
  if (/schema cache|does not exist|column .* of/i.test(msg)) return 'Falta actualizar la base de datos: ejecuta en Supabase el último SQL de supabase/migrations.'
  if (/duplicate key|unique/i.test(msg)) return 'Ya existe un registro con ese nombre.'
  if (/foreign key|violates.*restrict/i.test(msg)) return 'Tiene movimientos asociados. Archívala en lugar de eliminarla.'
  if (/Invalid login credentials/i.test(msg)) return 'Email o contraseña incorrectos.'
  if (/Email not confirmed/i.test(msg)) return 'Confirma tu email antes de ingresar.'
  return msg
}
