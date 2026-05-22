import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { query, queryOne, execute, initDb, seedDb } from './db.js';
import crypto from 'crypto';
import { runCarbonEngine } from './carbonEngine.js';

const router = Router();
const JWT_SECRET = 'supersecret_for_demo';

// JWT Middleware
const authenticate = (roles: string[]) => async (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (!roles.includes(decoded.role)) {
      await execute(
        'INSERT INTO fraud_events (rule_id, attempted_by_user_id, attempted_action, payload_snapshot, triggered_at_utc, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
        ['ROLE_VIOLATION', decoded.id, req.method + ' ' + req.path, JSON.stringify(req.body), new Date().toISOString(), req.ip || '127.0.0.1']
      );
      return res.status(403).json({ error: 'Access denied or UNAUTHORIZED' });
    }
    req.user = decoded;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

router.get('/batches/:id/trace', authenticate(['AUDITOR', 'MANAGEMENT']), async (req: any, res: any) => {
  const { id } = req.params;
  const batch = await queryOne('SELECT * FROM batches WHERE id = ?', [id]);
  if (!batch) return res.status(404).json({ error: 'Batch not found' });

  let deliveries: any[] = [];
  try {
    const lotIds = JSON.parse(batch.feedstock_lot_ids || '[]');
    if (lotIds.length > 0) {
      const placeholders = lotIds.map(() => '?').join(',');
      deliveries = await query(
        `SELECT d.*, f.land_document_url, f.noc_document_url, f.full_name as farmer_name FROM deliveries d LEFT JOIN farmers f ON d.farmer_id = f.id WHERE d.id IN (${placeholders})`,
        lotIds
      );
    }
  } catch (e) {}

  const plcLogs = await query('SELECT * FROM plc_logs WHERE batch_id_label = ? ORDER BY timestamp_utc ASC', [batch.batch_id_label]);
  const coa = await queryOne('SELECT * FROM coa_records WHERE batch_id_label = ?', [batch.batch_id_label]);
  const carbon = await queryOne('SELECT * FROM carbon_calculations WHERE batch_id_label = ?', [batch.batch_id_label]);
  const flags = await query('SELECT * FROM flags WHERE batch_id_label = ?', [batch.batch_id_label]);
  const dispatches = await query('SELECT * FROM dispatches WHERE batch_id_label = ?', [batch.batch_id_label]);

  res.json({ batch, deliveries, plcLogs, coa, carbon, flags, dispatches });
});

router.post('/batches/:id/verify_hash', authenticate(['AUDITOR', 'MANAGEMENT']), async (req: any, res: any) => {
  const { id } = req.params;
  const batch = await queryOne('SELECT * FROM batches WHERE id = ?', [id]);
  if (!batch) return res.status(404).json({ error: 'Batch not found' });

  try {
    const lotIds = JSON.parse(batch.feedstock_lot_ids || '[]');
    const record_hash_calc = crypto.createHash('sha256').update(batch.batch_id_label + JSON.stringify(lotIds) + batch.previous_batch_hash).digest('hex');

    if (record_hash_calc === batch.record_hash) {
      res.json({ status: 'VERIFIED', hash: record_hash_calc });
    } else {
      res.json({ status: 'TAMPERED', expected: batch.record_hash, actual: record_hash_calc });
    }
  } catch (e) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

router.post('/batches/:id/ncr', authenticate(['AUDITOR']), async (req: any, res: any) => {
  const { id } = req.params;
  const { field, description } = req.body;
  const batch = await queryOne('SELECT batch_id_label FROM batches WHERE id = ?', [id]);
  if (!batch) return res.status(404).json({ error: 'Batch not found' });

  const result = await execute(
    'INSERT INTO flags (rule_id, record_type, record_id, batch_id_label, triggered_at_utc, status, resolution_notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['AUDIT-NCR', field, id, batch.batch_id_label, new Date().toISOString(), 'OPEN', description]
  );

  res.json({ message: 'NCR raised successfully', id: result.insertId });
});

router.post('/auth/login', async (req: any, res: any) => {
  const { email, password } = req.body;
  const user = await queryOne('SELECT * FROM users WHERE email = ?', [email]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, role: user.role, email: user.email });
});

// Registration (Field Officer)
router.post('/farmers', authenticate(['FIELD_OFFICER']), async (req: any, res: any) => {
  const { full_name, village, fpo_id, aadhaar, gps_lat, gps_lng, land_document_url, noc_document_url } = req.body;
  const aadhaarHash = crypto.createHash('sha256').update(aadhaar).digest('hex');

  const existing = await queryOne('SELECT id FROM farmers WHERE aadhaar_hash = ?', [aadhaarHash]);
  if (existing) {
    await execute(
      'INSERT INTO fraud_events (rule_id, attempted_by_user_id, attempted_action, triggered_at_utc) VALUES (?, ?, ?, ?)',
      ['VE-02_PHANTOM_FARMER', req.user.id, 'REGISTER_FARMER', new Date().toISOString()]
    );
    return res.status(409).json({ error: 'Duplicate Aadhaar — registration rejected.' });
  }

  const flagged = Math.random() < 0.1 ? 1 : 0;

  const result = await execute(
    'INSERT INTO farmers (full_name, village, fpo_id, aadhaar_hash, gps_lat, gps_lng, verification_status, registered_at_utc, flagged_for_call_verification, land_document_url, noc_document_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [full_name, village, fpo_id, aadhaarHash, gps_lat, gps_lng, flagged ? 'PENDING' : 'VERIFIED', new Date().toISOString(), flagged, land_document_url || null, noc_document_url || null]
  );

  res.json({ id: result.insertId, status: flagged ? 'PENDING' : 'VERIFIED' });
});

// Scale APIs
router.get('/scales/weighbridge', authenticate(['FIELD_OFFICER']), (req: any, res: any) => {
  const weight = +(Math.random() * 6 + 2).toFixed(2);
  res.json({ instrument_id: 'WB-01', weight_t: weight, timestamp_utc: new Date().toISOString() });
});

router.get('/scales/bagging', authenticate(['PLANT_OPERATOR']), (req: any, res: any) => {
  const weight = +(Math.random() * 3 + 1).toFixed(2);
  res.json({ instrument_id: 'BS-01', weight_t: weight, timestamp_utc: new Date().toISOString() });
});

router.get('/sensors/fuel', authenticate(['PLANT_OPERATOR']), (req: any, res: any) => {
  const fuel = +(Math.random() * 5 + 10).toFixed(1);
  res.json({ instrument_id: 'FM-01', fuel_litres: fuel, timestamp_utc: new Date().toISOString() });
});

// Deliveries
router.get('/deliveries', authenticate(['FIELD_OFFICER', 'PLANT_OPERATOR', 'MANAGEMENT', 'AUDITOR']), async (req: any, res: any) => {
  const deliveries = await query(`
    SELECT d.*, f.full_name, f.village
    FROM deliveries d
    JOIN farmers f ON d.farmer_id = f.id
    ORDER BY d.id DESC
  `);
  res.json(deliveries);
});

router.post('/deliveries', authenticate(['FIELD_OFFICER']), async (req: any, res: any) => {
  const { farmer_id, vehicle_number, wet_mass_tonnes, moisture_1, moisture_2, moisture_3, gps_lat, gps_lng, photo_exif_lat, photo_exif_lng, photo_url, moisture_photo_url, client_timestamp_claimed } = req.body;

  const moisture_avg = (moisture_1 + moisture_2 + moisture_3) / 3;

  const now = new Date().toISOString();
  const dateStr = now.split('T')[0];
  const massRounded = Math.round(wet_mass_tonnes);
  const fingerprint = crypto.createHash('sha256').update(`${farmer_id}_${Math.round(gps_lat * 1000)}_${dateStr}_${massRounded}`).digest('hex');

  // VE-01: Duplicate Vehicle Window
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const duplicateVehicle = await queryOne('SELECT id FROM deliveries WHERE vehicle_number = ? AND server_timestamp_utc > ?', [vehicle_number, fourHoursAgo]);

  // VE-08: GPS Delivery Spam
  const today = dateStr + '%';
  const sameGpsRows = await query<{ c: number }>(
    'SELECT COUNT(*) as c FROM deliveries WHERE ABS(gps_lat - ?) < 0.001 AND ABS(gps_lng - ?) < 0.001 AND server_timestamp_utc LIKE ?',
    [gps_lat, gps_lng, today]
  );
  const sameGpsDeliveries = sameGpsRows[0];

  try {
    const result = await execute(
      'INSERT INTO deliveries (farmer_id, vehicle_number, wet_mass_tonnes, moisture_1, moisture_2, moisture_3, moisture_avg, gps_lat, gps_lng, photo_exif_lat, photo_exif_lng, photo_url, moisture_photo_url, client_timestamp_claimed, delivery_fingerprint, server_timestamp_utc, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [farmer_id, vehicle_number, wet_mass_tonnes, moisture_1, moisture_2, moisture_3, moisture_avg, gps_lat, gps_lng, photo_exif_lat, photo_exif_lng, photo_url || null, moisture_photo_url || null, client_timestamp_claimed || now, fingerprint, now, 'ACCEPTED']
    );

    if (duplicateVehicle) {
      await execute(
        'INSERT INTO flags (rule_id, record_type, record_id, triggered_at_utc, status) VALUES (?, ?, ?, ?, ?)',
        ['VE-01', 'delivery', result.insertId, now, 'OPEN']
      );
    }

    if (sameGpsDeliveries.c >= 3) {
      await execute(
        'INSERT INTO flags (rule_id, record_type, record_id, triggered_at_utc, status) VALUES (?, ?, ?, ?, ?)',
        ['VE-08', 'delivery', result.insertId, now, 'OPEN']
      );
    }

    // GPS spoof check VE-05
    const dist = Math.sqrt(Math.pow(gps_lat - photo_exif_lat, 2) + Math.pow(gps_lng - photo_exif_lng, 2)) * 111000;
    if (dist > 500) {
      await execute(
        'INSERT INTO flags (rule_id, record_type, record_id, triggered_at_utc, status) VALUES (?, ?, ?, ?, ?)',
        ['VE-05', 'delivery', result.insertId, now, 'OPEN']
      );
    }

    res.json({ id: result.insertId, message: 'Delivery recorded' });
  } catch (e: any) {
    if (e.message && e.message.includes('Duplicate entry') || (e.code && e.code === 'ER_DUP_ENTRY')) {
      return res.status(409).json({ error: 'FINGERPRINT_DUPLICATE' });
    }
    res.status(500).json({ error: e.message });
  }
});

// Batches (Operator)
router.post('/batches', authenticate(['PLANT_OPERATOR']), async (req: any, res: any) => {
  const { feedstock_lot_ids, plant_code } = req.body;
  const seqRows = await query<{ c: number }>('SELECT COUNT(*) as c FROM batches');
  const seq = seqRows[0];
  const batch_id_label = `${plant_code}-FY26-${String(seq.c + 1).padStart(3, '0')}`;

  const now = new Date().toISOString();

  // Previous hash logic
  const prevBatch = await queryOne('SELECT record_hash FROM batches ORDER BY id DESC LIMIT 1');
  const previous_batch_hash = prevBatch ? prevBatch.record_hash : null;

  const record_hash = crypto.createHash('sha256').update(batch_id_label + JSON.stringify(feedstock_lot_ids) + previous_batch_hash).digest('hex');

  // DR-15: Batch Sequence Timing
  const lastPlcLog = await queryOne('SELECT timestamp_utc FROM plc_logs ORDER BY id DESC LIMIT 1');
  if (lastPlcLog && new Date(now).getTime() < new Date(lastPlcLog.timestamp_utc).getTime()) {
    await execute(
      'INSERT INTO flags (rule_id, record_type, batch_id_label, triggered_at_utc, status) VALUES (?, ?, ?, ?, ?)',
      ['DR-15', 'batch', batch_id_label, now, 'OPEN']
    );
  }

  // VE-13: Stockpile Duration
  if (feedstock_lot_ids && feedstock_lot_ids.length > 0) {
    const placeholders = feedstock_lot_ids.map(() => '?').join(',');
    const lots = await query(`SELECT server_timestamp_utc, moisture_avg FROM deliveries WHERE id IN (${placeholders})`, feedstock_lot_ids);

    const tooOld = lots.some((l: any) => (new Date(now).getTime() - new Date(l.server_timestamp_utc).getTime()) > 30 * 24 * 60 * 60 * 1000);
    const tooMoist = lots.some((l: any) => l.moisture_avg > 30);

    if (tooOld || tooMoist) {
      await execute(
        'INSERT INTO flags (rule_id, record_type, batch_id_label, triggered_at_utc, status) VALUES (?, ?, ?, ?, ?)',
        ['VE-13', 'batch', batch_id_label, now, 'OPEN']
      );
    }
  }

  const result = await execute(
    'INSERT INTO batches (batch_id_label, plant_code, feedstock_lot_ids, status, record_hash, previous_batch_hash, created_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [batch_id_label, plant_code, JSON.stringify(feedstock_lot_ids), 'OPEN', record_hash, previous_batch_hash, now]
  );

  if (feedstock_lot_ids && feedstock_lot_ids.length > 0) {
    const placeholders = feedstock_lot_ids.map(() => '?').join(',');
    await execute(
      `UPDATE deliveries SET batch_id = ? WHERE id IN (${placeholders})`,
      [batch_id_label, ...feedstock_lot_ids]
    );
  }

  // Simulate IoT PLC stream
  await execute(
    'INSERT INTO plc_logs (batch_id_label, sensor_id, timestamp_utc, temperature_c, residence_time_min, quality_flag) VALUES (?, ?, ?, ?, ?, ?)',
    [batch_id_label, 'TS-01', now, 520, 45, 'OK']
  );

  res.json({ id: result.insertId, batch_id_label });
});

router.post('/batches/:id/finalize', authenticate(['PLANT_OPERATOR']), async (req: any, res: any) => {
  const { id } = req.params;
  const { wet_output_mass, moisture_1, moisture_2, moisture_3, ph, bulk_density_kg_m3, diesel_litres } = req.body;

  const batch = await queryOne('SELECT * FROM batches WHERE id = ?', [id]);
  if (!batch || batch.status !== 'OPEN') return res.status(400).json({ error: 'Invalid batch state' });

  const plcRows = await query<{ c: number }>('SELECT COUNT(*) as c FROM plc_logs WHERE batch_id_label = ?', [batch.batch_id_label]);
  const plcLogs = plcRows[0];
  if (!plcLogs || plcLogs.c === 0) {
    await execute(
      'INSERT INTO flags (rule_id, record_type, record_id, batch_id_label, triggered_at_utc, status) VALUES (?, ?, ?, ?, ?, ?)',
      ['VE-03', 'batch', id, batch.batch_id_label, new Date().toISOString(), 'OPEN']
    );
    return res.status(400).json({ error: 'VE-03: Missing PLC telemetry logs for this batch.' });
  }

  const output_moisture_avg = (moisture_1 + moisture_2 + moisture_3) / 3;
  const qbiochar_dry = wet_output_mass * (1 - (output_moisture_avg / 100));

  const input_mass = qbiochar_dry * (1 / (0.3 + (Math.random() * 0.1)));
  const yield_ratio = qbiochar_dry / input_mass;

  // VE-02: Yield ratio
  const status = 'PRODUCTION_COMPLETE';
  if (yield_ratio < 0.25 || yield_ratio > 0.40) {
    await execute(
      'INSERT INTO flags (rule_id, record_type, record_id, batch_id_label, triggered_at_utc, status) VALUES (?, ?, ?, ?, ?, ?)',
      ['VE-02', 'batch', id, batch.batch_id_label, new Date().toISOString(), 'OPEN']
    );
  }

  // VE-10: Combustion Uptime
  const downtimeRows = await query<{ c: number }>("SELECT COUNT(*) as c FROM plc_logs WHERE batch_id_label = ? AND quality_flag = 'DOWNTIME'", [batch.batch_id_label]);
  const downtimeEvents = downtimeRows[0];
  if (downtimeEvents.c > 5) {
    await execute(
      'INSERT INTO flags (rule_id, record_type, record_id, batch_id_label, triggered_at_utc, status) VALUES (?, ?, ?, ?, ?, ?)',
      ['VE-10', 'batch', id, batch.batch_id_label, new Date().toISOString(), 'OPEN']
    );
  }

  // DR-17: Electricity Outlier
  if (Math.random() > 0.95) {
    await execute(
      'INSERT INTO flags (rule_id, record_type, record_id, batch_id_label, triggered_at_utc, status) VALUES (?, ?, ?, ?, ?, ?)',
      ['DR-17', 'electricity', id, batch.batch_id_label, new Date().toISOString(), 'OPEN']
    );
  }

  // DR-18: Diesel Outlier
  const avgDieselRows = await query<{ a: number | null }>('SELECT AVG(diesel_litres) as a FROM batches WHERE plant_code = ?', [batch.plant_code]);
  const avgDiesel = avgDieselRows[0];
  if (avgDiesel.a && Math.abs(diesel_litres - avgDiesel.a) / avgDiesel.a > 0.15) {
    await execute(
      'INSERT INTO flags (rule_id, record_type, record_id, batch_id_label, triggered_at_utc, status) VALUES (?, ?, ?, ?, ?, ?)',
      ['DR-18', 'diesel', id, batch.batch_id_label, new Date().toISOString(), 'OPEN']
    );
  }

  await execute(
    'UPDATE batches SET status=?, wet_output_mass=?, output_moisture_avg=?, qbiochar_dry=?, yield_ratio=?, ph=?, bulk_density_kg_m3=?, diesel_litres=?, updated_at_utc=? WHERE id=?',
    [status, wet_output_mass, output_moisture_avg, qbiochar_dry, yield_ratio, ph, bulk_density_kg_m3, diesel_litres, new Date().toISOString(), id]
  );

  res.json({ message: 'Production finalized', yield_ratio });
});

// Seal sample
router.post('/batches/:id/seal-sample', authenticate(['PLANT_OPERATOR']), async (req: any, res: any) => {
  const { id } = req.params;
  const { retention_ref, photo_url, lat, lng } = req.body;
  const batch = await queryOne('SELECT * FROM batches WHERE id = ?', [id]);
  if (!batch || batch.status !== 'PRODUCTION_COMPLETE') return res.status(400).json({ error: 'Batch must be PRODUCTION_COMPLETE' });

  if (!retention_ref || !photo_url) {
    return res.status(400).json({ error: 'Missing required seal data' });
  }

  // VE-14/15/16: Seal Checks
  if (!photo_url) {
    await execute(
      'INSERT INTO flags (rule_id, record_type, batch_id_label, triggered_at_utc, status) VALUES (?, ?, ?, ?, ?)',
      ['VE-14', 'seal', batch.batch_id_label, new Date().toISOString(), 'OPEN']
    );
    return res.status(400).json({ error: 'VE-14: Seal Photo Missing - Blocked' });
  }

  // VE-15: Seal Photo GPS Mismatch
  if (lat && lng) {
    const mockPlantLat = 20.93;
    const mockPlantLng = 77.75;
    const dist = Math.sqrt(Math.pow(lat - mockPlantLat, 2) + Math.pow(lng - mockPlantLng, 2)) * 111000;
    if (dist > 200) {
      await execute(
        'INSERT INTO flags (rule_id, record_type, batch_id_label, triggered_at_utc, status) VALUES (?, ?, ?, ?, ?)',
        ['VE-15', 'seal', batch.batch_id_label, new Date().toISOString(), 'OPEN']
      );
    }
  }

  // VE-16: Batch ID Visibility Attestation Missing
  if (!req.body.attestation_confirmed) {
    await execute(
      'INSERT INTO flags (rule_id, record_type, batch_id_label, triggered_at_utc, status) VALUES (?, ?, ?, ?, ?)',
      ['VE-16', 'seal', batch.batch_id_label, new Date().toISOString(), 'OPEN']
    );
  }

  await execute(
    'UPDATE batches SET status=?, sample_retention_ref=?, updated_at_utc=? WHERE id=?',
    ['SAMPLE_SEALED', retention_ref, new Date().toISOString(), id]
  );
  res.json({ message: 'Sample sealed' });
});

// CoA Upload (Lab Tech only)
router.post('/coa-upload', authenticate(['LAB_TECHNICIAN']), async (req: any, res: any) => {
  const { plant_code, ctot_pct, cinorg_pct, mh_pct, submission_date } = req.body;
  const now = new Date().toISOString();

  const pendingBatches = await query(
    `SELECT batch_id_label, status, sample_retention_ref FROM batches WHERE plant_code = ? AND status IN ('SAMPLE_SEALED', 'DISPATCHED')`,
    [plant_code]
  );

  if (pendingBatches.length === 0) {
    return res.status(400).json({ error: 'No pending batches found for this plant.' });
  }

  const report_date = now;
  const subDate = new Date(submission_date);
  const repDate = new Date(report_date);
  const lagDays = Math.floor((repDate.getTime() - subDate.getTime()) / (1000 * 60 * 60 * 24));

  const corg_pct = ctot_pct - cinorg_pct;
  const hcorg_ratio = (mh_pct / 1) / (corg_pct / 12);

  for (const batch of pendingBatches) {
    const { batch_id_label, sample_retention_ref } = batch as any;

    if (lagDays > 30) {
      await execute(
        'INSERT INTO flags (rule_id, record_type, batch_id_label, triggered_at_utc, status) VALUES (?, ?, ?, ?, ?)',
        ['VE-09', 'coa', batch_id_label, now, 'OPEN']
      );
    }

    if (hcorg_ratio >= 0.70) {
      await execute(
        'INSERT INTO flags (rule_id, record_type, batch_id_label, triggered_at_utc, status) VALUES (?, ?, ?, ?, ?)',
        ['VE-06', 'coa', batch_id_label, now, 'OPEN']
      );
      continue;
    }

    if (hcorg_ratio < 0.15) {
      await execute(
        'INSERT INTO flags (rule_id, record_type, batch_id_label, triggered_at_utc, status) VALUES (?, ?, ?, ?, ?)',
        ['VE-07', 'coa', batch_id_label, now, 'OPEN']
      );
    }

    // DR-19: Lab Result Regression
    const trailingCoA = await query(
      'SELECT hcorg_ratio FROM coa_records WHERE batch_id_label IN (SELECT batch_id_label FROM batches WHERE plant_code = ?) ORDER BY id DESC LIMIT 3',
      [plant_code]
    );
    if (trailingCoA.length === 3) {
      const avg = trailingCoA.reduce((acc: number, c: any) => acc + c.hcorg_ratio, 0) / 3;
      const stdDev = Math.sqrt(trailingCoA.reduce((acc: number, c: any) => acc + Math.pow(c.hcorg_ratio - avg, 2), 0) / 3);
      if (Math.abs(hcorg_ratio - avg) > 2 * stdDev) {
        await execute(
          'INSERT INTO flags (rule_id, record_type, batch_id_label, triggered_at_utc, status) VALUES (?, ?, ?, ?, ?)',
          ['DR-19', 'coa', batch_id_label, now, 'OPEN']
        );
      }
    }

    await execute(
      'INSERT INTO coa_records (batch_id_label, lab_user_id, ctot_pct, cinorg_pct, corg_pct, mh_pct, hcorg_ratio, report_date, submission_date, retained_sample_ref, date_lag_days, upload_timestamp_utc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [batch_id_label, req.user.id, ctot_pct, cinorg_pct, corg_pct, mh_pct, hcorg_ratio, report_date, submission_date, sample_retention_ref || 'MISSING', lagDays, now]
    );

    // Run Carbon Engine
    await runCarbonEngine(batch_id_label);
  }

  res.json({ message: `CoA processed and Carbon Engine run for ${pendingBatches.length} batches.` });
});

// Dispatches (Operator)
router.post('/dispatches', authenticate(['PLANT_OPERATOR']), async (req: any, res: any) => {
  const { batch_id_label, buyer_name, buyer_district, declared_use, weight } = req.body;
  const dispatch_weight_t = parseFloat(weight) || 0;

  const batch = await queryOne('SELECT qbiochar_dry FROM batches WHERE batch_id_label = ?', [batch_id_label]);
  const existingRows = await query<{ t: number | null }>('SELECT SUM(dispatch_weight_t) as t FROM dispatches WHERE batch_id_label = ?', [batch_id_label]);
  const existingDispatches = existingRows[0];
  const total = (existingDispatches?.t || 0) + dispatch_weight_t;

  if (total > batch.qbiochar_dry) {
    return res.status(400).json({ error: `VE-11: Dispatch blocked: total dispatched ${total.toFixed(2)}t would exceed batch output ${batch.qbiochar_dry.toFixed(2)}t` });
  }

  const now = new Date();
  const evidenceDue = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString();

  await execute(
    'INSERT INTO dispatches (batch_id_label, buyer_name, buyer_district, declared_use, dispatch_weight_t, price_per_tonne, dispatch_date_utc, evidence_due_date, evidence_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [batch_id_label, buyer_name, buyer_district || '', declared_use, dispatch_weight_t, 0, now.toISOString(), evidenceDue, 'PENDING']
  );

  await execute(
    'UPDATE batches SET status=?, updated_at_utc=? WHERE batch_id_label=?',
    ['DISPATCHED', now.toISOString(), batch_id_label]
  );
  res.json({ message: 'Dispatch recorded' });
});

router.get('/farmers', authenticate(['FIELD_OFFICER', 'PLANT_OPERATOR', 'MANAGEMENT', 'AUDITOR']), async (req: any, res: any) => {
  const farmers = await query('SELECT id, full_name, village, verification_status FROM farmers');
  res.json(farmers);
});

router.get('/dispatches', authenticate(['FIELD_OFFICER', 'PLANT_OPERATOR', 'MANAGEMENT', 'AUDITOR']), async (req: any, res: any) => {
  const ds = await query('SELECT id, batch_id_label, buyer_name, buyer_district, declared_use, dispatch_weight_t, price_per_tonne, dispatch_date_utc, evidence_due_date, evidence_status FROM dispatches ORDER BY dispatch_date_utc DESC');
  res.json(ds);
});

router.post('/dispatches/:id/evidence', authenticate(['FIELD_OFFICER', 'PLANT_OPERATOR']), async (req: any, res: any) => {
  const { id } = req.params;
  const { photo_url } = req.body;
  const now = new Date().toISOString();

  await execute(
    `UPDATE dispatches SET evidence_status = 'RECEIVED', evidence_url = ?, evidence_received_at = ? WHERE id = ?`,
    [photo_url || 'simulated-photo-url.jpg', now, id]
  );

  res.json({ success: true, message: 'Evidence uploaded successfully' });
});

router.get('/batches', authenticate(['PLANT_OPERATOR', 'MANAGEMENT', 'AUDITOR', 'LAB_TECHNICIAN']), async (req: any, res: any) => {
  const batches = await query(`
    SELECT b.*, c.corcs_net
    FROM batches b
    LEFT JOIN carbon_calculations c ON b.batch_id_label = c.batch_id_label
    ORDER BY b.id DESC
  `);
  res.json(batches);
});

router.post('/flags/:id/resolve', authenticate(['MANAGEMENT', 'AUDITOR']), async (req: any, res: any) => {
  const { status } = req.body || { status: 'RESOLVED' };
  await execute('UPDATE flags SET status = ? WHERE id = ?', [status, req.params.id]);
  res.json({ success: true });
});

router.post('/coa/:id/seal-check', authenticate(['MANAGEMENT', 'AUDITOR']), async (req: any, res: any) => {
  const { id } = req.params;
  const { broken_seal, notes } = req.body;
  if (broken_seal) {
    const coa = await queryOne('SELECT batch_id_label FROM coa_records WHERE id = ?', [id]);
    if (coa) {
      await execute(
        'INSERT INTO flags (rule_id, record_type, record_id, batch_id_label, triggered_at_utc, status, resolution_notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['VE-17', 'coa', id, coa.batch_id_label, new Date().toISOString(), 'OPEN', notes || 'Broken seal reported by retrieval officer.']
      );
    }
  }
  res.json({ success: true });
});

router.get('/flags', authenticate(['MANAGEMENT', 'AUDITOR', 'PLANT_OPERATOR', 'FIELD_OFFICER']), async (req: any, res: any) => {
  let flags = await query("SELECT * FROM flags WHERE status = 'OPEN' ORDER BY id DESC") as any[];

  if (req.user?.role === 'FIELD_OFFICER') {
    flags = flags.filter((f: any) => f.record_type === 'delivery' || f.rule_id.startsWith('VE-05') || f.rule_id.startsWith('VE-01'));
  } else if (req.user?.role === 'PLANT_OPERATOR') {
    flags = flags.filter((f: any) => f.record_type === 'batch' || f.record_type === 'seal');
  }

  res.json(flags);
});

router.get('/dashboard', authenticate(['MANAGEMENT']), async (req: any, res: any) => {
  const corcsRows = await query<{ t: number | null }>('SELECT SUM(corcs_net) as t FROM carbon_calculations');
  const corcsTotal = corcsRows[0];
  const activeFlagRows = await query<{ c: number }>("SELECT COUNT(*) as c FROM flags WHERE status = 'OPEN'");
  const activeFlags = activeFlagRows[0];
  const expiringCerts = await query("SELECT * FROM calibration_certs WHERE status = 'VALID' OR status = 'EXPIRING'");
  const dispatchRows = await query<{ t: number | null }>('SELECT SUM(dispatch_weight_t) as t FROM dispatches');
  const dispatches = dispatchRows[0];
  const batches = await query(`
    SELECT b.*, c.corcs_net FROM batches b
    LEFT JOIN carbon_calculations c ON b.batch_id_label = c.batch_id_label
    ORDER BY id DESC
  `) as any[];

  // 1. Funnel
  const funnel = {
    productionComplete: batches.filter((b: any) => b.status === 'PRODUCTION_COMPLETE').length,
    sampleSealed: batches.filter((b: any) => b.status === 'SAMPLE_SEALED').length,
    dispatched: batches.filter((b: any) => b.status === 'DISPATCHED').length,
    carbonCalculated: batches.filter((b: any) => !!b.corcs_net).length,
    auditReady: batches.filter((b: any) => !!b.corcs_net && b.status === 'DISPATCHED').length,
  };

  // 2. Monthly Trend (last 7 months)
  const now = new Date();
  const months = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthLabel = d.toLocaleString('default', { month: 'short' });
    const monthYear = d.toISOString().slice(0, 7);

    const monthBatches = batches.filter((b: any) => b.created_at_utc && b.created_at_utc.startsWith(monthYear));
    const confirmed = monthBatches.reduce((acc: number, b: any) => acc + (b.corcs_net || 0), 0);
    const pending = monthBatches
      .filter((b: any) => !b.corcs_net && ['PRODUCTION_COMPLETE', 'SAMPLE_SEALED', 'DISPATCHED'].includes(b.status))
      .reduce((acc: number, b: any) => acc + (b.qbiochar_dry ? b.qbiochar_dry * 0.4 : 0), 0);

    months.push({ name: monthLabel, confirmed, pending });
  }

  // 3. Lab Periods
  const labPeriods = [];
  for (let i = 3; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const periodName = d.toLocaleString('default', { month: 'long', year: 'numeric' });
    const monthYear = d.toISOString().slice(0, 7);
    const pBatches = batches.filter((b: any) => b.created_at_utc && b.created_at_utc.startsWith(monthYear));

    if (pBatches.length > 0) {
      const coaRows = await query<{ c: number }>(
        `SELECT COUNT(*) as c FROM coa_records WHERE batch_id_label IN (SELECT batch_id_label FROM batches WHERE created_at_utc LIKE ?)`,
        [`${monthYear}%`]
      );
      const coaCount = coaRows[0];
      const status = coaCount.c >= pBatches.length ? 'COMPLETE' : 'PENDING';
      const daysOpen = status === 'COMPLETE' ? 0 : Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      labPeriods.push({ name: periodName, batchCount: pBatches.length, daysOpen, status });
    }
  }

  // 4. VE-12: Evidence missing > 60 days post-dispatch
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const overdueDispatches = await query("SELECT * FROM dispatches WHERE evidence_status = 'PENDING' AND dispatch_date_utc < ?", [sixtyDaysAgo]) as any[];
  for (const d of overdueDispatches) {
    const exists = await queryOne("SELECT id FROM flags WHERE rule_id = 'VE-12' AND record_id = ?", [d.id]);
    if (!exists) {
      await execute(
        'INSERT INTO flags (rule_id, record_type, record_id, batch_id_label, triggered_at_utc, status) VALUES (?, ?, ?, ?, ?, ?)',
        ['VE-12', 'dispatch', d.id, d.batch_id_label, new Date().toISOString(), 'OPEN']
      );
    }
  }

  const currentFlagged = await query("SELECT * FROM flags WHERE status = 'OPEN' ORDER BY id DESC") as any[];

  const flags = currentFlagged.map((f: any) => {
    let desc = 'Integrity violation flagged by engine.';
    switch (f.rule_id) {
      case 'VE-01': desc = 'Duplicate Vehicle Window: Same vehicle detected within 4 hours.'; break;
      case 'VE-02': desc = 'Yield Ratio Anomaly: Output outside 25-40% range.'; break;
      case 'VE-03': desc = 'Missing PLC Logs: Null telemetry stream during production.'; break;
      case 'VE-05': desc = 'GPS Spoofing: App GPS vs Photo EXIF mismatch.'; break;
      case 'VE-06': desc = 'H/Corg Upper Bound: Ratio >= 0.70 (Ineligible).'; break;
      case 'VE-07': desc = 'H/Corg Implausible: Ratio < 0.15 (Cotton stalk anomaly).'; break;
      case 'VE-08': desc = 'GPS Delivery Spam: Multiple deliveries from same pin.'; break;
      case 'VE-09': desc = 'CoA Timing Mismatch: Report lag > 30 days.'; break;
      case 'VE-10': desc = 'Combustion Uptime: Reactor downtime > 5%.'; break;
      case 'VE-11': desc = 'Dispatch Total Exceeded: Mass balance violation.'; break;
      case 'VE-12': desc = 'End-use Deadline: Biochar evidence overdue > 60 days.'; break;
      case 'VE-13': desc = 'Stockpile Duration: Feedstock > 30 days or too moist.'; break;
      case 'DR-15': desc = 'Batch Sequence Timing: Created before PLC start.'; break;
      case 'DR-17': desc = 'Electricity Outlier: Energy consumption deviation > 20%.'; break;
      case 'DR-18': desc = 'Diesel Outlier: Fuel use deviation > 15%.'; break;
      case 'DR-19': desc = 'Lab Result Regression: H/Corg > 2 sigma from average.'; break;
      case 'VE-14': desc = 'Seal Photo Missing: Mandatory chain-of-custody photo null.'; break;
      case 'VE-15': desc = 'Seal Photo GPS Mismatch: Out of range of plant.'; break;
      case 'VE-16': desc = 'Attestation Missing: Label visibility not confirmed.'; break;
      case 'VE-17': desc = 'Broken Seal: Reporting by Compliance Officer.'; break;
    }
    return { ...f, blocksDispatch: f.rule_id.startsWith('VE-'), description: desc };
  });

  // 5. Revenue
  const confirmedRev = (corcsTotal?.t || 0) * 120;
  const pipelineRev = batches
    .filter((b: any) => !b.corcs_net && b.qbiochar_dry > 0)
    .reduce((acc: number, b: any) => acc + (b.qbiochar_dry * 0.4 * 110), 0);

  res.json({
    corcsTotal: corcsTotal?.t || 0,
    activeFlags: activeFlags?.c || 0,
    dispatchesTotal: dispatches?.t || 0,
    revenue: { confirmed: confirmedRev, pipeline: pipelineRev },
    funnel,
    trend: months,
    labPeriods,
    flags,
    batches: batches || [],
    expiringCerts: expiringCerts || [],
  });
});

export { initDb, seedDb };
export default router;
