let _pg: any, _jwt: any, _crypto: any;
let _getDb: any, _query: any;
let _hashPassword: any, _signToken: any, _requireAuth: any, _requireAdmin: any;

async function loadDeps() {
  if (!_pg) {
    _pg = await import('pg');
    const Pool = _pg.default?.Pool || _pg.Pool;
    let pool: any = null;
    _getDb = () => {
      if (!pool) {
        const connStr = process.env.SUPABASE_URL || process.env.DATABASE_URL;
        if (!connStr) throw new Error('DATABASE_URL required');
        pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false }, max: 5, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000 });
      }
      return pool;
    };
    _query = async (text: string, params?: any[]) => {
      const db = _getDb();
      const client = await db.connect();
      try { return await client.query(text, params); } finally { client.release(); }
    };
  }
  if (!_jwt) {
    _jwt = await import('jsonwebtoken');
    _crypto = await import('crypto');
    const jwt = _jwt.default || _jwt;
    const JWT_SECRET = process.env.JWT_SECRET || 'onyx-monitor-secret-key-change-in-production';
    const JWT_EXPIRES_IN = '24h';
    _hashPassword = (p: string) => _crypto.createHash('sha256').update(p).digest('hex');
    _signToken = (u: any) => jwt.sign(u, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    _requireAuth = async (req: Request) => {
      const h = req.headers.get('authorization');
      if (!h || !h.startsWith('Bearer ')) return { user: null, error: _json({ success: false, message: 'Token não fornecido' }, 401) };
      try {
        const d = jwt.verify(h.split(' ')[1], JWT_SECRET) as any;
        const r = await _query('SELECT id, nome, email, role, cliente_id, ativo FROM usuarios WHERE id=$1 AND ativo=1', [d.userId]);
        if (!r.rows[0]) return { user: null, error: _json({ success: false, message: 'Usuário não encontrado' }, 401) };
        return { user: r.rows[0] };
      } catch { return { user: null, error: _json({ success: false, message: 'Token inválido' }, 401) }; }
    };
    _requireAdmin = async (req: Request) => {
      const { user, error } = await _requireAuth(req);
      if (error) return { user: null, error };
      if (user.role !== 'admin') return { user: null, error: _json({ success: false, message: 'Acesso negado' }, 403) };
      return { user };
    };
  }
}

function _json(data: any, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' }
  });
}

function _error(message: string, status = 500, extra?: any) {
  return _json({ success: false, message, ...extra }, status);
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

async function readBody(req: Request): Promise<any> {
  try {
    const text = await req.text();
    if (!text || !text.trim()) return {};
    return JSON.parse(text);
  } catch (e: any) {
    console.error('readBody error:', e?.message);
    return {};
  }
}

const json_ = _json;
const error_ = _error;

function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return false;
  return parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || parts[0] === 127 || parts[0] === 0;
}

export default async function handler(nodeReq: any, nodeRes: any) {
  try {
    await loadDeps();

    if (nodeReq.method === 'OPTIONS') {
      nodeRes.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' });
      return nodeRes.end();
    }

    const chunks: Buffer[] = [];
    for await (const chunk of nodeReq) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const bodyStr = Buffer.concat(chunks).toString('utf-8');

    const proto = nodeReq.headers['x-forwarded-proto'] || 'https';
    const host = nodeReq.headers.host || 'localhost';
    const url = `${proto}://${host}${nodeReq.url}`;

    const headers = new Headers();
    for (const [key, value] of Object.entries(nodeReq.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
    }

    const request = new Request(url, {
      method: nodeReq.method,
      headers,
      body: bodyStr || undefined,
    });

    const response = await handleRequest(request);

    const resBody = await response.text();
    const resHeaders: Record<string, string> = {};
    response.headers.forEach((v, k) => { resHeaders[k] = v; });
    nodeRes.writeHead(response.status, resHeaders);
    nodeRes.end(resBody);
  } catch (e: any) {
    console.error('API Error:', e?.stack || e?.message || e);
    nodeRes.writeHead(500, { 'Content-Type': 'application/json' });
    nodeRes.end(JSON.stringify({ success: false, message: e?.message || 'Erro interno' }));
  }
}

async function handleRequest(request: Request): Promise<Response> {
  const { path, params } = parseUrl(request.url);

  if (path === '/health') return _json({ status: 'ok', timestamp: new Date().toISOString() });
  if (path.startsWith('/auth')) return handleAuth(request, path, params);
  if (path.startsWith('/equipamentos')) return handleEquipamentos(request, path, params);
  if (path.startsWith('/leituras')) return handleLeituras(request, path, params);
  if (path.startsWith('/suprimentos')) return handleSuprimentos(request, path, params);
  if (path.startsWith('/alertas')) return handleAlertas(request, path, params);
  if (path.startsWith('/relatorios')) return handleRelatorios(request, path, params);
  if (path.startsWith('/agents')) return handleAgents(request, path, params);
  if (path.startsWith('/auditoria')) return handleAuditoria(request, path, params);
  return _error('Rota não encontrada', 404);
}

// ======================== AUTH ========================
async function handleAuth(req: Request, path: string, params: Record<string, string>) {
  if (path === '/auth/login' && req.method === 'POST') {
    const body = await readBody(req);
    const { email, senha } = body;
    if (!email || !senha) return _error('Email e senha são obrigatórios', 400);
    const result = await _query('SELECT * FROM usuarios WHERE email = $1 AND ativo = 1', [email]);
    const user = result.rows[0];
    if (!user || _hashPassword(senha) !== user.senha_hash) return _error('Credenciais inválidas', 401);
    const token = _signToken({ userId: user.id, email: user.email, role: user.role });
    return _json({ success: true, data: { token, user: { id: user.id, nome: user.nome, email: user.email, role: user.role } } });
  }
  if (path === '/auth/me' && req.method === 'GET') {
    const auth = await _requireAuth(req);
    if (auth.error) return auth.error;
    return _json({ success: true, data: auth.user });
  }
  if (path === '/auth/usuarios' && req.method === 'GET') {
    const admin = await _requireAdmin(req);
    if (admin.error) return admin.error;
    const result = await _query('SELECT id, nome, email, role, cliente_id, ativo, created_at FROM usuarios ORDER BY created_at DESC');
    return _json({ success: true, data: result.rows });
  }
  if (path === '/auth/usuarios' && req.method === 'POST') {
    const admin = await _requireAdmin(req);
    if (admin.error) return admin.error;
    const body = await readBody(req);
    const { nome, email, senha, role, cliente_id } = body;
    if (!nome || !email || !senha) return _error('Nome, email e senha são obrigatórios', 400);
    const existing = await _query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (existing.rows[0]) return _error('Já existe um usuário com este email', 409);
    const result = await _query(
      `INSERT INTO usuarios (nome, email, senha_hash, role, cliente_id, ativo) VALUES ($1,$2,$3,$4,$5,1) RETURNING id, nome, email, role, cliente_id, ativo, created_at`,
      [nome, email, _hashPassword(senha), role || 'cliente', cliente_id || null]
    );
    return _json({ success: true, data: result.rows[0], message: 'Usuário criado com sucesso' }, 201);
  }
  return _error('Rota de auth não encontrada', 404);
}

// ======================== EQUIPAMENTOS ========================
async function handleEquipamentos(req: Request, path: string, params: Record<string, string>) {
  const auth = await _requireAuth(req);
  if (auth.error) return auth.error;

  if (path === '/equipamentos/stats' && req.method === 'GET') {
    const total = Number((await _query('SELECT COUNT(*) as count FROM equipamentos')).rows[0].count);
    const subq = `SELECT l.equipamento_id, l.status_online FROM leituras l INNER JOIN (SELECT equipamento_id, MAX(data_leitura) as md FROM leituras GROUP BY equipamento_id) x ON l.equipamento_id=x.equipamento_id AND l.data_leitura=x.md`;
    const online = Number((await _query(`SELECT COUNT(*) as count FROM (${subq}) WHERE status_online=1`)).rows[0].count);
    const offline = Number((await _query(`SELECT COUNT(*) as count FROM (${subq}) WHERE status_online=0`)).rows[0].count);
    const tonersBaixos = Number((await _query("SELECT COUNT(*) as count FROM suprimentos WHERE percentual<=20")).rows[0].count);
    const alertasCriticos = Number((await _query("SELECT COUNT(*) as count FROM alertas WHERE resolvido=0 AND nivel='critical'")).rows[0].count);
    const now = new Date();
    const fd = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const paginas = Number((await _query('SELECT COALESCE(SUM(contador_total),0) as total FROM leituras WHERE data_leitura>=$1',[fd])).rows[0].total);
    const clientes = (await _query(`SELECT e.cliente, SUM(l.contador_total) as paginas FROM equipamentos e INNER JOIN leituras l ON l.equipamento_id=e.id WHERE l.data_leitura>=$1 GROUP BY e.cliente ORDER BY paginas DESC LIMIT 10`,[fd])).rows;
    return _json({ success: true, data: { total_equipamentos: total, online, offline, toners_baixos: tonersBaixos, alertas_criticos: alertasCriticos, total_paginas_mes: paginas, clientes_maior_volume: clientes } });
  }

  if (path === '/equipamentos' && req.method === 'GET') {
    const { cliente, status, search, page = '1', per_page = '10' } = params;
    let countQ = 'SELECT COUNT(*) as count FROM equipamentos WHERE 1=1';
    let q = `SELECT e.*, (SELECT COUNT(*) FROM alertas a WHERE a.equipamento_id=e.id AND a.resolvido=0) as alertas_ativos FROM equipamentos e WHERE 1=1`;
    const p: any[] = [], cp: any[] = []; let pi = 1, cpi = 1;
    if (cliente) { q += ` AND e.cliente=$${pi}`; countQ += ` AND cliente=$${cpi}`; p.push(cliente); cp.push(cliente); pi++; cpi++; }
    if (status) { q += ` AND e.status_monitoramento=$${pi}`; countQ += ` AND status_monitoramento=$${cpi}`; p.push(status); cp.push(status); pi++; cpi++; }
    if (search) { const s = `%${search}%`; q += ` AND (e.cliente LIKE $${pi} OR e.ip LIKE $${pi+1} OR e.modelo LIKE $${pi+2} OR e.numero_serie LIKE $${pi+3})`; countQ += ` AND (cliente LIKE $${cpi} OR ip LIKE $${cpi+1} OR modelo LIKE $${cpi+2} OR numero_serie LIKE $${cpi+3})`; p.push(s,s,s,s); cp.push(s,s,s,s); pi+=4; cpi+=4; }
    const total = Number((await _query(countQ, cp)).rows[0].count);
    const pn = Math.max(1, Number(page)), ppn = Math.max(1, Math.min(100, Number(per_page))), offset = (pn-1)*ppn;
    q += ` ORDER BY e.created_at DESC LIMIT $${pi} OFFSET $${pi+1}`; p.push(ppn, offset);
    return _json({ success: true, data: { data: (await _query(q, p)).rows, total } });
  }

  if (path.match(/^\/equipamentos\/\d+$/) && req.method === 'GET') {
    const id = getSegment(path, 1);
    const equip = (await _query('SELECT * FROM equipamentos WHERE id=$1',[id])).rows[0];
    if (!equip) return _error('Equipamento não encontrado', 404);
    const leitura = (await _query('SELECT * FROM leituras WHERE equipamento_id=$1 ORDER BY data_leitura DESC LIMIT 1',[id])).rows[0];
    const suprimentos = (await _query('SELECT * FROM suprimentos WHERE equipamento_id=$1',[id])).rows;
    const config = (await _query('SELECT * FROM config_coleta WHERE equipamento_id=$1',[id])).rows[0];
    return _json({ success: true, data: { ...equip, ultima_leitura: leitura || null, suprimentos, config_coleta: config || null } });
  }

  if (path === '/equipamentos' && req.method === 'POST') {
    const body = await readBody(req);
    const { cliente, unidade, ip, comunidade_snmp, fabricante, modelo, numero_serie, localizacao, contrato, status_monitoramento } = body;
    if (!cliente || !ip) return _error('Cliente e IP são obrigatórios', 400);
    const result = await _query(`INSERT INTO equipamentos (cliente, unidade, ip, comunidade_snmp, fabricante, modelo, numero_serie, localizacao, contrato, status_monitoramento) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [cliente, unidade||null, ip, comunidade_snmp||'public', fabricante||null, modelo||null, numero_serie||null, localizacao||null, contrato||null, status_monitoramento||'ativo']);
    return _json({ success: true, data: result.rows[0], message: 'Equipamento criado com sucesso' }, 201);
  }

  if (path.match(/^\/equipamentos\/\d+$/) && req.method === 'PUT') {
    const id = getSegment(path, 1);
    const body = await readBody(req);
    const existing = (await _query('SELECT * FROM equipamentos WHERE id=$1',[id])).rows[0];
    if (!existing) return _error('Equipamento não encontrado', 404);
    const result = await _query(`UPDATE equipamentos SET cliente=$1, unidade=$2, ip=$3, comunidade_snmp=$4, fabricante=$5, modelo=$6, numero_serie=$7, localizacao=$8, contrato=$9, status_monitoramento=$10, updated_at=(NOW() AT TIME ZONE 'UTC')::text WHERE id=$11 RETURNING *`,
      [body.cliente||existing.cliente, body.unidade||existing.unidade, body.ip||existing.ip, body.comunidade_snmp||existing.comunidade_snmp, body.fabricante||existing.fabricante, body.modelo||existing.modelo, body.numero_serie||existing.numero_serie, body.localizacao||existing.localizacao, body.contrato||existing.contrato, body.status_monitoramento||existing.status_monitoramento, id]);
    return _json({ success: true, data: result.rows[0], message: 'Equipamento atualizado com sucesso' });
  }

  if (path.match(/^\/equipamentos\/\d+$/) && req.method === 'DELETE') {
    const id = getSegment(path, 1);
    const existing = (await _query('SELECT * FROM equipamentos WHERE id=$1',[id])).rows[0];
    if (!existing) return _error('Equipamento não encontrado', 404);
    await _query('DELETE FROM equipamentos WHERE id=$1',[id]);
    return _json({ success: true, message: 'Equipamento excluído com sucesso' });
  }

  if (path.match(/^\/equipamentos\/\d+\/collect$/) && req.method === 'POST') {
    const id = parseInt(getSegment(path, 1)!);
    const equip = (await _query('SELECT * FROM equipamentos WHERE id=$1',[id])).rows[0];
    if (!equip) return _error('Equipamento não encontrado', 404);

    if (isPrivateIP(equip.ip)) {
      const agent = (await _query(`SELECT a.id, a.name, a.status, a.last_heartbeat FROM agents a WHERE a.id=$1 AND a.status='active'`,[equip.agent_id])).rows[0];
      if (!agent) return _json({ success: false, data: { reason: 'private_ip_no_agent', ip: equip.ip, hint: 'Instale um Onyx Agent na rede do cliente.', agent_required: true }, message: 'IP privado. Não é possível coletar diretamente.' }, 400);
      const lastHb = agent.last_heartbeat ? new Date(agent.last_heartbeat).getTime() : 0;
      if (lastHb < Date.now() - 10*60*1000) return _json({ success: false, data: { reason: 'agent_offline', agent_name: agent.name }, message: `Agent "${agent.name}" parece estar offline.` }, 400);
      await _query(`INSERT INTO agent_logs (agent_id, level, message, details) VALUES ($1,'info',$2,$3)`,[agent.id, `Coleta solicitada para ${equip.ip}`, JSON.stringify({ equipamento_id: equip.id })]);
      return _json({ success: true, data: { reason: 'routed_to_agent', agent_id: agent.id, agent_name: agent.name }, message: `Coleta enviada ao Agent "${agent.name}".` });
    }

    const snmp = await import('../../server/snmp.js');
    const printerData = await snmp.getPrinterData(equip.ip, equip.comunidade_snmp);
    await _query(`INSERT INTO leituras (equipamento_id, contador_total, contador_pb, contador_cor, toner_preto, toner_ciano, toner_magenta, toner_amarelo, status_online, mensagens_erro, numero_serie_equip, modelo_equip, nome_equip) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [id, printerData.contador_total, printerData.contador_pb, printerData.contador_cor, printerData.toner_preto, printerData.toner_ciano, printerData.toner_magenta, printerData.toner_amarelo, printerData.online?1:0, printerData.mensagens_erro, printerData.numero_serie, printerData.modelo_equip, printerData.nome_equip]);
    const toners = [{t:'preto',p:printerData.toner_preto},{t:'ciano',p:printerData.toner_ciano},{t:'magenta',p:printerData.toner_magenta},{t:'amarelo',p:printerData.toner_amarelo}];
    for (const toner of toners) {
      const ex = (await _query('SELECT id FROM suprimentos WHERE equipamento_id=$1 AND tipo=$2',[id,toner.t])).rows[0];
      if (ex) await _query(`UPDATE suprimentos SET percentual=$1, ultima_leitura=(NOW() AT TIME ZONE 'UTC')::text, updated_at=(NOW() AT TIME ZONE 'UTC')::text WHERE id=$2`,[toner.p,ex.id]);
      else await _query('INSERT INTO suprimentos (equipamento_id,tipo,percentual) VALUES ($1,$2,$3)',[id,toner.t,toner.p]);
    }
    return _json({ success: true, data: printerData, message: 'Coleta realizada com sucesso' });
  }

  return _error('Rota de equipamentos não encontrada', 404);
}

// ======================== LEITURAS ========================
async function handleLeituras(req: Request, path: string, params: Record<string, string>) {
  const auth = await _requireAuth(req);
  if (auth.error) return auth.error;

  if (path === '/leituras' && req.method === 'GET') {
    const { equipamento_id, data_inicio, data_fim, page = '1', limit = '50' } = params;
    let q = `SELECT l.*, e.cliente, e.modelo, e.numero_serie FROM leituras l LEFT JOIN equipamentos e ON l.equipamento_id=e.id WHERE 1=1`;
    const p: any[] = []; let pi = 1;
    if (equipamento_id) { q += ` AND l.equipamento_id=$${pi}`; p.push(equipamento_id); pi++; }
    if (data_inicio) { q += ` AND l.data_leitura>=$${pi}`; p.push(data_inicio); pi++; }
    if (data_fim) { q += ` AND l.data_leitura<=$${pi}`; p.push(data_fim); pi++; }
    const countQ = q.replace('SELECT l.*, e.cliente, e.modelo, e.numero_serie', 'SELECT COUNT(*) as total');
    const total = Number((await _query(countQ, p)).rows[0].total);
    const offset = (Number(page)-1)*Number(limit);
    q += ` ORDER BY l.data_leitura DESC LIMIT $${pi} OFFSET $${pi+1}`; p.push(Number(limit), offset);
    return _json({ success: true, data: { data: (await _query(q, p)).rows, total } });
  }

  if (path.match(/^\/leituras\/equipamento\/\d+$/) && req.method === 'GET') {
    const id = getSegment(path, 2);
    const { page = '1', limit = '100' } = params;
    const total = Number((await _query('SELECT COUNT(*) as total FROM leituras WHERE equipamento_id=$1',[id])).rows[0].total);
    const offset = (Number(page)-1)*Number(limit);
    return _json({ success: true, data: (await _query('SELECT * FROM leituras WHERE equipamento_id=$1 ORDER BY data_leitura DESC LIMIT $2 OFFSET $3',[id,Number(limit),offset])).rows });
  }

  if (path.match(/^\/leituras\/\d+$/) && req.method === 'GET') {
    const result = await _query(`SELECT l.*, e.cliente, e.modelo, e.numero_serie, e.ip FROM leituras l LEFT JOIN equipamentos e ON l.equipamento_id=e.id WHERE l.id=$1`,[getSegment(path,1)]);
    if (!result.rows[0]) return _error('Leitura não encontrada', 404);
    return _json({ success: true, data: result.rows[0] });
  }

  return _error('Rota de leituras não encontrada', 404);
}

// ======================== SUPRIMENTOS ========================
async function handleSuprimentos(req: Request, path: string, params: Record<string, string>) {
  const auth = await _requireAuth(req);
  if (auth.error) return auth.error;

  if (path === '/suprimentos' && req.method === 'GET') {
    const { equipamento_id, tipo } = params;
    let q = `SELECT s.*, e.cliente, e.modelo, e.numero_serie, e.ip FROM suprimentos s LEFT JOIN equipamentos e ON s.equipamento_id=e.id WHERE 1=1`;
    const p: any[] = []; let pi = 1;
    if (equipamento_id) { q += ` AND s.equipamento_id=$${pi}`; p.push(equipamento_id); pi++; }
    if (tipo) { q += ` AND s.tipo=$${pi}`; p.push(tipo); pi++; }
    return _json({ success: true, data: (await _query(q + ' ORDER BY s.percentual ASC', p)).rows });
  }

  if (path.match(/^\/suprimentos\/equipamento\/\d+$/) && req.method === 'GET') {
    return _json({ success: true, data: (await _query('SELECT * FROM suprimentos WHERE equipamento_id=$1',[getSegment(path,2)])).rows });
  }

  if (path.match(/^\/suprimentos\/\d+$/) && req.method === 'PUT') {
    const id = getSegment(path, 1);
    const body = await readBody(req);
    const existing = (await _query('SELECT * FROM suprimentos WHERE id=$1',[id])).rows[0];
    if (!existing) return _error('Suprimento não encontrado', 404);
    const result = await _query(`UPDATE suprimentos SET percentual=$1, previsao_troca=$2, updated_at=(NOW() AT TIME ZONE 'UTC')::text WHERE id=$3 RETURNING *`,
      [body.percentual!==undefined?body.percentual:existing.percentual, body.previsao_troca!==undefined?body.previsao_troca:existing.previsao_troca, id]);
    return _json({ success: true, data: result.rows[0], message: 'Suprimento atualizado com sucesso' });
  }

  return _error('Rota de suprimentos não encontrada', 404);
}

// ======================== ALERTAS ========================
async function handleAlertas(req: Request, path: string, params: Record<string, string>) {
  const auth = await _requireAuth(req);
  if (auth.error) return auth.error;

  if (path === '/alertas/stats' && req.method === 'GET') {
    const total = Number((await _query('SELECT COUNT(*) as count FROM alertas')).rows[0].count);
    const ativos = Number((await _query('SELECT COUNT(*) as count FROM alertas WHERE resolvido=0')).rows[0].count);
    const criticos = Number((await _query("SELECT COUNT(*) as count FROM alertas WHERE resolvido=0 AND nivel='critical'")).rows[0].count);
    const warnings = Number((await _query("SELECT COUNT(*) as count FROM alertas WHERE resolvido=0 AND nivel='warning'")).rows[0].count);
    const infos = Number((await _query("SELECT COUNT(*) as count FROM alertas WHERE resolvido=0 AND nivel='info'")).rows[0].count);
    const porTipo = (await _query("SELECT tipo, COUNT(*) as count FROM alertas WHERE resolvido=0 GROUP BY tipo ORDER BY count DESC")).rows;
    const ultimos = (await _query(`SELECT a.*, e.cliente, e.modelo FROM alertas a LEFT JOIN equipamentos e ON a.equipamento_id=e.id ORDER BY a.created_at DESC LIMIT 10`)).rows;
    return _json({ success: true, data: { total, ativos, criticos, warnings, infos, por_tipo: porTipo, ultimos_alertas: ultimos } });
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
    const total = Number((await _query(countQ, p)).rows[0].total);
    const offset = (Number(page)-1)*Number(limit);
    q += ` ORDER BY a.created_at DESC LIMIT $${pi} OFFSET $${pi+1}`; p.push(Number(limit), offset);
    return _json({ success: true, data: { data: (await _query(q, p)).rows, total } });
  }

  if (path.match(/^\/alertas\/\d+\/resolver$/) && req.method === 'PUT') {
    const id = getSegment(path, 1);
    const existing = (await _query('SELECT * FROM alertas WHERE id=$1',[id])).rows[0];
    if (!existing) return _error('Alerta não encontrado', 404);
    const result = await _query(`UPDATE alertas SET resolvido=1, resolvido_em=(NOW() AT TIME ZONE 'UTC')::text WHERE id=$1 RETURNING *`,[id]);
    return _json({ success: true, data: result.rows[0], message: 'Alerta resolvido com sucesso' });
  }

  return _error('Rota de alertas não encontrada', 404);
}

// ======================== RELATORIOS ========================
async function handleRelatorios(req: Request, path: string, params: Record<string, string>) {
  const auth = await _requireAuth(req);
  if (auth.error) return auth.error;

  if (path === '/relatorios/mensal' && req.method === 'GET') {
    const { mes, ano, cliente } = params;
    const cm = mes ? Number(mes) : new Date().getMonth()+1, cy = ano ? Number(ano) : new Date().getFullYear();
    const sd = `${cy}-${String(cm).padStart(2,'0')}-01`, ed = `${cy}-${String(cm).padStart(2,'0')}-31`;
    let q = `SELECT e.cliente, e.modelo, e.numero_serie, e.ip, COUNT(l.id) as total_leituras, MAX(l.contador_total)-MIN(l.contador_total) as impressions_month, MAX(l.contador_pb)-MIN(l.contador_pb) as pb_month, MAX(l.contador_cor)-MIN(l.contador_cor) as color_month, AVG(l.toner_preto) as avg_toner_preto, AVG(l.toner_ciano) as avg_toner_ciano, AVG(l.toner_magenta) as avg_toner_magenta, AVG(l.toner_amarelo) as avg_toner_amarelo FROM leituras l LEFT JOIN equipamentos e ON l.equipamento_id=e.id WHERE l.data_leitura>=$1 AND l.data_leitura<=$2`;
    const p: any[] = [sd,ed]; let pi = 3;
    if (cliente) { q += ` AND e.cliente=$${pi}`; p.push(cliente); pi++; }
    q += ' GROUP BY e.id ORDER BY e.cliente, e.modelo';
    return _json({ success: true, data: { periodo: { mes: cm, ano: cy, startDate: sd, endDate: ed }, detalhes: (await _query(q, p)).rows } });
  }

  if (path === '/relatorios/export/excel' && req.method === 'GET') {
    const { cliente, data_inicio, data_fim } = params;
    let q = `SELECT e.cliente, e.unidade, e.ip, e.modelo, e.numero_serie, l.data_leitura, l.contador_total, l.contador_pb, l.contador_cor, l.toner_preto, l.toner_ciano, l.toner_magenta, l.toner_amarelo, l.status_online FROM leituras l LEFT JOIN equipamentos e ON l.equipamento_id=e.id WHERE 1=1`;
    const p: any[] = []; let pi = 1;
    if (cliente) { q += ` AND e.cliente=$${pi}`; p.push(cliente); pi++; }
    if (data_inicio) { q += ` AND l.data_leitura>=$${pi}`; p.push(data_inicio); pi++; }
    if (data_fim) { q += ` AND l.data_leitura<=$${pi}`; p.push(data_fim); pi++; }
    q += ' ORDER BY e.cliente, l.data_leitura DESC';
    const rows = (await _query(q, p)).rows;
    if (!rows.length) return _error('Nenhum dado encontrado', 404);
    const headers = Object.keys(rows[0]);
    const csvRows = ['\uFEFF'+headers.join(';'), ...rows.map((r: any) => headers.map(h => { const v=r[h]; if(v===null||v===undefined) return ''; const s=String(v); return s.includes(';')||s.includes('"')||s.includes('\n')?`"${s.replace(/"/g,'""')}"`:s; }).join(';'))];
    return new Response(Buffer.from(csvRows.join('\n'),'utf-8'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename=relatorio_onyx.csv' } });
  }

  return _error('Rota de relatórios não encontrada', 404);
}

// ======================== AGENTS ========================
async function handleAgents(req: Request, path: string, params: Record<string, string>) {
  if (path === '/agents/register' && req.method === 'POST') {
    const body = await readBody(req);
    const { name, company_id, location, ip_address, version } = body;
    if (!name || !company_id) return _error('Nome e company_id são obrigatórios', 400);
    const crypto = await import('crypto');
    const apiKey = crypto.randomBytes(32).toString('hex');
    const result = await _query(`INSERT INTO agents (name, company_id, location, ip_address, api_key, version, status) VALUES ($1,$2,$3,$4,$5,$6,'active') RETURNING id, name, company_id, api_key, status, created_at`,
      [name, company_id, location||null, ip_address||null, apiKey, version||'1.0.0']);
    return _json({ success: true, data: result.rows[0], message: 'Agent registrado com sucesso' }, 201);
  }

  const agentMatch = path.match(/^\/agents\/(\d+)\/(heartbeat|config|collect|logs)$/);
  if (agentMatch) {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return _error('Token não fornecido', 401);
    const apiKey = authHeader.split(' ')[1];
    const agent = (await _query('SELECT id, name, status FROM agents WHERE api_key=$1',[apiKey])).rows[0];
    if (!agent) return _error('API Key inválida', 401);
    if (agent.status !== 'active') return _error('Agent inativo', 403);

    const [, agentId, action] = agentMatch;

    if (action === 'heartbeat' && req.method === 'POST') {
      const body = await readBody(req);
      await _query(`UPDATE agents SET last_heartbeat=(NOW() AT TIME ZONE 'UTC')::text, version=COALESCE($1,version), updated_at=(NOW() AT TIME ZONE 'UTC')::text WHERE id=$2`,[body.version||null,agentId]);
      return _json({ success: true, message: 'Heartbeat registrado' });
    }

    if (action === 'config' && req.method === 'GET') {
      return _json({ success: true, data: (await _query(`SELECT id, cliente, unidade, ip, comunidade_snmp, fabricante, modelo, numero_serie, localizacao FROM equipamentos WHERE agent_id=$1 AND status_monitoramento='ativo'`,[agentId])).rows });
    }

    if (action === 'collect' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body.equipamentos || !Array.isArray(body.equipamentos)) return _error('Dados inválidos', 400);
      let processed = 0, errors = 0;
      for (const equip of body.equipamentos) {
        try {
          const eq = (await _query('SELECT id FROM equipamentos WHERE ip=$1 AND agent_id=$2',[equip.ip,agentId])).rows[0];
          let eid: number;
          if (eq) { eid = eq.id; } else {
            const ne = await _query(`INSERT INTO equipamentos (cliente,ip,comunidade_snmp,fabricante,modelo,numero_serie,agent_id,status_monitoramento) VALUES ($1,$2,'public',$3,$4,$5,$6,'ativo') RETURNING id`,
              [equip.cliente||'Agent Discovery',equip.ip,equip.fabricante||null,equip.modelo||null,equip.numero_serie||null,agentId]);
            eid = ne.rows[0].id;
          }
          await _query(`INSERT INTO leituras (equipamento_id,contador_total,contador_pb,contador_cor,toner_preto,toner_ciano,toner_magenta,toner_amarelo,status_online,mensagens_erro,numero_serie_equip,modelo_equip,nome_equip) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [eid,equip.contadores?.total||0,equip.contadores?.pb||0,equip.contadores?.cor||0,equip.toner?.preto||0,equip.toner?.ciano||0,equip.toner?.magenta||0,equip.toner?.amarelo||0,equip.status_online?1:0,equip.mensagens_erro||'',equip.numero_serie||'',equip.modelo||'',equip.nome||'']);
          const toners = [{t:'preto',p:equip.toner?.preto||0},{t:'ciano',p:equip.toner?.ciano||0},{t:'magenta',p:equip.toner?.magenta||0},{t:'amarelo',p:equip.toner?.amarelo||0}];
          for (const toner of toners) {
            const ex = (await _query('SELECT id FROM suprimentos WHERE equipamento_id=$1 AND tipo=$2',[eid,toner.t])).rows[0];
            if (ex) await _query(`UPDATE suprimentos SET percentual=$1, ultima_leitura=(NOW() AT TIME ZONE 'UTC')::text, updated_at=(NOW() AT TIME ZONE 'UTC')::text WHERE id=$2`,[toner.p,ex.id]);
            else await _query('INSERT INTO suprimentos (equipamento_id,tipo,percentual) VALUES ($1,$2,$3)',[eid,toner.t,toner.p]);
          }
          if (!equip.status_online) {
            const exA = (await _query(`SELECT id FROM alertas WHERE equipamento_id=$1 AND tipo='offline' AND resolvido=0`,[eid])).rows[0];
            if (!exA) await _query(`INSERT INTO alertas (equipamento_id,tipo,mensagem,nivel) VALUES ($1,'offline',$2,'critical')`,[eid,`Equipamento ${equip.nome||equip.ip} está offline`]);
          } else {
            await _query(`UPDATE alertas SET resolvido=1, resolvido_em=(NOW() AT TIME ZONE 'UTC')::text WHERE equipamento_id=$1 AND tipo='offline' AND resolvido=0`,[eid]);
          }
          for (const toner of toners) {
            if (toner.p === 0) {
              const ex = (await _query(`SELECT id FROM alertas WHERE equipamento_id=$1 AND tipo='toner_zerado' AND mensagem LIKE $2 AND resolvido=0`,[eid,`%${toner.t}%`])).rows[0];
              if (!ex) await _query(`INSERT INTO alertas (equipamento_id,tipo,mensagem,nivel) VALUES ($1,'toner_zerado',$2,'critical')`,[eid,`Toner ${toner.t} zerado`]);
            } else if (toner.p <= 15) {
              const ex = (await _query(`SELECT id FROM alertas WHERE equipamento_id=$1 AND tipo='toner_baixo' AND mensagem LIKE $2 AND resolvido=0`,[eid,`%${toner.t}%`])).rows[0];
              if (!ex) await _query(`INSERT INTO alertas (equipamento_id,tipo,mensagem,nivel) VALUES ($1,'toner_baixo',$2,'warning')`,[eid,`Toner ${toner.t} com ${toner.p}%`]);
            } else {
              await _query(`UPDATE alertas SET resolvido=1, resolvido_em=(NOW() AT TIME ZONE 'UTC')::text WHERE equipamento_id=$1 AND tipo IN ('toner_baixo','toner_zerado') AND mensagem LIKE $2 AND resolvido=0`,[eid,`%${toner.t}%`]);
            }
          }
          processed++;
        } catch (err) { errors++; }
      }
      return _json({ success: true, data: { processed, errors, total: body.equipamentos.length } });
    }

    if (action === 'logs' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body.logs || !Array.isArray(body.logs)) return _error('Logs inválidos', 400);
      for (const log of body.logs) {
        await _query(`INSERT INTO agent_logs (agent_id,level,message,details) VALUES ($1,$2,$3,$4)`,[agentId,log.level||'info',log.message,log.details?JSON.stringify(log.details):null]);
      }
      return _json({ success: true, message: `${body.logs.length} logs recebidos` });
    }
  }

  const adminAuth = await _requireAdmin(req);
  if (adminAuth.error) return adminAuth.error;

  if (path === '/agents' && req.method === 'GET') {
    return _json({ success: true, data: (await _query(`SELECT a.*, (SELECT COUNT(*) FROM equipamentos e WHERE e.agent_id=a.id) as printers_count, (SELECT COUNT(*) FROM agent_logs al WHERE al.agent_id=a.id AND al.level='error' AND al.created_at > (NOW() AT TIME ZONE 'UTC')::text - interval '24 hours') as errors_24h FROM agents a ORDER BY a.created_at DESC`)).rows });
  }

  if (path.match(/^\/agents\/\d+$/) && req.method === 'GET') {
    const id = getSegment(path, 1);
    const agent = (await _query(`SELECT a.*, (SELECT COUNT(*) FROM equipamentos e WHERE e.agent_id=a.id) as printers_count FROM agents a WHERE a.id=$1`,[id])).rows[0];
    if (!agent) return _error('Agent não encontrado', 404);
    return _json({ success: true, data: { ...agent, equipamentos: (await _query('SELECT id, cliente, ip, modelo, numero_serie, status_monitoramento FROM equipamentos WHERE agent_id=$1',[id])).rows, logs: (await _query('SELECT * FROM agent_logs WHERE agent_id=$1 ORDER BY created_at DESC LIMIT 50',[id])).rows } });
  }

  if (path.match(/^\/agents\/\d+$/) && req.method === 'PUT') {
    const id = getSegment(path, 1);
    const body = await readBody(req);
    const existing = (await _query('SELECT * FROM agents WHERE id=$1',[id])).rows[0];
    if (!existing) return _error('Agent não encontrado', 404);
    const result = await _query(`UPDATE agents SET name=$1, company_id=$2, location=$3, status=$4, config=$5, updated_at=(NOW() AT TIME ZONE 'UTC')::text WHERE id=$6 RETURNING *`,
      [body.name||existing.name, body.company_id||existing.company_id, body.location!==undefined?body.location:existing.location, body.status||existing.status, body.config?JSON.stringify(body.config):existing.config, id]);
    return _json({ success: true, data: result.rows[0], message: 'Agent atualizado' });
  }

  if (path.match(/^\/agents\/\d+$/) && req.method === 'DELETE') {
    const id = getSegment(path, 1);
    const existing = (await _query('SELECT * FROM agents WHERE id=$1',[id])).rows[0];
    if (!existing) return _error('Agent não encontrado', 404);
    await _query('UPDATE equipamentos SET agent_id=NULL WHERE agent_id=$1',[id]);
    await _query('DELETE FROM agents WHERE id=$1',[id]);
    return _json({ success: true, message: 'Agent excluído com sucesso' });
  }

  if (path.match(/^\/agents\/\d+\/assign$/) && req.method === 'POST') {
    const id = getSegment(path, 1);
    const body = await readBody(req);
    if (!body.equipamento_id) return _error('equipamento_id é obrigatório', 400);
    if (!(await _query('SELECT id FROM agents WHERE id=$1',[id])).rows[0]) return _error('Agent não encontrado', 404);
    if (!(await _query('SELECT id FROM equipamentos WHERE id=$1',[body.equipamento_id])).rows[0]) return _error('Equipamento não encontrado', 404);
    await _query('UPDATE equipamentos SET agent_id=$1 WHERE id=$2',[id,body.equipamento_id]);
    return _json({ success: true, message: 'Equipamento atribuído ao agent' });
  }

  if (path.match(/^\/agents\/\d+\/unassign$/) && req.method === 'POST') {
    const id = getSegment(path, 1);
    const body = await readBody(req);
    if (!body.equipamento_id) return _error('equipamento_id é obrigatório', 400);
    await _query('UPDATE equipamentos SET agent_id=NULL WHERE id=$1 AND agent_id=$2',[body.equipamento_id,id]);
    return _json({ success: true, message: 'Equipamento removido do agent' });
  }

  return _error('Rota de agents não encontrada', 404);
}

// ======================== AUDITORIA ========================
async function handleAuditoria(req: Request, path: string, params: Record<string, string>) {
  const auth = await _requireAuth(req);
  if (auth.error) return auth.error;

  if (path === '/auditoria/stats' && req.method === 'GET') {
    const { data_inicio, data_fim } = params;
    let df = ''; const p: any[] = [];
    if (data_inicio) { df += ` AND data_impressao>=${p.length+1}`; p.push(data_inicio); }
    if (data_fim) { df += ` AND data_impressao<=${p.length+1}`; p.push(data_fim); }
    const [total, porUsuario, porEquipamento, porCliente, porMes, porFonte, porCor, porStatus] = await Promise.all([
      _query(`SELECT COUNT(*) as total, COALESCE(SUM(total_paginas),0) as total_paginas FROM auditoria_impressoes WHERE 1=1${df}`,p),
      _query(`SELECT usuario, COUNT(*) as total_impressoes, SUM(total_paginas) as total_paginas FROM auditoria_impressoes WHERE usuario IS NOT NULL AND usuario != ''${df} GROUP BY usuario ORDER BY total_paginas DESC LIMIT 10`,p),
      _query(`SELECT a.equipamento_id, e.modelo, e.ip, COUNT(*) as total_impressoes, SUM(a.total_paginas) as total_paginas FROM auditoria_impressoes a LEFT JOIN equipamentos e ON a.equipamento_id=e.id${df?` WHERE 1=1${df}`:''} GROUP BY a.equipamento_id, e.modelo, e.ip ORDER BY total_paginas DESC LIMIT 10`,p),
      _query(`SELECT cliente, COUNT(*) as total_impressoes, SUM(total_paginas) as total_paginas FROM auditoria_impressoes WHERE cliente IS NOT NULL AND cliente != ''${df} GROUP BY cliente ORDER BY total_paginas DESC LIMIT 10`,p),
      _query(`SELECT SUBSTR(data_impressao,1,7) as mes, COUNT(*) as total_impressoes, SUM(total_paginas) as total_paginas FROM auditoria_impressoes WHERE 1=1${df} GROUP BY mes ORDER BY mes DESC LIMIT 12`,p),
      _query(`SELECT fonte, COUNT(*) as total FROM auditoria_impressoes WHERE 1=1${df} GROUP BY fonte`,p),
      _query(`SELECT CASE WHEN colorida=1 THEN 'Colorida' ELSE 'P&B' END as tipo, COUNT(*) as total, SUM(total_paginas) as paginas FROM auditoria_impressoes WHERE 1=1${df} GROUP BY colorida`,p),
      _query(`SELECT status_impressao, COUNT(*) as total FROM auditoria_impressoes WHERE 1=1${df} GROUP BY status_impressao`,p),
    ]);
    return _json({ success: true, data: { total_registros: parseInt(total.rows[0].total), total_paginas: parseInt(total.rows[0].total_paginas), por_usuario: porUsuario.rows, por_equipamento: porEquipamento.rows, por_cliente: porCliente.rows, por_mes: porMes.rows, por_fonte: porFonte.rows, por_cor: porCor.rows, por_status: porStatus.rows } });
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
    const rows = (await _query(q + ' ORDER BY a.data_impressao DESC', p)).rows;
    if (!rows.length) return _error('Nenhum dado encontrado', 404);
    const headers = ['Usuário','Computador','Documento','Data','Hora','Equipamento','Cliente','Páginas','Colorida','Duplex','Papel','Status','Fonte'];
    const csvRows = ['\uFEFF'+headers.join(';'), ...rows.map((r: any) => [r.usuario||'',r.computador||'',r.documento||'',r.data_impressao||'',r.hora_impressao||'',r.equipamento||'',r.cliente||'',r.total_paginas||0,r.colorida?'Sim':'Não',r.duplex?'Sim':'Não',r.tamanho_papel||'A4',r.status_impressao||'',r.fonte||''].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';'))];
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
    const total = parseInt((await _query(cq, cp)).rows[0].count);
    const offset = (parseInt(page)-1)*parseInt(per_page);
    q += ` ORDER BY a.data_impressao DESC, a.hora_impressao DESC LIMIT $${pi} OFFSET $${pi+1}`; p.push(parseInt(per_page), offset);
    return _json({ success: true, data: (await _query(q, p)).rows, total, page: parseInt(page), per_page: parseInt(per_page) });
  }

  if (path === '/auditoria' && req.method === 'POST') {
    const body = await readBody(req);
    const { equipamento_id, cliente, usuario, computador, documento, data_impressao, hora_impressao, total_paginas, colorida, duplex, tamanho_papel, status_impressao, fonte, dados_extras } = body;
    const result = await _query(`INSERT INTO auditoria_impressoes (equipamento_id,cliente,usuario,computador,documento,data_impressao,hora_impressao,total_paginas,colorida,duplex,tamanho_papel,status_impressao,fonte,dados_extras) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [equipamento_id||null,cliente||null,usuario||null,computador||null,documento||null,data_impressao||new Date().toISOString().split('T')[0],hora_impressao||new Date().toTimeString().slice(0,8),total_paginas||1,colorida?1:0,duplex?1:0,tamanho_papel||'A4',status_impressao||'concluida',fonte||'manual',dados_extras?JSON.stringify(dados_extras):'{}']);
    return _json({ success: true, data: result.rows[0] }, 201);
  }

  if (path === '/auditoria/batch' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body.records || !Array.isArray(body.records) || !body.records.length) return _error('Nenhum registro fornecido', 400);
    let inserted = 0;
    for (const rec of body.records) {
      try {
        await _query(`INSERT INTO auditoria_impressoes (equipamento_id,cliente,usuario,computador,documento,data_impressao,hora_impressao,total_paginas,colorida,duplex,tamanho_papel,status_impressao,fonte,ip_equipamento,numero_serie,modelo_equip,dados_extras) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [rec.equipamento_id||null,rec.cliente||null,rec.usuario||null,rec.computador||null,rec.documento||null,rec.data_impressao||new Date().toISOString().split('T')[0],rec.hora_impressao||new Date().toTimeString().slice(0,8),rec.total_paginas||1,rec.colorida?1:0,rec.duplex?1:0,rec.tamanho_papel||'A4',rec.status_impressao||'concluida',rec.fonte||'spooler',rec.ip_equipamento||null,rec.numero_serie||null,rec.modelo_equip||null,rec.dados_extras?JSON.stringify(rec.dados_extras):'{}']);
        inserted++;
      } catch (e) { console.error('Error inserting audit record:', e); }
    }
    return _json({ success: true, data: { inserted, total: body.records.length } });
  }

  if (path.match(/^\/auditoria\/\d+$/) && req.method === 'DELETE') {
    await _query('DELETE FROM auditoria_impressoes WHERE id=$1',[getSegment(path,1)]);
    return _json({ success: true, message: 'Registro excluído' });
  }

  if (path === '/auditoria/config' && req.method === 'GET') {
    return _json({ success: true, data: (await _query(`SELECT c.*, e.modelo, e.ip FROM auditoria_config c LEFT JOIN equipamentos e ON c.equipamento_id=e.id ORDER BY c.created_at DESC`)).rows });
  }

  if (path === '/auditoria/config' && req.method === 'POST') {
    const body = await readBody(req);
    const result = await _query(`INSERT INTO auditoria_config (tipo_integracao,equipamento_id,config,ativo) VALUES ($1,$2,$3,$4) RETURNING *`,
      [body.tipo_integracao, body.equipamento_id||null, JSON.stringify(body.config||{}), body.ativo!==undefined?(body.ativo?1:0):1]);
    return _json({ success: true, data: result.rows[0] }, 201);
  }

  if (path.match(/^\/auditoria\/config\/\d+$/) && req.method === 'DELETE') {
    await _query('DELETE FROM auditoria_config WHERE id=$1',[getSegment(path,2)]);
    return _json({ success: true, message: 'Configuração excluída' });
  }

  return _error('Rota de auditoria não encontrada', 404);
}
