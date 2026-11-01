import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import MfaChallenge from './components/MfaChallenge'
import NewPassword from './components/NewPassword'
import { useApp } from './context/AppContext'
import { supabase } from './lib/supabase'
import Ahorros from './pages/Ahorros'
import Ajustes from './pages/Ajustes'
import Cuentas from './pages/Cuentas'
import Dashboard from './pages/Dashboard'
import { Privacidad, Terminos } from './pages/Legal'
import Login from './pages/Login'
import Movimientos from './pages/Movimientos'
import Plan from './pages/Plan'

function Splash() {
  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><div className="skeleton" style={{ width: 64, height: 64, borderRadius: 18 }} /></div>
}

function PrivateApp() {
  const { session, recovery } = useApp()
  const [mfaNeeded, setMfaNeeded] = useState(null)

  // Si el usuario activó verificación en dos pasos, exigir el código antes de entrar
  const checkMfa = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    setMfaNeeded(!error && data?.nextLevel === 'aal2' && data?.currentLevel !== 'aal2')
  }, [])
  useEffect(() => {
    if (session) checkMfa()
    else setMfaNeeded(null)
  }, [session, checkMfa])

  if (session === undefined) return <Splash />
  if (!session) return <Login />
  if (mfaNeeded === null) return <Splash />
  if (mfaNeeded) return <MfaChallenge onVerified={checkMfa} />
  if (recovery) return <NewPassword />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="mes" element={<Plan />} />
        <Route path="movimientos" element={<Movimientos />} />
        <Route path="ahorros" element={<Ahorros />} />
        <Route path="cuentas" element={<Cuentas />} />
        <Route path="ajustes" element={<Ajustes />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <Routes>
      {/* Páginas públicas (accesibles sin sesión) */}
      <Route path="/privacidad" element={<Privacidad />} />
      <Route path="/terminos" element={<Terminos />} />
      <Route path="*" element={<PrivateApp />} />
    </Routes>
  )
}
