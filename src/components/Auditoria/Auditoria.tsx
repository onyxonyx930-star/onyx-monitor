import { useState, Suspense, lazy } from 'react'
import Loading from '../shared/Loading'

const ListaAuditoria = lazy(() => import('./ListaAuditoria'))
const RelatorioAuditoria = lazy(() => import('./RelatorioAuditoria'))
const ConfigAuditoria = lazy(() => import('./ConfigAuditoria'))
const FormAuditoria = lazy(() => import('./FormAuditoria'))

type Tab = 'lista' | 'relatorios' | 'config'

export default function Auditoria() {
  const [tab, setTab] = useState<Tab>('lista')
  const [showForm, setShowForm] = useState(false)

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'lista', label: 'Registros', icon: '📋' },
    { id: 'relatorios', label: 'Relatórios', icon: '📊' },
    { id: 'config', label: 'Integrações', icon: '⚙️' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 bg-onyx-900 border border-onyx-700/50 rounded-xl p-1 w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === t.id
                ? 'bg-accent-blue/10 text-accent-blue border border-accent-blue/20'
                : 'text-gray-400 hover:text-gray-200 border border-transparent'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <Suspense fallback={<Loading />}>
        {tab === 'lista' && <ListaAuditoria onNovo={() => setShowForm(true)} />}
        {tab === 'relatorios' && <RelatorioAuditoria />}
        {tab === 'config' && <ConfigAuditoria />}
      </Suspense>

      {showForm && (
        <Suspense fallback={<Loading />}>
          <FormAuditoria onClose={() => setShowForm(false)} onSuccess={() => { setShowForm(false); setTab('lista') }} />
        </Suspense>
      )}
    </div>
  )
}
