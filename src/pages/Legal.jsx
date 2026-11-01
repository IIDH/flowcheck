import { Link } from 'react-router-dom'
import { Logo } from '../components/Layout'

// ⚠️ BORRADOR — debe ser revisado y completado por un abogado antes de publicar.
// Reemplaza los campos [ENTRE CORCHETES] con los datos reales del responsable.
const RESPONSABLE = '[RAZÓN SOCIAL / NOMBRE DEL RESPONSABLE]'
const RUT = '[RUT]'
const CONTACTO = '[correo de contacto para privacidad]'
const ACTUALIZADO = '[fecha de publicación]'

function LegalShell({ title, children }) {
  return (
    <div className="legal">
      <header className="fa-header">
        <div className="fa-header-inner">
          <Logo />
          <div className="fa-header-actions">
            <Link to="/" className="btn btn-ghost btn-sm">Volver a la app</Link>
          </div>
        </div>
      </header>
      <main className="fa-main legal-body">
        <span className="pill dc-mono"><span className="pill-dot" />Legal</span>
        <h1 className="page-title">{title}</h1>
        <p className="muted" style={{ marginTop: 8 }}>Última actualización: {ACTUALIZADO}</p>
        {children}
      </main>
    </div>
  )
}

export function Privacidad() {
  return (
    <LegalShell title="Política de privacidad">
      <h2>1. Quién es responsable de tus datos</h2>
      <p>{RESPONSABLE}, RUT {RUT} (en adelante, “Flowcheck”), es responsable del tratamiento de los datos personales que entregas al usar la aplicación. Contacto: {CONTACTO}.</p>

      <h2>2. Qué datos tratamos</h2>
      <ul>
        <li><b>Cuenta:</b> email, nombre (opcional), contraseña (guardada cifrada por nuestro proveedor de autenticación; nunca la vemos) o los datos básicos de tu cuenta de Google si ingresas con ella.</li>
        <li><b>Datos financieros que tú ingresas:</b> renta mensual, cuentas, montos planificados, gastos, ahorros, retiros y sus motivos.</li>
        <li><b>Preferencias:</b> moneda, zona horaria, configuración de recordatorios.</li>
        <li><b>Notificaciones:</b> identificador técnico del dispositivo para enviarte avisos push, si los activas.</li>
        <li><b>Registros técnicos y de seguridad:</b> acciones relevantes (por ejemplo, eliminaciones o retiros) para protegerte ante errores o accesos indebidos.</li>
      </ul>
      <p>No pedimos ni guardamos claves bancarias, números de tarjeta ni acceso a tus cuentas bancarias.</p>

      <h2>3. Para qué los usamos y con qué base legal</h2>
      <ul>
        <li>Prestarte el servicio (organizar tu presupuesto y mostrarte reportes): ejecución del contrato que aceptas al registrarte.</li>
        <li>Enviarte recordatorios de pagos: tu consentimiento, que puedes retirar en Ajustes.</li>
        <li>Seguridad, prevención de abuso y cumplimiento legal: interés legítimo y obligaciones legales.</li>
      </ul>
      <p>No vendemos tus datos ni los usamos para publicidad de terceros.</p>

      <h2>4. Con quién los compartimos</h2>
      <p>Solo con proveedores que nos ayudan a operar el servicio, bajo contratos de confidencialidad: alojamiento de la aplicación (Vercel), base de datos y autenticación (Supabase), envío de correos [proveedor SMTP] y servicios de notificaciones push de tu navegador (Google, Apple, Mozilla o Microsoft). Algunos de estos proveedores pueden almacenar datos fuera de Chile, con medidas de protección adecuadas.</p>

      <h2>5. Cuánto tiempo los guardamos</h2>
      <p>Mientras tengas tu cuenta activa. Si eliminas tu cuenta, borramos tus datos de forma inmediata de la base de datos de producción; las copias de respaldo se eliminan en un plazo máximo de [N] días.</p>

      <h2>6. Tus derechos</h2>
      <p>Puedes acceder, rectificar, suprimir, oponerte, pedir la portabilidad y bloquear el tratamiento de tus datos. Desde la app puedes <b>exportar tus datos</b> y <b>eliminar tu cuenta</b> (Ajustes). Para cualquier otra solicitud escríbenos a {CONTACTO}; responderemos dentro de los plazos legales. También puedes reclamar ante la autoridad de protección de datos competente.</p>

      <h2>7. Seguridad</h2>
      <p>Usamos conexiones cifradas (HTTPS), aislamiento de datos por usuario a nivel de base de datos, controles de acceso y registros de auditoría. Si ocurriera una vulneración que afecte tus datos, te informaremos según lo exige la ley.</p>

      <h2>8. Datos en tu dispositivo</h2>
      <p>Para funcionar sin conexión, la app guarda en tu navegador una copia de tus últimos datos y tu sesión. Se borran al cerrar sesión. No uses la app en equipos compartidos sin cerrar sesión.</p>

      <h2>9. Menores de edad</h2>
      <p>Flowcheck está dirigida a mayores de 18 años.</p>

      <h2>10. Cambios</h2>
      <p>Si cambiamos esta política te avisaremos en la app o por email antes de que el cambio entre en vigencia.</p>
    </LegalShell>
  )
}

export function Terminos() {
  return (
    <LegalShell title="Términos y condiciones">
      <h2>1. El servicio</h2>
      <p>Flowcheck es una herramienta para organizar tu presupuesto personal: registrar ingresos, gastos y ahorros, y ver reportes. Es ofrecida por {RESPONSABLE}, RUT {RUT}.</p>

      <h2>2. No es asesoría financiera</h2>
      <p>La información y los cálculos de la app son referenciales y se basan en los datos que tú ingresas. Flowcheck no entrega asesoría financiera, tributaria ni de inversiones, y no mueve dinero ni se conecta a tus cuentas bancarias.</p>

      <h2>3. Tu cuenta</h2>
      <p>Debes ser mayor de 18 años, entregar un email válido y mantener tu contraseña en reserva. Eres responsable de la actividad realizada con tu cuenta. Avísanos de inmediato si sospechas un acceso no autorizado.</p>

      <h2>4. Uso aceptable</h2>
      <p>No puedes usar la app para fines ilícitos, intentar acceder a datos de otros usuarios, interferir con su funcionamiento, automatizar el registro de cuentas ni realizar pruebas de seguridad sin autorización escrita.</p>

      <h2>5. Tus datos</h2>
      <p>Los datos que ingresas son tuyos. Puedes exportarlos o eliminar tu cuenta en cualquier momento desde Ajustes. El tratamiento de tus datos se rige por la <Link to="/privacidad">Política de privacidad</Link>.</p>

      <h2>6. Disponibilidad</h2>
      <p>Trabajamos para que el servicio esté disponible y respaldado, pero puede tener interrupciones por mantenimiento o causas ajenas. Te recomendamos exportar tus datos periódicamente.</p>

      <h2>7. Responsabilidad</h2>
      <p>En la máxima medida permitida por la ley, Flowcheck no responde por decisiones financieras tomadas en base a la información de la app ni por errores en los datos ingresados por el usuario. [Revisar con abogado: límites de responsabilidad según la Ley 19.496 de Protección al Consumidor.]</p>

      <h2>8. Precio</h2>
      <p>[Indicar si el servicio es gratuito o el plan de pago, medios de pago, renovación y derecho a retracto.]</p>

      <h2>9. Término</h2>
      <p>Puedes dejar de usar la app y eliminar tu cuenta cuando quieras. Podemos suspender cuentas que infrinjan estos términos, avisándote cuando sea posible.</p>

      <h2>10. Cambios y ley aplicable</h2>
      <p>Te avisaremos de cambios relevantes con anticipación. Estos términos se rigen por las leyes de Chile; cualquier controversia se someterá a los tribunales de [ciudad].</p>
    </LegalShell>
  )
}
