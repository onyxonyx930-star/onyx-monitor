#!/usr/bin/env node

import { Command } from 'commander';
import { loadConfig, saveConfig } from './config.js';
import { ApiClient } from './api/client.js';
import { Scheduler } from './scheduler/scheduler.js';
import { Logger } from './ui/logger.js';
import { UIServer } from './ui/server.js';

const program = new Command();
const config = loadConfig();
const logger = new Logger(config.logLevel);
const apiClient = new ApiClient(config);

program
  .name('onyx-agent')
  .description('Onyx Monitor - Agente de Coleta SNMP')
  .version(config.version);

program
  .command('start')
  .description('Inicia o agente')
  .option('-p, --port <port>', 'Porta da interface web', String(config.uiPort))
  .action(async (options) => {
    const port = parseInt(options.port, 10);
    if (!isNaN(port)) {
      config.uiPort = port;
    }

    logger.info('========================================');
    logger.info('  Onyx Monitor Agent v' + config.version);
    logger.info('========================================');
    logger.info(`Servidor: ${config.serverUrl}`);
    logger.info(`Intervalo de coleta: ${config.collectInterval}`);
    logger.info(`Interface web: http://localhost:${config.uiPort}`);

    if (!config.agentApiKey) {
      logger.error('Chave de API não configurada. Execute: onyx-agent register');
      process.exit(1);
    }

    // Initialize scheduler
    const scheduler = new Scheduler(config, apiClient, logger);

    // Initialize UI server
    const uiServer = new UIServer(config, scheduler, logger);

    // Start everything
    try {
      await uiServer.start();
      await scheduler.start();

      // Send heartbeat periodically
      setInterval(async () => {
        try {
          await apiClient.heartbeat(0);
          logger.debug('Heartbeat enviado');
        } catch (error) {
          logger.warn('Falha ao enviar heartbeat');
        }
      }, 5 * 60 * 1000); // Every 5 minutes

      logger.info('Agente iniciado com sucesso!');
    } catch (error) {
      logger.error(`Erro ao iniciar agente: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      logger.info('Encerrando agente...');
      scheduler.stop();
      uiServer.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      logger.info('Encerrando agente...');
      scheduler.stop();
      uiServer.stop();
      process.exit(0);
    });
  });

program
  .command('register')
  .description('Registra o agente no servidor')
  .action(async () => {
    logger.info('Registrando agente no servidor...');

    try {
      const result = await apiClient.register();
      config.agentId = result.id;
      saveConfig(config);

      logger.info(`Agente registrado com ID: ${result.id}`);
      logger.info(`Chave de API: ${result.api_key}`);
      logger.info('Salvando configuração...');
    } catch (error) {
      logger.error(`Erro ao registrar: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Exibe a configuração atual')
  .action(() => {
    logger.info('Configuração atual:');
    console.log(JSON.stringify(config, null, 2));
  });

program
  .command('set <key> <value>')
  .description('Define uma configuração')
  .action((key: string, value: string) => {
    const validKeys = [
      'serverUrl',
      'agentApiKey',
      'agentName',
      'companyId',
      'location',
      'collectInterval',
      'uiPort',
      'snmpCommunity',
      'snmpTimeout',
      'logLevel',
    ];

    if (!validKeys.includes(key)) {
      logger.error(`Chave inválida: ${key}`);
      logger.info(`Chaves válidas: ${validKeys.join(', ')}`);
      process.exit(1);
    }

    (config as any)[key] = value;
    saveConfig(config);
    logger.info(`Configuração ${key} atualizada para: ${value}`);
  });

program
  .command('collect')
  .description('Executa uma coleta manual')
  .action(async () => {
    if (!config.agentApiKey) {
      logger.error('Agente não registrado. Execute: onyx-agent register');
      process.exit(1);
    }

    const scheduler = new Scheduler(config, apiClient, logger);
    await scheduler.refreshPrinters();
    const result = await scheduler.runCollection();

    logger.info(`Coleta concluída: ${result.processed} OK, ${result.errors} erros`);
  });

program.parse(process.argv);
