import { Router, Request, Response } from 'express';
import { getDb } from '../database';

const router = Router();

router.get('/mensal', (req: Request, res: Response) => {
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
      WHERE l.data_leitura >= ? AND l.data_leitura <= ?
    `;
    const params: any[] = [startDate, endDate];

    if (cliente) {
      query += ' AND e.cliente = ?';
      params.push(cliente);
    }

    query += ' GROUP BY e.id ORDER BY e.cliente, e.modelo';

    const report = db.prepare(query).all(...params);

    const summaryQuery = `
      SELECT
        e.cliente,
        COUNT(DISTINCT e.id) as equipamentos,
        SUM(CASE WHEN l.status_online = 1 THEN 1 ELSE 0 END) as leituras_online,
        SUM(CASE WHEN l.status_online = 0 THEN 1 ELSE 0 END) as leituras_offline
      FROM equipamentos e
      LEFT JOIN leituras l ON l.equipamento_id = e.id AND l.data_leitura >= ? AND l.data_leitura <= ?
      WHERE 1=1
    `;
    const summaryParams: any[] = [startDate, endDate];

    if (cliente) {
      query += ' AND e.cliente = ?';
      summaryParams.push(cliente);
    }

    const summary = db.prepare(summaryQuery).all(...summaryParams);

    res.json({
      success: true,
      data: {
        periodo: { mes: currentMonth, ano: currentYear, startDate, endDate },
        detalhes: report,
        resumo_por_cliente: summary,
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

router.get('/equipamento/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { data_inicio, data_fim } = req.query;

    const equipamento = db.prepare('SELECT * FROM equipamentos WHERE id = ?').get(id);

    if (!equipamento) {
      return res.status(404).json({
        success: false,
        message: 'Equipamento não encontrado',
      });
    }

    let query = 'SELECT * FROM leituras WHERE equipamento_id = ?';
    const params: any[] = [id];

    if (data_inicio) {
      query += ' AND data_leitura >= ?';
      params.push(data_inicio);
    }

    if (data_fim) {
      query += ' AND data_leitura <= ?';
      params.push(data_fim);
    }

    query += ' ORDER BY data_leitura ASC';

    const leituras = db.prepare(query).all(...params);

    const stats = db.prepare(`
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
      WHERE equipamento_id = ?
    `).get(id);

    const suprimentos = db.prepare('SELECT * FROM suprimentos WHERE equipamento_id = ?').all(id);

    const alertas = db.prepare(`
      SELECT * FROM alertas
      WHERE equipamento_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(id);

    res.json({
      success: true,
      data: {
        equipamento,
        periodo: { data_inicio: data_inicio || null, data_fim: data_fim || null },
        estatisticas: stats,
        leituras,
        suprimentos,
        alertas,
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

router.get('/consumo', (req: Request, res: Response) => {
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

    if (cliente) {
      query += ' AND e.cliente = ?';
      params.push(cliente);
    }

    if (data_inicio) {
      query += ' AND l.data_leitura >= ?';
      params.push(data_inicio);
    }

    if (data_fim) {
      query += ' AND l.data_leitura <= ?';
      params.push(data_fim);
    }

    query += ' GROUP BY e.id ORDER BY e.cliente, total_prints DESC';

    const consumo = db.prepare(query).all(...params);

    const totalByClient = db.prepare(`
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
        ${data_inicio ? 'AND data_leitura >= ?' : ''}
        ${data_fim ? 'AND data_leitura <= ?' : ''}
        GROUP BY equipamento_id
      ) l
      LEFT JOIN equipamentos e ON l.equipamento_id = e.id
      GROUP BY e.cliente
      ORDER BY total_prints DESC
    `).all(...params);

    res.json({
      success: true,
      data: {
        consumo_por_equipamento: consumo,
        consumo_por_cliente: totalByClient,
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
    const XLSX = await import('xlsx');
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

    if (cliente) {
      query += ' AND e.cliente = ?';
      params.push(cliente);
    }

    if (data_inicio) {
      query += ' AND l.data_leitura >= ?';
      params.push(data_inicio);
    }

    if (data_fim) {
      query += ' AND l.data_leitura <= ?';
      params.push(data_fim);
    }

    query += ' ORDER BY e.cliente, l.data_leitura DESC';

    const data = db.prepare(query).all(...params);

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatório');

    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio_onyx.xlsx');
    res.send(excelBuffer);
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

    if (cliente) {
      query += ' AND e.cliente = ?';
      params.push(cliente);
    }

    if (data_inicio) {
      query += ' AND l.data_leitura >= ?';
      params.push(data_inicio);
    }

    if (data_fim) {
      query += ' AND l.data_leitura <= ?';
      params.push(data_fim);
    }

    query += ' GROUP BY e.id ORDER BY e.cliente';

    const data = db.prepare(query).all(...params) as any[];

    const tableData = data.map((row) => [
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
