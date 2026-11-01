# Flowcheck

PWA de finanzas personales: cuentas fijas y variables, ahorro, renta del mes y
dashboard de **plan vs real**, mes a mes.

**Stack:** React 18 + Vite (PWA) · API Node en funciones serverless de Vercel (`/api`) · Supabase (Postgres, Auth, RLS).
**Diseño:** mismo sistema visual que la landing de DigitalCodex (tokens, Sora/Manrope/JetBrains Mono, animaciones `dc-*`, modo claro/oscuro).

## Cómo funciona

1. **Cuentas**: creas tus cuentas (Arriendo, Luz, Supermercado, Fondo de emergencia…) con tipo
   `fijo | variable | ahorro | ingreso` y un monto mensual por defecto.
2. **Imagen del mes**: al abrir un mes ingresas la renta; la API (`POST /api/months/open`) copia lo
   planificado del mes anterior y suma las cuentas nuevas con su monto por defecto.
3. **Movimientos**: registras lo que vas gastando, ahorrando o ingresando extra. Los gastos fijos se pueden
   marcar como pagados con un clic desde *Mi mes*.
4. **Dashboard** (`GET /api/summary`): KPIs, barra *imagen vs realidad*, plan vs real por tipo,
   avance por cuenta, alertas (excesos, fijos pendientes, ritmo de gasto, meta de ahorro) e historial de 12 meses.
5. **Cerrar mes**: deja el mes en solo lectura (lo garantiza un trigger en la base).

## Puesta en marcha

### 1. Supabase
1. Crea un proyecto en <https://supabase.com>.
2. SQL Editor → pega y ejecuta `supabase/migrations/0001_init.sql`.
3. Authentication → URL Configuration → agrega tu URL local (`http://localhost:5173`) y la de Vercel como *Site URL / Redirect URLs*.
4. Project Settings → API → copia `Project URL` y `anon public key`.

### 2. Local
```bash
cp .env.example .env.local   # completa las 4 variables
npm install
npm run dev                  # Vite :5173 + API :3001
```

### 3. Vercel
1. Sube el repo a GitHub e impórtalo en Vercel (detecta Vite; `/api` se publica como funciones Node).
2. Settings → Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
3. Deploy. Agrega el dominio de Vercel en Supabase Auth (paso 1.3).

## Estructura
```
api/                    Funciones Node (Vercel)
  _lib/supabase.js      Valida JWT y crea cliente que respeta RLS
  months/open.js        Crea la imagen del mes
  summary.js            Dashboard agregado
supabase/migrations/    Esquema, vista, triggers y políticas RLS
src/
  context/              Sesión, perfil, tema, mes seleccionado, toasts
  hooks/useMonth.js     Mes + plan vs real, cuentas
  components/           Layout, MonthPicker, ImageBar, MoneyInput…
  pages/                Dashboard, Plan (Mi mes), Movimientos, Cuentas, Ajustes, Login
  styles/theme.css      Sistema visual
scripts/gen-icons.mjs   Genera íconos PWA desde public/favicon.svg
dev-server.mjs          API + Vite en local sin Vercel CLI
```

## Mejoras v0.2

### Recordatorios push de gastos fijos
- Migración: `supabase/migrations/0002_push_reminders.sql`.
- Cada gasto fijo puede tener **día de vencimiento** (Cuentas). En **Ajustes** se activan las notificaciones por dispositivo y se elige con cuántos días de anticipación avisar (además del mismo día).
- `GET /api/cron/reminders` corre 1 vez al día con Vercel Cron (`vercel.json`, 12:00 UTC). Solo avisa de fijos aún no pagados en la imagen del mes y no repite el mismo aviso el mismo día (`reminder_log`). `?dry=1` calcula sin enviar.
- `POST /api/push/test` envía una notificación de prueba.
- Variables (Vercel → Environment Variables): `VITE_VAPID_PUBLIC_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`.
- iPhone: las notificaciones solo funcionan con la app instalada en la pantalla de inicio (iOS 16.4+).

### Registro sin conexión
- La app abre sin internet (service worker) con los últimos datos vistos de cuentas, mes, movimientos y dashboard.
- Los movimientos registrados sin conexión quedan en una cola local con id propio y se sincronizan solos al volver la red (sin duplicados).

### Login con Google
- Botón "Continuar con Google". Requiere habilitar el proveedor Google en Supabase (ver abajo).
- Google Cloud Console → APIs y servicios → Credenciales → *ID de cliente de OAuth* (Aplicación web), URI de redirección autorizada: `https://<tu-proyecto>.supabase.co/auth/v1/callback`.
- Supabase → Authentication → Sign In / Providers → Google: pega Client ID y Client Secret.
