import type {
  Alerta,
  DashboardStats,
  Equipamento,
  FiltrosAlerta,
  FiltrosEquipamento,
  FiltrosLeitura,
  Leitura,
  RelatorioMensal,
  Suprimento,
  Usuario,
} from '../types'

const BASE_URL = import.meta.env.VITE_API_URL || 'https://onyx-monitor-api.onrender.com/api'

class ApiError extends Error {
  status: number
  data: unknown

  constructor(status: number, message: string, data?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

function getToken(): string | null {
  return localStorage.getItem('onyx_token')
}

function setToken(token: string): void {
  localStorage.setItem('onyx_token', token)
}

function removeToken(): void {
  localStorage.removeItem('onyx_token')
}

function buildHeaders(): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

function buildQueryParams(params: Record<string, string | number | boolean | undefined>): string {
  const filtered = Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
  if (filtered.length === 0) return ''
  const qs = new URLSearchParams()
  filtered.forEach(([k, v]) => qs.set(k, String(v)))
  return `?${qs.toString()}`
}

interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${endpoint}`
  const response = await fetch(url, {
    ...options,
    headers: {
      ...buildHeaders(),
      ...(options.headers as Record<string, string>),
    },
  })

  if (!response.ok) {
    let data: unknown
    try {
      data = await response.json()
    } catch {
      data = null
    }
    throw new ApiError(response.status, `Erro ${response.status}: ${response.statusText}`, data)
  }

  if (response.status === 204) {
    return undefined as T
  }

  const json: ApiResponse<T> = await response.json()
  return json.data
}

// Auth
export async function login(email: string, senha: string): Promise<{ token: string; user: Usuario }> {
  const response = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha }),
  })

  const json: ApiResponse<{ token: string; user: Usuario }> = await response.json()

  if (!response.ok) {
    throw new ApiError(response.status, json.message || 'Erro ao fazer login', json)
  }

  setToken(json.data.token)
  return json.data
}

export async function getMe(): Promise<Usuario> {
  return request<Usuario>('/auth/me')
}

export async function createUsuario(usuario: Partial<Usuario> & { senha?: string }): Promise<Usuario> {
  return request<Usuario>('/auth/usuarios', {
    method: 'POST',
    body: JSON.stringify(usuario),
  })
}

export async function listUsuarios(): Promise<Usuario[]> {
  return request<Usuario[]>('/auth/usuarios')
}

// Equipamentos
export async function getEquipamentos(filtros?: FiltrosEquipamento): Promise<{ data: Equipamento[]; total: number }> {
  const params = buildQueryParams(filtros as Record<string, string | number | boolean | undefined>)
  return request<{ data: Equipamento[]; total: number }>(`/equipamentos${params}`)
}

export async function getEquipamento(id: number): Promise<Equipamento> {
  return request<Equipamento>(`/equipamentos/${id}`)
}

export async function createEquipamento(equipamento: Partial<Equipamento>): Promise<Equipamento> {
  return request<Equipamento>('/equipamentos', {
    method: 'POST',
    body: JSON.stringify(equipamento),
  })
}

export async function updateEquipamento(id: number, equipamento: Partial<Equipamento>): Promise<Equipamento> {
  return request<Equipamento>(`/equipamentos/${id}`, {
    method: 'PUT',
    body: JSON.stringify(equipamento),
  })
}

export async function deleteEquipamento(id: number): Promise<void> {
  await request(`/equipamentos/${id}`, { method: 'DELETE' })
}

export async function collectEquipamento(id: number): Promise<Leitura> {
  return request<Leitura>(`/equipamentos/${id}/collect`, { method: 'POST' })
}

export async function getStats(): Promise<DashboardStats> {
  return request<DashboardStats>('/equipamentos/stats')
}

// Leituras
export async function getLeituras(filtros?: FiltrosLeitura): Promise<{ data: Leitura[]; total: number }> {
  const params = buildQueryParams(filtros as Record<string, string | number | boolean | undefined>)
  return request<{ data: Leitura[]; total: number }>(`/leituras${params}`)
}

export async function getLeitura(id: number): Promise<Leitura> {
  return request<Leitura>(`/leituras/${id}`)
}

export async function getLeiturasEquipamento(
  equipamentoId: number,
  limit = 30
): Promise<Leitura[]> {
  return request<Leitura[]>(`/leituras/equipamento/${equipamentoId}?limit=${limit}`)
}

// Suprimentos
export async function getSuprimentos(): Promise<Suprimento[]> {
  return request<Suprimento[]>('/suprimentos')
}

export async function getSuprimentosEquipamento(equipamentoId: number): Promise<Suprimento[]> {
  return request<Suprimento[]>(`/suprimentos/equipamento/${equipamentoId}`)
}

export async function updateSuprimento(id: number, dados: Partial<Suprimento>): Promise<Suprimento> {
  return request<Suprimento>(`/suprimentos/${id}`, {
    method: 'PUT',
    body: JSON.stringify(dados),
  })
}

// Alertas
export async function getAlertas(filtros?: FiltrosAlerta): Promise<{ data: Alerta[]; total: number }> {
  const params = buildQueryParams(filtros as Record<string, string | number | boolean | undefined>)
  return request<{ data: Alerta[]; total: number }>(`/alertas${params}`)
}

export async function resolverAlerta(id: number): Promise<Alerta> {
  return request<Alerta>(`/alertas/${id}/resolve`, { method: 'PUT' })
}

export async function getAlertasStats(): Promise<{ total: number; ativos: number; criticos: number; warnings: number; infos: number }> {
  return request('/alertas/stats')
}

// Relatórios
export async function getRelatorioMensal(mes: string): Promise<RelatorioMensal[]> {
  return request<RelatorioMensal[]>(`/relatorios/mensal?mes=${mes}`)
}

export async function getRelatorioEquipamento(equipamentoId: number): Promise<Leitura[]> {
  return request<Leitura[]>(`/relatorios/equipamento/${equipamentoId}`)
}

export async function getRelatorioConsumo(
  dataInicio: string,
  dataFim: string
): Promise<RelatorioMensal[]> {
  const params = buildQueryParams({
    data_inicio: dataInicio,
    data_fim: dataFim,
  })
  return request<RelatorioMensal[]>(`/relatorios/consumo${params}`)
}

export async function exportExcel(params: Record<string, string>): Promise<Blob> {
  const query = buildQueryParams(params)
  const token = getToken()
  const response = await fetch(`${BASE_URL}/relatorios/export/excel${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) throw new ApiError(response.status, 'Erro ao exportar Excel')
  return response.blob()
}

export async function exportPdf(params: Record<string, string>): Promise<Blob> {
  const query = buildQueryParams(params)
  const token = getToken()
  const response = await fetch(`${BASE_URL}/relatorios/export/pdf${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) throw new ApiError(response.status, 'Erro ao exportar PDF')
  return response.blob()
}

export { ApiError, getToken, removeToken }
