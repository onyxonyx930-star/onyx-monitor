import { useState, Fragment } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

interface LayoutProps {
  children: React.ReactNode
  onLogout: () => void
}

const navigation = [
  { name: 'Dashboard', href: '/', icon: '📊' },
  { name: 'Equipamentos', href: '/equipamentos', icon: '🖨️' },
  { name: 'Suprimentos', href: '/suprimentos', icon: '📦' },
  { name: 'Alertas', href: '/alertas', icon: '🔔' },
  { name: 'Relatórios', href: '/relatorios', icon: '📋' },
  { name: 'Configurações', href: '/configuracoes', icon: '⚙️' },
]

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/equipamentos': 'Equipamentos',
  '/suprimentos': 'Suprimentos',
  '/alertas': 'Alertas',
  '/relatorios': 'Relatórios',
  '/configuracoes': 'Configurações',
}

export default function Layout({ children, onLogout }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  const getPageTitle = () => {
    if (location.pathname.startsWith('/equipamentos/')) {
      return 'Detalhes do Equipamento'
    }
    return pageTitles[location.pathname] || 'Onyx Monitor'
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[280px] bg-onyx-900 border-r border-onyx-700/50 flex flex-col transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:z-auto ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 px-6 py-5 border-b border-onyx-700/50">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-blue to-blue-400 flex items-center justify-center">
            <span className="text-white font-bold text-lg">O</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">Onyx Monitor</h1>
            <p className="text-xs text-gray-500">Printer Management</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navigation.map((item) => {
            const isActive =
              item.href === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.href)
            return (
              <NavLink
                key={item.name}
                to={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-accent-blue/10 text-accent-blue border border-accent-blue/20'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-onyx-800/50 border border-transparent'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                {item.name}
              </NavLink>
            )
          })}
        </nav>

        <div className="px-4 py-4 border-t border-onyx-700/50">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-onyx-700 flex items-center justify-center">
              <span className="text-sm font-medium text-gray-300">AD</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-200 truncate">Admin</p>
              <p className="text-xs text-gray-500 truncate">admin@onyx.com</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-accent-red hover:bg-accent-red/10 transition-all duration-200"
          >
            <span>🚪</span>
            Sair
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-onyx-700/50 bg-onyx-900/80 backdrop-blur-sm flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-onyx-800/50 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h2 className="text-lg font-semibold text-gray-100">{getPageTitle()}</h2>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center">
              <input
                type="text"
                placeholder="Buscar..."
                className="input-field w-64 text-sm py-2"
              />
            </div>

            <button className="relative p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-onyx-800/50 transition-colors">
              <span className="text-lg">🔔</span>
              <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-accent-red rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                3
              </span>
            </button>

            <div className="hidden sm:flex items-center gap-3 pl-4 border-l border-onyx-700/50">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-blue to-blue-400 flex items-center justify-center">
                <span className="text-xs font-bold text-white">AD</span>
              </div>
              <span className="text-sm font-medium text-gray-300">Admin</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 bg-onyx-950">
          {children}
        </main>
      </div>
    </div>
  )
}
