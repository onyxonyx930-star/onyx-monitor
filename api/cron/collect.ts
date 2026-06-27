import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initDatabase, getDb } from '../server/database';
import { getPrinterData } from '../server/snmp';

let dbInitialized = false;

async function ensureDb() {
  if (!dbInitialized) {
    await initDatabase();
    dbInitialized = true;
  }
}

interface LeituraData {
  equipamento_id: number;
  contador_total: number;
  contador_pb: number;
  contador_cor: number;
  toner_preto: number;
  toner_ciano: number;
  toner_magenta: number;
  toner_amarelo: number;
  status_online: number;
  mensagens_erro: string;
  numero_serie_equip: string;
  modelo_equip: string;
  nome_equip: string;
}

async function collectAndSave(equipamentoId: number): Promise<boolean> {
  const db = getDb();
  const result = await db.query('SELECT * FROM equipamentos WHERE id = $1', [equipamentoId]);
  const equipamento = result.rows[0];
  if (!equipamento || equipamento.status_monitoramento !== 'ativo') return false;

  try {
    const printerData = await getPrinterData(equipamento.ip, equipamento.comunidade_snmp);

    await db.query(
      `INSERT INTO leituras (equipamento_id, contador_total, contador_pb, contador_cor,
        toner_preto, toner_ciano, toner_magenta, toner_amarelo,
        status_online, mensagens_erro, numero_serie_equip, modelo_equip, nome_equip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [equipamentoId, printerData.contador_total, printerData.contador_pb, printerData.contador_cor,
       printerData.toner_preto, printerData.toner_ciano, printerData.toner_magenta, printerData.toner_amarelo,
       printerData.online ? 1 : 0, printerData.mensagens_erro,
       printerData.numero_serie, printerData.modelo_equip, printerData.nome_equip]
    );

    const tonerData = [
      { tipo: 'preto', percentual: printerData.toner_preto },
      { tipo: 'ciano', percentual: printerData.toner_ciano },
      { tipo: 'magenta', percentual: printerData.toner_magenta },
      { tipo: 'amarelo', percentual: printerData.toner_amarelo },
    ];

    for (const toner of tonerData) {
      const existing = await db.query('SELECT id FROM suprimentos WHERE equipamento_id = $1 AND tipo = $2', [equipamentoId, toner.tipo]);
      if (existing.rows[0]) {
        await db.query('UPDATE suprimentos SET percentual = $1, ultima_leitura = (NOW() AT TIME ZONE \'UTC\')::text, updated_at = (NOW() AT TIME ZONE \'UTC\')::text WHERE id = $2', [toner.percentual, existing.rows[0].id]);
      } else {
        await db.query('INSERT INTO suprimentos (equipamento_id, tipo, percentual) VALUES ($1,$2,$3)', [equipamentoId, toner.tipo, toner.percentual]);
      }
    }

    return true;
  } catch (error) {
    console.error(`Error collecting equipment ${equipamentoId}:`, error);
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await ensureDb();
  const db = getDb();

  const configs = await db.query('SELECT * FROM config_coleta WHERE ativo = 1');
  let collected = 0;
  let errors = 0;

  for (const config of configs.rows) {
    const success = await collectAndSave(config.equipamento_id);
    if (success) {
      collected++;
      await db.query("UPDATE config_coleta SET ultima_coleta = (NOW() AT TIME ZONE 'UTC')::text WHERE equipamento_id = $1", [config.equipamento_id]);
    } else {
      errors++;
    }
  }

  console.log(`[CRON] Collected: ${collected}, Errors: ${errors}`);
  return res.json({ success: true, collected, errors, timestamp: new Date().toISOString() });
}
