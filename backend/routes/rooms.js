/**
 * Room structure & room-level allocation routes.
 *
 *   GET    /api/rooms/structure/:residenceId   building → floor → room → bed → employee
 *   GET    /api/rooms/vacancy                   every room with capacity / occupied / vacant
 *   POST   /api/rooms                           create a room (creates `capacity` beds)
 *   PUT    /api/rooms/:roomId                   edit floor / type / capacity / active
 *   DELETE /api/rooms/:roomId                   delete (or deactivate if it has history)
 *   POST   /api/rooms/allocate                  allocate an employee to a room or bed
 *   POST   /api/rooms/transfer                  move an employee to another room or bed
 *   POST   /api/rooms/vacate                    release an employee's bed
 *   GET    /api/rooms/history                   allocation / transfer / vacate history
 */
const express = require('express');
const router  = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { loadSnapshot } = require('../data/accommodationSnapshot');
const svc = require('../data/allocationService');

router.use(authenticateToken);

const fail = (res, err) => {
  if (err instanceof svc.AllocationError) return res.status(err.status).json({ error: err.message });
  if (process.env.NODE_ENV === 'development') console.error('Rooms route error:', err.message);
  return res.status(500).json({ error: 'Internal server error' });
};

const userOf = (req) => req.user?.username || null;

router.get('/structure/:residenceId', async (req, res) => {
  try {
    const snap = await loadSnapshot();
    const stats = snap.residenceStats[req.params.residenceId];
    if (!stats) return res.status(404).json({ error: 'Residence not found' });
    const residence = snap.residenceById[req.params.residenceId];
    const agreement = stats.agreement_id ? snap.agreementById[stats.agreement_id] : null;
    res.json({
      ...stats,
      residence,
      agreement: agreement ? {
        agreement_id: agreement.agreement_id,
        unit: snap.unitName(agreement.agreement_employee_unit),
        monthly_rent: agreement.agreement_monthly_rent_amount,
        renewal_due_date: agreement.agreement_renewal_due_date,
        scheduled_to_vacate: agreement.agreement_scheduled_to_vacate,
        vacate_date: agreement.agreement_vacate_date,
      } : null,
    });
  } catch (err) { fail(res, err); }
});

router.get('/vacancy', async (req, res) => {
  try {
    const snap = await loadSnapshot();
    const { unit, residenceId, onlyVacant } = req.query;
    const rows = [];
    Object.values(snap.residenceStats).forEach(r => {
      if (r.status !== 'active') return;
      if (residenceId && r.residence_id !== residenceId) return;
      if (unit && r.unit !== unit) return;
      r.rooms.filter(x => x.countable).forEach(room => {
        if (onlyVacant === 'true' && room.vacant === 0) return;
        rows.push({
          room_id: room.room_id,
          residence_id: r.residence_id,
          residence: r.name,
          unit: r.unit,
          floor_number: room.floor_number,
          room_number: room.room_number,
          room_type: room.room_type,
          capacity: room.capacity,
          occupied: room.occupied,
          vacant: room.vacant,
          occupancyPct: room.occupancyPct,
          status: room.status,
        });
      });
    });
    res.json(rows);
  } catch (err) { fail(res, err); }
});

router.get('/history', async (req, res) => {
  try {
    res.json(await svc.history({
      employee_id: req.query.employeeId,
      residence_id: req.query.residenceId,
      limit: req.query.limit,
    }));
  } catch (err) { fail(res, err); }
});

router.post('/', async (req, res) => {
  try { res.status(201).json(await svc.createRoom(req.body)); }
  catch (err) { fail(res, err); }
});

router.put('/:roomId', async (req, res) => {
  try { res.json(await svc.updateRoom(req.params.roomId, req.body)); }
  catch (err) { fail(res, err); }
});

router.delete('/:roomId', async (req, res) => {
  try { res.json(await svc.deleteRoom(req.params.roomId)); }
  catch (err) { fail(res, err); }
});

router.post('/allocate', async (req, res) => {
  try { res.json(await svc.allocate({ ...req.body, user: userOf(req) })); }
  catch (err) { fail(res, err); }
});

router.post('/transfer', async (req, res) => {
  try { res.json(await svc.transfer({ ...req.body, user: userOf(req) })); }
  catch (err) { fail(res, err); }
});

router.post('/vacate', async (req, res) => {
  try { res.json(await svc.vacate({ ...req.body, user: userOf(req) })); }
  catch (err) { fail(res, err); }
});

module.exports = router;
