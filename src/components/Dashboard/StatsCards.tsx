import { TrendingUp, TrendingDown } from 'lucide-react'
import { formatNumber } from '../../utils/helpers'

interface StatsCardsProps {
  title: string
  value: number
  icon: string
  color: 'blue' | 'green' | 'red' | 'yellow' | 'purple'
  change?: number
  loading?: boolean
}

const colorMap = {
  blue: {
    bg: 'bg-accent-blue/10',
    text: 'text-accent-blue',
    glow: 'hover:shadow-glow-blue',
    ring: 'ring-accent-blue/20',
  },
  green: {
    bg: 'bg-accent-green/10',
    text: 'text-accent-green',
    glow: 'hover:shadow-glow-green',
    ring: 'ring-accent-green/20',
  },
  red: {
    bg: 'bg-accent-red/10',
    text: 'text-accent-red',
    glow: 'hover:shadow-glow-red',
    ring: 'ring-accent-red/20',
  },
  yellow: {
    bg: 'bg-accent-yellow/10',
    text: 'text-accent-yellow',
    glow: 'hover:shadow-glow-yellow',
    ring: 'ring-accent-yellow/20',
  },
  purple: {
    bg: 'bg-accent-purple/10',
    text: 'text-accent-purple',
    glow: 'hover:shadow-[0_0_20px_rgba(139,92,246,0.3)]',
    ring: 'ring-accent-purple/20',
  },
}

function SkeletonCard() {
  return (
    <div className="card animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-3 flex-1">
          <div className="h-4 bg-onyx-700 rounded w-24" />
          <div className="h-8 bg-onyx-700 rounded w-20" />
          <div className="h-3 bg-onyx-700 rounded w-16" />
        </div>
        <div className="w-12 h-12 bg-onyx-700 rounded-xl" />
      </div>
    </div>
  )
}

export default function StatsCards({
  title,
  value,
  icon,
  color,
  change,
  loading,
}: StatsCardsProps) {
  if (loading) return <SkeletonCard />

  const colors = colorMap[color]

  return (
    <div
      className={`card card-hover cursor-default group ${colors.glow} transition-all duration-300`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-gray-400 font-medium">{title}</p>
          <p className="text-3xl font-bold text-white tracking-tight">
            {formatNumber(value)}
          </p>
          {change !== undefined && (
            <div className="flex items-center gap-1 mt-1">
              {change >= 0 ? (
                <TrendingUp className="w-3.5 h-3.5 text-accent-green" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5 text-accent-red" />
              )}
              <span
                className={`text-xs font-medium ${
                  change >= 0 ? 'text-accent-green' : 'text-accent-red'
                }`}
              >
                {change >= 0 ? '+' : ''}
                {change.toFixed(1)}%
              </span>
              <span className="text-xs text-gray-500">vs mês anterior</span>
            </div>
          )}
        </div>
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ring-1 ${colors.ring} ${colors.bg} group-hover:scale-110 transition-transform duration-300`}
        >
          {icon}
        </div>
      </div>
    </div>
  )
}
