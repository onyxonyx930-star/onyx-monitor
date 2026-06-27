import { useState, useEffect } from 'react'
import { getAuditoriaConfig, createAuditoriaConfig, deleteAuditoriaConfig, getEquipamentos } from '../../services/api'
import type { AuditoriaConfig } from '../../types/auditoria'
import type { Equipamento } from '../../types'

export default function ConfigAuditoria() {
  const [configs, setConfigs] = useState<AuditoriaConfig[]>([])
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ tipo_integracao: 'snmp', equipamento_id: '' })

  const fetchData = async () => {
    setLoading(true)
    try {
      const [c, e] = await Promise.all([getAuditoriaConfig(), getEquipamentos({ per_page: 500 })])
      setConfigs(c || [])
      setEquipamentos(e.data || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    await createAuditoriaConfig({
      tipo_integracao: form.tipo_integracao as any,
      equipamento_id: form.equipamento_id ? Number(form.equipamento_id) : undefined,
    })
    setShowForm(false)
    setForm({ tipo_integracao: 'snmp', equipamento_id: '' })
    fetchData()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Excluir esta configuração?')) return
    await deleteAuditoriaConfig(id)
    fetchData()
  }

  const integrations = [
    { value: 'snmp', label: 'SNMP', desc: 'Coleta via contadores SNMP da impressora (job log, counters)' },
    { value: 'spooler', label: 'Windows Print Spooler', desc: 'Integração com o spooler de impressão Windows' },
    { value: 'api_fabricante', label: 'API do Fabricante', desc: 'APIs proprietárias (HP, Canon, Ricoh, etc.)' },
    { value: 'accounting', label: 'Sistema de Accounting', desc: 'PaperCut, Equitrac, SafeCom, etc.' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Configurações de Auditoria</h1>
          <p className="text-gray-400 text-sm mt-1">Integrar com fontes de dados para capturar informações de impressão</p>
        </div>
        <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-accent-blue hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition">
          + Nova Integração
        </button>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {integrations.map(int => (
          <div key={int.value} className="bg-onyx-900 border border-onyx-700/50 rounded-xl p-5">
            <h3 className="text-white font-semibold mb-1">{int.label}</h3>
            <p className="text-gray-400 text-sm">{int.desc}</p>
            <div className="mt-3 text-xs text-gray-500">
              {int.value === 'snmp' && 'Requer impressoras com suporte a Job Accounting ou Internal Counter via SNMP'}
              {int.value === 'spooler' && 'Instalar agente Onyx nos servidores de impressão Windows'}
              {int.value === 'api_fabricante' && 'Configurar API key e endpoint do fabricante'}
              {int.value === 'accounting' && 'Integrar via API ou banco de dados do sistema de accounting'}
            </div>
          </div>
        ))}
      </div>

      {/* Active Integrations */}
      <div className="bg-onyx-900 border border-onyx-700/50 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-onyx-700/50">
          <h3 className="text-lg font-semibold text-white">Integrações Ativas</h3>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-500">Carregando...</div>
        ) : configs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Nenhuma integração configurada</div>
        ) : (
          <div className="divide-y divide-onyx-800/50">
            {configs.map(c => (
              <div key={c.id} className="flex items-center justify-between px-5 py-3 hover:bg-onyx-800/30">
                <div>
                  <span className="px-2 py-0.5 rounded-full text-xs bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
                    {c.tipo_integracao}
                  </span>
                  <span className="ml-3 text-gray-300 text-sm">
                    {c.modelo || c.ip || 'Todos equipamentos'}
                  </span>
                </div>
                <button onClick={() => handleDelete(c.id)} className="text-gray-500 hover:text-red-400 text-sm">
                  🗑️
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Integration Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-onyx-900 border border-onyx-700 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-onyx-700/50">
              <h2 className="text-xl font-bold text-white">Nova Integração</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white text-2xl">&times;</button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Tipo de Integração</label>
                <select className="w-full bg-onyx-800 border border-onyx-600 rounded-lg px-3 py-2 text-white text-sm" value={form.tipo_integracao} onChange={e => setForm({ ...form, tipo_integracao: e.target.value })}>
                  {integrations.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Equipamento (opcional - vazio = todos)</label>
                <select className="w-full bg-onyx-800 border border-onyx-600 rounded-lg px-3 py-2 text-white text-sm" value={form.equipamento_id} onChange={e => setForm({ ...form, equipamento_id: e.target.value })}>
                  <option value="">Todos equipamentos</option>
                  {equipamentos.map(e => <option key={e.id} value={e.id}>{e.modelo || e.ip} - {e.cliente}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-onyx-700/50">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-400 hover:text-white transition">Cancelar</button>
                <button type="submit" className="px-6 py-2 bg-accent-blue hover:bg-blue-600 text-white rounded-lg font-medium transition">Criar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
