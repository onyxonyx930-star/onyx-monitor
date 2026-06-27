import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAgents, deleteAgent } from '../../services/api'
import type { Agent } from '../../types'
import Loading from '../shared/Loading'
import EmptyState from '../shared/EmptyState'
import ConfirmDialog from '../shared/ConfirmDialog'

export default function ListaAgents() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const navigate = useNavigate()

  const loadAgents = async () => {
    try {
      setLoading(true)
      const data = await getAgents()
      setAgents(data as Agent[])
    } catch (err) {
      setError('Erro ao carregar agents')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAgents()
  }, [])

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteAgent(deleteId)
      setAgents(agents.filter(a => a.id !== deleteId))
      setDeleteId(null)
    } catch (err) {
      setError('Erro ao excluir agent')
    }
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-green-500/10 text-green-400 border-green-500/20',
      inactive: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
      offline: 'bg-red-500/10 text-red-400 border-red-500/20',
    }
    const labels: Record<string, string> = {
      active: 'Ativo',
      inactive: 'Inativo',
      offline: 'Offline',
    }
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full border ${styles[status] || styles.inactive}`}>
        {labels[status] || status}
      </span>
    )
  }

  const isOnline = (agent: Agent) => {
    if (!agent.last_heartbeat) return false
    const lastSeen = new Date(agent.last_heartbeat).getTime()
    const now = Date.now()
    return (now - lastSeen) < 5 * 60 * 1000 // 5 minutes
  }

  if (loading) return <Loading />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Agents</h1>
          <p className="text-sm text-gray-400 mt-1">Gerencie os agents de coleta remota</p>
        </div>
        <button
          onClick={() => navigate('/agents/novo')}
          className="px-4 py-2 bg-accent-blue text-white rounded-lg hover:bg-accent-blue/80 transition-colors font-medium"
        >
          + Novo Agent
        </button>
      </div>

      {error && (
        <div className="p-4 bg-accent-red/10 border border-accent-red/20 rounded-lg text-accent-red text-sm">
          {error}
        </div>
      )}

      {agents.length === 0 ? (
        <EmptyState
          icon="🤖"
          title="Nenhum agent encontrado"
          description="Instale o Onyx Agent na rede do cliente para coletar dados automaticamente."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="bg-onyx-800/50 border border-onyx-700/50 rounded-xl p-5 hover:border-onyx-600/50 transition-all cursor-pointer"
              onClick={() => navigate(`/agents/${agent.id}`)}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    isOnline(agent) ? 'bg-green-500/10' : 'bg-onyx-700/50'
                  }`}>
                    <span className="text-lg">🤖</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-100">{agent.name}</h3>
                    <p className="text-xs text-gray-500">{agent.company_id}</p>
                  </div>
                </div>
                {getStatusBadge(isOnline(agent) ? 'active' : agent.status)}
              </div>

              <div className="space-y-2 text-sm">
                {agent.location && (
                  <div className="flex items-center gap-2 text-gray-400">
                    <span>📍</span>
                    <span>{agent.location}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-gray-400">
                  <span>🖨️</span>
                  <span>{agent.printers_count || 0} impressoras</span>
                </div>
                {agent.last_heartbeat && (
                  <div className="flex items-center gap-2 text-gray-400">
                    <span>💓</span>
                    <span>Último heartbeat: {new Date(agent.last_heartbeat).toLocaleString('pt-BR')}</span>
                  </div>
                )}
                {agent.version && (
                  <div className="flex items-center gap-2 text-gray-400">
                    <span>📦</span>
                    <span>v{agent.version}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-4 pt-4 border-t border-onyx-700/50">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate(`/agents/${agent.id}`)
                  }}
                  className="flex-1 px-3 py-1.5 text-xs font-medium text-gray-300 bg-onyx-700/50 rounded-lg hover:bg-onyx-700 transition-colors"
                >
                  Detalhes
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeleteId(agent.id)
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-accent-red bg-accent-red/10 rounded-lg hover:bg-accent-red/20 transition-colors"
                >
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteId && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setDeleteId(null)}
          onConfirm={handleDelete}
          title="Excluir Agent"
          message="Tem certeza que deseja excluir este agent? Os equipamentos serão desatribuídos."
          destructive
        />
      )}
    </div>
  )
}
