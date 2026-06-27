import type { Alerta } from '../../types'
import Badge from '../shared/Badge'

interface AlertaCardProps {
  alerta: Alerta
  onResolve: (id: number) => void
  resolving?: boolean
}

const ALERT_ICONS: Record<string, string> = {
  toner_baixo: '📉',
  toner_zerado: '❌',
  offline: '📡',
  erro_critico: '💥',
  contador_nao_atualizado: '🕐',
  snmp_sem_resposta: '🖥️',
}

const ALERT_TITLES: Record<string, string> = {
  toner_baixo: 'Toner Baixo',
  toner_zerado: 'Toner Zerado',
  offline: 'Equipamento Offline',
  erro_critico: 'Erro Crítico',
  contador_nao_atualizado: 'Contador Desatualizado',
  snmp_sem_resposta: 'SNMP Sem Resposta',
}

function getSeverityBorder(nivel: string): string {
  switch (nivel) {
    case 'critical':
      return 'border-l-accent-red'
    case 'warning':
      return 'border-l-accent-yellow'
    case 'info':
      return 'border-l-accent-blue'
    default:
      return 'border-l-onyx-600'
  }
}

function getSeverityBadge(nivel: string): 'danger' | 'warning' | 'info' {
  switch (nivel) {
    case 'critical':
      return 'danger'
    case 'warning':
      return 'warning'
    default:
      return 'info'
  }
}

function getSeverityLabel(nivel: string): string {
  switch (nivel) {
    case 'critical':
      return 'Crítico'
    case 'warning':
      return 'Aviso'
    default:
      return 'Info'
  }
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)

  if (diff < 60) return 'agora mesmo'
  if (diff < 3600) return `há ${Math.floor(diff / 60)}min`
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `há ${Math.floor(diff / 86400)}d`
  return new Date(dateStr).toLocaleDateString('pt-BR')
}

export default function AlertaCard({ alerta, onResolve, resolving = false }: AlertaCardProps) {
  return (
    <div
      className={`bg-onyx-800/60 border border-onyx-700/40 border-l-4 rounded-xl p-4 hover:border-onyx-600/60 transition-all duration-200 ${
        getSeverityBorder(alerta.nivel)
      } ${alerta.resolvido ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl mt-0.5 shrink-0">{ALERT_ICONS[alerta.tipo] || '🔔'}</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h4 className="text-sm font-semibold text-gray-200">
              {ALERT_TITLES[alerta.tipo] || alerta.tipo}
            </h4>
            <Badge variant={getSeverityBadge(alerta.nivel)}>
              {getSeverityLabel(alerta.nivel)}
            </Badge>
            {alerta.resolvido && (
              <Badge variant="success">Resolvido</Badge>
            )}
          </div>

          <p className="text-xs text-gray-400 mb-2 line-clamp-2">{alerta.mensagem}</p>

          <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
            {alerta.equipamento && (
              <>
                <span className="flex items-center gap-1">
                  <span>🖨️</span>
                  <span className="text-gray-300">{alerta.equipamento.modelo}</span>
                </span>
                <span className="font-mono text-gray-400">{alerta.equipamento.ip}</span>
                <span>·</span>
                <span>{alerta.equipamento.cliente}</span>
                <span>·</span>
              </>
            )}
            <span>{timeAgo(alerta.created_at)}</span>
          </div>
        </div>

        {!alerta.resolvido && (
          <button
            onClick={() => onResolve(alerta.id)}
            disabled={resolving}
            className="shrink-0 px-3 py-1.5 text-xs font-medium bg-accent-green/10 text-accent-green border border-accent-green/20 rounded-lg hover:bg-accent-green/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resolving ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-accent-green/30 border-t-accent-green rounded-full animate-spin" />
                ...
              </span>
            ) : (
              'Resolver'
            )}
          </button>
        )}
      </div>
    </div>
  )
}
