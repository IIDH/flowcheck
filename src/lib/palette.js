// Colores de gráficos por tipo de cuenta. Validados (CVD + contraste) para
// fondo claro y oscuro; Recharts necesita hex reales, no var(--x).
export const CHART = {
  light: {
    fijo: '#2a78d6',
    variable: '#eb6834',
    ahorro: '#1baf7a',
    ingreso: '#eda100',
    free: '#d5dce4',
    plan: '#b9c3ce',
    grid: 'rgba(10,16,22,.08)',
    axis: '#5b6774',
    renta: '#5b6774',
    danger: '#f0483e'
  },
  dark: {
    fijo: '#3987e5',
    variable: '#d95926',
    ahorro: '#199e70',
    ingreso: '#c98500',
    free: '#2c3037',
    plan: '#4a515b',
    grid: 'rgba(255,255,255,.08)',
    axis: '#98a3ae',
    renta: '#98a3ae',
    danger: '#f0483e'
  }
}

// Colores elegibles para identificar cada cuenta (orden fijo).
export const ACCOUNT_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#0aa5ff', '#8a63d2', '#5b6774']
