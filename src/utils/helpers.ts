export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(date))
}

export function formatDateTime(date: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(date))
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value)
}

export function getTonerColor(percentual: number): string {
  if (percentual <= 0) return '#dc2626'
  if (percentual <= 10) return '#ef4444'
  if (percentual <= 25) return '#f97316'
  if (percentual <= 50) return '#eab308'
  return '#22c55e'
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'ativo':
      return '#22c55e'
    case 'inativo':
      return '#6b7280'
    case 'manutencao':
      return '#f97316'
    default:
      return '#6b7280'
  }
}

export function getAlertaIcon(tipo: string): string {
  switch (tipo) {
    case 'toner_baixo':
      return 'TriangleAlert'
    case 'toner_zerado':
      return 'XCircle'
    case 'offline':
      return 'WifiOff'
    case 'erro_critico':
      return 'AlertOctagon'
    case 'contador_nao_atualizado':
      return 'Clock'
    case 'snmp_sem_resposta':
      return 'ServerCrash'
    default:
      return 'Bell'
  }
}

export function getPercentualClass(percentual: number): string {
  if (percentual <= 0) return 'toner-empty'
  if (percentual <= 10) return 'toner-critical'
  if (percentual <= 25) return 'toner-low'
  if (percentual <= 50) return 'toner-medium'
  return 'toner-ok'
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}...`
}

export function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function calcularDiasPrevisaoTroca(
  percentualAtual: number,
  percentualPorDia: number
): number {
  if (percentualPorDia <= 0) return Infinity
  return Math.ceil(percentualAtual / percentualPorDia)
}
