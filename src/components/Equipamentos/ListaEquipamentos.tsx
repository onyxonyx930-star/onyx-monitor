import { useEffect, useState, useCallback } from 'react'
import {
  Search,
  Plus,
  Eye,
  Pencil,
  Trash2,
  Radio,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from 'lucide-react'
import type { Equipamento, FiltrosEquipamento } from '../../types'
import {
  getEquipamentos,
  deleteEquipamento,
  collectEquipamento,
} from '../../services/api'
import { formatDateTime } from '../../utils/helpers'
import { useNavigate } from 'react-router-dom'

interface ListaEquipamentosProps {
  onNovo?: () => void
  onEditar?: (equipamento: Equipamento) => void
}

export default function ListaEquipamentos({ onNovo, onEditar }: ListaEquipamentosProps) {
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [collectingId, setCollectingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const navigate = useNavigate()

  const [filtros, setFiltros] = useState<FiltrosEquipamento>({
    search: '',
    cliente: '',
    status: '',
  })

  const perPage = 10

  const fetchEquipamentos = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await getEquipamentos({
        ...filtros,
      })
      setEquipamentos(res.data)
      setTotal(res.total)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao carregar equipamentos'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [filtros])

  useEffect(() => {
    fetchEquipamentos()
  }, [fetchEquipamentos])

  useEffect(() => {
    setPage(1)
  }, [filtros])

  const handleDelete = async (id: number) => {
    try {
      setDeletingId(id)
      await deleteEquipamento(id)
      setEquipamentos((prev) => prev.filter((eq) => eq.id !== id))
      setTotal((prev) => prev - 1)
      setConfirmDelete(null)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao excluir equipamento'
      setError(message)
    } finally {
      setDeletingId(null)
    }
  }

  const handleCollect = async (id: number) => {
    try {
      setCollectingId(id)
      await collectEquipamento(id)
      await fetchEquipamentos()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao coletar dados'
      setError(message)
    } finally {
      setCollectingId(null)
    }
  }

  const totalPages = Math.ceil(total / perPage)

  function getStatusBadge(status: string) {
    switch (status) {
      case 'ativo':
        return (
          <span className="badge badge-green">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-green mr-1.5 animate-pulse-slow" />
            Online
          </span>
        )
      case 'inativo':
        return (
          <span className="badge badge-red">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-red mr-1.5" />
            Offline
          </span>
        )
      case 'manutencao':
        return (
          <span className="badge badge-yellow">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-yellow mr-1.5" />
            Manutenção
          </span>
        )
      default:
        return <span className="badge bg-gray-500/10 text-gray-400">{status}</span>
    }
  }

  const clientes = [...new Set(equipamentos.map((eq) => eq.cliente))].sort()

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Equipamentos</h1>
          <p className="text-sm text-gray-400 mt-1">
            {total} equipamento{total !== 1 ? 's' : ''} cadastrado{total !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={onNovo} className="btn-primary">
          <Plus className="w-4 h-4" />
          Novo Equipamento
        </button>
      </div>

      <div className="card">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Buscar por modelo, IP, série..."
              value={filtros.search || ''}
              onChange={(e) =>
                setFiltros((prev) => ({ ...prev, search: e.target.value }))
              }
              className="input-field pl-10 w-full"
            />
          </div>
          <select
            value={filtros.cliente || ''}
            onChange={(e) =>
              setFiltros((prev) => ({ ...prev, cliente: e.target.value }))
            }
            className="select-field min-w-[180px]"
          >
            <option value="">Todos os clientes</option>
            {clientes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={filtros.status || ''}
            onChange={(e) =>
              setFiltros((prev) => ({ ...prev, status: e.target.value }))
            }
            className="select-field min-w-[160px]"
          >
            <option value="">Todos os status</option>
            <option value="ativo">Online</option>
            <option value="inativo">Offline</option>
            <option value="manutencao">Manutenção</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="card border-accent-red/30 bg-accent-red/5 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-accent-red flex-shrink-0" />
          <p className="text-accent-red text-sm">{error}</p>
        </div>
      )}

      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="p-6 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 animate-pulse">
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-onyx-700 rounded w-1/4" />
                  <div className="h-3 bg-onyx-700 rounded w-1/6" />
                </div>
                <div className="h-6 w-16 bg-onyx-700 rounded-full" />
                <div className="h-8 w-20 bg-onyx-700 rounded" />
              </div>
            ))}
          </div>
        ) : equipamentos.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-onyx-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Radio className="w-8 h-8 text-gray-500" />
            </div>
            <p className="text-gray-400 font-medium">Nenhum equipamento encontrado</p>
            <p className="text-gray-500 text-sm mt-1">
              Ajuste os filtros ou cadastre um novo equipamento
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-gray-500 uppercase tracking-wider bg-onyx-900/50">
                    <th className="px-6 py-3">Cliente</th>
                    <th className="px-6 py-3">Unidade</th>
                    <th className="px-6 py-3">IP</th>
                    <th className="px-6 py-3">Modelo</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Última Leitura</th>
                    <th className="px-6 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {equipamentos.map((eq) => (
                    <tr
                      key={eq.id}
                      className="table-row cursor-pointer"
                      onClick={() => navigate(`/equipamentos/${eq.id}`)}
                    >
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-gray-200">
                          {eq.cliente}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-300">
                        {eq.unidade}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-mono text-gray-300 bg-onyx-900/50 px-2 py-0.5 rounded">
                          {eq.ip}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-300">
                        {eq.fabricante} {eq.modelo}
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(eq.status_monitoramento)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400">
                        {eq.ultima_leitura
                          ? formatDateTime(eq.ultima_leitura.data_leitura)
                          : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <div
                          className="flex items-center justify-end gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => navigate(`/equipamentos/${eq.id}`)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-accent-blue hover:bg-accent-blue/10 transition-colors"
                            title="Visualizar"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onEditar?.(eq)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-accent-yellow hover:bg-accent-yellow/10 transition-colors"
                            title="Editar"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleCollect(eq.id)}
                            disabled={collectingId === eq.id}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-accent-green hover:bg-accent-green/10 transition-colors disabled:opacity-50"
                            title="Coletar agora"
                          >
                            <Radio
                              className={`w-4 h-4 ${
                                collectingId === eq.id ? 'animate-spin' : ''
                              }`}
                            />
                          </button>
                          {confirmDelete === eq.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDelete(eq.id)}
                                disabled={deletingId === eq.id}
                                className="text-xs px-2 py-1 rounded bg-accent-red text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                              >
                                {deletingId === eq.id ? '...' : 'Sim'}
                              </button>
                              <button
                                onClick={() => setConfirmDelete(null)}
                                className="text-xs px-2 py-1 rounded bg-onyx-600 text-gray-300 hover:bg-onyx-500 transition-colors"
                              >
                                Não
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(eq.id)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-accent-red hover:bg-accent-red/10 transition-colors"
                              title="Excluir"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-onyx-700/50">
                <p className="text-sm text-gray-400">
                  Página {page} de {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 rounded-lg bg-onyx-700 text-gray-300 hover:bg-onyx-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const start = Math.max(1, Math.min(page - 2, totalPages - 4))
                    const pageNum = start + i
                    if (pageNum > totalPages) return null
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                          page === pageNum
                            ? 'bg-accent-blue text-white'
                            : 'bg-onyx-700 text-gray-300 hover:bg-onyx-600'
                        }`}
                      >
                        {pageNum}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-2 rounded-lg bg-onyx-700 text-gray-300 hover:bg-onyx-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
