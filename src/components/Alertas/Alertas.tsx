import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Alerta, FiltrosAlerta } from '../../types'
import * as api from '../../services/api'
import AlertaCard from './AlertaCard'
import Loading from '../shared/Loading'
import Badge from '../shared/Badge'
import EmptyState from '../shared/EmptyState'

const ALERT_TYPES = [
  { value: '', label: 'Todos os tipos' },
  { value: 'toner_baixo', label: 'Toner Baixo' },
  { value: 'toner_zerado', label: 'Toner Zerado' },
  { value: 'offline', label: 'Offline' },
  { value: 'erro_critico', label: 'Erro Crítico' },
  { value: 'contador_nao_atualizado', label: 'Contador Desatualizado' },
  { value: 'snmp_sem_resposta', label: 'SNMP Sem Resposta' },
]

const SEVERITY_OPTIONS = [
  { value: '', label: 'Todas as severidades' },
  { value: 'critical', label: 'Crítico' },
  { value: 'warning', label: 'Aviso' },
  { value: 'info', label: 'Info' },
]

export default function Alertas() {
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filterTipo, setFilterTipo] = useState('')
  const [filterNivel, setFilterNivel] = useState('')
  const [filterResolvido, setFilterResolvido] = useState<boolean | undefined>(undefined)
  const [searchEquipamento, setSearchEquipamento] = useState('')
  const [resolvingIds, setResolvingIds] = useState<Set<number>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkResolving, setBulkResolving] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  useEffect(() => {
    loadAlertas()
    const interval = setInterval(() => {
      loadAlertas(true)
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  const loadAlertas = async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const filtros: FiltrosAlerta = {}
      if (filterTipo) filtros.tipo = filterTipo
      if (filterNivel) filtros.nivel = filterNivel
      if (filterResolvido !== undefined) filtros.resolvido = filterResolvido

      const data = await api.getAlertas(filtros)
      setAlertas(data.data)
      setLastUpdate(new Date())
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : 'Erro ao carregar alertas')
    } finally {
      setLoading(false)
    }
  }

  const handleResolve = useCallback(async (id: number) => {
    setResolvingIds((prev) => new Set(prev).add(id))
    try {
      await api.resolverAlerta(id)
      setAlertas((prev) =>
        prev.map((a) => (a.id === id ? { ...a, resolvido: true, resolvido_em: new Date().toISOString() } : a))
      )
    } catch (err) {
      console.error('Erro ao resolver alerta:', err)
    } finally {
      setResolvingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }, [])

  const handleBulkResolve = useCallback(async () => {
    if (selectedIds.size === 0) return
    setBulkResolving(true)
    try {
      await Promise.all(Array.from(selectedIds).map((id) => api.resolverAlerta(id)))
      setAlertas((prev) =>
        prev.map((a) =>
          selectedIds.has(a.id) ? { ...a, resolvido: true, resolvido_em: new Date().toISOString() } : a
        )
      )
      setSelectedIds(new Set())
    } catch (err) {
      console.error('Erro ao resolver alertas:', err)
    } finally {
      setBulkResolving(false)
    }
  }, [selectedIds])

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    const unresolved = filtered.map((a) => a.id)
    if (selectedIds.size === unresolved.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(unresolved))
    }
  }, [filtered, selectedIds])

  const filtered = useMemo(() => {
    let result = alertas
    if (searchEquipamento) {
      const term = searchEquipamento.toLowerCase()
      result = result.filter(
        (a) =>
          a.equipamento?.modelo?.toLowerCase().includes(term) ||
          a.equipamento?.ip?.includes(term) ||
          a.equipamento?.cliente?.toLowerCase().includes(term) ||
          a.mensagem.toLowerCase().includes(term)
      )
    }
    return result
  }, [alertas, searchEquipamento])

  const stats = useMemo(() => {
    const total = alertas.length
    const criticos = alertas.filter((a) => a.nivel === 'critical' && !a.resolvido).length
    const warnings = alertas.filter((a) => a.nivel === 'warning' && !a.resolvido).length
    const infos = alertas.filter((a) => a.nivel === 'info' && !a.resolvido).length
    const pendentes = alertas.filter((a) => !a.resolvido).length
    return { total, criticos, warnings, infos, pendentes }
  }, [alertas])

  if (loading && alertas.length === 0) return <Loading />

  if (error && alertas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <span className="text-4xl mb-4">⚠️</span>
        <p className="text-accent-red mb-4">{error}</p>
        <button onClick={() => loadAlertas()} className="px-4 py-2 bg-accent-blue text-white rounded-lg hover:bg-accent-blue/80 transition-colors">
          Tentar novamente
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-onyx-800/60 border border-onyx-700/40 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Total</p>
          <p className="text-2xl font-bold text-gray-100">{stats.total}</p>
        </div>
        <div className="bg-onyx-800/60 border border-accent-red/20 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Críticos</p>
          <p className="text-2xl font-bold text-accent-red">{stats.criticos}</p>
        </div>
        <div className="bg-onyx-800/60 border border-accent-yellow/20 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Avisos</p>
          <p className="text-2xl font-bold text-accent-yellow">{stats.warnings}</p>
        </div>
        <div className="bg-onyx-800/60 border border-accent-blue/20 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Info</p>
          <p className="text-2xl font-bold text-accent-blue">{stats.infos}</p>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className={`w-2 h-2 rounded-full bg-accent-green ${loading ? 'animate-pulse' : ''}`} />
          Atualizado há {Math.floor((Date.now() - lastUpdate.getTime()) / 1000)}s
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filterTipo}
          onChange={(e) => { setFilterTipo(e.target.value); loadAlertas() }}
          className="bg-onyx-800 border border-onyx-700/50 text-gray-200 text-sm rounded-lg px-3 py-2 focus:ring-accent-blue focus:border-accent-blue"
        >
          {ALERT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        <select
          value={filterNivel}
          onChange={(e) => { setFilterNivel(e.target.value); loadAlertas() }}
          className="bg-onyx-800 border border-onyx-700/50 text-gray-200 text-sm rounded-lg px-3 py-2 focus:ring-accent-blue focus:border-accent-blue"
        >
          {SEVERITY_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <select
          value={filterResolvido === undefined ? '' : filterResolvido ? 'true' : 'false'}
          onChange={(e) => {
            const v = e.target.value
            setFilterResolvido(v === '' ? undefined : v === 'true')
            loadAlertas()
          }}
          className="bg-onyx-800 border border-onyx-700/50 text-gray-200 text-sm rounded-lg px-3 py-2 focus:ring-accent-blue focus:border-accent-blue"
        >
          <option value="">Todos os status</option>
          <option value="false">Pendentes</option>
          <option value="true">Resolvidos</option>
        </select>

        <input
          type="text"
          placeholder="Buscar equipamento..."
          value={searchEquipamento}
          onChange={(e) => setSearchEquipamento(e.target.value)}
          className="bg-onyx-800 border border-onyx-700/50 text-gray-200 text-sm rounded-lg px-3 py-2 focus:ring-accent-blue focus:border-accent-blue w-64"
        />

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={toggleSelectAll}
            className="px-3 py-2 text-xs font-medium bg-onyx-800 border border-onyx-700/50 text-gray-300 rounded-lg hover:bg-onyx-700/50 transition-colors"
          >
            {selectedIds.size === filtered.filter((a) => !a.resolvido).length && filtered.length > 0
              ? 'Desmarcar todas'
              : 'Selecionar todas'}
          </button>
          {selectedIds.size > 0 && (
            <button
              onClick={handleBulkResolve}
              disabled={bulkResolving}
              className="px-4 py-2 text-xs font-medium bg-accent-green text-white rounded-lg hover:bg-accent-green/80 transition-colors disabled:opacity-50"
            >
              {bulkResolving ? 'Resolving...' : `Resolver (${selectedIds.size})`}
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="🔔"
          title="Nenhum alerta encontrado"
          description="Não há alertas com os filtros selecionados."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((alerta) => (
            <div key={alerta.id} className="flex items-start gap-2">
              {!alerta.resolvido && (
                <input
                  type="checkbox"
                  checked={selectedIds.has(alerta.id)}
                  onChange={() => toggleSelect(alerta.id)}
                  className="mt-5 w-4 h-4 rounded border-onyx-600 bg-onyx-800 text-accent-green focus:ring-accent-green/50"
                />
              )}
              <div className="flex-1">
                <AlertaCard
                  alerta={alerta}
                  onResolve={handleResolve}
                  resolving={resolvingIds.has(alerta.id)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
