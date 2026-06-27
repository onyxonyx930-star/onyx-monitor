import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getAgent, updateAgent, getAgentLogs, unassignEquipmentFromAgent } from '../../services/api'
import type { Agent, AgentLog } from '../../types'
import Loading from '../shared/Loading'

export default function DetalhesAgent() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [agent, setAgent] = useState<Agent | null>(null)
  const [logs, setLogs] = useState<AgentLog[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'info' | 'printers' | 'logs'>('info')

  useEffect(() => {
    if (!id) return
    loadData()
  }, [id])

  const loadData = async () => {
    try {
      setLoading(true)
      const [agentData, logsData] = await Promise.all([
        getAgent(Number(id)),
        getAgentLogs(Number(id)),
      ])
      setAgent(agentData as Agent)
      setLogs(logsData as AgentLog[])
    } catch (err) {
      console.error('Erro ao carregar agent:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleStatus = async () => {
    if (!agent) return
    const newStatus = agent.status === 'active' ? 'inactive' : 'active'
    try {
      await updateAgent(agent.id, { status: newStatus })
      setAgent({ ...agent, status: newStatus })
    } catch (err) {
      console.error('Erro ao atualizar status:', err)
    }
  }

  const handleUnassign = async (equipamentoId: number) => {
    if (!agent) return
    try {
      await unassignEquipmentFromAgent(agent.id, equipamentoId)
      setAgent({
        ...agent,
        equipamentos: agent.equipamentos?.filter(e => e.id !== equipamentoId) || [],
      })
    } catch (err) {
      console.error('Erro ao desatribuir equipamento:', err)
    }
  }

  const isOnline = (agent: Agent) => {
    if (!agent.last_heartbeat) return false
    const lastSeen = new Date(agent.last_heartbeat).getTime()
    return (Date.now() - lastSeen) < 5 * 60 * 1000
  }

  const getLevelBadge = (level: string) => {
    const styles: Record<string, string> = {
      info: 'bg-blue-500/10 text-blue-400',
      warning: 'bg-yellow-500/10 text-yellow-400',
      error: 'bg-red-500/10 text-red-400',
    }
    return (
      <span className={`px-2 py-0.5 text-xs font-medium rounded ${styles[level] || styles.info}`}>
        {level}
      </span>
    )
  }

  if (loading) return <Loading />
  if (!agent) return <div className="text-center text-gray-400 py-12">Agent não encontrado</div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/agents')}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-onyx-800/50 transition-colors"
          >
            ←
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-100">{agent.name}</h1>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                isOnline(agent)
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}>
                {isOnline(agent) ? '● Online' : '● Offline'}
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-1">{agent.company_id} • {agent.location || 'Sem localização'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleToggleStatus}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              agent.status === 'active'
                ? 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'
                : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
            }`}
          >
            {agent.status === 'active' ? 'Desativar' : 'Ativar'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-onyx-800/50 border border-onyx-700/50 rounded-xl p-4">
          <p className="text-sm text-gray-400">Impressoras</p>
          <p className="text-2xl font-bold text-gray-100 mt-1">{agent.printers_count || 0}</p>
        </div>
        <div className="bg-onyx-800/50 border border-onyx-700/50 rounded-xl p-4">
          <p className="text-sm text-gray-400">Erros (24h)</p>
          <p className="text-2xl font-bold text-gray-100 mt-1">{agent.errors_24h || 0}</p>
        </div>
        <div className="bg-onyx-800/50 border border-onyx-700/50 rounded-xl p-4">
          <p className="text-sm text-gray-400">Versão</p>
          <p className="text-2xl font-bold text-gray-100 mt-1">{agent.version || '-'}</p>
        </div>
        <div className="bg-onyx-800/50 border border-onyx-700/50 rounded-xl p-4">
          <p className="text-sm text-gray-400">Último Heartbeat</p>
          <p className="text-sm font-medium text-gray-100 mt-1">
            {agent.last_heartbeat ? new Date(agent.last_heartbeat).toLocaleString('pt-BR') : 'Nunca'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-onyx-700/50">
        <nav className="flex gap-6">
          {[
            { key: 'info', label: 'Informações' },
            { key: 'printers', label: 'Impressoras' },
            { key: 'logs', label: 'Logs' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'text-accent-blue border-accent-blue'
                  : 'text-gray-400 border-transparent hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'info' && (
        <div className="bg-onyx-800/50 border border-onyx-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-gray-100 mb-4">Informações do Agent</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-400">Nome</p>
              <p className="text-gray-100">{agent.name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Company ID</p>
              <p className="text-gray-100 font-mono">{agent.company_id}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">API Key</p>
              <p className="text-gray-100 font-mono text-xs break-all">{agent.api_key}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">IP</p>
              <p className="text-gray-100">{agent.ip_address || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Criado em</p>
              <p className="text-gray-100">{new Date(agent.created_at).toLocaleString('pt-BR')}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Atualizado em</p>
              <p className="text-gray-100">{new Date(agent.updated_at).toLocaleString('pt-BR')}</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'printers' && (
        <div className="bg-onyx-800/50 border border-onyx-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-gray-100 mb-4">
            Impressoras Atribuídas ({agent.equipamentos?.length || 0})
          </h3>
          {!agent.equipamentos || agent.equipamentos.length === 0 ? (
            <p className="text-gray-400 text-center py-8">Nenhuma impressora atribuída a este agent</p>
          ) : (
            <div className="space-y-3">
              {agent.equipamentos.map((equip) => (
                <div key={equip.id} className="flex items-center justify-between p-3 bg-onyx-700/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">🖨️</span>
                    <div>
                      <p className="text-gray-100 font-medium">{equip.modelo || 'Sem modelo'}</p>
                      <p className="text-xs text-gray-400">{equip.ip} • {equip.numero_serie || 'Sem série'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 text-xs rounded ${
                      equip.status_monitoramento === 'ativo'
                        ? 'bg-green-500/10 text-green-400'
                        : 'bg-gray-500/10 text-gray-400'
                    }`}>
                      {equip.status_monitoramento}
                    </span>
                    <button
                      onClick={() => handleUnassign(equip.id)}
                      className="px-2 py-1 text-xs text-accent-red hover:bg-accent-red/10 rounded transition-colors"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="bg-onyx-800/50 border border-onyx-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-gray-100 mb-4">
            Logs Recentes ({logs.length})
          </h3>
          {logs.length === 0 ? (
            <p className="text-gray-400 text-center py-8">Nenhum log registrado</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 p-3 bg-onyx-700/30 rounded-lg">
                  {getLevelBadge(log.level)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-100">{log.message}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(log.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* API Key Installation Command */}
      <div className="bg-onyx-800/50 border border-onyx-700/50 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-100 mb-4">Instalação</h3>
        <p className="text-sm text-gray-400 mb-3">Use este comando para instalar e configurar o agent:</p>
        <div className="bg-onyx-900 rounded-lg p-4 font-mono text-sm text-gray-300 overflow-x-auto">
          <p>onyx-agent install</p>
          <p>onyx-agent config --server https://onyx-monitor-api.onrender.com --key {agent.api_key}</p>
          <p>onyx-agent start</p>
        </div>
      </div>
    </div>
  )
}
