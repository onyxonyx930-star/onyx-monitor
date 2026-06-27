import express from 'express';
import cors from 'cors';
import { initDatabase } from '../server/database';
import equipamentosRouter from '../server/routes/equipamentos';
import leiturasRouter from '../server/routes/leituras';
import suprimentosRouter from '../server/routes/suprimentos';
import alertasRouter from '../server/routes/alertas';
import relatoriosRouter from '../server/routes/relatorios';
import authRouter from '../server/routes/auth';
import agentsRouter from '../server/routes/agents';
import auditoriaRouter from '../server/routes/auditoria';
import { authMiddleware } from '../server/routes/auth';

const app = express();
let dbInitialized = false;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/equipamentos', authMiddleware, equipamentosRouter);
app.use('/api/leituras', authMiddleware, leiturasRouter);
app.use('/api/suprimentos', authMiddleware, suprimentosRouter);
app.use('/api/alertas', authMiddleware, alertasRouter);
app.use('/api/relatorios', authMiddleware, relatoriosRouter);
app.use('/api/auditoria', authMiddleware, auditoriaRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Erro interno do servidor' });
});

async function ensureDb() {
  if (!dbInitialized) {
    await initDatabase();
    dbInitialized = true;
  }
}

const handler = async (req: any, res: any) => {
  await ensureDb();
  return app(req, res);
};

export default handler;
