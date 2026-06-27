// Standard printer SNMP OIDs (MIB-II / Printer MIB)

export const PRINTER_OIDS = {
  // Counters
  totalCounter: '1.3.6.1.2.1.43.10.2.1.4.1.1',
  colorCounter: '1.3.6.1.2.1.43.10.2.1.4.1.2',

  // Toner levels (percentage)
  tonerBlack: '1.3.6.1.2.1.43.11.1.1.9.1.1',
  tonerCyan: '1.3.6.1.2.1.43.11.1.1.9.1.2',
  tonerMagenta: '1.3.6.1.2.1.43.11.1.1.9.1.3',
  tonerYellow: '1.3.6.1.2.1.43.11.1.1.9.1.4',

  // Device info
  printerName: '1.3.6.1.2.1.25.3.2.1.3.1',
  serialNumber: '1.3.6.1.2.1.43.5.1.1.17.1',
  model: '1.3.6.1.2.1.25.3.2.1.3.1',
  errorState: '1.3.6.1.2.1.25.3.5.1.1.1',

  // Supply details
  markerSuppliesMaxCapacity: '1.3.6.1.2.1.43.11.1.1.8.1',
  markerSuppliesLevel: '1.3.6.1.2.1.43.11.1.1.9.1',
  markerSuppliesDescription: '1.3.6.1.2.1.43.11.1.1.6.1',
  markerSuppliesType: '1.3.6.1.2.1.43.11.1.1.4.1',
  prtMarkerColorCode: '1.3.6.1.2.1.43.11.1.1.5.1',
};

export interface PrinterData {
  online: boolean;
  ip: string;
  nome: string;
  numero_serie: string;
  modelo: string;
  fabricante?: string;
  contadores: {
    total: number;
    pb: number;
    cor: number;
  };
  toner: {
    preto: number;
    ciano: number;
    magenta: number;
    amarelo: number;
  };
  suprimentos: Array<{
    tipo: string;
    percentual: number;
    descricao?: string;
  }>;
  mensagens_erro: string;
}

export default PRINTER_OIDS;
