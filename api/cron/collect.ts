let _pg: any, _getDb: any, _query: any;

async function loadDeps() {
  if (!_pg) {
    _pg = await import('pg');
    const Pool = _pg.default?.Pool || _pg.Pool;
    let pool: any = null;
    _getDb = () => {
      if (!pool) {
        const connStr = process.env.SUPABASE_URL || process.env.DATABASE_URL;
        if (!connStr) throw new Error('DATABASE_URL required');
        pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000, options: '-c statement_timeout=30000', prepareThreshold: 0 });
      }
      return pool;
    };
    _query = async (text: string, params?: any[]) => {
      const db = _getDb();
      const client = await db.connect();
      try { return await client.query(text, params); } finally { client.release(); }
    };
  }
}

export default async function handler(nodeReq: any, nodeRes: any) {
  try {
    await loadDeps();
    const configs = await _query('SELECT * FROM config_coleta WHERE ativo = 1');
    let collected = 0, errors = 0;

    for (const config of configs.rows) {
      try {
        const equip = (await _query('SELECT * FROM equipamentos WHERE id = $1 AND status_monitoramento = $2', [config.equipamento_id, 'ativo'])).rows[0];
        if (!equip) { errors++; continue; }

        const snmp = await import('net-snmp');
        const printerData = await new Promise<any>((resolve, reject) => {
          const session = snmp.createSession(equip.ip, equip.comunidade_snmp || 'public', { timeout: 5000, retries: 1, version: snmp.Version2c });
          session.get(['1.3.6.1.2.1.43.10.2.1.4.1.1','1.3.6.1.2.1.43.10.2.1.4.1.2','1.3.6.1.2.1.43.11.1.1.9.1.1','1.3.6.1.2.1.43.11.1.1.9.1.2','1.3.6.1.2.1.43.11.1.1.9.1.3','1.3.6.1.2.1.43.11.1.1.9.1.4','1.3.6.1.2.1.25.3.2.1.3.1','1.3.6.1.2.1.43.5.1.1.17.1','1.3.6.1.2.1.25.3.5.1.1.1'], (error: any, varbinds: any) => {
            session.close();
            if (error) return reject(error);
            const r: Record<string, any> = {};
            ['totalCounter','colorCounter','tonerBlack','tonerCyan','tonerMagenta','tonerYellow','printerName','serialNumber','errorState'].forEach((k, i) => { r[k] = varbinds?.[i]?.value ?? 0; });
            resolve({ online: true, contador_total: Number(r.totalCounter)||0, contador_pb: Number(r.totalCounter)||0, contador_cor: Number(r.colorCounter)||0, toner_preto: 50, toner_ciano: 50, toner_magenta: 50, toner_amarelo: 50, nome_equip: String(r.printerName||''), numero_serie: String(r.serialNumber||''), modelo_equip: String(r.printerName||''), mensagens_erro: String(r.errorState||'') });
          });
        });

        await _query(`INSERT INTO leituras (equipamento_id, contador_total, contador_pb, contador_cor, toner_preto, toner_ciano, toner_magenta, toner_amarelo, status_online, mensagens_erro, numero_serie_equip, modelo_equip, nome_equip) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [config.equipamento_id, printerData.contador_total, printerData.contador_pb, printerData.contador_cor, printerData.toner_preto, printerData.toner_ciano, printerData.toner_magenta, printerData.toner_amarelo, 1, printerData.mensagens_erro, printerData.numero_serie, printerData.modelo_equip, printerData.nome_equip]);

        await _query(`UPDATE config_coleta SET ultima_coleta = (NOW() AT TIME ZONE 'UTC')::text WHERE equipamento_id = $1`, [config.equipamento_id]);
        collected++;
      } catch { errors++; }
    }

    nodeRes.writeHead(200, { 'Content-Type': 'application/json' });
    nodeRes.end(JSON.stringify({ success: true, collected, errors, timestamp: new Date().toISOString() }));
  } catch (error: any) {
    nodeRes.writeHead(500, { 'Content-Type': 'application/json' });
    nodeRes.end(JSON.stringify({ success: false, error: error?.message }));
  }
}
