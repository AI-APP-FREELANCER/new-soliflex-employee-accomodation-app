/**
 * Bed Management Routes
 * Handles bed CRUD, allocation, and release at the individual bed level.
 */
const express = require('express');
const router  = express.Router();
const { authenticateToken } = require('../middleware/auth');
const db = require('../data/excelReader');

router.use(authenticateToken);

// ── GET /api/beds?residenceId=X  ───────────────────────────────────────────
// Returns all beds, optionally filtered by residence. Includes active allocation info.
router.get('/', async (req, res) => {
  try {
    const { residenceId } = req.query;
    const beds = await db.getBeds(residenceId || null);

    // Enrich with active allocation
    const activeAllocs = await db.getBedAllocations({ residence_id: residenceId || undefined, active_only: true });
    const allocByBed = {};
    activeAllocs.forEach(a => { allocByBed[a.bed_id] = a; });

    const enriched = beds.map(b => ({
      ...b,
      is_occupied: !!allocByBed[b.bed_id],
      current_allocation: allocByBed[b.bed_id] || null,
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/beds  ────────────────────────────────────────────────────────
// Create one or more beds (bulk creation for a room).
// Body: { residence_id, room_number, beds: [{ bed_label, bed_type, notes }] }
// OR single: { bed_id, residence_id, room_number, bed_label, bed_type, notes }
router.post('/', async (req, res) => {
  try {
    const body = req.body;

    if (Array.isArray(body.beds)) {
      // Bulk: create beds for a room
      const results = [];
      for (const b of body.beds) {
        const bedId = `${body.residence_id}-R${String(body.room_number).padStart(2,'0')}-${b.bed_label}`;
        const created = await db.addBed({
          bed_id: bedId,
          residence_id: body.residence_id,
          room_number:  String(body.room_number),
          bed_label:    b.bed_label,
          bed_type:     b.bed_type || 'Standard',
          notes:        b.notes || null,
        });
        if (created) results.push(created);
      }
      return res.json(results);
    }

    // Single bed
    if (!body.bed_id) {
      body.bed_id = `${body.residence_id}-R${String(body.room_number).padStart(2,'0')}-${body.bed_label}`;
    }
    const created = await db.addBed(body);
    res.json(created);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── PUT /api/beds/:bedId  ──────────────────────────────────────────────────
router.put('/:bedId', async (req, res) => {
  try {
    const updated = await db.updateBed(req.params.bedId, req.body);
    if (!updated) return res.status(404).json({ error: 'Bed not found' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── DELETE /api/beds/:bedId  ───────────────────────────────────────────────
router.delete('/:bedId', async (req, res) => {
  try {
    const deleted = await db.deleteBed(req.params.bedId);
    if (!deleted) return res.status(404).json({ error: 'Bed not found' });
    res.json({ success: true, deleted });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── GET /api/beds/allocations  ─────────────────────────────────────────────
// List allocations: ?residenceId=X  &activeOnly=true  &employeeId=X
router.get('/allocations', async (req, res) => {
  try {
    const filters = {};
    if (req.query.residenceId) filters.residence_id = req.query.residenceId;
    if (req.query.employeeId)  filters.employee_id  = req.query.employeeId;
    if (req.query.bedId)       filters.bed_id       = req.query.bedId;
    if (req.query.activeOnly === 'true') filters.active_only = true;
    const allocs = await db.getBedAllocations(filters);
    res.json(allocs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/beds/:bedId/allocate  ────────────────────────────────────────
// Allocate a bed to an employee.
// Body: { employee_id, allocated_date?, release_date?, notes? }
router.post('/:bedId/allocate', async (req, res) => {
  try {
    const { employee_id, allocated_date, release_date, notes } = req.body;
    if (!employee_id) return res.status(400).json({ error: 'employee_id is required' });
    const alloc = await db.allocateBed(req.params.bedId, employee_id, allocated_date, release_date, notes);
    res.json(alloc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── PUT /api/beds/allocations/:allocId/release  ────────────────────────────
// Release an allocation.
// Body: { release_date?, release_reason? }
router.put('/allocations/:allocId/release', async (req, res) => {
  try {
    const { release_date, release_reason } = req.body;
    const updated = await db.releaseBed(Number(req.params.allocId), release_date, release_reason);
    if (!updated) return res.status(404).json({ error: 'Allocation not found' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── PUT /api/beds/allocations/:allocId  ───────────────────────────────────
// Manually adjust allocation dates / notes (HR override).
// Body: { allocated_date?, release_date?, notes?, release_reason? }
router.put('/allocations/:allocId', async (req, res) => {
  try {
    const updated = await db.updateBedAllocation(Number(req.params.allocId), req.body);
    if (!updated) return res.status(404).json({ error: 'Allocation not found' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
