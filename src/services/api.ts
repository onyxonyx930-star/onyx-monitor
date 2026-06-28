import { signInWithEmailAndPassword, signOut, onAuthStateChanged as fbOnAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../lib/firebase';
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

const BASE_URL = import.meta.env.VITE_API_URL || '/api'

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

function onAuthStateChanged(callback: (user: User | null) => void) {
  return fbOnAuthStateChanged(auth, callback);
}

async function getFirebaseToken(): Promise<string | null> {
  try {
    const user = auth.currentUser;
    if (!user) {
      console.log('[TOKEN] auth.currentUser is null');
      return null;
    }
    const token = await user.getIdToken(true);
    console.log(`[TOKEN] Token OK (length: ${token.length})`);
    return token;
  } catch (e) {
    console.error('[TOKEN] Error:', e);
    return null;
  }
}

async function buildAuthHeaders(): Promise<HeadersInit> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  const token = await getFirebaseToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  } else {
    console.log('[AUTH] No token — request will be unauthenticated')
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
  options: RequestInit = {},
  _retry = false
): Promise<T> {
  const url = `${BASE_URL}${endpoint}`
  const authHeaders = await buildAuthHeaders()
  const response = await fetch(url, {
    ...options,
    headers: {
      ...authHeaders,
      ...(options.headers as Record<string, string>),
    },
  })

  if (response.status === 401 && !_retry) {
    console.log('[REQUEST] Got 401 — retrying with fresh token...')
    // Force token refresh
    const user = auth.currentUser;
    if (user) {
      try {
        await user.getIdToken(true);
      } catch {}
    }
    return request<T>(endpoint, options, true)
  }

  if (!response.ok) {
    let data: any
    try {
      data = await response.json()
    } catch {
      data = null
    }
    const msg = data?.message || `Erro ${response.status}: ${response.statusText}`
    throw new ApiError(response.status, msg, data)
  }

  if (response.status === 204) {
    return undefined as T
  }

  const json: ApiResponse<T> = await response.json()
  return json.data
}

// Auth
export async function login(email: string, senha: string): Promise<{ token: string; user: Usuario }> {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, senha);
    const user = userCredential.user;
    const token = await user.getIdToken(true);

    // Fetch user profile from Firestore via API
    let userData: Usuario = {
      id: user.uid,
      nome: user.displayName || email.split('@')[0],
      email: user.email || email,
      role: 'operador',
      ativo: true,
    };

    try {
      const profile = await request<Usuario>('/auth/me');
      userData = profile;
    } catch {
      console.log('[LOGIN] Could not fetch profile from API, using local data');
    }

    return { token, user: userData };
  } catch (e: any) {
    console.error('[LOGIN] Firebase error:', e?.code, e?.message);
    if (e.code === 'auth/user-not-found') throw new ApiError(404, 'Usuário não encontrado');
    if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') throw new ApiError(401, 'Credenciais inválidas');
    if (e.code === 'auth/too-many-requests') throw new ApiError(429, 'Muitas tentativas. Aguarde alguns minutos.');
    throw new ApiError(500, 'Erro ao fazer login');
  }
}

export async function logout(): Promise<void> {
  try {
    await signOut(auth);
  } catch (e) {
    console.error('[LOGOUT] signOut error:', e);
  }
  // Clear all storage
  try { localStorage.clear(); } catch {}
  try { sessionStorage.clear(); } catch {}
  // Clear cookies
  document.cookie.split(';').forEach(c => {
    document.cookie = c.trim().split('=')[0] + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
  });
  console.log('[LOGOUT] All storage cleared');
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
export async function getEquipamentos(filtros?: FiltrosEquipamento & { page?: number; per_page?: number }): Promise<{ data: Equipamento[]; total: number }> {
  const params = buildQueryParams(filtros as Record<string, string | number | boolean | undefined>)
  return request<{ data: Equipamento[]; total: number }>(`/equipamentos${params}`)
}

export async function getEquipamento(id: string): Promise<Equipamento> {
  return request<Equipamento>(`/equipamentos/${id}`)
}

export async function createEquipamento(equipamento: Partial<Equipamento>): Promise<Equipamento> {
  return request<Equipamento>('/equipamentos', {
    method: 'POST',
    body: JSON.stringify(equipamento),
  })
}

export async function updateEquipamento(id: string, equipamento: Partial<Equipamento>): Promise<Equipamento> {
  return request<Equipamento>(`/equipamentos/${id}`, {
    method: 'PUT',
    body: JSON.stringify(equipamento),
  })
}

export async function deleteEquipamento(id: string): Promise<void> {
  await request(`/equipamentos/${id}`, { method: 'DELETE' })
}

export async function collectEquipamento(id: string): Promise<Leitura> {
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

export async function getLeitura(id: string): Promise<Leitura> {
  return request<Leitura>(`/leituras/${id}`)
}

export async function getLeiturasEquipamento(
  equipamentoId: string,
  limit = 30
): Promise<Leitura[]> {
  return request<Leitura[]>(`/leituras/equipamento/${equipamentoId}?limit=${limit}`)
}

// Suprimentos
export async function getSuprimentos(): Promise<Suprimento[]> {
  return request<Suprimento[]>('/suprimentos')
}

export async function getSuprimentosEquipamento(equipamentoId: string): Promise<Suprimento[]> {
  return request<Suprimento[]>(`/suprimentos/equipamento/${equipamentoId}`)
}

export async function updateSuprimento(id: string, dados: Partial<Suprimento>): Promise<Suprimento> {
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

export async function resolverAlerta(id: string): Promise<Alerta> {
  return request<Alerta>(`/alertas/${id}/resolver`, { method: 'PUT' })
}

export async function getAlertasStats(): Promise<{ total: number; ativos: number; criticos: number; warnings: number; infos: number }> {
  return request('/alertas/stats')
}

// Relatórios
export async function getRelatorioMensal(mes: string): Promise<RelatorioMensal[]> {
  return request<RelatorioMensal[]>(`/relatorios/mensal?mes=${mes}`)
}

export async function getRelatorioEquipamento(equipamentoId: string): Promise<Leitura[]> {
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
  const response = await fetch(`${BASE_URL}/relatorios/export/excel${query}`, {
    headers: await buildAuthHeaders(),
  })
  if (!response.ok) throw new ApiError(response.status, 'Erro ao exportar Excel')
  return response.blob()
}

export async function exportPdf(params: Record<string, string>): Promise<Blob> {
  const query = buildQueryParams(params)
  const response = await fetch(`${BASE_URL}/relatorios/export/pdf${query}`, {
    headers: await buildAuthHeaders(),
  })
  if (!response.ok) throw new ApiError(response.status, 'Erro ao exportar PDF')
  return response.blob()
}

// Agents
export async function getAgents(): Promise<import('../types').Agent[]> {
  return request<import('../types').Agent[]>('/agents')
}

export async function getAgent(id: string): Promise<import('../types').Agent> {
  return request<import('../types').Agent>(`/agents/${id}`)
}

export async function createAgent(agent: Partial<import('../types').Agent>): Promise<import('../types').Agent> {
  return request<import('../types').Agent>('/agents/register', {
    method: 'POST',
    body: JSON.stringify(agent),
  })
}

export async function updateAgent(id: string, agent: Partial<import('../types').Agent>): Promise<import('../types').Agent> {
  return request<import('../types').Agent>(`/agents/${id}`, {
    method: 'PUT',
    body: JSON.stringify(agent),
  })
}

export async function deleteAgent(id: string): Promise<void> {
  await request(`/agents/${id}`, { method: 'DELETE' })
}

export async function assignEquipmentToAgent(agentId: string, equipamentoId: string): Promise<void> {
  await request(`/agents/${agentId}/assign`, {
    method: 'POST',
    body: JSON.stringify({ equipamento_id: equipamentoId }),
  })
}

export async function unassignEquipmentFromAgent(agentId: string, equipamentoId: string): Promise<void> {
  await request(`/agents/${agentId}/unassign`, {
    method: 'POST',
    body: JSON.stringify({ equipamento_id: equipamentoId }),
  })
}

export async function getAgentLogs(agentId: string, level?: string): Promise<import('../types').AgentLog[]> {
  const params = level ? `?level=${level}` : ''
  return request<import('../types').AgentLog[]>(`/agents/${agentId}/logs${params}`)
}

// Auditoria de Impressão
export async function getAuditoria(filtros?: import('../types/auditoria').FiltrosAuditoria): Promise<{ data: import('../types/auditoria').AuditoriaImpressao[]; total: number }> {
  const params = buildQueryParams(filtros as Record<string, string | number | boolean | undefined>)
  return request(`/auditoria${params}`)
}

export async function getAuditoriaStats(dataInicio?: string, dataFim?: string): Promise<import('../types/auditoria').AuditoriaStats> {
  const params = buildQueryParams({ data_inicio: dataInicio, data_fim: dataFim })
  return request(`/auditoria/stats${params}`)
}

export async function createAuditoria(record: Partial<import('../types/auditoria').AuditoriaImpressao>): Promise<import('../types/auditoria').AuditoriaImpressao> {
  return request('/auditoria', { method: 'POST', body: JSON.stringify(record) })
}

export async function createAuditoriaBatch(records: Partial<import('../types/auditoria').AuditoriaImpressao>[]): Promise<{ inserted: number; total: number }> {
  return request('/auditoria/batch', { method: 'POST', body: JSON.stringify({ records }) })
}

export async function deleteAuditoria(id: string): Promise<void> {
  await request(`/auditoria/${id}`, { method: 'DELETE' })
}

export async function exportAuditoriaCsv(filtros?: Record<string, string>): Promise<Blob> {
  const query = buildQueryParams(filtros as Record<string, string | number | boolean | undefined>)
  const response = await fetch(`${BASE_URL}/auditoria/export/csv${query}`, {
    headers: await buildAuthHeaders(),
  })
  if (!response.ok) throw new ApiError(response.status, 'Erro ao exportar CSV')
  return response.blob()
}

export async function getAuditoriaConfig(): Promise<import('../types/auditoria').AuditoriaConfig[]> {
  return request('/auditoria/config')
}

export async function createAuditoriaConfig(config: Partial<import('../types/auditoria').AuditoriaConfig>): Promise<import('../types/auditoria').AuditoriaConfig> {
  return request('/auditoria/config', { method: 'POST', body: JSON.stringify(config) })
}

export async function deleteAuditoriaConfig(id: string): Promise<void> {
  await request(`/auditoria/config/${id}`, { method: 'DELETE' })
}

export { ApiError, onAuthStateChanged, logout as removeToken }
export type { User } from 'firebase/auth';