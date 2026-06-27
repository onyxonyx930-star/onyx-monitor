import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

const CONFIG_DIR = resolve(process.env.HOME || process.env.USERPROFILE || '', '.onyx-agent');
const CONFIG_FILE = resolve(CONFIG_DIR, 'config.json');
const LOG_DIR = resolve(CONFIG_DIR, 'logs');

export interface AgentConfig {
  serverUrl: string;
  agentApiKey: string;
  agentName: string;
  companyId: string;
  location: string;
  collectInterval: string;
  uiPort: number;
  snmpCommunity: string;
  snmpTimeout: number;
  logLevel: string;
  agentId?: number;
  lastHeartbeat?: string;
  version: string;
}

const defaultConfig: AgentConfig = {
  serverUrl: 'https://onyx-monitor-api.onrender.com',
  agentApiKey: '',
  agentName: 'Onyx Agent',
  companyId: 'default',
  location: '',
  collectInterval: '15m',
  uiPort: 8080,
  snmpCommunity: 'public',
  snmpTimeout: 5000,
  logLevel: 'info',
  version: '1.0.0',
};

export function loadConfig(): AgentConfig {
  loadEnv();

  // Try to load from file first
  if (existsSync(CONFIG_FILE)) {
    try {
      const fileConfig = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      return { ...defaultConfig, ...fileConfig };
    } catch {
      // Ignore parse errors, use defaults
    }
  }

  // Fall back to environment variables
  return {
    ...defaultConfig,
    serverUrl: process.env.SERVER_URL || defaultConfig.serverUrl,
    agentApiKey: process.env.AGENT_API_KEY || defaultConfig.agentApiKey,
    agentName: process.env.AGENT_NAME || defaultConfig.agentName,
    companyId: process.env.COMPANY_ID || defaultConfig.companyId,
    location: process.env.LOCATION || defaultConfig.location,
    collectInterval: process.env.COLLECT_INTERVAL || defaultConfig.collectInterval,
    uiPort: parseInt(process.env.UI_PORT || '8080', 10),
    snmpCommunity: process.env.SNMP_COMMUNITY || defaultConfig.snmpCommunity,
    snmpTimeout: parseInt(process.env.SNMP_TIMEOUT || '5000', 10),
    logLevel: process.env.LOG_LEVEL || defaultConfig.logLevel,
  };
}

export function saveConfig(config: AgentConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function getLogDir(): string {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
  return LOG_DIR;
}

export function getDBPath(): string {
  return resolve(CONFIG_DIR, 'agent.db');
}

export default { loadConfig, saveConfig, getLogDir, getDBPath };
