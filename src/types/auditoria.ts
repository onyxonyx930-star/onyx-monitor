export interface AuditoriaImpressao {
  id: number
  equipamento_id: number | null
  cliente: string
  usuario: string
  computador: string
  documento: string
  data_impressao: string
  hora_impressao: string
  total_paginas: number
  colorida: number
  duplex: number
  tamanho_papel: string
  status_impressao: 'concluida' | 'cancelada' | 'erro' | 'pendente'
  fonte: 'snmp' | 'spooler' | 'api' | 'manual' | 'agent'
  ip_equipamento: string
  numero_serie: string
  modelo_equip: string
  dados_extras: Record<string, unknown>
  created_at: string
  equipamento?: Equipamento
}

export interface AuditoriaConfig {
  id: number
  tipo_integracao: 'snmp' | 'spooler' | 'api_fabricante' | 'accounting'
  ativo: boolean
  config: Record<string, unknown>
  equipamento_id: number | null
  created_at: string
  updated_at: string
  modelo?: string
  ip?: string
}

export interface AuditoriaStats {
  total_registros: number
  total_paginas: number
  por_usuario: { usuario: string; total_impressoes: number; total_paginas: number }[]
  por_equipamento: { equipamento_id: number; modelo: string; ip: string; total_impressoes: number; total_paginas: number }[]
  por_cliente: { cliente: string; total_impressoes: number; total_paginas: number }[]
  por_mes: { mes: string; total_impressoes: number; total_paginas: number }[]
  por_fonte: { fonte: string; total: number }[]
  por_cor: { tipo: string; total: number; paginas: number }[]
  por_status: { status_impressao: string; total: number }[]
}

export type FiltrosAuditoria = {
  cliente?: string
  equipamento_id?: number
  usuario?: string
  documento?: string
  data_inicio?: string
  data_fim?: string
  fonte?: string
  page?: number
  per_page?: number
}
