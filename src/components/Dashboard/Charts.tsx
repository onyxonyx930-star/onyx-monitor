import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { DashboardStats } from '../../types'

interface ChartsProps {
  type: 'bar' | 'line' | 'pie'
  data?: DashboardStats | null
  lineData?: { date: string; paginas: number }[]
  loading?: boolean
}

const ONYX_COLORS = {
  blue: '#3b82f6',
  cyan: '#06b6d4',
  green: '#10b981',
  yellow: '#f59e0b',
  red: '#ef4444',
  purple: '#8b5cf6',
  pink: '#ec4899',
}

const PIE_COLORS = [
  ONYX_COLORS.blue,
  ONYX_COLORS.green,
  ONYX_COLORS.yellow,
  ONYX_COLORS.red,
  ONYX_COLORS.purple,
  ONYX_COLORS.cyan,
  ONYX_COLORS.pink,
]

const customTooltipStyle = {
  backgroundColor: '#18181b',
  border: '1px solid #3f3f46',
  borderRadius: '8px',
  padding: '12px',
  color: '#f4f4f5',
  fontSize: '13px',
}

function ChartSkeleton({ height = 300 }: { height?: number }) {
  return (
    <div className="card animate-pulse">
      <div className="h-5 bg-onyx-700 rounded w-40 mb-6" />
      <div
        className="bg-onyx-700/50 rounded-lg flex items-end justify-around px-4 pb-4"
        style={{ height }}
      >
        {[40, 65, 50, 80, 35, 70, 55].map((h, i) => (
          <div
            key={i}
            className="bg-onyx-600 rounded-t"
            style={{ width: '10%', height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  )
}

export default function Charts({ type, data, lineData, loading }: ChartsProps) {
  if (loading) return <ChartSkeleton />

  if (type === 'bar' && data?.clientes_maior_volume) {
    const chartData = data.clientes_maior_volume.map((c) => ({
      cliente: c.cliente.length > 12 ? c.cliente.slice(0, 12) + '...' : c.cliente,
      paginas: c.paginas,
      fullName: c.cliente,
    }))

    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-white mb-4">
          Páginas por Cliente
        </h3>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="cliente"
              tick={{ fill: '#a1a1aa', fontSize: 12 }}
              axisLine={{ stroke: '#3f3f46' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#a1a1aa', fontSize: 12 }}
              axisLine={{ stroke: '#3f3f46' }}
              tickLine={false}
            />
            <Tooltip
              contentStyle={customTooltipStyle}
              formatter={(value: number, _name: string, props: { payload?: { fullName?: string } }) => [
                value.toLocaleString('pt-BR') + ' páginas',
                props.payload?.fullName || 'Cliente',
              ]}
              cursor={{ fill: 'rgba(59,130,246,0.08)' }}
            />
            <Legend
              wrapperStyle={{ color: '#a1a1aa', fontSize: 12 }}
            />
            <Bar
              dataKey="paginas"
              name="Páginas"
              fill={ONYX_COLORS.blue}
              radius={[4, 4, 0, 0]}
              maxBarSize={48}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }

  if (type === 'line' && lineData) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-white mb-4">
          Tendência de Coleta (7 dias)
        </h3>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={lineData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#a1a1aa', fontSize: 12 }}
              axisLine={{ stroke: '#3f3f46' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#a1a1aa', fontSize: 12 }}
              axisLine={{ stroke: '#3f3f46' }}
              tickLine={false}
            />
            <Tooltip
              contentStyle={customTooltipStyle}
              formatter={(value: number) => [
                value.toLocaleString('pt-BR') + ' páginas',
                'Páginas Coletadas',
              ]}
            />
            <Legend wrapperStyle={{ color: '#a1a1aa', fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="paginas"
              name="Páginas Coletadas"
              stroke={ONYX_COLORS.cyan}
              strokeWidth={2.5}
              dot={{ fill: ONYX_COLORS.cyan, r: 4, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: ONYX_COLORS.cyan, stroke: '#09090b', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    )
  }

  if (type === 'pie') {
    const pieData = [
      { name: 'Preto', value: 35 },
      { name: 'Ciano', value: 25 },
      { name: 'Magenta', value: 20 },
      { name: 'Amarelo', value: 20 },
    ]

    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-white mb-4">
          Distribuição de Toner
        </h3>
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={3}
              dataKey="value"
              nameKey="name"
              label={({ name, percent }) =>
                `${name} ${(percent * 100).toFixed(0)}%`
              }
              labelLine={{ stroke: '#71717a' }}
            >
              {pieData.map((_entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={PIE_COLORS[index % PIE_COLORS.length]}
                  stroke="#18181b"
                  strokeWidth={2}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={customTooltipStyle}
              formatter={(value: number) => [value + '%', 'Distribuição']}
            />
            <Legend wrapperStyle={{ color: '#a1a1aa', fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    )
  }

  return null
}
