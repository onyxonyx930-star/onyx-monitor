import { getAdminDb, Timestamp } from '../firebase-admin';

let _adminDb: any;

async function loadDeps() {
  if (!_adminDb) {
    _adminDb = getAdminDb();
  }
}

export default async function handler(nodeReq: any, nodeRes: any) {
  try {
    await loadDeps();

    const configsSnapshot = await _adminDb.collection('configColeta').where('ativo', '==', 1).get();
    let collected = 0, errors = 0;

    for (const configDoc of configsSnapshot.docs) {
      try {
        const config = configDoc.data();
        const equipDoc = await _adminDb.collection('equipamentos').doc(config.equipamentoId).get();
        if (!equipDoc.exists || equipDoc.data()?.statusMonitoramento !== 'ativo') { errors++; continue; }
        const equip = { id: equipDoc.id, ...equipDoc.data() } as any;

        const snmp = await import('net-snmp');
        const printerData = await new Promise<any>((resolve, reject) => {
          const session = snmp.createSession(equip.ip, equip.comunidadeSnmp || 'public', { timeout: 5000, retries: 1, version: snmp.Version2c });
          session.get(['1.3.6.1.2.1.43.10.2.1.4.1.1','1.3.6.1.2.1.43.10.2.1.4.1.2','1.3.6.1.2.1.43.11.1.1.9.1.1','1.3.6.1.2.1.43.11.1.1.9.1.2','1.3.6.1.2.1.43.11.1.1.9.1.3','1.3.6.1.2.1.43.11.1.1.9.1.4','1.3.6.1.2.1.25.3.2.1.3.1','1.3.6.1.2.1.43.5.1.1.17.1','1.3.6.1.2.1.25.3.5.1.1.1'], (error: any, varbinds: any) => {
            session.close();
            if (error) return reject(error);
            const r: Record<string, any> = {};
            ['totalCounter','colorCounter','tonerBlack','tonerCyan','tonerMagenta','tonerYellow','printerName','serialNumber','errorState'].forEach((k, i) => { r[k] = varbinds?.[i]?.value ?? 0; });
            resolve({ online: true, contador_total: Number(r.totalCounter)||0, contador_pb: Number(r.totalCounter)||0, contador_cor: Number(r.colorCounter)||0, toner_preto: 50, toner_ciano: 50, toner_magenta: 50, toner_amarelo: 50, nome_equip: String(r.printerName||''), numero_serie: String(r.serialNumber||''), modelo_equip: String(r.printerName||''), mensagens_erro: String(r.errorState||'') });
          });
        });

        await _adminDb.collection('leituras').add({
          equipamentoId: config.equipamentoId, dataLeitura: new Date().toISOString().split('T')[0],
          contadorTotal: printerData.contador_total, contadorPb: printerData.contador_pb, contadorCor: printerData.contador_cor,
          tonerPreto: printerData.toner_preto, tonerCiano: printerData.toner_ciano, tonerMagenta: printerData.toner_magenta, tonerAmarelo: printerData.toner_amarelo,
          statusOnline: 1, mensagensErro: printerData.mensagens_erro, numeroSerieEquip: printerData.numero_serie,
          modeloEquip: printerData.modelo_equip, nomeEquip: printerData.nome_equip, createdAt: Timestamp.now()
        });

        await _adminDb.collection('configColeta').doc(configDoc.id).update({ ultimaColeta: new Date().toISOString(), updatedAt: Timestamp.now() });
        collected++;
      } catch { errors++; }
    }

    nodeRes.writeHead(200, { 'Content-Type': 'application/json' });
    nodeRes.end(JSON.stringify({ success: true, collected, errors, timestamp: new Date().toISOString() }));
  } catch (error: any) {
    nodeRes.writeHead(500, { 'Content-Type': 'application/json' });
    nodeRes.end(JSON.stringify({ success: false, error: error?.message }));
  }
}