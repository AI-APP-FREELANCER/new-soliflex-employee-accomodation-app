const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const excelReader = require('../data/excelReader');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

router.use(authenticateToken);

// Helper: Parse currency values safely
const parseCurrency = (val) => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const clean = String(val).replace(/[^\d.-]/g, '');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
};

// Helper: Normalize status (case-insensitive)
// Handles 'ACTIVE', 'Active', 'active', 'INACTIVE', 'Inactive', 'inactive'
const normalizeStatus = (status) => {
  const s = String(status || '').trim().toLowerCase();
  return s === 'inactive' ? 'inactive' : 'active';
};

// Helper: Check if employee is active (case-insensitive)
// Excel stores as 'ACTIVE' or 'INACTIVE' (uppercase)
const isEmployeeActive = (employee) => {
  const status = String(employee.employee_status || employee.status || '').trim().toUpperCase();
  return status === 'ACTIVE';
};

// GET / - Main Dashboard Analytics
router.get('/', (req, res) => {
  try {
    // 1. Fetch ALL Data
    const agreements = excelReader.getAgreements('all');
    const employees = excelReader.getEmployees('all');
    const residences = excelReader.getResidences('all');

    // 2. Setup IST Date (Start of Today)
    const today = dayjs.tz(dayjs(), 'Asia/Kolkata').startOf('day');
    const ninetyDaysFromNow = today.add(90, 'day');

    // --- CALCULATIONS ---

    // 1. Total Properties Managed
    const totalProperties = residences.length;

    // 2. Employee Status (case-insensitive matching for ACTIVE/INACTIVE)
    let activeEmployees = 0;
    let inactiveEmployees = 0;
    employees.forEach(e => {
      // Check employee_status field (Excel stores as 'ACTIVE' or 'INACTIVE')
      const status = String(e.employee_status || e.status || '').trim().toUpperCase();
      if (status === 'ACTIVE') {
        activeEmployees++;
      } else if (status === 'INACTIVE') {
        inactiveEmployees++;
      } else {
        // Default to active if status is missing or invalid (backward compatibility)
        activeEmployees++;
      }
    });

    // 3. Renewal Alerts (using IST)
    let pastDue = 0;
    let dueSoon = 0;

    agreements.forEach(a => {
      const status = normalizeStatus(a.agreement_status || a.status);
      if (status !== 'active') return;

      const renewalDueDate = a.agreement_renewal_due_date;
      if (!renewalDueDate) return;

      // Parse renewal date with IST
      let dueDate;
      try {
        dueDate = dayjs.tz(renewalDueDate, 'Asia/Kolkata').startOf('day');
        if (!dueDate.isValid()) {
          dueDate = dayjs(renewalDueDate, 'YYYY-MM-DD', true).tz('Asia/Kolkata').startOf('day');
        }
      } catch (err) {
        return;
      }

      if (!dueDate.isValid()) return;

      // Check if past due or due soon
      if (dueDate.isBefore(today, 'day')) {
        pastDue++;
      } else if (dueDate.isSame(today, 'day') || dueDate.isBefore(ninetyDaysFromNow.add(1, 'day'), 'day')) {
        dueSoon++;
      }
    });

    // 4. Total Monthly Rent (sum of active agreements)
    let totalMonthlyRent = 0;
    agreements.forEach(a => {
      const status = normalizeStatus(a.agreement_status || a.status);
      if (status === 'active') {
        totalMonthlyRent += parseCurrency(a.agreement_monthly_rent_amount);
      }
    });

    // 5. Total Advance Locked (sum of active agreements)
    let totalAdvanceLocked = 0;
    agreements.forEach(a => {
      const status = normalizeStatus(a.agreement_status || a.status);
      if (status === 'active') {
        totalAdvanceLocked += parseCurrency(a.agreement_advance_amount);
      }
    });

    // 6. Total Advance Due Back (inactive agreements with advance)
    let totalAdvanceDueBack = 0;
    agreements.forEach(a => {
      const status = normalizeStatus(a.agreement_status || a.status);
      if (status === 'inactive') {
        totalAdvanceDueBack += parseCurrency(a.agreement_advance_amount);
      }
    });

    // 7. Total Net Received (placeholder - would need financial transaction data)
    // For now, calculate as sum of advances from inactive agreements
    let totalNetReceived = 0;
    agreements.forEach(a => {
      const status = normalizeStatus(a.agreement_status || a.status);
      if (status === 'inactive') {
        // In a real system, this would come from payment records
        // For now, we'll use a simplified calculation
        totalNetReceived += parseCurrency(a.agreement_advance_amount) * 0.1; // Example: 10% received
      }
    });


    // 8. Monthly Rent by Department
    const rentMap = {};
    const agreementRentLookup = {};
    
    // Build agreement rent lookup
    agreements.forEach(a => {
      const status = normalizeStatus(a.agreement_status || a.status);
      if (status === 'active') {
        const rent = parseCurrency(a.agreement_monthly_rent_amount);
        agreementRentLookup[a.agreement_id] = rent;
      }
    });

    // Sum rent by department
    employees.forEach(e => {
      // Use case-insensitive check for employee_status
      const status = String(e.employee_status || e.status || '').trim().toUpperCase();
      if (status !== 'ACTIVE') return;

      const dept = (e.employee_department || 'Unassigned').trim();
      const agId = e.emplyee_allocated_agreement_id;

      if (agId && agreementRentLookup[agId]) {
        rentMap[dept] = (rentMap[dept] || 0) + agreementRentLookup[agId];
      }
    });

    // Format for chart (sort high to low, limit to top 4)
    const rentByDepartment = Object.keys(rentMap).map(dept => ({
      department: dept,
      cost: rentMap[dept]
    })).sort((a, b) => b.cost - a.cost).slice(0, 4);

    // 9. Employee Breakdown by Department (for chart)
    const deptCountMap = {};
    employees.forEach(e => {
      // Use case-insensitive check for employee_status
      const status = String(e.employee_status || e.status || '').trim().toUpperCase();
      if (status === 'ACTIVE') {
        const dept = (e.employee_department || 'Unassigned').trim();
        deptCountMap[dept] = (deptCountMap[dept] || 0) + 1;
      }
    });

    const employeeBreakdown = Object.keys(deptCountMap).map(dept => ({
      department: dept,
      count: deptCountMap[dept]
    })).sort((a, b) => b.count - a.count).slice(0, 4);

    // Return all dashboard data
    res.json({
      // Property Stats
      totalProperties,
      
      // Employee Stats
      activeEmployees,
      inactiveEmployees,
      totalEmployees: activeEmployees + inactiveEmployees,
      
      // Renewal Stats
      pastDue,
      dueSoon,
      currentDateIST: today.format('DD-MM-YYYY'),
      
      // Financial Stats
      totalMonthlyRent,
      totalAdvanceLocked,
      totalAdvanceDueBack,
      totalNetReceived,
      
      // Chart Data
      rentByDepartment,
      employeeBreakdown
    });

  } catch (err) {
    // Log error securely without exposing details
    if (process.env.NODE_ENV === 'development') {
      console.error('Analytics Error:', err.message);
    }
    res.status(500).json({ error: 'Server Error processing data' });
  }
});

module.exports = router;
