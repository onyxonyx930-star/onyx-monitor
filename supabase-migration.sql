-- =====================================================
-- Onyx Monitor - Script SQL para Supabase (PostgreSQL)
-- Execute este script no SQL Editor do Supabase
-- =====================================================

-- Tabela de equipamentos
CREATE TABLE IF NOT EXISTS equipamentos (
  id SERIAL PRIMARY KEY,
  cliente TEXT NOT NULL,
  unidade TEXT,
  ip TEXT NOT NULL,
  comunidade_snmp TEXT NOT NULL DEFAULT 'public',
  fabricante TEXT,
  modelo TEXT,
  numero_serie TEXT,
  localizacao TEXT,
  contrato TEXT,
  status_monitoramento TEXT NOT NULL DEFAULT 'ativo',
  created_at TEXT NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')::text,
  updated_at TEXT NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')::text
);

-- Tabela de leituras
CREATE TABLE IF NOT EXISTS leituras (
  id SERIAL PRIMARY KEY,
  equipamento_id INTEGER NOT NULL REFERENCES equipamentos(id) ON DELETE CASCADE,
  data_leitura TEXT NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')::text,
  contador_total INTEGER DEFAULT 0,
  contador_pb INTEGER DEFAULT 0,
  contador_cor INTEGER DEFAULT 0,
  toner_preto REAL DEFAULT 0,
  toner_ciano REAL DEFAULT 0,
  toner_magenta REAL DEFAULT 0,
  toner_amarelo REAL DEFAULT 0,
  status_online INTEGER DEFAULT 0,
  mensagens_erro TEXT,
  numero_serie_equip TEXT,
  modelo_equip TEXT,
  nome_equip TEXT,
  created_at TEXT NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')::text
);

-- Tabela de suprimentos
CREATE TABLE IF NOT EXISTS suprimentos (
  id SERIAL PRIMARY KEY,
  equipamento_id INTEGER NOT NULL REFERENCES equipamentos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK(tipo IN ('preto','ciano','magenta','amarelo','waste','drum','fusor')),
  percentual REAL DEFAULT 100,
  ultima_leitura TEXT DEFAULT (NOW() AT TIME ZONE 'UTC')::text,
  previsao_troca TEXT,
  created_at TEXT NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')::text,
  updated_at TEXT NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')::text
);

-- Tabela de alertas
CREATE TABLE IF NOT EXISTS alertas (
  id SERIAL PRIMARY KEY,
  equipamento_id INTEGER NOT NULL REFERENCES equipamentos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK(tipo IN ('toner_baixo','toner_zerado','offline','erro_critico','contador_nao_atualizado','snmp_sem_resposta')),
  mensagem TEXT NOT NULL,
  nivel TEXT NOT NULL DEFAULT 'info' CHECK(nivel IN ('info','warning','critical')),
  resolvido INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')::text,
  resolvido_em TEXT
);

-- Tabela de usuarios
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'cliente' CHECK(role IN ('admin','operador','cliente')),
  cliente_id INTEGER,
  ativo INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')::text
);

-- Tabela de configuração de coleta
CREATE TABLE IF NOT EXISTS config_coleta (
  id SERIAL PRIMARY KEY,
  equipamento_id INTEGER NOT NULL REFERENCES equipamentos(id) ON DELETE CASCADE,
  intervalo TEXT NOT NULL DEFAULT 'diario' CHECK(intervalo IN ('1h','6h','diario')),
  ativo INTEGER DEFAULT 1,
  ultima_coleta TEXT,
  proxima_coleta TEXT
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_leituras_equipamento ON leituras(equipamento_id);
CREATE INDEX IF NOT EXISTS idx_leituras_data ON leituras(data_leitura);
CREATE INDEX IF NOT EXISTS idx_alertas_equipamento ON alertas(equipamento_id);
CREATE INDEX IF NOT EXISTS idx_alertas_resolvido ON alertas(resolvido);
CREATE INDEX IF NOT EXISTS idx_suprimentos_equipamento ON suprimentos(equipamento_id);
CREATE INDEX IF NOT EXISTS idx_config_coleta_equipamento ON config_coleta(equipamento_id);

-- Usuário admin padrão (senha: admin123)
-- Hash SHA-256 de 'admin123': 240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9
INSERT INTO usuarios (nome, email, senha_hash, role, ativo)
SELECT 'Administrador', 'admin@onyx.com', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'admin', 1
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE email = 'admin@onyx.com');
