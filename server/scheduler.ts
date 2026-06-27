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
  const equipamento = db.prepare('SELECT * FROM equipamentos WHERE id = ?').get(equipamentoId) as any;

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

function saveLeitura(leitura: LeituraData): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO leituras (
      equipamento_id, contador_total, contador_pb, contador_cor,
      toner_preto, toner_ciano, toner_magenta, toner_amarelo,
      status_online, mensagens_erro, numero_serie_equip, modelo_equip, nome_equip
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
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
  );

  return Number(result.lastInsertRowid);
}

function updateSuprimentos(equipamentoId: number, leitura: LeituraData): void {
  const db = getDb();
  const tonerData = [
    { tipo: 'preto', percentual: leitura.toner_preto },
    { tipo: 'ciano', percentual: leitura.toner_ciano },
    { tipo: 'magenta', percentual: leitura.toner_magenta },
    { tipo: 'amarelo', percentual: leitura.toner_amarelo },
  ];

  for (const toner of tonerData) {
    const existing = db.prepare('SELECT id FROM suprimentos WHERE equipamento_id = ? AND tipo = ?')
      .get(equipamentoId, toner.tipo) as any;

    const previsaoTroca = toner.percentual <= 10
      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      : toner.percentual <= 25
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : null;

    if (existing) {
      db.prepare(`
        UPDATE suprimentos
        SET percentual = ?, ultima_leitura = datetime('now'), previsao_troca = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(toner.percentual, previsaoTroca, existing.id);
    } else {
      db.prepare(`
        INSERT INTO suprimentos (equipamento_id, tipo, percentual, previsao_troca)
        VALUES (?, ?, ?, ?)
      `).run(equipamentoId, toner.tipo, toner.percentual, previsaoTroca);
    }
  }
}

function generateAlertas(equipamentoId: number, leitura: LeituraData): void {
  const db = getDb();

  if (!leitura.status_online) {
    const existing = db.prepare(`
      SELECT id FROM alertas
      WHERE equipamento_id = ? AND tipo = 'offline' AND resolvido = 0
    `).get(equipamentoId);

    if (!existing) {
      db.prepare(`
        INSERT INTO alertas (equipamento_id, tipo, mensagem, nivel)
        VALUES (?, 'offline', ?, 'critical')
      `).run(equipamentoId, `Equipamento ${leitura.nome_equip || equipamentoId} está offline`);
    }
  } else {
    db.prepare(`
      UPDATE alertas SET resolvido = 1, resolvido_em = datetime('now')
      WHERE equipamento_id = ? AND tipo = 'offline' AND resolvido = 0
    `).run(equipamentoId);
  }

  const tonerChecks = [
    { tipo: 'preto', nivel: leitura.toner_preto },
    { tipo: 'ciano', nivel: leitura.toner_ciano },
    { tipo: 'magenta', nivel: leitura.toner_magenta },
    { tipo: 'amarelo', nivel: leitura.toner_amarelo },
  ];

  for (const toner of tonerChecks) {
    if (toner.nivel === 0) {
      const existing = db.prepare(`
        SELECT id FROM alertas
        WHERE equipamento_id = ? AND tipo = 'toner_zerado' AND mensagem LIKE ? AND resolvido = 0
      `).get(equipamentoId, `%${toner.tipo}%`);

      if (!existing) {
        db.prepare(`
          INSERT INTO alertas (equipamento_id, tipo, mensagem, nivel)
          VALUES (?, 'toner_zerado', ?, 'critical')
        `).run(equipamentoId, `Toner ${toner.tipo} está zerado no equipamento ${leitura.nome_equip || equipamentoId}`);
      }
    } else if (toner.nivel <= 15) {
      const existing = db.prepare(`
        SELECT id FROM alertas
        WHERE equipamento_id = ? AND tipo = 'toner_baixo' AND mensagem LIKE ? AND resolvido = 0
      `).get(equipamentoId, `%${toner.tipo}%`);

      if (!existing) {
        db.prepare(`
          INSERT INTO alertas (equipamento_id, tipo, mensagem, nivel)
          VALUES (?, 'toner_baixo', ?, 'warning')
        `).run(equipamentoId, `Toner ${toner.tipo} com ${toner.nivel}% no equipamento ${leitura.nome_equip || equipamentoId}`);
      }
    } else {
      db.prepare(`
        UPDATE alertas SET resolvido = 1, resolvido_em = datetime('now')
        WHERE equipamento_id = ? AND tipo IN ('toner_baixo', 'toner_zerado') AND mensagem LIKE ? AND resolvido = 0
      `).run(equipamentoId, `%${toner.tipo}%`);
    }
  }

  if (leitura.mensagens_erro && leitura.mensagens_erro !== '0') {
    const existing = db.prepare(`
      SELECT id FROM alertas
      WHERE equipamento_id = ? AND tipo = 'erro_critico' AND resolvido = 0
    `).get(equipamentoId);

    if (!existing) {
      db.prepare(`
        INSERT INTO alertas (equipamento_id, tipo, mensagem, nivel)
        VALUES (?, 'erro_critico', ?, 'critical')
      `).run(equipamentoId, `Erro crítico no equipamento ${leitura.nome_equip || equipamentoId}: ${leitura.mensagens_erro}`);
    }
  }
}

export async function runCollection(equipamentoId?: number): Promise<{ success: boolean; collected: number; errors: number }> {
  const db = getDb();
  let collected = 0;
  let errors = 0;

  const query = equipamentoId
    ? 'SELECT id FROM equipamentos WHERE id = ? AND status_monitoramento = ?'
    : 'SELECT id FROM equipamentos WHERE status_monitoramento = ?';
  const params = equipamentoId ? [equipamentoId, 'ativo'] : ['ativo'];

  const equipamentos = db.prepare(query).all(...params) as Array<{ id: number }>;

  for (const equip of equipamentos) {
    try {
      const leituraData = await collectEquipmentData(equip.id);
      if (leituraData) {
        saveLeitura(leituraData);
        updateSuprimentos(equip.id, leituraData);
        generateAlertas(equip.id, leituraData);

        db.prepare(`
          UPDATE config_coleta SET ultima_coleta = datetime('now')
          WHERE equipamento_id = ?
        `).run(equip.id);

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

const activeJobs: Map<number, cron.ScheduledTask> = new Map();

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

export function startScheduler(): void {
  const db = getDb();
  const configs = db.prepare('SELECT * FROM config_coleta WHERE ativo = 1').all() as Array<{
    equipamento_id: number;
    intervalo: string;
  }>;

  for (const config of configs) {
    scheduleEquipment(config.equipamento_id, config.intervalo);
  }

  console.log(`Scheduler started with ${configs.length} active collections`);
}

export default { startScheduler, runCollection, scheduleEquipment, unscheduleEquipment };
