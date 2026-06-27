import { Router, Request, Response } from 'express';
import { getDb } from '../database';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { equipamento_id, data_inicio, data_fim, page = '1', limit = '50' } = req.query;

    let query = `
      SELECT l.*, e.cliente, e.modelo, e.numero_serie
      FROM leituras l
      LEFT JOIN equipamentos e ON l.equipamento_id = e.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (equipamento_id) {
      query += ' AND l.equipamento_id = ?';
      params.push(equipamento_id);
    }

    if (data_inicio) {
      query += ' AND l.data_leitura >= ?';
      params.push(data_inicio);
    }

    if (data_fim) {
      query += ' AND l.data_leitura <= ?';
      params.push(data_fim);
    }

    const countQuery = query.replace('SELECT l.*, e.cliente, e.modelo, e.numero_serie', 'SELECT COUNT(*) as total');
    const totalResult = db.prepare(countQuery).get(...params) as any;
    const total = totalResult.total;

    const offset = (Number(page) - 1) * Number(limit);
    query += ' ORDER BY l.data_leitura DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), offset);

    const leituras = db.prepare(query).all(...params);

    res.json({
      success: true,
      data: leituras,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao listar leituras',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/equipamento/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { page = '1', limit = '100' } = req.query;

    const totalResult = db.prepare('SELECT COUNT(*) as total FROM leituras WHERE equipamento_id = ?').get(id) as any;
    const total = totalResult.total;

    const offset = (Number(page) - 1) * Number(limit);
    const leituras = db.prepare(`
      SELECT * FROM leituras
      WHERE equipamento_id = ?
      ORDER BY data_leitura DESC
      LIMIT ? OFFSET ?
    `).all(id, Number(limit), offset);

    res.json({
      success: true,
      data: leituras,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar histórico de leituras',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const leitura = db.prepare(`
      SELECT l.*, e.cliente, e.modelo, e.numero_serie, e.ip
      FROM leituras l
      LEFT JOIN equipamentos e ON l.equipamento_id = e.id
      WHERE l.id = ?
    `).get(id);

    if (!leitura) {
      return res.status(404).json({
        success: false,
        message: 'Leitura não encontrada',
      });
    }

    res.json({ success: true, data: leitura });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar leitura',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
