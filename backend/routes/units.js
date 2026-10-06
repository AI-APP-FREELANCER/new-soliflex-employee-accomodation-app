/**
 * Unit master — the single list of units every HR team picks from, so agreements,
 * dashboards and reports group the same unit the same way.
 *
 *   GET  /api/units           units with usage counts + unit values on agreements that match no unit
 *   POST /api/units           add a unit
 *   PUT  /api/units/:id       rename / change code / activate-deactivate (agreements follow the standard name)
 *   POST /api/units/:id/map   move agreements typed as a non-standard value onto this unit
 */
const express = require('express');
const router  = express.Router();
const { authenticateToken } = require('../middleware/auth');
const pool = require('../data/db');

router.use(authenticateToken);

const clean = (v) => String(v || '').trim().replace(/\s+/g, ' ');

router.get('/', async (req, res) => {
  try {
    const [units, usage] = await Promise.all([
      pool.query('SELECT * FROM unit_master ORDER BY is_active DESC, unit_name'),
      pool.query(`
        SELECT LOWER(TRIM(agreement_employee_unit)) AS key,
               MIN(TRIM(agreement_employee_unit))   AS sample,
               ARRAY_AGG(DISTINCT agreement_employee_unit) AS spellings,
               COUNT(*) AS agreements,
               COUNT(*) FILTER (WHERE LOWER(COALESCE(agreement_status, 'active')) <> 'inactive') AS active_agreements
        FROM agreement_master
        WHERE TRIM(COALESCE(agreement_employee_unit, '')) <> ''
        GROUP BY LOWER(TRIM(agreement_employee_unit))
      `),
    ]);
    const byKey = {};
    usage.rows.forEach(u => { byKey[u.key] = u; });
    const known = new Set();
    const rows = units.rows.map(u => {
      const key = u.unit_name.trim().toLowerCase();
      known.add(key);
      const use = byKey[key];
      return {
        ...u,
        agreements: Number(use?.agreements || 0),
        active_agreements: Number(use?.active_agreements || 0),
        spellings: use?.spellings || [],
      };
    });
    const unmatched = usage.rows
      .filter(u => !known.has(u.key))
      .map(u => ({ value: u.sample, spellings: u.spellings, agreements: Number(u.agreements) }));
    const noUnit = await pool.query(`
      SELECT COUNT(*) AS n FROM agreement_master
      WHERE TRIM(COALESCE(agreement_employee_unit, '')) = '' AND LOWER(COALESCE(agreement_status, 'active')) <> 'inactive'
    `);
    res.json({ units: rows, unmatched, activeAgreementsWithoutUnit: Number(noUnit.rows[0].n) });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const name = clean(req.body.unit_name);
    if (!name) return res.status(400).json({ error: 'Unit name is required' });
    const { rows } = await pool.query(
      'INSERT INTO unit_master (unit_name, unit_code) VALUES ($1, $2) RETURNING *',
      [name, clean(req.body.unit_code) || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'A unit with this name already exists' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query('SELECT * FROM unit_master WHERE unit_id = $1 FOR UPDATE', [req.params.id]);
    if (!cur.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Unit not found' }); }
    const unit = cur.rows[0];
    const name = req.body.unit_name !== undefined ? clean(req.body.unit_name) : unit.unit_name;
    if (!name) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Unit name is required' }); }
    const { rows } = await client.query(`
      UPDATE unit_master SET unit_name = $2, unit_code = $3, is_active = $4 WHERE unit_id = $1 RETURNING *
    `, [unit.unit_id, name,
        req.body.unit_code !== undefined ? (clean(req.body.unit_code) || null) : unit.unit_code,
        req.body.is_active !== undefined ? !!req.body.is_active : unit.is_active]);
    // Point agreements typed with the old name (any spelling/case) at the standard name.
    await client.query(`
      UPDATE agreement_master SET agreement_employee_unit = $2, updated_at = NOW()
      WHERE LOWER(TRIM(agreement_employee_unit)) = LOWER(TRIM($1)) AND agreement_employee_unit <> $2
    `, [unit.unit_name, name]);
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return res.status(400).json({ error: 'A unit with this name already exists' });
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

router.post('/:id/map', async (req, res) => {
  try {
    const from = clean(req.body.from_value);
    if (!from) return res.status(400).json({ error: 'from_value is required' });
    const unit = await pool.query('SELECT * FROM unit_master WHERE unit_id = $1', [req.params.id]);
    if (!unit.rows.length) return res.status(404).json({ error: 'Unit not found' });
    const upd = await pool.query(`
      UPDATE agreement_master SET agreement_employee_unit = $2, updated_at = NOW()
      WHERE LOWER(TRIM(agreement_employee_unit)) = LOWER($1)
    `, [from, unit.rows[0].unit_name]);
    res.json({ updated: upd.rowCount, unit: unit.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
