/**
 * Accommodation snapshot — the single source of truth for occupancy, allocation
 * and advance-refund figures. The dashboard (/analytics and /analytics/mis),
 * the residence structure view and alerts all use these calculations, so
 * every screen reports the same numbers.
 *
 * Definitions
 * ───────────
 * • Capacity      = active beds in active rooms of active residences.
 * • Occupied bed  = bed with an active allocation.
 * • Occupancy %   = occupied beds ÷ capacity (room, residence, unit and overall).
 * • Employee allocation (active employees only):
 *     ROOM            — holds an active bed allocation (room-level allocation done)
 *     RESIDENCE_ONLY  — linked to an active agreement but no room/bed assigned yet
 *     UNALLOCATED     — neither
 * • Rent share    = an agreement's monthly rent split equally across its occupants,
 *                   so department/designation totals add up to the real rent bill.
 * • Advance refund (per agreement):
 *     due back    = agreement_advance_due_back, or the advance amount if not set
 *     deductions  = agreement_maintenance_cut (electricity + water + other)
 *     expected    = due back − deductions
 *     received    = sum of refund receipts
 *     outstanding = expected − received (never negative)
 *   Refunds are only "pending" once the agreement is inactive (vacated); agreements
 *   scheduled to vacate are "upcoming". Active agreements are just "locked".
 */
const pool = require('./db');
const excelReader = require('./excelReader');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

const num = (v) => {
  if (v === undefined || v === null || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/[^\d.-]/g, ''));
  return isNaN(n) ? 0 : n;
};

const isActiveStatus = (s) => String(s || '').trim().toLowerCase() !== 'inactive';
const isEmployeeActive = (e) => String(e.employee_status || '').trim().toUpperCase() !== 'INACTIVE';
const isScheduledToVacate = (a) =>
  a.agreement_scheduled_to_vacate === true || ['yes', 'true'].includes(String(a.agreement_scheduled_to_vacate).toLowerCase());

const employeeName = (e) =>
  [e.employee_first_name, e.employee_last_name, e.employee_sir_name].filter(Boolean).join(' ').trim() || e.employee_id;

const residenceLabel = (r) =>
  r ? (r.residence_door_number ? `${r.residence_door_number}, ${r.residence_address_line_1 || ''}`.replace(/, $/, '') : r.residence_id) : '—';

// Units are typed free-text on agreements; compare them case/space-insensitively
// and report them under the standard name from unit_master.
const unitKey = (u) => String(u || '').trim().toLowerCase();

// Order floors naturally: basement, ground, 1st, 2nd … then anything else alphabetically.
function floorRank(f) {
  const v = String(f || '').trim().toLowerCase();
  if (!v || v === 'unspecified floor') return [99, v];
  if (/^(b|basement|cellar|lower)/.test(v)) return [-1, v];
  if (/^(g|gf|ground)/.test(v)) return [0, v];
  const n = v.match(/\d+/);
  return n ? [parseInt(n[0], 10), v] : [50, v];
}
const byFloor = (a, b) => {
  const [ra, va] = floorRank(a), [rb, vb] = floorRank(b);
  return ra - rb || va.localeCompare(vb);
};
const byRoomNumber = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

/** Refund position for one agreement. */
function refundPosition(a, receivedFromReceipts, today) {
  const inactive  = !isActiveStatus(a.agreement_status);
  const vacating  = !inactive && isScheduledToVacate(a);
  const advance   = num(a.agreement_advance_amount);
  const dueBack   = num(a.agreement_advance_due_back) > 0 ? num(a.agreement_advance_due_back) : advance;
  const deductions = num(a.agreement_maintenance_cut);
  const expected  = Math.max(0, dueBack - deductions);
  const received  = receivedFromReceipts != null ? receivedFromReceipts : num(a.agreement_advance_received);
  const outstanding = Math.max(0, expected - received);

  let stage;
  if (!inactive && !vacating)              stage = 'Locked';
  else if (vacating)                       stage = 'Upcoming';
  else if (dueBack === 0)                  stage = 'No advance';
  else if (outstanding === 0)              stage = 'Settled';
  else if (a.agreement_refund_followup_date && dayjs(a.agreement_refund_followup_date).isBefore(today, 'day'))
                                           stage = 'Follow-up overdue';
  else if (received > 0)                   stage = 'Partially received';
  else if (a.agreement_refund_requested_date) stage = 'Requested';
  else                                     stage = 'Pending';

  return {
    advance, dueBack, deductions, expected, received, outstanding, stage,
    isRefundCase: inactive || vacating,
    deductionBreakdown: {
      electricity: num(a.agreement_deduction_electricity),
      water:       num(a.agreement_deduction_water),
      other:       num(a.agreement_deduction_other),
    },
  };
}

async function loadSnapshot() {
  const today = dayjs.tz(dayjs(), 'Asia/Kolkata').startOf('day');

  const [residences, agreements, employees, roomRes, bedRes, allocRes, receiptRes, unitRes] = await Promise.all([
    excelReader.getResidences('all'),
    excelReader.getAgreements('all'),
    excelReader.getEmployees('all'),
    pool.query('SELECT * FROM room_master ORDER BY residence_id, floor_number NULLS FIRST, room_number'),
    pool.query('SELECT * FROM bed_master ORDER BY residence_id, room_number, bed_label'),
    pool.query('SELECT * FROM bed_allocations WHERE is_active = true'),
    pool.query('SELECT agreement_id, SUM(amount) AS total, MAX(received_date) AS last_date FROM advance_refund_receipts GROUP BY agreement_id'),
    pool.query('SELECT * FROM unit_master ORDER BY unit_name'),
  ]);

  // ── Lookups ────────────────────────────────────────────────────────────────
  const residenceById = {};
  residences.forEach(r => { residenceById[r.residence_id] = r; });
  const employeeById = {};
  employees.forEach(e => { employeeById[e.employee_id] = e; });
  const agreementById = {};
  agreements.forEach(a => { agreementById[a.agreement_id] = a; });

  const unitNameByKey = {};
  unitRes.rows.forEach(u => { unitNameByKey[unitKey(u.unit_name)] = u.unit_name; });
  const unitName = (raw) => {
    const k = unitKey(raw);
    if (!k) return 'Unassigned';
    return unitNameByKey[k] || String(raw).trim();
  };

  const activeAgreementsByResidence = {};
  agreements.forEach(a => {
    if (!isActiveStatus(a.agreement_status)) return;
    (activeAgreementsByResidence[a.agreement_residence_id] ||= []).push(a);
  });
  const primaryAgreement = (residenceId) => (activeAgreementsByResidence[residenceId] || [])[0] || null;

  const receivedByAgreement = {};
  const lastReceiptByAgreement = {};
  receiptRes.rows.forEach(r => {
    receivedByAgreement[r.agreement_id] = num(r.total);
    lastReceiptByAgreement[r.agreement_id] = r.last_date;
  });

  const allocByBed = {};
  const allocByEmployee = {};
  allocRes.rows.forEach(a => {
    allocByBed[a.bed_id] = a;
    allocByEmployee[a.employee_id] = a;
  });

  // ── Building → floor → room → bed tree ────────────────────────────────────
  const roomsByResidence = {};
  const roomByKey = {};
  roomRes.rows.forEach(r => {
    const room = {
      room_id: r.room_id,
      residence_id: r.residence_id,
      floor_number: r.floor_number || '',
      room_number: r.room_number,
      room_type: r.room_type,
      is_active: r.is_active !== false,
      notes: r.notes,
      beds: [],
      capacity: 0, occupied: 0, vacant: 0, heldByInactive: 0,
    };
    (roomsByResidence[r.residence_id] ||= []).push(room);
    roomByKey[`${r.residence_id}::${r.room_number}`] = room;
  });

  const bedById = {};
  bedRes.rows.forEach(b => {
    let room = roomByKey[`${b.residence_id}::${b.room_number}`];
    if (!room) {
      // Bed without a room row (created before rooms existed) — show it anyway.
      room = {
        room_id: `${b.residence_id}::${b.room_number}`, residence_id: b.residence_id,
        floor_number: b.floor_number || '', room_number: b.room_number, room_type: 'Shared',
        is_active: true, notes: null, beds: [], capacity: 0, occupied: 0, vacant: 0, heldByInactive: 0,
      };
      (roomsByResidence[b.residence_id] ||= []).push(room);
      roomByKey[`${b.residence_id}::${b.room_number}`] = room;
    }
    const alloc = allocByBed[b.bed_id] || null;
    const emp = alloc ? employeeById[alloc.employee_id] : null;
    const bed = {
      bed_id: b.bed_id, bed_label: b.bed_label, bed_type: b.bed_type, is_active: b.is_active !== false,
      notes: b.notes,
      occupied: !!alloc,
      allocation: alloc ? {
        alloc_id: alloc.alloc_id,
        employee_id: alloc.employee_id,
        employee_name: emp ? employeeName(emp) : alloc.employee_id,
        department: emp?.employee_department || null,
        designation: emp?.employee_designation || null,
        employee_status: emp ? (isEmployeeActive(emp) ? 'Active' : 'Inactive') : 'Unknown',
        allocated_date: alloc.allocated_date,
        release_date: alloc.release_date,
        last_working_date: emp?.employee_last_working_date || null,
      } : null,
    };
    room.beds.push(bed);
    bedById[b.bed_id] = { bed, room };
  });

  // ── Roll up counts ────────────────────────────────────────────────────────
  const residenceStats = {};
  residences.forEach(r => {
    const resActive = isActiveStatus(r.residence_status);
    const rooms = (roomsByResidence[r.residence_id] || []);
    rooms.forEach(room => {
      const countable = resActive && room.is_active;
      room.capacity = 0; room.occupied = 0; room.heldByInactive = 0;
      room.beds.forEach(bed => {
        if (!bed.is_active) return;
        room.capacity++;
        if (bed.occupied) {
          room.occupied++;
          if (bed.allocation.employee_status !== 'Active') room.heldByInactive++;
        }
      });
      room.vacant = Math.max(0, room.capacity - room.occupied);
      room.occupancyPct = pct(room.occupied, room.capacity);
      room.status = room.capacity === 0 ? 'No beds'
        : room.occupied === 0 ? 'Vacant'
        : room.occupied >= room.capacity ? 'Full' : 'Partially occupied';
      room.countable = countable;
    });

    const countableRooms = rooms.filter(x => x.countable);
    const floors = {};
    rooms.forEach(room => {
      const f = room.floor_number || 'Unspecified floor';
      (floors[f] ||= { floor_number: f, rooms: [], capacity: 0, occupied: 0, vacant: 0 });
      floors[f].rooms.push(room);
      if (room.countable) {
        floors[f].capacity += room.capacity;
        floors[f].occupied += room.occupied;
        floors[f].vacant   += room.vacant;
      }
    });

    const ag = primaryAgreement(r.residence_id);
    const capacity = countableRooms.reduce((s, x) => s + x.capacity, 0);
    const occupied = countableRooms.reduce((s, x) => s + x.occupied, 0);
    residenceStats[r.residence_id] = {
      residence_id: r.residence_id,
      name: residenceLabel(r),
      address: [r.residence_address_line_1, r.residence_address_line_2].filter(Boolean).join(', '),
      owner: r.residence_owner_name,
      owner_contact: r.residence_owner_contact,
      owner_phone: r.residence_owner_phone,
      status: resActive ? 'active' : 'inactive',
      unit: ag ? unitName(ag.agreement_employee_unit) : 'Unassigned',
      agreement_id: ag?.agreement_id || null,
      monthly_rent: (activeAgreementsByResidence[r.residence_id] || []).reduce((s, a) => s + num(a.agreement_monthly_rent_amount), 0),
      structureConfigured: rooms.length > 0,
      floors: Object.values(floors)
        .sort((a, b) => byFloor(a.floor_number, b.floor_number))
        .map(f => ({ ...f, rooms: f.rooms.sort((a, b) => byRoomNumber(a.room_number, b.room_number)) })),
      rooms,
      totalRooms: countableRooms.length,
      capacity, occupied,
      vacant: Math.max(0, capacity - occupied),
      occupancyPct: pct(occupied, capacity),
      heldByInactive: countableRooms.reduce((s, x) => s + x.heldByInactive, 0),
      fullRooms: countableRooms.filter(x => x.status === 'Full').length,
      partialRooms: countableRooms.filter(x => x.status === 'Partially occupied').length,
      vacantRooms: countableRooms.filter(x => x.status === 'Vacant').length,
      residentsWithoutRoom: [],   // filled below
    };
  });

  // ── Employee allocation classification ────────────────────────────────────
  const employeeAllocation = {};   // employee_id → { type, residence_id, agreement_id, bed_id, room }
  employees.forEach(e => {
    const alloc = allocByEmployee[e.employee_id];
    if (alloc && bedById[alloc.bed_id]) {
      const { room } = bedById[alloc.bed_id];
      const ag = primaryAgreement(room.residence_id);
      employeeAllocation[e.employee_id] = {
        type: 'ROOM', residence_id: room.residence_id, agreement_id: ag?.agreement_id || null,
        bed_id: alloc.bed_id, room_number: room.room_number, floor_number: room.floor_number,
      };
      return;
    }
    const linked = e.emplyee_allocated_agreement_id ? agreementById[e.emplyee_allocated_agreement_id] : null;
    if (linked && isActiveStatus(linked.agreement_status)) {
      employeeAllocation[e.employee_id] = {
        type: 'RESIDENCE_ONLY', residence_id: linked.agreement_residence_id, agreement_id: linked.agreement_id,
        bed_id: null, room_number: null, floor_number: null,
      };
      return;
    }
    employeeAllocation[e.employee_id] = { type: 'UNALLOCATED', residence_id: null, agreement_id: null, bed_id: null };
  });

  const activeEmployees = employees.filter(isEmployeeActive);
  activeEmployees.forEach(e => {
    const al = employeeAllocation[e.employee_id];
    if (al.type === 'RESIDENCE_ONLY' && residenceStats[al.residence_id]) {
      residenceStats[al.residence_id].residentsWithoutRoom.push({
        employee_id: e.employee_id, employee_name: employeeName(e),
        department: e.employee_department, designation: e.employee_designation,
      });
    }
  });

  // Rent share: split each active agreement's rent across the active employees living under it.
  const occupantsByAgreement = {};
  activeEmployees.forEach(e => {
    const al = employeeAllocation[e.employee_id];
    if (al.agreement_id) (occupantsByAgreement[al.agreement_id] ||= []).push(e.employee_id);
  });
  const rentShareByEmployee = {};
  Object.entries(occupantsByAgreement).forEach(([agId, ids]) => {
    const rent = num(agreementById[agId]?.agreement_monthly_rent_amount);
    ids.forEach(id => { rentShareByEmployee[id] = rent / ids.length; });
  });

  // ── Refund positions ──────────────────────────────────────────────────────
  const refunds = {};
  agreements.forEach(a => {
    refunds[a.agreement_id] = {
      ...refundPosition(a, receivedByAgreement[a.agreement_id] ?? null, today),
      lastReceiptDate: lastReceiptByAgreement[a.agreement_id] || null,
    };
  });

  // ── Totals ────────────────────────────────────────────────────────────────
  const activeResidenceStats = Object.values(residenceStats).filter(r => r.status === 'active');
  const allRooms = activeResidenceStats.flatMap(r => r.rooms.filter(x => x.countable));
  const bedCapacity = allRooms.reduce((s, x) => s + x.capacity, 0);
  const occupiedBeds = allRooms.reduce((s, x) => s + x.occupied, 0);

  const allocationCounts = { ROOM: 0, RESIDENCE_ONLY: 0, UNALLOCATED: 0 };
  activeEmployees.forEach(e => { allocationCounts[employeeAllocation[e.employee_id].type]++; });

  const residenceHasOccupants = (r) => r.occupied > 0 || r.residentsWithoutRoom.length > 0;

  let advanceLocked = 0, refundExpected = 0, refundReceived = 0, refundOutstanding = 0,
      refundUpcoming = 0, refundDeductions = 0, refundCasesOpen = 0;
  agreements.forEach(a => {
    const rp = refunds[a.agreement_id];
    if (rp.stage === 'Locked') { advanceLocked += rp.advance; return; }
    if (rp.stage === 'Upcoming') { advanceLocked += rp.advance; refundUpcoming += rp.expected; return; }
    refundExpected    += rp.expected;
    refundReceived    += rp.received;
    refundDeductions  += rp.deductions;
    refundOutstanding += rp.outstanding;
    if (rp.outstanding > 0) refundCasesOpen++;
  });

  const totals = {
    activeResidences: activeResidenceStats.length,
    inactiveResidences: residences.length - activeResidenceStats.length,
    residencesWithStructure: activeResidenceStats.filter(r => r.structureConfigured).length,
    residencesWithoutStructure: activeResidenceStats.filter(r => !r.structureConfigured).length,
    occupiedResidences: activeResidenceStats.filter(residenceHasOccupants).length,
    vacantResidences: activeResidenceStats.filter(r => !residenceHasOccupants(r)).length,
    totalRooms: allRooms.length,
    fullRooms: allRooms.filter(x => x.status === 'Full').length,
    partialRooms: allRooms.filter(x => x.status === 'Partially occupied').length,
    vacantRooms: allRooms.filter(x => x.status === 'Vacant').length,
    roomsWithVacancy: allRooms.filter(x => x.vacant > 0).length,
    bedCapacity,
    occupiedBeds,
    vacantBeds: Math.max(0, bedCapacity - occupiedBeds),
    bedsHeldByInactive: allRooms.reduce((s, x) => s + x.heldByInactive, 0),
    occupancyPct: pct(occupiedBeds, bedCapacity),
    activeEmployees: activeEmployees.length,
    inactiveEmployees: employees.length - activeEmployees.length,
    employeesWithRoom: allocationCounts.ROOM,
    employeesResidenceOnly: allocationCounts.RESIDENCE_ONLY,
    employeesUnallocated: allocationCounts.UNALLOCATED,
    monthlyRent: agreements.filter(a => isActiveStatus(a.agreement_status))
      .reduce((s, a) => s + num(a.agreement_monthly_rent_amount), 0),
    activeAgreements: agreements.filter(a => isActiveStatus(a.agreement_status)).length,
    advanceLocked, refundExpected, refundReceived, refundOutstanding, refundUpcoming, refundDeductions,
    refundCasesOpen,
  };

  // ── Unit roll-up ──────────────────────────────────────────────────────────
  const unitMap = {};
  const unitRow = (u) => (unitMap[u] ||= {
    unit: u, residences: 0, rooms: 0, capacity: 0, occupied: 0, vacant: 0,
    employees: 0, employeesWithRoom: 0, employeesResidenceOnly: 0, agreements: 0, rent: 0,
  });
  unitRes.rows.filter(u => u.is_active).forEach(u => unitRow(u.unit_name));
  agreements.forEach(a => {
    if (!isActiveStatus(a.agreement_status)) return;
    const row = unitRow(unitName(a.agreement_employee_unit));
    row.agreements++;
    row.rent += num(a.agreement_monthly_rent_amount);
  });
  activeResidenceStats.forEach(r => {
    const row = unitRow(r.unit);
    row.residences++;
    row.rooms += r.totalRooms;
    row.capacity += r.capacity;
    row.occupied += r.occupied;
    row.vacant += r.vacant;
  });
  activeEmployees.forEach(e => {
    const al = employeeAllocation[e.employee_id];
    const ag = al.agreement_id ? agreementById[al.agreement_id] : null;
    const row = unitRow(ag ? unitName(ag.agreement_employee_unit) : 'Unassigned');
    row.employees++;
    if (al.type === 'ROOM') row.employeesWithRoom++;
    if (al.type === 'RESIDENCE_ONLY') row.employeesResidenceOnly++;
  });
  const units = Object.values(unitMap)
    .map(u => ({ ...u, occupancyPct: pct(u.occupied, u.capacity), costPerEmployee: u.employees > 0 ? u.rent / u.employees : 0 }))
    .sort((a, b) => b.employees - a.employees || a.unit.localeCompare(b.unit));

  return {
    today,
    residences, agreements, employees,
    residenceById, agreementById, employeeById,
    residenceStats, employeeAllocation, rentShareByEmployee, refunds,
    activeAgreementsByResidence, primaryAgreement,
    unitMaster: unitRes.rows, unitName,
    totals, units,
    helpers: { num, isActiveStatus, isEmployeeActive, isScheduledToVacate, employeeName, residenceLabel },
  };
}

module.exports = { loadSnapshot, refundPosition, unitKey };
