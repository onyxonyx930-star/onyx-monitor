import { useState, useEffect, useMemo } from 'react'
import type { Suprimento, Equipamento } from '../../types'
import * as api from '../../services/api'
import { formatDate } from '../../utils/helpers'
import CircularProgress from '../shared/CircularProgress'
import Loading from '../shared/Loading'
import Badge from '../shared/Badge'
import EmptyState from '../shared/EmptyState'

type SortKey = 'percentual' | 'equipamento' | 'tipo'
type ViewMode = 'flat' | 'grouped'

const SUPPLY_LABELS: Record<string, string> = {
  preto: 'Preto',
  ciano: 'Ciano',
  magenta: 'Magenta',
  amarelo: 'Amarelo',
  waste: 'Waste',
  drum: 'Drum',
  fusor: 'Fusor',
}

const SUPPLY_COLORS: Record<string, string> = {
  preto: 'bg-gray-800',
  ciano: 'bg-toner-cyan',
  magenta: 'bg-toner-magenta',
  amarelo: 'bg-toner-yellow',
  waste: 'bg-orange-500',
  drum: 'bg-purple-500',
  fusor: 'bg-blue-500',
}

interface SupplyCardProps {
  suprimento: Suprimento
  equipamento?: Equipamento
}

function SupplyCard({ suprimento, equipamento }: SupplyCardProps) {
  return (
    <div className="bg-onyx-800/60 border border-onyx-700/40 rounded-xl p-4 hover:border-onyx-600/60 transition-all duration-200 hover:shadow-card-hover">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-3 h-3 rounded-full ${SUPPLY_COLORS[suprimento.tipo] || 'bg-gray-500'}`} />
            <span className="text-sm font-semibold text-gray-200 truncate">
              {equipamento?.modelo || `Equipamento #${suprimento.equipamento_id}`}
            </span>
          </div>
          {equipamento && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-gray-400 font-mono">{equipamento.ip}</span>
              <span className="text-xs text-gray-500">·</span>
              <span className="text-xs text-gray-400">{equipamento.cliente}</span>
            </div>
          )}
        </div>
        <Badge variant={suprimento.percentual <= 20 ? 'danger' : suprimento.percentual <= 50 ? 'warning' : 'success'}>
          {SUPPLY_LABELS[suprimento.tipo] || suprimento.tipo}
        </Badge>
      </div>

      <div className="flex items-center gap-4 mt-4">
        <CircularProgress value={suprimento.percentual} size={56} strokeWidth={5} />
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Última leitura</span>
            <span className="text-gray-300">{formatDate(suprimento.ultima_leitura)}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Previsão troca</span>
            <span className={suprimento.percentual <= 20 ? 'text-accent-red font-medium' : 'text-gray-300'}>
              {formatDate(suprimento.previsao_troca)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Suprimentos() {
  const [suprimentos, setSuprimentos] = useState<Suprimento[]>([])
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filterCliente, setFilterCliente] = useState('')
  const [filterTipo, setFilterTipo] = useState('')
  const [filterLowStock, setFilterLowStock] = useState(false)
  const [sortBy, setSortBy] = useState<SortKey>('percentual')
  const [viewMode, setViewMode] = useState<ViewMode>('flat')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [supData, eqData] = await Promise.all([
        api.getSuprimentos(),
        api.getEquipamentos({ page: 1, per_page: 1000 } as never),
      ])
      setSuprimentos(supData)
      setEquipamentos(eqData.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar suprimentos')
    } finally {
      setLoading(false)
    }
  }

  const equipamentoMap = useMemo(() => {
    const map = new Map<number, Equipamento>()
    equipamentos.forEach((eq) => map.set(eq.id, eq))
    return map
  }, [equipamentos])

  const clientes = useMemo(() => {
    const set = new Set(equipamentos.map((eq) => eq.cliente))
    return Array.from(set).sort()
  }, [equipamentos])

  const filtered = useMemo(() => {
    let result = suprimentos

    if (filterCliente) {
      const ids = new Set(
        equipamentos.filter((eq) => eq.cliente === filterCliente).map((eq) => eq.id)
      )
      result = result.filter((s) => ids.has(s.equipamento_id))
    }

    if (filterTipo) {
      result = result.filter((s) => s.tipo === filterTipo)
    }

    if (filterLowStock) {
      result = result.filter((s) => s.percentual <= 20)
    }

    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'percentual':
          return a.percentual - b.percentual
        case 'equipamento': {
          const eqA = equipamentoMap.get(a.equipamento_id)?.modelo || ''
          const eqB = equipamentoMap.get(b.equipamento_id)?.modelo || ''
          return eqA.localeCompare(eqB)
        }
        case 'tipo':
          return a.tipo.localeCompare(b.tipo)
        default:
          return 0
      }
    })

    return result
  }, [suprimentos, equipamentos, filterCliente, filterTipo, filterLowStock, sortBy, equipamentoMap])

  const critical = useMemo(() => filtered.filter((s) => s.percentual <= 20), [filtered])
  const okCount = useMemo(() => filtered.filter((s) => s.percentual > 50).length, [filtered])
  const warningCount = useMemo(() => filtered.filter((s) => s.percentual > 20 && s.percentual <= 50).length, [filtered])

  const grouped = useMemo(() => {
    if (viewMode !== 'grouped') return null
    const groups = new Map<number, Suprimento[]>()
    filtered.forEach((s) => {
      const existing = groups.get(s.equipamento_id) || []
      existing.push(s)
      groups.set(s.equipamento_id, existing)
    })
    return Array.from(groups.entries()).sort((a, b) => {
      const eqA = equipamentoMap.get(a[0])?.modelo || ''
      const eqB = equipamentoMap.get(b[0])?.modelo || ''
      return eqA.localeCompare(eqB)
    })
  }, [filtered, viewMode, equipamentoMap])

  if (loading) return <Loading />

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <span className="text-4xl mb-4">⚠️</span>
        <p className="text-accent-red mb-4">{error}</p>
        <button onClick={loadData} className="px-4 py-2 bg-accent-blue text-white rounded-lg hover:bg-accent-blue/80 transition-colors">
          Tentar novamente
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-onyx-800/60 border border-onyx-700/40 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Total de Suprimentos</p>
          <p className="text-2xl font-bold text-gray-100">{filtered.length}</p>
        </div>
        <div className="bg-onyx-800/60 border border-accent-red/20 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Críticos (&lt;20%)</p>
          <p className="text-2xl font-bold text-accent-red">{critical.length}</p>
        </div>
        <div className="bg-onyx-800/60 border border-accent-green/20 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">OK (&gt;50%)</p>
          <p className="text-2xl font-bold text-accent-green">{okCount}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filterCliente}
          onChange={(e) => setFilterCliente(e.target.value)}
          className="bg-onyx-800 border border-onyx-700/50 text-gray-200 text-sm rounded-lg px-3 py-2 focus:ring-accent-blue focus:border-accent-blue"
        >
          <option value="">Todos os clientes</option>
          {clientes.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          value={filterTipo}
          onChange={(e) => setFilterTipo(e.target.value)}
          className="bg-onyx-800 border border-onyx-700/50 text-gray-200 text-sm rounded-lg px-3 py-2 focus:ring-accent-blue focus:border-accent-blue"
        >
          <option value="">Todos os tipos</option>
          <option value="preto">Preto</option>
          <option value="ciano">Ciano</option>
          <option value="magenta">Magenta</option>
          <option value="amarelo">Amarelo</option>
          <option value="waste">Waste</option>
          <option value="drum">Drum</option>
          <option value="fusor">Fusor</option>
        </select>

        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filterLowStock}
            onChange={(e) => setFilterLowStock(e.target.checked)}
            className="w-4 h-4 rounded border-onyx-600 bg-onyx-800 text-accent-red focus:ring-accent-red/50"
          />
          Apenas críticos
        </label>

        <div className="ml-auto flex items-center gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="bg-onyx-800 border border-onyx-700/50 text-gray-200 text-sm rounded-lg px-3 py-2 focus:ring-accent-blue focus:border-accent-blue"
          >
            <option value="percentual">Menor percentual</option>
            <option value="equipamento">Equipamento</option>
            <option value="tipo">Tipo</option>
          </select>

          <div className="flex bg-onyx-800 border border-onyx-700/50 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('flat')}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                viewMode === 'flat' ? 'bg-accent-blue text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Lista
            </button>
            <button
              onClick={() => setViewMode('grouped')}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                viewMode === 'grouped' ? 'bg-accent-blue text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Por Equipamento
            </button>
          </div>
        </div>
      </div>

      {critical.length > 0 && !filterLowStock && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🚨</span>
            <h3 className="text-sm font-semibold text-accent-red uppercase tracking-wide">Suprimentos Críticos</h3>
            <Badge variant="danger">{critical.length}</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {critical.map((s) => (
              <SupplyCard key={s.id} suprimento={s} equipamento={equipamentoMap.get(s.equipamento_id)} />
            ))}
          </div>
        </div>
      )}

      <div>
        {viewMode === 'grouped' && grouped ? (
          <div className="space-y-6">
            {grouped.map(([eqId, items]) => {
              const eq = equipamentoMap.get(eqId)
              return (
                <div key={eqId} className="bg-onyx-800/30 border border-onyx-700/30 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-lg">🖨️</span>
                    <div>
                      <p className="text-sm font-semibold text-gray-200">{eq?.modelo || `Equipamento #${eqId}`}</p>
                      <p className="text-xs text-gray-400">{eq?.ip} · {eq?.cliente}</p>
                    </div>
                    <Badge variant={items.some((s) => s.percentual <= 20) ? 'danger' : 'default'}>
                      {items.length} suprimentos
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {items.map((s) => (
                      <SupplyCard key={s.id} suprimento={s} equipamento={eq} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <>
            {filtered.length === 0 ? (
              <EmptyState icon="📦" title="Nenhum suprimento encontrado" description="Ajuste os filtros ou aguarde novas leituras." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map((s) => (
                  <SupplyCard key={s.id} suprimento={s} equipamento={equipamentoMap.get(s.equipamento_id)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
