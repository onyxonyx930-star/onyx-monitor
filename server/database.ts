import { Pool } from 'pg';
import crypto from 'crypto';

let pool: Pool;

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export async function initDatabase(): Promise<Pool> {
  const connectionString = process.env.SUPABASE_URL || process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('SUPABASE_URL or DATABASE_URL environment variable is required');
  }

  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  const client = await pool.connect();
  try {
    await client.query(`
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

      CREATE TABLE IF NOT EXISTS config_coleta (
        id SERIAL PRIMARY KEY,
        equipamento_id INTEGER NOT NULL REFERENCES equipamentos(id) ON DELETE CASCADE,
        intervalo TEXT NOT NULL DEFAULT 'diario' CHECK(intervalo IN ('1h','6h','diario')),
        ativo INTEGER DEFAULT 1,
        ultima_coleta TEXT,
        proxima_coleta TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_leituras_equipamento ON leituras(equipamento_id);
      CREATE INDEX IF NOT EXISTS idx_leituras_data ON leituras(data_leitura);
      CREATE INDEX IF NOT EXISTS idx_alertas_equipamento ON alertas(equipamento_id);
      CREATE INDEX IF NOT EXISTS idx_alertas_resolvido ON alertas(resolvido);
      CREATE INDEX IF NOT EXISTS idx_suprimentos_equipamento ON suprimentos(equipamento_id);
      CREATE INDEX IF NOT EXISTS idx_config_coleta_equipamento ON config_coleta(equipamento_id);
    `);

    await client.query(`
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
      CREATE INDEX IF NOT EXISTS idx_agents_api_key ON agents(api_key);
      CREATE INDEX IF NOT EXISTS idx_agent_logs_agent ON agent_logs(agent_id);
      CREATE INDEX IF NOT EXISTS idx_agent_logs_created ON agent_logs(created_at);
    `);

    await client.query(`
      DO $$ BEGIN
        ALTER TABLE equipamentos ADD COLUMN IF NOT EXISTS agent_id INTEGER REFERENCES agents(id);
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
      DO $$ BEGIN
        ALTER TABLE equipamentos ADD COLUMN IF NOT EXISTS agent_config JSONB DEFAULT '{}';
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS auditoria_impressoes (
        id SERIAL PRIMARY KEY,
        equipamento_id INTEGER REFERENCES equipamentos(id) ON DELETE SET NULL,
        cliente TEXT,
        usuario TEXT,
        computador TEXT,
        documento TEXT,
        data_impressao TEXT NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')::text,
        hora_impressao TEXT,
        total_paginas INTEGER DEFAULT 1,
        colorida INTEGER DEFAULT 0,
        duplex INTEGER DEFAULT 0,
        tamanho_papel TEXT DEFAULT 'A4',
        status_impressao TEXT NOT NULL DEFAULT 'concluida' CHECK(status_impressao IN ('concluida','cancelada','erro','pendente')),
        fonte TEXT NOT NULL DEFAULT 'snmp' CHECK(fonte IN ('snmp','spooler','api','manual','agent')),
        ip_equipamento TEXT,
        numero_serie TEXT,
        modelo_equip TEXT,
        dados_extras JSONB DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')::text
      );

      CREATE TABLE IF NOT EXISTS auditoria_config (
        id SERIAL PRIMARY KEY,
        tipo_integracao TEXT NOT NULL CHECK(tipo_integracao IN ('snmp','spooler','api_fabricante','accounting')),
        ativo INTEGER DEFAULT 1,
        config JSONB DEFAULT '{}',
        equipamento_id INTEGER REFERENCES equipamentos(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')::text,
        updated_at TEXT NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')::text
      );

      CREATE INDEX IF NOT EXISTS idx_auditoria_equipamento ON auditoria_impressoes(equipamento_id);
      CREATE INDEX IF NOT EXISTS idx_auditoria_cliente ON auditoria_impressoes(cliente);
      CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria_impressoes(usuario);
      CREATE INDEX IF NOT EXISTS idx_auditoria_data ON auditoria_impressoes(data_impressao);
      CREATE INDEX IF NOT EXISTS idx_auditoria_documento ON auditoria_impressoes(documento);
      CREATE INDEX IF NOT EXISTS idx_auditoria_config_equip ON auditoria_config(equipamento_id);
    `);

    await client.query(`
      INSERT INTO usuarios (nome, email, senha_hash, role, ativo)
      SELECT 'Administrador', 'admin@onyx.com', $1, 'admin', 1
      WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE email = 'admin@onyx.com')
    `, [hashPassword('admin123')]);

    console.log('PostgreSQL database initialized successfully');
  } finally {
    client.release();
  }

  return pool;
}

export function getDb(): Pool {
  if (!pool) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return pool;
}

export default { initDatabase, getDb };
