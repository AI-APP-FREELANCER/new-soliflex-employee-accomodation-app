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

const pool = new Pool({
  host:     process.env.DB_HOST     || 'soliflex-db-do-user-31919116-0.a.db.ondigitalocean.com',
  port:     parseInt(process.env.DB_PORT || '25060'),
  database: process.env.DB_NAME     || 'defaultdb',
  user:     process.env.DB_USER     || 'doadmin',
  password: process.env.DB_PASSWORD,
  ssl:      { rejectUnauthorized: false },
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
  ];
  for (const sql of migrations) {
    await pool.query(sql).catch(() => {}); // ignore if already exists
  }
}

runStartupMigrations();

module.exports = pool;
