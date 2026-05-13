import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import db, { initDb, seedDb } from "./db.js";
import crypto from "crypto";

const router = Router();
const JWT_SECRET = "supersecret_for_demo";

// Initialize data
initDb();
seedDb();

// JWT Middleware
const authenticate = (roles: string[]) => (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (!roles.includes(decoded.role)) {
      db.prepare('INSERT INTO fraud_events (rule_id, attempted_by_user_id, attempted_action, payload_snapshot, triggered_at_utc, ip_address) VALUES (?, ?, ?, ?, ?, ?)')
        .run("ROLE_VIOLATION", decoded.id, req.method + " " + req.path, JSON.stringify(req.body), new Date().toISOString(), req.ip || "127.0.0.1");
      return res.status(403).json({ error: "Access denied or UNAUTHORIZED" });
    }
    req.user = decoded;
    next();
  } catch (e) {
    res.status(401).json({ error: "Invalid token" });
  }
};

router.get("/batches/:id/trace", authenticate(["AUDITOR", "MANAGEMENT"]), (req, res) => {
  const { id } = req.params;
  const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(id) as any;
  if (!batch) return res.status(404).json({ error: "Batch not found" });

  let deliveries = [];
  try {
    const lotIds = JSON.parse(batch.feedstock_lot_ids || "[]");
    if (lotIds.length > 0) {
      const placeholders = lotIds.map(() => '?').join(',');
      deliveries = db.prepare(`SELECT * FROM deliveries WHERE id IN (${placeholders})`).all(...lotIds);
    }
  } catch(e) {}

  const plcLogs = db.prepare('SELECT * FROM plc_logs WHERE batch_id_label = ? ORDER BY timestamp_utc ASC').all(batch.batch_id_label);
  const coa = db.prepare('SELECT * FROM coa_records WHERE batch_id_label = ?').get(batch.batch_id_label);
  const carbon = db.prepare('SELECT * FROM carbon_calculations WHERE batch_id_label = ?').get(batch.batch_id_label);
  const flags = db.prepare('SELECT * FROM flags WHERE batch_id_label = ?').all(batch.batch_id_label);
  const dispatches = db.prepare('SELECT * FROM dispatches WHERE batch_id_label = ?').all(batch.batch_id_label);

  res.json({ batch, deliveries, plcLogs, coa, carbon, flags, dispatches });
});

router.post("/batches/:id/verify_hash", authenticate(["AUDITOR", "MANAGEMENT"]), (req, res) => {
  const { id } = req.params;
  const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(id) as any;
  if (!batch) return res.status(404).json({ error: "Batch not found" });

  try {
    const lotIds = JSON.parse(batch.feedstock_lot_ids || "[]");
    const record_hash_calc = crypto.createHash('sha256').update(batch.batch_id_label + JSON.stringify(lotIds) + batch.previous_batch_hash).digest('hex');
    
    if (record_hash_calc === batch.record_hash) {
      res.json({ status: "VERIFIED", hash: record_hash_calc });
    } else {
      res.json({ status: "TAMPERED", expected: batch.record_hash, actual: record_hash_calc });
    }
  } catch (e) {
    res.status(500).json({ error: "Verification failed" });
  }
});

router.post("/batches/:id/ncr", authenticate(["AUDITOR"]), (req, res) => {
  const { id } = req.params;
  const { field, description } = req.body;
  const batch = db.prepare('SELECT batch_id_label FROM batches WHERE id = ?').get(id) as any;
  if (!batch) return res.status(404).json({ error: "Batch not found" });

  const result = db.prepare('INSERT INTO flags (rule_id, record_type, record_id, batch_id_label, triggered_at_utc, status, resolution_notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('AUDIT-NCR', field, id, batch.batch_id_label, new Date().toISOString(), 'OPEN', description);
  
  res.json({ message: "NCR raised successfully", id: result.lastInsertRowid });
});

router.post("/auth/login", (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, role: user.role, email: user.email });
});

// Add these imports at the top
import { runCarbonEngine } from "./carbonEngine.js";

// Registration (Field Officer)
router.post("/farmers", authenticate(["FIELD_OFFICER"]), (req: any, res: any) => {
  const { full_name, village, fpo_id, aadhaar, gps_lat, gps_lng } = req.body;
  const aadhaarHash = crypto.createHash('sha256').update(aadhaar).digest('hex');

  const existing = db.prepare('SELECT id FROM farmers WHERE aadhaar_hash = ?').get(aadhaarHash);
  if (existing) {
    db.prepare('INSERT INTO fraud_events (rule_id, attempted_by_user_id, attempted_action, triggered_at_utc) VALUES (?, ?, ?, ?)')
      .run("VE-02_PHANTOM_FARMER", req.user.id, "REGISTER_FARMER", new Date().toISOString());
    return res.status(409).json({ error: "Duplicate Aadhaar — registration rejected." });
  }

  // Random 10% flag
  const flagged = Math.random() < 0.1 ? 1 : 0;
  
  const result = db.prepare(`INSERT INTO farmers (full_name, village, fpo_id, aadhaar_hash, gps_lat, gps_lng, verification_status, registered_at_utc, flagged_for_call_verification) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(full_name, village, fpo_id, aadhaarHash, gps_lat, gps_lng, flagged ? 'PENDING' : 'VERIFIED', new Date().toISOString(), flagged);
  
  res.json({ id: result.lastInsertRowid, status: flagged ? 'PENDING' : 'VERIFIED' });
});

// Scale APIs
router.get("/scales/weighbridge", authenticate(["FIELD_OFFICER"]), (req: any, res: any) => {
  const weight = +(Math.random() * 6 + 2).toFixed(2);
  res.json({ instrument_id: 'WB-01', weight_t: weight, timestamp_utc: new Date().toISOString() });
});

router.get("/scales/bagging", authenticate(["PLANT_OPERATOR"]), (req: any, res: any) => {
  const weight = +(Math.random() * 3 + 1).toFixed(2);
  res.json({ instrument_id: 'BS-01', weight_t: weight, timestamp_utc: new Date().toISOString() });
});

router.get("/sensors/fuel", authenticate(["PLANT_OPERATOR"]), (req: any, res: any) => {
  const fuel = +(Math.random() * 5 + 10).toFixed(1); // 10-15 L
  res.json({ instrument_id: 'FM-01', fuel_litres: fuel, timestamp_utc: new Date().toISOString() });
});

// Deliveries (Field Officer)
router.get("/deliveries", authenticate(["FIELD_OFFICER", "PLANT_OPERATOR", "MANAGEMENT", "AUDITOR"]), (req, res) => {
  const deliveries = db.prepare(`
    SELECT d.*, f.full_name, f.village 
    FROM deliveries d 
    JOIN farmers f ON d.farmer_id = f.id 
    ORDER BY d.id DESC
  `).all();
  res.json(deliveries);
});

router.post("/deliveries", authenticate(["FIELD_OFFICER"]), (req, res) => {
  const { farmer_id, vehicle_number, wet_mass_tonnes, moisture_1, moisture_2, moisture_3, gps_lat, gps_lng, photo_exif_lat, photo_exif_lng, photo_url, moisture_photo_url, client_timestamp_claimed } = req.body;
  
  const moisture_avg = (moisture_1 + moisture_2 + moisture_3) / 3;
  
  const now = new Date().toISOString();
  // Delivery Fingerprint
  const dateStr = now.split('T')[0];
  const massRounded = Math.round(wet_mass_tonnes);
  const fingerprint = crypto.createHash('sha256').update(`${farmer_id}_${Math.round(gps_lat*10)}_${dateStr}_${massRounded}`).digest('hex');
  
  try {
    const result = db.prepare(`INSERT INTO deliveries (farmer_id, vehicle_number, wet_mass_tonnes, moisture_1, moisture_2, moisture_3, moisture_avg, gps_lat, gps_lng, photo_exif_lat, photo_exif_lng, photo_url, moisture_photo_url, client_timestamp_claimed, delivery_fingerprint, server_timestamp_utc, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(farmer_id, vehicle_number, wet_mass_tonnes, moisture_1, moisture_2, moisture_3, moisture_avg, gps_lat, gps_lng, photo_exif_lat, photo_exif_lng, photo_url || null, moisture_photo_url || null, client_timestamp_claimed || now, fingerprint, now, "ACCEPTED");
    
    // GPS spoof check
    const dist = Math.sqrt(Math.pow(gps_lat - photo_exif_lat, 2) + Math.pow(gps_lng - photo_exif_lng, 2)) * 111000; // approx meters
    if (dist > 500) {
      db.prepare('INSERT INTO flags (rule_id, record_type, record_id, triggered_at_utc, status) VALUES (?, ?, ?, ?, ?)')
        .run("VE-05", 'delivery', result.lastInsertRowid, now, "OPEN");
    }

    res.json({ id: result.lastInsertRowid, message: "Delivery recorded" });
  } catch (e: any) {
    if (e.message.includes("UNIQUE constraint failed")) {
      return res.status(409).json({ error: "FINGERPRINT_DUPLICATE" });
    }
    res.status(500).json({ error: e.message });
  }
});

// Batches (Operator)
router.post("/batches", authenticate(["PLANT_OPERATOR"]), (req, res) => {
  const { feedstock_lot_ids, plant_code } = req.body;
  const seq = db.prepare('SELECT COUNT(*) as c FROM batches').get() as { c: number };
  const batch_id_label = `${plant_code}-FY26-${String(seq.c + 1).padStart(3, '0')}`;
  
  const now = new Date().toISOString();
  
  // Previous hash logic
  const prevBatch = db.prepare('SELECT record_hash FROM batches ORDER BY id DESC LIMIT 1').get() as any;
  const previous_batch_hash = prevBatch ? prevBatch.record_hash : null;

  // Compute this batch hash
  const record_hash = crypto.createHash('sha256').update(batch_id_label + JSON.stringify(feedstock_lot_ids) + previous_batch_hash).digest('hex');

  const result = db.prepare(`INSERT INTO batches (batch_id_label, plant_code, feedstock_lot_ids, status, record_hash, previous_batch_hash, created_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(batch_id_label, plant_code, JSON.stringify(feedstock_lot_ids), 'OPEN', record_hash, previous_batch_hash, now);

  if (feedstock_lot_ids && feedstock_lot_ids.length > 0) {
    const placeholders = feedstock_lot_ids.map(() => '?').join(',');
    db.prepare(`UPDATE deliveries SET batch_id = ? WHERE id IN (${placeholders})`)
      .run(batch_id_label, ...feedstock_lot_ids);
  }

  // Simulate IoT PLC stream
  db.prepare(`INSERT INTO plc_logs (batch_id_label, sensor_id, timestamp_utc, temperature_c, residence_time_min, quality_flag) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(batch_id_label, 'TS-01', now, 520, 45, 'OK');

  res.json({ id: result.lastInsertRowid, batch_id_label });
});

router.post("/batches/:id/finalize", authenticate(["PLANT_OPERATOR"]), (req, res) => {
  const { id } = req.params;
  const { wet_output_mass, moisture_1, moisture_2, moisture_3, ph, bulk_density_kg_m3, diesel_litres } = req.body;
  
  const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(id) as any;
  if (!batch || batch.status !== 'OPEN') return res.status(400).json({ error: "Invalid batch state" });

  const plcLogs = db.prepare('SELECT COUNT(*) as c FROM plc_logs WHERE batch_id_label = ?').get(batch.batch_id_label) as any;
  if (!plcLogs || plcLogs.c === 0) {
    db.prepare('INSERT INTO flags (rule_id, record_type, record_id, batch_id_label, triggered_at_utc, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run('VE-03', 'batch', id, batch.batch_id_label, new Date().toISOString(), 'OPEN');
    return res.status(400).json({ error: "VE-03: Missing PLC telemetry logs for this batch." });
  }

  const output_moisture_avg = (moisture_1 + moisture_2 + moisture_3) / 3;
  const qbiochar_dry = wet_output_mass * (1 - (output_moisture_avg / 100));

  // Simulating input mass for yield ratio
  const input_mass = qbiochar_dry * (1 / (0.3 + (Math.random() * 0.1))); // approx 30-40% yield
  let yield_ratio = qbiochar_dry / input_mass;

  // VE-02: Yield ratio
  let status = 'PRODUCTION_COMPLETE';
  if (yield_ratio < 0.25 || yield_ratio > 0.40) {
    db.prepare('INSERT INTO flags (rule_id, record_type, record_id, batch_id_label, triggered_at_utc, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run('VE-02', 'batch', id, batch.batch_id_label, new Date().toISOString(), 'OPEN');
  }

  db.prepare(`UPDATE batches SET status=?, wet_output_mass=?, output_moisture_avg=?, qbiochar_dry=?, yield_ratio=?, ph=?, bulk_density_kg_m3=?, diesel_litres=?, updated_at_utc=? WHERE id=?`)
    .run(status, wet_output_mass, output_moisture_avg, qbiochar_dry, yield_ratio, ph, bulk_density_kg_m3, diesel_litres, new Date().toISOString(), id);
  
  res.json({ message: "Production finalized", yield_ratio });
});

// Seal sample
router.post("/batches/:id/seal-sample", authenticate(["PLANT_OPERATOR"]), (req, res) => {
  const { id } = req.params;
  const { retention_ref, photo_url, lat, lng } = req.body;
  const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(id) as any;
  if (!batch || batch.status !== 'PRODUCTION_COMPLETE') return res.status(400).json({ error: "Batch must be PRODUCTION_COMPLETE" });
  
  if (!retention_ref || !photo_url) {
    return res.status(400).json({ error: "Missing required seal data" });
  }

  // Simulate GPS check (flag if distance > 200m)
  // In a real app we'd compute haversine distance between plant location and photo GPS
  // For validation testing, let's assume if lat/lng are missing or specific values, it triggers a flag
  if (lat && lng) {
    // mock check
    const mockPlantLat = 20.93;
    const mockPlantLng = 77.75;
    const dist = Math.sqrt(Math.pow(lat - mockPlantLat, 2) + Math.pow(lng - mockPlantLng, 2)) * 111000;
    if (dist > 200) {
       db.prepare('INSERT INTO flags (rule_id, record_type, batch_id_label, triggered_at_utc, status) VALUES (?, ?, ?, ?, ?)')
        .run('VE-14', 'seal', batch.batch_id_label, new Date().toISOString(), 'OPEN');
    }
  }
  
  db.prepare('UPDATE batches SET status=?, sample_retention_ref=?, updated_at_utc=? WHERE id=?').run('SAMPLE_SEALED', retention_ref, new Date().toISOString(), id);
  res.json({ message: "Sample sealed" });
});

// CoA Upload (Lab Tech only)
router.post("/coa-upload", authenticate(["LAB_TECHNICIAN"]), (req: any, res: any) => {
  const { plant_code, ctot_pct, cinorg_pct, mh_pct, submission_date } = req.body;
  const now = new Date().toISOString();

  // Find all pending batches for this plant
  const pendingBatches = db.prepare(`SELECT batch_id_label, status, sample_retention_ref FROM batches WHERE plant_code = ? AND status IN ('SAMPLE_SEALED', 'DISPATCHED')`).all(plant_code) as any[];

  if (pendingBatches.length === 0) {
    return res.status(400).json({ error: "No pending batches found for this plant." });
  }

  // date lag VE-09
  const report_date = now;
  const subDate = new Date(submission_date);
  const repDate = new Date(report_date);
  const lagDays = Math.floor((repDate.getTime() - subDate.getTime()) / (1000 * 60 * 60 * 24));
  
  const corg_pct = ctot_pct - cinorg_pct;
  const hcorg_ratio = (mh_pct / 1) / (corg_pct / 12);

  for (const batch of pendingBatches) {
    const { batch_id_label, sample_retention_ref } = batch;

    if (lagDays > 30) {
      db.prepare('INSERT INTO flags (rule_id, record_type, batch_id_label, triggered_at_utc, status) VALUES (?, ?, ?, ?, ?)')
        .run('VE-09', 'coa', batch_id_label, now, 'OPEN');
    }

    db.prepare(`INSERT INTO coa_records (batch_id_label, lab_user_id, ctot_pct, cinorg_pct, corg_pct, mh_pct, hcorg_ratio, report_date, submission_date, retained_sample_ref, date_lag_days, upload_timestamp_utc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(batch_id_label, req.user.id, ctot_pct, cinorg_pct, corg_pct, mh_pct, hcorg_ratio, report_date, submission_date, sample_retention_ref || "MISSING", lagDays, now);
    
    // Run Carbon Engine
    runCarbonEngine(batch_id_label);
  }
  
  res.json({ message: `CoA processed and Carbon Engine run for ${pendingBatches.length} batches.` });
});

// Dispatches (Operator)
router.post("/dispatches", authenticate(["PLANT_OPERATOR"]), (req, res) => {
  const { batch_id_label, buyer_name, buyer_district, declared_use, weight } = req.body;
  const dispatch_weight_t = parseFloat(weight) || 0; // User inputted weight

  const batch = db.prepare('SELECT qbiochar_dry FROM batches WHERE batch_id_label = ?').get(batch_id_label) as any;
  const existingDispatches = db.prepare('SELECT SUM(dispatch_weight_t) as t FROM dispatches WHERE batch_id_label = ?').get(batch_id_label) as any;
  const total = (existingDispatches?.t || 0) + dispatch_weight_t;

  if (total > batch.qbiochar_dry) {
    return res.status(400).json({ error: `VE-11: Dispatch blocked: total dispatched ${total.toFixed(2)}t would exceed batch output ${batch.qbiochar_dry.toFixed(2)}t` });
  }
  
  const now = new Date();
  const evidenceDue = new Date(now.getTime() + 60*24*60*60*1000).toISOString();

  db.prepare(`INSERT INTO dispatches (batch_id_label, buyer_name, buyer_district, declared_use, dispatch_weight_t, price_per_tonne, dispatch_date_utc, evidence_due_date, evidence_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(batch_id_label, buyer_name, buyer_district || '', declared_use, dispatch_weight_t, 0, now.toISOString(), evidenceDue, 'PENDING');

  db.prepare('UPDATE batches SET status=?, updated_at_utc=? WHERE batch_id_label=?').run('DISPATCHED', now.toISOString(), batch_id_label);
  res.json({ message: "Dispatch recorded" });
});

router.get("/farmers", authenticate(["FIELD_OFFICER", "PLANT_OPERATOR", "MANAGEMENT", "AUDITOR"]), (req, res) => {
  const farmers = db.prepare('SELECT id, full_name, village, verification_status FROM farmers').all();
  res.json(farmers);
});

router.get("/dispatches", authenticate(["FIELD_OFFICER", "PLANT_OPERATOR", "MANAGEMENT", "AUDITOR"]), (req, res) => {
  const ds = db.prepare('SELECT id, batch_id_label, buyer_name, buyer_district, declared_use, dispatch_weight_t, price_per_tonne, dispatch_date_utc, evidence_due_date, evidence_status FROM dispatches ORDER BY dispatch_date_utc DESC').all();
  res.json(ds);
});
router.post("/dispatches/:id/evidence", authenticate(["FIELD_OFFICER", "PLANT_OPERATOR"]), (req, res) => {
  const { id } = req.params;
  const { photo_url } = req.body;
  const now = new Date().toISOString();
  
  db.prepare(`
    UPDATE dispatches 
    SET evidence_status = 'RECEIVED', evidence_url = ?, evidence_received_at = ?
    WHERE id = ?
  `).run(photo_url || 'simulated-photo-url.jpg', now, id);
  
  res.json({ success: true, message: "Evidence uploaded successfully" });
});

router.get("/batches", authenticate(["PLANT_OPERATOR", "MANAGEMENT", "AUDITOR", "LAB_TECHNICIAN"]), (req, res) => {
  const batches = db.prepare(`
    SELECT b.*, c.corcs_net 
    FROM batches b 
    LEFT JOIN carbon_calculations c ON b.batch_id_label = c.batch_id_label 
    ORDER BY b.id DESC
  `).all();
  res.json(batches);
});

router.post("/flags/:id/resolve", authenticate(["MANAGEMENT", "AUDITOR"]), (req, res) => {
  const { status } = req.body || { status: 'RESOLVED' };
  db.prepare("UPDATE flags SET status = ? WHERE id = ?").run(status, req.params.id);
  res.json({ success: true });
});

router.get("/dashboard", authenticate(["MANAGEMENT"]), (req, res) => {
  const corcsTotal = db.prepare("SELECT SUM(corcs_net) as t FROM carbon_calculations").get() as any;
  const activeFlags = db.prepare("SELECT COUNT(*) as c FROM flags WHERE status = 'OPEN'").get() as any;
  const flaggedBatches = db.prepare("SELECT * FROM flags WHERE status = 'OPEN' ORDER BY id DESC").all() as any[];
  const expiringCerts = db.prepare("SELECT * FROM calibration_certs WHERE status = 'VALID' OR status = 'EXPIRING'").all();
  const dispatches = db.prepare("SELECT SUM(dispatch_weight_t) as t FROM dispatches").get() as any;
  const batches = db.prepare("SELECT b.*, c.corcs_net FROM batches b LEFT JOIN carbon_calculations c ON b.batch_id_label = c.batch_id_label ORDER BY id DESC").all() as any[];

  // 1. Funnel
  const funnel = {
    productionComplete: batches.filter(b => b.status === 'PRODUCTION_COMPLETE').length,
    sampleSealed: batches.filter(b => b.status === 'SAMPLE_SEALED').length,
    dispatched: batches.filter(b => b.status === 'DISPATCHED').length,
    carbonCalculated: batches.filter(b => !!b.corcs_net).length,
    auditReady: batches.filter(b => !!b.corcs_net && b.status === 'DISPATCHED').length,
  };

  // 2. Monthly Trend (last 7 months)
  const now = new Date();
  const months = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthLabel = d.toLocaleString('default', { month: 'short' });
    const monthYear = d.toISOString().slice(0, 7); // YYYY-MM
    
    // Confirmed: has corcs_net and month matches created_at or updated_at
    // For simplicity, let's look at batches created in that month
    const monthBatches = batches.filter(b => b.created_at_utc.startsWith(monthYear));
    const confirmed = monthBatches.reduce((acc, b) => acc + (b.corcs_net || 0), 0);
    // Pending: if in relevant states but no corcs_net yet
    const pending = monthBatches.filter(b => !b.corcs_net && ['PRODUCTION_COMPLETE', 'SAMPLE_SEALED', 'DISPATCHED'].includes(b.status))
                   .reduce((acc, b) => acc + (b.qbiochar_dry ? b.qbiochar_dry * 0.4 : 0), 0); // Estimated 0.4 CORCs per tonne if pending

    months.push({ name: monthLabel, confirmed, pending });
  }

  // 3. Lab Periods
  const labPeriods = [];
  for (let i = 3; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const periodName = d.toLocaleString('default', { month: 'long', year: 'numeric' });
    const monthYear = d.toISOString().slice(0, 7);
    const pBatches = batches.filter(b => b.created_at_utc.startsWith(monthYear));
    
    if (pBatches.length > 0) {
      const coaCount = db.prepare(`SELECT COUNT(*) as c FROM coa_records WHERE batch_id_label IN (SELECT batch_id_label FROM batches WHERE created_at_utc LIKE '${monthYear}%')`).get() as any;
      const status = coaCount.c >= pBatches.length ? 'COMPLETE' : 'PENDING';
      const daysOpen = status === 'COMPLETE' ? 0 : Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      labPeriods.push({ name: periodName, batchCount: pBatches.length, daysOpen, status });
    }
  }

  // 4. Detailed Flags
  const flags = flaggedBatches.map(f => ({
    ...f,
    blocksDispatch: f.rule_id.startsWith('VE-'), // Assuming VE rules are blocking
    description: f.rule_id === 'VE-02' ? 'Yield ratio anomaly detected.' :
                 f.rule_id === 'VE-03' ? 'Missing PLC telemetry logs.' :
                 f.rule_id === 'VE-05' ? 'GPS spoofing suspected in delivery.' :
                 f.rule_id === 'VE-11' ? 'Dispatch mass exceeding batch production.' :
                 f.rule_id === 'VE-14' ? 'Seal photo GPS out of range.' :
                 'Integrity violation flagged by engine.'
  }));

  // 5. Revenue
  const confirmedRev = (corcsTotal?.t || 0) * 120;
  const pipelineRev = batches.filter(b => !b.corcs_net && b.qbiochar_dry > 0)
                             .reduce((acc, b) => acc + (b.qbiochar_dry * 0.4 * 110), 0); // $110 for pipeline est

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
    expiringCerts: expiringCerts || []
  });
});

export default router;
