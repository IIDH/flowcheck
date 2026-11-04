import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ConfirmProvider } from './components/ConfirmDialog'
import { AppProvider } from './context/AppContext'
import { supabaseConfigured } from './lib/supabase'
// Fuentes alojadas en el propio dominio (sin Google Fonts: privacidad + CSP estricta)
import '@fontsource-variable/sora'
import '@fontsource-variable/manrope'
import '@fontsource-variable/jetbrains-mono'
// Captura el aviso de instalación apenas carga la página (antes de cualquier pantalla)
import './lib/install'
import './styles/theme.css'
import './styles/redesign.css'

function SetupNeeded() {
  return (
    <div className="auth-wrap">
      <div className="card auth-card" style={{ maxWidth: 520 }}>
        <span className="pill dc-mono"><span className="pill-dot" />Configuración</span>
        <h1 style={{ fontSize: 26, marginTop: 14 }}>Falta conectar Supabase</h1>
        <p className="lead">
          Copia <code>.env.example</code> a <code>.env.local</code> y completa <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>. En Vercel, agrégalas en Settings → Environment Variables.
        </p>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {supabaseConfigured ? (
      <BrowserRouter>
        <AppProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </AppProvider>
      </BrowserRouter>
    ) : (
      <SetupNeeded />
    )}
  </React.StrictMode>
)
