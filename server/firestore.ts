import { getAdminDb, FieldValue, Timestamp } from './firebase-admin.ts';
import { QueryDocumentSnapshot, DocumentData } from 'firebase-admin/firestore';

const db = () => getAdminDb();

export function toDoc<T extends { id?: string }>(doc: QueryDocumentSnapshot<DocumentData>): T {
  return { id: doc.id, ...doc.data() } as T;
}

export function toDocData<T extends { id?: string }>(doc: QueryDocumentSnapshot<DocumentData> | null): T | null {
  if (!doc || !doc.exists) return null;
  return { id: doc.id, ...doc.data() } as T;
}

export interface Usuario {
  id?: string;
  nome: string;
  email: string;
  role: 'admin' | 'operador' | 'cliente';
  clienteId?: string;
  ativo: boolean;
  createdAt: Timestamp;
}

export interface Agent {
  id?: string;
  name: string;
  companyId: string;
  location?: string;
  ipAddress?: string;
  apiKey: string;
  status: 'active' | 'inactive' | 'offline';
  version?: string;
  lastHeartbeat?: Timestamp;
  config: Record<string, any>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Equipamento {
  id?: string;
  cliente: string;
  unidade?: string;
  ip: string;
  comunidadeSnmp: string;
  fabricante?: string;
  modelo?: string;
  numeroSerie?: string;
  localizacao?: string;
  contrato?: string;
  statusMonitoramento: 'ativo' | 'inativo' | 'manutencao';
  agentId?: string;
  agentConfig?: Record<string, any>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Leitura {
  id?: string;
  equipamentoId: string;
  dataLeitura: string;
  contadorTotal: number;
  contadorPb: number;
  contadorCor: number;
  tonerPreto: number;
  tonerCiano: number;
  tonerMagenta: number;
  tonerAmarelo: number;
  statusOnline: 0 | 1;
  mensagensErro?: string;
  numeroSerieEquip?: string;
  modeloEquip?: string;
  nomeEquip?: string;
  createdAt: Timestamp;
}

export interface Suprimento {
  id?: string;
  equipamentoId: string;
  tipo: 'preto' | 'ciano' | 'magenta' | 'amarelo' | 'waste' | 'drum' | 'fusor';
  percentual: number;
  ultimaLeitura?: string;
  previsaoTroca?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Alerta {
  id?: string;
  equipamentoId: string;
  tipo: 'toner_baixo' | 'toner_zerado' | 'offline' | 'erro_critico' | 'contador_nao_atualizado' | 'snmp_sem_resposta';
  mensagem: string;
  nivel: 'info' | 'warning' | 'critical';
  resolvido: 0 | 1;
  createdAt: Timestamp;
  resolvidoEm?: Timestamp;
}

export interface AuditoriaImpressao {
  id?: string;
  equipamentoId?: string;
  cliente?: string;
  usuario?: string;
  computador?: string;
  documento?: string;
  dataImpressao: string;
  horaImpressao: string;
  totalPaginas: number;
  colorida: 0 | 1;
  duplex: 0 | 1;
  tamanhoPapel: string;
  statusImpressao: 'concluida' | 'cancelada' | 'erro' | 'pendente';
  fonte: 'snmp' | 'spooler' | 'api' | 'manual' | 'agent';
  ipEquipamento?: string;
  numeroSerie?: string;
  modeloEquip?: string;
  dadosExtras: Record<string, any>;
  createdAt: Timestamp;
}

export interface AuditoriaConfig {
  id?: string;
  tipoIntegracao: 'snmp' | 'spooler' | 'api_fabricante' | 'accounting';
  equipamentoId?: string;
  config: Record<string, any>;
  ativo: 0 | 1;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ConfigColeta {
  id?: string;
  equipamentoId: string;
  intervalo: '1h' | '6h' | 'diario';
  ativo: 0 | 1;
  ultimaColeta?: string;
  proximaColeta?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AgentLog {
  id?: string;
  agentId: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  details?: Record<string, any>;
  createdAt: Timestamp;
}

const COLLECTIONS = {
  USUARIOS: 'usuarios',
  AGENTS: 'agents',
  EQUIPAMENTOS: 'equipamentos',
  LEITURAS: 'leituras',
  SUPRIMENTOS: 'suprimentos',
  ALERTAS: 'alertas',
  AUDITORIA_IMPRESSOES: 'auditoria_impressoes',
  AUDITORIA_CONFIG: 'auditoria_config',
  CONFIG_COLETA: 'config_coleta',
  AGENT_LOGS: 'agent_logs',
};

async function getCollection(name: string) {
  return getAdminDb().collection(name);
}

export async function createDoc<T extends { id?: string }>(collection: string, data: Omit<T, 'id'>): Promise<T> {
  const col = await getCollection(collection);
  const ref = col.doc();
  const now = Timestamp.now();
  const docData = { ...data, createdAt: now, updatedAt: now };
  await ref.set(docData);
  return { id: ref.id, ...docData } as T;
}

export async function getDoc<T>(collection: string, id: string): Promise<T | null> {
  const col = await getCollection(collection);
  const doc = await col.doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as T;
}

export async function updateDoc<T>(collection: string, id: string, data: Partial<T>): Promise<T> {
  const col = await getCollection(collection);
  const ref = col.doc(id);
  const now = Timestamp.now();
  await ref.update({ ...data, updatedAt: now });
  const updated = await ref.get();
  return { id: updated.id, ...updated.data() } as T;
}

export async function deleteDoc(collection: string, id: string): Promise<void> {
  const col = await getCollection(collection);
  await col.doc(id).delete();
}

interface Filter { field: string; op: FirebaseFirestore.WhereFilterOp; value: any; }
interface Order { field: string; direction: 'asc' | 'desc'; }

export async function queryDocs<T>(collection: string, options: {
  filters?: Filter[];
  orderBy?: Order;
  limit?: number;
  offset?: number;
} = {}): Promise<T[]> {
  const col = await getCollection(collection);
  let q: FirebaseFirestore.Query = col;

  if (options.filters) {
    for (const f of options.filters) {
      q = q.where(f.field, f.op, f.value);
    }
  }
  if (options.orderBy) {
    q = q.orderBy(options.orderBy.field, options.orderBy.direction);
  }
  if (options.limit) {
    q = q.limit(options.limit);
  }
  if (options.offset) {
    q = q.offset(options.offset);
  }

  const snapshot = await q.get();
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as T));
}

export async function countDocs(collection: string, filters: Array<{ field: string; op: FirebaseFirestore.WhereFilterOp; value: any }> = []): Promise<number> {
  const col = await getCollection(collection);
  let q: FirebaseFirestore.Query = col;
  for (const f of filters) {
    q = q.where(f.field, f.op, f.value);
  }
  const snapshot = await q.count().get();
  return snapshot.data().count;
}

export async function runTransaction<T>(updateFn: (transaction: FirebaseFirestore.Transaction) => Promise<T>): Promise<T> {
  return getAdminDb().runTransaction(updateFn);
}

export { FieldValue, Timestamp };
export { COLLECTIONS };