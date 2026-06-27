import express from 'express';
import { resolve } from 'path';
import type { AgentConfig } from '../config.js';
import type { Scheduler } from '../scheduler/scheduler.js';
import type { Logger } from './logger.js';
import { discoverPrinters } from '../snmp/discovery.js';

export class UIServer {
  private app: express.Application;
  private config: AgentConfig;
  private scheduler: Scheduler;
  private logger: Logger;
  private server: any;

  constructor(config: AgentConfig, scheduler: Scheduler, logger: Logger) {
    this.config = config;
    this.scheduler = scheduler;
    this.logger = logger;
    this.app = express();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.app.use(express.json());

    // Serve static files
    this.app.use(express.static(resolve(__dirname, '../public')));

    // API Routes
    this.app.get('/api/status', (req, res) => {
      res.json({
        name: this.config.agentName,
        version: this.config.version,
        serverUrl: this.config.serverUrl,
        status: this.config.agentApiKey ? 'configured' : 'not_configured',
        scheduler: this.scheduler.status,
        uptime: process.uptime(),
      });
    });

    this.app.get('/api/logs', (req, res) => {
      const limit = parseInt(req.query.limit as string) || 100;
      res.json(this.logger.getLogs(limit));
    });

    this.app.post('/api/collect', async (req, res) => {
      try {
        const result = await this.scheduler.runCollection();
        res.json({ success: true, data: result });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: error instanceof Error ? error.message : 'Erro na coleta',
        });
      }
    });

    this.app.post('/api/discover', async (req, res) => {
      try {
        const { subnet } = req.body;
        if (!subnet) {
          return res.status(400).json({ success: false, message: 'Subnet é obrigatória' });
        }

        this.logger.info(`Iniciando descoberta na sub-rede ${subnet}...`);

        const printers = await discoverPrinters(
          subnet,
          this.config.snmpCommunity,
          this.config.snmpTimeout,
          (current, total) => {
            this.logger.debug(`Verificando ${current}/${total}...`);
          }
        );

        this.logger.info(`Descoberta concluída: ${printers.length} impressoras encontradas`);
        res.json({ success: true, data: printers });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: error instanceof Error ? error.message : 'Erro na descoberta',
        });
      }
    });

    this.app.post('/api/refresh', async (req, res) => {
      try {
        await this.scheduler.refreshPrinters();
        res.json({ success: true, message: 'Lista de impressoras atualizada' });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: error instanceof Error ? error.message : 'Erro ao atualizar',
        });
      }
    });

    // Serve index.html for all other routes
    this.app.get('*', (req, res) => {
      res.sendFile(resolve(__dirname, '../public/index.html'));
    });
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.config.uiPort, () => {
        this.logger.info(`Interface web disponível em http://localhost:${this.config.uiPort}`);
        resolve();
      });
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
    }
  }
}

export default UIServer;
