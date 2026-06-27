import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Loading from './components/shared/Loading'

const Dashboard = lazy(() => import('./components/Dashboard/Dashboard'))
const Equipamentos = lazy(() => import('./components/Equipamentos/ListaEquipamentos'))
const EquipamentoDetalhes = lazy(() => import('./components/Equipamentos/DetalhesEquipamento'))
const Suprimentos = lazy(() => import('./components/Suprimentos/Suprimentos'))
const Alertas = lazy(() => import('./components/Alertas/Alertas'))
const Relatorios = lazy(() => import('./components/Relatorios/Relatorios'))
const Configuracoes = lazy(() => import('./components/Configuracoes'))
const Login = lazy(() => import('./components/Login'))

function PrivateRoute({ children, isAuthenticated }: { children: React.ReactNode; isAuthenticated: boolean }) {
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('onyx_token')
    if (token) {
      setIsAuthenticated(true)
    }
    setIsLoading(false)
  }, [])

  const handleLogin = () => {
    localStorage.setItem('onyx_token', 'authenticated')
    setIsAuthenticated(true)
  }

  const handleLogout = () => {
    localStorage.removeItem('onyx_token')
    setIsAuthenticated(false)
  }

  if (isLoading) {
    return <Loading fullPage />
  }

  return (
    <BrowserRouter>
      <Suspense fallback={<Loading fullPage />}>
        <Routes>
          <Route path="/login" element={<Login onLogin={handleLogin} />} />
          <Route
            path="/"
            element={
              <PrivateRoute isAuthenticated={isAuthenticated}>
                <Layout onLogout={handleLogout}>
                  <Dashboard />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/equipamentos"
            element={
              <PrivateRoute isAuthenticated={isAuthenticated}>
                <Layout onLogout={handleLogout}>
                  <Equipamentos />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/equipamentos/:id"
            element={
              <PrivateRoute isAuthenticated={isAuthenticated}>
                <Layout onLogout={handleLogout}>
                  <EquipamentoDetalhes />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/suprimentos"
            element={
              <PrivateRoute isAuthenticated={isAuthenticated}>
                <Layout onLogout={handleLogout}>
                  <Suprimentos />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/alertas"
            element={
              <PrivateRoute isAuthenticated={isAuthenticated}>
                <Layout onLogout={handleLogout}>
                  <Alertas />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/relatorios"
            element={
              <PrivateRoute isAuthenticated={isAuthenticated}>
                <Layout onLogout={handleLogout}>
                  <Relatorios />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/configuracoes"
            element={
              <PrivateRoute isAuthenticated={isAuthenticated}>
                <Layout onLogout={handleLogout}>
                  <Configuracoes />
                </Layout>
              </PrivateRoute>
            }
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
