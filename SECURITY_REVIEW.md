# Flowcheck — Revisión de seguridad (OWASP Top 10)

**Fecha:** 31-10-2026 · **Versión revisada:** 0.2 (local, previa a publicación)
**Alcance:** base de datos Supabase (esquema, RLS, triggers, vistas), API Node (`/api`), frontend React/PWA, configuración de Vercel, autenticación y dependencias npm.
**Método:** revisión del código fuente + pruebas en vivo contra el proyecto Supabase con la clave pública (usuario anónimo) + `npm audit`.

---

## Veredicto

> ### ❌ NO APTO para publicar todavía — ✅ apto tras corregir los 5 puntos ALTOS
>
> No se encontraron vulnerabilidades **críticas**: el aislamiento de datos entre usuarios (RLS) funciona y ningún secreto está expuesto al navegador. Pero hay 5 puntos **altos** que deben resolverse antes de abrir la app a usuarios reales (estimado: 1 día de trabajo + configuración en Supabase/Vercel).

| Severidad | Cantidad | ¿Bloquea publicar? |
|---|---|---|
| 🔴 Crítico | 0 | — |
| 🟠 Alto | 5 | **Sí** |
| 🟡 Medio | 7 | Recomendado antes; obligatorio en las primeras semanas |
| 🔵 Bajo | 7 | Mejora continua |

---

## 🔄 Estado tras las correcciones (31-10-2026)

| # | Punto | Estado | Qué se hizo / qué falta |
|---|---|---|---|
| A1 | Cabeceras de seguridad | ✅ Código | `vercel.json`: CSP estricta, `frame-ancestors 'none'` + `X-Frame-Options`, HSTS, `nosniff`, Referrer-Policy, Permissions-Policy, COOP. Verificado que el build no tiene scripts en línea. **Pendiente:** confirmar en producción (securityheaders.com y la consola sin errores de CSP). |
| A2 | SSRF en push | ✅ Código + BD | Lista blanca de servicios push oficiales en la API (`isAllowedPushEndpoint`, probada con 10 casos), en el cliente y como `check` en la base (migración 0007). |
| A3 | SMTP de producción | 🧑 Tú | Configurar un proveedor de correo propio en Supabase (ver checklist). |
| A4 | Auth en producción | 🧑 Tú | Site URL/Redirect URLs y contraseña mínima en Supabase. El formulario ya exige 8 caracteres, y se agregó la pantalla para **crear una contraseña nueva** tras el enlace de recuperación (antes faltaba). |
| A5 | Marco legal | ✅ Código · ⚖️ Abogado | Páginas `/privacidad` y `/terminos` (borradores), aceptación obligatoria al registrarse (queda la fecha en `profiles.terms_accepted_at`), **Exportar mis datos** (JSON + CSV) y **Eliminar mi cuenta** (`/api/account/delete`). **Pendiente:** completar los datos entre [corchetes] y validar los textos con un abogado. |
| M1 | Dependencias | ✅ | react-router 7, vite 8, vite-plugin-pwa 2. `npm audit --omit=dev`: **0 vulnerabilidades** en lo que se publica. Quedan avisos moderados/bajos en `workbox-build`, herramienta que solo se usa al compilar (no llega al usuario); el arreglo depende del proveedor. |
| M2 | CAPTCHA | ✅ Código · 🧑 Tú | Turnstile integrado en login, registro y recuperación; se activa al definir `VITE_TURNSTILE_SITE_KEY` y la clave secreta en Supabase. |
| M3 | Límite de peticiones | ✅ Código + BD | `hit_rate_limit` en Supabase (funciona entre instancias serverless): resumen 120/5 min, abrir/cerrar mes 30/10 min, push de prueba 5/h, eliminar cuenta 3/h. **Recomendado además:** activar el Firewall de Vercel. |
| M4 | Auditoría | ✅ Código + BD | Tabla `audit_log` con triggers: retiros, eliminaciones, cerrar/reabrir mes, archivar cuentas. Visible para el usuario en Ajustes → Actividad reciente. **Opcional:** Sentry para errores. |
| M5 | Respaldos | 🧑 Tú | Plan Pro de Supabase o `pg_dump` programado. |
| M6 | Datos en el dispositivo | ✅ | La caché local se borra al cerrar sesión **y** al abrir la app sin sesión válida (por ejemplo, si expiró). El aviso de equipos compartidos queda en la política de privacidad. |
| M7 | Google OAuth | 🧑 Tú | Publicar la pantalla de consentimiento o lanzar sin Google. |
| B1 | Errores internos | ✅ | La API responde mensajes genéricos (`serverError`); el detalle solo queda en los logs del servidor. |
| B2 | Comparación del secreto | ✅ | `timingSafeEqual`. |
| B3 | Cache-Control | ✅ | `no-store` en toda la API (código + `vercel.json`). |
| B4 | Límites de tamaño | ✅ BD | Largos máximos, máximo 10 dispositivos push y 150 cuentas por usuario. |
| B5 | Rol anónimo | ✅ BD | `revoke all ... from anon` en tablas y vistas. |
| B6 | Google Fonts | ✅ | Fuentes alojadas en el propio dominio (`@fontsource-variable`); ya no se envía la IP del usuario a Google. |
| B7 | MFA | ✅ Código · 🧑 Tú | Ajustes → Verificación en dos pasos (TOTP con QR) y paso extra al ingresar. Requiere que MFA TOTP esté habilitado en Supabase (viene activo por defecto). |

**Veredicto actualizado:** el código queda **apto**. Para publicar falta solo lo marcado con 🧑 (configuración) y ⚖️ (legal). Ver *Checklist de publicación* al final.

---

## ✅ Lo que está bien (verificado)

| Control | Evidencia |
|---|---|
| **Aislamiento entre usuarios (A01)** | RLS activo en las 7 tablas. Prueba en vivo: un anónimo lee `[]` en todas las tablas y vistas, y al intentar insertar recibe `42501 violates row-level security`. |
| **Integridad de referencias** | Las políticas de `budget_items` y `transactions` verifican que el mes **y** la cuenta pertenezcan al usuario: no se pueden mezclar datos de otro usuario aunque se conozca su UUID. |
| **Vistas seguras** | `month_account_summary` y `account_balances` usan `security_invoker = true`: respetan RLS. |
| **Secretos fuera del navegador (A02)** | `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY` y `CRON_SECRET` solo existen en el servidor; no aparecen en `src/`. `.env.local` está en `.gitignore`. |
| **API autenticada** | Cada endpoint valida el JWT con `auth.getUser()` y consulta como el usuario (RLS aplica también en la API). El cron exige `CRON_SECRET`. |
| **Inyección / XSS (A03)** | No hay SQL armado a mano (todo pasa por PostgREST con parámetros). No hay `dangerouslySetInnerHTML`, `innerHTML` ni `eval`; React escapa todo el texto. |
| **Reglas de negocio en la base** | Mes cerrado = solo lectura (trigger). Retiros solo desde cuentas de ahorro y con motivo (trigger). Montos `> 0`, textos con largo máximo. |
| **Confirmación de email** | Activa (`mailer_autoconfirm: false`, verificado en vivo). |
| **Función `security definer`** | `handle_new_user` usa `search_path = ''` (evita secuestro de esquema) y no es invocable por RPC (verificado). |

---

## 🟠 ALTOS — bloquean la publicación

### A1. Faltan cabeceras de seguridad (CSP, anti-clickjacking) — *A05 Configuración insegura*
- **Dónde:** `vercel.json` no define cabeceras de seguridad.
- **Riesgo:** sin `Content-Security-Policy`, cualquier XSS futuro (o una dependencia comprometida) puede robar la sesión, que vive en `localStorage`. Sin `frame-ancestors`, la app puede incrustarse en un sitio malicioso (clickjacking) para inducir clics como "Eliminar imagen del mes".
- **Solución:** agregar en `vercel.json`: `Content-Security-Policy` (`default-src 'self'`; `connect-src` hacia el dominio de Supabase; fuentes de Google; `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` y `Strict-Transport-Security`.
- **Esfuerzo:** 1 hora (más pruebas de que nada se rompa).

### A2. SSRF: el servidor envía peticiones a URLs que elige el usuario — *A10 SSRF*
- **Dónde:** `push_subscriptions.endpoint` lo escribe el cliente; `api/push/test.js` y `api/cron/reminders.js` hacen un POST a esa URL sin validarla.
- **Riesgo:** un usuario registrado puede guardar como "endpoint" cualquier URL (interna o de terceros) y, con el botón "Enviar prueba", hacer que **nuestro servidor** le envíe peticiones a voluntad. Sirve para escanear, abusar de servicios ajenos o hacer que nuestro dominio aparezca atacando.
- **Solución:** aceptar solo `https://` hacia los servicios push oficiales (`fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.notify.windows.com`, `*.push.apple.com`), validado en la base (`check`) y en la API antes de enviar.
- **Esfuerzo:** 1 hora.

### A3. Correo de autenticación no apto para producción — *A07 Fallas de autenticación*
- **Dónde:** Supabase usa su servidor de correo de prueba.
- **Riesgo:** el SMTP por defecto de Supabase está limitado a muy pocos envíos por hora y solo entrega a direcciones del equipo del proyecto. Con confirmación de email activa, **los usuarios reales no podrían confirmar su cuenta ni recuperar su contraseña**. Además, los correos salen sin tu dominio (más spam y más phishing creíble).
- **Solución:** configurar SMTP propio (Resend, Postmark, Amazon SES) en *Authentication → Emails → SMTP*, con SPF/DKIM en tu dominio, y personalizar las plantillas.
- **Esfuerzo:** 1–2 horas (requiere dominio propio).

### A4. Configuración de Auth apuntando a desarrollo — *A07 / A05*
- **Dónde:** *Authentication → URL Configuration* tiene `Site URL = http://localhost:5173`.
- **Riesgo:** los enlaces de confirmación y recuperación llevarían a `localhost`, y si se agregan comodines en *Redirect URLs* se abre la puerta a redirecciones de tokens hacia sitios ajenos.
- **Solución:**
  - Site URL = dominio de producción.
  - Redirect URLs solo con los dominios exactos, sin `*`.
  - Contraseña mínima de 8 caracteres en Supabase. Hoy el mínimo de 8 solo se valida en el formulario; el servidor acepta 6.
  - Activar "Secure password change".
- **Esfuerzo:** 30 minutos.

### A5. Falta el marco legal para datos financieros personales — *Privacidad / cumplimiento*
- **Dónde:** la app no tiene política de privacidad, términos de uso ni forma de **eliminar la cuenta y sus datos**.
- **Riesgo:** se tratan datos financieros personales. En Chile aplica la Ley 19.628, y la nueva Ley 21.719 (vigente desde diciembre de 2026) exige informar el tratamiento, la base legal, los derechos de acceso, rectificación y supresión, y la notificación de brechas. Publicar sin esto es un riesgo legal y de confianza.
- **Solución:**
  - Página de Privacidad y Términos, enlazadas en el login y aceptadas al registrarse.
  - Botón "Eliminar mi cuenta" en Ajustes (endpoint con service role que borra el usuario; los datos caen en cascada).
  - "Exportar mis datos" (CSV o JSON).
- **Esfuerzo:** medio día de desarrollo; la redacción legal la debe validar un abogado.

---

## 🟡 MEDIOS — corregir antes o justo después del lanzamiento

| # | Hallazgo | OWASP | Dónde | Solución | Esfuerzo |
|---|---|---|---|---|---|
| M1 | **Dependencias con vulnerabilidades conocidas:** `react-router-dom 6.30` (open redirect / XSS en navegación, *moderate*, va en producción); `vite 5.4` (*high*, path traversal, solo en el servidor de desarrollo); `vite-plugin-pwa` / `workbox-build` (*moderate*, solo en build). | A06 | `package.json` | Subir a `react-router-dom@7`, `vite@8` y `vite-plugin-pwa@2` (son versiones mayores: hay que probar), y activar Dependabot en GitHub. | 2–3 h |
| M2 | **Sin CAPTCHA en registro y login:** bots pueden crear cuentas masivamente o probar contraseñas. | A07 | Supabase Auth | Activar Cloudflare Turnstile en *Auth → Bot protection* y agregar el widget en el login. | 1–2 h |
| M3 | **Sin límite de peticiones en la API propia:** `/api/push/test`, `/api/months/open` y `/api/months/close` se pueden llamar en bucle (costos de Vercel, abuso de push). | A04 | `api/*` | Límite por usuario (por ejemplo, Upstash Ratelimit o una tabla de conteo) y activar el Firewall de Vercel. | 2 h |
| M4 | **Sin registro de auditoría ni alertas:** no queda registro de acciones sensibles (eliminar mes, retiros, cambios de cuentas) ni alertas ante errores o picos. | A09 | API / BD | Tabla `audit_log` (por trigger) para eliminaciones y retiros; Sentry (o similar) para errores; alertas de Supabase y Vercel. | 3 h |
| M5 | **Sin respaldos con restauración puntual:** en el plan gratuito de Supabase no hay PITR, y un error o un borrado accidental no se podría revertir al minuto. | — | Supabase | Plan Pro (respaldos diarios + PITR opcional) o un `pg_dump` programado a almacenamiento externo. | 30 min + costo |
| M6 | **Datos financieros guardados en el dispositivo:** el modo sin conexión guarda en `localStorage` cuentas, movimientos y resumen, y el token de sesión vive ahí. Se borra al cerrar sesión, pero no si la sesión expira o si alguien usa un equipo compartido sin salir. | A02 | `src/lib/offline.js` | Borrar la caché también cuando expira la sesión; aviso de "no uses la app en equipos compartidos"; opcionalmente IndexedDB cifrado. La CSP (A1) reduce el riesgo de robo por XSS. | 1–2 h |
| M7 | **Google OAuth sin verificar:** si se activa Google, la pantalla de consentimiento en modo "Testing" solo admite 100 usuarios de prueba y muestra advertencias. | A07 | Google Cloud | Publicar la app de OAuth (requiere dominio, política de privacidad y logo) o dejar Google desactivado en el lanzamiento. | 1 h + revisión de Google |

---

## 🔵 BAJOS — mejora continua

| # | Hallazgo | OWASP | Solución |
|---|---|---|---|
| B1 | La API devuelve mensajes de error internos de la base (`error.message`) al cliente. | A05 | Devolver mensajes genéricos y registrar el detalle solo en el servidor. |
| B2 | `CRON_SECRET` se compara con `!==` (comparación no constante en tiempo). | A07 | Usar `crypto.timingSafeEqual`. |
| B3 | Las respuestas de `/api/summary` no incluyen `Cache-Control: no-store`. | A04 | Agregar la cabecera para que ningún proxy o navegador guarde datos financieros. |
| B4 | Campos sin límite de largo en la base: `months.notes`, `push_subscriptions.endpoint` y `user_agent` (el recorte se hace solo en el cliente). Tampoco hay tope de filas por usuario. | A04 | `check (length(...) <= N)` y límites razonables (por ejemplo, 10 dispositivos push por usuario). |
| B5 | El rol `anon` conserva los permisos por defecto de Supabase sobre las tablas (RLS lo bloquea, verificado, pero es una sola capa). | A01 | `revoke all on <tablas> from anon;` como defensa en profundidad. |
| B6 | Fuentes cargadas desde Google Fonts: dependencia externa sin SRI y envío de la IP del usuario a Google. | A08 / Privacidad | Alojar las fuentes en el propio dominio (también simplifica la CSP). |
| B7 | Sin MFA (segundo factor) opcional para los usuarios. | A07 | Activar MFA TOTP de Supabase y ofrecerlo en Ajustes. |

---

## Ruta para quedar "APTO"

1. **Código** (lo puede hacer Claude): A1 cabeceras/CSP · A2 validación de endpoints push · A5 eliminar cuenta y exportar datos · M1 actualizar dependencias · B1–B5.
2. **Configuración** (la haces tú, con guía): A3 SMTP propio · A4 URLs y contraseña en Supabase · M2 Turnstile · M5 respaldos.
3. **Legal** (con asesoría): A5 textos de Privacidad y Términos.
4. **Volver a revisar:** repetir esta auditoría y las pruebas en vivo sobre el dominio de producción, y verificar las cabeceras en securityheaders.com.

*Esta revisión cubre el código y la configuración actuales; no reemplaza un pentest externo, recomendable cuando la app tenga usuarios pagos.*

---

## 🧑 Checklist de publicación (lo que te toca)

**Supabase → SQL Editor**
- [ ] Ejecutar `supabase/migrations/0007_security_hardening.sql`. Es obligatorio: sin esto no funcionan Eliminar cuenta, Actividad ni el límite de peticiones.

**Supabase → Authentication**
- [ ] *Emails → SMTP Settings*: proveedor propio (Resend, Postmark, SES) con SPF/DKIM en tu dominio. **(A3)**
- [ ] *URL Configuration*: Site URL = `https://tu-dominio`; Redirect URLs = solo tus dominios exactos, sin `*`. **(A4)**
- [ ] *Sign In / Providers → Email*: confirmación de email activada, contraseña mínima 8 y "Secure password change" activado. **(A4)**
- [ ] *Attack Protection*: activar CAPTCHA con Turnstile (clave secreta) y poner la clave pública en `VITE_TURNSTILE_SITE_KEY`. **(M2)**
- [ ] *Multi-Factor*: confirmar que TOTP está habilitado. **(B7)**

**Supabase → Settings**
- [ ] Respaldos: plan Pro o `pg_dump` programado. **(M5)**

**Vercel**
- [ ] Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (solo servidor), `VITE_VAPID_PUBLIC_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`, `VITE_TURNSTILE_SITE_KEY`.
- [ ] Dominio propio con HTTPS; activar el Firewall (rate limiting y protección contra bots).
- [ ] Después del deploy: revisar https://securityheaders.com y que la consola del navegador no muestre errores de CSP.

**Legal**
- [ ] Completar los [corchetes] de `src/pages/Legal.jsx` (razón social, RUT, contacto, proveedor SMTP, plazos) y validar con un abogado. **(A5)**

**Google (solo si lanzas con login de Google)**
- [ ] Publicar la pantalla de consentimiento de OAuth (requiere dominio, logo y política de privacidad). **(M7)**
