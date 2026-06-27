import { Router, Request, Response } from 'express';
import { getDb } from '../database';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
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
    let paramIndex = 1;

    if (equipamento_id) {
      query += ` AND l.equipamento_id = $${paramIndex}`;
      params.push(equipamento_id);
      paramIndex++;
    }

    if (data_inicio) {
      query += ` AND l.data_leitura >= $${paramIndex}`;
      params.push(data_inicio);
      paramIndex++;
    }

    if (data_fim) {
      query += ` AND l.data_leitura <= $${paramIndex}`;
      params.push(data_fim);
      paramIndex++;
    }

    const countQuery = query.replace('SELECT l.*, e.cliente, e.modelo, e.numero_serie', 'SELECT COUNT(*) as total');
    const totalResult = await db.query(countQuery, params);
    const total = Number(totalResult.rows[0].total);

    const offset = (Number(page) - 1) * Number(limit);
    query += ` ORDER BY l.data_leitura DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(Number(limit), offset);

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: { data: result.rows, total },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao listar leituras',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/equipamento/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { page = '1', limit = '100' } = req.query;

    const totalResult = await db.query('SELECT COUNT(*) as total FROM leituras WHERE equipamento_id = $1', [id]);
    const total = Number(totalResult.rows[0].total);

    const offset = (Number(page) - 1) * Number(limit);
    const result = await db.query(`
      SELECT * FROM leituras
      WHERE equipamento_id = $1
      ORDER BY data_leitura DESC
      LIMIT $2 OFFSET $3
    `, [id, Number(limit), offset]);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar histórico de leituras',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const result = await db.query(`
      SELECT l.*, e.cliente, e.modelo, e.numero_serie, e.ip
      FROM leituras l
      LEFT JOIN equipamentos e ON l.equipamento_id = e.id
      WHERE l.id = $1
    `, [id]);

    const leitura = result.rows[0];

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
