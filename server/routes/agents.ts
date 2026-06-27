import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getDb } from '../database';

const router = Router();

function generateApiKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Agent auth middleware - validates agent API key
export async function agentAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Token de autenticação não fornecido' });
    return;
  }

  const apiKey = authHeader.split(' ')[1];
  const db = getDb();

  try {
    const result = await db.query('SELECT id, name, status FROM agents WHERE api_key = $1', [apiKey]);
    const agent = result.rows[0];

    if (!agent) {
      res.status(401).json({ success: false, message: 'API Key inválida' });
      return;
    }

    if (agent.status !== 'active') {
      res.status(403).json({ success: false, message: 'Agent inativo' });
      return;
    }

    (req as any).agentId = agent.id;
    (req as any).agentName = agent.name;
    next();
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao autenticar agent' });
  }
}

// Admin auth middleware (reuse from auth.ts pattern)
function adminMiddleware(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user;
  if (!user || user.role !== 'admin') {
    res.status(403).json({ success: false, message: 'Acesso negado. Apenas administradores.' });
    return;
  }
  next();
}

// POST /api/agents/register - Agent self-registration
router.post('/register', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { name, company_id, location, ip_address, version } = req.body;

    if (!name || !company_id) {
      return res.status(400).json({ success: false, message: 'Nome e company_id são obrigatórios' });
    }

    const apiKey = generateApiKey();

    const result = await db.query(
      `INSERT INTO agents (name, company_id, location, ip_address, api_key, version, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')
       RETURNING id, name, company_id, api_key, status, created_at`,
      [name, company_id, location || null, ip_address || null, apiKey, version || '1.0.0']
    );

    const agent = result.rows[0];

    res.status(201).json({
      success: true,
      data: {
        id: agent.id,
        name: agent.name,
        company_id: agent.company_id,
        api_key: agent.api_key,
        status: agent.status,
      },
      message: 'Agent registrado com sucesso',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao registrar agent',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/agents/:id/heartbeat - Agent heartbeat
router.post('/:id/heartbeat', agentAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const agentId = (req as any).agentId;
    const { version, printers_count, status: agentStatus } = req.body;

    await db.query(
      `UPDATE agents
       SET last_heartbeat = (NOW() AT TIME ZONE 'UTC')::text,
           version = COALESCE($1, version),
           updated_at = (NOW() AT TIME ZONE 'UTC')::text
       WHERE id = $2`,
      [version || null, agentId]
    );

    res.json({ success: true, message: 'Heartbeat registrado' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao registrar heartbeat' });
  }
});

// GET /api/agents/:id/config - Get agent configuration (assigned printers)
router.get('/:id/config', agentAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const agentId = (req as any).agentId;

    const result = await db.query(
      `SELECT id, cliente, unidade, ip, comunidade_snmp, fabricante, modelo, numero_serie, localizacao
       FROM equipamentos
       WHERE agent_id = $1 AND status_monitoramento = 'ativo'`,
      [agentId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao buscar configuração' });
  }
});

// POST /api/agents/:id/collect - Receive collected data from agent
router.post('/:id/collect', agentAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const agentId = (req as any).agentId;
    const { equipamentos } = req.body;

    if (!equipamentos || !Array.isArray(equipamentos)) {
      return res.status(400).json({ success: false, message: 'Dados de equipamentos inválidos' });
    }

    let processed = 0;
    let errors = 0;

    for (const equip of equipamentos) {
      try {
        // Find equipment by IP and agent assignment
        const equipResult = await db.query(
          'SELECT id FROM equipamentos WHERE ip = $1 AND agent_id = $2',
          [equip.ip, agentId]
        );

        let equipamentoId: number;

        if (equipResult.rows[0]) {
          equipamentoId = equipResult.rows[0].id;
        } else {
          // Auto-register new printer
          const newEquip = await db.query(
            `INSERT INTO equipamentos (cliente, ip, comunidade_snmp, fabricante, modelo, numero_serie, agent_id, status_monitoramento)
             VALUES ($1, $2, 'public', $3, $4, $5, $6, 'ativo')
             RETURNING id`,
            [equip.cliente || 'Agent Discovery', equip.ip, equip.fabricante || null, equip.modelo || null, equip.numero_serie || null, agentId]
          );
          equipamentoId = newEquip.rows[0].id;
        }

        // Save reading
        await db.query(
          `INSERT INTO leituras (
            equipamento_id, contador_total, contador_pb, contador_cor,
            toner_preto, toner_ciano, toner_magenta, toner_amarelo,
            status_online, mensagens_erro, numero_serie_equip, modelo_equip, nome_equip
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            equipamentoId,
            equip.contadores?.total || 0,
            equip.contadores?.pb || 0,
            equip.contadores?.cor || 0,
            equip.toner?.preto || 0,
            equip.toner?.ciano || 0,
            equip.toner?.magenta || 0,
            equip.toner?.amarelo || 0,
            equip.status_online ? 1 : 0,
            equip.mensagens_erro || '',
            equip.numero_serie || '',
            equip.modelo || '',
            equip.nome || '',
          ]
        );

        // Update supplies
        const tonerData = [
          { tipo: 'preto', percentual: equip.toner?.preto || 0 },
          { tipo: 'ciano', percentual: equip.toner?.ciano || 0 },
          { tipo: 'magenta', percentual: equip.toner?.magenta || 0 },
          { tipo: 'amarelo', percentual: equip.toner?.amarelo || 0 },
        ];

        for (const toner of tonerData) {
          const existing = await db.query(
            'SELECT id FROM suprimentos WHERE equipamento_id = $1 AND tipo = $2',
            [equipamentoId, toner.tipo]
          );

          if (existing.rows[0]) {
            await db.query(
              `UPDATE suprimentos SET percentual = $1, ultima_leitura = (NOW() AT TIME ZONE 'UTC')::text, updated_at = (NOW() AT TIME ZONE 'UTC')::text
               WHERE id = $2`,
              [toner.percentual, existing.rows[0].id]
            );
          } else {
            await db.query(
              'INSERT INTO suprimentos (equipamento_id, tipo, percentual) VALUES ($1, $2, $3)',
              [equipamentoId, toner.tipo, toner.percentual]
            );
          }
        }

        // Generate alerts
        if (!equip.status_online) {
          const existingAlert = await db.query(
            `SELECT id FROM alertas WHERE equipamento_id = $1 AND tipo = 'offline' AND resolvido = 0`,
            [equipamentoId]
          );
          if (!existingAlert.rows[0]) {
            await db.query(
              `INSERT INTO alertas (equipamento_id, tipo, mensagem, nivel)
               VALUES ($1, 'offline', $2, 'critical')`,
              [equipamentoId, `Equipamento ${equip.nome || equip.ip} está offline`]
            );
          }
        } else {
          await db.query(
            `UPDATE alertas SET resolvido = 1, resolvido_em = (NOW() AT TIME ZONE 'UTC')::text
             WHERE equipamento_id = $1 AND tipo = 'offline' AND resolvido = 0`,
            [equipamentoId]
          );
        }

        // Toner alerts
        for (const toner of tonerData) {
          if (toner.percentual === 0) {
            const existing = await db.query(
              `SELECT id FROM alertas WHERE equipamento_id = $1 AND tipo = 'toner_zerado' AND mensagem LIKE $2 AND resolvido = 0`,
              [equipamentoId, `%${toner.tipo}%`]
            );
            if (!existing.rows[0]) {
              await db.query(
                `INSERT INTO alertas (equipamento_id, tipo, mensagem, nivel)
                 VALUES ($1, 'toner_zerado', $2, 'critical')`,
                [equipamentoId, `Toner ${toner.tipo} está zerado no equipamento ${equip.nome || equip.ip}`]
              );
            }
          } else if (toner.percentual <= 15) {
            const existing = await db.query(
              `SELECT id FROM alertas WHERE equipamento_id = $1 AND tipo = 'toner_baixo' AND mensagem LIKE $2 AND resolvido = 0`,
              [equipamentoId, `%${toner.tipo}%`]
            );
            if (!existing.rows[0]) {
              await db.query(
                `INSERT INTO alertas (equipamento_id, tipo, mensagem, nivel)
                 VALUES ($1, 'toner_baixo', $2, 'warning')`,
                [equipamentoId, `Toner ${toner.tipo} com ${toner.percentual}% no equipamento ${equip.nome || equip.ip}`]
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

        processed++;
      } catch (error) {
        console.error(`Error processing equipment ${equip.ip}:`, error);
        errors++;
      }
    }

    res.json({
      success: true,
      data: { processed, errors, total: equipamentos.length },
      message: `Dados recebidos: ${processed} processados, ${errors} erros`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao processar dados de coleta',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/agents/:id/logs - Receive logs from agent
router.post('/:id/logs', agentAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const agentId = (req as any).agentId;
    const { logs } = req.body;

    if (!logs || !Array.isArray(logs)) {
      return res.status(400).json({ success: false, message: 'Logs inválidos' });
    }

    for (const log of logs) {
      await db.query(
        `INSERT INTO agent_logs (agent_id, level, message, details)
         VALUES ($1, $2, $3, $4)`,
        [agentId, log.level || 'info', log.message, log.details ? JSON.stringify(log.details) : null]
      );
    }

    res.json({ success: true, message: `${logs.length} logs recebidos` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao salvar logs' });
  }
});

// GET /api/agents - List all agents (admin)
router.get('/', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const result = await db.query(`
      SELECT a.*,
        (SELECT COUNT(*) FROM equipamentos e WHERE e.agent_id = a.id) as printers_count,
        (SELECT COUNT(*) FROM agent_logs al WHERE al.agent_id = a.id AND al.level = 'error' AND al.created_at > (NOW() AT TIME ZONE 'UTC')::text - interval '24 hours') as errors_24h
      FROM agents a
      ORDER BY a.created_at DESC
    `);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao listar agents' });
  }
});

// GET /api/agents/:id - Get agent details (admin)
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const agentResult = await db.query(`
      SELECT a.*,
        (SELECT COUNT(*) FROM equipamentos e WHERE e.agent_id = a.id) as printers_count
      FROM agents a WHERE a.id = $1
    `, [id]);

    const agent = agentResult.rows[0];
    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent não encontrado' });
    }

    const printersResult = await db.query(
      'SELECT id, cliente, ip, modelo, numero_serie, status_monitoramento FROM equipamentos WHERE agent_id = $1',
      [id]
    );

    const logsResult = await db.query(
      'SELECT * FROM agent_logs WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 50',
      [id]
    );

    res.json({
      success: true,
      data: {
        ...agent,
        equipamentos: printersResult.rows,
        logs: logsResult.rows,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao buscar agent' });
  }
});

// PUT /api/agents/:id - Update agent (admin)
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { name, company_id, location, status, config } = req.body;

    const existing = await db.query('SELECT * FROM agents WHERE id = $1', [id]);
    if (!existing.rows[0]) {
      return res.status(404).json({ success: false, message: 'Agent não encontrado' });
    }

    const result = await db.query(
      `UPDATE agents
       SET name = $1, company_id = $2, location = $3, status = $4, config = $5,
           updated_at = (NOW() AT TIME ZONE 'UTC')::text
       WHERE id = $6
       RETURNING *`,
      [
        name || existing.rows[0].name,
        company_id || existing.rows[0].company_id,
        location !== undefined ? location : existing.rows[0].location,
        status || existing.rows[0].status,
        config ? JSON.stringify(config) : existing.rows[0].config,
        id,
      ]
    );

    res.json({ success: true, data: result.rows[0], message: 'Agent atualizado' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao atualizar agent' });
  }
});

// DELETE /api/agents/:id - Delete agent (admin)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const existing = await db.query('SELECT * FROM agents WHERE id = $1', [id]);
    if (!existing.rows[0]) {
      return res.status(404).json({ success: false, message: 'Agent não encontrado' });
    }

    // Unassign printers before deleting
    await db.query('UPDATE equipamentos SET agent_id = NULL WHERE agent_id = $1', [id]);
    await db.query('DELETE FROM agents WHERE id = $1', [id]);

    res.json({ success: true, message: 'Agent excluído com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao excluir agent' });
  }
});

// POST /api/agents/:id/assign - Assign equipment to agent (admin)
router.post('/:id/assign', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { equipamento_id } = req.body;

    if (!equipamento_id) {
      return res.status(400).json({ success: false, message: 'equipamento_id é obrigatório' });
    }

    const agent = await db.query('SELECT id FROM agents WHERE id = $1', [id]);
    if (!agent.rows[0]) {
      return res.status(404).json({ success: false, message: 'Agent não encontrado' });
    }

    const equip = await db.query('SELECT id FROM equipamentos WHERE id = $1', [equipamento_id]);
    if (!equip.rows[0]) {
      return res.status(404).json({ success: false, message: 'Equipamento não encontrado' });
    }

    await db.query('UPDATE equipamentos SET agent_id = $1 WHERE id = $2', [id, equipamento_id]);

    res.json({ success: true, message: 'Equipamento atribuído ao agent' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao atribuir equipamento' });
  }
});

// POST /api/agents/:id/unassign - Unassign equipment from agent (admin)
router.post('/:id/unassign', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { equipamento_id } = req.body;

    if (!equipamento_id) {
      return res.status(400).json({ success: false, message: 'equipamento_id é obrigatório' });
    }

    await db.query('UPDATE equipamentos SET agent_id = NULL WHERE id = $1 AND agent_id = $2', [equipamento_id, id]);

    res.json({ success: true, message: 'Equipamento removido do agent' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao remover equipamento' });
  }
});

// GET /api/agents/:id/logs - Get agent logs (admin)
router.get('/:id/logs', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { level, limit = '100' } = req.query;

    let query = 'SELECT * FROM agent_logs WHERE agent_id = $1';
    const params: any[] = [id];
    let paramIndex = 2;

    if (level) {
      query += ` AND level = $${paramIndex}`;
      params.push(level);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(Number(limit));

    const result = await db.query(query, params);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao buscar logs' });
  }
});

export default router;
