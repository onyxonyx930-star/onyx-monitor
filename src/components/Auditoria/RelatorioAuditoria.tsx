import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts'
import { getAuditoriaStats, exportAuditoriaCsv } from '../../services/api'
import type { AuditoriaStats } from '../../types/auditoria'

const COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1']

export default function RelatorioAuditoria() {
  const [stats, setStats] = useState<AuditoriaStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  const fetchData = async () => {
    setLoading(true)
    try {
      const data = await getAuditoriaStats(dataInicio || undefined, dataFim || undefined)
      setStats(data)
    } catch { setStats(null) }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const handleExport = async () => {
    const blob = await exportAuditoriaCsv({ data_inicio: dataInicio, data_fim: dataFim })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'auditoria_relatorio.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className="text-center py-12 text-gray-500">Carregando relatórios...</div>
  if (!stats) return <div className="text-center py-12 text-gray-500">Erro ao carregar dados</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Relatórios de Auditoria</h1>
          <p className="text-gray-400 text-sm mt-1">Análise de impressões por usuário, equipamento e cliente</p>
        </div>
        <button onClick={handleExport} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition">
          📊 Exportar CSV
        </button>
      </div>

      {/* Date Filter */}
      <div className="bg-onyx-900 border border-onyx-700/50 rounded-xl p-4 flex items-center gap-4">
        <label className="text-sm text-gray-400">Período:</label>
        <input type="date" className="bg-onyx-800 border border-onyx-600 rounded-lg px-3 py-2 text-sm text-white" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
        <span className="text-gray-500">até</span>
        <input type="date" className="bg-onyx-800 border border-onyx-600 rounded-lg px-3 py-2 text-sm text-white" value={dataFim} onChange={e => setDataFim(e.target.value)} />
        <button onClick={fetchData} className="px-4 py-2 bg-accent-blue hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition">
          Filtrar
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-onyx-900 border border-onyx-700/50 rounded-xl p-5">
          <div className="text-gray-400 text-sm">Total de Impressões</div>
          <div className="text-3xl font-bold text-white mt-1">{stats.total_registros.toLocaleString()}</div>
        </div>
        <div className="bg-onyx-900 border border-onyx-700/50 rounded-xl p-5">
          <div className="text-gray-400 text-sm">Total de Páginas</div>
          <div className="text-3xl font-bold text-white mt-1">{stats.total_paginas.toLocaleString()}</div>
        </div>
        <div className="bg-onyx-900 border border-onyx-700/50 rounded-xl p-5">
          <div className="text-gray-400 text-sm">Coloridas</div>
          <div className="text-3xl font-bold text-purple-400 mt-1">
            {stats.por_cor.find(c => c.tipo === 'Colorida')?.total?.toLocaleString() || '0'}
          </div>
        </div>
        <div className="bg-onyx-900 border border-onyx-700/50 rounded-xl p-5">
          <div className="text-gray-400 text-sm">P&B</div>
          <div className="text-3xl font-bold text-gray-300 mt-1">
            {stats.por_cor.find(c => c.tipo === 'P&B')?.total?.toLocaleString() || '0'}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By User */}
        <div className="bg-onyx-900 border border-onyx-700/50 rounded-xl p-5">
          <h3 className="text-lg font-semibold text-white mb-4">Impressões por Usuário</h3>
          {stats.por_usuario.length === 0 ? (
            <div className="text-center py-8 text-gray-500">Sem dados</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.por_usuario}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="usuario" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} labelStyle={{ color: '#fff' }} />
                <Bar dataKey="total_paginas" fill="#3b82f6" name="Páginas" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* By Equipment */}
        <div className="bg-onyx-900 border border-onyx-700/50 rounded-xl p-5">
          <h3 className="text-lg font-semibold text-white mb-4">Impressões por Equipamento</h3>
          {stats.por_equipamento.length === 0 ? (
            <div className="text-center py-8 text-gray-500">Sem dados</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.por_equipamento.map(e => ({ name: e.modelo || e.ip || 'N/I', paginas: e.total_paginas }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
                <Bar dataKey="paginas" fill="#8b5cf6" name="Páginas" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* By Client */}
        <div className="bg-onyx-900 border border-onyx-700/50 rounded-xl p-5">
          <h3 className="text-lg font-semibold text-white mb-4">Impressões por Cliente</h3>
          {stats.por_cliente.length === 0 ? (
            <div className="text-center py-8 text-gray-500">Sem dados</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={stats.por_cliente.map(c => ({ name: c.cliente, value: c.total_paginas }))} cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                  {stats.por_cliente.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Monthly Trend */}
        <div className="bg-onyx-900 border border-onyx-700/50 rounded-xl p-5">
          <h3 className="text-lg font-semibold text-white mb-4">Consumo Mensal</h3>
          {stats.por_mes.length === 0 ? (
            <div className="text-center py-8 text-gray-500">Sem dados</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={[...stats.por_mes].reverse()}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="mes" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
                <Line type="monotone" dataKey="total_paginas" stroke="#06b6d4" name="Páginas" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* By Source & Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-onyx-900 border border-onyx-700/50 rounded-xl p-5">
          <h3 className="text-lg font-semibold text-white mb-4">Fontes de Dados</h3>
          <div className="space-y-3">
            {stats.por_fonte.map(f => (
              <div key={f.fonte} className="flex items-center justify-between">
                <span className="text-gray-300 capitalize">{f.fonte}</span>
                <div className="flex items-center gap-3">
                  <div className="w-32 bg-onyx-800 rounded-full h-2">
                    <div className="bg-accent-blue h-2 rounded-full" style={{ width: `${(f.total / stats.total_registros) * 100}%` }} />
                  </div>
                  <span className="text-gray-400 text-sm w-12 text-right">{f.total}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-onyx-900 border border-onyx-700/50 rounded-xl p-5">
          <h3 className="text-lg font-semibold text-white mb-4">Status das Impressões</h3>
          <div className="space-y-3">
            {stats.por_status.map(s => (
              <div key={s.status_impressao} className="flex items-center justify-between">
                <span className="text-gray-300 capitalize">{s.status_impressao}</span>
                <div className="flex items-center gap-3">
                  <div className="w-32 bg-onyx-800 rounded-full h-2">
                    <div className={`h-2 rounded-full ${s.status_impressao === 'concluida' ? 'bg-green-500' : s.status_impressao === 'cancelada' ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${(s.total / stats.total_registros) * 100}%` }} />
                  </div>
                  <span className="text-gray-400 text-sm w-12 text-right">{s.total}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
