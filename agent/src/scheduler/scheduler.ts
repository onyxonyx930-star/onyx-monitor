import cron from 'node-cron';
import type { AgentConfig } from '../config.js';
import { collectPrinterData } from '../snmp/collector.js';
import { ApiClient } from '../api/client.js';
import { Logger } from '../ui/logger.js';

interface ScheduledJob {
  id: string;
  task: cron.ScheduledTask;
  interval: string;
  lastRun?: Date;
  nextRun?: Date;
}

function getCronExpression(interval: string): string {
  switch (interval) {
    case '5m':
      return '*/5 * * * *';
    case '15m':
      return '*/15 * * * *';
    case '30m':
      return '*/30 * * * *';
    case '1h':
      return '0 * * * *';
    default:
      return '*/15 * * * *';
  }
}

export class Scheduler {
  private config: AgentConfig;
  private apiClient: ApiClient;
  private logger: Logger;
  private jobs: Map<string, ScheduledJob> = new Map();
  private isRunning = false;
  private printers: Array<{ ip: string; comunidade_snmp: string }> = [];

  constructor(config: AgentConfig, apiClient: ApiClient, logger: Logger) {
    this.config = config;
    this.apiClient = apiClient;
    this.logger = logger;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.logger.info('Iniciando scheduler...');

    // Load printers from server
    await this.refreshPrinters();

    // Start collection job
    const cronExpression = getCronExpression(this.config.collectInterval);
    const task = cron.schedule(cronExpression, async () => {
      await this.runCollection();
    });

    this.jobs.set('main', {
      id: 'main',
      task,
      interval: this.config.collectInterval,
    });

    this.isRunning = true;
    this.logger.info(`Scheduler iniciado com intervalo de ${this.config.collectInterval}`);

    // Run initial collection
    await this.runCollection();
  }

  stop(): void {
    this.jobs.forEach((job) => {
      job.task.stop();
    });
    this.jobs.clear();
    this.isRunning = false;
    this.logger.info('Scheduler parado');
  }

  async refreshPrinters(): Promise<void> {
    try {
      const config = await this.apiClient.getConfig();
      this.printers = config.map((p) => ({
        ip: p.ip,
        comunidade_snmp: p.comunidade_snmp || 'public',
      }));
      this.logger.info(`${this.printers.length} impressoras carregadas do servidor`);
    } catch (error) {
      this.logger.error('Erro ao carregar impressoras do servidor');
    }
  }

  async runCollection(): Promise<{ processed: number; errors: number }> {
    if (this.printers.length === 0) {
      this.logger.warn('Nenhuma impressora configurada para coleta');
      return { processed: 0, errors: 0 };
    }

    this.logger.info(`Iniciando coleta de ${this.printers.length} impressoras...`);
    const startTime = Date.now();
    let processed = 0;
    let errors = 0;

    const collectedData = [];

    for (const printer of this.printers) {
      try {
        const data = await collectPrinterData(
          printer.ip,
          printer.comunidade_snmp,
          this.config.snmpTimeout
        );
        collectedData.push(data);
        processed++;
        this.logger.debug(`Coletado: ${printer.ip} - ${data.nome}`);
      } catch (error) {
        errors++;
        this.logger.warn(`Erro ao coletar ${printer.ip}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Send data to server
    if (collectedData.length > 0) {
      try {
        await this.apiClient.sendCollectData(collectedData);
        this.logger.info(`Dados enviados: ${processed} impressoras processadas`);
      } catch (error) {
        this.logger.error(`Erro ao enviar dados: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const duration = Date.now() - startTime;
    this.logger.info(`Coleta concluída em ${duration}ms (${processed} OK, ${errors} erros)`);

    return { processed, errors };
  }

  get status() {
    return {
      isRunning: this.isRunning,
      interval: this.config.collectInterval,
      printersCount: this.printers.length,
      jobs: Array.from(this.jobs.values()).map((job) => ({
        id: job.id,
        interval: job.interval,
        lastRun: job.lastRun,
      })),
    };
  }
}

export default Scheduler;
