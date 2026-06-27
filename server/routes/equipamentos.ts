import { Router, Request, Response } from 'express';
import { getDb } from '../database';
import { getPrinterData, getSuppliesData, checkOnline } from '../snmp';

const router = Router();

router.get('/stats', (req: Request, res: Response) => {
  try {
    const db = getDb();

    const totalEquipamentos = (db.prepare('SELECT COUNT(*) as count FROM equipamentos').get() as any).count;

    const ultimaLeituraSubquery = `
      SELECT l.equipamento_id, l.status_online, l.data_leitura
      FROM leituras l
      INNER JOIN (
        SELECT equipamento_id, MAX(data_leitura) as max_data
        FROM leituras
        GROUP BY equipamento_id
      ) latest ON l.equipamento_id = latest.equipamento_id AND l.data_leitura = latest.max_data
    `;

    const onlineCount = (db.prepare(`
      SELECT COUNT(*) as count FROM (${ultimaLeituraSubquery}) WHERE status_online = 1
    `).get() as any).count;

    const offlineCount = (db.prepare(`
      SELECT COUNT(*) as count FROM (${ultimaLeituraSubquery}) WHERE status_online = 0
    `).get() as any).count;

    const tonersBaixos = (db.prepare("SELECT COUNT(*) as count FROM suprimentos WHERE percentual <= 20").get() as any).count;
    const alertasCriticos = (db.prepare("SELECT COUNT(*) as count FROM alertas WHERE resolvido = 0 AND nivel = 'critical'").get() as any).count;

    const now = new Date();
    const firstDayOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const totalPaginasMes = (db.prepare(`
      SELECT COALESCE(SUM(contador_total), 0) as total FROM leituras WHERE data_leitura >= ?
    `).get(firstDayOfMonth) as any).total;

    const clientesVolume = db.prepare(`
      SELECT e.cliente, SUM(l.contador_total) as paginas
      FROM equipamentos e
      INNER JOIN leituras l ON l.equipamento_id = e.id
      WHERE l.data_leitura >= ?
      GROUP BY e.cliente
      ORDER BY paginas DESC
      LIMIT 10
    `).all(firstDayOfMonth);

    res.json({
      success: true,
      data: {
        total_equipamentos: totalEquipamentos,
        online: onlineCount,
        offline: offlineCount,
        toners_baixos: tonersBaixos,
        alertas_criticos: alertasCriticos,
        total_paginas_mes: totalPaginasMes,
        clientes_maior_volume: clientesVolume,
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

router.get('/', (req: Request, res: Response) => {
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

    if (cliente) {
      query += ' AND e.cliente = ?';
      countQuery += ' AND e.cliente = ?';
      params.push(cliente);
      countParams.push(cliente);
    }

    if (status) {
      query += ' AND e.status_monitoramento = ?';
      countQuery += ' AND e.status_monitoramento = ?';
      params.push(status);
      countParams.push(status);
    }

    if (search) {
      const searchClause = ' AND (e.cliente LIKE ? OR e.ip LIKE ? OR e.modelo LIKE ? OR e.numero_serie LIKE ?)';
      const searchTerm = `%${search}%`;
      query += searchClause;
      countQuery += searchClause;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
      countParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    const total = (db.prepare(countQuery).get(...countParams) as any).count;

    const pageNum = Math.max(1, Number(page));
    const perPageNum = Math.max(1, Math.min(100, Number(per_page)));
    const offset = (pageNum - 1) * perPageNum;

    query += ' ORDER BY e.created_at DESC LIMIT ? OFFSET ?';
    params.push(perPageNum, offset);

    const equipamentos = db.prepare(query).all(...params);
    res.json({ success: true, data: equipamentos, total });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao listar equipamentos',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const equipamento = db.prepare('SELECT * FROM equipamentos WHERE id = ?').get(id) as any;

    if (!equipamento) {
      return res.status(404).json({
        success: false,
        message: 'Equipamento não encontrado',
      });
    }

    const ultimaLeitura = db.prepare(`
      SELECT * FROM leituras WHERE equipamento_id = ? ORDER BY data_leitura DESC LIMIT 1
    `).get(id);

    const suprimentos = db.prepare('SELECT * FROM suprimentos WHERE equipamento_id = ?').all(id);

    const configColeta = db.prepare('SELECT * FROM config_coleta WHERE equipamento_id = ?').get(id);

    res.json({
      success: true,
      data: {
        ...equipamento,
        ultima_leitura: ultimaLeitura || null,
        suprimentos,
        config_coleta: configColeta || null,
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

router.post('/', (req: Request, res: Response) => {
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

    const result = db.prepare(`
      INSERT INTO equipamentos (cliente, unidade, ip, comunidade_snmp, fabricante, modelo, numero_serie, localizacao, contrato, status_monitoramento)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
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
    );

    const equipamento = db.prepare('SELECT * FROM equipamentos WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({
      success: true,
      data: equipamento,
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

router.put('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const {
      cliente, unidade, ip, comunidade_snmp, fabricante, modelo,
      numero_serie, localizacao, contrato, status_monitoramento,
    } = req.body;

    const existing = db.prepare('SELECT * FROM equipamentos WHERE id = ?').get(id);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Equipamento não encontrado',
      });
    }

    db.prepare(`
      UPDATE equipamentos
      SET cliente = ?, unidade = ?, ip = ?, comunidade_snmp = ?, fabricante = ?,
          modelo = ?, numero_serie = ?, localizacao = ?, contrato = ?,
          status_monitoramento = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      cliente || (existing as any).cliente,
      unidade || (existing as any).unidade,
      ip || (existing as any).ip,
      comunidade_snmp || (existing as any).comunidade_snmp,
      fabricante || (existing as any).fabricante,
      modelo || (existing as any).modelo,
      numero_serie || (existing as any).numero_serie,
      localizacao || (existing as any).localizacao,
      contrato || (existing as any).contrato,
      status_monitoramento || (existing as any).status_monitoramento,
      id,
    );

    const equipamento = db.prepare('SELECT * FROM equipamentos WHERE id = ?').get(id);

    res.json({
      success: true,
      data: equipamento,
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

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM equipamentos WHERE id = ?').get(id);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Equipamento não encontrado',
      });
    }

    db.prepare('DELETE FROM equipamentos WHERE id = ?').run(id);

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

    const equipamento = db.prepare('SELECT * FROM equipamentos WHERE id = ?').get(id) as any;

    if (!equipamento) {
      return res.status(404).json({
        success: false,
        message: 'Equipamento não encontrado',
      });
    }

    const printerData = await getPrinterData(equipamento.ip, equipamento.comunidade_snmp);

    const leituraResult = db.prepare(`
      INSERT INTO leituras (
        equipamento_id, contador_total, contador_pb, contador_cor,
        toner_preto, toner_ciano, toner_magenta, toner_amarelo,
        status_online, mensagens_erro, numero_serie_equip, modelo_equip, nome_equip
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
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
    );

    const tonerData = [
      { tipo: 'preto', percentual: printerData.toner_preto },
      { tipo: 'ciano', percentual: printerData.toner_ciano },
      { tipo: 'magenta', percentual: printerData.toner_magenta },
      { tipo: 'amarelo', percentual: printerData.toner_amarelo },
    ];

    for (const toner of tonerData) {
      const existing = db.prepare('SELECT id FROM suprimentos WHERE equipamento_id = ? AND tipo = ?')
        .get(equipamento.id, toner.tipo) as any;

      if (existing) {
        db.prepare(`
          UPDATE suprimentos SET percentual = ?, ultima_leitura = datetime('now'), updated_at = datetime('now')
          WHERE id = ?
        `).run(toner.percentual, existing.id);
      } else {
        db.prepare(`
          INSERT INTO suprimentos (equipamento_id, tipo, percentual)
          VALUES (?, ?, ?)
        `).run(equipamento.id, toner.tipo, toner.percentual);
      }
    }

    const leitura = db.prepare('SELECT * FROM leituras WHERE id = ?').get(Number(leituraResult.lastInsertRowid));

    res.json({
      success: true,
      data: leitura,
      message: 'Coleta realizada com sucesso',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao realizar coleta',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
