import { useState, useEffect } from 'react'
import type { Usuario } from '../types'
import * as api from '../services/api'

export default function Configuracoes() {
  const [activeTab, setActiveTab] = useState<'geral' | 'snmp' | 'coleta' | 'usuarios'>('geral')
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)

  useEffect(() => {
    if (activeTab === 'usuarios') {
      loadUsuarios()
    }
  }, [activeTab])

  const loadUsuarios = async () => {
    setLoadingUsers(true)
    try {
      const data = await api.listUsuarios()
      setUsuarios(data)
    } catch {
      setUsuarios([])
    } finally {
      setLoadingUsers(false)
    }
  }

  const tabs = [
    { id: 'geral' as const, label: 'Geral', icon: '⚙️' },
    { id: 'snmp' as const, label: 'SNMP', icon: '🌐' },
    { id: 'coleta' as const, label: 'Coleta Automática', icon: '🔄' },
    { id: 'usuarios' as const, label: 'Usuários', icon: '👥' },
  ]

  function getRoleBadge(role: string) {
    switch (role) {
      case 'admin': return <span className="badge badge-blue">Admin</span>
      case 'operador': return <span className="badge badge-green">Operador</span>
      case 'cliente': return <span className="badge badge-yellow">Cliente</span>
      default: return <span className="badge">{role}</span>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === tab.id
                ? 'bg-accent-blue/10 text-accent-blue border border-accent-blue/20'
                : 'text-gray-400 hover:text-gray-200 hover:bg-onyx-800/50 border border-transparent'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'geral' && (
        <div className="card space-y-4">
          <h3 className="text-lg font-semibold text-white">Configurações Gerais</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Nome do Sistema</label>
              <input type="text" defaultValue="Onyx Monitor" className="input-field w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Porta do Servidor</label>
              <input type="number" defaultValue={3001} className="input-field w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Timezone</label>
              <select defaultValue="America/Sao_Paulo" className="select-field w-full">
                <option value="America/Sao_Paulo">América/São Paulo (GMT-3)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Idioma</label>
              <select defaultValue="pt-BR" className="select-field w-full">
                <option value="pt-BR">Português (Brasil)</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
          <button className="btn-primary">Salvar Alterações</button>
        </div>
      )}

      {activeTab === 'snmp' && (
        <div className="card space-y-4">
          <h3 className="text-lg font-semibold text-white">Configurações SNMP</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Comunidade Padrão</label>
              <input type="text" defaultValue="public" className="input-field w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Porta SNMP</label>
              <input type="number" defaultValue={161} className="input-field w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Timeout (ms)</label>
              <input type="number" defaultValue={5000} className="input-field w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Retries</label>
              <input type="number" defaultValue={2} className="input-field w-full" />
            </div>
          </div>
          <button className="btn-primary">Salvar Configurações SNMP</button>
        </div>
      )}

      {activeTab === 'coleta' && (
        <div className="card space-y-4">
          <h3 className="text-lg font-semibold text-white">Coleta Automática</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-onyx-900/50 border border-onyx-700/50">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🔄</span>
                <span className="font-medium text-white">A cada 1 hora</span>
              </div>
              <p className="text-sm text-gray-400">Coleta todos os equipamentos a cada hora</p>
              <div className="mt-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-accent-green"></div>
                <span className="text-xs text-accent-green">Ativo</span>
              </div>
            </div>
            <div className="p-4 rounded-lg bg-onyx-900/50 border border-onyx-700/50">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🔄</span>
                <span className="font-medium text-white">A cada 6 horas</span>
              </div>
              <p className="text-sm text-gray-400">Coleta a cada 6 horas (4x ao dia)</p>
              <div className="mt-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-accent-green"></div>
                <span className="text-xs text-accent-green">Ativo</span>
              </div>
            </div>
            <div className="p-4 rounded-lg bg-onyx-900/50 border border-onyx-700/50">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">📅</span>
                <span className="font-medium text-white">Diário</span>
              </div>
              <p className="text-sm text-gray-400">Coleta diária às 8:00</p>
              <div className="mt-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-accent-green"></div>
                <span className="text-xs text-accent-green">Ativo</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'usuarios' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Usuários</h3>
            <button className="btn-primary">+ Novo Usuário</button>
          </div>
          {loadingUsers ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-onyx-700/50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : usuarios.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">Nenhum usuário encontrado</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-onyx-700/50">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Nome</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Email</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Perfil</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((u) => (
                    <tr key={u.id} className="table-row">
                      <td className="py-3 px-4 text-sm text-gray-200">{u.nome}</td>
                      <td className="py-3 px-4 text-sm text-gray-400">{u.email}</td>
                      <td className="py-3 px-4">{getRoleBadge(u.role)}</td>
                      <td className="py-3 px-4">
                        {u.ativo ? (
                          <span className="badge badge-green">Ativo</span>
                        ) : (
                          <span className="badge badge-red">Inativo</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <button className="text-sm text-accent-blue hover:text-blue-400">Editar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
