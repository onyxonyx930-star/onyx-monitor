import { useState, useEffect, useCallback } from 'react'
import { getAuditoria, deleteAuditoria, exportAuditoriaCsv, getEquipamentos } from '../../services/api'
import type { AuditoriaImpressao, FiltrosAuditoria } from '../../types/auditoria'
import type { Equipamento } from '../../types'

export default function ListaAuditoria({ onNovo }: { onNovo: () => void }) {
  const [records, setRecords] = useState<AuditoriaImpressao[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([])
  const [filtros, setFiltros] = useState<FiltrosAuditoria>({ per_page: 20 })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getAuditoria({ ...filtros, page })
      setRecords(result.data || [])
      setTotal(result.total || 0)
    } catch { setRecords([]) }
    setLoading(false)
  }, [filtros, page])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    getEquipamentos({ per_page: 200 }).then(r => setEquipamentos(r.data || [])).catch(() => {})
  }, [])

  const handleDelete = async (id: number) => {
    if (!confirm('Excluir este registro?')) return
    await deleteAuditoria(id)
    fetchData()
  }

  const handleExport = async () => {
    const blob = await exportAuditoriaCsv(filtros as Record<string, string>)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'auditoria_impressoes.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalPages = Math.ceil(total / (filtros.per_page || 20))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Auditoria de Impressão</h1>
          <p className="text-gray-400 text-sm mt-1">{total} registros encontrados</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition">
            📊 Exportar CSV
          </button>
          <button onClick={onNovo} className="px-4 py-2 bg-accent-blue hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition">
            + Novo Registro
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-onyx-900 border border-onyx-700/50 rounded-xl p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <input
            type="text"
            placeholder="Cliente..."
            className="bg-onyx-800 border border-onyx-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
            value={filtros.cliente || ''}
            onChange={e => setFiltros({ ...filtros, cliente: e.target.value || undefined })}
          />
          <select
            className="bg-onyx-800 border border-onyx-600 rounded-lg px-3 py-2 text-sm text-white"
            value={filtros.equipamento_id || ''}
            onChange={e => setFiltros({ ...filtros, equipamento_id: e.target.value ? Number(e.target.value) : undefined })}
          >
            <option value="">Todos equipamentos</option>
            {equipamentos.map(e => <option key={e.id} value={e.id}>{e.modelo || e.ip} - {e.cliente}</option>)}
          </select>
          <input
            type="text"
            placeholder="Usuário..."
            className="bg-onyx-800 border border-onyx-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
            value={filtros.usuario || ''}
            onChange={e => setFiltros({ ...filtros, usuario: e.target.value || undefined })}
          />
          <input
            type="date"
            className="bg-onyx-800 border border-onyx-600 rounded-lg px-3 py-2 text-sm text-white"
            value={filtros.data_inicio || ''}
            onChange={e => setFiltros({ ...filtros, data_inicio: e.target.value || undefined })}
          />
          <input
            type="date"
            className="bg-onyx-800 border border-onyx-600 rounded-lg px-3 py-2 text-sm text-white"
            value={filtros.data_fim || ''}
            onChange={e => setFiltros({ ...filtros, data_fim: e.target.value || undefined })}
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          <input
            type="text"
            placeholder="Documento..."
            className="bg-onyx-800 border border-onyx-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
            value={filtros.documento || ''}
            onChange={e => setFiltros({ ...filtros, documento: e.target.value || undefined })}
          />
          <select
            className="bg-onyx-800 border border-onyx-600 rounded-lg px-3 py-2 text-sm text-white"
            value={filtros.fonte || ''}
            onChange={e => setFiltros({ ...filtros, fonte: e.target.value || undefined })}
          >
            <option value="">Todas fontes</option>
            <option value="snmp">SNMP</option>
            <option value="spooler">Spooler</option>
            <option value="api">API Fabricante</option>
            <option value="agent">Agent</option>
            <option value="manual">Manual</option>
          </select>
          <button onClick={() => { setPage(1); fetchData() }} className="bg-onyx-700 hover:bg-onyx-600 text-white rounded-lg px-4 py-2 text-sm font-medium transition">
            🔍 Filtrar
          </button>
          <button onClick={() => { setFiltros({ per_page: 20 }); setPage(1) }} className="bg-onyx-800 hover:bg-onyx-700 text-gray-300 rounded-lg px-4 py-2 text-sm font-medium transition">
            Limpar
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-onyx-900 border border-onyx-700/50 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-onyx-700/50 text-left">
                <th className="px-4 py-3 text-gray-400 font-medium">Data/Hora</th>
                <th className="px-4 py-3 text-gray-400 font-medium">Usuário</th>
                <th className="px-4 py-3 text-gray-400 font-medium">Documento</th>
                <th className="px-4 py-3 text-gray-400 font-medium">Equipamento</th>
                <th className="px-4 py-3 text-gray-400 font-medium">Cliente</th>
                <th className="px-4 py-3 text-gray-400 font-medium">Páginas</th>
                <th className="px-4 py-3 text-gray-400 font-medium">Tipo</th>
                <th className="px-4 py-3 text-gray-400 font-medium">Status</th>
                <th className="px-4 py-3 text-gray-400 font-medium">Fonte</th>
                <th className="px-4 py-3 text-gray-400 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="text-center py-8 text-gray-500">Carregando...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-gray-500">Nenhum registro encontrado</td></tr>
              ) : records.map(r => (
                <tr key={r.id} className="border-b border-onyx-800/50 hover:bg-onyx-800/30">
                  <td className="px-4 py-3 text-gray-300">
                    <div>{r.data_impressao}</div>
                    <div className="text-xs text-gray-500">{r.hora_impressao}</div>
                  </td>
                  <td className="px-4 py-3 text-white font-medium">{r.usuario || '-'}</td>
                  <td className="px-4 py-3 text-gray-300 max-w-[200px] truncate">{r.documento || '-'}</td>
                  <td className="px-4 py-3 text-gray-300">
                    <div>{r.modelo_equip || 'N/I'}</div>
                    <div className="text-xs text-gray-500">{r.ip_equipamento}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{r.cliente || '-'}</td>
                  <td className="px-4 py-3 text-white font-medium text-center">{r.total_paginas}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.colorida ? 'bg-purple-900/50 text-purple-300 border border-purple-700' : 'bg-gray-800 text-gray-300 border border-gray-700'}`}>
                      {r.colorida ? 'Color' : 'P&B'}
                    </span>
                    {r.duplex ? <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-blue-900/50 text-blue-300 border border-blue-700">Duplex</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      r.status_impressao === 'concluida' ? 'bg-green-900/50 text-green-300 border border-green-700' :
                      r.status_impressao === 'cancelada' ? 'bg-yellow-900/50 text-yellow-300 border border-yellow-700' :
                      'bg-red-900/50 text-red-300 border border-red-700'
                    }`}>
                      {r.status_impressao}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-onyx-700 text-gray-300">{r.fonte}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(r.id)} className="text-gray-500 hover:text-red-400 transition text-xs">
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-onyx-700/50">
            <span className="text-sm text-gray-500">Página {page} de {totalPages}</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 rounded bg-onyx-800 text-gray-300 hover:bg-onyx-700 disabled:opacity-40 text-sm">
                Anterior
              </button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 rounded bg-onyx-800 text-gray-300 hover:bg-onyx-700 disabled:opacity-40 text-sm">
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
