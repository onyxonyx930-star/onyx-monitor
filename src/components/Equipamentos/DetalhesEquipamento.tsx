import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Radio,
  Pencil,
  Trash2,
  RefreshCw,
  Clock,
  MapPin,
  Hash,
  Building2,
  Wifi,
  AlertCircle,
  CheckCircle,
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { Equipamento, Leitura, Suprimento, Alerta } from '../../types'
import {
  getEquipamento,
  getLeiturasEquipamento,
  getSuprimentosEquipamento,
  getAlertas,
  collectEquipamento,
  deleteEquipamento,
} from '../../services/api'
import { formatDateTime, formatNumber, getTonerColor } from '../../utils/helpers'
import FormEquipamento from './FormEquipamento'

export default function DetalhesEquipamento() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const equipamentoId = Number(id)

  const [equipamento, setEquipamento] = useState<Equipamento | null>(null)
  const [leituras, setLeituras] = useState<Leitura[]>([])
  const [suprimentos, setSuprimentos] = useState<Suprimento[]>([])
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [collecting, setCollecting] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fetchData = useCallback(async () => {
    if (!equipamentoId) return
    try {
      setLoading(true)
      setError(null)
      const [eq, leit, sup, alrt] = await Promise.all([
        getEquipamento(equipamentoId),
        getLeiturasEquipamento(equipamentoId, 30),
        getSuprimentosEquipamento(equipamentoId),
        getAlertas({ equipamento_id: equipamentoId }),
      ])
      setEquipamento(eq)
      setLeituras(leit)
      setSuprimentos(sup)
      setAlertas(alrt.data.slice(0, 10))
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao carregar detalhes'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [equipamentoId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleCollect = async () => {
    try {
      setCollecting(true)
      await collectEquipamento(equipamentoId)
      await fetchData()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao coletar dados'
      setError(message)
    } finally {
      setCollecting(false)
    }
  }

  const handleDelete = async () => {
    try {
      setDeleting(true)
      await deleteEquipamento(equipamentoId)
      navigate('/equipamentos')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao excluir equipamento'
      setError(message)
      setDeleting(false)
    }
  }

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

  const chartData = leituras
    .slice()
    .reverse()
    .map((l) => ({
      date: new Date(l.data_leitura).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
      }),
      total: l.contador_total,
      pb: l.contador_pb,
      cor: l.contador_cor,
    }))

  const latestLeitura = leituras[0] || null

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 bg-onyx-700 rounded-lg animate-pulse" />
          <div className="h-6 w-48 bg-onyx-700 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-40 bg-onyx-700/50 rounded" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error && !equipamento) {
    return (
      <div className="space-y-4 animate-fade-in">
        <button
          onClick={() => navigate('/equipamentos')}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>
        <div className="card border-accent-red/30 bg-accent-red/5 text-center py-12">
          <AlertCircle className="w-10 h-10 text-accent-red mx-auto mb-3" />
          <p className="text-accent-red font-medium">{error}</p>
          <button onClick={fetchData} className="btn-secondary mt-4">
            <RefreshCw className="w-4 h-4" />
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  if (!equipamento) return null

  const tonerColors: Record<string, string> = {
    preto: '#1a1a1a',
    ciano: '#06b6d4',
    magenta: '#ec4899',
    amarelo: '#facc15',
    waste: '#6b7280',
    drum: '#8b5cf6',
    fusor: '#f97316',
  }

  const tonerLabels: Record<string, string> = {
    preto: 'Preto',
    ciano: 'Ciano',
    magenta: 'Magenta',
    amarelo: 'Amarelo',
    waste: 'Resíduo',
    drum: 'Drum',
    fusor: 'Fusor',
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {showEditForm && (
        <FormEquipamento
          equipamento={equipamento}
          onClose={() => setShowEditForm(false)}
          onSuccess={() => {
            setShowEditForm(false)
            fetchData()
          }}
        />
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/equipamentos')}
            className="p-2 rounded-lg bg-onyx-700 text-gray-300 hover:bg-onyx-600 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">
                {equipamento.fabricante} {equipamento.modelo}
              </h1>
              {getStatusBadge(equipamento.status_monitoramento)}
            </div>
            <p className="text-sm text-gray-400 mt-0.5">
              {equipamento.cliente} — {equipamento.unidade}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCollect}
            disabled={collecting}
            className="btn-primary"
          >
            <Radio className={`w-4 h-4 ${collecting ? 'animate-spin' : ''}`} />
            Coletar Agora
          </button>
          <button
            onClick={() => setShowEditForm(true)}
            className="btn-secondary"
          >
            <Pencil className="w-4 h-4" />
            Editar
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="btn-danger"
              >
                {deleting ? 'Excluindo...' : 'Confirmar'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="btn-secondary"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="btn-danger"
            >
              <Trash2 className="w-4 h-4" />
              Excluir
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="card border-accent-red/30 bg-accent-red/5 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-accent-red flex-shrink-0" />
          <p className="text-accent-red text-sm">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card">
          <h3 className="text-lg font-semibold text-white mb-4">
            Informações do Equipamento
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <InfoItem icon={<Building2 className="w-4 h-4" />} label="Cliente" value={equipamento.cliente} />
            <InfoItem icon={<MapPin className="w-4 h-4" />} label="Unidade" value={equipamento.unidade} />
            <InfoItem icon={<Wifi className="w-4 h-4" />} label="IP" value={equipamento.ip} mono />
            <InfoItem icon={<Hash className="w-4 h-4" />} label="Série" value={equipamento.numero_serie} mono />
            <InfoItem icon={<Clock className="w-4 h-4" />} label="Contrato" value={equipamento.contrato || '—'} />
            <InfoItem
              icon={<MapPin className="w-4 h-4" />}
              label="Localização"
              value={equipamento.localizacao || '—'}
            />
            <InfoItem label="Fabricante" value={equipamento.fabricante} />
            <InfoItem label="Modelo" value={equipamento.modelo} />
            <InfoItem label="SNMP Community" value={equipamento.comunidade_snmp} mono />
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold text-white mb-4">
            Última Leitura
          </h3>
          {latestLeitura ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Data</span>
                <span className="text-sm text-gray-200">
                  {formatDateTime(latestLeitura.data_leitura)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Total Páginas</span>
                <span className="text-sm font-medium text-white">
                  {formatNumber(latestLeitura.contador_total)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">P&B</span>
                <span className="text-sm text-gray-200">
                  {formatNumber(latestLeitura.contador_pb)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Cor</span>
                <span className="text-sm text-gray-200">
                  {formatNumber(latestLeitura.contador_cor)}
                </span>
              </div>
              <div className="h-px bg-onyx-700/50 my-2" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Status</span>
                {latestLeitura.status_online ? (
                  <span className="badge badge-green">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Online
                  </span>
                ) : (
                  <span className="badge badge-red">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Offline
                  </span>
                )}
              </div>
              {latestLeitura.mensagens_erro && (
                <div className="mt-2 p-2 rounded bg-accent-red/10 border border-accent-red/20">
                  <p className="text-xs text-accent-red">
                    {latestLeitura.mensagens_erro}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <Clock className="w-8 h-8 text-gray-500 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">Nenhuma leitura registrada</p>
            </div>
          )}
        </div>
      </div>

      {suprimentos.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold text-white mb-4">Suprimentos</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {suprimentos.map((sup) => {
              const color = getTonerColor(sup.percentual)
              return (
                <div
                  key={sup.id}
                  className="bg-onyx-900/50 rounded-lg p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-300">
                      {tonerLabels[sup.tipo] || sup.tipo}
                    </span>
                    <span
                      className="text-sm font-bold"
                      style={{ color }}
                    >
                      {sup.percentual}%
                    </span>
                  </div>
                  <div className="h-2.5 bg-onyx-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(sup.percentual, 2)}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    Previsão troca: {sup.previsao_troca || '—'}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {chartData.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold text-white mb-4">
            Histórico de Leituras
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#a1a1aa', fontSize: 12 }}
                axisLine={{ stroke: '#3f3f46' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#a1a1aa', fontSize: 12 }}
                axisLine={{ stroke: '#3f3f46' }}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #3f3f46',
                  borderRadius: '8px',
                  padding: '12px',
                  color: '#f4f4f5',
                  fontSize: '13px',
                }}
                formatter={(value: number, name: string) => [
                  formatNumber(value),
                  name === 'total' ? 'Total' : name === 'pb' ? 'P&B' : 'Cor',
                ]}
              />
              <Line
                type="monotone"
                dataKey="total"
                name="total"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="pb"
                name="pb"
                stroke="#a1a1aa"
                strokeWidth={1.5}
                dot={false}
                strokeDasharray="4 4"
              />
              <Line
                type="monotone"
                dataKey="cor"
                name="cor"
                stroke="#8b5cf6"
                strokeWidth={1.5}
                dot={false}
                strokeDasharray="4 4"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {leituras.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold text-white mb-4">
            Leituras Recentes
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
                  <th className="pb-3 pr-4">Data</th>
                  <th className="pb-3 pr-4">Total</th>
                  <th className="pb-3 pr-4">P&B</th>
                  <th className="pb-3 pr-4">Cor</th>
                  <th className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {leituras.slice(0, 10).map((leitura) => (
                  <tr key={leitura.id} className="table-row">
                    <td className="py-3 pr-4 text-sm text-gray-300">
                      {formatDateTime(leitura.data_leitura)}
                    </td>
                    <td className="py-3 pr-4 text-sm font-medium text-white">
                      {formatNumber(leitura.contador_total)}
                    </td>
                    <td className="py-3 pr-4 text-sm text-gray-300">
                      {formatNumber(leitura.contador_pb)}
                    </td>
                    <td className="py-3 pr-4 text-sm text-gray-300">
                      {formatNumber(leitura.contador_cor)}
                    </td>
                    <td className="py-3">
                      {leitura.status_online ? (
                        <span className="badge badge-green">Online</span>
                      ) : (
                        <span className="badge badge-red">Offline</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {alertas.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold text-white mb-4">
            Alertas deste Equipamento
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
                  <th className="pb-3 pr-4">Tipo</th>
                  <th className="pb-3 pr-4">Mensagem</th>
                  <th className="pb-3 pr-4">Nível</th>
                  <th className="pb-3 pr-4">Data</th>
                  <th className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {alertas.map((alerta) => (
                  <tr key={alerta.id} className="table-row">
                    <td className="py-3 pr-4 text-sm text-gray-200 capitalize">
                      {alerta.tipo.replace(/_/g, ' ')}
                    </td>
                    <td className="py-3 pr-4 text-sm text-gray-300 max-w-xs truncate">
                      {alerta.mensagem}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`badge ${
                          alerta.nivel === 'critical'
                            ? 'badge-red'
                            : alerta.nivel === 'warning'
                            ? 'badge-yellow'
                            : 'badge-blue'
                        }`}
                      >
                        {alerta.nivel}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-sm text-gray-400">
                      {formatDateTime(alerta.created_at)}
                    </td>
                    <td className="py-3">
                      {alerta.resolvido ? (
                        <span className="badge badge-green">Resolvido</span>
                      ) : (
                        <span className="badge badge-yellow">Pendente</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoItem({
  icon,
  label,
  value,
  mono,
}: {
  icon?: React.ReactNode
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-500 flex items-center gap-1.5">
        {icon}
        {label}
      </p>
      <p
        className={`text-sm text-gray-200 ${mono ? 'font-mono bg-onyx-900/50 px-2 py-0.5 rounded inline-block' : ''}`}
      >
        {value}
      </p>
    </div>
  )
}
