import { Router, Request, Response } from 'express';
import { getDb } from '../database';

const router = Router();

router.get('/stats', (req: Request, res: Response) => {
  try {
    const db = getDb();

    const total = (db.prepare('SELECT COUNT(*) as count FROM alertas').get() as any).count;
    const ativos = (db.prepare('SELECT COUNT(*) as count FROM alertas WHERE resolvido = 0').get() as any).count;
    const criticos = (db.prepare("SELECT COUNT(*) as count FROM alertas WHERE resolvido = 0 AND nivel = 'critical'").get() as any).count;
    const warnings = (db.prepare("SELECT COUNT(*) as count FROM alertas WHERE resolvido = 0 AND nivel = 'warning'").get() as any).count;
    const infos = (db.prepare("SELECT COUNT(*) as count FROM alertas WHERE resolvido = 0 AND nivel = 'info'").get() as any).count;

    const porTipo = db.prepare(`
      SELECT tipo, COUNT(*) as count
      FROM alertas WHERE resolvido = 0
      GROUP BY tipo
      ORDER BY count DESC
    `).all();

    const ultimosAlertas = db.prepare(`
      SELECT a.*, e.cliente, e.modelo
      FROM alertas a
      LEFT JOIN equipamentos e ON a.equipamento_id = e.id
      ORDER BY a.created_at DESC
      LIMIT 10
    `).all();

    res.json({
      success: true,
      data: {
        total,
        ativos,
        criticos,
        warnings,
        infos,
        por_tipo: porTipo,
        ultimos_alertas: ultimosAlertas,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar estatísticas de alertas',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { tipo, nivel, resolvido, equipamento_id, page = '1', limit = '50' } = req.query;

    let query = `
      SELECT a.*, e.cliente, e.modelo, e.numero_serie, e.ip
      FROM alertas a
      LEFT JOIN equipamentos e ON a.equipamento_id = e.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (tipo) {
      query += ' AND a.tipo = ?';
      params.push(tipo);
    }

    if (nivel) {
      query += ' AND a.nivel = ?';
      params.push(nivel);
    }

    if (resolvido !== undefined) {
      query += ' AND a.resolvido = ?';
      params.push(resolvido === 'true' ? 1 : 0);
    }

    if (equipamento_id) {
      query += ' AND a.equipamento_id = ?';
      params.push(equipamento_id);
    }

    const countQuery = query.replace(
      'SELECT a.*, e.cliente, e.modelo, e.numero_serie, e.ip',
      'SELECT COUNT(*) as total',
    );
    const totalResult = db.prepare(countQuery).get(...params) as any;
    const total = totalResult.total;

    const offset = (Number(page) - 1) * Number(limit);
    query += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), offset);

    const alertas = db.prepare(query).all(...params);

    res.json({
      success: true,
      data: { data: alertas, total },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao listar alertas',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.put('/:id/resolver', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM alertas WHERE id = ?').get(id);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Alerta não encontrado',
      });
    }

    db.prepare(`
      UPDATE alertas SET resolvido = 1, resolvido_em = datetime('now') WHERE id = ?
    `).run(id);

    const alerta = db.prepare('SELECT * FROM alertas WHERE id = ?').get(id);

    res.json({
      success: true,
      data: alerta,
      message: 'Alerta resolvido com sucesso',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao resolver alerta',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
