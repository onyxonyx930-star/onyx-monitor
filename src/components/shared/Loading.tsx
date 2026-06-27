interface LoadingProps {
  fullPage?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export default function Loading({ fullPage = false, size = 'md' }: LoadingProps) {
  const sizeMap = { sm: 'w-5 h-5', md: 'w-8 h-8', lg: 'w-12 h-12' }

  const spinner = (
    <div className={`${sizeMap[size]} border-2 border-onyx-700 border-t-accent-blue rounded-full animate-spin`} />
  )

  if (fullPage) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-onyx-950">
        <div className="flex flex-col items-center gap-4">
          {spinner}
          <p className="text-sm text-gray-400 animate-pulse">Carregando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center py-12">
      {spinner}
    </div>
  )
}
