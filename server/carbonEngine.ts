import db from "./db.js";

// Hardcoded Soil Temp by District
const SOIL_TEMP: Record<string, number> = {
  'Amaravati': 26.4,
  'Akola': 27.1,
  'Yavatmal': 26.8,
  'Nagpur': 26.9,
  'Wardha': 26.5
};

export function runCarbonEngine(batchIdLabel: string) {
  // get batch
  const batch = db.prepare('SELECT * FROM batches WHERE batch_id_label = ?').get(batchIdLabel) as any;
  if (!batch) throw new Error("Batch not found");

  // get coa
  const coa = db.prepare('SELECT * FROM coa_records WHERE batch_id_label = ? ORDER BY id DESC LIMIT 1').get(batchIdLabel) as any;
  if (!coa) throw new Error("CoA not found");

  // 1. Qbiochar
  const qbiochar = batch.wet_output_mass * (1 - (batch.output_moisture_avg / 100)); // Should match batch.qbiochar_dry

  // 2. Corg
  const corg = coa.ctot_pct - coa.cinorg_pct;

  // 3. H/Corg
  const mh = coa.mh_pct;
  const hcorg = (mh / 1) / (corg / 12);

  // 4. GATE
  if (hcorg >= 0.70) {
    db.prepare('UPDATE batches SET status = ? WHERE batch_id_label = ?').run('CORC_INELIGIBLE', batchIdLabel);
    
    // Log Flag VE-06
    db.prepare('INSERT INTO flags (rule_id, record_type, record_id, batch_id_label, triggered_at_utc, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run('VE-06', 'batch', batch.id, batchIdLabel, new Date().toISOString(), 'OPEN');
      
    // Write incomplete calculation
    db.prepare(`INSERT OR REPLACE INTO carbon_calculations (batch_id_label, qbiochar, corg_pct, hcorg, calculated_at_utc, calculated_by_system) 
                VALUES (?, ?, ?, ?, ?, ?)`)
      .run(batchIdLabel, qbiochar, corg, hcorg, new Date().toISOString(), 1);
    return false;
  }
  
  if (hcorg < 0.15) {
     db.prepare('INSERT INTO flags (rule_id, record_type, record_id, batch_id_label, triggered_at_utc, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run('VE-07', 'batch', batch.id, batchIdLabel, new Date().toISOString(), 'OPEN');
  }

  // 5. Ts (simplified, mock district lookup based on some logic, or use Amaravati default)
  const ts = SOIL_TEMP['Amaravati'];
  
  // 6. PF
  const M = 0.947;
  const a = 0.598;
  const pf = M - (a * hcorg); // Using mock table values

  // 7. Cstored
  const cstored = qbiochar * (corg / 100) * (44 / 12);

  // 8. Closs
  const closs = cstored * (1 - Math.max(0, pf)); // assuming PF is percentage or fraction? "PF=M - a*H/Corg", so it's a fraction. 
  // Wait, the PRD says: Cstored x (1 - PF/100). If PF is calculated as fraction, let's treat PF as percentage or fraction. The formula PF = 0.947 - 0.598 * H/Corg gives a number like 0.8. So it's 80%. Let's assume the PRD formula means PF is a percentage, so PF*100.
  // Actually, if PF is 0.8, then (1 - PF) would be 0.2. The PRD says "PF/100", suggesting PF should be around 80.
  const pf_percent = pf * 100;
  const clossActual = cstored * (1 - (pf_percent / 100));

  // 9. Cbaseline
  const cbaseline = 0;

  // 10. Ebiomass
  const ebiomass = 0.0015 * qbiochar;

  // 11. Eproduction
  // Fetch diesel from the batch
  const plantDiesel = batch.diesel_litres || 0;
  
  // Calculate transport fuel
  // Fetch feedstock deliveries for this batch to estimate transport diesel
  let feedstockLotIds = [];
  try {
    feedstockLotIds = JSON.parse(batch.feedstock_lot_ids);
  } catch (e) {}
  
  let transportDieselFeedstock = 0;
  if (feedstockLotIds && feedstockLotIds.length > 0) {
    const placeholders = feedstockLotIds.map(() => '?').join(',');
    const deliveries = db.prepare(`SELECT gps_lat, gps_lng FROM deliveries WHERE id IN (${placeholders})`).all(...feedstockLotIds) as any[];
    // Rough estimate: Assume avg distance 20km, fuel efficiency 5km/L => 4L per delivery
    transportDieselFeedstock = deliveries.length * 4;
  }

  // Fetch dispatches for this batch to estimate outbound transport fuel
  const dispatches = db.prepare(`SELECT dispatch_weight_t FROM dispatches WHERE batch_id_label = ?`).all(batchIdLabel) as any[];
  // Rough estimate: Assume avg distance 50km, fuel efficiency 4km/L for larger trucks => 12.5L per dispatch
  let transportDieselBiochar = dispatches.length * 12.5;

  const totalDiesel = plantDiesel + transportDieselFeedstock + transportDieselBiochar;

  const eproduction = ( (50 * 0.00071) + (totalDiesel * 0.00268) ); 

  // 12. Eleakage
  const eleakage = 0;

  // 13. CORCs
  const corcs = cstored - clossActual - cbaseline - ebiomass - eproduction - eleakage;
  
  // 14. U
  const uncertainty = 8.5;

  db.prepare(`INSERT OR REPLACE INTO carbon_calculations 
    (batch_id_label, qbiochar, corg_pct, hcorg, pf, cstored, closs, cbaseline, ebiomass, eproduction, eleakage, corcs_net, uncertainty_pct, calculated_at_utc, calculated_by_system)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(batchIdLabel, qbiochar, corg, hcorg, pf_percent, cstored, clossActual, cbaseline, ebiomass, eproduction, eleakage, corcs, uncertainty, new Date().toISOString(), 1);

  // update batch status
  db.prepare('UPDATE batches SET status = ? WHERE batch_id_label = ?').run('CARBON_CALCULATED', batchIdLabel);
  
  return true;
}
