const express = require('express');
const router  = express.Router();
const { authenticateToken } = require('../middleware/auth');
const pool        = require('../data/db');
const excelReader = require('../data/excelReader');
const { getMISData } = require('../data/misReports');
const dayjs = require('dayjs');
const utc      = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

router.use(authenticateToken);

const parseCurrency = (val) => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const n = parseFloat(String(val).replace(/[^\d.-]/g, ''));
  return isNaN(n) ? 0 : n;
};

const normalizeStatus = (status) => {
  const s = String(status || '').trim().toLowerCase();
  return s === 'inactive' ? 'inactive' : 'active';
};

const isEmployeeActive = (employee) =>
  String(employee.employee_status || employee.status || '').trim().toUpperCase() === 'ACTIVE';

// GET / - Main Dashboard Analytics
router.get('/', async (req, res) => {
  try {
    const [agreements, employees, residences, bedRows, allocRows] = await Promise.all([
      excelReader.getAgreements('all'),
      excelReader.getEmployees('all'),
      excelReader.getResidences('all'),
      pool.query('SELECT bed_id, residence_id, is_active FROM bed_master WHERE is_active = true'),
      pool.query('SELECT bed_id FROM bed_allocations WHERE is_active = true'),
    ]);

    const today          = dayjs.tz(dayjs(), 'Asia/Kolkata').startOf('day');
    const ninetyDaysFromNow = today.add(90, 'day');

    const totalProperties = residences.length;

    let activeEmployees = 0, inactiveEmployees = 0;
    employees.forEach(e => {
      const status = String(e.employee_status || e.status || '').trim().toUpperCase();
      if (status === 'ACTIVE') activeEmployees++;
      else if (status === 'INACTIVE') inactiveEmployees++;
      else activeEmployees++; // default active
    });

    let pastDue = 0, dueSoon = 0;
    agreements.forEach(a => {
      if (normalizeStatus(a.agreement_status || a.status) !== 'active') return;
      const renewalDueDate = a.agreement_renewal_due_date;
      if (!renewalDueDate) return;
      let dueDate;
      try {
        dueDate = dayjs.tz(renewalDueDate, 'Asia/Kolkata').startOf('day');
        if (!dueDate.isValid()) dueDate = dayjs(renewalDueDate, 'YYYY-MM-DD', true).tz('Asia/Kolkata').startOf('day');
      } catch (e) { return; }
      if (!dueDate.isValid()) return;
      if (dueDate.isBefore(today, 'day')) pastDue++;
      else if (dueDate.isSame(today, 'day') || dueDate.isBefore(ninetyDaysFromNow.add(1, 'day'), 'day')) dueSoon++;
    });

    let totalMonthlyRent = 0, totalAdvanceLocked = 0, totalAdvanceDueBack = 0, totalNetReceived = 0, totalScheduledToVacate = 0;
    agreements.forEach(a => {
      const status = normalizeStatus(a.agreement_status || a.status);
      if (status === 'active') {
        totalMonthlyRent   += parseCurrency(a.agreement_monthly_rent_amount);
        totalAdvanceLocked += parseCurrency(a.agreement_advance_amount);
      }
      if (status === 'inactive') {
        const dueBack   = parseCurrency(a.agreement_advance_due_back || a.agreement_advance_amount || 0);
        const received  = parseCurrency(a.agreement_advance_received || 0);
        if (received === 0 || !a.agreement_advance_received) totalAdvanceDueBack += dueBack;
      }
      totalNetReceived += parseCurrency(a.agreement_advance_received || 0);
      if (a.agreement_scheduled_to_vacate) totalScheduledToVacate++;
    });

    // Rent by department
    const agreementRentLookup = {};
    agreements.forEach(a => {
      if (normalizeStatus(a.agreement_status || a.status) === 'active')
        agreementRentLookup[a.agreement_id] = parseCurrency(a.agreement_monthly_rent_amount);
    });
    const rentMap = {};
    employees.forEach(e => {
      if (!isEmployeeActive(e)) return;
      const dept = (e.employee_department || 'Unassigned').trim();
      const agId = e.emplyee_allocated_agreement_id;
      if (agId && agreementRentLookup[agId]) rentMap[dept] = (rentMap[dept] || 0) + agreementRentLookup[agId];
    });
    const rentByDepartment = Object.keys(rentMap)
      .map(d => ({ department: d, cost: rentMap[d] }))
      .sort((a, b) => b.cost - a.cost).slice(0, 4);

    // Employee breakdown
    const deptCountMap = {};
    employees.forEach(e => {
      if (isEmployeeActive(e)) {
        const dept = (e.employee_department || 'Unassigned').trim();
        deptCountMap[dept] = (deptCountMap[dept] || 0) + 1;
      }
    });
    const employeeBreakdown = Object.keys(deptCountMap)
      .map(d => ({ department: d, count: deptCountMap[d] }))
      .sort((a, b) => b.count - a.count).slice(0, 4);

    // ── Bed stats ─────────────────────────────────────────────────────────────
    const totalBeds    = bedRows.rows.length;
    const occupiedBedSet = new Set(allocRows.rows.map(r => r.bed_id));
    const occupiedBeds = bedRows.rows.filter(b => occupiedBedSet.has(b.bed_id)).length;
    const availableBeds = totalBeds - occupiedBeds;

    // ── Unit-wise breakdown ───────────────────────────────────────────────────
    const unitMap = {};
    agreements.forEach(a => {
      if (normalizeStatus(a.agreement_status || a.status) !== 'active') return;
      const unit = (a.agreement_employee_unit || 'Unassigned').trim();
      if (!unitMap[unit]) unitMap[unit] = { unit, employees: 0, rent: 0, agreements: 0 };
      unitMap[unit].agreements++;
      unitMap[unit].rent += parseCurrency(a.agreement_monthly_rent_amount);
    });
    employees.forEach(e => {
      if (!isEmployeeActive(e)) return;
      const agId = e.emplyee_allocated_agreement_id;
      const ag   = agId ? agreements.find(a => a.agreement_id === agId) : null;
      const unit = (ag?.agreement_employee_unit || 'Unassigned').trim();
      if (!unitMap[unit]) unitMap[unit] = { unit, employees: 0, rent: 0, agreements: 0 };
      unitMap[unit].employees++;
    });
    const unitBreakdown = Object.values(unitMap).sort((a, b) => b.employees - a.employees);

    res.json({
      totalProperties,
      activeEmployees, inactiveEmployees, totalEmployees: activeEmployees + inactiveEmployees,
      pastDue, dueSoon, currentDateIST: today.format('DD-MM-YYYY'),
      totalMonthlyRent, totalAdvanceLocked, totalAdvanceDueBack, totalNetReceived, totalScheduledToVacate,
      rentByDepartment, employeeBreakdown,
      totalBeds, occupiedBeds, availableBeds,
      unitBreakdown,
    });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') console.error('Analytics Error:', err.message);
    res.status(500).json({ error: 'Server Error processing data' });
  }
});

// GET /availability-detail — full property→room→bed occupancy breakdown for clickable vacancy cards
router.get('/availability-detail', async (req, res) => {
  try {
    const [residences, beds, allocs, employees] = await Promise.all([
      excelReader.getResidences('active'),
      pool.query('SELECT * FROM bed_master WHERE is_active = true ORDER BY residence_id, room_number, bed_label'),
      pool.query(`
        SELECT a.*, e.employee_first_name, e.employee_last_name, e.employee_department
        FROM bed_allocations a
        LEFT JOIN employee_master e ON a.employee_id = e.employee_id
        WHERE a.is_active = true
      `),
      excelReader.getEmployees('active'),
    ]);

    const allocMap = {};
    allocs.rows.forEach(a => { allocMap[a.bed_id] = a; });

    const residenceMap = {};
    residences.forEach(r => {
      residenceMap[r.residence_id] = {
        residence_id:   r.residence_id,
        name:           r.residence_door_number || r.residence_id,
        address:        [r.residence_address_line_1, r.residence_address_line_2].filter(Boolean).join(', '),
        owner:          r.residence_owner_name,
        owner_contact:  r.residence_owner_contact,
        owner_phone:    r.residence_owner_phone,
        status:         r.residence_status,
        rooms:          {},
        totalBeds:      0,
        occupiedBeds:   0,
      };
    });

    beds.rows.forEach(b => {
      const prop = residenceMap[b.residence_id];
      if (!prop) return;
      if (!prop.rooms[b.room_number]) {
        prop.rooms[b.room_number] = { room_number: b.room_number, floor_number: b.floor_number, beds: [], totalBeds: 0, occupiedBeds: 0 };
      }
      const alloc = allocMap[b.bed_id];
      const occupied = !!alloc;
      prop.rooms[b.room_number].beds.push({
        bed_id:      b.bed_id,
        bed_label:   b.bed_label,
        bed_type:    b.bed_type,
        floor_number: b.floor_number,
        occupied,
        employee_id:   alloc?.employee_id   || null,
        employee_name: alloc ? [alloc.employee_first_name, alloc.employee_last_name].filter(Boolean).join(' ') : null,
        department:    alloc?.employee_department || null,
        allocated_date: alloc?.allocated_date || null,
        release_date:   alloc?.release_date || null,
      });
      prop.rooms[b.room_number].totalBeds++;
      if (occupied) prop.rooms[b.room_number].occupiedBeds++;
      prop.totalBeds++;
      if (occupied) prop.occupiedBeds++;
    });

    // Convert rooms map to array
    const result = Object.values(residenceMap).map(p => ({
      ...p,
      rooms: Object.values(p.rooms).map(r => ({ ...r, vacantBeds: r.totalBeds - r.occupiedBeds })),
      vacantBeds: p.totalBeds - p.occupiedBeds,
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
