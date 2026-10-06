/**
 * PostgreSQL connection pool.
 * All credentials read from .env; hardcoded fallback used during migration only.
 */
const { Pool, types } = require('pg');

// Return DATE columns as plain "YYYY-MM-DD" strings, not JS Date objects.
types.setTypeParser(1082, val => val);
// Return TIMESTAMP/TIMESTAMPTZ as ISO strings (unchanged behaviour).
types.setTypeParser(1114, val => val);
types.setTypeParser(1184, val => val);

if (!process.env.DB_PASSWORD) {
  console.error('FATAL: DB_PASSWORD environment variable is not set. Check your .env file.');
  process.exit(1);
}

// The database is shared with the transportation module (which lives in
// "transport_schema"). This app's tables live in "public". Pin the search_path
// explicitly so unqualified table names can never resolve into another schema.
const DB_SCHEMA = process.env.DB_SCHEMA || 'public';
if (!/^[a-z_][a-z0-9_]*$/.test(DB_SCHEMA)) {
  console.error(`FATAL: DB_SCHEMA "${DB_SCHEMA}" is not a valid schema name.`);
  process.exit(1);
}

const pool = new Pool({
  host:     process.env.DB_HOST     || 'soliflex-db-do-user-31919116-0.a.db.ondigitalocean.com',
  port:     parseInt(process.env.DB_PORT || '25060'),
  database: process.env.DB_NAME     || 'defaultdb',
  user:     process.env.DB_USER     || 'doadmin',
  password: process.env.DB_PASSWORD,
  ssl:      process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
  options:  `-c search_path=${DB_SCHEMA}`,
  max:                  10,
  idleTimeoutMillis:    30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  if (process.env.NODE_ENV !== 'production') {
    console.error('Unexpected PG pool error', err.message);
  }
});

// Ensure columns added after initial migration exist.
async function runStartupMigrations() {
  const migrations = [
    `ALTER TABLE residence_master
       ADD COLUMN IF NOT EXISTS residence_owner_rating VARCHAR(20)`,
    `ALTER TABLE agreement_master
       ADD COLUMN IF NOT EXISTS agreement_deduction_electricity NUMERIC(15,2) DEFAULT 0`,
    `ALTER TABLE agreement_master
       ADD COLUMN IF NOT EXISTS agreement_deduction_water       NUMERIC(15,2) DEFAULT 0`,
    `ALTER TABLE agreement_master
       ADD COLUMN IF NOT EXISTS agreement_deduction_other       NUMERIC(15,2) DEFAULT 0`,

    // ── Bed-level tracking tables ─────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS bed_master (
       bed_id          VARCHAR(80)  PRIMARY KEY,
       residence_id    VARCHAR(50)  NOT NULL,
       room_number     VARCHAR(30)  NOT NULL,
       bed_label       VARCHAR(20)  NOT NULL,
       bed_type        VARCHAR(50)  DEFAULT 'Standard',
       is_active       BOOLEAN      DEFAULT true,
       notes           TEXT,
       created_at      TIMESTAMPTZ  DEFAULT NOW(),
       updated_at      TIMESTAMPTZ  DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_bed_master_residence ON bed_master(residence_id)`,

    `CREATE TABLE IF NOT EXISTS bed_allocations (
       alloc_id        SERIAL       PRIMARY KEY,
       bed_id          VARCHAR(80)  NOT NULL,
       employee_id     VARCHAR(50)  NOT NULL,
       allocated_date  DATE         NOT NULL DEFAULT CURRENT_DATE,
       release_date    DATE,
       release_reason  VARCHAR(100),
       is_active       BOOLEAN      DEFAULT true,
       notes           TEXT,
       created_at      TIMESTAMPTZ  DEFAULT NOW(),
       updated_at      TIMESTAMPTZ  DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_bed_alloc_bed      ON bed_allocations(bed_id)`,
    `CREATE INDEX IF NOT EXISTS idx_bed_alloc_employee ON bed_allocations(employee_id)`,

    // Persistent file storage — tracks every uploaded document on the volume.
    `CREATE TABLE IF NOT EXISTS file_uploads (
       file_id         VARCHAR(40) PRIMARY KEY,
       entity_type     VARCHAR(20)  NOT NULL,
       entity_id       VARCHAR(100) NOT NULL,
       doc_type        VARCHAR(50)  NOT NULL,
       original_name   VARCHAR(500),
       stored_filename VARCHAR(500) NOT NULL,
       file_ext        VARCHAR(10)  NOT NULL,
       file_size_bytes INTEGER,
       mime_type       VARCHAR(100),
       uploaded_at     TIMESTAMPTZ  DEFAULT NOW(),
       sort_order      INTEGER      DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_file_uploads_entity
       ON file_uploads(entity_type, entity_id)`,
    `CREATE INDEX IF NOT EXISTS idx_file_uploads_doc_type
       ON file_uploads(entity_type, entity_id, doc_type)`,

    // ── Floor number on bed_master (Phase 2) ─────────────────────────────────
    `ALTER TABLE bed_master
       ADD COLUMN IF NOT EXISTS floor_number VARCHAR(30)`,

    // ── Employee attrition/retention tracking (Phase 2) ──────────────────────
    `ALTER TABLE employee_master
       ADD COLUMN IF NOT EXISTS employee_date_of_resignation  DATE`,
    `ALTER TABLE employee_master
       ADD COLUMN IF NOT EXISTS employee_resignation_reason   TEXT`,
    `ALTER TABLE employee_master
       ADD COLUMN IF NOT EXISTS employee_retention_date       DATE`,
    `ALTER TABLE employee_master
       ADD COLUMN IF NOT EXISTS employee_retention_reason     TEXT`,
    `ALTER TABLE employee_master
       ADD COLUMN IF NOT EXISTS employee_retention_status     VARCHAR(20) DEFAULT 'N/A'`,

    // ── Residence: separate owner phone field (Phase 2) ───────────────────────
    `ALTER TABLE residence_master
       ADD COLUMN IF NOT EXISTS residence_owner_phone VARCHAR(30)`,

    // ── Phase 3: Room structure (building → floor → room → bed) ──────────────
    // A room belongs to a residence and sits on a floor. Its capacity equals the
    // number of active beds in it; beds remain the unit an employee occupies.
    `CREATE TABLE IF NOT EXISTS room_master (
       room_id         VARCHAR(120) PRIMARY KEY,
       residence_id    VARCHAR(60)  NOT NULL,
       floor_number    VARCHAR(30),
       room_number     VARCHAR(30)  NOT NULL,
       room_type       VARCHAR(50)  DEFAULT 'Shared',
       capacity        INTEGER      NOT NULL DEFAULT 1,
       is_active       BOOLEAN      DEFAULT true,
       notes           TEXT,
       created_at      TIMESTAMPTZ  DEFAULT NOW(),
       updated_at      TIMESTAMPTZ  DEFAULT NOW(),
       UNIQUE (residence_id, room_number)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_room_master_residence ON room_master(residence_id)`,
    // Backfill rooms from the beds that already exist (one room per residence + room number).
    `INSERT INTO room_master (room_id, residence_id, floor_number, room_number, capacity)
       SELECT residence_id || '::' || room_number, residence_id, MAX(floor_number), room_number,
              COUNT(*) FILTER (WHERE is_active)
       FROM bed_master
       GROUP BY residence_id, room_number
     ON CONFLICT (residence_id, room_number) DO NOTHING`,

    // ── Phase 3: Allocation audit trail (who allocated / released / transferred) ─
    `ALTER TABLE bed_allocations ADD COLUMN IF NOT EXISTS movement_type  VARCHAR(20) DEFAULT 'ALLOCATE'`,
    `ALTER TABLE bed_allocations ADD COLUMN IF NOT EXISTS transferred_from_alloc_id INTEGER`,
    `ALTER TABLE bed_allocations ADD COLUMN IF NOT EXISTS allocated_by   VARCHAR(100)`,
    `ALTER TABLE bed_allocations ADD COLUMN IF NOT EXISTS released_by    VARCHAR(100)`,
    // At most one active allocation per bed and per employee (enforced by the DB, not just the API).
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_bed_alloc_active_bed
       ON bed_allocations(bed_id) WHERE is_active`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_bed_alloc_active_employee
       ON bed_allocations(employee_id) WHERE is_active`,

    // ── Phase 3: Unit master — one standard list of units used by every HR team ─
    `CREATE TABLE IF NOT EXISTS unit_master (
       unit_id     SERIAL       PRIMARY KEY,
       unit_name   VARCHAR(100) NOT NULL,
       unit_code   VARCHAR(20),
       is_active   BOOLEAN      DEFAULT true,
       created_at  TIMESTAMPTZ  DEFAULT NOW()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_unit_master_name ON unit_master (LOWER(TRIM(unit_name)))`,
    `INSERT INTO unit_master (unit_name)
       SELECT DISTINCT ON (LOWER(TRIM(agreement_employee_unit))) TRIM(agreement_employee_unit)
       FROM agreement_master
       WHERE TRIM(COALESCE(agreement_employee_unit, '')) <> ''
       ORDER BY LOWER(TRIM(agreement_employee_unit)), created_at
     ON CONFLICT DO NOTHING`,

    // ── Phase 3: Advance refund process ──────────────────────────────────────
    // Each amount the landlord pays back is recorded as a receipt;
    // agreement_master.agreement_advance_received is kept equal to their sum.
    `ALTER TABLE agreement_master ADD COLUMN IF NOT EXISTS agreement_refund_requested_date DATE`,
    `ALTER TABLE agreement_master ADD COLUMN IF NOT EXISTS agreement_refund_followup_date  DATE`,
    `ALTER TABLE agreement_master ADD COLUMN IF NOT EXISTS agreement_refund_settled_date   DATE`,
    `ALTER TABLE agreement_master ADD COLUMN IF NOT EXISTS agreement_refund_notes          TEXT`,
    `CREATE TABLE IF NOT EXISTS advance_refund_receipts (
       receipt_id      SERIAL        PRIMARY KEY,
       agreement_id    VARCHAR(60)   NOT NULL,
       amount          NUMERIC(15,2) NOT NULL,
       received_date   DATE          NOT NULL DEFAULT CURRENT_DATE,
       payment_mode    VARCHAR(30),
       reference_no    VARCHAR(100),
       notes           TEXT,
       recorded_by     VARCHAR(100),
       created_at      TIMESTAMPTZ   DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_refund_receipts_agreement ON advance_refund_receipts(agreement_id)`,
    // Carry forward amounts already recorded before receipts existed, as an opening entry.
    `INSERT INTO advance_refund_receipts (agreement_id, amount, received_date, notes, recorded_by)
       SELECT a.agreement_id, a.agreement_advance_received,
              COALESCE(a.inactive_date::date, a.updated_at::date, CURRENT_DATE),
              'Opening balance (recorded before receipt tracking)', 'system'
       FROM agreement_master a
       WHERE COALESCE(a.agreement_advance_received, 0) > 0
         AND NOT EXISTS (SELECT 1 FROM advance_refund_receipts r WHERE r.agreement_id = a.agreement_id)`,
  ];

  // Refuse to touch the database unless we are really in this app's schema.
  const { rows } = await pool.query('SELECT current_schema() AS schema');
  if (rows[0].schema !== DB_SCHEMA) {
    throw new Error(`Connected schema is "${rows[0].schema}", expected "${DB_SCHEMA}" — skipping startup migrations`);
  }

  for (const sql of migrations) {
    try {
      await pool.query(sql);
    } catch (err) {
      console.error('Startup migration failed:', err.message, '\n  SQL:', sql.split('\n')[0].trim());
    }
  }
}

// Routes may depend on columns/tables created above; server.js waits on this.
pool.ready = runStartupMigrations().catch(err => {
  console.error('Startup migrations aborted:', err.message);
});

module.exports = pool;
