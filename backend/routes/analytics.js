const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const excelReader = require('../data/excelReader');

// All routes require authentication
router.use(authenticateToken);

// GET current occupancy (joined Employee and Agreement data)
router.get('/occupancy', (req, res) => {
  try {
    const employees = excelReader.getEmployees();
    const agreements = excelReader.getAgreements();
    const residences = excelReader.getResidences();

    // Filter active employees and agreements with BACKWARD COMPATIBILITY
    // CRITICAL: A record is ACTIVE if status === 'active' OR status is null/undefined
    const activeEmployees = employees.filter(e => {
      const status = e.status || e.employee_status;
      return !status || status === 'active' || status === 'Active';
    });

    const occupancy = activeEmployees
      .map(employee => {
        // Find the agreement for this employee with backward compatibility
        const agreement = agreements.find(a => {
          if (a.agreement_id !== employee.emplyee_allocated_agreement_id) return false;
          const agreementStatus = a.status || a.agreement_status;
          return !agreementStatus || agreementStatus === 'active' || agreementStatus === 'Active';
        });

        if (!agreement) return null;

        // Find the residence for this agreement
        const residence = residences.find(r => 
          r.residence_id === agreement.agreement_residence_id
        );

        if (!residence) return null;

        return {
          employee_id: employee.employee_id,
          employee_name: `${employee.employee_first_name || ''} ${employee.employee_last_name || ''}`.trim(),
          employee_sir_name: employee.employee_sir_name,
          employee_department: employee.employee_department,
          employee_designation: employee.employee_designation,
          residence_id: residence.residence_id,
          residence_address: [
            residence.residence_address_line_1,
            residence.residence_address_line_2,
            residence.residence_address_line_3,
          ].filter(Boolean).join(', '),
          stay_start_date: agreement.agreement_possesion_date,
          agreement_id: agreement.agreement_id,
        };
      })
      .filter(Boolean); // Remove null entries

    res.json(occupancy);
  } catch (error) {
    console.error('Error fetching occupancy:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET occupancy rate
router.get('/occupancy-rate', (req, res) => {
  try {
    const employees = excelReader.getEmployees();
    const residences = excelReader.getResidences();

    // Count employees where status = Active AND emplyee_allocated_agreement_id is NOT NULL
    // Formula: Occupancy Rate = (Count of employees with status = Active AND NOT NULL emplyee_allocated_agreement_id) / (Sum of residence_house_count for all ACTIVE residences) * 100
    // BACKWARD COMPATIBILITY: Treat null/undefined status as active
    const activeEmployeesWithAgreement = employees.filter(e => {
      // Check if employee is Active (backward compatible)
      const status = e.status || e.employee_status;
      const isActive = !status || status === 'Active' || status === 'active';
      // Check if emplyee_allocated_agreement_id is NOT NULL and not empty
      const hasAgreement = e.emplyee_allocated_agreement_id != null && 
                          e.emplyee_allocated_agreement_id !== '' && 
                          e.emplyee_allocated_agreement_id.toString().trim() !== '';
      return isActive && hasAgreement;
    }).length;

    // Sum of residence_house_count for all residence_master where status = Active
    // BACKWARD COMPATIBILITY: Treat null/undefined status as active
    const activeResidences = residences.filter(r => {
      const status = r.status || r.residence_status;
      return !status || status === 'Active' || status === 'active';
    });
    
    const totalAvailableHouses = activeResidences.reduce((sum, r) => {
      const houseCount = parseInt(r.residence_house_count) || 0;
      return sum + houseCount;
    }, 0);

    // Calculate occupancy rate: (activeEmployeesWithAgreement / totalAvailableHouses) * 100
    const occupancyRate = totalAvailableHouses > 0
      ? ((activeEmployeesWithAgreement / totalAvailableHouses) * 100)
      : null; // Return null if denominator is zero

    res.json({
      occupancyRate: occupancyRate !== null && !isNaN(occupancyRate) ? parseFloat(occupancyRate.toFixed(2)) : null,
      activeEmployeesWithAgreement,
      totalAvailableHouses,
    });
  } catch (error) {
    console.error('Error fetching occupancy rate:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET employee status counts
router.get('/employee-status', (req, res) => {
  try {
    const employees = excelReader.getEmployees('all');
    let activeCount = 0;
    let inactiveCount = 0;
    
    employees.forEach(e => {
      // Check multiple potential field names for status
      const rawStatus = e.status || e.employee_status || e.Status || '';
      const status = String(rawStatus).trim().toLowerCase();
      // Logic: Active if 'active' or if status is missing/empty (backward compatibility)
      if (status === 'active' || status === '' || status === 'null' || status === 'undefined') {
        activeCount++;
      } else {
        inactiveCount++;
      }
    });
    
    res.json({ activeCount, inactiveCount, total: employees.length });
  } catch (error) {
    console.error('Error fetching status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET renewal alerts (agreements expiring within specified days)
router.get('/renewal-alerts', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 90;
    const agreements = excelReader.getAgreements();
    const residences = excelReader.getResidences();

    // Use IST timezone (UTC+5:30) for date calculations
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
    const istNow = new Date(now.getTime() + istOffset);
    const today = new Date(istNow.getFullYear(), istNow.getMonth(), istNow.getDate());
    
    const alertDate = new Date(today);
    alertDate.setDate(today.getDate() + days);

    const alerts = agreements
      .filter(agreement => {
        // BACKWARD COMPATIBILITY: Only active agreements (treat null/undefined as active)
        const status = agreement.status || agreement.agreement_status;
        if (status && status !== 'Active' && status !== 'active') {
          return false;
        }

        // Check if renewal due date is within the alert period (including past due)
        if (!agreement.agreement_renewal_due_date) {
          return false;
        }

        const renewalDate = new Date(agreement.agreement_renewal_due_date);
        // Include past due agreements (before today) and upcoming (within alert period)
        return renewalDate <= alertDate;
      })
      .map(agreement => {
        const residence = residences.find(r => 
          r.residence_id === agreement.agreement_residence_id
        );

        return {
          agreement_id: agreement.agreement_id,
          residence_id: agreement.agreement_residence_id,
          residence_address: residence ? [
            residence.residence_address_line_1,
            residence.residence_address_line_2,
            residence.residence_address_line_3,
          ].filter(Boolean).join(', ') : 'Unknown',
          owner_name: residence ? residence.residence_owner_name : 'Unknown',
          renewal_due_date: agreement.agreement_renewal_due_date,
          possession_date: agreement.agreement_possesion_date,
          monthly_rent: agreement.agreement_monthly_rent_amount,
          days_until_renewal: Math.ceil(
            (new Date(agreement.agreement_renewal_due_date) - today) / (1000 * 60 * 60 * 24)
          ),
        };
      })
      .sort((a, b) => new Date(a.renewal_due_date) - new Date(b.renewal_due_date));

    res.json(alerts);
  } catch (error) {
    console.error('Error fetching renewal alerts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET financial summary
router.get('/financial-summary', (req, res) => {
  try {
    // CRITICAL: Get ALL agreements for financial accuracy (includes inactive for historical calculations)
    const allAgreements = excelReader.getAgreements('all');
    const { startDate, endDate } = req.query;

    // Filter active agreements with BACKWARD COMPATIBILITY
    // For current spend, only count active ones
    const activeAgreements = allAgreements.filter(a => {
      const status = a.status || a.agreement_status;
      return !status || status === 'Active' || status === 'active';
    });

    // Calculate total current monthly spend
    const totalCurrentMonthlySpend = activeAgreements.reduce((sum, agreement) => {
      const rent = parseFloat(agreement.agreement_monthly_rent_amount);
      return sum + (isNaN(rent) ? 0 : rent);
    }, 0);

    // Calculate total current advance spent
    const totalCurrentAdvanceSpent = activeAgreements.reduce((sum, agreement) => {
      const advance = parseFloat(agreement.agreement_advance_amount);
      return sum + (isNaN(advance) ? 0 : advance);
    }, 0);

    // Calculate likely cost prediction (next year)
    // Annual rent = monthly rent * 12 + advance
    const monthlySpend = isNaN(totalCurrentMonthlySpend) ? 0 : totalCurrentMonthlySpend;
    const advanceSpent = isNaN(totalCurrentAdvanceSpent) ? 0 : totalCurrentAdvanceSpent;
    const likelyCostPrediction = (monthlySpend * 12) + advanceSpent;

    // Calculate yearly breakdown: 2023, 2024, 2025
    const today = new Date();
    const currentYear = today.getFullYear();
    const year2023 = 2023;
    const year2024 = 2024;
    const year2025 = 2025;
    
    let year2023Spend = 0;
    let year2024Spend = 0;
    const year2025Spend = likelyCostPrediction; // Prediction for next year

    // Calculate actual spend for 2023 and 2024
    activeAgreements.forEach(agreement => {
      const monthlyRent = parseFloat(agreement.agreement_monthly_rent_amount) || 0;
      if (monthlyRent <= 0) return;

      const possessionDate = agreement.agreement_possesion_date ? new Date(agreement.agreement_possesion_date) : null;
      const agreementEnd = agreement.agreement_end_date ? new Date(agreement.agreement_end_date) : null;
      
      if (!possessionDate) return;

      // Calculate 2023 spend
      const start2023 = new Date(year2023, 0, 1);
      const end2023 = new Date(year2023, 11, 31);
      if (possessionDate <= end2023 && (!agreementEnd || agreementEnd >= start2023)) {
        const overlapStart = possessionDate > start2023 ? possessionDate : start2023;
        const overlapEnd = (!agreementEnd || agreementEnd > end2023) ? end2023 : agreementEnd;
        const months2023 = Math.max(0, Math.ceil((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24 * 30)));
        year2023Spend += monthlyRent * Math.min(months2023, 12);
      }

      // Calculate 2024 spend
      const start2024 = new Date(year2024, 0, 1);
      const end2024 = new Date(year2024, 11, 31);
      if (possessionDate <= end2024 && (!agreementEnd || agreementEnd >= start2024)) {
        const overlapStart = possessionDate > start2024 ? possessionDate : start2024;
        const overlapEnd = (!agreementEnd || agreementEnd > end2024) ? end2024 : agreementEnd;
        const months2024 = Math.max(0, Math.ceil((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24 * 30)));
        year2024Spend += monthlyRent * Math.min(months2024, 12);
      }
    });

    // Calculate historical spend over date range
    let historicalSpend = 0;
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      agreements.forEach(agreement => {
        const possessionDate = agreement.agreement_possesion_date ? new Date(agreement.agreement_possesion_date) : null;
        const monthlyRent = parseFloat(agreement.agreement_monthly_rent_amount);
        
        if (possessionDate && !isNaN(monthlyRent) && monthlyRent > 0 && possessionDate >= start && possessionDate <= end) {
          // Calculate months in range
          const monthsInRange = Math.ceil((end - possessionDate) / (1000 * 60 * 60 * 24 * 30));
          historicalSpend += monthlyRent * Math.max(0, monthsInRange);
        }
      });
    }

    res.json({
      totalCurrentMonthlySpend: isNaN(totalCurrentMonthlySpend) ? 0 : totalCurrentMonthlySpend,
      totalCurrentAdvanceSpent: isNaN(totalCurrentAdvanceSpent) ? 0 : totalCurrentAdvanceSpent,
      likelyCostPrediction: isNaN(likelyCostPrediction) ? 0 : likelyCostPrediction,
      historicalSpend: startDate && endDate ? (isNaN(historicalSpend) ? 0 : historicalSpend) : null,
      activeAgreementsCount: activeAgreements.length,
      year2023: isNaN(year2023Spend) ? 0 : year2023Spend,
      year2024: isNaN(year2024Spend) ? 0 : year2024Spend,
      year2025: isNaN(year2025Spend) ? 0 : year2025Spend,
    });
  } catch (error) {
    console.error('Error fetching financial summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET spend over time (Yearly, Half-Yearly, Quarterly, Monthly)
router.get('/spend-over-time', (req, res) => {
  try {
    const { period = 'monthly' } = req.query; // yearly, half-yearly, quarterly, monthly
    // CRITICAL: Get ALL agreements for historical accuracy (includes inactive)
    const agreements = excelReader.getAgreements('all');
    const today = new Date();
    
    let spendData = {};

    agreements.forEach(agreement => {
      if (!agreement.agreement_possesion_date || !agreement.agreement_monthly_rent_amount) return;
      
      const possessionDate = new Date(agreement.agreement_possesion_date);
      const monthlyRent = parseFloat(agreement.agreement_monthly_rent_amount) || 0;
      
      if (period === 'yearly') {
        // For yearly, calculate actual spend for each year based on active agreements during that year
        // BACKWARD COMPATIBILITY: Treat null/undefined status as active
        const status = agreement.status || agreement.agreement_status;
        const isActive = !status || status === 'Active' || status === 'active';
        const currentYear = today.getFullYear();
        const year2023 = 2023;
        const year2024 = 2024;
        const year2025 = 2025;
        
        // Only process years 2023, 2024, 2025
        if (isActive && monthlyRent > 0) {
          const agreementStart = new Date(possessionDate);
          const agreementEnd = agreement.agreement_end_date ? new Date(agreement.agreement_end_date) : null;
          
          // Calculate spend for 2023
          const start2023 = new Date(year2023, 0, 1);
          const end2023 = new Date(year2023, 11, 31);
          if (agreementStart <= end2023 && (!agreementEnd || agreementEnd >= start2023)) {
            const overlapStart = agreementStart > start2023 ? agreementStart : start2023;
            const overlapEnd = (!agreementEnd || agreementEnd > end2023) ? end2023 : agreementEnd;
            const months2023 = Math.max(0, Math.ceil((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24 * 30)));
            if (months2023 > 0) {
              spendData[year2023] = (spendData[year2023] || 0) + (monthlyRent * Math.min(months2023, 12));
            }
          }
          
          // Calculate spend for 2024
          const start2024 = new Date(year2024, 0, 1);
          const end2024 = new Date(year2024, 11, 31);
          if (agreementStart <= end2024 && (!agreementEnd || agreementEnd >= start2024)) {
            const overlapStart = agreementStart > start2024 ? agreementStart : start2024;
            const overlapEnd = (!agreementEnd || agreementEnd > end2024) ? end2024 : agreementEnd;
            const months2024 = Math.max(0, Math.ceil((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24 * 30)));
            if (months2024 > 0) {
              spendData[year2024] = (spendData[year2024] || 0) + (monthlyRent * Math.min(months2024, 12));
            }
          }
        }
      } else if (period === 'half-yearly') {
        const year = possessionDate.getFullYear();
        const half = possessionDate.getMonth() < 6 ? 'H1' : 'H2';
        const key = `${year}-${half}`;
        spendData[key] = (spendData[key] || 0) + (monthlyRent * 6);
      } else if (period === 'quarterly') {
        const year = possessionDate.getFullYear();
        const quarter = Math.floor(possessionDate.getMonth() / 3) + 1;
        const key = `${year}-Q${quarter}`;
        spendData[key] = (spendData[key] || 0) + (monthlyRent * 3);
      } else if (period === 'monthly') {
        // For monthly, calculate spend for each month from possession date to now
        // Only for active agreements (BACKWARD COMPATIBILITY)
        const status = agreement.status || agreement.agreement_status;
        const isActive = !status || status === 'Active' || status === 'active';
        
        if (isActive && monthlyRent > 0) {
          const startDate = new Date(possessionDate);
          const endDate = new Date(today);
          
          // Calculate monthly spend for each month from possession to now
          let currentDate = new Date(startDate);
          currentDate.setDate(1); // Start from first day of month
          
          while (currentDate <= endDate) {
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth() + 1;
            const key = `${year}-${String(month).padStart(2, '0')}`;
            
            // Ensure we're adding valid numbers
            const currentAmount = parseFloat(spendData[key]) || 0;
            const rentAmount = parseFloat(monthlyRent) || 0;
            spendData[key] = currentAmount + rentAmount;
            
            // Move to next month
            currentDate.setMonth(currentDate.getMonth() + 1);
          }
        }
      }
    });

    // Convert to array format for charts, ensuring all values are valid numbers
    let result = Object.entries(spendData)
      .map(([period, amount]) => {
        const numAmount = parseFloat(amount) || 0;
        return { 
          period: period.toString(), 
          amount: isNaN(numAmount) ? 0 : numAmount 
        };
      })
      .filter(item => item.amount > 0); // Filter out zero amounts

    // For yearly period, filter to only include 2023, 2024, 2025
    if (period === 'yearly') {
      const currentYear = today.getFullYear();
      const allowedYears = [
        (currentYear - 1).toString(), // Previous year (2023)
        currentYear.toString(),      // Current year (2024)
        (currentYear + 1).toString(), // Next year (2025)
      ];
      result = result.filter(item => allowedYears.includes(item.period));
    }

    result.sort((a, b) => a.period.localeCompare(b.period));

    res.json(result);
  } catch (error) {
    console.error('Error fetching spend over time:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET employee breakdown by Department and Status
router.get('/employee-breakdown', (req, res) => {
  try {
    const employees = excelReader.getEmployees('all'); // Get all for accurate counts
    
    // BACKWARD COMPATIBILITY: Treat null/undefined status as active
    const activeEmployees = employees.filter(e => {
      const status = e.status || e.employee_status;
      return !status || status === 'Active' || status === 'active';
    });
    
    // Use reduce() to group by employee_department and count employee_id occurrences
    const departmentBreakdown = employees.reduce((acc, employee) => {
      // BACKWARD COMPATIBILITY: Only count active employees
      const status = employee.status || employee.employee_status;
      const isActive = !status || status === 'Active' || status === 'active';
      
      if (isActive) {
        const department = employee.employee_department || 'Unassigned';
        const departmentKey = department.trim() || 'Unassigned';
        
        // Count each employee_id in the department
        if (!acc[departmentKey]) {
          acc[departmentKey] = 0;
        }
        acc[departmentKey]++;
      }
      
      return acc;
    }, {});

    // Convert to array format - structure: [{ category: 'FINISHING', value: 15 }, { category: 'ACCOUNTS', value: 8 }, ...]
    const departmentData = Object.entries(departmentBreakdown)
      .map(([department, count]) => {
        const category = department.toUpperCase().trim();
        const value = parseInt(count) || 0;
        return { category, value };
      })
      .filter(item => item.value > 0) // Filter out zero counts
      .sort((a, b) => b.value - a.value); // Sort by value descending

    // Also calculate status breakdown with BACKWARD COMPATIBILITY
    const statusBreakdown = employees.reduce((acc, employee) => {
      const status = employee.status || employee.employee_status;
      if (!status || status === 'Active' || status === 'active') {
        acc.Active = (acc.Active || 0) + 1;
      } else if (status === 'Inactive' || status === 'inactive') {
        acc.Inactive = (acc.Inactive || 0) + 1;
      } else {
        // Unknown status - treat as active for backward compatibility
        acc.Active = (acc.Active || 0) + 1;
      }
      return acc;
    }, { Active: 0, Inactive: 0 });

    const statusData = Object.entries(statusBreakdown)
      .map(([status, count]) => ({ status, count }));

    if (departmentData.length === 0 && activeEmployees.length === 0) {
      res.json({
        byDepartment: [],
        byStatus: statusData,
        total: employees.length,
      });
      return;
    }

    res.json({
      byDepartment: departmentData, // Always return array (empty if no data)
      byStatus: statusData,
      total: employees.length,
    });
  } catch (error) {
    console.error('Error fetching employee breakdown:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET monthly rent cost per department
router.get('/department-rent-cost', (req, res) => {
  try {
    const employees = excelReader.getEmployees('all'); // Get all for accurate calculations
    const agreements = excelReader.getAgreements('all'); // Get all for accurate calculations
    
    // Filter active agreements with BACKWARD COMPATIBILITY
    const activeAgreements = agreements.filter(a => {
      const status = a.status || a.agreement_status;
      return !status || status === 'Active' || status === 'active';
    });
    
    // Create a map of agreement_id to monthly_rent_amount for quick lookup
    const agreementRentMap = {};
    activeAgreements.forEach(agreement => {
      const rent = parseFloat(agreement.agreement_monthly_rent_amount) || 0;
      if (rent > 0) {
        agreementRentMap[agreement.agreement_id] = rent;
      }
    });
    
    // Group employees by department and sum their allocated agreement rents
    const departmentRentMap = {};
    
    employees.forEach(employee => {
      // BACKWARD COMPATIBILITY: Only count active employees with allocated agreements
      const status = employee.status || employee.employee_status;
      const isActive = !status || status === 'Active' || status === 'active';
      const agreementId = employee.emplyee_allocated_agreement_id;
      
      if (isActive && agreementId && agreementId.toString().trim() !== '') {
        const department = employee.employee_department || 'Unassigned';
        const monthlyRent = agreementRentMap[agreementId] || 0;
        
        if (monthlyRent > 0) {
          if (!departmentRentMap[department]) {
            departmentRentMap[department] = 0;
          }
          departmentRentMap[department] += monthlyRent;
        }
      }
    });
    
    // Convert to array format and sort by rent cost descending
    const departmentRentData = Object.entries(departmentRentMap)
      .map(([department, totalRent]) => ({
        department: department.toUpperCase().trim(),
        totalRent: parseFloat(totalRent) || 0,
      }))
      .filter(item => item.totalRent > 0)
      .sort((a, b) => b.totalRent - a.totalRent); // Sort descending
    
    res.json(departmentRentData);
  } catch (error) {
    console.error('Error fetching department rent cost:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


module.exports = router;

