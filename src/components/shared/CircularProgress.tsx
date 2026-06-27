interface CircularProgressProps {
  value: number
  size?: number
  strokeWidth?: number
  className?: string
}

const getProgressColor = (value: number): string => {
  if (value <= 20) return '#ef4444'
  if (value <= 50) return '#f59e0b'
  return '#10b981'
}

const getProgressGlow = (value: number): string => {
  if (value <= 20) return 'drop-shadow(0 0 6px rgba(239,68,68,0.5))'
  if (value <= 50) return 'drop-shadow(0 0 6px rgba(245,158,11,0.5))'
  return 'drop-shadow(0 0 6px rgba(16,185,129,0.5))'
}

export default function CircularProgress({ value, size = 64, strokeWidth = 5, className = '' }: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(value, 100) / 100) * circumference
  const color = getProgressColor(value)
  const glow = getProgressGlow(value)
  const textColor = value <= 20 ? 'text-accent-red' : value <= 50 ? 'text-accent-yellow' : 'text-accent-green'

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-onyx-700"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ filter: glow, transition: 'stroke-dashoffset 0.6s ease, stroke 0.3s ease' }}
        />
      </svg>
      <span className={`absolute text-xs font-bold ${textColor}`}>
        {Math.round(value)}%
      </span>
    </div>
  )
}
