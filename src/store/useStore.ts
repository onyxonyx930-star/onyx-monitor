import { create } from 'zustand'
import type {
  Alerta,
  DashboardStats,
  Equipamento,
  Leitura,
  Suprimento,
  Usuario,
} from '../types'
import * as api from '../services/api'

interface AppState {
  user: Usuario | null
  equipamentos: Equipamento[]
  leituras: Leitura[]
  suprimentos: Suprimento[]
  alertas: Alerta[]
  stats: DashboardStats | null
  loading: boolean
  error: string | null

  setUser: (user: Usuario | null) => void
  setEquipamentos: (equipamentos: Equipamento[]) => void
  addEquipamento: (equipamento: Equipamento) => void
  updateEquipamento: (id: number, equipamento: Partial<Equipamento>) => void
  removeEquipamento: (id: number) => void
  setLeituras: (leituras: Leitura[]) => void
  setSuprimentos: (suprimentos: Suprimento[]) => void
  setAlertas: (alertas: Alerta[]) => void
  setStats: (stats: DashboardStats | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void

  login: (email: string, senha: string) => Promise<void>
  logout: () => void
  checkAuth: () => Promise<void>
}

const useStore = create<AppState>((set) => ({
  user: null,
  equipamentos: [],
  leituras: [],
  suprimentos: [],
  alertas: [],
  stats: null,
  loading: false,
  error: null,

  setUser: (user) => set({ user }),

  setEquipamentos: (equipamentos) => set({ equipamentos }),

  addEquipamento: (equipamento) =>
    set((state) => ({
      equipamentos: [...state.equipamentos, equipamento],
    })),

  updateEquipamento: (id, dados) =>
    set((state) => ({
      equipamentos: state.equipamentos.map((eq) =>
        eq.id === id ? { ...eq, ...dados } : eq
      ),
    })),

  removeEquipamento: (id) =>
    set((state) => ({
      equipamentos: state.equipamentos.filter((eq) => eq.id !== id),
    })),

  setLeituras: (leituras) => set({ leituras }),
  setSuprimentos: (suprimentos) => set({ suprimentos }),
  setAlertas: (alertas) => set({ alertas }),
  setStats: (stats) => set({ stats }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  login: async (email, senha) => {
    set({ loading: true, error: null })
    try {
      const data = await api.login(email, senha)
      set({ user: data.user, loading: false })
    } catch (err) {
      const message = err instanceof api.ApiError ? (err.data as { message?: string })?.message || err.message : 'Erro ao fazer login'
      set({ error: message, loading: false })
      throw err
    }
  },

  logout: () => {
    api.removeToken()
    set({ user: null, equipamentos: [], leituras: [], suprimentos: [], alertas: [], stats: null })
  },

  checkAuth: async () => {
    const token = api.getToken()
    if (!token) return

    set({ loading: true })
    try {
      const user = await api.getMe()
      set({ user, loading: false })
    } catch {
      api.removeToken()
      set({ user: null, loading: false })
    }
  },
}))

export default useStore
