import { Router, Request, Response } from 'express';
import { getDb } from '../database';

const router = Router();

// GET /api/auditoria - List audit records with filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { cliente, equipamento_id, usuario, documento, data_inicio, data_fim, fonte, page = '1', per_page = '50' } = req.query;

    let query = `
      SELECT a.*, e.ip as ip_equipamento_sql, e.modelo as modelo_sql, e.numero_serie as numero_serie_sql
      FROM auditoria_impressoes a
      LEFT JOIN equipamentos e ON a.equipamento_id = e.id
      WHERE 1=1
    `;
    let countQuery = `SELECT COUNT(*) FROM auditoria_impressoes a LEFT JOIN equipamentos e ON a.equipamento_id = e.id WHERE 1=1`;
    const params: any[] = [];
    const countParams: any[] = [];
    let paramIndex = 1;
    let countParamIndex = 1;

    if (cliente) {
      query += ` AND a.cliente = $${paramIndex}`;
      params.push(cliente);
      countQuery += ` AND a.cliente = $${countParamIndex}`;
      countParams.push(cliente);
      paramIndex++;
      countParamIndex++;
    }
    if (equipamento_id) {
      query += ` AND a.equipamento_id = $${paramIndex}`;
      params.push(equipamento_id);
      countQuery += ` AND a.equipamento_id = $${countParamIndex}`;
      countParams.push(equipamento_id);
      paramIndex++;
      countParamIndex++;
    }
    if (usuario) {
      query += ` AND a.usuario ILIKE $${paramIndex}`;
      params.push(`%${usuario}%`);
      countQuery += ` AND a.usuario ILIKE $${countParamIndex}`;
      countParams.push(`%${usuario}%`);
      paramIndex++;
      countParamIndex++;
    }
    if (documento) {
      query += ` AND a.documento ILIKE $${paramIndex}`;
      params.push(`%${documento}%`);
      countQuery += ` AND a.documento ILIKE $${countParamIndex}`;
      countParams.push(`%${documento}%`);
      paramIndex++;
      countParamIndex++;
    }
    if (data_inicio) {
      query += ` AND a.data_impressao >= $${paramIndex}`;
      params.push(data_inicio);
      countQuery += ` AND a.data_impressao >= $${countParamIndex}`;
      countParams.push(data_inicio);
      paramIndex++;
      countParamIndex++;
    }
    if (data_fim) {
      query += ` AND a.data_impressao <= $${paramIndex}`;
      params.push(data_fim);
      countQuery += ` AND a.data_impressao <= $${countParamIndex}`;
      countParams.push(data_fim);
      paramIndex++;
      countParamIndex++;
    }
    if (fonte) {
      query += ` AND a.fonte = $${paramIndex}`;
      params.push(fonte);
      countQuery += ` AND a.fonte = $${countParamIndex}`;
      countParams.push(fonte);
      paramIndex++;
      countParamIndex++;
    }

    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    const offset = (parseInt(page as string) - 1) * parseInt(per_page as string);
    query += ` ORDER BY a.data_impressao DESC, a.hora_impressao DESC`;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(per_page as string), offset);

    const result = await db.query(query, params);

    res.json({ success: true, data: result.rows, total, page: parseInt(page as string), per_page: parseInt(per_page as string) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao listar auditoria', error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// GET /api/auditoria/stats - Dashboard stats for audit
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { data_inicio, data_fim } = req.query;

    let dateFilter = '';
    const params: any[] = [];
    if (data_inicio) { dateFilter += ` AND data_impressao >= $${params.length + 1}`; params.push(data_inicio); }
    if (data_fim) { dateFilter += ` AND data_impressao <= $${params.length + 1}`; params.push(data_fim); }

    const [totalResult, porUsuario, porEquipamento, porCliente, porMes, porFonte, porCor, porStatus] = await Promise.all([
      db.query(`SELECT COUNT(*) as total, COALESCE(SUM(total_paginas),0) as total_paginas FROM auditoria_impressoes WHERE 1=1${dateFilter}`, params),
      db.query(`SELECT usuario, COUNT(*) as total_impressoes, SUM(total_paginas) as total_paginas FROM auditoria_impressoes WHERE usuario IS NOT NULL AND usuario != ''${dateFilter} GROUP BY usuario ORDER BY total_paginas DESC LIMIT 10`, params),
      db.query(`SELECT a.equipamento_id, e.modelo, e.ip, COUNT(*) as total_impressoes, SUM(a.total_paginas) as total_paginas FROM auditoria_impressoes a LEFT JOIN equipamentos e ON a.equipamento_id = e.id${dateFilter ? ` WHERE 1=1${dateFilter}` : ''} GROUP BY a.equipamento_id, e.modelo, e.ip ORDER BY total_paginas DESC LIMIT 10`, params),
      db.query(`SELECT cliente, COUNT(*) as total_impressoes, SUM(total_paginas) as total_paginas FROM auditoria_impressoes WHERE cliente IS NOT NULL AND cliente != ''${dateFilter} GROUP BY cliente ORDER BY total_paginas DESC LIMIT 10`, params),
      db.query(`SELECT SUBSTR(data_impressao, 1, 7) as mes, COUNT(*) as total_impressoes, SUM(total_paginas) as total_paginas FROM auditoria_impressoes WHERE 1=1${dateFilter} GROUP BY mes ORDER BY mes DESC LIMIT 12`, params),
      db.query(`SELECT fonte, COUNT(*) as total FROM auditoria_impressoes WHERE 1=1${dateFilter} GROUP BY fonte`, params),
      db.query(`SELECT CASE WHEN colorida = 1 THEN 'Colorida' ELSE 'P&B' END as tipo, COUNT(*) as total, SUM(total_paginas) as paginas FROM auditoria_impressoes WHERE 1=1${dateFilter} GROUP BY colorida`, params),
      db.query(`SELECT status_impressao, COUNT(*) as total FROM auditoria_impressoes WHERE 1=1${dateFilter} GROUP BY status_impressao`, params),
    ]);

    res.json({
      success: true,
      data: {
        total_registros: parseInt(totalResult.rows[0].total),
        total_paginas: parseInt(totalResult.rows[0].total_paginas),
        por_usuario: porUsuario.rows,
        por_equipamento: porEquipamento.rows,
        por_cliente: porCliente.rows,
        por_mes: porMes.rows,
        por_fonte: porFonte.rows,
        por_cor: porCor.rows,
        por_status: porStatus.rows,
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao buscar estatísticas de auditoria', error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// POST /api/auditoria - Create audit record
router.post('/', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const {
      equipamento_id, cliente, usuario, computador, documento,
      data_impressao, hora_impressao, total_paginas, colorida,
      duplex, tamanho_papel, status_impressao, fonte, dados_extras
    } = req.body;

    const result = await db.query(
      `INSERT INTO auditoria_impressoes (
        equipamento_id, cliente, usuario, computador, documento,
        data_impressao, hora_impressao, total_paginas, colorida,
        duplex, tamanho_papel, status_impressao, fonte, dados_extras
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        equipamento_id || null, cliente || null, usuario || null, computador || null, documento || null,
        data_impressao || (new Date().toISOString().split('T')[0]),
        hora_impressao || new Date().toTimeString().slice(0, 8),
        total_paginas || 1, colorida ? 1 : 0, duplex ? 1 : 0,
        tamanho_papel || 'A4', status_impressao || 'concluida', fonte || 'manual',
        dados_extras ? JSON.stringify(dados_extras) : '{}'
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao criar registro de auditoria', error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// POST /api/auditoria/batch - Batch insert audit records
router.post('/batch', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { records } = req.body;

    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ success: false, message: 'Nenhum registro fornecido' });
    }

    let inserted = 0;
    for (const rec of records) {
      try {
        await db.query(
          `INSERT INTO auditoria_impressoes (
            equipamento_id, cliente, usuario, computador, documento,
            data_impressao, hora_impressao, total_paginas, colorida,
            duplex, tamanho_papel, status_impressao, fonte, ip_equipamento,
            numero_serie, modelo_equip, dados_extras
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [
            rec.equipamento_id || null, rec.cliente || null, rec.usuario || null,
            rec.computador || null, rec.documento || null,
            rec.data_impressao || new Date().toISOString().split('T')[0],
            rec.hora_impressao || new Date().toTimeString().slice(0, 8),
            rec.total_paginas || 1, rec.colorida ? 1 : 0, rec.duplex ? 1 : 0,
            rec.tamanho_papel || 'A4', rec.status_impressao || 'concluida',
            rec.fonte || 'spooler', rec.ip_equipamento || null,
            rec.numero_serie || null, rec.modelo_equip || null,
            rec.dados_extras ? JSON.stringify(rec.dados_extras) : '{}'
          ]
        );
        inserted++;
      } catch (e) {
        console.error('Error inserting audit record:', e);
      }
    }

    res.json({ success: true, data: { inserted, total: records.length } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao inserir registros', error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// DELETE /api/auditoria/:id - Delete audit record
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    await db.query('DELETE FROM auditoria_impressoes WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Registro excluído' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao excluir registro' });
  }
});

// GET /api/auditoria/export/csv - Export audit as CSV
router.get('/export/csv', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { cliente, equipamento_id, usuario, data_inicio, data_fim } = req.query;

    let query = `
      SELECT a.usuario, a.computador, a.documento, a.data_impressao, a.hora_impressao,
             e.modelo as equipamento, a.cliente, a.total_paginas, a.colorida, a.duplex,
             a.tamanho_papel, a.status_impressao, a.fonte
      FROM auditoria_impressoes a
      LEFT JOIN equipamentos e ON a.equipamento_id = e.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let idx = 1;
    if (cliente) { query += ` AND a.cliente = $${idx}`; params.push(cliente); idx++; }
    if (equipamento_id) { query += ` AND a.equipamento_id = $${idx}`; params.push(equipamento_id); idx++; }
    if (usuario) { query += ` AND a.usuario ILIKE $${idx}`; params.push(`%${usuario}%`); idx++; }
    if (data_inicio) { query += ` AND a.data_impressao >= $${idx}`; params.push(data_inicio); idx++; }
    if (data_fim) { query += ` AND a.data_impressao <= $${idx}`; params.push(data_fim); idx++; }
    query += ' ORDER BY a.data_impressao DESC';

    const result = await db.query(query, params);
    const rows = result.rows;

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Nenhum dado encontrado' });
    }

    const headers = ['Usuário', 'Computador', 'Documento', 'Data', 'Hora', 'Equipamento', 'Cliente', 'Páginas', 'Colorida', 'Duplex', 'Papel', 'Status', 'Fonte'];
    const csvRows = [
      '\uFEFF' + headers.join(';'),
      ...rows.map((r: any) => [
        r.usuario || '', r.computador || '', r.documento || '', r.data_impressao || '', r.hora_impressao || '',
        r.equipamento || '', r.cliente || '', r.total_paginas || 0, r.colorida ? 'Sim' : 'Não',
        r.duplex ? 'Sim' : 'Não', r.tamanho_papel || 'A4', r.status_impressao || '', r.fonte || ''
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=auditoria_impressoes.csv');
    res.send(Buffer.from(csvRows.join('\n'), 'utf-8'));
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao exportar CSV' });
  }
});

// Config routes
router.get('/config', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const result = await db.query(`
      SELECT c.*, e.modelo, e.ip
      FROM auditoria_config c
      LEFT JOIN equipamentos e ON c.equipamento_id = e.id
      ORDER BY c.created_at DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao listar configurações' });
  }
});

router.post('/config', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { tipo_integracao, equipamento_id, config, ativo } = req.body;
    const result = await db.query(
      `INSERT INTO auditoria_config (tipo_integracao, equipamento_id, config, ativo) VALUES ($1,$2,$3,$4) RETURNING *`,
      [tipo_integracao, equipamento_id || null, JSON.stringify(config || {}), ativo !== undefined ? (ativo ? 1 : 0) : 1]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao criar configuração' });
  }
});

router.delete('/config/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    await db.query('DELETE FROM auditoria_config WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Configuração excluída' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao excluir configuração' });
  }
});

export default router;
