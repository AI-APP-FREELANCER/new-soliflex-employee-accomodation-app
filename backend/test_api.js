/**
 * Quick smoke-test: login → get token → hit every major endpoint.
 * Run: node test_api.js
 */
const http = require('http');

const BASE = 'http://localhost:3001';
let TOKEN  = '';
let passed = 0;
let failed = 0;

function req(method, path, body, expectStatus = 200) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'localhost', port: 3001,
      path, method,
      headers: {
        'Content-Type':  'application/json',
        ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const r = http.request(options, (res) => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        let json;
        try { json = JSON.parse(raw); } catch { json = raw; }
        const ok = res.statusCode === expectStatus;
        if (ok) { passed++; console.log(`  ✓ ${method} ${path} → ${res.statusCode}`); }
        else     { failed++; console.log(`  ✗ ${method} ${path} → ${res.statusCode} (expected ${expectStatus})\n    ${JSON.stringify(json).substring(0,200)}`); }
        resolve({ status: res.statusCode, body: json });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function run() {
  console.log('\n══ Auth ═══════════════════════════════════════');
  const login = await req('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
  TOKEN = login.body?.token;
  if (!TOKEN) { console.log('  ✗ Login failed — aborting'); process.exit(1); }

  await req('GET', '/api/auth/verify');

  console.log('\n══ Health ══════════════════════════════════════');
  await req('GET', '/api/health');

  console.log('\n══ Residences ══════════════════════════════════');
  const resAll = await req('GET', '/api/residence?status=all');
  console.log(`    total residences: ${resAll.body?.length}`);
  await req('GET', '/api/residence?status=active');
  const firstResId = resAll.body?.[0]?.residence_id;
  if (firstResId) await req('GET', `/api/residence/${firstResId}`);

  console.log('\n══ Agreements ══════════════════════════════════');
  const agAll = await req('GET', '/api/agreement?status=all');
  console.log(`    total agreements: ${agAll.body?.length}`);
  await req('GET', '/api/agreement?status=active');
  const firstAgId = agAll.body?.[0]?.agreement_id;
  if (firstAgId) {
    const ag = await req('GET', `/api/agreement/${firstAgId}`);
    console.log(`    sample: id=${ag.body?.agreement_id} status=${ag.body?.agreement_status} rent=${ag.body?.agreement_monthly_rent_amount} renewal=${ag.body?.agreement_renewal_due_date}`);
  }

  console.log('\n══ Employees ═══════════════════════════════════');
  const empAll = await req('GET', '/api/employee?status=all');
  console.log(`    total employees: ${empAll.body?.length}`);
  await req('GET', '/api/employee?status=active');
  const firstEmpId = empAll.body?.[0]?.employee_id;
  if (firstEmpId) {
    const emp = await req('GET', `/api/employee/${firstEmpId}`);
    console.log(`    sample: id=${emp.body?.employee_id} name=${emp.body?.employee_first_name} dept=${emp.body?.employee_department}`);
  }

  console.log('\n══ Analytics ═══════════════════════════════════');
  const analytics = await req('GET', '/api/analytics');
  const b = analytics.body;
  if (b && !b.error) {
    console.log(`    properties=${b.totalProperties} activeEmp=${b.activeEmployees} monthlyRent=₹${b.totalMonthlyRent?.toLocaleString('en-IN')} pastDue=${b.pastDue} dueSoon=${b.dueSoon}`);
  }

  console.log('\n══ MIS ═════════════════════════════════════════');
  const mis = await req('GET', '/api/analytics/mis');
  if (mis.body && !mis.body.error) {
    console.log(`    ownerSummary rows: ${mis.body.ownerSummary?.length}`);
    console.log(`    byOwnerLandlord rows: ${mis.body.byOwnerLandlord?.length}`);
    console.log(`    employeeMasterEnhanced rows: ${mis.body.employeeMasterEnhanced?.length}`);
  }

  console.log('\n══════════════════════════════════════════════════');
  console.log(`  Passed: ${passed}  |  Failed: ${failed}`);
  console.log('══════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error('Test runner error:', err.message); process.exit(1); });
