import { query, getDb } from './_lib/db.js';
import { hashPassword, signToken, requireAuth, requireAdmin } from './_lib/auth.js';

function json(data: any, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' }
  });
}

function error(message: string, status = 500, extra?: any) {
  return json({ success: false, message, ...extra }, status);
}

function parseUrl(url: string) {
  let pathname: string;
  let searchParams: URLSearchParams;
  try {
    const u = new URL(url);
    pathname = u.pathname;
    searchParams = u.searchParams;
  } catch {
    const idx = url.indexOf('?');
    pathname = idx >= 0 ? url.slice(0, idx) : url;
    searchParams = new URLSearchParams(idx >= 0 ? url.slice(idx + 1) : '');
  }
  const path = pathname.replace(/^\/api\/?/, '/').replace(/\/+$/, '') || '/';
  const params: Record<string, string> = {};
  searchParams.forEach((v, k) => { params[k] = v; });
  return { path, params, pathname };
}

function getSegment(path: string, index: number): string | undefined {
  return path.split('/')[index + 1];
}

async function readBody(req: Request | any): Promise<any> {
  if (typeof req.json === 'function') return readBody(req);
  if (typeof req.body === 'object') return req.body;
  const text = typeof req.text === 'function' ? await req.text() : await new Response(req).text();
  return text ? JSON.parse(text) : {};
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' } });
    }

    const { path, params } = parseUrl(request.url);

    try {
      if (path === '/health') return json({ status: 'ok', timestamp: new Date().toISOString() });
      if (path.startsWith('/auth')) return handleAuth(request, path, params);
      if (path.startsWith('/equipamentos')) return handleEquipamentos(request, path, params);
      if (path.startsWith('/leituras')) return handleLeituras(request, path, params);
      if (path.startsWith('/suprimentos')) return handleSuprimentos(request, path, params);
      if (path.startsWith('/alertas')) return handleAlertas(request, path, params);
      if (path.startsWith('/relatorios')) return handleRelatorios(request, path, params);
      if (path.startsWith('/agents')) return handleAgents(request, path, params);
      if (path.startsWith('/auditoria')) return handleAuditoria(request, path, params);
      return error('Rota nÃ£o encontrada', 404);
    } catch (e: any) {
      console.error('API Error:', e);
      return error(e?.message || 'Erro interno', 500);
    }
  }
};

// ======================== AUTH ========================
async function handleAuth(req: Request, path: string, params: Record<string, string>) {
  if (path === '/auth/login' && req.method === 'POST') {
    const body = await readBody(req) as any;
    const { email, senha } = body;
    if (!email || !senha) return error('Email e senha sÃ£o obrigatÃ³rios', 400);

    const result = await query('SELECT * FROM usuarios WHERE email = $1 AND ativo = 1', [email]);
    const user = result.rows[0];
    if (!user || hashPassword(senha) !== user.senha_hash) return error('Credenciais invÃ¡lidas', 401);

    const token = signToken({ userId: user.id, email: user.email, role: user.role });
    return json({ success: true, data: { token, user: { id: user.id, nome: user.nome, email: user.email, role: user.role } } });
  }

  if (path === '/auth/me' && req.method === 'GET') {
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    return json({ success: true, data: auth.user });
  }

  if (path === '/auth/usuarios' && req.method === 'GET') {
    const admin = await requireAdmin(req);
    if (admin.error) return admin.error;
    const result = await query('SELECT id, nome, email, role, cliente_id, ativo, created_at FROM usuarios ORDER BY created_at DESC');
    return json({ success: true, data: result.rows });
  }

  if (path === '/auth/usuarios' && req.method === 'POST') {
    const admin = await requireAdmin(req);
    if (admin.error) return admin.error;
    const body = await readBody(req) as any;
    const { nome, email, senha, role, cliente_id } = body;
    if (!nome || !email || !senha) return error('Nome, email e senha sÃ£o obrigatÃ³rios', 400);
    const existing = await query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (existing.rows[0]) return error('JÃ¡ existe um usuÃ¡rio com este email', 409);
    const result = await query(
      `INSERT INTO usuarios (nome, email, senha_hash, role, cliente_id, ativo) VALUES ($1,$2,$3,$4,$5,1) RETURNING id, nome, email, role, cliente_id, ativo, created_at`,
      [nome, email, hashPassword(senha), role || 'cliente', cliente_id || null]
    );
    return json({ success: true, data: result.rows[0], message: 'UsuÃ¡rio criado com sucesso' }, 201);
  }

  return error('Rota de auth nÃ£o encontrada', 404);
}

// ======================== EQUIPAMENTOS ========================
function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return false;
  return parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || parts[0] === 127 || parts[0] === 0;
}

async function handleEquipamentos(req: Request, path: string, params: Record<string, string>) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;

  if (path === '/equipamentos/stats' && req.method === 'GET') {
    const totalResult = await query('SELECT COUNT(*) as count FROM equipamentos');
    const total = Number(totalResult.rows[0].count);
    const subq = `SELECT l.equipamento_id, l.status_online, l.data_leitura FROM leituras l INNER JOIN (SELECT equipamento_id, MAX(data_leitura) as max_data FROM leituras GROUP BY equipamento_id) latest ON l.equipamento_id = latest.equipamento_id AND l.data_leitura = latest.max_data`;
    const online = Number((await query(`SELECT COUNT(*) as count FROM (${subq}) WHERE status_online = 1`)).rows[0].count);
    const offline = Number((await query(`SELECT COUNT(*) as count FROM (${subq}) WHERE status_online = 0`)).rows[0].count);
    const tonersBaixos = Number((await query("SELECT COUNT(*) as count FROM suprimentos WHERE percentual <= 20")).rows[0].count);
    const alertasCriticos = Number((await query("SELECT COUNT(*) as count FROM alertas WHERE resolvido = 0 AND nivel = 'critical'")).rows[0].count);
    const now = new Date();
    const firstDay = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const paginas = Number((await query('SELECT COALESCE(SUM(contador_total), 0) as total FROM leituras WHERE data_leitura >= $1', [firstDay])).rows[0].total);
    const clientes = (await query(`SELECT e.cliente, SUM(l.contador_total) as paginas FROM equipamentos e INNER JOIN leituras l ON l.equipamento_id = e.id WHERE l.data_leitura >= $1 GROUP BY e.cliente ORDER BY paginas DESC LIMIT 10`, [firstDay])).rows;
    return json({ success: true, data: { total_equipamentos: total, online, offline, toners_baixos: tonersBaixos, alertas_criticos: alertasCriticos, total_paginas_mes: paginas, clientes_maior_volume: clientes } });
  }

  if (path === '/equipamentos' && req.method === 'GET') {
    const { cliente, status, search, page = '1', per_page = '10' } = params;
    let countQ = 'SELECT COUNT(*) as count FROM equipamentos WHERE 1=1';
    let q = `SELECT e.*, (SELECT COUNT(*) FROM alertas a WHERE a.equipamento_id = e.id AND a.resolvido = 0) as alertas_ativos FROM equipamentos e WHERE 1=1`;
    const p: any[] = [], cp: any[] = [];
    let pi = 1, cpi = 1;
    if (cliente) { q += ` AND e.cliente=$${pi}`; countQ += ` AND cliente=$${cpi}`; p.push(cliente); cp.push(cliente); pi++; cpi++; }
    if (status) { q += ` AND e.status_monitoramento=$${pi}`; countQ += ` AND status_monitoramento=$${cpi}`; p.push(status); cp.push(status); pi++; cpi++; }
    if (search) { const s = `%${search}%`; q += ` AND (e.cliente LIKE $${pi} OR e.ip LIKE $${pi+1} OR e.modelo LIKE $${pi+2} OR e.numero_serie LIKE $${pi+3})`; countQ += ` AND (cliente LIKE $${cpi} OR ip LIKE $${cpi+1} OR modelo LIKE $${cpi+2} OR numero_serie LIKE $${cpi+3})`; p.push(s,s,s,s); cp.push(s,s,s,s); pi+=4; cpi+=4; }
    const total = Number((await query(countQ, cp)).rows[0].count);
    const pn = Math.max(1, Number(page)), ppn = Math.max(1, Math.min(100, Number(per_page))), offset = (pn-1)*ppn;
    q += ` ORDER BY e.created_at DESC LIMIT $${pi} OFFSET $${pi+1}`; p.push(ppn, offset);
    const result = await query(q, p);
    return json({ success: true, data: { data: result.rows, total } });
  }

  if (path.match(/^\/equipamentos\/\d+$/) && req.method === 'GET') {
    const id = getSegment(path, 1);
    const equip = (await query('SELECT * FROM equipamentos WHERE id=$1', [id])).rows[0];
    if (!equip) return error('Equipamento nÃ£o encontrado', 404);
    const leitura = (await query('SELECT * FROM leituras WHERE equipamento_id=$1 ORDER BY data_leitura DESC LIMIT 1', [id])).rows[0];
    const suprimentos = (await query('SELECT * FROM suprimentos WHERE equipamento_id=$1', [id])).rows;
    const config = (await query('SELECT * FROM config_coleta WHERE equipamento_id=$1', [id])).rows[0];
    return json({ success: true, data: { ...equip, ultima_leitura: leitura || null, suprimentos, config_coleta: config || null } });
  }

  if (path === '/equipamentos' && req.method === 'POST') {
    const body = await readBody(req) as any;
    const { cliente, unidade, ip, comunidade_snmp, fabricante, modelo, numero_serie, localizacao, contrato, status_monitoramento } = body;
    if (!cliente || !ip) return error('Cliente e IP sÃ£o obrigatÃ³rios', 400);
    const result = await query(
      `INSERT INTO equipamentos (cliente, unidade, ip, comunidade_snmp, fabricante, modelo, numero_serie, localizacao, contrato, status_monitoramento) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [cliente, unidade||null, ip, comunidade_snmp||'public', fabricante||null, modelo||null, numero_serie||null, localizacao||null, contrato||null, status_monitoramento||'ativo']
    );
    return json({ success: true, data: result.rows[0], message: 'Equipamento criado com sucesso' }, 201);
  }

  if (path.match(/^\/equipamentos\/\d+$/) && req.method === 'PUT') {
    const id = getSegment(path, 1);
    const body = await readBody(req) as any;
    const existing = (await query('SELECT * FROM equipamentos WHERE id=$1', [id])).rows[0];
    if (!existing) return error('Equipamento nÃ£o encontrado', 404);
    const result = await query(
      `UPDATE equipamentos SET cliente=$1, unidade=$2, ip=$3, comunidade_snmp=$4, fabricante=$5, modelo=$6, numero_serie=$7, localizacao=$8, contrato=$9, status_monitoramento=$10, updated_at=(NOW() AT TIME ZONE 'UTC')::text WHERE id=$11 RETURNING *`,
      [body.cliente||existing.cliente, body.unidade||existing.unidade, body.ip||existing.ip, body.comunidade_snmp||existing.comunidade_snmp, body.fabricante||existing.fabricante, body.modelo||existing.modelo, body.numero_serie||existing.numero_serie, body.localizacao||existing.localizacao, body.contrato||existing.contrato, body.status_monitoramento||existing.status_monitoramento, id]
    );
    return json({ success: true, data: result.rows[0], message: 'Equipamento atualizado com sucesso' });
  }

  if (path.match(/^\/equipamentos\/\d+$/) && req.method === 'DELETE') {
    const id = getSegment(path, 1);
    const existing = (await query('SELECT * FROM equipamentos WHERE id=$1', [id])).rows[0];
    if (!existing) return error('Equipamento nÃ£o encontrado', 404);
    await query('DELETE FROM equipamentos WHERE id=$1', [id]);
    return json({ success: true, message: 'Equipamento excluÃ­do com sucesso' });
  }

  if (path.match(/^\/equipamentos\/\d+\/collect$/) && req.method === 'POST') {
    const id = parseInt(getSegment(path, 1));
    const equip = (await query('SELECT * FROM equipamentos WHERE id=$1', [id])).rows[0];
    if (!equip) return error('Equipamento nÃ£o encontrado', 404);

    if (isPrivateIP(equip.ip)) {
      const agent = (await query(`SELECT a.id, a.name, a.status, a.last_heartbeat FROM agents a WHERE a.id=$1 AND a.status='active'`, [equip.agent_id])).rows[0];
      if (!agent) return json({ success: false, data: { reason: 'private_ip_no_agent', ip: equip.ip, hint: 'Instale um Onyx Agent na rede do cliente.', agent_required: true }, message: 'IP privado. NÃ£o Ã© possÃ­vel coletar diretamente.' }, 400);
      const lastHb = agent.last_heartbeat ? new Date(agent.last_heartbeat).getTime() : 0;
      if (lastHb < Date.now() - 10*60*1000) return json({ success: false, data: { reason: 'agent_offline', agent_name: agent.name, last_heartbeat: agent.last_heartbeat, hint: 'Verifique se o Agent estÃ¡ rodando.' }, message: `Agent "${agent.name}" parece estar offline.` }, 400);
      await query(`INSERT INTO agent_logs (agent_id, level, message, details) VALUES ($1,'info',$2,$3)`, [agent.id, `Coleta solicitada para ${equip.ip}`, JSON.stringify({ equipamento_id: equip.id, requested_by: 'web_ui' })]);
      return json({ success: true, data: { reason: 'routed_to_agent', agent_id: agent.id, agent_name: agent.name }, message: `Coleta enviada ao Agent "${agent.name}".` });
    }

    const { getPrinterData } = await import('../server/snmp.js');
    const printerData = await getPrinterData(equip.ip, equip.comunidade_snmp);
    await query(
      `INSERT INTO leituras (equipamento_id, contador_total, contador_pb, contador_cor, toner_preto, toner_ciano, toner_magenta, toner_amarelo, status_online, mensagens_erro, numero_serie_equip, modelo_equip, nome_equip) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [id, printerData.contador_total, printerData.contador_pb, printerData.contador_cor, printerData.toner_preto, printerData.toner_ciano, printerData.toner_magenta, printerData.toner_amarelo, printerData.online?1:0, printerData.mensagens_erro, printerData.numero_serie, printerData.modelo_equip, printerData.nome_equip]
    );
    const toners = [{t:'preto',p:printerData.toner_preto},{t:'ciano',p:printerData.toner_ciano},{t:'magenta',p:printerData.toner_magenta},{t:'amarelo',p:printerData.toner_amarelo}];
    for (const toner of toners) {
      const ex = (await query('SELECT id FROM suprimentos WHERE equipamento_id=$1 AND tipo=$2',[id,toner.t])).rows[0];
      if (ex) await query(`UPDATE suprimentos SET percentual=$1, ultima_leitura=(NOW() AT TIME ZONE 'UTC')::text, updated_at=(NOW() AT TIME ZONE 'UTC')::text WHERE id=$2`,[toner.p,ex.id]);
      else await query('INSERT INTO suprimentos (equipamento_id,tipo,percentual) VALUES ($1,$2,$3)',[id,toner.t,toner.p]);
    }
    return json({ success: true, data: printerData, message: 'Coleta realizada com sucesso' });
  }

  return error('Rota de equipamentos nÃ£o encontrada', 404);
}

// ======================== LEITURAS ========================
async function handleLeituras(req: Request, path: string, params: Record<string, string>) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;

  if (path === '/leituras' && req.method === 'GET') {
    const { equipamento_id, data_inicio, data_fim, page = '1', limit = '50' } = params;
    let q = `SELECT l.*, e.cliente, e.modelo, e.numero_serie FROM leituras l LEFT JOIN equipamentos e ON l.equipamento_id=e.id WHERE 1=1`;
    const p: any[] = []; let pi = 1;
    if (equipamento_id) { q += ` AND l.equipamento_id=$${pi}`; p.push(equipamento_id); pi++; }
    if (data_inicio) { q += ` AND l.data_leitura>=$${pi}`; p.push(data_inicio); pi++; }
    if (data_fim) { q += ` AND l.data_leitura<=$${pi}`; p.push(data_fim); pi++; }
    const countQ = q.replace('SELECT l.*, e.cliente, e.modelo, e.numero_serie', 'SELECT COUNT(*) as total');
    const total = Number((await query(countQ, p)).rows[0].total);
    const offset = (Number(page)-1)*Number(limit);
    q += ` ORDER BY l.data_leitura DESC LIMIT $${pi} OFFSET $${pi+1}`; p.push(Number(limit), offset);
    const result = await query(q, p);
    return json({ success: true, data: { data: result.rows, total } });
  }

  if (path.match(/^\/leituras\/equipamento\/\d+$/) && req.method === 'GET') {
    const id = getSegment(path, 2);
    const { page = '1', limit = '100' } = params;
    const total = Number((await query('SELECT COUNT(*) as total FROM leituras WHERE equipamento_id=$1',[id])).rows[0].total);
    const offset = (Number(page)-1)*Number(limit);
    const result = await query('SELECT * FROM leituras WHERE equipamento_id=$1 ORDER BY data_leitura DESC LIMIT $2 OFFSET $3',[id,Number(limit),offset]);
    return json({ success: true, data: result.rows });
  }

  if (path.match(/^\/leituras\/\d+$/) && req.method === 'GET') {
    const id = getSegment(path, 1);
    const result = await query(`SELECT l.*, e.cliente, e.modelo, e.numero_serie, e.ip FROM leituras l LEFT JOIN equipamentos e ON l.equipamento_id=e.id WHERE l.id=$1`,[id]);
    if (!result.rows[0]) return error('Leitura nÃ£o encontrada', 404);
    return json({ success: true, data: result.rows[0] });
  }

  return error('Rota de leituras nÃ£o encontrada', 404);
}

// ======================== SUPRIMENTOS ========================
async function handleSuprimentos(req: Request, path: string, params: Record<string, string>) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;

  if (path === '/suprimentos' && req.method === 'GET') {
    const { equipamento_id, tipo } = params;
    let q = `SELECT s.*, e.cliente, e.modelo, e.numero_serie, e.ip FROM suprimentos s LEFT JOIN equipamentos e ON s.equipamento_id=e.id WHERE 1=1`;
    const p: any[] = []; let pi = 1;
    if (equipamento_id) { q += ` AND s.equipamento_id=$${pi}`; p.push(equipamento_id); pi++; }
    if (tipo) { q += ` AND s.tipo=$${pi}`; p.push(tipo); pi++; }
    q += ' ORDER BY s.percentual ASC';
    return json({ success: true, data: (await query(q, p)).rows });
  }

  if (path.match(/^\/suprimentos\/equipamento\/\d+$/) && req.method === 'GET') {
    return json({ success: true, data: (await query('SELECT * FROM suprimentos WHERE equipamento_id=$1',[getSegment(path,2)])).rows });
  }

  if (path.match(/^\/suprimentos\/\d+$/) && req.method === 'PUT') {
    const id = getSegment(path, 1);
    const body = await readBody(req) as any;
    const existing = (await query('SELECT * FROM suprimentos WHERE id=$1',[id])).rows[0];
    if (!existing) return error('Suprimento nÃ£o encontrado', 404);
    const result = await query(`UPDATE suprimentos SET percentual=$1, previsao_troca=$2, updated_at=(NOW() AT TIME ZONE 'UTC')::text WHERE id=$3 RETURNING *`,
      [body.percentual!==undefined?body.percentual:existing.percentual, body.previsao_troca!==undefined?body.previsao_troca:existing.previsao_troca, id]);
    return json({ success: true, data: result.rows[0], message: 'Suprimento atualizado com sucesso' });
  }

  return error('Rota de suprimentos nÃ£o encontrada', 404);
}

// ======================== ALERTAS ========================
async function handleAlertas(req: Request, path: string, params: Record<string, string>) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;

  if (path === '/alertas/stats' && req.method === 'GET') {
    const total = Number((await query('SELECT COUNT(*) as count FROM alertas')).rows[0].count);
    const ativos = Number((await query('SELECT COUNT(*) as count FROM alertas WHERE resolvido=0')).rows[0].count);
    const criticos = Number((await query("SELECT COUNT(*) as count FROM alertas WHERE resolvido=0 AND nivel='critical'")).rows[0].count);
    const warnings = Number((await query("SELECT COUNT(*) as count FROM alertas WHERE resolvido=0 AND nivel='warning'")).rows[0].count);
    const infos = Number((await query("SELECT COUNT(*) as count FROM alertas WHERE resolvido=0 AND nivel='info'")).rows[0].count);
    const porTipo = (await query("SELECT tipo, COUNT(*) as count FROM alertas WHERE resolvido=0 GROUP BY tipo ORDER BY count DESC")).rows;
    const ultimos = (await query(`SELECT a.*, e.cliente, e.modelo FROM alertas a LEFT JOIN equipamentos e ON a.equipamento_id=e.id ORDER BY a.created_at DESC LIMIT 10`)).rows;
    return json({ success: true, data: { total, ativos, criticos, warnings, infos, por_tipo: porTipo, ultimos_alertas: ultimos } });
  }

  if (path === '/alertas' && req.method === 'GET') {
    const { tipo, nivel, resolvido, equipamento_id, page = '1', limit = '50' } = params;
    let q = `SELECT a.*, e.cliente, e.modelo, e.numero_serie, e.ip FROM alertas a LEFT JOIN equipamentos e ON a.equipamento_id=e.id WHERE 1=1`;
    const p: any[] = []; let pi = 1;
    if (tipo) { q += ` AND a.tipo=$${pi}`; p.push(tipo); pi++; }
    if (nivel) { q += ` AND a.nivel=$${pi}`; p.push(nivel); pi++; }
    if (resolvido !== undefined) { q += ` AND a.resolvido=$${pi}`; p.push(resolvido==='true'?1:0); pi++; }
    if (equipamento_id) { q += ` AND a.equipamento_id=$${pi}`; p.push(equipamento_id); pi++; }
    const countQ = q.replace('SELECT a.*, e.cliente, e.modelo, e.numero_serie, e.ip','SELECT COUNT(*) as total');
    const total = Number((await query(countQ, p)).rows[0].total);
    const offset = (Number(page)-1)*Number(limit);
    q += ` ORDER BY a.created_at DESC LIMIT $${pi} OFFSET $${pi+1}`; p.push(Number(limit), offset);
    return json({ success: true, data: { data: (await query(q, p)).rows, total } });
  }

  if (path.match(/^\/alertas\/\d+\/resolver$/) && req.method === 'PUT') {
    const id = getSegment(path, 1);
    const existing = (await query('SELECT * FROM alertas WHERE id=$1',[id])).rows[0];
    if (!existing) return error('Alerta nÃ£o encontrado', 404);
    const result = await query(`UPDATE alertas SET resolvido=1, resolvido_em=(NOW() AT TIME ZONE 'UTC')::text WHERE id=$1 RETURNING *`,[id]);
    return json({ success: true, data: result.rows[0], message: 'Alerta resolvido com sucesso' });
  }

  return error('Rota de alertas nÃ£o encontrada', 404);
}

// ======================== RELATORIOS ========================
async function handleRelatorios(req: Request, path: string, params: Record<string, string>) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;

  if (path === '/relatorios/mensal' && req.method === 'GET') {
    const { mes, ano, cliente } = params;
    const cm = mes ? Number(mes) : new Date().getMonth()+1, cy = ano ? Number(ano) : new Date().getFullYear();
    const sd = `${cy}-${String(cm).padStart(2,'0')}-01`, ed = `${cy}-${String(cm).padStart(2,'0')}-31`;
    let q = `SELECT e.cliente, e.modelo, e.numero_serie, e.ip, COUNT(l.id) as total_leituras, MAX(l.contador_total)-MIN(l.contador_total) as impressions_month, MAX(l.contador_pb)-MIN(l.contador_pb) as pb_month, MAX(l.contador_cor)-MIN(l.contador_cor) as color_month, AVG(l.toner_preto) as avg_toner_preto, AVG(l.toner_ciano) as avg_toner_ciano, AVG(l.toner_magenta) as avg_toner_magenta, AVG(l.toner_amarelo) as avg_toner_amarelo FROM leituras l LEFT JOIN equipamentos e ON l.equipamento_id=e.id WHERE l.data_leitura>=$1 AND l.data_leitura<=$2`;
    const p: any[] = [sd,ed]; let pi = 3;
    if (cliente) { q += ` AND e.cliente=$${pi}`; p.push(cliente); pi++; }
    q += ' GROUP BY e.id ORDER BY e.cliente, e.modelo';
    const details = (await query(q, p)).rows;
    let sq = `SELECT e.cliente, COUNT(DISTINCT e.id) as equipamentos, SUM(CASE WHEN l.status_online=1 THEN 1 ELSE 0 END) as leituras_online, SUM(CASE WHEN l.status_online=0 THEN 1 ELSE 0 END) as leituras_offline FROM equipamentos e LEFT JOIN leituras l ON l.equipamento_id=e.id AND l.data_leitura>=$1 AND l.data_leitura<=$2 WHERE 1=1`;
    const sp: any[] = [sd,ed]; let spi = 3;
    if (cliente) { sq += ` AND e.cliente=$${spi}`; sp.push(cliente); spi++; }
    const summary = (await query(sq, sp)).rows;
    return json({ success: true, data: { periodo: { mes: cm, ano: cy, startDate: sd, endDate: ed }, detalhes: details, resumo_por_cliente: summary } });
  }

  if (path === '/relatorios/export/excel' && req.method === 'GET') {
    const { cliente, data_inicio, data_fim } = params;
    let q = `SELECT e.cliente, e.unidade, e.ip, e.modelo, e.numero_serie, l.data_leitura, l.contador_total, l.contador_pb, l.contador_cor, l.toner_preto, l.toner_ciano, l.toner_magenta, l.toner_amarelo, l.status_online FROM leituras l LEFT JOIN equipamentos e ON l.equipamento_id=e.id WHERE 1=1`;
    const p: any[] = []; let pi = 1;
    if (cliente) { q += ` AND e.cliente=$${pi}`; p.push(cliente); pi++; }
    if (data_inicio) { q += ` AND l.data_leitura>=$${pi}`; p.push(data_inicio); pi++; }
    if (data_fim) { q += ` AND l.data_leitura<=$${pi}`; p.push(data_fim); pi++; }
    q += ' ORDER BY e.cliente, l.data_leitura DESC';
    const rows = (await query(q, p)).rows;
    if (!rows.length) return error('Nenhum dado encontrado', 404);
    const headers = Object.keys(rows[0]);
    const csvRows = ['\uFEFF'+headers.join(';'), ...rows.map((r: any) => headers.map(h => { const v = r[h]; if (v===null||v===undefined) return ''; const s=String(v); return s.includes(';')||s.includes('"')||s.includes('\n')?`"${s.replace(/"/g,'""')}"`:s; }).join(';'))];
    return new Response(Buffer.from(csvRows.join('\n'),'utf-8'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename=relatorio_onyx.csv' } });
  }

  return error('Rota de relatÃ³rios nÃ£o encontrada', 404);
}

// ======================== AGENTS ========================
async function handleAgents(req: Request, path: string, params: Record<string, string>) {
  if (path === '/agents/register' && req.method === 'POST') {
    const body = await readBody(req) as any;
    const { name, company_id, location, ip_address, version } = body;
    if (!name || !company_id) return error('Nome e company_id sÃ£o obrigatÃ³rios', 400);
    const crypto = await import('crypto');
    const apiKey = crypto.randomBytes(32).toString('hex');
    const result = await query(
      `INSERT INTO agents (name, company_id, location, ip_address, api_key, version, status) VALUES ($1,$2,$3,$4,$5,$6,'active') RETURNING id, name, company_id, api_key, status, created_at`,
      [name, company_id, location||null, ip_address||null, apiKey, version||'1.0.0']
    );
    return json({ success: true, data: result.rows[0], message: 'Agent registrado com sucesso' }, 201);
  }

  // Agent-auth endpoints
  const agentMatch = path.match(/^\/agents\/(\d+)\/(heartbeat|config|collect|logs)$/);
  if (agentMatch) {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return error('Token nÃ£o fornecido', 401);
    const apiKey = authHeader.split(' ')[1];
    const agent = (await query('SELECT id, name, status FROM agents WHERE api_key=$1',[apiKey])).rows[0];
    if (!agent) return error('API Key invÃ¡lida', 401);
    if (agent.status !== 'active') return error('Agent inativo', 403);

    const [, agentId, action] = agentMatch;

    if (action === 'heartbeat' && req.method === 'POST') {
      const body = await readBody(req) as any;
      await query(`UPDATE agents SET last_heartbeat=(NOW() AT TIME ZONE 'UTC')::text, version=COALESCE($1,version), updated_at=(NOW() AT TIME ZONE 'UTC')::text WHERE id=$2`,[body.version||null,agentId]);
      return json({ success: true, message: 'Heartbeat registrado' });
    }

    if (action === 'config' && req.method === 'GET') {
      const result = await query(`SELECT id, cliente, unidade, ip, comunidade_snmp, fabricante, modelo, numero_serie, localizacao FROM equipamentos WHERE agent_id=$1 AND status_monitoramento='ativo'`,[agentId]);
      return json({ success: true, data: result.rows });
    }

    if (action === 'collect' && req.method === 'POST') {
      const body = await readBody(req) as any;
      if (!body.equipamentos || !Array.isArray(body.equipamentos)) return error('Dados invÃ¡lidos', 400);
      let processed = 0, errors = 0;
      for (const equip of body.equipamentos) {
        try {
          const eq = (await query('SELECT id FROM equipamentos WHERE ip=$1 AND agent_id=$2',[equip.ip,agentId])).rows[0];
          let eid: number;
          if (eq) { eid = eq.id; } else {
            const ne = await query(`INSERT INTO equipamentos (cliente,ip,comunidade_snmp,fabricante,modelo,numero_serie,agent_id,status_monitoramento) VALUES ($1,$2,'public',$3,$4,$5,$6,'ativo') RETURNING id`,
              [equip.cliente||'Agent Discovery',equip.ip,equip.fabricante||null,equip.modelo||null,equip.numero_serie||null,agentId]);
            eid = ne.rows[0].id;
          }
          await query(`INSERT INTO leituras (equipamento_id,contador_total,contador_pb,contador_cor,toner_preto,toner_ciano,toner_magenta,toner_amarelo,status_online,mensagens_erro,numero_serie_equip,modelo_equip,nome_equip) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [eid,equip.contadores?.total||0,equip.contadores?.pb||0,equip.contadores?.cor||0,equip.toner?.preto||0,equip.toner?.ciano||0,equip.toner?.magenta||0,equip.toner?.amarelo||0,equip.status_online?1:0,equip.mensagens_erro||'',equip.numero_serie||'',equip.modelo||'',equip.nome||'']);
          const toners = [{t:'preto',p:equip.toner?.preto||0},{t:'ciano',p:equip.toner?.ciano||0},{t:'magenta',p:equip.toner?.magenta||0},{t:'amarelo',p:equip.toner?.amarelo||0}];
          for (const toner of toners) {
            const ex = (await query('SELECT id FROM suprimentos WHERE equipamento_id=$1 AND tipo=$2',[eid,toner.t])).rows[0];
            if (ex) await query(`UPDATE suprimentos SET percentual=$1, ultima_leitura=(NOW() AT TIME ZONE 'UTC')::text, updated_at=(NOW() AT TIME ZONE 'UTC')::text WHERE id=$2`,[toner.p,ex.id]);
            else await query('INSERT INTO suprimentos (equipamento_id,tipo,percentual) VALUES ($1,$2,$3)',[eid,toner.t,toner.p]);
          }
          if (!equip.status_online) {
            const exAlert = (await query(`SELECT id FROM alertas WHERE equipamento_id=$1 AND tipo='offline' AND resolvido=0`,[eid])).rows[0];
            if (!exAlert) await query(`INSERT INTO alertas (equipamento_id,tipo,mensagem,nivel) VALUES ($1,'offline',$2,'critical')`,[eid,`Equipamento ${equip.nome||equip.ip} estÃ¡ offline`]);
          } else {
            await query(`UPDATE alertas SET resolvido=1, resolvido_em=(NOW() AT TIME ZONE 'UTC')::text WHERE equipamento_id=$1 AND tipo='offline' AND resolvido=0`,[eid]);
          }
          for (const toner of toners) {
            if (toner.p === 0) {
              const ex = (await query(`SELECT id FROM alertas WHERE equipamento_id=$1 AND tipo='toner_zerado' AND mensagem LIKE $2 AND resolvido=0`,[eid,`%${toner.t}%`])).rows[0];
              if (!ex) await query(`INSERT INTO alertas (equipamento_id,tipo,mensagem,nivel) VALUES ($1,'toner_zerado',$2,'critical')`,[eid,`Toner ${toner.t} estÃ¡ zerado no equipamento ${equip.nome||equip.ip}`]);
            } else if (toner.p <= 15) {
              const ex = (await query(`SELECT id FROM alertas WHERE equipamento_id=$1 AND tipo='toner_baixo' AND mensagem LIKE $2 AND resolvido=0`,[eid,`%${toner.t}%`])).rows[0];
              if (!ex) await query(`INSERT INTO alertas (equipamento_id,tipo,mensagem,nivel) VALUES ($1,'toner_baixo',$2,'warning')`,[eid,`Toner ${toner.t} com ${toner.p}% no equipamento ${equip.nome||equip.ip}`]);
            } else {
              await query(`UPDATE alertas SET resolvido=1, resolvido_em=(NOW() AT TIME ZONE 'UTC')::text WHERE equipamento_id=$1 AND tipo IN ('toner_baixo','toner_zerado') AND mensagem LIKE $2 AND resolvido=0`,[eid,`%${toner.t}%`]);
            }
          }
          processed++;
        } catch (err) { errors++; }
      }
      return json({ success: true, data: { processed, errors, total: body.equipamentos.length }, message: `${processed} processados, ${errors} erros` });
    }

    if (action === 'logs' && req.method === 'POST') {
      const body = await readBody(req) as any;
      if (!body.logs || !Array.isArray(body.logs)) return error('Logs invÃ¡lidos', 400);
      for (const log of body.logs) {
        await query(`INSERT INTO agent_logs (agent_id,level,message,details) VALUES ($1,$2,$3,$4)`,[agentId,log.level||'info',log.message,log.details?JSON.stringify(log.details):null]);
      }
      return json({ success: true, message: `${body.logs.length} logs recebidos` });
    }
  }

  // Admin endpoints (require JWT auth)
  const adminAuth = await requireAdmin(req);
  if (adminAuth.error) return adminAuth.error;

  if (path === '/agents' && req.method === 'GET') {
    const result = await query(`SELECT a.*, (SELECT COUNT(*) FROM equipamentos e WHERE e.agent_id=a.id) as printers_count, (SELECT COUNT(*) FROM agent_logs al WHERE al.agent_id=a.id AND al.level='error' AND al.created_at > (NOW() AT TIME ZONE 'UTC')::text - interval '24 hours') as errors_24h FROM agents a ORDER BY a.created_at DESC`);
    return json({ success: true, data: result.rows });
  }

  if (path.match(/^\/agents\/\d+$/) && req.method === 'GET') {
    const id = getSegment(path, 1);
    const agent = (await query(`SELECT a.*, (SELECT COUNT(*) FROM equipamentos e WHERE e.agent_id=a.id) as printers_count FROM agents a WHERE a.id=$1`,[id])).rows[0];
    if (!agent) return error('Agent nÃ£o encontrado', 404);
    const printers = (await query('SELECT id, cliente, ip, modelo, numero_serie, status_monitoramento FROM equipamentos WHERE agent_id=$1',[id])).rows;
    const logs = (await query('SELECT * FROM agent_logs WHERE agent_id=$1 ORDER BY created_at DESC LIMIT 50',[id])).rows;
    return json({ success: true, data: { ...agent, equipamentos: printers, logs } });
  }

  if (path.match(/^\/agents\/\d+$/) && req.method === 'PUT') {
    const id = getSegment(path, 1);
    const body = await readBody(req) as any;
    const existing = (await query('SELECT * FROM agents WHERE id=$1',[id])).rows[0];
    if (!existing) return error('Agent nÃ£o encontrado', 404);
    const result = await query(`UPDATE agents SET name=$1, company_id=$2, location=$3, status=$4, config=$5, updated_at=(NOW() AT TIME ZONE 'UTC')::text WHERE id=$6 RETURNING *`,
      [body.name||existing.name, body.company_id||existing.company_id, body.location!==undefined?body.location:existing.location, body.status||existing.status, body.config?JSON.stringify(body.config):existing.config, id]);
    return json({ success: true, data: result.rows[0], message: 'Agent atualizado' });
  }

  if (path.match(/^\/agents\/\d+$/) && req.method === 'DELETE') {
    const id = getSegment(path, 1);
    const existing = (await query('SELECT * FROM agents WHERE id=$1',[id])).rows[0];
    if (!existing) return error('Agent nÃ£o encontrado', 404);
    await query('UPDATE equipamentos SET agent_id=NULL WHERE agent_id=$1',[id]);
    await query('DELETE FROM agents WHERE id=$1',[id]);
    return json({ success: true, message: 'Agent excluÃ­do com sucesso' });
  }

  if (path.match(/^\/agents\/\d+\/assign$/) && req.method === 'POST') {
    const id = getSegment(path, 1);
    const body = await readBody(req) as any;
    if (!body.equipamento_id) return error('equipamento_id Ã© obrigatÃ³rio', 400);
    const agent = (await query('SELECT id FROM agents WHERE id=$1',[id])).rows[0];
    if (!agent) return error('Agent nÃ£o encontrado', 404);
    const equip = (await query('SELECT id FROM equipamentos WHERE id=$1',[body.equipamento_id])).rows[0];
    if (!equip) return error('Equipamento nÃ£o encontrado', 404);
    await query('UPDATE equipamentos SET agent_id=$1 WHERE id=$2',[id,body.equipamento_id]);
    return json({ success: true, message: 'Equipamento atribuÃ­do ao agent' });
  }

  if (path.match(/^\/agents\/\d+\/unassign$/) && req.method === 'POST') {
    const id = getSegment(path, 1);
    const body = await readBody(req) as any;
    if (!body.equipamento_id) return error('equipamento_id Ã© obrigatÃ³rio', 400);
    await query('UPDATE equipamentos SET agent_id=NULL WHERE id=$1 AND agent_id=$2',[body.equipamento_id,id]);
    return json({ success: true, message: 'Equipamento removido do agent' });
  }

  return error('Rota de agents nÃ£o encontrada', 404);
}

// ======================== AUDITORIA ========================
async function handleAuditoria(req: Request, path: string, params: Record<string, string>) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;

  if (path === '/auditoria/stats' && req.method === 'GET') {
    const { data_inicio, data_fim } = params;
    let df = '';
    const p: any[] = [];
    if (data_inicio) { df += ` AND data_impressao>=${p.length+1}`; p.push(data_inicio); }
    if (data_fim) { df += ` AND data_impressao<=${p.length+1}`; p.push(data_fim); }
    const [total, porUsuario, porEquipamento, porCliente, porMes, porFonte, porCor, porStatus] = await Promise.all([
      query(`SELECT COUNT(*) as total, COALESCE(SUM(total_paginas),0) as total_paginas FROM auditoria_impressoes WHERE 1=1${df}`,p),
      query(`SELECT usuario, COUNT(*) as total_impressoes, SUM(total_paginas) as total_paginas FROM auditoria_impressoes WHERE usuario IS NOT NULL AND usuario != ''${df} GROUP BY usuario ORDER BY total_paginas DESC LIMIT 10`,p),
      query(`SELECT a.equipamento_id, e.modelo, e.ip, COUNT(*) as total_impressoes, SUM(a.total_paginas) as total_paginas FROM auditoria_impressoes a LEFT JOIN equipamentos e ON a.equipamento_id=e.id${df?` WHERE 1=1${df}`:''} GROUP BY a.equipamento_id, e.modelo, e.ip ORDER BY total_paginas DESC LIMIT 10`,p),
      query(`SELECT cliente, COUNT(*) as total_impressoes, SUM(total_paginas) as total_paginas FROM auditoria_impressoes WHERE cliente IS NOT NULL AND cliente != ''${df} GROUP BY cliente ORDER BY total_paginas DESC LIMIT 10`,p),
      query(`SELECT SUBSTR(data_impressao,1,7) as mes, COUNT(*) as total_impressoes, SUM(total_paginas) as total_paginas FROM auditoria_impressoes WHERE 1=1${df} GROUP BY mes ORDER BY mes DESC LIMIT 12`,p),
      query(`SELECT fonte, COUNT(*) as total FROM auditoria_impressoes WHERE 1=1${df} GROUP BY fonte`,p),
      query(`SELECT CASE WHEN colorida=1 THEN 'Colorida' ELSE 'P&B' END as tipo, COUNT(*) as total, SUM(total_paginas) as paginas FROM auditoria_impressoes WHERE 1=1${df} GROUP BY colorida`,p),
      query(`SELECT status_impressao, COUNT(*) as total FROM auditoria_impressoes WHERE 1=1${df} GROUP BY status_impressao`,p),
    ]);
    return json({ success: true, data: { total_registros: parseInt(total.rows[0].total), total_paginas: parseInt(total.rows[0].total_paginas), por_usuario: porUsuario.rows, por_equipamento: porEquipamento.rows, por_cliente: porCliente.rows, por_mes: porMes.rows, por_fonte: porFonte.rows, por_cor: porCor.rows, por_status: porStatus.rows } });
  }

  if (path === '/auditoria/export/csv' && req.method === 'GET') {
    const { cliente, equipamento_id, usuario, data_inicio, data_fim } = params;
    let q = `SELECT a.usuario, a.computador, a.documento, a.data_impressao, a.hora_impressao, e.modelo as equipamento, a.cliente, a.total_paginas, a.colorida, a.duplex, a.tamanho_papel, a.status_impressao, a.fonte FROM auditoria_impressoes a LEFT JOIN equipamentos e ON a.equipamento_id=e.id WHERE 1=1`;
    const p: any[] = []; let i = 1;
    if (cliente) { q += ` AND a.cliente=$${i}`; p.push(cliente); i++; }
    if (equipamento_id) { q += ` AND a.equipamento_id=$${i}`; p.push(equipamento_id); i++; }
    if (usuario) { q += ` AND a.usuario ILIKE $${i}`; p.push(`%${usuario}%`); i++; }
    if (data_inicio) { q += ` AND a.data_impressao>=$${i}`; p.push(data_inicio); i++; }
    if (data_fim) { q += ` AND a.data_impressao<=$${i}`; p.push(data_fim); i++; }
    q += ' ORDER BY a.data_impressao DESC';
    const rows = (await query(q, p)).rows;
    if (!rows.length) return error('Nenhum dado encontrado', 404);
    const headers = ['UsuÃ¡rio','Computador','Documento','Data','Hora','Equipamento','Cliente','PÃ¡ginas','Colorida','Duplex','Papel','Status','Fonte'];
    const csvRows = ['\uFEFF'+headers.join(';'), ...rows.map((r: any) => [r.usuario||'',r.computador||'',r.documento||'',r.data_impressao||'',r.hora_impressao||'',r.equipamento||'',r.cliente||'',r.total_paginas||0,r.colorida?'Sim':'NÃ£o',r.duplex?'Sim':'NÃ£o',r.tamanho_papel||'A4',r.status_impressao||'',r.fonte||''].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';'))];
    return new Response(Buffer.from(csvRows.join('\n'),'utf-8'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename=auditoria_impressoes.csv' } });
  }

  if (path === '/auditoria' && req.method === 'GET') {
    const { cliente, equipamento_id, usuario, documento, data_inicio, data_fim, fonte, page = '1', per_page = '50' } = params;
    let q = `SELECT a.*, e.ip as ip_equipamento_sql, e.modelo as modelo_sql, e.numero_serie as numero_serie_sql FROM auditoria_impressoes a LEFT JOIN equipamentos e ON a.equipamento_id=e.id WHERE 1=1`;
    let cq = `SELECT COUNT(*) FROM auditoria_impressoes a LEFT JOIN equipamentos e ON a.equipamento_id=e.id WHERE 1=1`;
    const p: any[] = [], cp: any[] = []; let pi = 1, ci = 1;
    if (cliente) { q += ` AND a.cliente=$${pi}`; cq += ` AND a.cliente=$${ci}`; p.push(cliente); cp.push(cliente); pi++; ci++; }
    if (equipamento_id) { q += ` AND a.equipamento_id=$${pi}`; cq += ` AND a.equipamento_id=$${ci}`; p.push(equipamento_id); cp.push(equipamento_id); pi++; ci++; }
    if (usuario) { q += ` AND a.usuario ILIKE $${pi}`; cq += ` AND a.usuario ILIKE $${ci}`; p.push(`%${usuario}%`); cp.push(`%${usuario}%`); pi++; ci++; }
    if (documento) { q += ` AND a.documento ILIKE $${pi}`; cq += ` AND a.documento ILIKE $${ci}`; p.push(`%${documento}%`); cp.push(`%${documento}%`); pi++; ci++; }
    if (data_inicio) { q += ` AND a.data_impressao>=$${pi}`; cq += ` AND a.data_impressao>=$${ci}`; p.push(data_inicio); cp.push(data_inicio); pi++; ci++; }
    if (data_fim) { q += ` AND a.data_impressao<=$${pi}`; cq += ` AND a.data_impressao<=$${ci}`; p.push(data_fim); cp.push(data_fim); pi++; ci++; }
    if (fonte) { q += ` AND a.fonte=$${pi}`; cq += ` AND a.fonte=$${ci}`; p.push(fonte); cp.push(fonte); pi++; ci++; }
    const total = parseInt((await query(cq, cp)).rows[0].count);
    const offset = (parseInt(page)-1)*parseInt(per_page);
    q += ` ORDER BY a.data_impressao DESC, a.hora_impressao DESC LIMIT $${pi} OFFSET $${pi+1}`; p.push(parseInt(per_page), offset);
    const result = await query(q, p);
    return json({ success: true, data: result.rows, total, page: parseInt(page), per_page: parseInt(per_page) });
  }

  if (path === '/auditoria' && req.method === 'POST') {
    const body = await readBody(req) as any;
    const { equipamento_id, cliente, usuario, computador, documento, data_impressao, hora_impressao, total_paginas, colorida, duplex, tamanho_papel, status_impressao, fonte, dados_extras } = body;
    const result = await query(
      `INSERT INTO auditoria_impressoes (equipamento_id,cliente,usuario,computador,documento,data_impressao,hora_impressao,total_paginas,colorida,duplex,tamanho_papel,status_impressao,fonte,dados_extras) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [equipamento_id||null,cliente||null,usuario||null,computador||null,documento||null,data_impressao||new Date().toISOString().split('T')[0],hora_impressao||new Date().toTimeString().slice(0,8),total_paginas||1,colorida?1:0,duplex?1:0,tamanho_papel||'A4',status_impressao||'concluida',fonte||'manual',dados_extras?JSON.stringify(dados_extras):'{}']
    );
    return json({ success: true, data: result.rows[0] }, 201);
  }

  if (path === '/auditoria/batch' && req.method === 'POST') {
    const body = await readBody(req) as any;
    if (!body.records || !Array.isArray(body.records) || !body.records.length) return error('Nenhum registro fornecido', 400);
    let inserted = 0;
    for (const rec of body.records) {
      try {
        await query(`INSERT INTO auditoria_impressoes (equipamento_id,cliente,usuario,computador,documento,data_impressao,hora_impressao,total_paginas,colorida,duplex,tamanho_papel,status_impressao,fonte,ip_equipamento,numero_serie,modelo_equip,dados_extras) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [rec.equipamento_id||null,rec.cliente||null,rec.usuario||null,rec.computador||null,rec.documento||null,rec.data_impressao||new Date().toISOString().split('T')[0],rec.hora_impressao||new Date().toTimeString().slice(0,8),rec.total_paginas||1,rec.colorida?1:0,rec.duplex?1:0,rec.tamanho_papel||'A4',rec.status_impressao||'concluida',rec.fonte||'spooler',rec.ip_equipamento||null,rec.numero_serie||null,rec.modelo_equip||null,rec.dados_extras?JSON.stringify(rec.dados_extras):'{}']);
        inserted++;
      } catch (e) { console.error('Error inserting audit record:', e); }
    }
    return json({ success: true, data: { inserted, total: body.records.length } });
  }

  if (path.match(/^\/auditoria\/\d+$/) && req.method === 'DELETE') {
    await query('DELETE FROM auditoria_impressoes WHERE id=$1',[getSegment(path,1)]);
    return json({ success: true, message: 'Registro excluÃ­do' });
  }

  if (path === '/auditoria/config' && req.method === 'GET') {
    const result = await query(`SELECT c.*, e.modelo, e.ip FROM auditoria_config c LEFT JOIN equipamentos e ON c.equipamento_id=e.id ORDER BY c.created_at DESC`);
    return json({ success: true, data: result.rows });
  }

  if (path === '/auditoria/config' && req.method === 'POST') {
    const body = await readBody(req) as any;
    const result = await query(`INSERT INTO auditoria_config (tipo_integracao,equipamento_id,config,ativo) VALUES ($1,$2,$3,$4) RETURNING *`,
      [body.tipo_integracao, body.equipamento_id||null, JSON.stringify(body.config||{}), body.ativo!==undefined?(body.ativo?1:0):1]);
    return json({ success: true, data: result.rows[0] }, 201);
  }

  if (path.match(/^\/auditoria\/config\/\d+$/) && req.method === 'DELETE') {
    await query('DELETE FROM auditoria_config WHERE id=$1',[getSegment(path,2)]);
    return json({ success: true, message: 'ConfiguraÃ§Ã£o excluÃ­da' });
  }

  return error('Rota de auditoria nÃ£o encontrada', 404);
}
