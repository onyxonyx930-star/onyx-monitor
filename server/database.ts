import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';

let db: Database.Database;

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export function initDatabase(): Database.Database {
  const dbPath = process.env.DB_PATH || path.join(__dirname, 'onyx.db');
  db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS equipamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS leituras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipamento_id INTEGER NOT NULL,
      data_leitura TEXT NOT NULL DEFAULT (datetime('now')),
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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS suprimentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipamento_id INTEGER NOT NULL,
      tipo TEXT NOT NULL CHECK(tipo IN ('preto','ciano','magenta','amarelo','waste','drum','fusor')),
      percentual REAL DEFAULT 100,
      ultima_leitura TEXT DEFAULT (datetime('now')),
      previsao_troca TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS alertas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipamento_id INTEGER NOT NULL,
      tipo TEXT NOT NULL CHECK(tipo IN ('toner_baixo','toner_zerado','offline','erro_critico','contador_nao_atualizado','snmp_sem_resposta')),
      mensagem TEXT NOT NULL,
      nivel TEXT NOT NULL DEFAULT 'info' CHECK(nivel IN ('info','warning','critical')),
      resolvido INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolvido_em TEXT,
      FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'cliente' CHECK(role IN ('admin','operador','cliente')),
      cliente_id INTEGER,
      ativo INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS config_coleta (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipamento_id INTEGER NOT NULL,
      intervalo TEXT NOT NULL DEFAULT 'diario' CHECK(intervalo IN ('1h','6h','diario')),
      ativo INTEGER DEFAULT 1,
      ultima_coleta TEXT,
      proxima_coleta TEXT,
      FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_leituras_equipamento ON leituras(equipamento_id);
    CREATE INDEX IF NOT EXISTS idx_leituras_data ON leituras(data_leitura);
    CREATE INDEX IF NOT EXISTS idx_alertas_equipamento ON alertas(equipamento_id);
    CREATE INDEX IF NOT EXISTS idx_alertas_resolvido ON alertas(resolvido);
    CREATE INDEX IF NOT EXISTS idx_suprimentos_equipamento ON suprimentos(equipamento_id);
    CREATE INDEX IF NOT EXISTS idx_config_coleta_equipamento ON config_coleta(equipamento_id);
  `);

  const existingAdmin = db.prepare('SELECT id FROM usuarios WHERE email = ?').get('admin@onyx.com');
  if (!existingAdmin) {
    db.prepare(`
      INSERT INTO usuarios (nome, email, senha_hash, role, ativo)
      VALUES (?, ?, ?, ?, ?)
    `).run('Administrador', 'admin@onyx.com', hashPassword('admin123'), 'admin', 1);
  }

  return db;
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export default { initDatabase, getDb };
