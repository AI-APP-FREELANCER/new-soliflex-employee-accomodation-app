const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const excelReader = require('../data/excelReader');

router.use(authenticateToken);

// Helper: Parse various date formats (DD-MMM-YYYY, DD/MM/YYYY, YYYY-MM-DD)
const parseDate = (dateStr) => {
  if (!dateStr) return null;
  
  // Try standard Date parse first
  let date = new Date(dateStr);
  if (!isNaN(date.getTime())) return date;

  // Handle DD-MMM-YYYY (e.g., 01-Jan-2024)
  const parts = dateStr.split(/[-/]/);
  if (parts.length === 3) {
    // Check if second part is a month name (Jan, Feb, etc.)
    const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const monthIndex = monthNames.indexOf(parts[1].toLowerCase());
    
    if (monthIndex > -1) {
      // Format: DD-MMM-YYYY
      return new Date(parts[2], monthIndex, parts[0]);
    } else if (parts[0].length === 4) {
      // Format: YYYY-MM-DD
      return new Date(parts[0], parts[1] - 1, parts[2]);
    } else {
      // Assume Format: DD/MM/YYYY
      return new Date(parts[2], parts[1] - 1, parts[0]);
    }
  }
  return null;
};

router.get('/', (req, res) => {
  try {
    // 1. Fetch Data from Excel/CSV
    const agreements = excelReader.getAgreements('all');
    const employees = excelReader.getEmployees('all');
    const residences = excelReader.getResidences();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const ninetyDaysFromNow = new Date();
    ninetyDaysFromNow.setDate(today.getDate() + 90);

    // --- CALCULATIONS ---

    // 1. Total Agreements
    const totalAgreements = agreements.length;

    // 2. Due Dates (Past Due & Due <= 90 Days)
    let dueAgreements = 0;
    let pastDueAgreements = 0;

    agreements.forEach(ag => {
      // Get Date String
      const dateStr = ag.agreement_end_date || ag.EndDate; 
      if (!dateStr) return;

      const endDate = parseDate(dateStr);
      if (!endDate) return; // Skip invalid dates

      // Check Active Status (Case Insensitive)
      const status = ag.status || ag.agreement_status || 'Active'; 
      if (status.toLowerCase() === 'active') {
        if (endDate < today) {
          pastDueAgreements++;
        } else if (endDate <= ninetyDaysFromNow) {
          dueAgreements++;
        }
      }
    });

    // 3. Inactive Employees
    let inactiveEmployees = 0;
    employees.forEach(emp => {
      const status = emp.status || emp.employee_status || '';
      if (status.toLowerCase() === 'inactive') {
        inactiveEmployees++;
      }
    });

    // 4. Occupancy Rate
    // Formula: (Active Employees with Agreements / Total Capacity) * 100
    
    // Count occupied spots (Active employees who have an agreement assigned)
    const activeOccupants = employees.filter(e => {
      const status = e.status || e.employee_status || 'Active';
      const hasAgreement = e.emplyee_allocated_agreement_id;
      return status.toLowerCase() === 'active' && hasAgreement;
    }).length;

    // Count total capacity
    const totalCapacity = residences.reduce((sum, res) => {
      // Use 'capacity' or fallback to 'residence_house_count'
      const cap = parseInt(res.capacity || res.residence_house_count || 0, 10);
      return sum + (isNaN(cap) ? 0 : cap);
    }, 0);

    const occupancyRate = totalCapacity > 0 
      ? ((activeOccupants / totalCapacity) * 100).toFixed(1) 
      : 0;

    // 5. Monthly Rent Cost by Department
    const rentByDeptMap = {};

    employees.forEach(emp => {
        // Only count Active employees for current monthly cost
        const status = emp.status || emp.employee_status || 'Active';
        if (status.toLowerCase() !== 'active') return;

        const dept = emp.employee_department || 'Unknown';
        const agreementId = emp.emplyee_allocated_agreement_id;

        if (agreementId) {
            // Find the agreement to get the rent amount
            const agreement = agreements.find(a => a.agreement_id == agreementId);
            if (agreement) {
                const rent = parseFloat(agreement.agreement_monthly_rent_amount || 0);
                if (!rentByDeptMap[dept]) rentByDeptMap[dept] = 0;
                rentByDeptMap[dept] += rent;
            }
        }
    });

    const departmentLabels = Object.keys(rentByDeptMap);
    const departmentData = Object.values(rentByDeptMap);

    res.json({
      totalAgreements,
      dueAgreements,
      pastDueAgreements,
      inactiveEmployees,
      occupancyRate,
      rentByDepartment: {
        labels: departmentLabels,
        data: departmentData
      }
    });

  } catch (err) {
    console.error('Analytics Error:', err);
    res.status(500).json({ message: 'Server Error processing Excel data' });
  }
});

module.exports = router;