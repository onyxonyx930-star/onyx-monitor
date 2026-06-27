import type { AgentConfig } from '../config.js';
import type { PrinterData } from '../snmp/oids.js';

interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  message?: string;
}

export class ApiClient {
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.serverUrl}/api${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.agentApiKey}`,
      ...(options.headers as Record<string, string>),
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let data: any;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      throw new Error(`API Error ${response.status}: ${data?.message || response.statusText}`);
    }

    const json: ApiResponse<T> = await response.json();
    return json.data;
  }

  async register(): Promise<{ id: number; api_key: string }> {
    const result = await this.request<{
      id: number;
      name: string;
      company_id: string;
      api_key: string;
      status: string;
    }>('/agents/register', {
      method: 'POST',
      body: JSON.stringify({
        name: this.config.agentName,
        company_id: this.config.companyId,
        location: this.config.location,
        version: this.config.version,
      }),
    });
    return { id: result.id, api_key: result.api_key };
  }

  async heartbeat(printersCount: number): Promise<void> {
    if (!this.config.agentId) {
      throw new Error('Agent ID not configured');
    }
    await this.request(`/agents/${this.config.agentId}/heartbeat`, {
      method: 'POST',
      body: JSON.stringify({
        version: this.config.version,
        printers_count: printersCount,
      }),
    });
  }

  async getConfig(): Promise<Array<{
    id: number;
    cliente: string;
    ip: string;
    comunidade_snmp: string;
    fabricante: string;
    modelo: string;
    numero_serie: string;
    localizacao: string;
  }>> {
    if (!this.config.agentId) {
      throw new Error('Agent ID not configured');
    }
    return this.request(`/agents/${this.config.agentId}/config`);
  }

  async sendCollectData(equipamentos: PrinterData[]): Promise<{ processed: number; errors: number }> {
    if (!this.config.agentId) {
      throw new Error('Agent ID not configured');
    }
    return this.request(`/agents/${this.config.agentId}/collect`, {
      method: 'POST',
      body: JSON.stringify({ equipamentos }),
    });
  }

  async sendLogs(logs: Array<{ level: string; message: string; details?: any }>): Promise<void> {
    if (!this.config.agentId) {
      throw new Error('Agent ID not configured');
    }
    await this.request(`/agents/${this.config.agentId}/logs`, {
      method: 'POST',
      body: JSON.stringify({ logs }),
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.serverUrl}/api/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

export default ApiClient;
