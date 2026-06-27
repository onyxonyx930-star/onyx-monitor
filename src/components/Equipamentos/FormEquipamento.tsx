import { useState, useEffect } from 'react'
import { X, Save, Loader2, AlertCircle } from 'lucide-react'
import type { Equipamento } from '../../types'
import { createEquipamento, updateEquipamento } from '../../services/api'

interface FormEquipamentoProps {
  equipamento?: Equipamento | null
  onClose: () => void
  onSuccess: () => void
}

interface FormData {
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
}

interface FormErrors {
  [key: string]: string
}

const initialForm: FormData = {
  cliente: '',
  unidade: '',
  ip: '',
  comunidade_snmp: 'public',
  fabricante: '',
  modelo: '',
  numero_serie: '',
  localizacao: '',
  contrato: '',
  status_monitoramento: 'ativo',
}

export default function FormEquipamento({
  equipamento,
  onClose,
  onSuccess,
}: FormEquipamentoProps) {
  const [form, setForm] = useState<FormData>(initialForm)
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const isEditing = !!equipamento

  useEffect(() => {
    if (equipamento) {
      setForm({
        cliente: equipamento.cliente,
        unidade: equipamento.unidade,
        ip: equipamento.ip,
        comunidade_snmp: equipamento.comunidade_snmp,
        fabricante: equipamento.fabricante,
        modelo: equipamento.modelo,
        numero_serie: equipamento.numero_serie,
        localizacao: equipamento.localizacao,
        contrato: equipamento.contrato,
        status_monitoramento: equipamento.status_monitoramento,
      })
    }
  }, [equipamento])

  function validate(): boolean {
    const newErrors: FormErrors = {}

    if (!form.cliente.trim()) newErrors.cliente = 'Cliente é obrigatório'
    if (!form.unidade.trim()) newErrors.unidade = 'Unidade é obrigatória'
    if (!form.ip.trim()) {
      newErrors.ip = 'IP é obrigatório'
    } else if (
      !/^(\d{1,3}\.){3}\d{1,3}$/.test(form.ip)
    ) {
      newErrors.ip = 'IP inválido (ex: 192.168.1.100)'
    }
    if (!form.comunidade_snmp.trim())
      newErrors.comunidade_snmp = 'Comunidade SNMP é obrigatória'
    if (!form.fabricante.trim())
      newErrors.fabricante = 'Fabricante é obrigatório'
    if (!form.modelo.trim()) newErrors.modelo = 'Modelo é obrigatório'
    if (!form.numero_serie.trim())
      newErrors.numero_serie = 'Número de série é obrigatório'

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[name]
        return next
      })
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)

    if (!validate()) return

    try {
      setSubmitting(true)
      if (isEditing && equipamento) {
        await updateEquipamento(equipamento.id, form)
      } else {
        await createEquipamento(form)
      }
      onSuccess()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao salvar equipamento'
      setSubmitError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-onyx-800 border border-onyx-700/50 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col animate-slide-up">
        <div className="flex items-center justify-between px-6 py-4 border-b border-onyx-700/50">
          <h2 className="text-lg font-semibold text-white">
            {isEditing ? 'Editar Equipamento' : 'Novo Equipamento'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-onyx-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-6">
          {submitError && (
            <div className="mb-4 p-3 rounded-lg bg-accent-red/10 border border-accent-red/20 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-accent-red flex-shrink-0" />
              <p className="text-sm text-accent-red">{submitError}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label="Cliente *"
              name="cliente"
              value={form.cliente}
              onChange={handleChange}
              error={errors.cliente}
              placeholder="Nome do cliente"
            />
            <Field
              label="Unidade *"
              name="unidade"
              value={form.unidade}
              onChange={handleChange}
              error={errors.unidade}
              placeholder="Unidade/Filial"
            />
            <Field
              label="IP *"
              name="ip"
              value={form.ip}
              onChange={handleChange}
              error={errors.ip}
              placeholder="192.168.1.100"
              type="text"
            />
            <Field
              label="Comunidade SNMP *"
              name="comunidade_snmp"
              value={form.comunidade_snmp}
              onChange={handleChange}
              error={errors.comunidade_snmp}
              placeholder="public"
            />
            <Field
              label="Fabricante *"
              name="fabricante"
              value={form.fabricante}
              onChange={handleChange}
              error={errors.fabricante}
              placeholder="HP, Canon, Epson..."
            />
            <Field
              label="Modelo *"
              name="modelo"
              value={form.modelo}
              onChange={handleChange}
              error={errors.modelo}
              placeholder="Modelo do equipamento"
            />
            <Field
              label="Número de Série *"
              name="numero_serie"
              value={form.numero_serie}
              onChange={handleChange}
              error={errors.numero_serie}
              placeholder="Número de série"
            />
            <Field
              label="Localização"
              name="localizacao"
              value={form.localizacao}
              onChange={handleChange}
              placeholder="Sala, andar, prédio..."
            />
            <Field
              label="Contrato"
              name="contrato"
              value={form.contrato}
              onChange={handleChange}
              placeholder="Nº do contrato"
            />
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-300">
                Status
              </label>
              <select
                name="status_monitoramento"
                value={form.status_monitoramento}
                onChange={handleChange}
                className="select-field w-full"
              >
                <option value="ativo">Ativo (Online)</option>
                <option value="inativo">Inativo (Offline)</option>
                <option value="manutencao">Manutenção</option>
              </select>
            </div>
          </div>
        </form>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-onyx-700/50">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            className="btn-primary"
            disabled={submitting}
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {isEditing ? 'Salvar Alterações' : 'Cadastrar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  name,
  value,
  onChange,
  error,
  placeholder,
  type = 'text',
}: {
  label: string
  name: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  error?: string
  placeholder?: string
  type?: string
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-300">{label}</label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`input-field w-full ${error ? 'border-accent-red/50 focus:ring-accent-red/50' : ''}`}
      />
      {error && <p className="text-xs text-accent-red">{error}</p>}
    </div>
  )
}
