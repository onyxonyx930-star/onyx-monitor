import * as snmp from 'net-snmp';
import { PRINTER_OIDS, PrinterData } from './oids.js';

function createSession(ip: string, community: string, timeout: number): snmp.Session {
  return snmp.createSession(ip, community, {
    timeout,
    retries: 1,
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
  if (
    varbind.type === snmp.ObjectType.NoSuchObject ||
    varbind.type === snmp.ObjectType.NoSuchInstance ||
    varbind.type === snmp.ObjectType.EndOfMibView
  ) {
    return 0;
  }
  return varbind.value as number;
}

export async function checkOnline(ip: string, community: string, timeout: number): Promise<boolean> {
  return new Promise((resolve) => {
    const session = createSession(ip, community, timeout);
    session.get([PRINTER_OIDS.printerName], (error) => {
      session.close();
      resolve(!error);
    });
  });
}

export async function collectPrinterData(
  ip: string,
  community: string,
  timeout: number
): Promise<PrinterData> {
  return new Promise((resolve, reject) => {
    const session = createSession(ip, community, timeout);
    const oids = Object.values(PRINTER_OIDS);

    session.get(oids, (error, varbinds) => {
      session.close();

      if (error) {
        reject(new Error(`SNMP error for ${ip}: ${error.message}`));
        return;
      }

      const results: Record<string, any> = {};
      Object.keys(PRINTER_OIDS).forEach((key, index) => {
        results[key] = varbinds ? parseOidValue(varbinds[index]) : 0;
      });

      const maxCapacity = results.markerSuppliesMaxCapacity;
      const maxArr = Array.isArray(maxCapacity) ? maxCapacity : [maxCapacity];

      const printerData: PrinterData = {
        online: true,
        ip,
        nome: String(results.printerName || ''),
        numero_serie: String(results.serialNumber || ''),
        modelo: String(results.model || ''),
        contadores: {
          total: Number(results.totalCounter) || 0,
          pb: Number(results.totalCounter) || 0,
          cor: Number(results.colorCounter) || 0,
        },
        toner: {
          preto: calculateTonerPercent(results.tonerBlack, maxArr, 0),
          ciano: calculateTonerPercent(results.tonerCyan, maxArr, 1),
          magenta: calculateTonerPercent(results.tonerMagenta, maxArr, 2),
          amarelo: calculateTonerPercent(results.tonerYellow, maxArr, 3),
        },
        suprimentos: [],
        mensagens_erro: String(results.errorState || ''),
      };

      resolve(printerData);
    });
  });
}

function calculateTonerPercent(level: any, maxCapacity: any[], index: number): number {
  const max = Array.isArray(maxCapacity)
    ? (maxCapacity[index] as number)
    : Number(maxCapacity) || 100;
  const current = Number(level) || 0;
  if (max === 0) return 0;
  return Math.round((current / max) * 100);
}

export async function collectSuppliesData(
  ip: string,
  community: string,
  timeout: number
): Promise<Array<{ tipo: string; percentual: number; descricao: string }>> {
  return new Promise((resolve, reject) => {
    const session = createSession(ip, community, timeout);
    const oids = [
      PRINTER_OIDS.markerSuppliesType,
      PRINTER_OIDS.markerSuppliesLevel,
      PRINTER_OIDS.markerSuppliesMaxCapacity,
      PRINTER_OIDS.markerSuppliesDescription,
    ];

    session.get(oids, (error, varbinds) => {
      session.close();

      if (error) {
        reject(new Error(`SNMP supplies error for ${ip}: ${error.message}`));
        return;
      }

      const supplies: Array<{ tipo: string; percentual: number; descricao: string }> = [];
      const types = varbinds ? parseOidValue(varbinds[0]) : 0;
      const levels = varbinds ? parseOidValue(varbinds[1]) : 0;
      const maxCaps = varbinds ? parseOidValue(varbinds[2]) : 0;
      const descriptions = varbinds ? parseOidValue(varbinds[3]) : '';

      const typeMap: Record<number, string> = {
        3: 'preto',
        4: 'ciano',
        5: 'magenta',
        6: 'amarelo',
        8: 'waste',
        10: 'drum',
        15: 'fusor',
      };

      const typesArr = Array.isArray(types) ? types : [types];
      const levelsArr = Array.isArray(levels) ? levels : [levels];
      const maxArr = Array.isArray(maxCaps) ? maxCaps : [maxCaps];
      const descArr = Array.isArray(descriptions) ? descriptions : [descriptions];

      for (let i = 0; i < typesArr.length; i++) {
        const tipoNum = Number(typesArr[i]);
        const tipo = typeMap[tipoNum] || `outro_${tipoNum}`;
        const level = Number(levelsArr[i]) || 0;
        const max = Number(maxArr[i]) || 100;
        const percentual = max > 0 ? Math.round((level / max) * 100) : 0;
        const descricao = String(descArr[i] || '');

        supplies.push({ tipo, percentual, descricao });
      }

      resolve(supplies);
    });
  });
}

export default { checkOnline, collectPrinterData, collectSuppliesData };
