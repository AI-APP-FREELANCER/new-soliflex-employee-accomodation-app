/**
 * Migration: Housing_Master_Data_new.xlsx → Digital Ocean PostgreSQL
 *
 * Data model:
 *   residence_master  — one row per agreement row in "Owner House Agreements Data"
 *   agreement_master  — one row per agreement row (1-to-1 with residence for now)
 *   employee_master   — one row per unique employee from "Master Data"
 *   users             — default admin user
 *
 * Run: node migrate_to_postgres.js
 */

const { Client } = require('pg');
const XLSX = require('xlsx');
const bcrypt = require('bcryptjs');
const path = require('path');

const EXCEL_PATH = 'C:\\Users\\shyam\\Downloads\\Housing_Master_Data_new.xlsx';

// DB credentials are read from environment variables.
// Copy .env.example → .env and fill in DB_PASSWORD before running.
const DB_CONFIG = {
  host:     process.env.DB_HOST     || 'soliflex-db-do-user-31919116-0.a.db.ondigitalocean.com',
  port:     parseInt(process.env.DB_PORT || '25060'),
  database: process.env.DB_NAME     || 'defaultdb',
  user:     process.env.DB_USER     || 'doadmin',
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function excelSerialToDate(serial) {
  if (!serial || serial === '') return null;
  if (typeof serial === 'string') {
    // Try parsing common formats
    const d = new Date(serial);
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
  }
  if (typeof serial === 'number') {
    const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
  }
  return null;
}

function parseDOJ(doj) {
  if (!doj || doj === '') return null;
  if (typeof doj === 'number') return excelSerialToDate(doj);
  if (typeof doj === 'string') {
    // handles "05/05/2025" format
    const parts = doj.split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    const dt = new Date(doj);
    return isNaN(dt.getTime()) ? null : dt.toISOString().split('T')[0];
  }
  return null;
}

function pad(n, len = 3) {
  return String(n).padStart(len, '0');
}

function cleanStr(s) {
  if (!s) return null;
  return String(s).trim() || null;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS residence_master (
  residence_id              VARCHAR(60)  PRIMARY KEY,
  residence_owner_id        VARCHAR(60),
  residence_owner_name      VARCHAR(255),
  residence_door_number     VARCHAR(255),
  residence_address_line_1  TEXT,
  residence_address_line_2  VARCHAR(255),
  residence_address_line_3  VARCHAR(255),
  residence_state           VARCHAR(100),
  residence_pin_code        VARCHAR(20),
  residence_country         VARCHAR(100) DEFAULT 'India',
  residence_house_count     INTEGER      DEFAULT 1,
  residence_status          VARCHAR(30)  DEFAULT 'active',
  residence_owner_contact   VARCHAR(50),
  residence_area            VARCHAR(100),
  residence_geo_location    VARCHAR(255),
  residence_map_link        TEXT,
  residence_owner_photo_ext VARCHAR(10),
  active_date               TIMESTAMPTZ  DEFAULT NOW(),
  inactive_date             TIMESTAMPTZ,
  status_history            JSONB        DEFAULT '[]'::jsonb,
  created_at                TIMESTAMPTZ  DEFAULT NOW(),
  updated_at                TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agreement_master (
  agreement_id                  VARCHAR(60)    PRIMARY KEY,
  agreement_residence_id        VARCHAR(60)    REFERENCES residence_master(residence_id),
  agreement_possesion_date      DATE,
  agreement_renewal_due_date    DATE,
  agreement_employee_unit       VARCHAR(100),
  agreement_advance_amount      NUMERIC(15,2),
  agreement_monthly_rent_amount NUMERIC(15,2),
  agreement_rent_per_house      NUMERIC(15,2),
  agreement_advance_in_months   NUMERIC(10,4),
  agreement_status              VARCHAR(50)    DEFAULT 'active',
  agreement_amount_received     NUMERIC(15,2),
  agreement_set_to_vacate       BOOLEAN        DEFAULT false,
  agreement_vacate_date         DATE,
  agreement_scheduled_to_vacate BOOLEAN        DEFAULT false,
  agreement_advance_due_back    NUMERIC(15,2),
  agreement_advance_received    NUMERIC(15,2),
  agreement_maintenance_cut     NUMERIC(15,2),
  agreement_notice_period_days  INTEGER,
  agreement_notice_due_by_date  DATE,
  agreement_statutory_status    VARCHAR(100),
  agreement_document_location   TEXT,
  agreement_company             VARCHAR(100),
  active_date                   TIMESTAMPTZ    DEFAULT NOW(),
  inactive_date                 TIMESTAMPTZ,
  status_history                JSONB          DEFAULT '[]'::jsonb,
  created_at                    TIMESTAMPTZ    DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_master (
  employee_id                    VARCHAR(60)  PRIMARY KEY,
  emplyee_allocated_agreement_id VARCHAR(60)  REFERENCES agreement_master(agreement_id),
  employee_first_name            VARCHAR(100),
  employee_last_name             VARCHAR(100),
  employee_sir_name              VARCHAR(100),
  employee_department            VARCHAR(150),
  employee_designation           VARCHAR(150),
  employee_date_of_joining       DATE,
  employee_status                VARCHAR(30)  DEFAULT 'ACTIVE',
  employee_mobile_number         VARCHAR(50),
  employee_room_number           VARCHAR(50),
  employee_floor                 VARCHAR(100),
  employee_last_working_date     DATE,
  employee_notice_served         BOOLEAN      DEFAULT false,
  employee_photo_ext             VARCHAR(10),
  active_date                    TIMESTAMPTZ  DEFAULT NOW(),
  inactive_date                  TIMESTAMPTZ,
  status_history                 JSONB        DEFAULT '[]'::jsonb,
  created_at                     TIMESTAMPTZ  DEFAULT NOW(),
  updated_at                     TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  user_id    VARCHAR(60)  PRIMARY KEY,
  username   VARCHAR(100) UNIQUE NOT NULL,
  password   VARCHAR(255) NOT NULL,
  role       VARCHAR(50)  DEFAULT 'ADMIN',
  created_at TIMESTAMPTZ  DEFAULT NOW()
);
`;

// ─── Main migration ───────────────────────────────────────────────────────────

async function migrate() {
  const client = new Client(DB_CONFIG);
  await client.connect();
  console.log('✓ Connected to Digital Ocean PostgreSQL');

  try {
    // ── 1. Create schema ──────────────────────────────────────────────────────
    console.log('\n[1/5] Creating tables...');
    await client.query(SCHEMA_SQL);
    console.log('    ✓ Tables created (or already exist)');

    // ── 2. Read Excel ─────────────────────────────────────────────────────────
    console.log('\n[2/5] Reading Excel file...');
    const wb = XLSX.readFile(EXCEL_PATH);

    const agreementsSheet = wb.Sheets['Owner House Agreements Data'];
    const masterSheet     = wb.Sheets['Master Data'];

    const agreementRows = XLSX.utils.sheet_to_json(agreementsSheet, { defval: '' });
    const masterRows    = XLSX.utils.sheet_to_json(masterSheet,     { defval: '' });

    console.log(`    ✓ Agreement rows: ${agreementRows.length}`);
    console.log(`    ✓ Master data rows: ${masterRows.length}`);

    // ── 3. Insert residences + agreements ─────────────────────────────────────
    console.log('\n[3/5] Inserting residences and agreements...');

    // Map: "owner|unit|agreementDateSerial" → { residenceId, agreementId }
    // We use this later to link employees to the right agreement
    const agreementLookup = {};

    let residenceCount = 0;
    let agreementCount = 0;

    for (let i = 0; i < agreementRows.length; i++) {
      const row = agreementRows[i];
      const idx = pad(i + 1);

      const residenceId = `residence_id_${idx}`;
      const agreementId = `agreement_${idx}`;
      const ownerId     = `owner${idx}`;

      // Status mapping
      const rawStatus      = (row['Agreement Status'] || '').toString().trim();
      const agreementStatus = 'active'; // all are active in the new data
      const statutoryStatus = rawStatus; // preserve original: "Done", "Signature Pending", "No Agreement"

      // ── Residence ──
      await client.query(`
        INSERT INTO residence_master (
          residence_id, residence_owner_id, residence_owner_name,
          residence_door_number,
          residence_address_line_1, residence_address_line_2,
          residence_state, residence_country,
          residence_house_count, residence_status,
          residence_owner_contact, residence_area,
          residence_geo_location, residence_map_link,
          active_date
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
        ON CONFLICT (residence_id) DO NOTHING
      `, [
        residenceId,
        ownerId,
        cleanStr(row['Owner Name']),
        cleanStr(row['Occupant Room Address']),          // Plus-code / geo address
        cleanStr(row['Address']),                         // Full street address
        cleanStr(row['Area']),                            // Locality
        'Karnataka',
        'India',
        row['No.of Houses'] || 1,
        'active',
        cleanStr(String(row['Contact Number'] || '')),
        cleanStr(row['Area']),
        cleanStr(row['Geo Location']) || cleanStr(row['Occupant Room Address']),
        cleanStr(row['Map Link'])
      ]);
      residenceCount++;

      // ── Agreement ──
      await client.query(`
        INSERT INTO agreement_master (
          agreement_id, agreement_residence_id,
          agreement_possesion_date, agreement_renewal_due_date,
          agreement_employee_unit,
          agreement_advance_amount, agreement_monthly_rent_amount,
          agreement_rent_per_house, agreement_advance_in_months,
          agreement_status, agreement_statutory_status,
          agreement_company,
          active_date
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
        ON CONFLICT (agreement_id) DO UPDATE SET
          agreement_advance_amount      = EXCLUDED.agreement_advance_amount,
          agreement_monthly_rent_amount = EXCLUDED.agreement_monthly_rent_amount,
          agreement_rent_per_house      = EXCLUDED.agreement_rent_per_house,
          agreement_advance_in_months   = EXCLUDED.agreement_advance_in_months,
          updated_at                    = NOW()
      `, [
        agreementId,
        residenceId,
        excelSerialToDate(row['Agreement Date']),
        excelSerialToDate(row['Renewal Date']),
        cleanStr(row['Unit']),
        row[' Advance Amount '] || row['Advance Amount'] || null,
        row[' Rent Amount ']    || row['Rent Amount']    || null,
        row[' Rent per House '] || row['Rent per House'] || null,
        row[' Advance in months '] || row['Advance in months'] || null,
        agreementStatus,
        statutoryStatus,
        cleanStr(row['Company'])
      ]);
      agreementCount++;

      // Build lookup key: owner (trimmed) + "|" + unit (trimmed) + "|" + agreementDate serial
      // Use owner+unit as lookup key (agreement date is the same in Master Data so fine)
      const lookupKey = `${(row['Owner Name'] || '').trim()}|${(row['Unit'] || '').trim()}`;
      // Some owners have multiple agreements with same unit (different dates): use owner+unit+date
      const lookupKeyFull = `${lookupKey}|${row['Agreement Date']}`;
      agreementLookup[lookupKeyFull] = agreementId;
      // Also store just owner+unit for fallback (last one wins - latest agreement)
      agreementLookup[lookupKey] = agreementId;
    }

    console.log(`    ✓ Residences inserted: ${residenceCount}`);
    console.log(`    ✓ Agreements inserted: ${agreementCount}`);

    // ── 4. Insert employees ───────────────────────────────────────────────────
    console.log('\n[4/5] Inserting employees...');

    // De-duplicate employees: for duplicate Emp IDs, last row wins
    // (last occurrence = most recent allocation)
    const employeeMap = {};
    let contractSeq = 0;

    masterRows.forEach((row) => {
      let empId = (row['Emp ID'] || '').toString().trim();
      if (!empId || empId === 'Empty') return;

      // Assign unique IDs for generic placeholders
      if (empId === 'Saddam Contract') {
        contractSeq++;
        empId = `CONTRACT_${pad(contractSeq)}`;
      } else if (empId === 'New Joinee') {
        contractSeq++;
        empId = `NEWJOINEE_${pad(contractSeq)}`;
      } else if (empId === 'New Joiners Occupaid') {
        contractSeq++;
        empId = `NEWJOINER_${pad(contractSeq)}`;
      }

      // Resolve agreement: try full key first (owner+unit+date), then owner+unit
      const ownerTrim = (row['Owner Name'] || '').trim();
      const unitTrim  = (row['Unit'] || '').trim();
      const lookupKeyFull = `${ownerTrim}|${unitTrim}|${row['Agreement Date']}`;
      const lookupKey     = `${ownerTrim}|${unitTrim}`;

      const agreementId = agreementLookup[lookupKeyFull] || agreementLookup[lookupKey] || null;

      // Parse full name: use full Emp Name as first name, split on space
      const fullName = (row['Emp Name'] || '').trim();
      const nameParts = fullName.split(' ');
      const firstName = nameParts[0] || fullName;
      const lastName  = nameParts.slice(1).join(' ') || null;

      employeeMap[empId] = {
        employee_id:                    empId,
        emplyee_allocated_agreement_id: agreementId,
        employee_first_name:            firstName || null,
        employee_last_name:             lastName  || null,
        employee_sir_name:              null,
        employee_department:            cleanStr(row['Department']),
        employee_designation:           cleanStr(row['Designation']),
        employee_date_of_joining:       parseDOJ(row['DOJ']),
        employee_status:                'ACTIVE',
        employee_mobile_number:         cleanStr(String(row['Emp Mobile Number'] || '')),
        employee_room_number:           cleanStr(String(row['Room No'] || '')),
        employee_floor:                 cleanStr(row['Floor'])
      };
    });

    let employeeCount = 0;
    for (const emp of Object.values(employeeMap)) {
      await client.query(`
        INSERT INTO employee_master (
          employee_id, emplyee_allocated_agreement_id,
          employee_first_name, employee_last_name, employee_sir_name,
          employee_department, employee_designation,
          employee_date_of_joining, employee_status,
          employee_mobile_number, employee_room_number, employee_floor,
          active_date
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
        ON CONFLICT (employee_id) DO NOTHING
      `, [
        emp.employee_id,
        emp.emplyee_allocated_agreement_id,
        emp.employee_first_name,
        emp.employee_last_name,
        emp.employee_sir_name,
        emp.employee_department,
        emp.employee_designation,
        emp.employee_date_of_joining,
        emp.employee_status,
        emp.employee_mobile_number,
        emp.employee_room_number,
        emp.employee_floor
      ]);
      employeeCount++;
    }

    console.log(`    ✓ Employees inserted: ${employeeCount}`);

    // ── 5. Default admin user ─────────────────────────────────────────────────
    console.log('\n[5/5] Creating default admin user...');
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await client.query(`
      INSERT INTO users (user_id, username, password, role)
      VALUES ('user_001', 'admin', $1, 'ADMIN')
      ON CONFLICT (user_id) DO NOTHING
    `, [hashedPassword]);
    console.log('    ✓ Admin user created (username: admin, password: admin123)');

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log('\n════════════════════════════════════════════');
    console.log('  Migration complete!');
    console.log('════════════════════════════════════════════');

    const counts = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM residence_master) AS residences,
        (SELECT COUNT(*) FROM agreement_master)  AS agreements,
        (SELECT COUNT(*) FROM employee_master)   AS employees,
        (SELECT COUNT(*) FROM users)             AS users
    `);
    const c = counts.rows[0];
    console.log(`  Residences : ${c.residences}`);
    console.log(`  Agreements : ${c.agreements}`);
    console.log(`  Employees  : ${c.employees}`);
    console.log(`  Users      : ${c.users}`);
    console.log('════════════════════════════════════════════\n');

  } finally {
    await client.end();
  }
}

migrate().catch(err => {
  console.error('\n✗ Migration failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
