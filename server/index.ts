import express from 'express';
import cors from 'cors';
import { initDatabase } from './database';
import { startScheduler } from './scheduler';
import equipamentosRouter from './routes/equipamentos';
import leiturasRouter from './routes/leituras';
import suprimentosRouter from './routes/suprimentos';
import alertasRouter from './routes/alertas';
import relatoriosRouter from './routes/relatorios';
import authRouter from './routes/auth';
import agentsRouter from './routes/agents';
import auditoriaRouter from './routes/auditoria';
import { authMiddleware } from './routes/auth';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: true,
  credentials: true,
}));
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

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Erro interno do servidor',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

async function main() {
  try {
    console.log('Initializing database...');
    await initDatabase();

    console.log('Starting scheduler...');
    startScheduler();

    app.listen(PORT, () => {
      console.log(`Onyx Monitor server running on port ${PORT}`);
      console.log(`API available at http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();

export default app;
