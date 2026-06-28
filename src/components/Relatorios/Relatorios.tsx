import { useState, useEffect, useMemo } from 'react'
import type { Equipamento, Leitura, RelatorioMensal } from '../../types'
import * as api from '../../services/api'
import { formatNumber, downloadFile } from '../../utils/helpers'
import Loading from '../shared/Loading'
import Badge from '../shared/Badge'
import EmptyState from '../shared/EmptyState'

type Tab = 'mensal' | 'equipamento' | 'consumo' | 'exportar'

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function getCurrentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function getMonthOptions() {
  const options: string[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    options.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return options
}

function formatMonthLabel(value: string) {
  const [year, month] = value.split('-')
  return `${MONTHS[parseInt(month) - 1]} ${year}`
}

function BarChart({ data, maxVal }: { data: { label: string; value: number; color: string }[]; maxVal: number }) {
  return (
    <div className="space-y-3">
      {data.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <span className="text-xs text-gray-400 w-24 text-right shrink-0">{item.label}</span>
          <div className="flex-1 h-6 bg-onyx-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${maxVal > 0 ? (item.value / maxVal) * 100 : 0}%`,
                backgroundColor: item.color,
              }}
            />
          </div>
          <span className="text-xs text-gray-300 w-20 text-right shrink-0">{formatNumber(item.value)}</span>
        </div>
      ))}
    </div>
  )
}

function MensalTab() {
  const [mes, setMes] = useState(getCurrentMonth())
  const [data, setData] = useState<RelatorioMensal[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadReport()
  }, [mes])

  const loadReport = async () => {
    setLoading(true)
    try {
      const result = await api.getRelatorioConsumo(`${mes}-01`, `${mes}-28`)
      setData(result)
    } catch {
      setData([])
    } finally {
      setLoading(false)
    }
  }

  const totals = useMemo(() => {
    return data.reduce(
      (acc, r) => ({
        equipamentos: acc.equipamentos + r.total_equipamentos,
        paginas: acc.paginas + r.total_paginas,
        tonerPreto: acc.tonerPreto + r.toner_preto_consumido,
        tonerCiano: acc.tonerCiano + r.toner_ciano_consumido,
        tonerMagenta: acc.tonerMagenta + r.toner_magenta_consumido,
        tonerAmarelo: acc.tonerAmarelo + r.toner_amarelo_consumido,
      }),
      { equipamentos: 0, paginas: 0, tonerPreto: 0, tonerCiano: 0, tonerMagenta: 0, tonerAmarelo: 0 }
    )
  }, [data])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-400">Mês/Ano:</label>
        <select
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className="bg-onyx-800 border border-onyx-700/50 text-gray-200 text-sm rounded-lg px-3 py-2 focus:ring-accent-blue focus:border-accent-blue"
        >
          {getMonthOptions().map((m) => (
            <option key={m} value={m}>{formatMonthLabel(m)}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <Loading />
      ) : data.length === 0 ? (
        <EmptyState icon="📋" title="Sem dados para este período" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-onyx-700/50">
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Cliente</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Equipamentos</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Total Páginas</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Média/Eq.</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Toner Preto</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Ciano</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Magenta</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Amarelo</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i} className="border-b border-onyx-800/50 hover:bg-onyx-800/30">
                  <td className="py-3 px-4 text-gray-200 font-medium">{r.cliente}</td>
                  <td className="py-3 px-4 text-right text-gray-300">{r.total_equipamentos}</td>
                  <td className="py-3 px-4 text-right text-gray-300">{formatNumber(r.total_paginas)}</td>
                  <td className="py-3 px-4 text-right text-gray-300">{formatNumber(r.media_por_equipamento)}</td>
                  <td className="py-3 px-4 text-right text-gray-300">{formatNumber(r.toner_preto_consumido)}</td>
                  <td className="py-3 px-4 text-right text-gray-300">{formatNumber(r.toner_ciano_consumido)}</td>
                  <td className="py-3 px-4 text-right text-gray-300">{formatNumber(r.toner_magenta_consumido)}</td>
                  <td className="py-3 px-4 text-right text-gray-300">{formatNumber(r.toner_amarelo_consumido)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-onyx-700/50 bg-onyx-800/20">
                <td className="py-3 px-4 text-gray-200 font-bold">Total</td>
                <td className="py-3 px-4 text-right text-gray-200 font-bold">{totals.equipamentos}</td>
                <td className="py-3 px-4 text-right text-gray-200 font-bold">{formatNumber(totals.paginas)}</td>
                <td className="py-3 px-4 text-right text-gray-200 font-bold">
                  {totals.equipamentos > 0 ? formatNumber(Math.round(totals.paginas / totals.equipamentos)) : '-'}
                </td>
                <td className="py-3 px-4 text-right text-gray-200 font-bold">{formatNumber(totals.tonerPreto)}</td>
                <td className="py-3 px-4 text-right text-gray-200 font-bold">{formatNumber(totals.tonerCiano)}</td>
                <td className="py-3 px-4 text-right text-gray-200 font-bold">{formatNumber(totals.tonerMagenta)}</td>
                <td className="py-3 px-4 text-right text-gray-200 font-bold">{formatNumber(totals.tonerAmarelo)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

function EquipamentoTab() {
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([])
  const [selectedId, setSelectedId] = useState<number>(0)
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d.toISOString().split('T')[0]
  })
  const [dataFim, setDataFim] = useState(() => new Date().toISOString().split('T')[0])
  const [leituras, setLeituras] = useState<Leitura[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.getEquipamentos({ page: 1, per_page: 1000 }).then((res) => setEquipamentos(res.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (selectedId) loadLeituras()
  }, [selectedId, dataInicio, dataFim])

  const loadLeituras = async () => {
    setLoading(true)
    try {
      const result = await api.getLeituras({
        equipamento_id: selectedId,
        data_inicio: dataInicio,
        data_fim: dataFim,
      })
      setLeituras(result.data)
    } catch {
      setLeituras([])
    } finally {
      setLoading(false)
    }
  }

  const chartData = useMemo(() => {
    return leituras.map((l) => ({
      label: new Date(l.data_leitura).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      value: l.contador_total,
    }))
  }, [leituras])

  const maxCounter = useMemo(() => Math.max(...chartData.map((d) => d.value), 1), [chartData])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(Number(e.target.value))}
          className="bg-onyx-800 border border-onyx-700/50 text-gray-200 text-sm rounded-lg px-3 py-2 focus:ring-accent-blue focus:border-accent-blue"
        >
          <option value={0}>Selecionar equipamento</option>
          {equipamentos.map((eq) => (
            <option key={eq.id} value={eq.id}>{eq.modelo} - {eq.ip}</option>
          ))}
        </select>
        <input
          type="date"
          value={dataInicio}
          onChange={(e) => setDataInicio(e.target.value)}
          className="bg-onyx-800 border border-onyx-700/50 text-gray-200 text-sm rounded-lg px-3 py-2 focus:ring-accent-blue focus:border-accent-blue"
        />
        <span className="text-gray-500">até</span>
        <input
          type="date"
          value={dataFim}
          onChange={(e) => setDataFim(e.target.value)}
          className="bg-onyx-800 border border-onyx-700/50 text-gray-200 text-sm rounded-lg px-3 py-2 focus:ring-accent-blue focus:border-accent-blue"
        />
      </div>

      {!selectedId ? (
        <EmptyState icon="🖨️" title="Selecione um equipamento" description="Escolha um equipamento para ver o histórico de leituras." />
      ) : loading ? (
        <Loading />
      ) : leituras.length === 0 ? (
        <EmptyState icon="📊" title="Sem dados para este período" />
      ) : (
        <>
          <div className="bg-onyx-800/40 border border-onyx-700/30 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-gray-300 mb-3">Páginas ao longo do tempo</h4>
            {chartData.length > 0 && (
              <div className="space-y-2">
                {chartData.slice(-15).map((d, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-16 text-right shrink-0">{d.label}</span>
                    <div className="flex-1 h-4 bg-onyx-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent-blue rounded-full transition-all duration-500"
                        style={{ width: `${(d.value / maxCounter) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-300 w-20 text-right shrink-0">{formatNumber(d.value)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-onyx-700/50">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Data</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Total</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase">P&B</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Cor</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {leituras.map((l) => (
                  <tr key={l.id} className="border-b border-onyx-800/50 hover:bg-onyx-800/30">
                    <td className="py-3 px-4 text-gray-300">
                      {new Date(l.data_leitura).toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-200 font-medium">{formatNumber(l.contador_total)}</td>
                    <td className="py-3 px-4 text-right text-gray-300">{formatNumber(l.contador_pb)}</td>
                    <td className="py-3 px-4 text-right text-gray-300">{formatNumber(l.contador_cor)}</td>
                    <td className="py-3 px-4 text-center">
                      <Badge variant={l.status_online ? 'success' : 'danger'}>
                        {l.status_online ? 'Online' : 'Offline'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function ConsumoTab() {
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d.toISOString().split('T')[0]
  })
  const [dataFim, setDataFim] = useState(() => new Date().toISOString().split('T')[0])
  const [data, setData] = useState<RelatorioMensal[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadConsumo()
  }, [dataInicio, dataFim])

  const loadConsumo = async () => {
    setLoading(true)
    try {
      const result = await api.getRelatorioConsumo(dataInicio, dataFim)
      setData(result)
    } catch {
      setData([])
    } finally {
      setLoading(false)
    }
  }

  const tonerTotals = useMemo(() => {
    return data.reduce(
      (acc, r) => ({
        preto: acc.preto + r.toner_preto_consumido,
        ciano: acc.ciano + r.toner_ciano_consumido,
        magenta: acc.magenta + r.toner_magenta_consumido,
        amarelo: acc.amarelo + r.toner_amarelo_consumido,
      }),
      { preto: 0, ciano: 0, magenta: 0, amarelo: 0 }
    )
  }, [data])

  const maxToner = useMemo(() => Math.max(tonerTotals.preto, tonerTotals.ciano, tonerTotals.magenta, tonerTotals.amarelo, 1), [tonerTotals])

  const topEquipment = useMemo(() => {
    return [...data]
      .sort((a, b) => b.total_paginas - a.total_paginas)
      .slice(0, 10)
  }, [data])

  const maxPages = useMemo(() => Math.max(...topEquipment.map((r) => r.total_paginas), 1), [topEquipment])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <input
          type="date"
          value={dataInicio}
          onChange={(e) => setDataInicio(e.target.value)}
          className="bg-onyx-800 border border-onyx-700/50 text-gray-200 text-sm rounded-lg px-3 py-2 focus:ring-accent-blue focus:border-accent-blue"
        />
        <span className="text-gray-500">até</span>
        <input
          type="date"
          value={dataFim}
          onChange={(e) => setDataFim(e.target.value)}
          className="bg-onyx-800 border border-onyx-700/50 text-gray-200 text-sm rounded-lg px-3 py-2 focus:ring-accent-blue focus:border-accent-blue"
        />
      </div>

      {loading ? (
        <Loading />
      ) : (
        <>
          <div className="bg-onyx-800/40 border border-onyx-700/30 rounded-xl p-5">
            <h4 className="text-sm font-semibold text-gray-300 mb-4">Consumo de Toner por Cor</h4>
            <BarChart
              data={[
                { label: 'Preto', value: tonerTotals.preto, color: '#1a1a1a' },
                { label: 'Ciano', value: tonerTotals.ciano, color: '#06b6d4' },
                { label: 'Magenta', value: tonerTotals.magenta, color: '#ec4899' },
                { label: 'Amarelo', value: tonerTotals.amarelo, color: '#facc15' },
              ]}
              maxVal={maxToner}
            />
          </div>

          <div className="bg-onyx-800/40 border border-onyx-700/30 rounded-xl p-5">
            <h4 className="text-sm font-semibold text-gray-300 mb-4">Top 10 - Maior Consumo</h4>
            {topEquipment.length === 0 ? (
              <EmptyState icon="📊" title="Sem dados de consumo" />
            ) : (
              <div className="space-y-2">
                {topEquipment.map((r, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-6 text-right shrink-0">{i + 1}.</span>
                    <span className="text-xs text-gray-300 w-40 truncate shrink-0">{r.cliente}</span>
                    <div className="flex-1 h-4 bg-onyx-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent-purple rounded-full transition-all duration-500"
                        style={{ width: `${(r.total_paginas / maxPages) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-300 w-20 text-right shrink-0">{formatNumber(r.total_paginas)} pág</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function ExportarTab() {
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d.toISOString().split('T')[0]
  })
  const [dataFim, setDataFim] = useState(() => new Date().toISOString().split('T')[0])
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null)
  const [exportParams, setExportParams] = useState({ cliente: '', tipo: 'mensal' })

  const handleExport = async (format: 'excel' | 'pdf') => {
    setExporting(format)
    try {
      const params: Record<string, string> = {
        data_inicio: dataInicio,
        data_fim: dataFim,
      }
      if (exportParams.cliente) params.cliente = exportParams.cliente
      if (exportParams.tipo) params.tipo = exportParams.tipo

      const blob = format === 'excel' ? await api.exportExcel(params) : await api.exportPdf(params)
      const ext = format === 'excel' ? 'xlsx' : 'pdf'
      downloadFile(blob, `relatorio_onyx_${dataInicio}_${dataFim}.${ext}`)
    } catch (err) {
      console.error('Erro ao exportar:', err)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-onyx-800/40 border border-onyx-700/30 rounded-xl p-5">
        <h4 className="text-sm font-semibold text-gray-300 mb-4">Filtros de Exportação</h4>
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Data Início</label>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="bg-onyx-800 border border-onyx-700/50 text-gray-200 text-sm rounded-lg px-3 py-2 focus:ring-accent-blue focus:border-accent-blue"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Data Fim</label>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="bg-onyx-800 border border-onyx-700/50 text-gray-200 text-sm rounded-lg px-3 py-2 focus:ring-accent-blue focus:border-accent-blue"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Cliente</label>
            <input
              type="text"
              placeholder="Todos"
              value={exportParams.cliente}
              onChange={(e) => setExportParams((p) => ({ ...p, cliente: e.target.value }))}
              className="bg-onyx-800 border border-onyx-700/50 text-gray-200 text-sm rounded-lg px-3 py-2 focus:ring-accent-blue focus:border-accent-blue w-48"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Tipo</label>
            <select
              value={exportParams.tipo}
              onChange={(e) => setExportParams((p) => ({ ...p, tipo: e.target.value }))}
              className="bg-onyx-800 border border-onyx-700/50 text-gray-200 text-sm rounded-lg px-3 py-2 focus:ring-accent-blue focus:border-accent-blue"
            >
              <option value="mensal">Mensal</option>
              <option value="equipamento">Por Equipamento</option>
              <option value="consumo">Consumo</option>
              <option value="completo">Completo</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-onyx-800/40 border border-onyx-700/30 rounded-xl p-5">
        <h4 className="text-sm font-semibold text-gray-300 mb-2">Preview</h4>
        <p className="text-xs text-gray-500 mb-4">
          Será exportado o relatório <span className="text-gray-300 font-medium">{exportParams.tipo}</span> do período{' '}
          <span className="text-gray-300 font-medium">{dataInicio}</span> até{' '}
          <span className="text-gray-300 font-medium">{dataFim}</span>
          {exportParams.cliente && (
            <> para o cliente <span className="text-gray-300 font-medium">{exportParams.cliente}</span></>
          )}.
        </p>

        <div className="flex items-center gap-4">
          <button
            onClick={() => handleExport('excel')}
            disabled={exporting !== null}
            className="flex items-center gap-3 px-6 py-4 bg-emerald-600/10 border border-emerald-600/30 rounded-xl hover:bg-emerald-600/20 transition-colors disabled:opacity-50 group"
          >
            <span className="text-2xl">📊</span>
            <div className="text-left">
              <p className="text-sm font-semibold text-emerald-400 group-hover:text-emerald-300">Exportar Excel</p>
              <p className="text-xs text-gray-500">Planilha .xlsx</p>
            </div>
            {exporting === 'excel' && (
              <span className="w-5 h-5 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin ml-2" />
            )}
          </button>

          <button
            onClick={() => handleExport('pdf')}
            disabled={exporting !== null}
            className="flex items-center gap-3 px-6 py-4 bg-red-600/10 border border-red-600/30 rounded-xl hover:bg-red-600/20 transition-colors disabled:opacity-50 group"
          >
            <span className="text-2xl">📄</span>
            <div className="text-left">
              <p className="text-sm font-semibold text-red-400 group-hover:text-red-300">Exportar PDF</p>
              <p className="text-xs text-gray-500">Documento .pdf</p>
            </div>
            {exporting === 'pdf' && (
              <span className="w-5 h-5 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin ml-2" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Relatorios() {
  const [activeTab, setActiveTab] = useState<Tab>('mensal')

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'mensal', label: 'Mensal', icon: '📅' },
    { key: 'equipamento', label: 'Por Equipamento', icon: '🖨️' },
    { key: 'consumo', label: 'Consumo', icon: '📈' },
    { key: 'exportar', label: 'Exportar', icon: '💾' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-1 bg-onyx-800/60 border border-onyx-700/40 rounded-xl p-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${
              activeTab === tab.key
                ? 'bg-accent-blue text-white shadow-glow-blue'
                : 'text-gray-400 hover:text-gray-200 hover:bg-onyx-700/30'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-onyx-800/30 border border-onyx-700/30 rounded-xl p-5">
        {activeTab === 'mensal' && <MensalTab />}
        {activeTab === 'equipamento' && <EquipamentoTab />}
        {activeTab === 'consumo' && <ConsumoTab />}
        {activeTab === 'exportar' && <ExportarTab />}
      </div>
    </div>
  )
}
