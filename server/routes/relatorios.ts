import { Router, Request, Response } from 'express';
import { getDb } from '../database';

const router = Router();

router.get('/mensal', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { mes, ano, cliente } = req.query;

    const currentMonth = mes ? Number(mes) : new Date().getMonth() + 1;
    const currentYear = ano ? Number(ano) : new Date().getFullYear();
    const startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
    const endDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-31`;

    let query = `
      SELECT
        e.cliente,
        e.modelo,
        e.numero_serie,
        e.ip,
        COUNT(l.id) as total_leituras,
        MAX(l.contador_total) - MIN(l.contador_total) as impressions_month,
        MAX(l.contador_pb) - MIN(l.contador_pb) as pb_month,
        MAX(l.contador_cor) - MIN(l.contador_cor) as color_month,
        AVG(l.toner_preto) as avg_toner_preto,
        AVG(l.toner_ciano) as avg_toner_ciano,
        AVG(l.toner_magenta) as avg_toner_magenta,
        AVG(l.toner_amarelo) as avg_toner_amarelo
      FROM leituras l
      LEFT JOIN equipamentos e ON l.equipamento_id = e.id
      WHERE l.data_leitura >= $1 AND l.data_leitura <= $2
    `;
    const params: any[] = [startDate, endDate];
    let paramIndex = 3;

    if (cliente) {
      query += ` AND e.cliente = $${paramIndex}`;
      params.push(cliente);
      paramIndex++;
    }

    query += ' GROUP BY e.id ORDER BY e.cliente, e.modelo';

    const reportResult = await db.query(query, params);

    let summaryQuery = `
      SELECT
        e.cliente,
        COUNT(DISTINCT e.id) as equipamentos,
        SUM(CASE WHEN l.status_online = 1 THEN 1 ELSE 0 END) as leituras_online,
        SUM(CASE WHEN l.status_online = 0 THEN 1 ELSE 0 END) as leituras_offline
      FROM equipamentos e
      LEFT JOIN leituras l ON l.equipamento_id = e.id AND l.data_leitura >= $1 AND l.data_leitura <= $2
      WHERE 1=1
    `;
    const summaryParams: any[] = [startDate, endDate];
    let summaryParamIndex = 3;

    if (cliente) {
      summaryQuery += ` AND e.cliente = $${summaryParamIndex}`;
      summaryParams.push(cliente);
      summaryParamIndex++;
    }

    const summaryResult = await db.query(summaryQuery, summaryParams);

    res.json({
      success: true,
      data: {
        periodo: { mes: currentMonth, ano: currentYear, startDate, endDate },
        detalhes: reportResult.rows,
        resumo_por_cliente: summaryResult.rows,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao gerar relatório mensal',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/equipamento/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { data_inicio, data_fim } = req.query;

    const equipResult = await db.query('SELECT * FROM equipamentos WHERE id = $1', [id]);
    const equipamento = equipResult.rows[0];

    if (!equipamento) {
      return res.status(404).json({
        success: false,
        message: 'Equipamento não encontrado',
      });
    }

    let query = 'SELECT * FROM leituras WHERE equipamento_id = $1';
    const params: any[] = [id];
    let paramIndex = 2;

    if (data_inicio) {
      query += ` AND data_leitura >= $${paramIndex}`;
      params.push(data_inicio);
      paramIndex++;
    }

    if (data_fim) {
      query += ` AND data_leitura <= $${paramIndex}`;
      params.push(data_fim);
      paramIndex++;
    }

    query += ' ORDER BY data_leitura ASC';

    const leiturasResult = await db.query(query, params);

    const statsResult = await db.query(`
      SELECT
        MIN(contador_total) as counter_start,
        MAX(contador_total) as counter_end,
        MAX(contador_total) - MIN(contador_total) as total_prints,
        MAX(contador_pb) - MIN(contador_pb) as pb_prints,
        MAX(contador_cor) - MIN(contador_cor) as color_prints,
        COUNT(*) as total_readings,
        SUM(CASE WHEN status_online = 1 THEN 1 ELSE 0 END) as online_count,
        SUM(CASE WHEN status_online = 0 THEN 1 ELSE 0 END) as offline_count
      FROM leituras
      WHERE equipamento_id = $1
    `, [id]);

    const suprimentosResult = await db.query('SELECT * FROM suprimentos WHERE equipamento_id = $1', [id]);

    const alertasResult = await db.query(`
      SELECT * FROM alertas
      WHERE equipamento_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `, [id]);

    res.json({
      success: true,
      data: {
        equipamento,
        periodo: { data_inicio: data_inicio || null, data_fim: data_fim || null },
        estatisticas: statsResult.rows[0],
        leituras: leiturasResult.rows,
        suprimentos: suprimentosResult.rows,
        alertas: alertasResult.rows,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao gerar relatório do equipamento',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/consumo', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { cliente, data_inicio, data_fim } = req.query;

    let query = `
      SELECT
        e.cliente,
        e.id as equipamento_id,
        e.modelo,
        e.numero_serie,
        e.ip,
        MAX(l.contador_total) - MIN(l.contador_total) as total_prints,
        MAX(l.contador_pb) - MIN(l.contador_pb) as pb_prints,
        MAX(l.contador_cor) - MIN(l.contador_cor) as color_prints,
        MIN(l.data_leitura) as primeira_leitura,
        MAX(l.data_leitura) as ultima_leitura
      FROM leituras l
      LEFT JOIN equipamentos e ON l.equipamento_id = e.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (cliente) {
      query += ` AND e.cliente = $${paramIndex}`;
      params.push(cliente);
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

    query += ' GROUP BY e.id ORDER BY e.cliente, total_prints DESC';

    const consumoResult = await db.query(query, params);

    let totalByClientQuery = `
      SELECT
        e.cliente,
        SUM(max_counter - min_counter) as total_prints
      FROM (
        SELECT
          equipamento_id,
          MAX(contador_total) as max_counter,
          MIN(contador_total) as min_counter
        FROM leituras
        WHERE 1=1
    `;
    const totalByClientParams: any[] = [];
    let totalParamIndex = 1;

    if (data_inicio) {
      totalByClientQuery += ` AND data_leitura >= $${totalParamIndex}`;
      totalByClientParams.push(data_inicio);
      totalParamIndex++;
    }

    if (data_fim) {
      totalByClientQuery += ` AND data_leitura <= $${totalParamIndex}`;
      totalByClientParams.push(data_fim);
      totalParamIndex++;
    }

    totalByClientQuery += `
        GROUP BY equipamento_id
      ) l
      LEFT JOIN equipamentos e ON l.equipamento_id = e.id
      GROUP BY e.cliente
      ORDER BY total_prints DESC
    `;

    const totalByClientResult = await db.query(totalByClientQuery, totalByClientParams);

    res.json({
      success: true,
      data: {
        consumo_por_equipamento: consumoResult.rows,
        consumo_por_cliente: totalByClientResult.rows,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao gerar relatório de consumo',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/export/excel', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { cliente, data_inicio, data_fim } = req.query;

    let query = `
      SELECT
        e.cliente,
        e.unidade,
        e.ip,
        e.modelo,
        e.numero_serie,
        l.data_leitura,
        l.contador_total,
        l.contador_pb,
        l.contador_cor,
        l.toner_preto,
        l.toner_ciano,
        l.toner_magenta,
        l.toner_amarelo,
        l.status_online
      FROM leituras l
      LEFT JOIN equipamentos e ON l.equipamento_id = e.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (cliente) {
      query += ` AND e.cliente = $${paramIndex}`;
      params.push(cliente);
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

    query += ' ORDER BY e.cliente, l.data_leitura DESC';

    const dataResult = await db.query(query, params);
    const rows = dataResult.rows;

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Nenhum dado encontrado para exportação' });
    }

    const headers = Object.keys(rows[0]);
    const csvRows = [
      '\uFEFF' + headers.join(';'),
      ...rows.map((row: any) => headers.map((h) => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        const str = String(val);
        return str.includes(';') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(';'))
    ];

    const csvBuffer = Buffer.from(csvRows.join('\n'), 'utf-8');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio_onyx.csv');
    res.send(csvBuffer);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao exportar para Excel',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/export/pdf', async (req: Request, res: Response) => {
  try {
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const db = getDb();
    const { cliente, data_inicio, data_fim } = req.query;

    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text('Relatório Onyx Monitor', 14, 22);

    doc.setFontSize(10);
    const periodo = `Período: ${data_inicio || 'Início'} a ${data_fim || 'Fim'}`;
    doc.text(periodo, 14, 30);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 36);

    let query = `
      SELECT
        e.cliente,
        e.ip,
        e.modelo,
        e.numero_serie,
        MAX(l.contador_total) - MIN(l.contador_total) as total_prints,
        MAX(l.contador_pb) - MIN(l.contador_pb) as pb_prints,
        MAX(l.contador_cor) - MIN(l.contador_cor) as color_prints
      FROM leituras l
      LEFT JOIN equipamentos e ON l.equipamento_id = e.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (cliente) {
      query += ` AND e.cliente = $${paramIndex}`;
      params.push(cliente);
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

    query += ' GROUP BY e.id ORDER BY e.cliente';

    const dataResult = await db.query(query, params);

    const tableData = dataResult.rows.map((row) => [
      row.cliente || '',
      row.ip || '',
      row.modelo || '',
      row.numero_serie || '',
      row.total_prints || 0,
      row.pb_prints || 0,
      row.color_prints || 0,
    ]);

    autoTable(doc, {
      startY: 42,
      head: [['Cliente', 'IP', 'Modelo', 'Série', 'Total', 'P&B', 'Cor']],
      body: tableData,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 30, 30] },
    });

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio_onyx.pdf');
    res.send(pdfBuffer);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao exportar para PDF',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
