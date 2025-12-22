const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const excelReader = require('../data/excelReader');

router.use(authenticateToken);

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
      // Check for valid end date
      if (!ag.agreement_end_date) return;
      
      const endDate = new Date(ag.agreement_end_date);
      // specific check for active status if needed, or count all physical copies
      const status = ag.status || ag.agreement_status || 'Active'; 
      
      // We generally only track due dates for Active agreements
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
    // Formula: (Total Active Employees with Agreements / Total Bed Capacity) * 100
    // Capacity comes from residence_house_count (assuming house count = capacity, or use specific capacity field if available)
    
    // Count occupied spots (Active employees who have an agreement assigned)
    const activeOccupants = employees.filter(e => {
      const status = e.status || e.employee_status || 'Active';
      const hasAgreement = e.emplyee_allocated_agreement_id;
      return status.toLowerCase() === 'active' && hasAgreement;
    }).length;

    // Count total capacity
    const totalCapacity = residences.reduce((sum, res) => {
      // Use 'capacity' if it exists, otherwise fallback to 'residence_house_count' or 0
      // Adjust this field name based on your exact CSV header for capacity
      const cap = parseInt(res.capacity || res.residence_house_count || 0, 10);
      return sum + cap;
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