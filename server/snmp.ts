import * as snmp from 'net-snmp';

const OIDS = {
  totalCounter: '1.3.6.1.2.1.43.10.2.1.4.1.1',
  colorCounter: '1.3.6.1.2.1.43.10.2.1.4.1.2',
  tonerBlack: '1.3.6.1.2.1.43.11.1.1.9.1.1',
  tonerCyan: '1.3.6.1.2.1.43.11.1.1.9.1.2',
  tonerMagenta: '1.3.6.1.2.1.43.11.1.1.9.1.3',
  tonerYellow: '1.3.6.1.2.1.43.11.1.1.9.1.4',
  printerName: '1.3.6.1.2.1.25.3.2.1.3.1',
  serialNumber: '1.3.6.1.2.1.43.5.1.1.17.1',
  model: '1.3.6.1.2.1.25.3.2.1.3.1',
  errorState: '1.3.6.1.2.1.25.3.5.1.1.1',
  markerSuppliesMaxCapacity: '1.3.6.1.2.1.43.11.1.1.8.1',
  markerSuppliesLevel: '1.3.6.1.2.1.43.11.1.1.9.1',
  markerSuppliesDescription: '1.3.6.1.2.1.43.11.1.1.6.1',
  markerSuppliesType: '1.3.6.1.2.1.43.11.1.1.4.1',
  prtMarkerColorCode: '1.3.6.1.2.1.43.11.1.1.5.1',
};

export interface PrinterData {
  online: boolean;
  contador_total: number;
  contador_pb: number;
  contador_cor: number;
  toner_preto: number;
  toner_ciano: number;
  toner_magenta: number;
  toner_amarelo: number;
  nome_equip: string;
  numero_serie: string;
  modelo_equip: string;
  mensagens_erro: string;
}

function createSession(ip: string, community: string): snmp.Session {
  return snmp.createSession(ip, community, {
    timeout: 5000,
    retries: 1,
    version: snmp.Version2c,
  });
}

function parseOidValue(varbind: snmp.Varbind): number | string {
  if (varbind.type === snmp.ObjectType.OctetString) {
    return (varbind.value as Buffer).toString('utf-8').trim();
  }
  if (varbind.type === snmp.ObjectType.Integer || varbind.type === snmp.ObjectType.Counter32 || varbind.type === snmp.ObjectType.Gauge32) {
    return varbind.value as number;
  }
  if (varbind.type === snmp.ObjectType.NoSuchObject || varbind.type === snmp.ObjectType.NoSuchInstance || varbind.type === snmp.ObjectType.EndOfMibView) {
    return 0;
  }
  return varbind.value as number;
}

export async function checkOnline(ip: string, community: string): Promise<boolean> {
  return new Promise((resolve) => {
    const session = createSession(ip, community);
    session.get([OIDS.printerName], (error, varbinds) => {
      session.close();
      if (error) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

export async function getPrinterData(ip: string, community: string): Promise<PrinterData> {
  return new Promise((resolve, reject) => {
    const session = createSession(ip, community);
    const oids = Object.values(OIDS);

    session.get(oids, (error, varbinds) => {
      session.close();

      if (error) {
        reject(new Error(`SNMP error for ${ip}: ${error.message}`));
        return;
      }

      const results: Record<string, any> = {};
      Object.keys(OIDS).forEach((key, index) => {
        results[key] = varbinds ? parseOidValue(varbinds[index]) : 0;
      });

      const printerData: PrinterData = {
        online: true,
        contador_total: Number(results.totalCounter) || 0,
        contador_pb: Number(results.totalCounter) || 0,
        contador_cor: Number(results.colorCounter) || 0,
        toner_preto: calculateTonerPercent(results.tonerBlack, results.markerSuppliesMaxCapacity, 0),
        toner_ciano: calculateTonerPercent(results.tonerCyan, results.markerSuppliesMaxCapacity, 1),
        toner_magenta: calculateTonerPercent(results.tonerMagenta, results.markerSuppliesMaxCapacity, 2),
        toner_amarelo: calculateTonerPercent(results.tonerYellow, results.markerSuppliesMaxCapacity, 3),
        nome_equip: String(results.printerName || ''),
        numero_serie: String(results.serialNumber || ''),
        modelo_equip: String(results.model || ''),
        mensagens_erro: String(results.errorState || ''),
      };

      resolve(printerData);
    });
  });
}

function calculateTonerPercent(level: any, maxCapacity: any, index: number): number {
  const max = Array.isArray(maxCapacity) ? (maxCapacity[index] as number) : (Number(maxCapacity) || 100);
  const current = Number(level) || 0;
  if (max === 0) return 0;
  return Math.round((current / max) * 100);
}

export async function getSuppliesData(ip: string, community: string): Promise<Array<{tipo: string, percentual: number}>> {
  return new Promise((resolve, reject) => {
    const session = createSession(ip, community);
    const oids = [OIDS.markerSuppliesType, OIDS.markerSuppliesLevel, OIDS.markerSuppliesMaxCapacity, OIDS.markerSuppliesDescription];

    session.get(oids, (error, varbinds) => {
      session.close();

      if (error) {
        reject(new Error(`SNMP supplies error for ${ip}: ${error.message}`));
        return;
      }

      const supplies: Array<{tipo: string, percentual: number}> = [];
      const types = varbinds ? parseOidValue(varbinds[0]) : 0;
      const levels = varbinds ? parseOidValue(varbinds[1]) : 0;
      const maxCaps = varbinds ? parseOidValue(varbinds[2]) : 0;

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

      for (let i = 0; i < typesArr.length; i++) {
        const tipoNum = Number(typesArr[i]);
        const tipo = typeMap[tipoNum] || `outro_${tipoNum}`;
        const level = Number(levelsArr[i]) || 0;
        const max = Number(maxArr[i]) || 100;
        const percentual = max > 0 ? Math.round((level / max) * 100) : 0;

        supplies.push({ tipo, percentual });
      }

      resolve(supplies);
    });
  });
}

export default {
  checkOnline,
  getPrinterData,
  getSuppliesData,
  OIDS,
};
