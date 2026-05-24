const express = require('express');
const router  = express.Router();
const { authenticateToken } = require('../middleware/auth');
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
    const [agreements, employees, residences] = await Promise.all([
      excelReader.getAgreements('all'),
      excelReader.getEmployees('all'),
      excelReader.getResidences('all'),
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

    res.json({
      totalProperties,
      activeEmployees, inactiveEmployees, totalEmployees: activeEmployees + inactiveEmployees,
      pastDue, dueSoon, currentDateIST: today.format('DD-MM-YYYY'),
      totalMonthlyRent, totalAdvanceLocked, totalAdvanceDueBack, totalNetReceived, totalScheduledToVacate,
      rentByDepartment, employeeBreakdown,
    });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') console.error('Analytics Error:', err.message);
    res.status(500).json({ error: 'Server Error processing data' });
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
