import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const db = new Database('purofarms.db', { verbose: console.log });

// Enable Foreign Keys
db.pragma('foreign_keys = ON');

export function initDb() {
  console.log("Initializing database schema...");

  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password_hash TEXT,
      role TEXT,
      created_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS fpos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      district TEXT,
      supply_agreement_url TEXT,
      exclusivity_confirmed BOOLEAN,
      season TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS farmers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT,
      village TEXT,
      fpo_id INTEGER,
      aadhaar_hash TEXT UNIQUE,
      pm_kisan_id TEXT,
      gps_lat REAL,
      gps_lng REAL,
      registration_photo_url TEXT,
      verification_status TEXT,
      registered_at_utc TEXT,
      flagged_for_call_verification BOOLEAN,
      FOREIGN KEY (fpo_id) REFERENCES fpos(id)
    )`,
    `CREATE TABLE IF NOT EXISTS calibration_certs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      instrument_name TEXT,
      instrument_id TEXT UNIQUE,
      cert_number TEXT,
      issue_date TEXT,
      expiry_date TEXT,
      nabl_accreditation_number TEXT,
      cert_url TEXT,
      status TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT,
      farmer_id INTEGER,
      vehicle_number TEXT,
      wet_mass_tonnes REAL,
      moisture_1 REAL,
      moisture_2 REAL,
      moisture_3 REAL,
      moisture_avg REAL,
      gps_lat REAL,
      gps_lng REAL,
      photo_url TEXT,
      moisture_photo_url TEXT,
      photo_exif_lat REAL,
      photo_exif_lng REAL,
      delivery_fingerprint TEXT UNIQUE,
      weighbridge_instrument_id TEXT,
      server_timestamp_utc TEXT,
      client_timestamp_claimed TEXT,
      status TEXT,
      FOREIGN KEY (farmer_id) REFERENCES farmers(id)
    )`,
    `CREATE TABLE IF NOT EXISTS batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id_label TEXT UNIQUE,
      plant_code TEXT,
      feedstock_lot_ids TEXT, /* JSON array of delivery ids */
      status TEXT,
      sample_retention_ref TEXT,
      wet_output_mass REAL,
      output_moisture_avg REAL,
      qbiochar_dry REAL,
      yield_ratio REAL,
      ph REAL,
      bulk_density_kg_m3 REAL,
      diesel_litres REAL,
      record_hash TEXT,
      previous_batch_hash TEXT,
      created_at_utc TEXT,
      updated_at_utc TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS plc_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id_label TEXT,
      sensor_id TEXT,
      timestamp_utc TEXT,
      temperature_c REAL,
      residence_time_min REAL,
      quality_flag TEXT,
      FOREIGN KEY (batch_id_label) REFERENCES batches(batch_id_label)
    )`,
    `CREATE TABLE IF NOT EXISTS coa_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id_label TEXT,
      lab_user_id INTEGER,
      ctot_pct REAL,
      cinorg_pct REAL,
      corg_pct REAL,
      mh_pct REAL,
      hcorg_ratio REAL,
      pf_pct REAL,
      report_date TEXT,
      submission_date TEXT,
      retained_sample_ref TEXT,
      pdf_url TEXT,
      date_lag_days INTEGER,
      upload_timestamp_utc TEXT,
      FOREIGN KEY (batch_id_label) REFERENCES batches(batch_id_label),
      FOREIGN KEY (lab_user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS carbon_calculations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id_label TEXT UNIQUE,
      qbiochar REAL,
      corg_pct REAL,
      hcorg REAL,
      pf REAL,
      cstored REAL,
      closs REAL,
      cbaseline REAL,
      ebiomass REAL,
      eproduction REAL,
      eleakage REAL,
      corcs_net REAL,
      uncertainty_pct REAL,
      calculated_at_utc TEXT,
      calculated_by_system BOOLEAN,
      FOREIGN KEY (batch_id_label) REFERENCES batches(batch_id_label)
    )`,
    `CREATE TABLE IF NOT EXISTS dispatches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id_label TEXT,
      buyer_name TEXT,
      buyer_district TEXT,
      declared_use TEXT,
      dispatch_weight_t REAL,
      price_per_tonne REAL,
      dispatch_date_utc TEXT,
      evidence_due_date TEXT,
      evidence_status TEXT,
      evidence_url TEXT,
      evidence_received_at TEXT,
      FOREIGN KEY (batch_id_label) REFERENCES batches(batch_id_label)
    )`,
    `CREATE TABLE IF NOT EXISTS flags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id TEXT,
      record_type TEXT,
      record_id TEXT,
      batch_id_label TEXT,
      triggered_at_utc TEXT,
      status TEXT,
      resolution_notes TEXT,
      resolved_by_user_id INTEGER,
      resolved_at_utc TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS fraud_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id TEXT,
      attempted_by_user_id INTEGER,
      attempted_action TEXT,
      payload_snapshot TEXT,
      triggered_at_utc TEXT,
      ip_address TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS corrections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT,
      record_id TEXT,
      field_name TEXT,
      old_value TEXT,
      new_value TEXT,
      corrected_by_user_id INTEGER,
      correction_reason TEXT,
      corrected_at_utc TEXT
    )`
  ];

  for (const tableQuery of tables) {
    db.prepare(tableQuery).run();
  }

  try {
    db.prepare("ALTER TABLE batches ADD COLUMN sample_retention_ref TEXT").run();
  } catch (e: any) {
    // Ignore error if column already exists
  }

  try {
    db.prepare("ALTER TABLE farmers ADD COLUMN land_document_url TEXT").run();
  } catch (e: any) {}

  try {
    db.prepare("ALTER TABLE farmers ADD COLUMN noc_document_url TEXT").run();
  } catch (e: any) {}
}

export function seedDb() {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (userCount.count > 0) {
    console.log("DB already seeded.");
    return;
  }

  console.log("Seeding dummy data into database...");
  const t = db.transaction(() => {
    // 1. Users
    const roles = ['FIELD_OFFICER', 'PLANT_OPERATOR', 'LAB_TECHNICIAN', 'AUDITOR', 'MANAGEMENT'];
    const usersData = roles.map(role => {
      let email = "";
      if (role === 'FIELD_OFFICER') email = "field_officer@purofarms.com";
      else if (role === 'PLANT_OPERATOR') email = "operator@purofarms.com";
      else if (role === 'LAB_TECHNICIAN') email = "lab@nabl-partner.com";
      else if (role === 'AUDITOR') email = "auditor@vvb-puro.com";
      else if (role === 'MANAGEMENT') email = "ceo@purofarms.com";

      return {
        email,
        password_hash: bcrypt.hashSync("demo1234", 10),
        role,
        created_at: new Date().toISOString()
      };
    });

    const insertUser = db.prepare(`INSERT INTO users (email, password_hash, role, created_at) VALUES (?, ?, ?, ?)`);
    for (const u of usersData) insertUser.run(u.email, u.password_hash, u.role, u.created_at);

    // 2. FPOs
    const insertFPO = db.prepare('INSERT INTO fpos (name, district, supply_agreement_url, exclusivity_confirmed, season) VALUES (?, ?, ?, ?, ?)');
    insertFPO.run('Vidarbha FPO 1', 'Amaravati', 'url', 1, 'FY26');
    insertFPO.run('Vidarbha FPO 2', 'Akola', 'url', 1, 'FY26');
    insertFPO.run('Vidarbha FPO 3', 'Nagpur', 'url', 1, 'FY26');

    // 3. Farmers (8 total)
    const insertFarmer = db.prepare('INSERT INTO farmers (full_name, village, fpo_id, aadhaar_hash, pm_kisan_id, gps_lat, gps_lng, registration_photo_url, verification_status, registered_at_utc, flagged_for_call_verification) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    insertFarmer.run('Rahul Patil', 'Shirpur', 1, 'hash1', 'PK1', 20.93, 77.75, 'url', 'VERIFIED', new Date().toISOString(), 0);
    insertFarmer.run('Anil Deshmukh', 'Shirpur', 1, 'hash2', 'PK2', 20.93, 77.75, 'url', 'VERIFIED', new Date().toISOString(), 0);
    insertFarmer.run('Sanjay Kale', 'Karanja', 2, 'hash3', 'PK3', 20.48, 77.48, 'url', 'PENDING', new Date().toISOString(), 1);
    insertFarmer.run('Vikasrao', 'Karanja', 2, 'hash4', 'PK4', 20.48, 77.48, 'url', 'VERIFIED', new Date().toISOString(), 0);
    insertFarmer.run('Ganesh Shinde', 'Saoner', 3, 'hash5', 'PK5', 21.38, 78.98, 'url', 'VERIFIED', new Date().toISOString(), 0);
    insertFarmer.run('Ramesh Kumar', 'Saoner', 3, 'hash6', 'PK6', 21.38, 78.98, 'url', 'VERIFIED', new Date().toISOString(), 0);
    insertFarmer.run('Pramod Jadhav', 'Shirpur', 1, 'hash7', 'PK7', 20.93, 77.75, 'url', 'PENDING', new Date().toISOString(), 0);
    insertFarmer.run('Kiran Pawar', 'Karanja', 2, 'hash8', 'PK8', 20.48, 77.48, 'url', 'VERIFIED', new Date().toISOString(), 0);

    // 5. Batches & PLC Logs
    const insertBatch = db.prepare(`INSERT INTO batches (batch_id_label, plant_code, feedstock_lot_ids, status, qbiochar_dry, record_hash, previous_batch_hash, created_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    insertBatch.run('IND-VID-FY26-001', 'IND-VID', '[1,2]', 'DISPATCHED', 12.5, 'hashXYZ1', null, new Date().toISOString());
    insertBatch.run('IND-VID-FY26-002', 'IND-VID', '[3,4]', 'PRODUCTION_COMPLETE', 15.0, 'hashXYZ2', 'hashXYZ1', new Date().toISOString());
    insertBatch.run('IND-VID-FY26-003', 'IND-VID', '[5]', 'SAMPLE_SEALED', 11.2, 'hashXYZ3', 'hashXYZ2', new Date().toISOString());
    insertBatch.run('IND-VID-FY26-004', 'IND-VID', '[6]', 'CARBON_CALCULATED', 14.1, 'hashXYZ4', 'hashXYZ3', new Date().toISOString());
    insertBatch.run('IND-VID-FY26-005', 'IND-VID', '[7]', 'OPEN', null, 'hashXYZ5', 'hashXYZ4', new Date().toISOString());
    insertBatch.run('IND-VID-FY26-006', 'IND-VID', '[8]', 'AUDIT_READY', 13.8, 'hashXYZ6', 'hashXYZ5', new Date().toISOString());

    const insertPlc = db.prepare(`INSERT INTO plc_logs (batch_id_label, sensor_id, timestamp_utc, temperature_c, residence_time_min, quality_flag) VALUES (?, ?, ?, ?, ?, ?)`);
    ['IND-VID-FY26-001', 'IND-VID-FY26-002', 'IND-VID-FY26-003', 'IND-VID-FY26-004', 'IND-VID-FY26-005', 'IND-VID-FY26-006'].forEach(b => {
      insertPlc.run(b, 'TS-01', new Date().toISOString(), 500, 30, 'OK');
    });

    const insertCoa = db.prepare(`INSERT INTO coa_records (batch_id_label, lab_user_id, ctot_pct, cinorg_pct, corg_pct, mh_pct, hcorg_ratio, report_date, submission_date, retained_sample_ref, date_lag_days, upload_timestamp_utc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insertCoa.run('IND-VID-FY26-001', 3, 75.0, 0.5, 74.5, 1.5, 0.24, new Date().toISOString(), new Date().toISOString(), 'REF-1', 5, new Date().toISOString());
    insertCoa.run('IND-VID-FY26-004', 3, 72.0, 0.4, 71.6, 1.8, 0.30, new Date().toISOString(), new Date().toISOString(), 'REF-2', 4, new Date().toISOString());

    const insertCarbon = db.prepare(`INSERT INTO carbon_calculations (batch_id_label, qbiochar, corg_pct, hcorg, corcs_net, calculated_at_utc, calculated_by_system) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    insertCarbon.run('IND-VID-FY26-001', 12.5, 74.5, 0.24, 25.4, new Date().toISOString(), 1);
    insertCarbon.run('IND-VID-FY26-004', 14.1, 71.6, 0.30, 27.2, new Date().toISOString(), 1);
    
    // Simulate one CORC_INELIGIBLE
    insertBatch.run('IND-VID-FY26-007', 'IND-VID', '[9]', 'CORC_INELIGIBLE', 10.0, 'hashXYZ7', 'hashXYZ6', new Date().toISOString());
    insertPlc.run('IND-VID-FY26-007', 'TS-01', new Date().toISOString(), 450, 30, 'OK');
    insertCoa.run('IND-VID-FY26-007', 3, 60.0, 0.5, 59.5, 3.8, 0.76, new Date().toISOString(), new Date().toISOString(), 'REF-3', 2, new Date().toISOString());
    
    // Some active flags
    const insertFlag = db.prepare(`INSERT INTO flags (rule_id, record_type, batch_id_label, triggered_at_utc, status) VALUES (?, ?, ?, ?, ?)`);
    insertFlag.run('VE-02', 'batch', 'IND-VID-FY26-002', new Date().toISOString(), 'OPEN'); // yield ratio
    insertFlag.run('VE-05', 'delivery', null, new Date().toISOString(), 'OPEN'); // GPS spoof
    const insertCert = db.prepare('INSERT INTO calibration_certs (instrument_name, instrument_id, cert_number, issue_date, expiry_date, nabl_accreditation_number, cert_url, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    insertCert.run('Weighbridge', 'WB-01', 'CERT-123', '2025-01-01', '2026-12-31', 'NABL-1', 'url', 'VALID');
    insertCert.run('Bagging Scale', 'BS-01', 'CERT-124', '2025-01-01', '2026-05-17', 'NABL-1', 'url', 'VALID'); // Expiring soon
    insertCert.run('PLC Temp Sensor', 'TS-01', 'CERT-125', '2025-01-01', '2026-12-31', 'NABL-1', 'url', 'VALID');
    insertCert.run('Moisture Meter', 'MM-01', 'CERT-126', '2025-01-01', '2026-12-31', 'NABL-1', 'url', 'VALID');

  });

  t();
  console.log("Database seed complete.");
}

export default db;
