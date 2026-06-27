export default async function handler(req: any, res: any) {
  const { default: express } = await import('express');
  const { default: cors } = await import('cors');
  
  const app = express();
  
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  
  const { default: authRouter, authMiddleware } = await import('../server/routes/auth.js');
  const { default: equipamentosRouter } = await import('../server/routes/equipamentos.js');
  const { default: leiturasRouter } = await import('../server/routes/leituras.js');
  const { default: suprimentosRouter } = await import('../server/routes/suprimentos.js');
  const { default: alertasRouter } = await import('../server/routes/alertas.js');
  const { default: relatoriosRouter } = await import('../server/routes/relatorios.js');
  const { default: agentsRouter } = await import('../server/routes/agents.js');
  const { default: auditoriaRouter } = await import('../server/routes/auditoria.js');
  const { initDatabase } = await import('../server/database.js');
  
  app.use('/api/auth', authRouter);
  app.use('/api/agents', agentsRouter);
  app.use('/api/equipamentos', authMiddleware, equipamentosRouter);
  app.use('/api/leituras', authMiddleware, leiturasRouter);
  app.use('/api/suprimentos', authMiddleware, suprimentosRouter);
  app.use('/api/alertas', authMiddleware, alertasRouter);
  app.use('/api/relatorios', authMiddleware, relatoriosRouter);
  app.use('/api/auditoria', authMiddleware, auditoriaRouter);
  app.get('/api/health', (_: any, r: any) => r.json({ status: 'ok' }));
  
  await initDatabase();
  
  return app(req, res);
}
