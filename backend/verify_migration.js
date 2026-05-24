require('dotenv').config();
const { Client } = require('pg');
const client = new Client({
  host:     process.env.DB_HOST     || 'soliflex-db-do-user-31919116-0.a.db.ondigitalocean.com',
  port:     parseInt(process.env.DB_PORT || '25060'),
  database: process.env.DB_NAME     || 'defaultdb',
  user:     process.env.DB_USER     || 'doadmin',
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

client.connect().then(async () => {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Database Verification');
  console.log('═══════════════════════════════════════════════════\n');

  // Record counts
  const counts = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM residence_master)                                          AS total_residences,
      (SELECT COUNT(*) FROM agreement_master)                                          AS total_agreements,
      (SELECT COUNT(*) FROM agreement_master WHERE agreement_statutory_status = 'Done')          AS agreements_done,
      (SELECT COUNT(*) FROM agreement_master WHERE agreement_statutory_status = 'Signature Pending') AS sig_pending,
      (SELECT COUNT(*) FROM agreement_master WHERE agreement_statutory_status = 'No Agreement')  AS no_agreement,
      (SELECT COUNT(*) FROM agreement_master WHERE agreement_advance_amount IS NOT NULL)         AS agreements_with_amounts,
      (SELECT COUNT(*) FROM employee_master)                                           AS total_employees,
      (SELECT COUNT(*) FROM employee_master WHERE emplyee_allocated_agreement_id IS NOT NULL) AS employees_linked,
      (SELECT COUNT(*) FROM users)                                                     AS users
  `);
  const c = counts.rows[0];
  console.log('── Counts ──────────────────────────────────────────');
  console.log('  Residences             :', c.total_residences);
  console.log('  Agreements             :', c.total_agreements);
  console.log('    - Status "Done"      :', c.agreements_done);
  console.log('    - Signature Pending  :', c.sig_pending);
  console.log('    - No Agreement       :', c.no_agreement);
  console.log('    - With amounts       :', c.agreements_with_amounts);
  console.log('  Employees              :', c.total_employees);
  console.log('    - Linked to agreement:', c.employees_linked);
  console.log('  Users                  :', c.users);

  // Financial summary
  const fin = await client.query(`
    SELECT
      SUM(agreement_advance_amount)      AS total_advance,
      SUM(agreement_monthly_rent_amount) AS total_monthly_rent,
      COUNT(*)                           AS agreements_with_financials
    FROM agreement_master
    WHERE agreement_advance_amount IS NOT NULL
  `);
  const f = fin.rows[0];
  console.log('\n── Financial Summary ───────────────────────────────');
  console.log('  Total advance locked   : ₹', Number(f.total_advance).toLocaleString('en-IN'));
  console.log('  Total monthly rent     : ₹', Number(f.total_monthly_rent).toLocaleString('en-IN'));
  console.log('  Annual rent commitment : ₹', (Number(f.total_monthly_rent) * 12).toLocaleString('en-IN'));

  // Unit distribution
  const units = await client.query(`
    SELECT agreement_employee_unit AS unit, COUNT(*) AS count
    FROM agreement_master GROUP BY unit ORDER BY count DESC
  `);
  console.log('\n── Agreement Distribution by Unit ──────────────────');
  units.rows.forEach(r => console.log(`  ${(r.unit || 'N/A').padEnd(20)} : ${r.count} agreements`));

  // Department distribution
  const depts = await client.query(`
    SELECT employee_department AS dept, COUNT(*) AS count
    FROM employee_master GROUP BY dept ORDER BY count DESC LIMIT 10
  `);
  console.log('\n── Top 10 Departments ──────────────────────────────');
  depts.rows.forEach(r => console.log(`  ${(r.dept || 'N/A').padEnd(30)} : ${r.count} employees`));

  // Sample joined data
  const sample = await client.query(`
    SELECT
      r.residence_owner_name, r.residence_area,
      a.agreement_employee_unit, a.agreement_monthly_rent_amount::text,
      a.agreement_possesion_date::text, a.agreement_renewal_due_date::text,
      COUNT(e.employee_id) AS emp_count
    FROM residence_master r
    JOIN agreement_master a ON a.agreement_residence_id = r.residence_id
    LEFT JOIN employee_master e ON e.emplyee_allocated_agreement_id = a.agreement_id
    GROUP BY r.residence_owner_name, r.residence_area,
             a.agreement_employee_unit, a.agreement_monthly_rent_amount,
             a.agreement_possesion_date, a.agreement_renewal_due_date
    ORDER BY emp_count DESC LIMIT 8
  `);
  console.log('\n── Top 8 Properties by Employee Count ──────────────');
  sample.rows.forEach(r => {
    console.log(`  ${r.residence_owner_name.substring(0,30).padEnd(30)} | ${(r.agreement_employee_unit||'').padEnd(10)} | ₹${(r.agreement_monthly_rent_amount||'0').padStart(8)} | ${r.emp_count} employees`);
  });

  console.log('\n═══════════════════════════════════════════════════');
  await client.end();
}).catch(e => console.error('Error:', e.message));
