import { lazy, Suspense, useEffect, useState, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Loading from './components/shared/Loading'
import type { Equipamento } from './types'
import { getToken, removeToken, getMe } from './services/api'

const Dashboard = lazy(() => import('./components/Dashboard/Dashboard'))
const ListaEquipamentos = lazy(() => import('./components/Equipamentos/ListaEquipamentos'))
const EquipamentoDetalhes = lazy(() => import('./components/Equipamentos/DetalhesEquipamento'))
const Suprimentos = lazy(() => import('./components/Suprimentos/Suprimentos'))
const Alertas = lazy(() => import('./components/Alertas/Alertas'))
const Relatorios = lazy(() => import('./components/Relatorios/Relatorios'))
const Configuracoes = lazy(() => import('./components/Configuracoes'))
const Login = lazy(() => import('./components/Login'))
const FormEquipamento = lazy(() => import('./components/Equipamentos/FormEquipamento'))
const ListaAgents = lazy(() => import('./components/Agents/ListaAgents'))
const DetalhesAgent = lazy(() => import('./components/Agents/DetalhesAgent'))
const FormAgent = lazy(() => import('./components/Agents/FormAgent'))
const Auditoria = lazy(() => import('./components/Auditoria/Auditoria'))

function PrivateRoute({ children, isAuthenticated }: { children: React.ReactNode; isAuthenticated: boolean }) {
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [showEquipamentoForm, setShowEquipamentoForm] = useState(false)
  const [editingEquipamento, setEditingEquipamento] = useState<Equipamento | null>(null)
  const [equipamentoRefreshKey, setEquipamentoRefreshKey] = useState(0)

  const validateToken = useCallback(async () => {
    const token = getToken()
    if (!token || token === 'authenticated') {
      removeToken()
      localStorage.removeItem('onyx_user')
      setIsLoading(false)
      return
    }
    try {
      await getMe()
      setIsAuthenticated(true)
    } catch {
      removeToken()
      localStorage.removeItem('onyx_user')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    validateToken()
  }, [validateToken])

  const handleLogin = () => {
    setIsAuthenticated(true)
  }

  const handleLogout = () => {
    removeToken()
    localStorage.removeItem('onyx_user')
    setIsAuthenticated(false)
  }

  if (isLoading) {
    return <Loading fullPage />
  }

  return (
    <BrowserRouter>
      <Suspense fallback={<Loading fullPage />}>
        <Routes>
          <Route path="/login" element={
            isAuthenticated ? <Navigate to="/" replace /> : <Login onLogin={handleLogin} />
          } />
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
                  <ListaEquipamentos
                    key={equipamentoRefreshKey}
                    onNovo={() => {
                      setEditingEquipamento(null)
                      setShowEquipamentoForm(true)
                    }}
                    onEditar={(eq) => {
                      setEditingEquipamento(eq)
                      setShowEquipamentoForm(true)
                    }}
                  />
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
          <Route
            path="/agents"
            element={
              <PrivateRoute isAuthenticated={isAuthenticated}>
                <Layout onLogout={handleLogout}>
                  <ListaAgents />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/agents/novo"
            element={
              <PrivateRoute isAuthenticated={isAuthenticated}>
                <Layout onLogout={handleLogout}>
                  <FormAgent />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/agents/:id"
            element={
              <PrivateRoute isAuthenticated={isAuthenticated}>
                <Layout onLogout={handleLogout}>
                  <DetalhesAgent />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/auditoria"
            element={
              <PrivateRoute isAuthenticated={isAuthenticated}>
                <Layout onLogout={handleLogout}>
                  <Auditoria />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>

      {showEquipamentoForm && (
        <Suspense fallback={<Loading />}>
          <FormEquipamento
            equipamento={editingEquipamento}
            onClose={() => {
              setShowEquipamentoForm(false)
              setEditingEquipamento(null)
            }}
            onSuccess={() => {
              setShowEquipamentoForm(false)
              setEditingEquipamento(null)
              setEquipamentoRefreshKey((k) => k + 1)
            }}
          />
        </Suspense>
      )}
    </BrowserRouter>
  )
}
