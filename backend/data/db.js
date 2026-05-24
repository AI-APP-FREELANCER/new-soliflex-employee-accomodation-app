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
  ];
  for (const sql of migrations) {
    await pool.query(sql).catch(() => {}); // ignore if already exists
  }
}

runStartupMigrations();

module.exports = pool;
