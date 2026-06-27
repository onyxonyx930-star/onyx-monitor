import { useState } from 'react'
import { createAuditoria } from '../../services/api'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

export default function FormAuditoria({ onClose, onSuccess }: Props) {
  const [form, setForm] = useState({
    usuario: '', computador: '', documento: '', cliente: '',
    total_paginas: 1, colorida: false, duplex: false,
    tamanho_papel: 'A4', status_impressao: 'concluida',
    fonte: 'manual', data_impressao: new Date().toISOString().split('T')[0],
    hora_impressao: new Date().toTimeString().slice(0, 8),
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await createAuditoria(form)
      onSuccess()
    } catch { alert('Erro ao salvar') }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-onyx-900 border border-onyx-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-onyx-700/50">
          <h2 className="text-xl font-bold text-white">Novo Registro de Impressão</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Usuário *</label>
              <input required className="w-full bg-onyx-800 border border-onyx-600 rounded-lg px-3 py-2 text-white text-sm" value={form.usuario} onChange={e => setForm({ ...form, usuario: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Computador</label>
              <input className="w-full bg-onyx-800 border border-onyx-600 rounded-lg px-3 py-2 text-white text-sm" value={form.computador} onChange={e => setForm({ ...form, computador: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Documento</label>
            <input className="w-full bg-onyx-800 border border-onyx-600 rounded-lg px-3 py-2 text-white text-sm" value={form.documento} onChange={e => setForm({ ...form, documento: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Cliente</label>
            <input className="w-full bg-onyx-800 border border-onyx-600 rounded-lg px-3 py-2 text-white text-sm" value={form.cliente} onChange={e => setForm({ ...form, cliente: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Páginas</label>
              <input type="number" min={1} className="w-full bg-onyx-800 border border-onyx-600 rounded-lg px-3 py-2 text-white text-sm" value={form.total_paginas} onChange={e => setForm({ ...form, total_paginas: parseInt(e.target.value) || 1 })} />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Data</label>
              <input type="date" className="w-full bg-onyx-800 border border-onyx-600 rounded-lg px-3 py-2 text-white text-sm" value={form.data_impressao} onChange={e => setForm({ ...form, data_impressao: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Hora</label>
              <input type="time" className="w-full bg-onyx-800 border border-onyx-600 rounded-lg px-3 py-2 text-white text-sm" value={form.hora_impressao} onChange={e => setForm({ ...form, hora_impressao: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Tamanho do Papel</label>
              <select className="w-full bg-onyx-800 border border-onyx-600 rounded-lg px-3 py-2 text-white text-sm" value={form.tamanho_papel} onChange={e => setForm({ ...form, tamanho_papel: e.target.value })}>
                <option value="A4">A4</option>
                <option value="A3">A3</option>
                <option value="Letter">Letter</option>
                <option value="Legal">Legal</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Status</label>
              <select className="w-full bg-onyx-800 border border-onyx-600 rounded-lg px-3 py-2 text-white text-sm" value={form.status_impressao} onChange={e => setForm({ ...form, status_impressao: e.target.value })}>
                <option value="concluida">Concluída</option>
                <option value="cancelada">Cancelada</option>
                <option value="erro">Erro</option>
                <option value="pendente">Pendente</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input type="checkbox" checked={form.colorida} onChange={e => setForm({ ...form, colorida: e.target.checked })} className="rounded border-gray-600" />
              Colorida
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input type="checkbox" checked={form.duplex} onChange={e => setForm({ ...form, duplex: e.target.checked })} className="rounded border-gray-600" />
              Duplex
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-onyx-700/50">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white transition">Cancelar</button>
            <button type="submit" disabled={saving} className="px-6 py-2 bg-accent-blue hover:bg-blue-600 text-white rounded-lg font-medium transition disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
