import { useEffect, useState, useCallback } from 'react'
import {
  Printer,
  CheckCircle,
  XCircle,
  TriangleAlert,
  AlertOctagon,
  FileText,
  RefreshCw,
  ArrowRight,
} from 'lucide-react'
import StatsCards from './StatsCards'
import Charts from './Charts'
import type { DashboardStats, Alerta } from '../../types'
import { getStats, getAlertas, getLeituras } from '../../services/api'
import { formatDateTime, formatNumber } from '../../utils/helpers'
import { useNavigate } from 'react-router-dom'

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [lineData, setLineData] = useState<{ date: string; paginas: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const fetchData = useCallback(async () => {
    try {
      setError(null)
      const [statsRes, alertasRes, leiturasRes] = await Promise.all([
        getStats(),
        getAlertas({ nivel: 'critical', resolvido: false }),
        getLeituras({}),
      ])

      setStats(statsRes)
      setAlertas(alertasRes.data.slice(0, 5))

      const now = new Date()
      const days: { date: string; paginas: number }[] = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now)
        d.setDate(d.getDate() - i)
        const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
        days.push({ date: label, paginas: 0 })
      }

      leiturasRes.data.forEach((leitura) => {
        const leituraDate = new Date(leitura.data_leitura)
        const diffDays = Math.floor(
          (now.getTime() - leituraDate.getTime()) / (1000 * 60 * 60 * 24)
        )
        if (diffDays >= 0 && diffDays < 7) {
          days[6 - diffDays].paginas += leitura.contador_total
        }
      })

      setLineData(days)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao carregar dados do dashboard'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30_000)
    return () => clearInterval(interval)
  }, [fetchData])

  const statCards = [
    {
      title: 'Total Equipamentos',
      value: stats?.total_equipamentos ?? 0,
      icon: '🖨️',
      color: 'blue' as const,
      change: 5.2,
    },
    {
      title: 'Online',
      value: stats?.online ?? 0,
      icon: '✅',
      color: 'green' as const,
      change: 2.1,
    },
    {
      title: 'Offline',
      value: stats?.offline ?? 0,
      icon: '❌',
      color: 'red' as const,
      change: -1.3,
    },
    {
      title: 'Toners Baixos',
      value: stats?.toners_baixos ?? 0,
      icon: '⚠️',
      color: 'yellow' as const,
      change: 8.7,
    },
    {
      title: 'Alertas Críticos',
      value: stats?.alertas_criticos ?? 0,
      icon: '🛑',
      color: 'red' as const,
      change: -3.5,
    },
    {
      title: 'Total Páginas Mês',
      value: stats?.total_paginas_mes ?? 0,
      icon: '📄',
      color: 'purple' as const,
      change: 12.4,
    },
  ]

  function getAlertBadge(nivel: string) {
    switch (nivel) {
      case 'critical':
        return 'badge-red'
      case 'warning':
        return 'badge-yellow'
      default:
        return 'badge-blue'
    }
  }

  function getAlertLabel(tipo: string) {
    switch (tipo) {
      case 'toner_baixo':
        return 'Toner Baixo'
      case 'toner_zerado':
        return 'Toner Zerado'
      case 'offline':
        return 'Offline'
      case 'erro_critico':
        return 'Erro Crítico'
      case 'contador_nao_atualizado':
        return 'Contador Desatualizado'
      case 'snmp_sem_resposta':
        return 'SNMP sem Resposta'
      default:
        return tipo
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-1">
            Visão geral do monitoramento
          </p>
        </div>
        <button
          onClick={() => {
            setLoading(true)
            fetchData()
          }}
          className="btn-secondary"
          disabled={loading}
        >
          <RefreshCw
            className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
          />
          Atualizar
        </button>
      </div>

      {error && (
        <div className="card border-accent-red/30 bg-accent-red/5">
          <p className="text-accent-red text-sm">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {statCards.map((card) => (
          <StatsCards
            key={card.title}
            title={card.title}
            value={card.value}
            icon={card.icon}
            color={card.color}
            change={card.change}
            loading={loading}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Charts type="bar" data={stats} loading={loading} />
        <Charts type="line" lineData={lineData} loading={loading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">
              Alertas Recentes
            </h3>
            <button
              onClick={() => navigate('/alertas')}
              className="text-sm text-accent-blue hover:text-blue-400 flex items-center gap-1 transition-colors"
            >
              Ver todos
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 bg-onyx-700/50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : alertas.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="w-10 h-10 text-accent-green mx-auto mb-2" />
              <p className="text-gray-400 text-sm">Nenhum alerta crítico</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
                    <th className="pb-3 pr-4">Equipamento</th>
                    <th className="pb-3 pr-4">Tipo</th>
                    <th className="pb-3 pr-4">Nível</th>
                    <th className="pb-3">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {alertas.map((alerta) => (
                    <tr key={alerta.id} className="table-row">
                      <td className="py-3 pr-4 text-sm text-gray-200">
                        {alerta.equipamento?.modelo || `Equip. #${alerta.equipamento_id}`}
                      </td>
                      <td className="py-3 pr-4 text-sm text-gray-300">
                        {getAlertLabel(alerta.tipo)}
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`badge ${getAlertBadge(alerta.nivel)}`}>
                          {alerta.nivel}
                        </span>
                      </td>
                      <td className="py-3 text-sm text-gray-400">
                        {formatDateTime(alerta.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold text-white mb-4">
            Top 5 Clientes
          </h3>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-10 bg-onyx-700/50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : !stats?.clientes_maior_volume?.length ? (
            <p className="text-gray-400 text-sm text-center py-8">
              Sem dados de clientes
            </p>
          ) : (
            <div className="space-y-3">
              {stats.clientes_maior_volume.slice(0, 5).map((cliente, index) => {
                const maxPaginas = stats.clientes_maior_volume[0].paginas
                const percent = maxPaginas > 0 ? (cliente.paginas / maxPaginas) * 100 : 0
                return (
                  <div key={cliente.cliente} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-500 w-5">
                          #{index + 1}
                        </span>
                        <span className="text-sm text-gray-200 truncate max-w-[140px]">
                          {cliente.cliente}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-gray-300">
                        {formatNumber(cliente.paginas)}
                      </span>
                    </div>
                    <div className="h-1.5 bg-onyx-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${percent}%`,
                          backgroundColor: ONYX_BAR_COLORS[index % ONYX_BAR_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const ONYX_BAR_COLORS = ['#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#8b5cf6']
