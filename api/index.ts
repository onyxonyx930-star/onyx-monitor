import express from 'express';
import cors from 'cors';

const app = express();
let handler: any;
let loadError: any;

try {
  const authMod = await import('../server/routes/auth.js');
  const equipamentosMod = await import('../server/routes/equipamentos.js');
  const leiturasMod = await import('../server/routes/leituras.js');
  const suprimentosMod = await import('../server/routes/suprimentos.js');
  const alertasMod = await import('../server/routes/alertas.js');
  const relatoriosMod = await import('../server/routes/relatorios.js');
  const agentsMod = await import('../server/routes/agents.js');
  const auditoriaMod = await import('../server/routes/auditoria.js');
  const dbMod = await import('../server/database.js');

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use('/api/auth', authMod.default);
  app.use('/api/agents', agentsMod.default);
  app.use('/api/equipamentos', authMod.authMiddleware, equipamentosMod.default);
  app.use('/api/leituras', authMod.authMiddleware, leiturasMod.default);
  app.use('/api/suprimentos', authMod.authMiddleware, suprimentosMod.default);
  app.use('/api/alertas', authMod.authMiddleware, alertasMod.default);
  app.use('/api/relatorios', authMod.authMiddleware, relatoriosMod.default);
  app.use('/api/auditoria', authMod.authMiddleware, auditoriaMod.default);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  let dbInitialized = false;

  handler = async (req: any, res: any) => {
    if (!dbInitialized) {
      await dbMod.initDatabase();
      dbInitialized = true;
    }
    return app(req, res);
  };
} catch (e: any) {
  loadError = e?.message || String(e);
  console.error('Module load error:', loadError);
  handler = async (req: any, res: any) => {
    res.status(500).json({ error: 'Module load failed', message: loadError });
  };
}

export default handler;
