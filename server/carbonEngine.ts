import { query, queryOne, execute } from './db.js';

// Hardcoded Soil Temp by District
const SOIL_TEMP: Record<string, number> = {
  'Amaravati': 26.4,
  'Akola': 27.1,
  'Yavatmal': 26.8,
  'Nagpur': 26.9,
  'Wardha': 26.5,
};

export async function runCarbonEngine(batchIdLabel: string): Promise<boolean> {
  // get batch
  const batch = await queryOne('SELECT * FROM batches WHERE batch_id_label = ?', [batchIdLabel]);
  if (!batch) throw new Error('Batch not found');

  // get coa
  const coa = await queryOne('SELECT * FROM coa_records WHERE batch_id_label = ? ORDER BY id DESC LIMIT 1', [batchIdLabel]);
  if (!coa) throw new Error('CoA not found');

  // 1. Qbiochar
  const qbiochar = batch.wet_output_mass * (1 - (batch.output_moisture_avg / 100));

  // 2. Corg
  const corg = coa.ctot_pct - coa.cinorg_pct;

  // 3. H/Corg
  const mh = coa.mh_pct;
  const hcorg = (mh / 1) / (corg / 12);

  // 4. GATE
  if (hcorg >= 0.70) {
    await execute('UPDATE batches SET status = ? WHERE batch_id_label = ?', ['CORC_INELIGIBLE', batchIdLabel]);

    await execute(
      'INSERT INTO flags (rule_id, record_type, record_id, batch_id_label, triggered_at_utc, status) VALUES (?, ?, ?, ?, ?, ?)',
      ['VE-06', 'batch', batch.id, batchIdLabel, new Date().toISOString(), 'OPEN']
    );

    await execute(
      `INSERT INTO carbon_calculations (batch_id_label, qbiochar, corg_pct, hcorg, calculated_at_utc, calculated_by_system)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE qbiochar=VALUES(qbiochar), corg_pct=VALUES(corg_pct), hcorg=VALUES(hcorg),
         calculated_at_utc=VALUES(calculated_at_utc), calculated_by_system=VALUES(calculated_by_system)`,
      [batchIdLabel, qbiochar, corg, hcorg, new Date().toISOString(), 1]
    );
    return false;
  }

  if (hcorg < 0.15) {
    await execute(
      'INSERT INTO flags (rule_id, record_type, record_id, batch_id_label, triggered_at_utc, status) VALUES (?, ?, ?, ?, ?, ?)',
      ['VE-07', 'batch', batch.id, batchIdLabel, new Date().toISOString(), 'OPEN']
    );
  }

  // 5. Ts (simplified, mock district lookup)
  const ts = SOIL_TEMP['Amaravati'];

  // 6. PF
  const M = 0.947;
  const a = 0.598;
  const pf = M - (a * hcorg);

  // 7. Cstored
  const cstored = qbiochar * (corg / 100) * (44 / 12);

  // 8. Closs
  const pf_percent = pf * 100;
  const clossActual = cstored * (1 - (pf_percent / 100));

  // 9. Cbaseline
  const cbaseline = 0;

  // 10. Ebiomass
  const ebiomass = 0.0015 * qbiochar;

  // 11. Eproduction
  const plantDiesel = batch.diesel_litres || 0;

  let feedstockLotIds: number[] = [];
  try {
    feedstockLotIds = JSON.parse(batch.feedstock_lot_ids);
  } catch (e) {}

  let transportDieselFeedstock = 0;
  if (feedstockLotIds.length > 0) {
    const placeholders = feedstockLotIds.map(() => '?').join(',');
    const deliveries = await query(`SELECT gps_lat, gps_lng FROM deliveries WHERE id IN (${placeholders})`, feedstockLotIds);
    transportDieselFeedstock = deliveries.length * 4;
  }

  const dispatches = await query('SELECT dispatch_weight_t FROM dispatches WHERE batch_id_label = ?', [batchIdLabel]);
  const transportDieselBiochar = dispatches.length * 12.5;

  const totalDiesel = plantDiesel + transportDieselFeedstock + transportDieselBiochar;
  const eproduction = (50 * 0.00071) + (totalDiesel * 0.00268);

  // 12. Eleakage
  const eleakage = 0;

  // 13. CORCs
  const corcs = cstored - clossActual - cbaseline - ebiomass - eproduction - eleakage;

  // 14. Uncertainty
  const uncertainty = 8.5;

  await execute(
    `INSERT INTO carbon_calculations
      (batch_id_label, qbiochar, corg_pct, hcorg, pf, cstored, closs, cbaseline, ebiomass, eproduction, eleakage, corcs_net, uncertainty_pct, calculated_at_utc, calculated_by_system)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       qbiochar=VALUES(qbiochar), corg_pct=VALUES(corg_pct), hcorg=VALUES(hcorg), pf=VALUES(pf),
       cstored=VALUES(cstored), closs=VALUES(closs), cbaseline=VALUES(cbaseline),
       ebiomass=VALUES(ebiomass), eproduction=VALUES(eproduction), eleakage=VALUES(eleakage),
       corcs_net=VALUES(corcs_net), uncertainty_pct=VALUES(uncertainty_pct),
       calculated_at_utc=VALUES(calculated_at_utc), calculated_by_system=VALUES(calculated_by_system)`,
    [batchIdLabel, qbiochar, corg, hcorg, pf_percent, cstored, clossActual, cbaseline, ebiomass, eproduction, eleakage, corcs, uncertainty, new Date().toISOString(), 1]
  );

  await execute('UPDATE batches SET status = ? WHERE batch_id_label = ?', ['CARBON_CALCULATED', batchIdLabel]);

  return true;
}
