import { Router, Request, Response } from 'express';
import { getDb } from '../database';
import { getPrinterData, getSuppliesData, checkOnline } from '../snmp';

const router = Router();

function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return false;
  return (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] === 127 ||
    parts[0] === 0
  );
}

router.get('/stats', async (req: Request, res: Response) => {
  try {
    const db = getDb();

    const totalResult = await db.query('SELECT COUNT(*) as count FROM equipamentos');
    const totalEquipamentos = Number(totalResult.rows[0].count);

    const ultimaLeituraSubquery = `
      SELECT l.equipamento_id, l.status_online, l.data_leitura
      FROM leituras l
      INNER JOIN (
        SELECT equipamento_id, MAX(data_leitura) as max_data
        FROM leituras
        GROUP BY equipamento_id
      ) latest ON l.equipamento_id = latest.equipamento_id AND l.data_leitura = latest.max_data
    `;

    const onlineResult = await db.query(`
      SELECT COUNT(*) as count FROM (${ultimaLeituraSubquery}) WHERE status_online = 1
    `);
    const onlineCount = Number(onlineResult.rows[0].count);

    const offlineResult = await db.query(`
      SELECT COUNT(*) as count FROM (${ultimaLeituraSubquery}) WHERE status_online = 0
    `);
    const offlineCount = Number(offlineResult.rows[0].count);

    const tonersResult = await db.query("SELECT COUNT(*) as count FROM suprimentos WHERE percentual <= 20");
    const tonersBaixos = Number(tonersResult.rows[0].count);

    const alertasResult = await db.query("SELECT COUNT(*) as count FROM alertas WHERE resolvido = 0 AND nivel = 'critical'");
    const alertasCriticos = Number(alertasResult.rows[0].count);

    const now = new Date();
    const firstDayOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const paginasResult = await db.query(
      'SELECT COALESCE(SUM(contador_total), 0) as total FROM leituras WHERE data_leitura >= $1',
      [firstDayOfMonth]
    );
    const totalPaginasMes = Number(paginasResult.rows[0].total);

    const clientesResult = await db.query(`
      SELECT e.cliente, SUM(l.contador_total) as paginas
      FROM equipamentos e
      INNER JOIN leituras l ON l.equipamento_id = e.id
      WHERE l.data_leitura >= $1
      GROUP BY e.cliente
      ORDER BY paginas DESC
      LIMIT 10
    `, [firstDayOfMonth]);

    res.json({
      success: true,
      data: {
        total_equipamentos: totalEquipamentos,
        online: onlineCount,
        offline: offlineCount,
        toners_baixos: tonersBaixos,
        alertas_criticos: alertasCriticos,
        total_paginas_mes: totalPaginasMes,
        clientes_maior_volume: clientesResult.rows,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar estatísticas',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { cliente, status, search, page = '1', per_page = '10' } = req.query;

    let countQuery = 'SELECT COUNT(*) as count FROM equipamentos e WHERE 1=1';
    let query = `
      SELECT e.*,
        (SELECT COUNT(*) FROM alertas a WHERE a.equipamento_id = e.id AND a.resolvido = 0) as alertas_ativos
      FROM equipamentos e
      WHERE 1=1
    `;
    const params: any[] = [];
    const countParams: any[] = [];
    let paramIndex = 1;

    if (cliente) {
      query += ` AND e.cliente = $${paramIndex}`;
      countQuery += ` AND e.cliente = $${paramIndex}`;
      params.push(cliente);
      countParams.push(cliente);
      paramIndex++;
    }

    if (status) {
      query += ` AND e.status_monitoramento = $${paramIndex}`;
      countQuery += ` AND e.status_monitoramento = $${paramIndex}`;
      params.push(status);
      countParams.push(status);
      paramIndex++;
    }

    if (search) {
      const searchClause = ` AND (e.cliente LIKE $${paramIndex} OR e.ip LIKE $${paramIndex + 1} OR e.modelo LIKE $${paramIndex + 2} OR e.numero_serie LIKE $${paramIndex + 3})`;
      const searchTerm = `%${search}%`;
      query += searchClause;
      countQuery += searchClause;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
      countParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
      paramIndex += 4;
    }

    const countResult = await db.query(countQuery, countParams);
    const total = Number(countResult.rows[0].count);

    const pageNum = Math.max(1, Number(page));
    const perPageNum = Math.max(1, Math.min(100, Number(per_page)));
    const offset = (pageNum - 1) * perPageNum;

    query += ` ORDER BY e.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(perPageNum, offset);

    const result = await db.query(query, params);
    res.json({ success: true, data: { data: result.rows, total } });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao listar equipamentos',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const equipResult = await db.query('SELECT * FROM equipamentos WHERE id = $1', [id]);
    const equipamento = equipResult.rows[0];

    if (!equipamento) {
      return res.status(404).json({
        success: false,
        message: 'Equipamento não encontrado',
      });
    }

    const leituraResult = await db.query(
      'SELECT * FROM leituras WHERE equipamento_id = $1 ORDER BY data_leitura DESC LIMIT 1',
      [id]
    );

    const suprimentosResult = await db.query('SELECT * FROM suprimentos WHERE equipamento_id = $1', [id]);

    const configResult = await db.query('SELECT * FROM config_coleta WHERE equipamento_id = $1', [id]);

    res.json({
      success: true,
      data: {
        ...equipamento,
        ultima_leitura: leituraResult.rows[0] || null,
        suprimentos: suprimentosResult.rows,
        config_coleta: configResult.rows[0] || null,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar equipamento',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const {
      cliente, unidade, ip, comunidade_snmp, fabricante, modelo,
      numero_serie, localizacao, contrato, status_monitoramento,
    } = req.body;

    if (!cliente || !ip) {
      return res.status(400).json({
        success: false,
        message: 'Cliente e IP são obrigatórios',
      });
    }

    const result = await db.query(
      `INSERT INTO equipamentos (cliente, unidade, ip, comunidade_snmp, fabricante, modelo, numero_serie, localizacao, contrato, status_monitoramento)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        cliente,
        unidade || null,
        ip,
        comunidade_snmp || 'public',
        fabricante || null,
        modelo || null,
        numero_serie || null,
        localizacao || null,
        contrato || null,
        status_monitoramento || 'ativo',
      ]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Equipamento criado com sucesso',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao criar equipamento',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const {
      cliente, unidade, ip, comunidade_snmp, fabricante, modelo,
      numero_serie, localizacao, contrato, status_monitoramento,
    } = req.body;

    const existingResult = await db.query('SELECT * FROM equipamentos WHERE id = $1', [id]);
    const existing = existingResult.rows[0];

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Equipamento não encontrado',
      });
    }

    const result = await db.query(
      `UPDATE equipamentos
       SET cliente = $1, unidade = $2, ip = $3, comunidade_snmp = $4, fabricante = $5,
           modelo = $6, numero_serie = $7, localizacao = $8, contrato = $9,
           status_monitoramento = $10, updated_at = (NOW() AT TIME ZONE 'UTC')::text
       WHERE id = $11
       RETURNING *`,
      [
        cliente || existing.cliente,
        unidade || existing.unidade,
        ip || existing.ip,
        comunidade_snmp || existing.comunidade_snmp,
        fabricante || existing.fabricante,
        modelo || existing.modelo,
        numero_serie || existing.numero_serie,
        localizacao || existing.localizacao,
        contrato || existing.contrato,
        status_monitoramento || existing.status_monitoramento,
        id,
      ]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Equipamento atualizado com sucesso',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar equipamento',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const existingResult = await db.query('SELECT * FROM equipamentos WHERE id = $1', [id]);

    if (!existingResult.rows[0]) {
      return res.status(404).json({
        success: false,
        message: 'Equipamento não encontrado',
      });
    }

    await db.query('DELETE FROM equipamentos WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Equipamento excluído com sucesso',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao excluir equipamento',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/:id/collect', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const equipResult = await db.query('SELECT * FROM equipamentos WHERE id = $1', [id]);
    const equipamento = equipResult.rows[0];

    if (!equipamento) {
      return res.status(404).json({
        success: false,
        message: 'Equipamento não encontrado',
      });
    }

    if (isPrivateIP(equipamento.ip)) {
      const agentResult = await db.query(
        `SELECT a.id, a.name, a.status, a.last_heartbeat
         FROM agents a
         WHERE a.id = $1 AND a.status = 'active'`,
        [equipamento.agent_id]
      );

      const agent = agentResult.rows[0];

      if (!agent) {
        return res.status(400).json({
          success: false,
          data: {
            reason: 'private_ip_no_agent',
            ip: equipamento.ip,
            hint: 'Para coletar dados deste equipamento, instale e configure um Onyx Agent na rede do cliente.',
            agent_required: true,
          },
          message: 'Este equipamento está em rede interna (IP privado). Não é possível coletar diretamente da nuvem.',
        });
      }

      const lastHeartbeat = agent.last_heartbeat ? new Date(agent.last_heartbeat).getTime() : 0;
      const isOnline = lastHeartbeat > Date.now() - 10 * 60 * 1000;

      if (!isOnline) {
        return res.status(400).json({
          success: false,
          data: {
            reason: 'agent_offline',
            agent_name: agent.name,
            last_heartbeat: agent.last_heartbeat,
            hint: 'Verifique se o Agent está rodando na rede do cliente.',
            agent_required: false,
          },
          message: `O Agent "${agent.name}" está configurado, mas parece estar offline.`,
        });
      }

      await db.query(
        `INSERT INTO agent_logs (agent_id, level, message, details)
         VALUES ($1, 'info', $2, $3)`,
        [
          agent.id,
          `Coleta solicitada para ${equipamento.ip} (${equipamento.modelo || equipamento.ip})`,
          JSON.stringify({ equipamento_id: equipamento.id, requested_by: 'web_ui' }),
        ]
      );

      return res.json({
        success: true,
        data: {
          reason: 'routed_to_agent',
          agent_id: agent.id,
          agent_name: agent.name,
          agent_online: true,
        },
        message: `Solicitação de coleta enviada ao Agent "${agent.name}". O Agent coletará os dados na próxima verificação.`,
      });
    }

    const printerData = await getPrinterData(equipamento.ip, equipamento.comunidade_snmp);

    const leituraResult = await db.query(
      `INSERT INTO leituras (
        equipamento_id, contador_total, contador_pb, contador_cor,
        toner_preto, toner_ciano, toner_magenta, toner_amarelo,
        status_online, mensagens_erro, numero_serie_equip, modelo_equip, nome_equip
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        equipamento.id,
        printerData.contador_total,
        printerData.contador_pb,
        printerData.contador_cor,
        printerData.toner_preto,
        printerData.toner_ciano,
        printerData.toner_magenta,
        printerData.toner_amarelo,
        printerData.online ? 1 : 0,
        printerData.mensagens_erro,
        printerData.numero_serie,
        printerData.modelo_equip,
        printerData.nome_equip,
      ]
    );

    const tonerData = [
      { tipo: 'preto', percentual: printerData.toner_preto },
      { tipo: 'ciano', percentual: printerData.toner_ciano },
      { tipo: 'magenta', percentual: printerData.toner_magenta },
      { tipo: 'amarelo', percentual: printerData.toner_amarelo },
    ];

    for (const toner of tonerData) {
      const existingSupResult = await db.query(
        'SELECT id FROM suprimentos WHERE equipamento_id = $1 AND tipo = $2',
        [equipamento.id, toner.tipo]
      );
      const existingSup = existingSupResult.rows[0];

      if (existingSup) {
        await db.query(
          `UPDATE suprimentos SET percentual = $1, ultima_leitura = (NOW() AT TIME ZONE 'UTC')::text, updated_at = (NOW() AT TIME ZONE 'UTC')::text
           WHERE id = $2`,
          [toner.percentual, existingSup.id]
        );
      } else {
        await db.query(
          'INSERT INTO suprimentos (equipamento_id, tipo, percentual) VALUES ($1, $2, $3)',
          [equipamento.id, toner.tipo, toner.percentual]
        );
      }
    }

    res.json({
      success: true,
      data: leituraResult.rows[0],
      message: 'Coleta realizada com sucesso',
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    const isTimeout = errMsg.includes('timeout') || errMsg.includes('Timed out');

    res.status(500).json({
      success: false,
      message: isTimeout
        ? 'Tempo esgotado ao conectar com a impressora. Verifique se a impressora está ligada e acessível.'
        : 'Erro ao realizar coleta SNMP',
      details: {
        reason: isTimeout ? 'snmp_timeout' : 'snmp_error',
        error: errMsg,
        hint: isTimeout
          ? 'A impressora pode estar desligada, fora da rede, ou com o SNMP desabilitado.'
          : 'Verifique o IP, community string e se a impressora suporta SNMP.',
      },
    });
  }
});

export default router;
