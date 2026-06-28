import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

let _adminDb: any, _adminAuth: any;

async function loadDeps() {
  if (!_adminDb) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Missing Firebase Admin credentials');
    }

    if (getApps().length === 0) {
      initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    }

    _adminDb = getFirestore();
    _adminAuth = getAuth();
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

function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return false;
  return parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || parts[0] === 127 || parts[0] === 0;
}

async function requireAuth(req: Request): Promise<{ user: any; error?: Response }> {
  const h = req.headers.get('authorization');
  if (!h || !h.startsWith('Bearer ')) return { user: null, error: _json({ success: false, message: 'Token não fornecido' }, 401) };
  try {
    const token = h.split(' ')[1];
    const decoded = await _adminAuth.verifyIdToken(token);
    let userDoc = await _adminDb.collection('usuarios').doc(decoded.uid).get();
    if (!userDoc.exists) {
      const userRecord = await _adminAuth.getUser(decoded.uid);
      await _adminDb.collection('usuarios').doc(decoded.uid).set({
        nome: userRecord.displayName || userRecord.email?.split('@')[0] || 'User',
        email: userRecord.email,
        role: 'admin',
        ativo: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
      userDoc = await _adminDb.collection('usuarios').doc(decoded.uid).get();
    }
    if (!userDoc.data()?.ativo) return { user: null, error: _json({ success: false, message: 'Usuário não encontrado' }, 401) };
    return { user: { id: userDoc.id, ...userDoc.data() } };
  } catch (e: any) {
    console.error('Auth error:', e?.message);
    return { user: null, error: _json({ success: false, message: 'Token inválido' }, 401) };
  }
}

async function requireAdmin(req: Request): Promise<{ user: any; error?: Response }> {
  const { user, error } = await requireAuth(req);
  if (error) return { user: null, error };
  if (user.role !== 'admin') return { user: null, error: _json({ success: false, message: 'Acesso negado' }, 403) };
  return { user };
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
    try {
      const userRecord = await _adminAuth.getUserByEmail(email);
      let userDoc = await _adminDb.collection('usuarios').doc(userRecord.uid).get();
      if (!userDoc.exists) {
        await _adminDb.collection('usuarios').doc(userRecord.uid).set({
          nome: userRecord.displayName || email.split('@')[0],
          email: userRecord.email,
          role: 'admin',
          ativo: true,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        });
        userDoc = await _adminDb.collection('usuarios').doc(userRecord.uid).get();
      }
      const userData = userDoc.data();
      if (!userData?.ativo) return _error('Usuário inativo', 403);
      const customToken = await _adminAuth.createCustomToken(userRecord.uid);
      return _json({ success: true, data: { token: customToken, user: { id: userRecord.uid, nome: userData.nome, email: userData.email, role: userData.role } } });
    } catch (e: any) {
      console.error('Login error:', e?.message);
      if (e.code === 'auth/user-not-found') return _error('Usuário não encontrado', 404);
      if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') return _error('Credenciais inválidas', 401);
      return _error('Erro ao fazer login', 500);
    }
  }

  if (path === '/auth/me' && req.method === 'GET') {
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    return _json({ success: true, data: auth.user });
  }

  if (path === '/auth/usuarios' && req.method === 'GET') {
    const admin = await requireAdmin(req);
    if (admin.error) return admin.error;
    const snapshot = await _adminDb.collection('usuarios').orderBy('createdAt', 'desc').get();
    const usuarios = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    return _json({ success: true, data: usuarios });
  }

  if (path === '/auth/usuarios' && req.method === 'POST') {
    const admin = await requireAdmin(req);
    if (admin.error) return admin.error;
    const body = await readBody(req);
    const { nome, email, senha, role, cliente_id } = body;
    if (!nome || !email || !senha) return _error('Nome, email e senha são obrigatórios', 400);
    try {
      const userRecord = await _adminAuth.createUser({ email, password: senha, displayName: nome });
      await _adminDb.collection('usuarios').doc(userRecord.uid).set({
        nome, email, role: role || 'cliente', clienteId: cliente_id || null, ativo: true, createdAt: Timestamp.now()
      });
      return _json({ success: true, data: { id: userRecord.uid, nome, email, role: role || 'cliente' }, message: 'Usuário criado com sucesso' }, 201);
    } catch (e: any) {
      console.error('Create user error:', e?.message);
      if (e.code === 'auth/email-already-exists') return _error('Já existe um usuário com este email', 409);
      return _error('Erro ao criar usuário', 500);
    }
  }

  return _error('Rota de auth não encontrada', 404);
}

// ======================== EQUIPAMENTOS ========================
async function handleEquipamentos(req: Request, path: string, params: Record<string, string>) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;

  if (path === '/equipamentos/stats' && req.method === 'GET') {
    const equipSnapshot = await _adminDb.collection('equipamentos').get();
    const total = equipSnapshot.size;

    const leiturasSnapshot = await _adminDb.collection('leituras').get();
    const leiturasMap = new Map<string, any>();
    leiturasSnapshot.docs.forEach((doc: any) => {
      const data = doc.data();
      const existing = leiturasMap.get(data.equipamentoId);
      if (!existing || data.dataLeitura > existing.dataLeitura) {
        leiturasMap.set(data.equipamentoId, data);
      }
    });

    let online = 0, offline = 0;
    leiturasMap.forEach((leitura: any) => {
      if (leitura.statusOnline === 1) online++; else offline++;
    });

    const suprimentosSnapshot = await _adminDb.collection('suprimentos').where('percentual', '<=', 20).get();
    const tonersBaixos = suprimentosSnapshot.size;

    const alertasSnapshot = await _adminDb.collection('alertas').where('resolvido', '==', 0).where('nivel', '==', 'critical').get();
    const alertasCriticos = alertasSnapshot.size;

    const now = new Date();
    const fd = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    let paginas = 0;
    leiturasSnapshot.docs.forEach((doc: any) => {
      const data = doc.data();
      if (data.dataLeitura >= fd) paginas += data.contadorTotal || 0;
    });

    return _json({ success: true, data: { total_equipamentos: total, online, offline, toners_baixos: tonersBaixos, alertas_criticos: alertasCriticos, total_paginas_mes: paginas, clientes_maior_volume: [] } });
  }

  if (path === '/equipamentos' && req.method === 'GET') {
    const { cliente, status, search, page = '1', per_page = '10' } = params;
    let query: FirebaseFirestore.Query = _adminDb.collection('equipamentos');
    if (cliente) query = query.where('cliente', '==', cliente);
    if (status) query = query.where('statusMonitoramento', '==', status);
    query = query.orderBy('createdAt', 'desc');

    const snapshot = await query.get();
    let equipamentos = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

    if (search) {
      const s = search.toLowerCase();
      equipamentos = equipamentos.filter((e: any) =>
        (e.cliente && e.cliente.toLowerCase().includes(s)) ||
        (e.ip && e.ip.includes(s)) ||
        (e.modelo && e.modelo.toLowerCase().includes(s)) ||
        (e.numeroSerie && e.numeroSerie.toLowerCase().includes(s))
      );
    }

    const total = equipamentos.length;
    const pn = Math.max(1, Number(page)), ppn = Math.max(1, Math.min(100, Number(per_page)));
    const offset = (pn - 1) * ppn;
    const data = equipamentos.slice(offset, offset + ppn);

    return _json({ success: true, data: { data, total } });
  }

  if (path.match(/^\/equipamentos\/[^\/]+$/) && req.method === 'GET') {
    const id = getSegment(path, 1)!;
    const doc = await _adminDb.collection('equipamentos').doc(id).get();
    if (!doc.exists) return _error('Equipamento não encontrado', 404);
    const equip = { id: doc.id, ...doc.data() };

    const leiturasSnapshot = await _adminDb.collection('leituras').where('equipamentoId', '==', id).orderBy('dataLeitura', 'desc').limit(1).get();
    const leitura = leiturasSnapshot.docs[0] ? { id: leiturasSnapshot.docs[0].id, ...leiturasSnapshot.docs[0].data() } : null;

    const suprimentosSnapshot = await _adminDb.collection('suprimentos').where('equipamentoId', '==', id).get();
    const suprimentos = suprimentosSnapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

    const configSnapshot = await _adminDb.collection('configColeta').where('equipamentoId', '==', id).limit(1).get();
    const config = configSnapshot.docs[0] ? { id: configSnapshot.docs[0].id, ...configSnapshot.docs[0].data() } : null;

    return _json({ success: true, data: { ...equip, ultima_leitura: leitura, suprimentos, config_coleta: config } });
  }

  if (path === '/equipamentos' && req.method === 'POST') {
    const body = await readBody(req);
    const { cliente, unidade, ip, comunidade_snmp, fabricante, modelo, numero_serie, localizacao, contrato, status_monitoramento, agentId } = body;
    if (!cliente || !ip) return _error('Cliente e IP são obrigatórios', 400);
    const docRef = await _adminDb.collection('equipamentos').add({
      cliente, unidade: unidade || null, ip, comunidadeSnmp: comunidade_snmp || 'public', fabricante: fabricante || null,
      modelo: modelo || null, numeroSerie: numero_serie || null, localizacao: localizacao || null, contrato: contrato || null,
      statusMonitoramento: status_monitoramento || 'ativo', agentId: agentId || null, createdAt: Timestamp.now(), updatedAt: Timestamp.now()
    });
    const doc = await docRef.get();
    return _json({ success: true, data: { id: doc.id, ...doc.data() }, message: 'Equipamento criado com sucesso' }, 201);
  }

  if (path.match(/^\/equipamentos\/[^\/]+$/) && req.method === 'PUT') {
    const id = getSegment(path, 1)!;
    const body = await readBody(req);
    const doc = await _adminDb.collection('equipamentos').doc(id).get();
    if (!doc.exists) return _error('Equipamento não encontrado', 404);
    const existing = doc.data();
    const updateData: any = { updatedAt: Timestamp.now() };
    if (body.cliente !== undefined) updateData.cliente = body.cliente;
    if (body.unidade !== undefined) updateData.unidade = body.unidade;
    if (body.ip !== undefined) updateData.ip = body.ip;
    if (body.comunidade_snmp !== undefined) updateData.comunidadeSnmp = body.comunidade_snmp;
    if (body.fabricante !== undefined) updateData.fabricante = body.fabricante;
    if (body.modelo !== undefined) updateData.modelo = body.modelo;
    if (body.numero_serie !== undefined) updateData.numeroSerie = body.numero_serie;
    if (body.localizacao !== undefined) updateData.localizacao = body.localizacao;
    if (body.contrato !== undefined) updateData.contrato = body.contrato;
    if (body.status_monitoramento !== undefined) updateData.statusMonitoramento = body.status_monitoramento;
    if (body.agentId !== undefined) updateData.agentId = body.agentId;
    await _adminDb.collection('equipamentos').doc(id).update(updateData);
    const updated = await _adminDb.collection('equipamentos').doc(id).get();
    return _json({ success: true, data: { id: updated.id, ...updated.data() }, message: 'Equipamento atualizado com sucesso' });
  }

  if (path.match(/^\/equipamentos\/[^\/]+$/) && req.method === 'DELETE') {
    const id = getSegment(path, 1)!;
    const doc = await _adminDb.collection('equipamentos').doc(id).get();
    if (!doc.exists) return _error('Equipamento não encontrado', 404);
    await _adminDb.collection('equipamentos').doc(id).delete();
    return _json({ success: true, message: 'Equipamento excluído com sucesso' });
  }

  if (path.match(/^\/equipamentos\/[^\/]+\/collect$/) && req.method === 'POST') {
    const id = getSegment(path, 1)!;
    const doc = await _adminDb.collection('equipamentos').doc(id).get();
    if (!doc.exists) return _error('Equipamento não encontrado', 404);
    const equip = { id: doc.id, ...doc.data() } as any;

    if (isPrivateIP(equip.ip)) {
      if (!equip.agentId) {
        return _json({ success: false, data: {
          reason: 'private_ip_no_agent', ip: equip.ip,
          hint: 'Este equipamento possui IP privado e não possui um Onyx Agent configurado. Instale um Onyx Agent na rede do cliente e vincule-o a este equipamento para permitir a coleta remota.',
          agent_required: true
        }, message: 'IP privado detectado. A coleta direta não é possível. Um Onyx Agent é necessário.' }, 400);
      }
      const agentDoc = await _adminDb.collection('agents').doc(equip.agentId).get();
      if (!agentDoc.exists || agentDoc.data()?.status !== 'active') return _json({ success: false, data: {
        reason: 'private_ip_no_agent', ip: equip.ip,
        hint: 'O Agent vinculado não está ativo. Verifique o status do Agent ou vincule um novo Agent a este equipamento.',
        agent_required: true
      }, message: 'Agent vinculado não encontrado ou inativo.' }, 400);
      const agent = { id: agentDoc.id, ...agentDoc.data() } as any;
      const lastHb = agent.lastHeartbeat?.toDate?.()?.getTime() || 0;
      if (lastHb < Date.now() - 10*60*1000) return _json({ success: false, data: {
        reason: 'agent_offline', agent_name: agent.name,
        hint: `O Agent "${agent.name}" não envia heartbeat há mais de 10 minutos. Verifique se está rodando na rede do cliente.`
      }, message: `Agent "${agent.name}" parece estar offline (sem heartbeat há ${Math.round((Date.now()-lastHb)/60000)} minutos).` }, 400);
      await _adminDb.collection('agentLogs').add({ agentId: agent.id, level: 'info', message: `Coleta solicitada para ${equip.ip}`, details: { equipamentoId: equip.id }, createdAt: Timestamp.now() });
      return _json({ success: true, data: {
        reason: 'routed_to_agent', agent_id: agent.id, agent_name: agent.name,
        hint: 'O Agent coletará os dados automaticamente e os enviará ao servidor.'
      }, message: `Coleta enviada ao Agent "${agent.name}". Aguarde a sincronização automática.` });
    }

    try {
      const snmp = await import('net-snmp');
      const OIDS = {
        totalCounter: '1.3.6.1.2.1.43.10.2.1.4.1.1', colorCounter: '1.3.6.1.2.1.43.10.2.1.4.1.2',
        tonerBlack: '1.3.6.1.2.1.43.11.1.1.9.1.1', tonerCyan: '1.3.6.1.2.1.43.11.1.1.9.1.2',
        tonerMagenta: '1.3.6.1.2.1.43.11.1.1.9.1.3', tonerYellow: '1.3.6.1.2.1.43.11.1.1.9.1.4',
        printerName: '1.3.6.1.2.1.25.3.2.1.3.1', serialNumber: '1.3.6.1.2.1.43.5.1.1.17.1',
        errorState: '1.3.6.1.2.1.25.3.5.1.1.1',
      };
      const printerData = await new Promise<any>((resolve, reject) => {
        const session = snmp.createSession(equip.ip, equip.comunidadeSnmp || 'public', { timeout: 5000, retries: 1, version: snmp.Version2c });
        session.get(Object.values(OIDS), (error: any, varbinds: any) => {
          session.close();
          if (error) return reject(new Error(`SNMP error for ${equip.ip}: ${error.message}`));
          const r: Record<string, any> = {};
          Object.keys(OIDS).forEach((k, i) => { r[k] = varbinds?.[i]?.value ?? 0; });
          resolve({
            online: true, contador_total: Number(r.totalCounter) || 0, contador_pb: Number(r.totalCounter) || 0,
            contador_cor: Number(r.colorCounter) || 0, toner_preto: 50, toner_ciano: 50,
            toner_magenta: 50, toner_amarelo: 50, nome_equip: String(r.printerName || ''),
            numero_serie: String(r.serialNumber || ''), modelo_equip: String(r.printerName || ''),
            mensagens_erro: String(r.errorState || ''),
          });
        });
      });
      await _adminDb.collection('leituras').add({
        equipamentoId: id, dataLeitura: new Date().toISOString().split('T')[0],
        contadorTotal: printerData.contador_total, contadorPb: printerData.contador_pb, contadorCor: printerData.contador_cor,
        tonerPreto: printerData.toner_preto, tonerCiano: printerData.toner_ciano, tonerMagenta: printerData.toner_magenta, tonerAmarelo: printerData.toner_amarelo,
        statusOnline: 1, mensagensErro: printerData.mensagens_erro, numeroSerieEquip: printerData.numero_serie,
        modeloEquip: printerData.modelo_equip, nomeEquip: printerData.nome_equip, createdAt: Timestamp.now()
      });
      const toners = [{t:'preto',p:printerData.toner_preto},{t:'ciano',p:printerData.toner_ciano},{t:'magenta',p:printerData.toner_magenta},{t:'amarelo',p:printerData.toner_amarelo}];
      for (const toner of toners) {
        const exSnapshot = await _adminDb.collection('suprimentos').where('equipamentoId', '==', id).where('tipo', '==', toner.t).limit(1).get();
        if (exSnapshot.docs[0]) {
          await _adminDb.collection('suprimentos').doc(exSnapshot.docs[0].id).update({ percentual: toner.p, ultimaLeitura: new Date().toISOString(), updatedAt: Timestamp.now() });
        } else {
          await _adminDb.collection('suprimentos').add({ equipamentoId: id, tipo: toner.t, percentual: toner.p, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
        }
      }
      return _json({ success: true, data: printerData, message: 'Coleta realizada com sucesso' });
    } catch (snmpErr: any) {
      return _json({ success: false, data: {
        reason: 'snmp_timeout', ip: equip.ip,
        hint: 'A impressora pode estar desligada, fora da rede, ou com o SNMP desabilitado. Verifique a conectividade de rede.'
      }, message: `Falha ao coletar via SNMP: ${snmpErr?.message || 'Erro desconhecido'}` }, 400);
    }
  }

  return _error('Rota de equipamentos não encontrada', 404);
}

// ======================== LEITURAS ========================
async function handleLeituras(req: Request, path: string, params: Record<string, string>) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;

  if (path === '/leituras' && req.method === 'GET') {
    const { equipamento_id, data_inicio, data_fim, page = '1', limit = '50' } = params;
    let query: FirebaseFirestore.Query = _adminDb.collection('leituras');
    if (equipamento_id) query = query.where('equipamentoId', '==', equipamento_id);
    if (data_inicio) query = query.where('dataLeitura', '>=', data_inicio);
    if (data_fim) query = query.where('dataLeitura', '<=', data_fim);
    query = query.orderBy('dataLeitura', 'desc');

    const snapshot = await query.get();
    const total = snapshot.size;
    const offset = (Number(page) - 1) * Number(limit);
    const data = snapshot.docs.slice(offset, offset + Number(limit)).map((doc: any) => ({ id: doc.id, ...doc.data() }));

    return _json({ success: true, data: { data, total } });
  }

  if (path.match(/^\/leituras\/equipamento\/[^\/]+$/) && req.method === 'GET') {
    const id = getSegment(path, 2)!;
    const { page = '1', limit = '100' } = params;
    const snapshot = await _adminDb.collection('leituras').where('equipamentoId', '==', id).orderBy('dataLeitura', 'desc').get();
    const total = snapshot.size;
    const offset = (Number(page) - 1) * Number(limit);
    const data = snapshot.docs.slice(offset, offset + Number(limit)).map((doc: any) => ({ id: doc.id, ...doc.data() }));
    return _json({ success: true, data });
  }

  if (path.match(/^\/leituras\/[^\/]+$/) && req.method === 'GET') {
    const id = getSegment(path, 1)!;
    const doc = await _adminDb.collection('leituras').doc(id).get();
    if (!doc.exists) return _error('Leitura não encontrada', 404);
    return _json({ success: true, data: { id: doc.id, ...doc.data() } });
  }

  return _error('Rota de leituras não encontrada', 404);
}

// ======================== SUPRIMENTOS ========================
async function handleSuprimentos(req: Request, path: string, params: Record<string, string>) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;

  if (path === '/suprimentos' && req.method === 'GET') {
    const { equipamento_id, tipo } = params;
    let query: FirebaseFirestore.Query = _adminDb.collection('suprimentos');
    if (equipamento_id) query = query.where('equipamentoId', '==', equipamento_id);
    if (tipo) query = query.where('tipo', '==', tipo);
    query = query.orderBy('percentual', 'asc');
    const snapshot = await query.get();
    return _json({ success: true, data: snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })) });
  }

  if (path.match(/^\/suprimentos\/equipamento\/[^\/]+$/) && req.method === 'GET') {
    const id = getSegment(path, 2)!;
    const snapshot = await _adminDb.collection('suprimentos').where('equipamentoId', '==', id).get();
    return _json({ success: true, data: snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })) });
  }

  if (path.match(/^\/suprimentos\/[^\/]+$/) && req.method === 'PUT') {
    const id = getSegment(path, 1)!;
    const body = await readBody(req);
    const doc = await _adminDb.collection('suprimentos').doc(id).get();
    if (!doc.exists) return _error('Suprimento não encontrado', 404);
    const updateData: any = { updatedAt: Timestamp.now() };
    if (body.percentual !== undefined) updateData.percentual = body.percentual;
    if (body.previsao_troca !== undefined) updateData.previsaoTroca = body.previsao_troca;
    await _adminDb.collection('suprimentos').doc(id).update(updateData);
    const updated = await _adminDb.collection('suprimentos').doc(id).get();
    return _json({ success: true, data: { id: updated.id, ...updated.data() }, message: 'Suprimento atualizado com sucesso' });
  }

  return _error('Rota de suprimentos não encontrada', 404);
}

// ======================== ALERTAS ========================
async function handleAlertas(req: Request, path: string, params: Record<string, string>) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;

  if (path === '/alertas/stats' && req.method === 'GET') {
    const snapshot = await _adminDb.collection('alertas').get();
    const alertas = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    const total = alertas.length;
    const ativos = alertas.filter((a: any) => a.resolvido === 0).length;
    const criticos = alertas.filter((a: any) => a.resolvido === 0 && a.nivel === 'critical').length;
    const warnings = alertas.filter((a: any) => a.resolvido === 0 && a.nivel === 'warning').length;
    const infos = alertas.filter((a: any) => a.resolvido === 0 && a.nivel === 'info').length;
    const porTipo = alertas.filter((a: any) => a.resolvido === 0).reduce((acc: any, a: any) => { acc[a.tipo] = (acc[a.tipo] || 0) + 1; return acc; }, {});
    const ultimos = alertas.filter((a: any) => a.resolvido === 0).sort((a: any, b: any) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)).slice(0, 10);
    return _json({ success: true, data: { total, ativos, criticos, warnings, infos, por_tipo: Object.entries(porTipo).map(([tipo, count]) => ({ tipo, count })), ultimos_alertas: ultimos } });
  }

  if (path === '/alertas' && req.method === 'GET') {
    const { tipo, nivel, resolvido, equipamento_id, page = '1', limit = '50' } = params;
    let query: FirebaseFirestore.Query = _adminDb.collection('alertas');
    if (tipo) query = query.where('tipo', '==', tipo);
    if (nivel) query = query.where('nivel', '==', nivel);
    if (resolvido !== undefined) query = query.where('resolvido', '==', resolvido === 'true' ? 1 : 0);
    if (equipamento_id) query = query.where('equipamentoId', '==', equipamento_id);
    query = query.orderBy('createdAt', 'desc');

    const snapshot = await query.get();
    const total = snapshot.size;
    const offset = (Number(page) - 1) * Number(limit);
    const data = snapshot.docs.slice(offset, offset + Number(limit)).map((doc: any) => ({ id: doc.id, ...doc.data() }));

    return _json({ success: true, data: { data, total } });
  }

  if (path.match(/^\/alertas\/[^\/]+\/resolver$/) && req.method === 'PUT') {
    const id = getSegment(path, 1)!;
    const doc = await _adminDb.collection('alertas').doc(id).get();
    if (!doc.exists) return _error('Alerta não encontrado', 404);
    await _adminDb.collection('alertas').doc(id).update({ resolvido: 1, resolvidoEm: Timestamp.now() });
    const updated = await _adminDb.collection('alertas').doc(id).get();
    return _json({ success: true, data: { id: updated.id, ...updated.data() }, message: 'Alerta resolvido com sucesso' });
  }

  return _error('Rota de alertas não encontrada', 404);
}

// ======================== RELATORIOS ========================
async function handleRelatorios(req: Request, path: string, params: Record<string, string>) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;

  if (path === '/relatorios/mensal' && req.method === 'GET') {
    const { mes, ano, cliente } = params;
    const cm = mes ? Number(mes) : new Date().getMonth()+1, cy = ano ? Number(ano) : new Date().getFullYear();
    const sd = `${cy}-${String(cm).padStart(2,'0')}-01`, ed = `${cy}-${String(cm).padStart(2,'0')}-31`;

    let equipQuery: FirebaseFirestore.Query = _adminDb.collection('equipamentos');
    if (cliente) equipQuery = equipQuery.where('cliente', '==', cliente);
    const equipSnapshot = await equipQuery.get();

    const detalhes = [];
    for (const equipDoc of equipSnapshot.docs) {
      const equip = { id: equipDoc.id, ...equipDoc.data() } as any;
      const leiturasSnapshot = await _adminDb.collection('leituras')
        .where('equipamentoId', '==', equip.id)
        .where('dataLeitura', '>=', sd)
        .where('dataLeitura', '<=', ed)
        .orderBy('dataLeitura', 'asc')
        .get();

      if (leiturasSnapshot.size === 0) continue;

      const leituras = leiturasSnapshot.docs.map((doc: any) => doc.data());
      const first = leituras[0], last = leituras[leituras.length - 1];

      detalhes.push({
        cliente: equip.cliente, modelo: equip.modelo, numero_serie: equip.numeroSerie, ip: equip.ip,
        total_leituras: leiturasSnapshot.size,
        impressions_month: (last.contadorTotal || 0) - (first.contadorTotal || 0),
        pb_month: (last.contadorPb || 0) - (first.contadorPb || 0),
        color_month: (last.contadorCor || 0) - (first.contadorCor || 0),
        avg_toner_preto: leituras.reduce((sum: number, l: any) => sum + (l.tonerPreto || 0), 0) / leituras.length,
        avg_toner_ciano: leituras.reduce((sum: number, l: any) => sum + (l.tonerCiano || 0), 0) / leituras.length,
        avg_toner_magenta: leituras.reduce((sum: number, l: any) => sum + (l.tonerMagenta || 0), 0) / leituras.length,
        avg_toner_amarelo: leituras.reduce((sum: number, l: any) => sum + (l.tonerAmarelo || 0), 0) / leituras.length,
      });
    }

    return _json({ success: true, data: { periodo: { mes: cm, ano: cy, startDate: sd, endDate: ed }, detalhes } });
  }

  if (path === '/relatorios/export/excel' && req.method === 'GET') {
    const { cliente, data_inicio, data_fim } = params;
    let query: FirebaseFirestore.Query = _adminDb.collection('leituras');
    if (data_inicio) query = query.where('dataLeitura', '>=', data_inicio);
    if (data_fim) query = query.where('dataLeitura', '<=', data_fim);
    query = query.orderBy('dataLeitura', 'desc');
    const snapshot = await query.get();

    const rows = [];
    for (const doc of snapshot.docs) {
      const leitura = doc.data();
      const equipDoc = await _adminDb.collection('equipamentos').doc(leitura.equipamentoId).get();
      const equip = equipDoc.data();
      if (cliente && equip?.cliente !== cliente) continue;
      rows.push({
        cliente: equip?.cliente || '', unidade: equip?.unidade || '', ip: equip?.ip || '', modelo: equip?.modelo || '',
        numero_serie: equip?.numeroSerie || '', data_leitura: leitura.dataLeitura, contador_total: leitura.contadorTotal,
        contador_pb: leitura.contadorPb, contador_cor: leitura.contadorCor, toner_preto: leitura.tonerPreto,
        toner_ciano: leitura.tonerCiano, toner_magenta: leitura.tonerMagenta, toner_amarelo: leitura.tonerAmarelo,
        status_online: leitura.statusOnline,
      });
    }

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
    const docRef = await _adminDb.collection('agents').add({
      name, companyId: company_id, location: location || null, ipAddress: ip_address || null,
      apiKey, version: version || '1.0.0', status: 'active', config: {},
      createdAt: Timestamp.now(), updatedAt: Timestamp.now()
    });
    const doc = await docRef.get();
    return _json({ success: true, data: { id: doc.id, ...doc.data() }, message: 'Agent registrado com sucesso' }, 201);
  }

  const agentMatch = path.match(/^\/agents\/([^\/]+)\/(heartbeat|config|collect|logs)$/);
  if (agentMatch) {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return _error('Token não fornecido', 401);
    const apiKey = authHeader.split(' ')[1];
    const agentsSnapshot = await _adminDb.collection('agents').where('apiKey', '==', apiKey).limit(1).get();
    if (agentsSnapshot.empty) return _error('API Key inválida', 401);
    const agentDoc = agentsSnapshot.docs[0];
    const agent = { id: agentDoc.id, ...agentDoc.data() } as any;
    if (agent.status !== 'active') return _error('Agent inativo', 403);

    const [, agentId, action] = agentMatch;

    if (action === 'heartbeat' && req.method === 'POST') {
      const body = await readBody(req);
      await _adminDb.collection('agents').doc(agentId).update({
        lastHeartbeat: Timestamp.now(), version: body.version || agent.version, updatedAt: Timestamp.now()
      });
      return _json({ success: true, message: 'Heartbeat registrado' });
    }

    if (action === 'config' && req.method === 'GET') {
      const snapshot = await _adminDb.collection('equipamentos').where('agentId', '==', agentId).where('statusMonitoramento', '==', 'ativo').get();
      return _json({ success: true, data: snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })) });
    }

    if (action === 'collect' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body.equipamentos || !Array.isArray(body.equipamentos)) return _error('Dados inválidos', 400);
      let processed = 0, errors = 0;
      for (const equip of body.equipamentos) {
        try {
          const eqSnapshot = await _adminDb.collection('equipamentos').where('ip', '==', equip.ip).where('agentId', '==', agentId).limit(1).get();
          let eid: string;
          if (!eqSnapshot.empty) {
            eid = eqSnapshot.docs[0].id;
          } else {
            const neRef = await _adminDb.collection('equipamentos').add({
              cliente: equip.cliente || 'Agent Discovery', ip: equip.ip, comunidadeSnmp: 'public',
              fabricante: equip.fabricante || null, modelo: equip.modelo || null, numeroSerie: equip.numero_serie || null,
              agentId, statusMonitoramento: 'ativo', createdAt: Timestamp.now(), updatedAt: Timestamp.now()
            });
            eid = neRef.id;
          }
          await _adminDb.collection('leituras').add({
            equipamentoId: eid, dataLeitura: new Date().toISOString().split('T')[0],
            contadorTotal: equip.contadores?.total || 0, contadorPb: equip.contadores?.pb || 0, contadorCor: equip.contadores?.cor || 0,
            tonerPreto: equip.toner?.preto || 0, tonerCiano: equip.toner?.ciano || 0, tonerMagenta: equip.toner?.magenta || 0, tonerAmarelo: equip.toner?.amarelo || 0,
            statusOnline: equip.status_online ? 1 : 0, mensagensErro: equip.mensagens_erro || '', numeroSerieEquip: equip.numero_serie || '',
            modeloEquip: equip.modelo || '', nomeEquip: equip.nome || '', createdAt: Timestamp.now()
          });
          const toners = [{t:'preto',p:equip.toner?.preto||0},{t:'ciano',p:equip.toner?.ciano||0},{t:'magenta',p:equip.toner?.magenta||0},{t:'amarelo',p:equip.toner?.amarelo||0}];
          for (const toner of toners) {
            const exSnapshot = await _adminDb.collection('suprimentos').where('equipamentoId', '==', eid).where('tipo', '==', toner.t).limit(1).get();
            if (exSnapshot.docs[0]) {
              await _adminDb.collection('suprimentos').doc(exSnapshot.docs[0].id).update({ percentual: toner.p, ultimaLeitura: new Date().toISOString(), updatedAt: Timestamp.now() });
            } else {
              await _adminDb.collection('suprimentos').add({ equipamentoId: eid, tipo: toner.t, percentual: toner.p, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
            }
          }
          if (!equip.status_online) {
            const exAlert = await _adminDb.collection('alertas').where('equipamentoId', '==', eid).where('tipo', '==', 'offline').where('resolvido', '==', 0).limit(1).get();
            if (exAlert.empty) {
              await _adminDb.collection('alertas').add({ equipamentoId: eid, tipo: 'offline', mensagem: `Equipamento ${equip.nome||equip.ip} está offline`, nivel: 'critical', resolvido: 0, createdAt: Timestamp.now() });
            }
          } else {
            const offlineAlerts = await _adminDb.collection('alertas').where('equipamentoId', '==', eid).where('tipo', '==', 'offline').where('resolvido', '==', 0).get();
            for (const alertDoc of offlineAlerts.docs) {
              await _adminDb.collection('alertas').doc(alertDoc.id).update({ resolvido: 1, resolvidoEm: Timestamp.now() });
            }
          }
          for (const toner of toners) {
            if (toner.p === 0) {
              const exAlert = await _adminDb.collection('alertas').where('equipamentoId', '==', eid).where('tipo', '==', 'toner_zerado').where('resolvido', '==', 0).limit(1).get();
              if (exAlert.empty) {
                await _adminDb.collection('alertas').add({ equipamentoId: eid, tipo: 'toner_zerado', mensagem: `Toner ${toner.t} zerado`, nivel: 'critical', resolvido: 0, createdAt: Timestamp.now() });
              }
            } else if (toner.p <= 15) {
              const exAlert = await _adminDb.collection('alertas').where('equipamentoId', '==', eid).where('tipo', '==', 'toner_baixo').where('resolvido', '==', 0).limit(1).get();
              if (exAlert.empty) {
                await _adminDb.collection('alertas').add({ equipamentoId: eid, tipo: 'toner_baixo', mensagem: `Toner ${toner.t} com ${toner.p}%`, nivel: 'warning', resolvido: 0, createdAt: Timestamp.now() });
              }
            } else {
              const lowAlerts = await _adminDb.collection('alertas').where('equipamentoId', '==', eid).where('tipo', 'in', ['toner_baixo', 'toner_zerado']).where('resolvido', '==', 0).get();
              for (const alertDoc of lowAlerts.docs) {
                if (alertDoc.data().mensagem?.includes(toner.t)) {
                  await _adminDb.collection('alertas').doc(alertDoc.id).update({ resolvido: 1, resolvidoEm: Timestamp.now() });
                }
              }
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
        await _adminDb.collection('agentLogs').add({
          agentId, level: log.level || 'info', message: log.message, details: log.details || null, createdAt: Timestamp.now()
        });
      }
      return _json({ success: true, message: `${body.logs.length} logs recebidos` });
    }
  }

  const adminAuth = await requireAdmin(req);
  if (adminAuth.error) return adminAuth.error;

  if (path === '/agents' && req.method === 'GET') {
    const snapshot = await _adminDb.collection('agents').orderBy('createdAt', 'desc').get();
    const agents = [];
    for (const doc of snapshot.docs) {
      const agent = { id: doc.id, ...doc.data() } as any;
      const equipSnapshot = await _adminDb.collection('equipamentos').where('agentId', '==', agent.id).count().get();
      agent.printers_count = equipSnapshot.data().count;
      const twentyFourHoursAgo = new Date(Date.now() - 24*60*60*1000);
      const logsSnapshot = await _adminDb.collection('agentLogs').where('agentId', '==', agent.id).where('level', '==', 'error').where('createdAt', '>', twentyFourHoursAgo).count().get();
      agent.errors_24h = logsSnapshot.data().count;
      agents.push(agent);
    }
    return _json({ success: true, data: agents });
  }

  if (path.match(/^\/agents\/[^\/]+$/) && req.method === 'GET') {
    const id = getSegment(path, 1)!;
    const doc = await _adminDb.collection('agents').doc(id).get();
    if (!doc.exists) return _error('Agent não encontrado', 404);
    const agent = { id: doc.id, ...doc.data() } as any;
    const equipSnapshot = await _adminDb.collection('equipamentos').where('agentId', '==', id).get();
    agent.equipamentos = equipSnapshot.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    const logsSnapshot = await _adminDb.collection('agentLogs').where('agentId', '==', id).orderBy('createdAt', 'desc').limit(50).get();
    agent.logs = logsSnapshot.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    return _json({ success: true, data: agent });
  }

  if (path.match(/^\/agents\/[^\/]+$/) && req.method === 'PUT') {
    const id = getSegment(path, 1)!;
    const body = await readBody(req);
    const doc = await _adminDb.collection('agents').doc(id).get();
    if (!doc.exists) return _error('Agent não encontrado', 404);
    const updateData: any = { updatedAt: Timestamp.now() };
    if (body.name !== undefined) updateData.name = body.name;
    if (body.company_id !== undefined) updateData.companyId = body.company_id;
    if (body.location !== undefined) updateData.location = body.location;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.config !== undefined) updateData.config = body.config;
    await _adminDb.collection('agents').doc(id).update(updateData);
    const updated = await _adminDb.collection('agents').doc(id).get();
    return _json({ success: true, data: { id: updated.id, ...updated.data() }, message: 'Agent atualizado' });
  }

  if (path.match(/^\/agents\/[^\/]+$/) && req.method === 'DELETE') {
    const id = getSegment(path, 1)!;
    const doc = await _adminDb.collection('agents').doc(id).get();
    if (!doc.exists) return _error('Agent não encontrado', 404);
    const equipSnapshot = await _adminDb.collection('equipamentos').where('agentId', '==', id).get();
    for (const equipDoc of equipSnapshot.docs) {
      await _adminDb.collection('equipamentos').doc(equipDoc.id).update({ agentId: null });
    }
    await _adminDb.collection('agents').doc(id).delete();
    return _json({ success: true, message: 'Agent excluído com sucesso' });
  }

  if (path.match(/^\/agents\/[^\/]+\/assign$/) && req.method === 'POST') {
    const id = getSegment(path, 1)!;
    const body = await readBody(req);
    if (!body.equipamento_id) return _error('equipamento_id é obrigatório', 400);
    const agentDoc = await _adminDb.collection('agents').doc(id).get();
    if (!agentDoc.exists) return _error('Agent não encontrado', 404);
    const equipDoc = await _adminDb.collection('equipamentos').doc(body.equipamento_id).get();
    if (!equipDoc.exists) return _error('Equipamento não encontrado', 404);
    await _adminDb.collection('equipamentos').doc(body.equipamento_id).update({ agentId: id });
    return _json({ success: true, message: 'Equipamento atribuído ao agent' });
  }

  if (path.match(/^\/agents\/[^\/]+\/unassign$/) && req.method === 'POST') {
    const id = getSegment(path, 1)!;
    const body = await readBody(req);
    if (!body.equipamento_id) return _error('equipamento_id é obrigatório', 400);
    const equipDoc = await _adminDb.collection('equipamentos').doc(body.equipamento_id).get();
    if (equipDoc.exists && equipDoc.data()?.agentId === id) {
      await _adminDb.collection('equipamentos').doc(body.equipamento_id).update({ agentId: null });
    }
    return _json({ success: true, message: 'Equipamento removido do agent' });
  }

  return _error('Rota de agents não encontrada', 404);
}

// ======================== AUDITORIA ========================
async function handleAuditoria(req: Request, path: string, params: Record<string, string>) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;

  if (path === '/auditoria/stats' && req.method === 'GET') {
    const { data_inicio, data_fim } = params;
    let query: FirebaseFirestore.Query = _adminDb.collection('auditoriaImpressoes');
    if (data_inicio) query = query.where('dataImpressao', '>=', data_inicio);
    if (data_fim) query = query.where('dataImpressao', '<=', data_fim);
    const snapshot = await query.get();
    const records = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

    const total_registros = records.length;
    const total_paginas = records.reduce((sum: number, r: any) => sum + (r.totalPaginas || 0), 0);

    const porUsuario = records.reduce((acc: any, r: any) => {
      if (r.usuario) { acc[r.usuario] = (acc[r.usuario] || 0) + 1; } return acc;
    }, {});
    const porEquipamento = records.reduce((acc: any, r: any) => {
      if (r.equipamentoId) { acc[r.equipamentoId] = (acc[r.equipamentoId] || 0) + 1; } return acc;
    }, {});
    const porCliente = records.reduce((acc: any, r: any) => {
      if (r.cliente) { acc[r.cliente] = (acc[r.cliente] || 0) + 1; } return acc;
    }, {});

    return _json({ success: true, data: {
      total_registros, total_paginas,
      por_usuario: Object.entries(porUsuario).map(([usuario, total_impressoes]) => ({ usuario, total_impressoes, total_paginas: records.filter((r: any) => r.usuario === usuario).reduce((s: number, r: any) => s + (r.totalPaginas || 0), 0) })),
      por_equipamento: Object.entries(porEquipamento).map(([equipamentoId, total_impressoes]) => ({ equipamentoId, total_impressoes })),
      por_cliente: Object.entries(porCliente).map(([cliente, total_impressoes]) => ({ cliente, total_impressoes })),
      por_mes: [], por_fonte: [], por_cor: [], por_status: []
    } });
  }

  if (path === '/auditoria/export/csv' && req.method === 'GET') {
    const { cliente, equipamento_id, usuario, data_inicio, data_fim } = params;
    let query: FirebaseFirestore.Query = _adminDb.collection('auditoriaImpressoes');
    if (data_inicio) query = query.where('dataImpressao', '>=', data_inicio);
    if (data_fim) query = query.where('dataImpressao', '<=', data_fim);
    const snapshot = await query.get();
    let records = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

    if (cliente) records = records.filter((r: any) => r.cliente === cliente);
    if (equipamento_id) records = records.filter((r: any) => r.equipamentoId === equipamento_id);
    if (usuario) records = records.filter((r: any) => r.usuario?.toLowerCase().includes(usuario.toLowerCase()));

    if (!records.length) return _error('Nenhum dado encontrado', 404);
    const headers = ['Usuário','Computador','Documento','Data','Hora','Equipamento','Cliente','Páginas','Colorida','Duplex','Papel','Status','Fonte'];
    const csvRows = ['\uFEFF'+headers.join(';'), ...records.map((r: any) => [r.usuario||'',r.computador||'',r.documento||'',r.dataImpressao||'',r.horaImpressao||'',r.modeloEquip||'',r.cliente||'',r.totalPaginas||0,r.colorida?'Sim':'Não',r.duplex?'Sim':'Não',r.tamanhoPapel||'A4',r.statusImpressao||'',r.fonte||''].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';'))];
    return new Response(Buffer.from(csvRows.join('\n'),'utf-8'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename=auditoria_impressoes.csv' } });
  }

  if (path === '/auditoria' && req.method === 'GET') {
    const { cliente, equipamento_id, usuario, documento, data_inicio, data_fim, fonte, page = '1', per_page = '50' } = params;
    let query: FirebaseFirestore.Query = _adminDb.collection('auditoriaImpressoes');
    if (cliente) query = query.where('cliente', '==', cliente);
    if (equipamento_id) query = query.where('equipamentoId', '==', equipamento_id);
    if (fonte) query = query.where('fonte', '==', fonte);
    query = query.orderBy('dataImpressao', 'desc');

    const snapshot = await query.get();
    let records = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

    if (usuario) records = records.filter((r: any) => r.usuario?.toLowerCase().includes(usuario.toLowerCase()));
    if (documento) records = records.filter((r: any) => r.documento?.toLowerCase().includes(documento.toLowerCase()));
    if (data_inicio) records = records.filter((r: any) => r.dataImpressao >= data_inicio);
    if (data_fim) records = records.filter((r: any) => r.dataImpressao <= data_fim);

    const total = records.length;
    const offset = (Number(page) - 1) * Number(per_page);
    const data = records.slice(offset, offset + Number(per_page));

    return _json({ success: true, data, total, page: Number(page), per_page: Number(per_page) });
  }

  if (path === '/auditoria' && req.method === 'POST') {
    const body = await readBody(req);
    const { equipamento_id, cliente, usuario, computador, documento, data_impressao, hora_impressao, total_paginas, colorida, duplex, tamanho_papel, status_impressao, fonte, dados_extras } = body;
    const docRef = await _adminDb.collection('auditoriaImpressoes').add({
      equipamentoId: equipamento_id || null, cliente: cliente || null, usuario: usuario || null, computador: computador || null,
      documento: documento || null, dataImpressao: data_impressao || new Date().toISOString().split('T')[0],
      horaImpressao: hora_impressao || new Date().toTimeString().slice(0,8), totalPaginas: total_paginas || 1,
      colorida: colorida ? 1 : 0, duplex: duplex ? 1 : 0, tamanhoPapel: tamanho_papel || 'A4',
      statusImpressao: status_impressao || 'concluida', fonte: fonte || 'manual',
      dadosExtras: dados_extras || {}, createdAt: Timestamp.now()
    });
    const doc = await docRef.get();
    return _json({ success: true, data: { id: doc.id, ...doc.data() } }, 201);
  }

  if (path === '/auditoria/batch' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body.records || !Array.isArray(body.records) || !body.records.length) return _error('Nenhum registro fornecido', 400);
    let inserted = 0;
    for (const rec of body.records) {
      try {
        await _adminDb.collection('auditoriaImpressoes').add({
          equipamentoId: rec.equipamento_id || null, cliente: rec.cliente || null, usuario: rec.usuario || null,
          computador: rec.computador || null, documento: rec.documento || null,
          dataImpressao: rec.data_impressao || new Date().toISOString().split('T')[0],
          horaImpressao: rec.hora_impressao || new Date().toTimeString().slice(0,8), totalPaginas: rec.total_paginas || 1,
          colorida: rec.colorida ? 1 : 0, duplex: rec.duplex ? 1 : 0, tamanhoPapel: rec.tamanho_papel || 'A4',
          statusImpressao: rec.status_impressao || 'concluida', fonte: rec.fonte || 'spooler',
          ipEquipamento: rec.ip_equipamento || null, numeroSerie: rec.numero_serie || null, modeloEquip: rec.modelo_equip || null,
          dadosExtras: rec.dados_extras || {}, createdAt: Timestamp.now()
        });
        inserted++;
      } catch (e) { console.error('Error inserting audit record:', e); }
    }
    return _json({ success: true, data: { inserted, total: body.records.length } });
  }

  if (path.match(/^\/auditoria\/[^\/]+$/) && req.method === 'DELETE') {
    const id = getSegment(path, 1)!;
    await _adminDb.collection('auditoriaImpressoes').doc(id).delete();
    return _json({ success: true, message: 'Registro excluído' });
  }

  if (path === '/auditoria/config' && req.method === 'GET') {
    const snapshot = await _adminDb.collection('auditoriaConfig').orderBy('createdAt', 'desc').get();
    return _json({ success: true, data: snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })) });
  }

  if (path === '/auditoria/config' && req.method === 'POST') {
    const body = await readBody(req);
    const docRef = await _adminDb.collection('auditoriaConfig').add({
      tipoIntegracao: body.tipo_integracao, equipamentoId: body.equipamento_id || null,
      config: body.config || {}, ativo: body.ativo !== undefined ? (body.ativo ? 1 : 0) : 1,
      createdAt: Timestamp.now(), updatedAt: Timestamp.now()
    });
    const doc = await docRef.get();
    return _json({ success: true, data: { id: doc.id, ...doc.data() } }, 201);
  }

  if (path.match(/^\/auditoria\/config\/[^\/]+$/) && req.method === 'DELETE') {
    const id = getSegment(path, 2)!;
    await _adminDb.collection('auditoriaConfig').doc(id).delete();
    return _json({ success: true, message: 'Configuração excluída' });
  }

  return _error('Rota de auditoria não encontrada', 404);
}