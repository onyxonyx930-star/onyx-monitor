import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createAgent } from '../../services/api'

export default function FormAgent() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '',
    company_id: '',
    location: '',
    ip_address: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.company_id) {
      setError('Nome e Company ID são obrigatórios')
      return
    }

    try {
      setLoading(true)
      setError('')
      await createAgent(form)
      navigate('/agents')
    } catch (err: any) {
      setError(err?.data?.message || err?.message || 'Erro ao criar agent')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/agents')}
          className="p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-onyx-800/50 transition-colors"
        >
          ←
        </button>
        <h1 className="text-2xl font-bold text-gray-100">Novo Agent</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-4 bg-accent-red/10 border border-accent-red/20 rounded-lg text-accent-red text-sm">
            {error}
          </div>
        )}

        <div className="bg-onyx-800/50 border border-onyx-700/50 rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-semibold text-gray-100">Informações do Agent</h3>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Nome *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-2 bg-onyx-900 border border-onyx-700 rounded-lg text-gray-100 focus:outline-none focus:border-accent-blue"
              placeholder="Ex: Agent Filial SP"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Company ID *</label>
            <input
              type="text"
              value={form.company_id}
              onChange={(e) => setForm({ ...form, company_id: e.target.value })}
              className="w-full px-4 py-2 bg-onyx-900 border border-onyx-700 rounded-lg text-gray-100 focus:outline-none focus:border-accent-blue"
              placeholder="Ex: empresa-x"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Localização</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="w-full px-4 py-2 bg-onyx-900 border border-onyx-700 rounded-lg text-gray-100 focus:outline-none focus:border-accent-blue"
              placeholder="Ex: São Paulo - Filial"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">IP do Agent</label>
            <input
              type="text"
              value={form.ip_address}
              onChange={(e) => setForm({ ...form, ip_address: e.target.value })}
              className="w-full px-4 py-2 bg-onyx-900 border border-onyx-700 rounded-lg text-gray-100 focus:outline-none focus:border-accent-blue"
              placeholder="Ex: 192.168.1.100"
            />
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={() => navigate('/agents')}
            className="px-4 py-2 text-gray-400 hover:text-gray-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-accent-blue text-white rounded-lg hover:bg-accent-blue/80 transition-colors font-medium disabled:opacity-50"
          >
            {loading ? 'Criando...' : 'Criar Agent'}
          </button>
        </div>
      </form>
    </div>
  )
}
