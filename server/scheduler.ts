import cron from 'node-cron';
import { getDb } from './database';
import { getPrinterData, getSuppliesData, checkOnline } from './snmp';

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

async function collectEquipmentData(equipamentoId: number): Promise<LeituraData | null> {
  const db = getDb();
  const result = await db.query('SELECT * FROM equipamentos WHERE id = $1', [equipamentoId]);
  const equipamento = result.rows[0];

  if (!equipamento || equipamento.status_monitoramento !== 'ativo') {
    return null;
  }

  try {
    const printerData = await getPrinterData(equipamento.ip, equipamento.comunidade_snmp);

    const leitura: LeituraData = {
      equipamento_id: equipamentoId,
      contador_total: printerData.contador_total,
      contador_pb: printerData.contador_pb,
      contador_cor: printerData.contador_cor,
      toner_preto: printerData.toner_preto,
      toner_ciano: printerData.toner_ciano,
      toner_magenta: printerData.toner_magenta,
      toner_amarelo: printerData.toner_amarelo,
      status_online: printerData.online ? 1 : 0,
      mensagens_erro: printerData.mensagens_erro,
      numero_serie_equip: printerData.numero_serie,
      modelo_equip: printerData.modelo_equip,
      nome_equip: printerData.nome_equip,
    };

    return leitura;
  } catch (error) {
    console.error(`Error collecting data for equipment ${equipamentoId}:`, error);

    const online = await checkOnline(equipamento.ip, equipamento.comunidade_snmp);

    return {
      equipamento_id: equipamentoId,
      contador_total: 0,
      contador_pb: 0,
      contador_cor: 0,
      toner_preto: 0,
      toner_ciano: 0,
      toner_magenta: 0,
      toner_amarelo: 0,
      status_online: online ? 1 : 0,
      mensagens_erro: error instanceof Error ? error.message : 'Unknown error',
      numero_serie_equip: '',
      modelo_equip: '',
      nome_equip: '',
    };
  }
}

async function saveLeitura(leitura: LeituraData): Promise<number> {
  const db = getDb();
  const result = await db.query(
    `INSERT INTO leituras (
      equipamento_id, contador_total, contador_pb, contador_cor,
      toner_preto, toner_ciano, toner_magenta, toner_amarelo,
      status_online, mensagens_erro, numero_serie_equip, modelo_equip, nome_equip
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING id`,
    [
      leitura.equipamento_id,
      leitura.contador_total,
      leitura.contador_pb,
      leitura.contador_cor,
      leitura.toner_preto,
      leitura.toner_ciano,
      leitura.toner_magenta,
      leitura.toner_amarelo,
      leitura.status_online,
      leitura.mensagens_erro,
      leitura.numero_serie_equip,
      leitura.modelo_equip,
      leitura.nome_equip,
    ]
  );

  return Number(result.rows[0].id);
}

async function updateSuprimentos(equipamentoId: number, leitura: LeituraData): Promise<void> {
  const db = getDb();
  const tonerData = [
    { tipo: 'preto', percentual: leitura.toner_preto },
    { tipo: 'ciano', percentual: leitura.toner_ciano },
    { tipo: 'magenta', percentual: leitura.toner_magenta },
    { tipo: 'amarelo', percentual: leitura.toner_amarelo },
  ];

  for (const toner of tonerData) {
    const existingResult = await db.query(
      'SELECT id FROM suprimentos WHERE equipamento_id = $1 AND tipo = $2',
      [equipamentoId, toner.tipo]
    );
    const existing = existingResult.rows[0];

    const previsaoTroca = toner.percentual <= 10
      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      : toner.percentual <= 25
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : null;

    if (existing) {
      await db.query(
        `UPDATE suprimentos
         SET percentual = $1, ultima_leitura = (NOW() AT TIME ZONE 'UTC')::text, previsao_troca = $2, updated_at = (NOW() AT TIME ZONE 'UTC')::text
         WHERE id = $3`,
        [toner.percentual, previsaoTroca, existing.id]
      );
    } else {
      await db.query(
        `INSERT INTO suprimentos (equipamento_id, tipo, percentual, previsao_troca)
         VALUES ($1, $2, $3, $4)`,
        [equipamentoId, toner.tipo, toner.percentual, previsaoTroca]
      );
    }
  }
}

async function generateAlertas(equipamentoId: number, leitura: LeituraData): Promise<void> {
  const db = getDb();

  if (!leitura.status_online) {
    const existingResult = await db.query(
      `SELECT id FROM alertas
       WHERE equipamento_id = $1 AND tipo = 'offline' AND resolvido = 0`,
      [equipamentoId]
    );

    if (!existingResult.rows[0]) {
      await db.query(
        `INSERT INTO alertas (equipamento_id, tipo, mensagem, nivel)
         VALUES ($1, 'offline', $2, 'critical')`,
        [equipamentoId, `Equipamento ${leitura.nome_equip || equipamentoId} está offline`]
      );
    }
  } else {
    await db.query(
      `UPDATE alertas SET resolvido = 1, resolvido_em = (NOW() AT TIME ZONE 'UTC')::text
       WHERE equipamento_id = $1 AND tipo = 'offline' AND resolvido = 0`,
      [equipamentoId]
    );
  }

  const tonerChecks = [
    { tipo: 'preto', nivel: leitura.toner_preto },
    { tipo: 'ciano', nivel: leitura.toner_ciano },
    { tipo: 'magenta', nivel: leitura.toner_magenta },
    { tipo: 'amarelo', nivel: leitura.toner_amarelo },
  ];

  for (const toner of tonerChecks) {
    if (toner.nivel === 0) {
      const existingResult = await db.query(
        `SELECT id FROM alertas
         WHERE equipamento_id = $1 AND tipo = 'toner_zerado' AND mensagem LIKE $2 AND resolvido = 0`,
        [equipamentoId, `%${toner.tipo}%`]
      );

      if (!existingResult.rows[0]) {
        await db.query(
          `INSERT INTO alertas (equipamento_id, tipo, mensagem, nivel)
           VALUES ($1, 'toner_zerado', $2, 'critical')`,
          [equipamentoId, `Toner ${toner.tipo} está zerado no equipamento ${leitura.nome_equip || equipamentoId}`]
        );
      }
    } else if (toner.nivel <= 15) {
      const existingResult = await db.query(
        `SELECT id FROM alertas
         WHERE equipamento_id = $1 AND tipo = 'toner_baixo' AND mensagem LIKE $2 AND resolvido = 0`,
        [equipamentoId, `%${toner.tipo}%`]
      );

      if (!existingResult.rows[0]) {
        await db.query(
          `INSERT INTO alertas (equipamento_id, tipo, mensagem, nivel)
           VALUES ($1, 'toner_baixo', $2, 'warning')`,
          [equipamentoId, `Toner ${toner.tipo} com ${toner.nivel}% no equipamento ${leitura.nome_equip || equipamentoId}`]
        );
      }
    } else {
      await db.query(
        `UPDATE alertas SET resolvido = 1, resolvido_em = (NOW() AT TIME ZONE 'UTC')::text
         WHERE equipamento_id = $1 AND tipo IN ('toner_baixo', 'toner_zerado') AND mensagem LIKE $2 AND resolvido = 0`,
        [equipamentoId, `%${toner.tipo}%`]
      );
    }
  }

  if (leitura.mensagens_erro && leitura.mensagens_erro !== '0') {
    const existingResult = await db.query(
      `SELECT id FROM alertas
       WHERE equipamento_id = $1 AND tipo = 'erro_critico' AND resolvido = 0`,
      [equipamentoId]
    );

    if (!existingResult.rows[0]) {
      await db.query(
        `INSERT INTO alertas (equipamento_id, tipo, mensagem, nivel)
         VALUES ($1, 'erro_critico', $2, 'critical')`,
        [equipamentoId, `Erro crítico no equipamento ${leitura.nome_equip || equipamentoId}: ${leitura.mensagens_erro}`]
      );
    }
  }
}

export async function runCollection(equipamentoId?: number): Promise<{ success: boolean; collected: number; errors: number }> {
  const db = getDb();
  let collected = 0;
  let errors = 0;

  let query = 'SELECT id FROM equipamentos WHERE status_monitoramento = $1';
  let params: any[] = ['ativo'];

  if (equipamentoId) {
    query = 'SELECT id FROM equipamentos WHERE id = $1 AND status_monitoramento = $2';
    params = [equipamentoId, 'ativo'];
  }

  const result = await db.query(query, params);
  const equipamentos = result.rows;

  for (const equip of equipamentos) {
    try {
      const leituraData = await collectEquipmentData(equip.id);
      if (leituraData) {
        await saveLeitura(leituraData);
        await updateSuprimentos(equip.id, leituraData);
        await generateAlertas(equip.id, leituraData);

        await db.query(
          `UPDATE config_coleta SET ultima_coleta = (NOW() AT TIME ZONE 'UTC')::text
           WHERE equipamento_id = $1`,
          [equip.id]
        );

        collected++;
      }
    } catch (error) {
      console.error(`Error collecting equipment ${equip.id}:`, error);
      errors++;
    }
  }

  return { success: true, collected, errors };
}

function getIntervalCron(interval: string): string {
  switch (interval) {
    case '1h':
      return '0 * * * *';
    case '6h':
      return '0 */6 * * *';
    case 'diario':
      return '0 8 * * *';
    default:
      return '0 8 * * *';
  }
}

const activeJobs: Map<number, { stop: () => void }> = new Map();

export function scheduleEquipment(equipamentoId: number, interval: string): void {
  if (activeJobs.has(equipamentoId)) {
    activeJobs.get(equipamentoId)?.stop();
    activeJobs.delete(equipamentoId);
  }

  const cronExpression = getIntervalCron(interval);
  const job = cron.schedule(cronExpression, async () => {
    console.log(`Running scheduled collection for equipment ${equipamentoId}`);
    await runCollection(equipamentoId);
  });

  activeJobs.set(equipamentoId, job);
}

export function unscheduleEquipment(equipamentoId: number): void {
  if (activeJobs.has(equipamentoId)) {
    activeJobs.get(equipamentoId)?.stop();
    activeJobs.delete(equipamentoId);
  }
}

export async function startScheduler(): Promise<void> {
  const db = getDb();
  const result = await db.query('SELECT * FROM config_coleta WHERE ativo = 1');
  const configs = result.rows;

  for (const config of configs) {
    scheduleEquipment(config.equipamento_id, config.intervalo);
  }

  console.log(`Scheduler started with ${configs.length} active collections`);
}

export default { startScheduler, runCollection, scheduleEquipment, unscheduleEquipment };
