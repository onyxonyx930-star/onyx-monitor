import * as snmp from 'net-snmp';
import { PRINTER_OIDS } from './oids.js';

export interface DiscoveredPrinter {
  ip: string;
  nome: string;
  modelo: string;
  numero_serie: string;
  online: boolean;
}

function createSession(ip: string, community: string, timeout: number): snmp.Session {
  return snmp.createSession(ip, community, {
    timeout,
    retries: 0,
    version: snmp.Version2c,
  });
}

function parseOidValue(varbind: snmp.Varbind): number | string {
  if (varbind.type === snmp.ObjectType.OctetString) {
    return (varbind.value as Buffer).toString('utf-8').trim();
  }
  if (
    varbind.type === snmp.ObjectType.Integer ||
    varbind.type === snmp.ObjectType.Counter32 ||
    varbind.type === snmp.ObjectType.Gauge32
  ) {
    return varbind.value as number;
  }
  return 0;
}

export async function discoverPrinters(
  subnet: string,
  community: string,
  timeout: number,
  onProgress?: (current: number, total: number, ip: string) => void
): Promise<DiscoveredPrinter[]> {
  const printers: DiscoveredPrinter[] = [];
  const baseIp = subnet.replace(/\.\d+$/, '.');
  const totalHosts = 254;

  const checkHost = (ip: string): Promise<DiscoveredPrinter | null> => {
    return new Promise((resolve) => {
      const session = createSession(ip, community, timeout);
      const oids = [PRINTER_OIDS.printerName, PRINTER_OIDS.model, PRINTER_OIDS.serialNumber];

      session.get(oids, (error, varbinds) => {
        session.close();

        if (error || !varbinds) {
          resolve(null);
          return;
        }

        const name = parseOidValue(varbinds[0]);
        const model = parseOidValue(varbinds[1]);
        const serial = parseOidValue(varbinds[2]);

        // If we got a printer name, it's likely a printer
        if (name && String(name).length > 0) {
          resolve({
            ip,
            nome: String(name),
            modelo: String(model || 'Desconhecido'),
            numero_serie: String(serial || ''),
            online: true,
          });
        } else {
          resolve(null);
        }
      });
    });
  };

  // Process in batches of 20
  const batchSize = 20;
  for (let i = 1; i <= totalHosts; i += batchSize) {
    const batch: Promise<DiscoveredPrinter | null>[] = [];

    for (let j = i; j < Math.min(i + batchSize, totalHosts + 1); j++) {
      const ip = `${baseIp}${j}`;
      batch.push(checkHost(ip));
    }

    const results = await Promise.all(batch);

    for (const result of results) {
      if (result) {
        printers.push(result);
      }
    }

    if (onProgress) {
      onProgress(Math.min(i + batchSize - 1, totalHosts), totalHosts, '');
    }
  }

  return printers;
}

export async function checkPrinterOnline(
  ip: string,
  community: string,
  timeout: number
): Promise<boolean> {
  return new Promise((resolve) => {
    const session = createSession(ip, community, timeout);
    session.get([PRINTER_OIDS.printerName], (error) => {
      session.close();
      resolve(!error);
    });
  });
}

export default { discoverPrinters, checkPrinterOnline };
