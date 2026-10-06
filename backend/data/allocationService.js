/**
 * Room / bed structure and allocation service.
 *
 * Structure: residence (building) → floor → room → bed.
 *   • room_master holds the room, its floor and capacity.
 *   • A room's capacity is always the number of active beds in it; changing the
 *     capacity adds beds or removes vacant ones.
 *
 * Allocation: an employee occupies one bed. Allocate / transfer / vacate run in a
 * single transaction, record who did it, and keep the employee record in sync
 * (room number, floor and the residence's active agreement).
 */
const pool = require('./db');

const today = () => new Date().toISOString().split('T')[0];

const roomIdFor = (residenceId, roomNumber) => `${residenceId}::${roomNumber}`;
const bedIdFor = (residenceId, roomNumber, label) =>
  `${residenceId}-R${String(roomNumber).padStart(2, '0')}-${label}`;

class AllocationError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') {
      // Unique index on active allocations — someone else allocated in parallel.
      throw new AllocationError('This bed or employee already has an active allocation. Refresh and try again.', 409);
    }
    throw err;
  } finally {
    client.release();
  }
}

// ── Structure ────────────────────────────────────────────────────────────────

/** Make sure a room row exists for (residence, room) and its capacity matches its active beds. */
async function syncRoom(client, residenceId, roomNumber, floorNumber) {
  await client.query(`
    INSERT INTO room_master (room_id, residence_id, room_number, floor_number, capacity)
    VALUES ($1, $2, $3, $4, 0)
    ON CONFLICT (residence_id, room_number) DO NOTHING
  `, [roomIdFor(residenceId, roomNumber), residenceId, String(roomNumber), floorNumber || null]);
  await client.query(`
    UPDATE room_master SET
      capacity = (SELECT COUNT(*) FROM bed_master b
                  WHERE b.residence_id = room_master.residence_id
                    AND b.room_number  = room_master.room_number
                    AND b.is_active),
      updated_at = NOW()
    WHERE residence_id = $1 AND room_number = $2
  `, [residenceId, String(roomNumber)]);
}

async function getRoom(client, roomId) {
  const { rows } = await client.query('SELECT * FROM room_master WHERE room_id = $1', [roomId]);
  if (!rows.length) throw new AllocationError('Room not found', 404);
  return rows[0];
}

async function roomBeds(client, room) {
  const { rows } = await client.query(`
    SELECT b.*, a.alloc_id, a.employee_id
    FROM bed_master b
    LEFT JOIN bed_allocations a ON a.bed_id = b.bed_id AND a.is_active
    WHERE b.residence_id = $1 AND b.room_number = $2
    ORDER BY LENGTH(b.bed_label), b.bed_label
  `, [room.residence_id, room.room_number]);
  return rows;
}

function nextBedLabels(existingLabels, count) {
  const used = new Set(existingLabels);
  const labels = [];
  for (let i = 1; labels.length < count; i++) {
    const l = `B${i}`;
    if (!used.has(l)) labels.push(l);
  }
  return labels;
}

async function createRoom({ residence_id, floor_number, room_number, room_type, capacity, notes }) {
  if (!residence_id || !room_number) throw new AllocationError('Residence and room number are required');
  const cap = parseInt(capacity, 10);
  if (!Number.isInteger(cap) || cap < 1 || cap > 50) throw new AllocationError('Capacity must be between 1 and 50 beds');
  const roomNumber = String(room_number).trim();

  return withTransaction(async (client) => {
    const res = await client.query('SELECT residence_status FROM residence_master WHERE residence_id = $1', [residence_id]);
    if (!res.rows.length) throw new AllocationError('Residence not found', 404);

    const dup = await client.query('SELECT 1 FROM room_master WHERE residence_id = $1 AND room_number = $2', [residence_id, roomNumber]);
    if (dup.rows.length) throw new AllocationError(`Room ${roomNumber} already exists in this residence`);

    await client.query(`
      INSERT INTO room_master (room_id, residence_id, floor_number, room_number, room_type, capacity, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [roomIdFor(residence_id, roomNumber), residence_id, floor_number || null, roomNumber, room_type || 'Shared', cap, notes || null]);

    for (const label of nextBedLabels([], cap)) {
      await client.query(`
        INSERT INTO bed_master (bed_id, residence_id, room_number, bed_label, floor_number, is_active)
        VALUES ($1, $2, $3, $4, $5, true)
        ON CONFLICT (bed_id) DO UPDATE SET is_active = true, room_number = EXCLUDED.room_number, floor_number = EXCLUDED.floor_number
      `, [bedIdFor(residence_id, roomNumber, label), residence_id, roomNumber, label, floor_number || null]);
    }
    await syncRoom(client, residence_id, roomNumber, floor_number);
    return getRoom(client, roomIdFor(residence_id, roomNumber));
  });
}

async function updateRoom(roomId, { floor_number, room_type, capacity, notes, is_active }) {
  return withTransaction(async (client) => {
    const room = await getRoom(client, roomId);
    const beds = await roomBeds(client, room);
    const activeBeds = beds.filter(b => b.is_active);
    const occupied = activeBeds.filter(b => b.alloc_id);

    if (is_active === false && occupied.length) {
      throw new AllocationError(`Room has ${occupied.length} occupant(s) — vacate or transfer them before deactivating`);
    }

    if (capacity !== undefined && capacity !== null && capacity !== '') {
      const cap = parseInt(capacity, 10);
      if (!Number.isInteger(cap) || cap < 1 || cap > 50) throw new AllocationError('Capacity must be between 1 and 50 beds');
      if (cap < occupied.length) {
        throw new AllocationError(`Room has ${occupied.length} occupant(s); capacity cannot be lower than that`);
      }
      if (cap > activeBeds.length) {
        // Re-activate inactive beds first, then add new ones.
        let toAdd = cap - activeBeds.length;
        for (const b of beds.filter(x => !x.is_active)) {
          if (!toAdd) break;
          await client.query('UPDATE bed_master SET is_active = true, updated_at = NOW() WHERE bed_id = $1', [b.bed_id]);
          toAdd--;
        }
        const newLabels = nextBedLabels(beds.map(b => b.bed_label), toAdd);
        for (const label of newLabels) {
          await client.query(`
            INSERT INTO bed_master (bed_id, residence_id, room_number, bed_label, floor_number, is_active)
            VALUES ($1, $2, $3, $4, $5, true)
          `, [bedIdFor(room.residence_id, room.room_number, label), room.residence_id, room.room_number, label, floor_number ?? room.floor_number]);
        }
      } else if (cap < activeBeds.length) {
        // Remove vacant beds, highest label first. Beds with history are deactivated, others deleted.
        let toRemove = activeBeds.length - cap;
        const vacant = activeBeds.filter(b => !b.alloc_id).reverse();
        for (const b of vacant) {
          if (!toRemove) break;
          const hist = await client.query('SELECT 1 FROM bed_allocations WHERE bed_id = $1 LIMIT 1', [b.bed_id]);
          if (hist.rows.length) await client.query('UPDATE bed_master SET is_active = false, updated_at = NOW() WHERE bed_id = $1', [b.bed_id]);
          else await client.query('DELETE FROM bed_master WHERE bed_id = $1', [b.bed_id]);
          toRemove--;
        }
      }
    }

    const sets = [];
    const params = [roomId];
    const add = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
    if (floor_number !== undefined) add('floor_number', floor_number || null);
    if (room_type !== undefined)    add('room_type', room_type || 'Shared');
    if (notes !== undefined)        add('notes', notes || null);
    if (is_active !== undefined)    add('is_active', !!is_active);
    if (sets.length) {
      await client.query(`UPDATE room_master SET ${sets.join(', ')}, updated_at = NOW() WHERE room_id = $1`, params);
    }
    if (floor_number !== undefined) {
      await client.query('UPDATE bed_master SET floor_number = $3, updated_at = NOW() WHERE residence_id = $1 AND room_number = $2',
        [room.residence_id, room.room_number, floor_number || null]);
      await client.query(`
        UPDATE employee_master e SET employee_floor = $3, updated_at = NOW()
        FROM bed_allocations a JOIN bed_master b ON b.bed_id = a.bed_id
        WHERE a.is_active AND a.employee_id = e.employee_id AND b.residence_id = $1 AND b.room_number = $2
      `, [room.residence_id, room.room_number, floor_number || null]);
    }
    await syncRoom(client, room.residence_id, room.room_number);
    return getRoom(client, roomId);
  });
}

async function deleteRoom(roomId) {
  return withTransaction(async (client) => {
    const room = await getRoom(client, roomId);
    const beds = await roomBeds(client, room);
    if (beds.some(b => b.alloc_id)) throw new AllocationError('Room is occupied — vacate or transfer occupants first');
    const hist = await client.query(`
      SELECT 1 FROM bed_allocations a JOIN bed_master b ON b.bed_id = a.bed_id
      WHERE b.residence_id = $1 AND b.room_number = $2 LIMIT 1
    `, [room.residence_id, room.room_number]);
    if (hist.rows.length) {
      // Keep allocation history intact — deactivate instead of deleting.
      await client.query('UPDATE bed_master SET is_active = false, updated_at = NOW() WHERE residence_id = $1 AND room_number = $2', [room.residence_id, room.room_number]);
      await client.query('UPDATE room_master SET is_active = false, capacity = 0, updated_at = NOW() WHERE room_id = $1', [roomId]);
      return { ...room, is_active: false, deactivated: true };
    }
    await client.query('DELETE FROM bed_master WHERE residence_id = $1 AND room_number = $2', [room.residence_id, room.room_number]);
    await client.query('DELETE FROM room_master WHERE room_id = $1', [roomId]);
    return { ...room, deleted: true };
  });
}

// ── Allocation ───────────────────────────────────────────────────────────────

async function lockEmployee(client, employeeId) {
  const { rows } = await client.query('SELECT * FROM employee_master WHERE employee_id = $1 FOR UPDATE', [employeeId]);
  if (!rows.length) throw new AllocationError(`Employee ${employeeId} not found`, 404);
  return rows[0];
}

async function resolveTargetBed(client, { bed_id, room_id }) {
  if (bed_id) {
    const { rows } = await client.query(`
      SELECT b.*, r.residence_status, rm.is_active AS room_active
      FROM bed_master b
      JOIN residence_master r ON r.residence_id = b.residence_id
      LEFT JOIN room_master rm ON rm.residence_id = b.residence_id AND rm.room_number = b.room_number
      WHERE b.bed_id = $1 FOR UPDATE OF b
    `, [bed_id]);
    if (!rows.length) throw new AllocationError(`Bed ${bed_id} not found`, 404);
    const bed = rows[0];
    if (!bed.is_active || bed.room_active === false) throw new AllocationError(`Bed ${bed_id} is not in use`);
    if (String(bed.residence_status || '').toLowerCase() === 'inactive') throw new AllocationError('Residence is inactive');
    const occ = await client.query(`
      SELECT a.employee_id, e.employee_first_name, e.employee_last_name
      FROM bed_allocations a LEFT JOIN employee_master e ON e.employee_id = a.employee_id
      WHERE a.bed_id = $1 AND a.is_active
    `, [bed_id]);
    if (occ.rows.length) {
      const o = occ.rows[0];
      const name = [o.employee_first_name, o.employee_last_name].filter(Boolean).join(' ') || o.employee_id;
      throw new AllocationError(`Bed ${bed.bed_label} is already occupied by ${name}`);
    }
    return bed;
  }
  if (room_id) {
    const room = await getRoom(client, room_id);
    if (!room.is_active) throw new AllocationError('Room is not in use');
    const res = await client.query('SELECT residence_status FROM residence_master WHERE residence_id = $1', [room.residence_id]);
    if (String(res.rows[0]?.residence_status || '').toLowerCase() === 'inactive') throw new AllocationError('Residence is inactive');
    const { rows } = await client.query(`
      SELECT b.* FROM bed_master b
      WHERE b.residence_id = $1 AND b.room_number = $2 AND b.is_active
        AND NOT EXISTS (SELECT 1 FROM bed_allocations a WHERE a.bed_id = b.bed_id AND a.is_active)
      ORDER BY LENGTH(b.bed_label), b.bed_label
      LIMIT 1 FOR UPDATE OF b
    `, [room.residence_id, room.room_number]);
    if (!rows.length) throw new AllocationError(`Room ${room.room_number} is full (capacity ${room.capacity})`);
    return rows[0];
  }
  throw new AllocationError('Choose a room or a bed');
}

/** Point the employee record at the residence/room they now occupy. */
async function syncEmployeeToBed(client, employeeId, bed) {
  const ag = await client.query(`
    SELECT agreement_id FROM agreement_master
    WHERE agreement_residence_id = $1 AND LOWER(COALESCE(agreement_status, 'active')) <> 'inactive'
    ORDER BY created_at ASC LIMIT 1
  `, [bed.residence_id]);
  await client.query(`
    UPDATE employee_master SET
      employee_room_number = $2,
      employee_floor = $3,
      emplyee_allocated_agreement_id = COALESCE($4, emplyee_allocated_agreement_id),
      updated_at = NOW()
    WHERE employee_id = $1
  `, [employeeId, bed.room_number, bed.floor_number || null, ag.rows[0]?.agreement_id || null]);
}

async function allocate({ employee_id, bed_id, room_id, allocated_date, release_date, notes, user }) {
  if (!employee_id) throw new AllocationError('employee_id is required');
  return withTransaction(async (client) => {
    const emp = await lockEmployee(client, employee_id);
    if (String(emp.employee_status || '').toUpperCase() === 'INACTIVE') throw new AllocationError('Employee is inactive');
    const current = await client.query('SELECT bed_id FROM bed_allocations WHERE employee_id = $1 AND is_active', [employee_id]);
    if (current.rows.length) {
      throw new AllocationError(`Employee is already allocated to bed ${current.rows[0].bed_id}. Use Transfer to move them.`);
    }
    const bed = await resolveTargetBed(client, { bed_id, room_id });
    const effectiveRelease = release_date || (emp.employee_last_working_date ? String(emp.employee_last_working_date).split('T')[0] : null);
    const { rows } = await client.query(`
      INSERT INTO bed_allocations (bed_id, employee_id, allocated_date, release_date, notes, movement_type, allocated_by)
      VALUES ($1, $2, $3, $4, $5, 'ALLOCATE', $6)
      RETURNING *
    `, [bed.bed_id, employee_id, allocated_date || today(), effectiveRelease, notes || null, user || null]);
    await syncEmployeeToBed(client, employee_id, bed);
    return { ...rows[0], room_number: bed.room_number, residence_id: bed.residence_id, bed_label: bed.bed_label };
  });
}

async function transfer({ employee_id, bed_id, room_id, transfer_date, reason, user }) {
  if (!employee_id) throw new AllocationError('employee_id is required');
  if (!reason) throw new AllocationError('A reason is required for a transfer');
  return withTransaction(async (client) => {
    const emp = await lockEmployee(client, employee_id);
    if (String(emp.employee_status || '').toUpperCase() === 'INACTIVE') throw new AllocationError('Employee is inactive');
    const cur = await client.query(`
      SELECT a.*, b.residence_id, b.room_number FROM bed_allocations a
      JOIN bed_master b ON b.bed_id = a.bed_id
      WHERE a.employee_id = $1 AND a.is_active FOR UPDATE OF a
    `, [employee_id]);
    if (!cur.rows.length) throw new AllocationError('Employee has no current room — use Allocate instead');
    const from = cur.rows[0];
    if ((bed_id && bed_id === from.bed_id) || (room_id && room_id === roomIdFor(from.residence_id, from.room_number) && !bed_id)) {
      throw new AllocationError('Employee is already in that room');
    }
    const date = transfer_date || today();
    await client.query(`
      UPDATE bed_allocations SET is_active = false, release_date = $2, release_reason = $3,
             released_by = $4, updated_at = NOW()
      WHERE alloc_id = $1
    `, [from.alloc_id, date, `Transferred: ${reason}`, user || null]);
    const bed = await resolveTargetBed(client, { bed_id, room_id });
    const { rows } = await client.query(`
      INSERT INTO bed_allocations (bed_id, employee_id, allocated_date, release_date, notes, movement_type,
                                   transferred_from_alloc_id, allocated_by)
      VALUES ($1, $2, $3, $4, $5, 'TRANSFER', $6, $7)
      RETURNING *
    `, [bed.bed_id, employee_id, date, from.release_date && from.release_date > date ? from.release_date : null,
        reason, from.alloc_id, user || null]);
    await syncEmployeeToBed(client, employee_id, bed);
    return { ...rows[0], from_bed_id: from.bed_id, room_number: bed.room_number, residence_id: bed.residence_id };
  });
}

/** Vacate: release the employee's bed. Pass alloc_id or employee_id. */
async function vacate({ alloc_id, employee_id, release_date, reason, user }) {
  return withTransaction(async (client) => {
    const q = alloc_id
      ? await client.query('SELECT * FROM bed_allocations WHERE alloc_id = $1 FOR UPDATE', [alloc_id])
      : await client.query('SELECT * FROM bed_allocations WHERE employee_id = $1 AND is_active FOR UPDATE', [employee_id]);
    if (!q.rows.length) throw new AllocationError('No active allocation found', 404);
    const alloc = q.rows[0];
    if (!alloc.is_active) throw new AllocationError('This allocation has already been released');
    const { rows } = await client.query(`
      UPDATE bed_allocations SET is_active = false,
             release_date = COALESCE($2, CURRENT_DATE), release_reason = $3, released_by = $4, updated_at = NOW()
      WHERE alloc_id = $1 RETURNING *
    `, [alloc.alloc_id, release_date || null, reason || 'Vacated', user || null]);
    // Employee no longer has a room. Keep the agreement link for inactive employees (history).
    await client.query(`
      UPDATE employee_master SET
        employee_room_number = NULL,
        employee_floor = NULL,
        emplyee_allocated_agreement_id = CASE WHEN UPPER(COALESCE(employee_status, 'ACTIVE')) = 'INACTIVE'
                                              THEN emplyee_allocated_agreement_id ELSE NULL END,
        updated_at = NOW()
      WHERE employee_id = $1
    `, [alloc.employee_id]);
    return rows[0];
  });
}

/** Movement history for an employee or a residence (newest first). */
async function history({ employee_id, residence_id, limit = 200 }) {
  const where = [];
  const params = [];
  if (employee_id)  { params.push(employee_id);  where.push(`a.employee_id = $${params.length}`); }
  if (residence_id) { params.push(residence_id); where.push(`b.residence_id = $${params.length}`); }
  params.push(Math.min(parseInt(limit, 10) || 200, 1000));
  const { rows } = await pool.query(`
    SELECT a.alloc_id, a.employee_id, a.bed_id, a.allocated_date, a.release_date, a.release_reason,
           a.is_active, a.movement_type, a.transferred_from_alloc_id, a.allocated_by, a.released_by, a.notes,
           b.residence_id, b.room_number, b.bed_label, b.floor_number,
           e.employee_first_name, e.employee_last_name, e.employee_department
    FROM bed_allocations a
    JOIN bed_master b ON b.bed_id = a.bed_id
    LEFT JOIN employee_master e ON e.employee_id = a.employee_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY a.created_at DESC, a.alloc_id DESC
    LIMIT $${params.length}
  `, params);
  return rows;
}

module.exports = {
  AllocationError, syncRoom, roomIdFor, bedIdFor,
  createRoom, updateRoom, deleteRoom,
  allocate, transfer, vacate, history,
};
