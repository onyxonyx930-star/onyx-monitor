import { query } from '../_lib/db.js';

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const configs = await query('SELECT * FROM config_coleta WHERE ativo = 1');
    let collected = 0;
    let errors = 0;

    for (const config of configs.rows) {
      try {
        const equip = (await query('SELECT * FROM equipamentos WHERE id = $1 AND status_monitoramento = $1', [config.equipamento_id])).rows[0];
        if (!equip) { errors++; continue; }

        const { getPrinterData } = await import('../../server/snmp.js');
        const printerData = await getPrinterData(equip.ip, equip.comunidade_snmp);

        await query(
          `INSERT INTO leituras (equipamento_id, contador_total, contador_pb, contador_cor, toner_preto, toner_ciano, toner_magenta, toner_amarelo, status_online, mensagens_erro, numero_serie_equip, modelo_equip, nome_equip) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [config.equipamento_id, printerData.contador_total, printerData.contador_pb, printerData.contador_cor, printerData.toner_preto, printerData.toner_ciano, printerData.toner_magenta, printerData.toner_amarelo, printerData.online ? 1 : 0, printerData.mensagens_erro, printerData.numero_serie, printerData.modelo_equip, printerData.nome_equip]
        );

        const toners = [
          { tipo: 'preto', percentual: printerData.toner_preto },
          { tipo: 'ciano', percentual: printerData.toner_ciano },
          { tipo: 'magenta', percentual: printerData.toner_magenta },
          { tipo: 'amarelo', percentual: printerData.toner_amarelo },
        ];

        for (const toner of toners) {
          const existing = (await query('SELECT id FROM suprimentos WHERE equipamento_id = $1 AND tipo = $2', [config.equipamento_id, toner.tipo])).rows[0];
          if (existing) {
            await query(`UPDATE suprimentos SET percentual = $1, ultima_leitura = (NOW() AT TIME ZONE 'UTC')::text, updated_at = (NOW() AT TIME ZONE 'UTC')::text WHERE id = $2`, [toner.percentual, existing.id]);
          } else {
            await query('INSERT INTO suprimentos (equipamento_id, tipo, percentual) VALUES ($1, $2, $3)', [config.equipamento_id, toner.tipo, toner.percentual]);
          }
        }

        await query(`UPDATE config_coleta SET ultima_coleta = (NOW() AT TIME ZONE 'UTC')::text WHERE equipamento_id = $1`, [config.equipamento_id]);
        collected++;
      } catch (error) {
        console.error(`Error collecting equipment ${config.equipamento_id}:`, error);
        errors++;
      }
    }

    return Response.json({ success: true, collected, errors, timestamp: new Date().toISOString() });
  } catch (error: any) {
    return Response.json({ success: false, error: error?.message }, { status: 500 });
  }
}
