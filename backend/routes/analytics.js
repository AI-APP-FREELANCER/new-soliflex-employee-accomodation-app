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

    // Filter active employees and agreements
    const activeEmployees = employees.filter(e => 
      e.employee_status === 'Active' || e.employee_status === 'active'
    );

    const occupancy = activeEmployees
      .map(employee => {
        // Find the agreement for this employee
        const agreement = agreements.find(a => 
          a.agreement_id === employee.emplyee_allocated_agreement_id &&
          (a.agreement_status === 'Active' || a.agreement_status === 'active')
        );

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
    const activeEmployeesWithAgreement = employees.filter(e => {
      // Check if employee is Active
      const isActive = e.employee_status === 'Active' || e.employee_status === 'active';
      // Check if emplyee_allocated_agreement_id is NOT NULL and not empty
      const hasAgreement = e.emplyee_allocated_agreement_id != null && 
                          e.emplyee_allocated_agreement_id !== '' && 
                          e.emplyee_allocated_agreement_id.toString().trim() !== '';
      return isActive && hasAgreement;
    }).length;

    // Sum of residence_house_count for all residence_master where status = Active
    const activeResidences = residences.filter(r => 
      r.residence_status === 'Active' || r.residence_status === 'active'
    );
    
    const totalAvailableHouses = activeResidences.reduce((sum, r) => {
      const houseCount = parseInt(r.residence_house_count) || 0;
      return sum + houseCount;
    }, 0);

    // Calculate occupancy rate: (activeEmployeesWithAgreement / totalAvailableHouses) * 100
    const occupancyRate = totalAvailableHouses > 0
      ? ((activeEmployeesWithAgreement / totalAvailableHouses) * 100)
      : null; // Return null if denominator is zero

    // Diagnostic output
    console.log('=== Occupancy Rate Calculation ===');
    console.log(`Total Employees: ${employees.length}`);
    console.log(`Active Employees with Agreement: ${activeEmployeesWithAgreement}`);
    console.log(`Total Active Residences: ${activeResidences.length}`);
    console.log(`Total Available Houses Count: ${totalAvailableHouses}`);
    console.log(`Calculation: (${activeEmployeesWithAgreement} / ${totalAvailableHouses}) * 100`);
    console.log(`Occupancy Rate: ${occupancyRate !== null ? occupancyRate.toFixed(2) : 'N/A'}%`);
    
    // Additional debug: Show sample residence house counts
    if (activeResidences.length > 0) {
      console.log('Sample Active Residences (first 5):');
      activeResidences.slice(0, 5).forEach(r => {
        console.log(`  - ${r.residence_id}: house_count = ${r.residence_house_count} (parsed: ${parseInt(r.residence_house_count) || 0})`);
      });
    }
    console.log('==================================');

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
    const employees = excelReader.getEmployees();
    
    // DEBUG: Log sample employee statuses to see actual values
    console.log('=== Employee Status Calculation ===');
    console.log(`Total Employees Loaded: ${employees.length}`);
    if (employees.length > 0) {
      console.log('Sample Employee Statuses (first 10):');
      employees.slice(0, 10).forEach((emp, idx) => {
        console.log(`  ${idx + 1}. employee_id: ${emp.employee_id}, employee_status: "${emp.employee_status}" (type: ${typeof emp.employee_status})`);
      });
    }
    
    // Case-sensitive filter: Count where employee_status equals 'Active' or 'Inactive' exactly
    // Also handle common variations
    let activeCount = 0;
    let inactiveCount = 0;
    const statusMap = {}; // Track all unique status values found

    employees.forEach(employee => {
      const status = employee.employee_status;
      
      // Track all unique status values for debugging
      if (status) {
        statusMap[status] = (statusMap[status] || 0) + 1;
      }
      
      // Case-sensitive check: 'Active' (exact match)
      if (status === 'Active') {
        activeCount++;
      } 
      // Case-sensitive check: 'Inactive' (exact match)
      else if (status === 'Inactive') {
        inactiveCount++;
      }
      // Fallback for case variations (but log as warning)
      else if (status && typeof status === 'string') {
        const statusLower = status.trim().toLowerCase();
        if (statusLower === 'active') {
          console.warn(`Found lowercase 'active' status for employee ${employee.employee_id}, converting to Active`);
          activeCount++;
        } else if (statusLower === 'inactive') {
          console.warn(`Found lowercase 'inactive' status for employee ${employee.employee_id}, converting to Inactive`);
          inactiveCount++;
        }
      }
    });

    // Diagnostic output
    console.log('Status Value Distribution:', JSON.stringify(statusMap, null, 2));
    console.log(`Active Count (status = 'Active'): ${activeCount}`);
    console.log(`Inactive Count (status = 'Inactive'): ${inactiveCount}`);
    console.log(`Total Employees: ${employees.length}`);
    console.log('====================================');

    res.json({
      activeCount,
      inactiveCount,
      total: employees.length,
    });
  } catch (error) {
    console.error('Error fetching employee status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET renewal alerts (agreements expiring within specified days)
router.get('/renewal-alerts', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 60;
    const agreements = excelReader.getAgreements();
    const residences = excelReader.getResidences();

    const today = new Date();
    const alertDate = new Date(today);
    alertDate.setDate(today.getDate() + days);

    const alerts = agreements
      .filter(agreement => {
        // Only active agreements
        if (agreement.agreement_status !== 'Active' && agreement.agreement_status !== 'active') {
          return false;
        }

        // Check if renewal due date is within the alert period
        if (!agreement.agreement_renewal_due_date) {
          return false;
        }

        const renewalDate = new Date(agreement.agreement_renewal_due_date);
        return renewalDate <= alertDate && renewalDate >= today;
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
    const agreements = excelReader.getAgreements();
    const { startDate, endDate } = req.query;

    // Filter active agreements
    const activeAgreements = agreements.filter(a => 
      a.agreement_status === 'Active' || a.agreement_status === 'active'
    );

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
    const agreements = excelReader.getAgreements();
    const today = new Date();
    
    let spendData = {};

    agreements.forEach(agreement => {
      if (!agreement.agreement_possesion_date || !agreement.agreement_monthly_rent_amount) return;
      
      const possessionDate = new Date(agreement.agreement_possesion_date);
      const monthlyRent = parseFloat(agreement.agreement_monthly_rent_amount) || 0;
      
      if (period === 'yearly') {
        // For yearly, calculate actual spend for each year based on active agreements during that year
        const isActive = agreement.agreement_status === 'Active' || agreement.agreement_status === 'active';
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
        // Only for active agreements
        const isActive = agreement.agreement_status === 'Active' || agreement.agreement_status === 'active';
        
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
    const employees = excelReader.getEmployees();
    
    console.log('=== Employee Department Breakdown ===');
    console.log(`Total Employees Loaded: ${employees.length}`);
    
    // Filter to only include active employees for department breakdown
    // Case-sensitive: status must equal 'Active' exactly
    const activeEmployees = employees.filter(e => {
      const status = e.employee_status;
      return status === 'Active' || (status && typeof status === 'string' && status.trim().toLowerCase() === 'active');
    });
    
    console.log(`Active Employees Found: ${activeEmployees.length}`);
    
    // Use reduce() to group by employee_department and count employee_id occurrences
    const departmentBreakdown = employees.reduce((acc, employee) => {
      // Only count active employees
      const status = employee.employee_status;
      const isActive = status === 'Active' || (status && typeof status === 'string' && status.trim().toLowerCase() === 'active');
      
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

    // Also calculate status breakdown
    const statusBreakdown = employees.reduce((acc, employee) => {
      const status = employee.employee_status;
      if (status === 'Active') {
        acc.Active = (acc.Active || 0) + 1;
      } else if (status === 'Inactive') {
        acc.Inactive = (acc.Inactive || 0) + 1;
      }
      return acc;
    }, { Active: 0, Inactive: 0 });

    const statusData = Object.entries(statusBreakdown)
      .map(([status, count]) => ({ status, count }));

    // Diagnostic output
    console.log('Department Breakdown Object:', JSON.stringify(departmentBreakdown, null, 2));
    console.log('Department Data Array:', JSON.stringify(departmentData, null, 2));
    console.log(`Total Active Employees: ${activeEmployees.length}`);
    console.log(`Total Departments Found: ${departmentData.length}`);
    
    if (departmentData.length === 0) {
      console.warn('WARNING: No department data found! Check if employees have employee_department values.');
      if (activeEmployees.length > 0) {
        console.log('Sample Active Employees (first 5):');
        activeEmployees.slice(0, 5).forEach(emp => {
          console.log(`  - ${emp.employee_id}: department = "${emp.employee_department}"`);
        });
      }
    }
    console.log('=====================================');

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
    const employees = excelReader.getEmployees();
    const agreements = excelReader.getAgreements();
    
    console.log('=== Department Rent Cost Calculation ===');
    console.log(`Total Employees: ${employees.length}`);
    console.log(`Total Agreements: ${agreements.length}`);
    
    // Filter active agreements
    const activeAgreements = agreements.filter(a => 
      a.agreement_status === 'Active' || a.agreement_status === 'active'
    );
    
    // Create a map of agreement_id to monthly_rent_amount for quick lookup
    const agreementRentMap = {};
    activeAgreements.forEach(agreement => {
      const rent = parseFloat(agreement.agreement_monthly_rent_amount) || 0;
      if (rent > 0) {
        agreementRentMap[agreement.agreement_id] = rent;
      }
    });
    
    console.log(`Active Agreements: ${activeAgreements.length}`);
    console.log(`Agreements with Rent > 0: ${Object.keys(agreementRentMap).length}`);
    
    // Group employees by department and sum their allocated agreement rents
    const departmentRentMap = {};
    
    employees.forEach(employee => {
      // Only count active employees with allocated agreements
      const isActive = employee.employee_status === 'Active' || employee.employee_status === 'active';
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
    
    console.log('Department Rent Cost Data:', JSON.stringify(departmentRentData, null, 2));
    console.log(`Total Departments with Rent: ${departmentRentData.length}`);
    console.log('========================================');
    
    res.json(departmentRentData);
  } catch (error) {
    console.error('Error fetching department rent cost:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET cost optimization recommendations
router.get('/cost-optimization-recommendations', (req, res) => {
  try {
    const residences = excelReader.getResidences();
    const agreements = excelReader.getAgreements();
    const recommendations = [];

    // Check for properties with lowest house count (potential consolidation)
    const activeResidences = residences.filter(r => 
      r.residence_status === 'Active' || r.residence_status === 'active'
    );
    
    const sortedByHouseCount = [...activeResidences].sort((a, b) => 
      (parseInt(a.residence_house_count) || 0) - (parseInt(b.residence_house_count) || 0)
    );

    if (sortedByHouseCount.length > 0 && (parseInt(sortedByHouseCount[0].residence_house_count) || 0) < 3) {
      recommendations.push({
        type: 'consolidation',
        priority: 'medium',
        message: `Review properties with lowest house count (${sortedByHouseCount[0].residence_house_count}) for potential consolidation. Property: ${sortedByHouseCount[0].residence_id}`,
      });
    }

    // Check for upcoming high-value renewals
    const today = new Date();
    const next60Days = new Date(today);
    next60Days.setDate(today.getDate() + 60);

    const upcomingRenewals = agreements.filter(agreement => {
      if (agreement.agreement_status !== 'Active' && agreement.agreement_status !== 'active') return false;
      if (!agreement.agreement_renewal_due_date) return false;
      
      const renewalDate = new Date(agreement.agreement_renewal_due_date);
      return renewalDate >= today && renewalDate <= next60Days;
    });

    const highValueRenewals = upcomingRenewals.filter(agreement => {
      const monthlyRent = parseFloat(agreement.agreement_monthly_rent_amount) || 0;
      return monthlyRent > 50000; // High value threshold
    });

    if (highValueRenewals.length > 0) {
      const totalValue = highValueRenewals.reduce((sum, a) => 
        sum + (parseFloat(a.agreement_monthly_rent_amount) || 0), 0
      );
      recommendations.push({
        type: 'renewal',
        priority: 'high',
        message: `${highValueRenewals.length} high-value renewal(s) approaching within 60 days. Total monthly rent: ₹${totalValue.toLocaleString()}. Review and negotiate terms.`,
      });
    }

    // Check for properties with high advance amounts
    const activeAgreements = agreements.filter(a => 
      a.agreement_status === 'Active' || a.agreement_status === 'active'
    );
    
    const highAdvanceAgreements = activeAgreements.filter(agreement => {
      const advance = parseFloat(agreement.agreement_advance_amount) || 0;
      return advance > 200000; // High advance threshold
    });

    if (highAdvanceAgreements.length > 0) {
      recommendations.push({
        type: 'advance',
        priority: 'low',
        message: `${highAdvanceAgreements.length} agreement(s) with high advance amounts (>₹2,00,000). Consider negotiating lower advance amounts in future agreements.`,
      });
    }

    // Check for inactive properties that could be vacated
    const inactiveResidences = residences.filter(r => 
      r.residence_status === 'Inactive' || r.residence_status === 'inactive'
    );

    if (inactiveResidences.length > 0) {
      recommendations.push({
        type: 'vacancy',
        priority: 'low',
        message: `${inactiveResidences.length} inactive residence(s). Review if these can be reactivated or removed from portfolio.`,
      });
    }

    res.json({
      recommendations,
      count: recommendations.length,
    });
  } catch (error) {
    console.error('Error fetching cost optimization recommendations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

