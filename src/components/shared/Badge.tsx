interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple'
  className?: string
}

const variantStyles: Record<string, string> = {
  default: 'bg-onyx-700/50 text-gray-300 border-onyx-600/50',
  success: 'bg-accent-green/10 text-accent-green border-accent-green/20',
  warning: 'bg-accent-yellow/10 text-accent-yellow border-accent-yellow/20',
  danger: 'bg-accent-red/10 text-accent-red border-accent-red/20',
  info: 'bg-accent-blue/10 text-accent-blue border-accent-blue/20',
  purple: 'bg-accent-purple/10 text-accent-purple border-accent-purple/20',
}

export default function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  )
}
