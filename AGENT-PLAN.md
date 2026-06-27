# Plano de Implementação: Onyx Agent

## Visão Geral

O Onyx Agent é um aplicativo local (Windows Service) que roda na rede do cliente, coleta dados das impressoras via SNMP e envia para o Onyx Monitor na nuvem.

---

## Arquitetura

```
[Rede do Cliente]
    |
    Onyx Agent (Windows Service / Docker)
    ├── Descoberta de impressoras (SNMP broadcast)
    ├── Coleta de dados (SNMP queries)
    ├── Agendamento local (cron)
    └── Envio para nuvem (HTTPS)
    |
    ↓
[Onyx Cloud - Render.com]
    ├── API REST (Express)
    ├── PostgreSQL (Supabase)
    └── Dashboard Web (React + Vercel)
```

---

## Fase 1: Backend - Tabelas e API para Agents

### 1.1 Nova tabela `agents` no banco

```sql
CREATE TABLE IF NOT EXISTS agents (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  company_id TEXT NOT NULL,
  location TEXT,
  ip_address TEXT,
  api_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','offline')),
  version TEXT,
  last_heartbeat TEXT,
  config JSONB DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')::text,
  updated_at TEXT NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')::text
);

CREATE TABLE IF NOT EXISTS agent_logs (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info' CHECK(level IN ('info','warning','error')),
  message TEXT NOT NULL,
  details JSONB,
  created_at TEXT NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')::text
);

CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_company ON agents(company_id);
CREATE INDEX IF NOT EXISTS idx_agent_logs_agent ON agent_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_logs_created ON agent_logs(created_at);
```

### 1.2 Modificar tabela `equipamentos`

```sql
ALTER TABLE equipamentos ADD COLUMN IF NOT EXISTS agent_id INTEGER REFERENCES agents(id);
ALTER TABLE equipamentos ADD COLUMN IF NOT EXISTS agent_config JSONB DEFAULT '{}';
```

### 1.3 Novas rotas da API: `server/routes/agents.ts`

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/api/agents/register` | API Key | Registro do agent |
| POST | `/api/agents/:id/heartbeat` | Agent Token | Heartbeat do agent |
| GET | `/api/agents/:id/config` | Agent Token | Configuração do agent (equipamentos atribuídos) |
| POST | `/api/agents/:id/collect` | Agent Token | Receber dados coletados em lote |
| POST | `/api/agents/:id/logs` | Agent Token | Enviar logs do agent |
| GET | `/api/agents` | JWT Admin | Listar todos os agents |
| GET | `/api/agents/:id` | JWT Admin | Detalhes do agent |
| PUT | `/api/agents/:id` | JWT Admin | Atualizar agent |
| DELETE | `/api/agents/:id` | JWT Admin | Remover agent |
| POST | `/api/agents/:id/assign` | JWT Admin | Atribuir equipamento ao agent |
| POST | `/api/agents/:id/unassign` | JWT Admin | Remover equipamento do agent |

### 1.4 Payload de coleta do agent

```typescript
interface AgentCollectPayload {
  agent_id: number;
  timestamp: string;
  equipamentos: Array<{
    ip: string;
    nome: string;
    numero_serie: string;
    modelo: string;
    status_online: boolean;
    contadores: {
      total: number;
      pb: number;
      cor: number;
    };
    toner: {
      preto: number;
      ciano: number;
      magenta: number;
      amarelo: number;
    };
    suprimentos: Array<{
      tipo: string;
      percentual: number;
    }>;
    mensagens_erro: string;
  }>;
}
```

---

## Fase 2: Aplicação do Agent

### 2.1 Estrutura do projeto `agent/`

```
agent/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Entry point
│   ├── config.ts             # Configuração do agent
│   ├── snmp/
│   │   ├── oids.ts           # OIDs SNMP
│   │   ├── collector.ts      # Coleta de dados
│   │   └── discovery.ts      # Descoberta automática
│   ├── scheduler/
│   │   └── scheduler.ts      # Agendamento local
│   ├── api/
│   │   ├── client.ts         # HTTP client para o servidor
│   │   └── auth.ts           # Autenticação
│   ├── updater/
│   │   └── updater.ts        # Auto-atualização
│   └── ui/
│       └── server.ts         # Interface web local (porta 8080)
├── electron/                 # (Opcional) Interface desktop
│   └── main.ts
└── dist/                     # Build output
```

### 2.2 Funcionalidades do Agent

#### Descoberta Automática
- Envia SNMP broadcast na rede local
- Lista todos os dispositivos que respondem
- Identifica impressoras pelos OIDs padrão
- Permite selecionar quais monitorar

#### Coleta de Dados
- Coleta contadores (total, P&B, cor)
- Coleta níveis de toner
- Coleta status online/offline
- Coleta mensagens de erro
- Coleta número de série e modelo

#### Agendamento
- 5 minutos
- 15 minutos
- 30 minutos
- 1 hora

#### Comunicação com o Servidor
- HTTPS obrigatório
- Token de autenticação por agent
- Envio em lote (batch)
- Retry com backoff exponencial
- Cache local quando offline

#### Auto-atualização
- Verifica versão no servidor
- Baixa atualização automaticamente
- Reinicia o serviço após atualização

#### Interface Local (http://localhost:8080)
- Status do serviço
- Última sincronização
- Impressoras encontradas
- Equipamentos monitorados
- Teste de conexão
- Logs em tempo real

---

## Fase 3: Frontend - Gestão de Agents

### 3.1 Nova página: `/agents`

Componentes:
- `ListaAgents.tsx` - Tabela de agents com status
- `DetalhesAgent.tsx` - Detalhes do agent, equipamentos atribuídos, logs
- `FormAgent.tsx` - Formulário de criação/edição
- `AgentStats.tsx` - Cards de estatísticas

### 3.2 Modificações existentes

- `FormEquipamento.tsx` - Adicionar dropdown de seleção do agent
- `Dashboard.tsx` - Mostrar status dos agents
- `Layout.tsx` - Adicionar item de menu "Agents"

### 3.3 Novas funções em `api.ts`

```typescript
// Agents
export async function getAgents(): Promise<Agent[]>
export async function getAgent(id: number): Promise<Agent>
export async function createAgent(agent: Partial<Agent>): Promise<Agent>
export async function updateAgent(id: number, agent: Partial<Agent>): Promise<Agent>
export async function deleteAgent(id: number): Promise<void>
export async function assignEquipmentToAgent(agentId: number, equipamentoId: number): Promise<void>
export async function unassignEquipmentFromAgent(agentId: number, equipamentoId: number): Promise<void>
export async function getAgentLogs(agentId: number): Promise<AgentLog[]>
```

---

## Fase 4: Segurança

### 4.1 Autenticação do Agent

- Cada agent recebe um `api_key` único no registro
- O agent envia `Authorization: Bearer <api_key>` em todas as requisições
- O servidor valida o token e verifica o status do agent

### 4.2 Validação de Dados

- O servidor verifica se o agent tem permissão para enviar dados dos equipamentos atribuídos
- Validação de schema dos dados recebidos
- Rate limiting por agent

### 4.3 Logs de Auditoria

- Registro de todas as ações dos agents
- Alertas para atividades suspeitas
- Rotação automática de chaves

---

## Fase 5: Deploy e Distribuição

### 5.1 Build do Agent

```bash
# Windows
npm run build:agent:win

# macOS
npm run build:agent:mac

# Linux
npm run build:agent:linux

# Docker
docker build -f Dockerfile.agent -t onyx-agent .
```

### 5.2 Distribuição

- Installer NSIS para Windows
- Pacote DMG para macOS
- Pacote DEB/RPM para Linux
- Imagem Docker

### 5.3 Auto-atualização

- Endpoint no servidor: `GET /api/agents/version`
- Endpoint para download: `GET /api/agents/download/:platform`
- Verificação a cada 1 hora

---

## Prioridade de Implementação

| Fase | Descrição | Esforço |
|------|-----------|---------|
| 1 | Backend - Tabelas e API | 2-3 dias |
| 2 | Agent - Coleta SNMP | 3-4 dias |
| 3 | Agent - Comunicação com servidor | 2-3 dias |
| 4 | Agent - Interface local | 2-3 dias |
| 5 | Frontend - Gestão de Agents | 2-3 dias |
| 6 | Agent - Auto-atualização | 1-2 dias |
| 7 | Segurança e testes | 2-3 dias |
| 8 | Build e distribuição | 1-2 dias |
| **Total** | | **15-23 dias** |

---

## Arquivos a Criar/Modificar

### Criar
- `agent/package.json`
- `agent/tsconfig.json`
- `agent/src/index.ts`
- `agent/src/config.ts`
- `agent/src/snmp/oids.ts`
- `agent/src/snmp/collector.ts`
- `agent/src/snmp/discovery.ts`
- `agent/src/scheduler/scheduler.ts`
- `agent/src/api/client.ts`
- `agent/src/api/auth.ts`
- `agent/src/updater/updater.ts`
- `agent/src/ui/server.ts`
- `server/routes/agents.ts`
- `src/components/Agents/ListaAgents.tsx`
- `src/components/Agents/DetalhesAgent.tsx`
- `src/components/Agents/FormAgent.tsx`

### Modificar
- `server/database.ts` - Adicionar tabelas agents e agent_logs
- `server/index.ts` - Registrar rotas de agents
- `src/App.tsx` - Adicionar rotas de agents
- `src/services/api.ts` - Adicionar funções de agents
- `src/components/Layout.tsx` - Adicionar menu de agents
- `src/components/Equipamentos/FormEquipamento.tsx` - Adicionar seleção de agent
- `src/types/index.ts` - Adicionar tipos de agents
- `supabase-migration.sql` - Adicionar tabelas

---

## Exemplo de Uso

### 1. Admin cria o agent no painel

```
Painel → Agents → Novo Agent
  Nome: "Agent Filial SP"
  Empresa: "Empresa X"
  Localização: "São Paulo - Filial"
→ Gerar API Key
→ Copiar chave
```

### 2. Instalação no cliente

```bash
# Download do installer
# Instalação
onyx-agent install

# Configuração
onyx-agent config --server https://onyx-monitor-api.onrender.com --key SUA_API_KEY

# Iniciar serviço
onyx-agent start
```

### 3. O agent automaticamente

1. Registra-se no servidor
2. Descobre impressoras na rede
3. Envia lista para o servidor
4. Administrador atribui impressoras ao agent
5. Agent coleta dados no intervalo configurado
6. Envia dados para o servidor
7. Dashboard mostra dados em tempo real
