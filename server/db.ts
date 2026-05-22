import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

export const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'purofarms',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: false,
});

/**
 * Execute a query and return all rows.
 */
export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const [rows] = await pool.execute(sql, params);
  return rows as T[];
}

/**
 * Execute a query and return the first row (or undefined).
 */
export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | undefined> {
  const rows = await query<T>(sql, params);
  return rows[0];
}

/**
 * Execute an INSERT/UPDATE/DELETE and return the result header.
 */
export async function execute(sql: string, params?: any[]): Promise<mysql.ResultSetHeader> {
  const [result] = await pool.execute(sql, params);
  return result as mysql.ResultSetHeader;
}

export async function initDb(): Promise<void> {
  console.log('Initializing database schema...');

  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      email TEXT,
      password_hash TEXT,
      role TEXT,
      created_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS fpos (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name TEXT,
      district TEXT,
      supply_agreement_url TEXT,
      exclusivity_confirmed BOOLEAN,
      season TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS farmers (
      id INT PRIMARY KEY AUTO_INCREMENT,
      full_name TEXT,
      village TEXT,
      fpo_id INT,
      aadhaar_hash VARCHAR(255) UNIQUE,
      pm_kisan_id TEXT,
      gps_lat DOUBLE,
      gps_lng DOUBLE,
      registration_photo_url TEXT,
      verification_status TEXT,
      registered_at_utc TEXT,
      flagged_for_call_verification BOOLEAN,
      land_document_url TEXT,
      noc_document_url TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS calibration_certs (
      id INT PRIMARY KEY AUTO_INCREMENT,
      instrument_name TEXT,
      instrument_id VARCHAR(255) UNIQUE,
      cert_number TEXT,
      issue_date TEXT,
      expiry_date TEXT,
      nabl_accreditation_number TEXT,
      cert_url TEXT,
      status TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS deliveries (
      id INT PRIMARY KEY AUTO_INCREMENT,
      batch_id TEXT,
      farmer_id INT,
      vehicle_number TEXT,
      wet_mass_tonnes DOUBLE,
      moisture_1 DOUBLE,
      moisture_2 DOUBLE,
      moisture_3 DOUBLE,
      moisture_avg DOUBLE,
      gps_lat DOUBLE,
      gps_lng DOUBLE,
      photo_url TEXT,
      moisture_photo_url TEXT,
      photo_exif_lat DOUBLE,
      photo_exif_lng DOUBLE,
      delivery_fingerprint VARCHAR(255) UNIQUE,
      weighbridge_instrument_id TEXT,
      server_timestamp_utc TEXT,
      client_timestamp_claimed TEXT,
      status TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS batches (
      id INT PRIMARY KEY AUTO_INCREMENT,
      batch_id_label VARCHAR(255) UNIQUE,
      plant_code TEXT,
      feedstock_lot_ids TEXT,
      status TEXT,
      sample_retention_ref TEXT,
      wet_output_mass DOUBLE,
      output_moisture_avg DOUBLE,
      qbiochar_dry DOUBLE,
      yield_ratio DOUBLE,
      ph DOUBLE,
      bulk_density_kg_m3 DOUBLE,
      diesel_litres DOUBLE,
      record_hash TEXT,
      previous_batch_hash TEXT,
      created_at_utc TEXT,
      updated_at_utc TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS plc_logs (
      id INT PRIMARY KEY AUTO_INCREMENT,
      batch_id_label TEXT,
      sensor_id TEXT,
      timestamp_utc TEXT,
      temperature_c DOUBLE,
      residence_time_min DOUBLE,
      quality_flag TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS coa_records (
      id INT PRIMARY KEY AUTO_INCREMENT,
      batch_id_label TEXT,
      lab_user_id INT,
      ctot_pct DOUBLE,
      cinorg_pct DOUBLE,
      corg_pct DOUBLE,
      mh_pct DOUBLE,
      hcorg_ratio DOUBLE,
      pf_pct DOUBLE,
      report_date TEXT,
      submission_date TEXT,
      retained_sample_ref TEXT,
      pdf_url TEXT,
      date_lag_days INT,
      upload_timestamp_utc TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS carbon_calculations (
      id INT PRIMARY KEY AUTO_INCREMENT,
      batch_id_label VARCHAR(255) UNIQUE,
      qbiochar DOUBLE,
      corg_pct DOUBLE,
      hcorg DOUBLE,
      pf DOUBLE,
      cstored DOUBLE,
      closs DOUBLE,
      cbaseline DOUBLE,
      ebiomass DOUBLE,
      eproduction DOUBLE,
      eleakage DOUBLE,
      corcs_net DOUBLE,
      uncertainty_pct DOUBLE,
      calculated_at_utc TEXT,
      calculated_by_system BOOLEAN
    )`,
    `CREATE TABLE IF NOT EXISTS dispatches (
      id INT PRIMARY KEY AUTO_INCREMENT,
      batch_id_label TEXT,
      buyer_name TEXT,
      buyer_district TEXT,
      declared_use TEXT,
      dispatch_weight_t DOUBLE,
      price_per_tonne DOUBLE,
      dispatch_date_utc TEXT,
      evidence_due_date TEXT,
      evidence_status TEXT,
      evidence_url TEXT,
      evidence_received_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS flags (
      id INT PRIMARY KEY AUTO_INCREMENT,
      rule_id TEXT,
      record_type TEXT,
      record_id TEXT,
      batch_id_label TEXT,
      triggered_at_utc TEXT,
      status TEXT,
      resolution_notes TEXT,
      resolved_by_user_id INT,
      resolved_at_utc TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS fraud_events (
      id INT PRIMARY KEY AUTO_INCREMENT,
      rule_id TEXT,
      attempted_by_user_id INT,
      attempted_action TEXT,
      payload_snapshot TEXT,
      triggered_at_utc TEXT,
      ip_address TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS corrections (
      id INT PRIMARY KEY AUTO_INCREMENT,
      table_name TEXT,
      record_id TEXT,
      field_name TEXT,
      old_value TEXT,
      new_value TEXT,
      corrected_by_user_id INT,
      correction_reason TEXT,
      corrected_at_utc TEXT
    )`,
  ];

  for (const sql of tables) {
    await pool.execute(sql);
  }

  console.log('Schema ready.');
}

export async function seedDb(): Promise<void> {
  const rows = await query<{ count: number }>('SELECT COUNT(*) as count FROM users');
  if (rows[0].count > 0) {
    console.log('DB already seeded.');
    return;
  }

  console.log('Seeding dummy data into database...');

  // 1. Users
  const roles = ['FIELD_OFFICER', 'PLANT_OPERATOR', 'LAB_TECHNICIAN', 'AUDITOR', 'MANAGEMENT'];
  const emailMap: Record<string, string> = {
    FIELD_OFFICER: 'field_officer@purofarms.com',
    PLANT_OPERATOR: 'operator@purofarms.com',
    LAB_TECHNICIAN: 'lab@nabl-partner.com',
    AUDITOR: 'auditor@vvb-puro.com',
    MANAGEMENT: 'ceo@purofarms.com',
  };
  for (const role of roles) {
    await execute(
      'INSERT INTO users (email, password_hash, role, created_at) VALUES (?, ?, ?, ?)',
      [emailMap[role], bcrypt.hashSync('demo1234', 10), role, new Date().toISOString()]
    );
  }

  // 2. FPOs
  await execute('INSERT INTO fpos (name, district, supply_agreement_url, exclusivity_confirmed, season) VALUES (?, ?, ?, ?, ?)', ['Vidarbha FPO 1', 'Amaravati', 'url', 1, 'FY26']);
  await execute('INSERT INTO fpos (name, district, supply_agreement_url, exclusivity_confirmed, season) VALUES (?, ?, ?, ?, ?)', ['Vidarbha FPO 2', 'Akola', 'url', 1, 'FY26']);
  await execute('INSERT INTO fpos (name, district, supply_agreement_url, exclusivity_confirmed, season) VALUES (?, ?, ?, ?, ?)', ['Vidarbha FPO 3', 'Nagpur', 'url', 1, 'FY26']);

  // 3. Farmers
  const farmers = [
    ['Rahul Patil', 'Shirpur', 1, 'hash1', 'PK1', 20.93, 77.75, 'url', 'VERIFIED', 0],
    ['Anil Deshmukh', 'Shirpur', 1, 'hash2', 'PK2', 20.93, 77.75, 'url', 'VERIFIED', 0],
    ['Sanjay Kale', 'Karanja', 2, 'hash3', 'PK3', 20.48, 77.48, 'url', 'PENDING', 1],
    ['Vikasrao', 'Karanja', 2, 'hash4', 'PK4', 20.48, 77.48, 'url', 'VERIFIED', 0],
    ['Ganesh Shinde', 'Saoner', 3, 'hash5', 'PK5', 21.38, 78.98, 'url', 'VERIFIED', 0],
    ['Ramesh Kumar', 'Saoner', 3, 'hash6', 'PK6', 21.38, 78.98, 'url', 'VERIFIED', 0],
    ['Pramod Jadhav', 'Shirpur', 1, 'hash7', 'PK7', 20.93, 77.75, 'url', 'PENDING', 0],
    ['Kiran Pawar', 'Karanja', 2, 'hash8', 'PK8', 20.48, 77.48, 'url', 'VERIFIED', 0],
  ];
  for (const f of farmers) {
    await execute(
      'INSERT INTO farmers (full_name, village, fpo_id, aadhaar_hash, pm_kisan_id, gps_lat, gps_lng, registration_photo_url, verification_status, registered_at_utc, flagged_for_call_verification) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [...f, new Date().toISOString()]
    );
  }

  // 4. Batches
  const batches: [string, string, string, string, number | null, string, string | null][] = [
    ['IND-VID-FY26-001', 'IND-VID', '[1,2]', 'DISPATCHED', 12.5, 'hashXYZ1', null],
    ['IND-VID-FY26-002', 'IND-VID', '[3,4]', 'PRODUCTION_COMPLETE', 15.0, 'hashXYZ2', 'hashXYZ1'],
    ['IND-VID-FY26-003', 'IND-VID', '[5]', 'SAMPLE_SEALED', 11.2, 'hashXYZ3', 'hashXYZ2'],
    ['IND-VID-FY26-004', 'IND-VID', '[6]', 'CARBON_CALCULATED', 14.1, 'hashXYZ4', 'hashXYZ3'],
    ['IND-VID-FY26-005', 'IND-VID', '[7]', 'OPEN', null, 'hashXYZ5', 'hashXYZ4'],
    ['IND-VID-FY26-006', 'IND-VID', '[8]', 'AUDIT_READY', 13.8, 'hashXYZ6', 'hashXYZ5'],
    ['IND-VID-FY26-007', 'IND-VID', '[9]', 'CORC_INELIGIBLE', 10.0, 'hashXYZ7', 'hashXYZ6'],
  ];
  for (const b of batches) {
    await execute(
      'INSERT INTO batches (batch_id_label, plant_code, feedstock_lot_ids, status, qbiochar_dry, record_hash, previous_batch_hash, created_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [...b, new Date().toISOString()]
    );
  }

  // 5. PLC Logs
  for (const label of batches.map(b => b[0])) {
    await execute(
      'INSERT INTO plc_logs (batch_id_label, sensor_id, timestamp_utc, temperature_c, residence_time_min, quality_flag) VALUES (?, ?, ?, ?, ?, ?)',
      [label, 'TS-01', new Date().toISOString(), label === 'IND-VID-FY26-007' ? 450 : 500, 30, 'OK']
    );
  }

  // 6. CoA Records
  const labUserId = 3;
  await execute(
    'INSERT INTO coa_records (batch_id_label, lab_user_id, ctot_pct, cinorg_pct, corg_pct, mh_pct, hcorg_ratio, report_date, submission_date, retained_sample_ref, date_lag_days, upload_timestamp_utc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ['IND-VID-FY26-001', labUserId, 75.0, 0.5, 74.5, 1.5, 0.24, new Date().toISOString(), new Date().toISOString(), 'REF-1', 5, new Date().toISOString()]
  );
  await execute(
    'INSERT INTO coa_records (batch_id_label, lab_user_id, ctot_pct, cinorg_pct, corg_pct, mh_pct, hcorg_ratio, report_date, submission_date, retained_sample_ref, date_lag_days, upload_timestamp_utc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ['IND-VID-FY26-004', labUserId, 72.0, 0.4, 71.6, 1.8, 0.30, new Date().toISOString(), new Date().toISOString(), 'REF-2', 4, new Date().toISOString()]
  );
  await execute(
    'INSERT INTO coa_records (batch_id_label, lab_user_id, ctot_pct, cinorg_pct, corg_pct, mh_pct, hcorg_ratio, report_date, submission_date, retained_sample_ref, date_lag_days, upload_timestamp_utc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ['IND-VID-FY26-007', labUserId, 60.0, 0.5, 59.5, 3.8, 0.76, new Date().toISOString(), new Date().toISOString(), 'REF-3', 2, new Date().toISOString()]
  );

  // 7. Carbon Calculations
  await execute(
    'INSERT INTO carbon_calculations (batch_id_label, qbiochar, corg_pct, hcorg, corcs_net, calculated_at_utc, calculated_by_system) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['IND-VID-FY26-001', 12.5, 74.5, 0.24, 25.4, new Date().toISOString(), 1]
  );
  await execute(
    'INSERT INTO carbon_calculations (batch_id_label, qbiochar, corg_pct, hcorg, corcs_net, calculated_at_utc, calculated_by_system) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['IND-VID-FY26-004', 14.1, 71.6, 0.30, 27.2, new Date().toISOString(), 1]
  );

  // 8. Flags
  await execute(
    'INSERT INTO flags (rule_id, record_type, batch_id_label, triggered_at_utc, status) VALUES (?, ?, ?, ?, ?)',
    ['VE-02', 'batch', 'IND-VID-FY26-002', new Date().toISOString(), 'OPEN']
  );
  await execute(
    'INSERT INTO flags (rule_id, record_type, batch_id_label, triggered_at_utc, status) VALUES (?, ?, ?, ?, ?)',
    ['VE-05', 'delivery', null, new Date().toISOString(), 'OPEN']
  );

  // 9. Calibration Certs
  const certs = [
    ['Weighbridge', 'WB-01', 'CERT-123', '2025-01-01', '2026-12-31', 'NABL-1', 'url', 'VALID'],
    ['Bagging Scale', 'BS-01', 'CERT-124', '2025-01-01', '2026-05-17', 'NABL-1', 'url', 'VALID'],
    ['PLC Temp Sensor', 'TS-01', 'CERT-125', '2025-01-01', '2026-12-31', 'NABL-1', 'url', 'VALID'],
    ['Moisture Meter', 'MM-01', 'CERT-126', '2025-01-01', '2026-12-31', 'NABL-1', 'url', 'VALID'],
  ];
  for (const c of certs) {
    await execute(
      'INSERT INTO calibration_certs (instrument_name, instrument_id, cert_number, issue_date, expiry_date, nabl_accreditation_number, cert_url, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      c
    );
  }

  console.log('Database seed complete.');
}
