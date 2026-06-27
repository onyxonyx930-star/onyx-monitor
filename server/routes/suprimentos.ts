import { Router, Request, Response } from 'express';
import { getDb } from '../database';

const router = Router();

router.get('/', (req: Request, res: Response) => {
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

    if (equipamento_id) {
      query += ' AND s.equipamento_id = ?';
      params.push(equipamento_id);
    }

    if (tipo) {
      query += ' AND s.tipo = ?';
      params.push(tipo);
    }

    query += ' ORDER BY s.percentual ASC';

    const suprimentos = db.prepare(query).all(...params);

    res.json({ success: true, data: suprimentos });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao listar suprimentos',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/equipamento/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const suprimentos = db.prepare('SELECT * FROM suprimentos WHERE equipamento_id = ?').all(id);

    res.json({ success: true, data: suprimentos });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar suprimentos do equipamento',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.put('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { percentual, previsao_troca } = req.body;

    const existing = db.prepare('SELECT * FROM suprimentos WHERE id = ?').get(id);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Suprimento não encontrado',
      });
    }

    db.prepare(`
      UPDATE suprimentos
      SET percentual = ?, previsao_troca = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      percentual !== undefined ? percentual : (existing as any).percentual,
      previsao_troca !== undefined ? previsao_troca : (existing as any).previsao_troca,
      id,
    );

    const suprimento = db.prepare('SELECT * FROM suprimentos WHERE id = ?').get(id);

    res.json({
      success: true,
      data: suprimento,
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
