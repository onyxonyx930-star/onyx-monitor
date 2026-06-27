export interface Equipamento {
  id: number
  cliente: string
  unidade: string
  ip: string
  comunidade_snmp: string
  fabricante: string
  modelo: string
  numero_serie: string
  localizacao: string
  contrato: string
  status_monitoramento: 'ativo' | 'inativo' | 'manutencao'
  created_at: string
  updated_at: string
  ultima_leitura?: Leitura
  suprimentos?: Suprimento[]
  alertas_ativos?: number
}

export interface Leitura {
  id: number
  equipamento_id: number
  data_leitura: string
  contador_total: number
  contador_pb: number
  contador_cor: number
  toner_preto: number
  toner_ciano: number
  toner_magenta: number
  toner_amarelo: number
  status_online: boolean
  mensagens_erro: string
  numero_serie_equip: string
  modelo_equip: string
  nome_equip: string
  created_at: string
}

export interface Suprimento {
  id: number
  equipamento_id: number
  tipo: 'preto' | 'ciano' | 'magenta' | 'amarelo' | 'waste' | 'drum' | 'fusor'
  percentual: number
  ultima_leitura: string
  previsao_troca: string
  created_at: string
  updated_at: string
}

export interface Alerta {
  id: number
  equipamento_id: number
  tipo: 'toner_baixo' | 'toner_zerado' | 'offline' | 'erro_critico' | 'contador_nao_atualizado' | 'snmp_sem_resposta'
  mensagem: string
  nivel: 'info' | 'warning' | 'critical'
  resolvido: boolean
  created_at: string
  resolvido_em: string
  equipamento?: Equipamento
}

export interface Usuario {
  id: number
  nome: string
  email: string
  role: 'admin' | 'operador' | 'cliente'
  cliente_id: number
  ativo: boolean
  created_at: string
}

export interface DashboardStats {
  total_equipamentos: number
  online: number
  offline: number
  toners_baixos: number
  alertas_criticos: number
  total_paginas_mes: number
  clientes_maior_volume: { cliente: string; paginas: number }[]
}

export interface RelatorioMensal {
  cliente: string
  total_equipamentos: number
  total_paginas: number
  media_por_equipamento: number
  toner_preto_consumido: number
  toner_ciano_consumido: number
  toner_magenta_consumido: number
  toner_amarelo_consumido: number
  dias_monitorados: number
}

export interface ConfigColeta {
  id: number
  equipamento_id: number
  intervalo: '1h' | '6h' | 'diario'
  ativo: boolean
  ultima_coleta: string
  proxima_coleta: string
}

export interface AuthResponse {
  token: string
  user: Usuario
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  per_page: number
}

export type FiltrosEquipamento = {
  cliente?: string
  status?: string
  search?: string
  page?: number
  per_page?: number
}

export type FiltrosLeitura = {
  equipamento_id?: number
  data_inicio?: string
  data_fim?: string
}

export type FiltrosAlerta = {
  tipo?: string
  nivel?: string
  resolvido?: boolean
  equipamento_id?: number
}
