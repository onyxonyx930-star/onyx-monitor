import { Router, Request, Response } from 'express';
import { getDb } from '../database';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { equipamento_id, tipo } = req.query;

    let query = `
      SELECT s.*, e.cliente, e.modelo, e.numero_serie, e.ip
      FROM suprimentos s
      LEFT JOIN equipamentos e ON s.equipamento_id = e.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (equipamento_id) {
      query += ` AND s.equipamento_id = $${paramIndex}`;
      params.push(equipamento_id);
      paramIndex++;
    }

    if (tipo) {
      query += ` AND s.tipo = $${paramIndex}`;
      params.push(tipo);
      paramIndex++;
    }

    query += ' ORDER BY s.percentual ASC';

    const result = await db.query(query, params);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao listar suprimentos',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/equipamento/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const result = await db.query('SELECT * FROM suprimentos WHERE equipamento_id = $1', [id]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar suprimentos do equipamento',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { percentual, previsao_troca } = req.body;

    const existingResult = await db.query('SELECT * FROM suprimentos WHERE id = $1', [id]);
    const existing = existingResult.rows[0];

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Suprimento não encontrado',
      });
    }

    const result = await db.query(
      `UPDATE suprimentos
       SET percentual = $1, previsao_troca = $2, updated_at = (NOW() AT TIME ZONE 'UTC')::text
       WHERE id = $3
       RETURNING *`,
      [
        percentual !== undefined ? percentual : existing.percentual,
        previsao_troca !== undefined ? previsao_troca : existing.previsao_troca,
        id,
      ]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Suprimento atualizado com sucesso',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar suprimento',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
