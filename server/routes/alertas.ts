import { Router, Request, Response } from 'express';
import { getDb } from '../database';

const router = Router();

router.get('/stats', async (req: Request, res: Response) => {
  try {
    const db = getDb();

    const totalResult = await db.query('SELECT COUNT(*) as count FROM alertas');
    const total = Number(totalResult.rows[0].count);

    const ativosResult = await db.query('SELECT COUNT(*) as count FROM alertas WHERE resolvido = 0');
    const ativos = Number(ativosResult.rows[0].count);

    const criticosResult = await db.query("SELECT COUNT(*) as count FROM alertas WHERE resolvido = 0 AND nivel = 'critical'");
    const criticos = Number(criticosResult.rows[0].count);

    const warningsResult = await db.query("SELECT COUNT(*) as count FROM alertas WHERE resolvido = 0 AND nivel = 'warning'");
    const warnings = Number(warningsResult.rows[0].count);

    const infosResult = await db.query("SELECT COUNT(*) as count FROM alertas WHERE resolvido = 0 AND nivel = 'info'");
    const infos = Number(infosResult.rows[0].count);

    const porTipoResult = await db.query(`
      SELECT tipo, COUNT(*) as count
      FROM alertas WHERE resolvido = 0
      GROUP BY tipo
      ORDER BY count DESC
    `);

    const ultimosResult = await db.query(`
      SELECT a.*, e.cliente, e.modelo
      FROM alertas a
      LEFT JOIN equipamentos e ON a.equipamento_id = e.id
      ORDER BY a.created_at DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      data: {
        total,
        ativos,
        criticos,
        warnings,
        infos,
        por_tipo: porTipoResult.rows,
        ultimos_alertas: ultimosResult.rows,
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

router.get('/', async (req: Request, res: Response) => {
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
    let paramIndex = 1;

    if (tipo) {
      query += ` AND a.tipo = $${paramIndex}`;
      params.push(tipo);
      paramIndex++;
    }

    if (nivel) {
      query += ` AND a.nivel = $${paramIndex}`;
      params.push(nivel);
      paramIndex++;
    }

    if (resolvido !== undefined) {
      query += ` AND a.resolvido = $${paramIndex}`;
      params.push(resolvido === 'true' ? 1 : 0);
      paramIndex++;
    }

    if (equipamento_id) {
      query += ` AND a.equipamento_id = $${paramIndex}`;
      params.push(equipamento_id);
      paramIndex++;
    }

    const countQuery = query.replace(
      'SELECT a.*, e.cliente, e.modelo, e.numero_serie, e.ip',
      'SELECT COUNT(*) as total',
    );
    const totalResult = await db.query(countQuery, params);
    const total = Number(totalResult.rows[0].total);

    const offset = (Number(page) - 1) * Number(limit);
    query += ` ORDER BY a.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(Number(limit), offset);

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: { data: result.rows, total },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao listar alertas',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.put('/:id/resolver', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const existingResult = await db.query('SELECT * FROM alertas WHERE id = $1', [id]);

    if (!existingResult.rows[0]) {
      return res.status(404).json({
        success: false,
        message: 'Alerta não encontrado',
      });
    }

    const result = await db.query(
      `UPDATE alertas SET resolvido = 1, resolvido_em = (NOW() AT TIME ZONE 'UTC')::text WHERE id = $1
       RETURNING *`,
      [id]
    );

    res.json({
      success: true,
      data: result.rows[0],
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
