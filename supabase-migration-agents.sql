-- =====================================================
-- Onyx Agent - Migration para tabelas de agents
-- Execute este script no SQL Editor do Supabase
-- =====================================================

-- Tabela de agents
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

-- Tabela de logs do agent
CREATE TABLE IF NOT EXISTS agent_logs (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info' CHECK(level IN ('info','warning','error')),
  message TEXT NOT NULL,
  details JSONB,
  created_at TEXT NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')::text
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_company ON agents(company_id);
CREATE INDEX IF NOT EXISTS idx_agents_api_key ON agents(api_key);
CREATE INDEX IF NOT EXISTS idx_agent_logs_agent ON agent_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_logs_created ON agent_logs(created_at);

-- Adicionar coluna agent_id na tabela equipamentos
ALTER TABLE equipamentos ADD COLUMN IF NOT EXISTS agent_id INTEGER REFERENCES agents(id);
ALTER TABLE equipamentos ADD COLUMN IF NOT EXISTS agent_config JSONB DEFAULT '{}';
