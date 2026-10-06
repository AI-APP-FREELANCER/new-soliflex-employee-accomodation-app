const express = require('express');
const router  = express.Router();
const { authenticateToken } = require('../middleware/auth');
const excelReader = require('../data/excelReader');
const { getMISData } = require('../data/misReports');
const { loadSnapshot } = require('../data/accommodationSnapshot');
const dayjs = require('dayjs');
const utc      = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

router.use(authenticateToken);

// GET / - Main Dashboard Analytics
// KPI figures come from the shared accommodation snapshot so they always match /mis.
router.get('/', async (req, res) => {
  try {
    const snap = await loadSnapshot();
    const { totals: t, agreements, employees, employeeAllocation, rentShareByEmployee, today } = snap;
    const { isActiveStatus, isEmployeeActive, isScheduledToVacate } = snap.helpers;

    const ninetyDaysFromNow = today.add(90, 'day');
    let pastDue = 0, dueSoon = 0;
    agreements.forEach(a => {
      if (!isActiveStatus(a.agreement_status) || !a.agreement_renewal_due_date) return;
      const dueDate = dayjs.tz(a.agreement_renewal_due_date, 'Asia/Kolkata').startOf('day');
      if (!dueDate.isValid()) return;
      if (dueDate.isBefore(today, 'day')) pastDue++;
      else if (!dueDate.isAfter(ninetyDaysFromNow, 'day')) dueSoon++;
    });

    // Rent by department — each agreement's rent is split across its occupants.
    const rentMap = {};
    const deptCountMap = {};
    employees.forEach(e => {
      if (!isEmployeeActive(e)) return;
      const dept = (e.employee_department || 'Unassigned').trim();
      deptCountMap[dept] = (deptCountMap[dept] || 0) + 1;
      if (rentShareByEmployee[e.employee_id]) rentMap[dept] = (rentMap[dept] || 0) + rentShareByEmployee[e.employee_id];
    });
    const rentByDepartment = Object.keys(rentMap)
      .map(d => ({ department: d, cost: Math.round(rentMap[d]) }))
      .sort((a, b) => b.cost - a.cost).slice(0, 4);
    const employeeBreakdown = Object.keys(deptCountMap)
      .map(d => ({ department: d, count: deptCountMap[d] }))
      .sort((a, b) => b.count - a.count).slice(0, 4);

    res.json({
      totalProperties: snap.residences.length,
      activeEmployees: t.activeEmployees,
      inactiveEmployees: t.inactiveEmployees,
      totalEmployees: t.activeEmployees + t.inactiveEmployees,
      employeesWithRoom: t.employeesWithRoom,
      employeesResidenceOnly: t.employeesResidenceOnly,
      employeesUnallocated: t.employeesUnallocated,
      pastDue, dueSoon, currentDateIST: today.format('DD-MM-YYYY'),
      totalMonthlyRent: t.monthlyRent,
      totalAdvanceLocked: t.advanceLocked,
      totalAdvanceDueBack: t.refundExpected,
      totalNetReceived: t.refundReceived,
      totalAdvancePending: t.refundOutstanding,
      totalScheduledToVacate: agreements.filter(a => isActiveStatus(a.agreement_status) && isScheduledToVacate(a)).length,
      rentByDepartment, employeeBreakdown,
      totalBeds: t.bedCapacity,
      occupiedBeds: t.occupiedBeds,
      availableBeds: t.vacantBeds,
      bedsHeldByInactive: t.bedsHeldByInactive,
      occupancyPct: t.occupancyPct,
      totalRooms: t.totalRooms,
      roomsWithVacancy: t.roomsWithVacancy,
      unitBreakdown: snap.units,
    });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') console.error('Analytics Error:', err.message);
    res.status(500).json({ error: 'Server Error processing data' });
  }
});

// GET /availability-detail — residence → floor → room → bed occupancy for the vacancy drill-downs
router.get('/availability-detail', async (req, res) => {
  try {
    const snap = await loadSnapshot();
    const result = Object.values(snap.residenceStats)
      .filter(r => r.status === 'active')
      .map(r => ({
        residence_id:  r.residence_id,
        name:          r.name,
        address:       r.address,
        owner:         r.owner,
        owner_contact: r.owner_contact,
        owner_phone:   r.owner_phone,
        status:        r.status,
        unit:          r.unit,
        structureConfigured: r.structureConfigured,
        residentsWithoutRoom: r.residentsWithoutRoom,
        totalBeds:     r.capacity,
        occupiedBeds:  r.occupied,
        vacantBeds:    r.vacant,
        occupancyPct:  r.occupancyPct,
        rooms: r.rooms.filter(room => room.countable).map(room => ({
          room_id:      room.room_id,
          room_number:  room.room_number,
          floor_number: room.floor_number,
          room_type:    room.room_type,
          status:       room.status,
          totalBeds:    room.capacity,
          occupiedBeds: room.occupied,
          vacantBeds:   room.vacant,
          occupancyPct: room.occupancyPct,
          beds: room.beds.filter(b => b.is_active).map(b => ({
            bed_id:         b.bed_id,
            bed_label:      b.bed_label,
            bed_type:       b.bed_type,
            floor_number:   room.floor_number,
            occupied:       b.occupied,
            employee_id:    b.allocation?.employee_id || null,
            employee_name:  b.allocation?.employee_name || null,
            employee_status: b.allocation?.employee_status || null,
            department:     b.allocation?.department || null,
            allocated_date: b.allocation?.allocated_date || null,
            release_date:   b.allocation?.release_date || null,
          })),
        })),
      }));
    res.json(result);
  } catch (err) {
    if (process.env.NODE_ENV === 'development') console.error('Availability Detail Error:', err.message);
    res.status(500).json({ error: 'Server Error' });
  }
});

// GET /attrition — employee attrition & retention analytics
router.get('/attrition', async (req, res) => {
  try {
    const { dateFrom, dateTo, unit, department } = req.query;
    const employees = await excelReader.getEmployees('all');

    const today = dayjs.tz(dayjs(), 'Asia/Kolkata').startOf('day');

    // Filter resigned employees (have a resignation date or are inactive)
    let resigned = employees.filter(e => {
      const status = String(e.employee_status || '').trim().toUpperCase();
      return status === 'INACTIVE' || e.employee_date_of_resignation;
    });

    if (dateFrom) {
      const from = dayjs(dateFrom).startOf('day');
      resigned = resigned.filter(e => {
        const d = e.employee_date_of_resignation || e.employee_last_working_date;
        return d && !dayjs(d).isBefore(from, 'day');
      });
    }
    if (dateTo) {
      const to = dayjs(dateTo).endOf('day');
      resigned = resigned.filter(e => {
        const d = e.employee_date_of_resignation || e.employee_last_working_date;
        return d && !dayjs(d).isAfter(to, 'day');
      });
    }
    if (department) resigned = resigned.filter(e => e.employee_department === department);
    if (unit) {
      // unit is on agreement — join not available here, so we skip unit filter at this level
      // unit breakdown is computed separately from agreements
    }

    const retained = resigned.filter(e => e.employee_retention_status === 'RETAINED');
    const notRetained = resigned.filter(e => e.employee_retention_status !== 'RETAINED');

    // Monthly breakdown
    const monthlyMap = {};
    resigned.forEach(e => {
      const d = e.employee_date_of_resignation || e.employee_last_working_date;
      if (!d) return;
      const key = dayjs(d).format('YYYY-MM');
      if (!monthlyMap[key]) monthlyMap[key] = { month: key, resigned: 0, retained: 0 };
      monthlyMap[key].resigned++;
      if (e.employee_retention_status === 'RETAINED') monthlyMap[key].retained++;
    });
    const monthly = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));

    // Department breakdown
    const deptMap = {};
    resigned.forEach(e => {
      const dept = e.employee_department || 'Unassigned';
      if (!deptMap[dept]) deptMap[dept] = { department: dept, resigned: 0, retained: 0 };
      deptMap[dept].resigned++;
      if (e.employee_retention_status === 'RETAINED') deptMap[dept].retained++;
    });
    const byDepartment = Object.values(deptMap).sort((a, b) => b.resigned - a.resigned);

    // Reason breakdown
    const reasonMap = {};
    resigned.forEach(e => {
      const reason = e.employee_resignation_reason || 'Not Specified';
      reasonMap[reason] = (reasonMap[reason] || 0) + 1;
    });
    const byReason = Object.entries(reasonMap).map(([reason, count]) => ({ reason, count })).sort((a,b) => b.count - a.count);

    const activeEmployees = employees.filter(e => String(e.employee_status || '').toUpperCase() === 'ACTIVE').length;
    const totalResigned = resigned.length;
    const attritionRate = activeEmployees + totalResigned > 0
      ? ((totalResigned / (activeEmployees + totalResigned)) * 100).toFixed(1)
      : '0.0';
    const retentionRate = totalResigned > 0
      ? ((retained.length / totalResigned) * 100).toFixed(1)
      : '0.0';

    res.json({
      summary: {
        totalResigned,
        totalRetained: retained.length,
        attritionRate: parseFloat(attritionRate),
        retentionRate: parseFloat(retentionRate),
        activeEmployees,
      },
      monthly,
      byDepartment,
      byReason,
      employees: resigned.map(e => ({
        employee_id:              e.employee_id,
        name:                     [e.employee_first_name, e.employee_last_name].filter(Boolean).join(' '),
        department:               e.employee_department,
        designation:              e.employee_designation,
        date_of_joining:          e.employee_date_of_joining,
        last_working_date:        e.employee_last_working_date,
        date_of_resignation:      e.employee_date_of_resignation,
        resignation_reason:       e.employee_resignation_reason,
        retention_status:         e.employee_retention_status,
        retention_date:           e.employee_retention_date,
        retention_reason:         e.employee_retention_reason,
        status:                   e.employee_status,
      })),
    });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') console.error('Attrition Error:', err.message);
    res.status(500).json({ error: 'Server Error' });
  }
});

// GET /mis
router.get('/mis', async (req, res) => {
  try {
    const data = await getMISData();
    res.json(data);
  } catch (err) {
    if (process.env.NODE_ENV === 'development') console.error('MIS Error:', err.message);
    res.status(500).json({ error: 'Server Error processing MIS data' });
  }
});

module.exports = router;
