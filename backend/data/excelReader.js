const XLSX = require('xlsx');
const path = require('path');

class ExcelReader {
  constructor() {
    this.data = {
      residence_master: [],
      agreement_master: [],
      employee_master: []
    };
    this.loaded = false;
  }

  /**
   * Convert Excel date to YYYY-MM-DD format
   * Handles Excel serial dates, date strings, and validates range
   */
  convertExcelDate(dateValue) {
    if (!dateValue && dateValue !== 0) return null;
    
    // If it's already a string in YYYY-MM-DD format, validate and return
    if (typeof dateValue === 'string') {
      // Check if it's a valid date string
      const dateMatch = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (dateMatch) {
        const year = parseInt(dateMatch[1]);
        // Validate year is in expected range (2023+)
        if (year >= 2023 && year <= 2100) {
          return dateValue;
        }
      }
      
      // Try to parse other date formats
      const date = new Date(dateValue);
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        if (year >= 2023 && year <= 2100) {
          return date.toISOString().split('T')[0]; // Return YYYY-MM-DD
        }
      }
    }
    
    // If it's a number, it might be an Excel serial date
    if (typeof dateValue === 'number') {
      // Excel serial dates: days since January 1, 1900
      // Excel incorrectly treats 1900 as leap year, so we adjust
      // Excel day 1 = Jan 1, 1900, but we use Dec 30, 1899 as epoch
      const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
      const jsDate = new Date(excelEpoch.getTime() + (dateValue - 1) * 24 * 60 * 60 * 1000);
      
      if (!isNaN(jsDate.getTime())) {
        const year = jsDate.getFullYear();
        // Only convert if it's in the expected range
        if (year >= 2023 && year <= 2100) {
          return jsDate.toISOString().split('T')[0]; // Return YYYY-MM-DD
        }
      }
    }
    
    // If conversion failed or date is out of range, return null
    return null;
  }

  /**
   * Calculate renewal due date: possession date + 11 months (default contract length).
   * Returns YYYY-MM-DD or null if possession date is invalid/missing.
   */
  calculateRenewalDueDate(possessionDate, durationMonths = 11) {
    if (!possessionDate) return null;
    const start = new Date(possessionDate);
    if (isNaN(start.getTime())) return null;

    // Calculate end date by adding duration months
    const end = new Date(start);
    end.setMonth(end.getMonth() + durationMonths);

    // Normalize time to avoid timezone shifts when converting to ISO
    end.setHours(12, 0, 0, 0);

    return end.toISOString().split('T')[0];
  }

  loadData() {
    try {
      const excelPath = path.join(__dirname, '../../agreement.xlsx');
      const workbook = XLSX.readFile(excelPath, {
        cellDates: true, // Try to parse dates automatically
        cellNF: false
      });
      
      const sheets = ['residence_master', 'agreement_master', 'employee_master'];
      
      sheets.forEach(sheetName => {
        if (workbook.SheetNames.includes(sheetName)) {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, {
            raw: false, // Convert dates to strings instead of Excel serial numbers
            dateNF: 'yyyy-mm-dd' // Format dates as YYYY-MM-DD
          });
          
          // Post-process to ensure date fields are properly formatted
          const processedData = jsonData.map(row => {
            const processedRow = { ...row };
            
            // Convert date fields based on sheet type
            if (sheetName === 'agreement_master') {
              processedRow.agreement_possesion_date = this.convertExcelDate(processedRow.agreement_possesion_date);
              processedRow.agreement_renewal_due_date = this.convertExcelDate(processedRow.agreement_renewal_due_date);
              processedRow.agreement_vacate_date = this.convertExcelDate(processedRow.agreement_vacate_date);

              // Initialize new vacate and refund fields with defaults if missing
              processedRow.agreement_scheduled_to_vacate = processedRow.agreement_scheduled_to_vacate === true || 
                                                          processedRow.agreement_scheduled_to_vacate === 'Yes' || 
                                                          processedRow.agreement_scheduled_to_vacate === 'yes' || 
                                                          false;
              processedRow.agreement_advance_due_back = parseFloat(processedRow.agreement_advance_due_back) || 0;
              processedRow.agreement_advance_received = parseFloat(processedRow.agreement_advance_received) || 0;
              processedRow.agreement_maintenance_cut = parseFloat(processedRow.agreement_maintenance_cut) || 0;
              processedRow.agreement_notice_period_days = processedRow.agreement_notice_period_days != null ? parseInt(processedRow.agreement_notice_period_days, 10) : null;
              processedRow.agreement_notice_due_by_date = this.convertExcelDate(processedRow.agreement_notice_due_by_date) || processedRow.agreement_notice_due_by_date || null;
              processedRow.agreement_statutory_status = processedRow.agreement_statutory_status != null ? String(processedRow.agreement_statutory_status) : null;
              processedRow.agreement_document_location = processedRow.agreement_document_location != null ? String(processedRow.agreement_document_location) : null;

              // Always align renewal due date to possession date (11 months - 90 days)
              const calculatedRenewal = this.calculateRenewalDueDate(processedRow.agreement_possesion_date);
              if (calculatedRenewal) {
                processedRow.agreement_renewal_due_date = calculatedRenewal;
              }
            } else if (sheetName === 'employee_master') {
              processedRow.employee_date_of_joining = this.convertExcelDate(processedRow.employee_date_of_joining);
              processedRow.employee_last_working_date = this.convertExcelDate(processedRow.employee_last_working_date) || processedRow.employee_last_working_date || null;
              processedRow.employee_notice_served = processedRow.employee_notice_served === true || processedRow.employee_notice_served === 'Yes' || processedRow.employee_notice_served === 'yes' || false;
            } else if (sheetName === 'residence_master') {
              processedRow.residence_owner_rating = processedRow.residence_owner_rating != null ? String(processedRow.residence_owner_rating) : null;
            }
            
            return processedRow;
          });
          
          this.data[sheetName] = processedData;
        } else {
          // If sheet missing, skip silently to avoid noisy logs in production
        }
      });
      
      this.loaded = true;
      return this.data;
    } catch (error) {
      console.error('Error loading Excel data:', error.message);
      // Return empty data structure if file doesn't exist
      this.loaded = true;
      return this.data;
    }
  }

  getResidences(statusFilter = 'active') {
    if (!this.loaded) this.loadData();
    let residences = this.data.residence_master;
    
    // Initialize lifecycle fields if missing (but don't mutate original data)
    residences = residences.map(r => {
      const residence = { ...r };
      if (!residence.status) {
        const legacyStatus = residence.residence_status || 'Active';
        residence.status = (legacyStatus === 'Active' || legacyStatus === 'active') ? 'active' : 'inactive';
        residence.activeDate = residence.activeDate || (residence.status === 'active' ? new Date().toISOString() : null);
        residence.inactiveDate = residence.inactiveDate || (residence.status === 'inactive' ? new Date().toISOString() : null);
        residence.statusHistory = residence.statusHistory || [];
        if (residence.statusHistory.length === 0 && residence.activeDate) {
          residence.statusHistory.push({ status: residence.status, date: residence.activeDate, reason: 'Initial creation' });
        }
      }
      return residence;
    });
    
    // Apply status filter with BACKWARD COMPATIBILITY
    // CRITICAL: A record is ACTIVE if status === 'active' OR status is null/undefined
    if (statusFilter === 'active') {
      return residences.filter(r => !r.status || r.status === 'active' || r.status === null || r.status === undefined);
    } else if (statusFilter === 'inactive') {
      return residences.filter(r => r.status === 'inactive');
    }
    // 'all' returns everything
    return residences;
  }

  getAgreements(statusFilter = 'active') {
    if (!this.loaded) this.loadData();
    let agreements = this.data.agreement_master;
    
    // Initialize lifecycle fields if missing (but don't mutate original data)
    agreements = agreements.map(a => {
      const agreement = { ...a };
      if (!agreement.status) {
        const legacyStatus = agreement.agreement_status || 'Active';
        agreement.status = (legacyStatus === 'Active' || legacyStatus === 'active') ? 'active' : 'inactive';
        agreement.activeDate = agreement.activeDate || (agreement.status === 'active' ? new Date().toISOString() : null);
        agreement.inactiveDate = agreement.inactiveDate || (agreement.status === 'inactive' ? new Date().toISOString() : null);
        agreement.statusHistory = agreement.statusHistory || [];
        if (agreement.statusHistory.length === 0 && agreement.activeDate) {
          agreement.statusHistory.push({ status: agreement.status, date: agreement.activeDate, reason: 'Initial creation' });
        }
      }
      return agreement;
    });
    
    // Apply status filter with BACKWARD COMPATIBILITY
    // CRITICAL: A record is ACTIVE if status === 'active' OR status is null/undefined
    if (statusFilter === 'active') {
      return agreements.filter(a => !a.status || a.status === 'active' || a.status === null || a.status === undefined);
    } else if (statusFilter === 'inactive') {
      return agreements.filter(a => a.status === 'inactive');
    }
    // 'all' returns everything
    return agreements;
  }

  getEmployees(statusFilter = 'active') {
    if (!this.loaded) this.loadData();
    let employees = this.data.employee_master;
    
    // Initialize lifecycle fields if missing (but don't mutate original data)
    employees = employees.map(e => {
      const employee = { ...e };
      if (!employee.status) {
        const legacyStatus = employee.employee_status || 'Active';
        employee.status = (legacyStatus === 'Active' || legacyStatus === 'active') ? 'active' : 'inactive';
        employee.activeDate = employee.activeDate || (employee.status === 'active' ? new Date().toISOString() : null);
        employee.inactiveDate = employee.inactiveDate || (employee.status === 'inactive' ? new Date().toISOString() : null);
        employee.statusHistory = employee.statusHistory || [];
        if (employee.statusHistory.length === 0 && employee.activeDate) {
          employee.statusHistory.push({ status: employee.status, date: employee.activeDate, reason: 'Initial creation' });
        }
      }
      return employee;
    });
    
    // Apply status filter with BACKWARD COMPATIBILITY
    // CRITICAL: A record is ACTIVE if status === 'active' OR status is null/undefined
    if (statusFilter === 'active') {
      return employees.filter(e => !e.status || e.status === 'active' || e.status === null || e.status === undefined);
    } else if (statusFilter === 'inactive') {
      return employees.filter(e => e.status === 'inactive');
    }
    // 'all' returns everything
    return employees;
  }

  // Update methods for in-memory data
  updateResidence(residenceId, updates) {
    const index = this.data.residence_master.findIndex(r => r.residence_id === residenceId);
    if (index !== -1) {
      const residence = this.data.residence_master[index];
      const now = new Date().toISOString();
      
      // Handle status changes
      if (updates.status && updates.status !== residence.status) {
        if (updates.status === 'active' && residence.status === 'inactive') {
          // Reactivating
          residence.activeDate = now;
          residence.inactiveDate = null;
        } else if (updates.status === 'inactive' && residence.status === 'active') {
          // Deactivating
          residence.inactiveDate = now;
        }
        residence.status = updates.status;
        residence.residence_status = updates.status === 'active' ? 'Active' : 'Inactive';
        residence.statusHistory = residence.statusHistory || [];
        residence.statusHistory.push({
          status: updates.status,
          date: now,
          reason: updates.reason || 'Status updated'
        });
        delete updates.status;
        delete updates.reason;
      }
      
      this.data.residence_master[index] = { ...residence, ...updates };
      return this.data.residence_master[index];
    }
    return null;
  }

  addResidence(residence) {
    // Initialize lifecycle fields for new residence
    const now = new Date().toISOString();
    residence.status = residence.status || 'active';
    residence.activeDate = residence.activeDate || now;
    residence.inactiveDate = residence.inactiveDate || null;
    residence.statusHistory = residence.statusHistory || [{
      status: residence.status,
      date: residence.activeDate,
      reason: 'Initial creation'
    }];
    // Sync legacy status
    residence.residence_status = residence.status === 'active' ? 'Active' : 'Inactive';
    
    this.data.residence_master.push(residence);
    return residence;
  }
  
  deactivateResidence(residenceId, reason = 'Marked inactive by user') {
    const index = this.data.residence_master.findIndex(r => r.residence_id === residenceId);
    if (index !== -1) {
      const now = new Date().toISOString();
      const residence = this.data.residence_master[index];
      residence.status = 'inactive';
      residence.inactiveDate = now;
      residence.residence_status = 'Inactive';
      residence.statusHistory = residence.statusHistory || [];
      residence.statusHistory.push({
        status: 'inactive',
        date: now,
        reason: reason
      });
      return residence;
    }
    return null;
  }

  updateAgreement(agreementId, updates) {
    const index = this.data.agreement_master.findIndex(a => a.agreement_id === agreementId);
    if (index !== -1) {
      const agreement = this.data.agreement_master[index];
      const now = new Date().toISOString();
      
      // Handle status changes
      if (updates.status && updates.status !== agreement.status) {
        if (updates.status === 'active' && agreement.status === 'inactive') {
          // Reactivating
          agreement.activeDate = now;
          agreement.inactiveDate = null;
        } else if (updates.status === 'inactive' && agreement.status === 'active') {
          // Deactivating
          agreement.inactiveDate = now;
          // When status becomes inactive, set advance_due_back if not already set
          if (!agreement.agreement_advance_due_back || agreement.agreement_advance_due_back === 0) {
            agreement.agreement_advance_due_back = parseFloat(agreement.agreement_advance_amount) || 0;
          }
        }
        agreement.status = updates.status;
        agreement.agreement_status = updates.status === 'active' ? 'Active' : 'Inactive';
        agreement.statusHistory = agreement.statusHistory || [];
        agreement.statusHistory.push({
          status: updates.status,
          date: now,
          reason: updates.reason || 'Status updated'
        });
        delete updates.status;
        delete updates.reason;
      }

      // Handle vacate date conversion if provided
      if (updates.agreement_vacate_date) {
        updates.agreement_vacate_date = this.convertExcelDate(updates.agreement_vacate_date) || updates.agreement_vacate_date;
      }

      // Handle numeric fields for refund
      if (updates.agreement_maintenance_cut !== undefined) {
        updates.agreement_maintenance_cut = parseFloat(updates.agreement_maintenance_cut) || 0;
      }
      if (updates.agreement_advance_received !== undefined) {
        updates.agreement_advance_received = parseFloat(updates.agreement_advance_received) || 0;
      }
      if (updates.agreement_advance_due_back !== undefined) {
        updates.agreement_advance_due_back = parseFloat(updates.agreement_advance_due_back) || 0;
      }

      // Handle scheduled_to_vacate boolean conversion
      if (updates.agreement_scheduled_to_vacate !== undefined) {
        updates.agreement_scheduled_to_vacate = updates.agreement_scheduled_to_vacate === true || 
                                              updates.agreement_scheduled_to_vacate === 'Yes' || 
                                              updates.agreement_scheduled_to_vacate === 'yes' || 
                                              false;
      }

      const merged = { ...agreement, ...updates };

      // Recalculate renewal due date whenever possession date changes or when missing
      const possessionForCalc = merged.agreement_possesion_date;
      const recalculatedDue = this.calculateRenewalDueDate(possessionForCalc);
      if (recalculatedDue) {
        merged.agreement_renewal_due_date = recalculatedDue;
      }

      this.data.agreement_master[index] = merged;
      return merged;
    }
    return null;
  }

  addAgreement(agreement) {
    const agreementWithDue = { ...agreement };
    const calculatedDue = this.calculateRenewalDueDate(agreementWithDue.agreement_possesion_date);
    if (calculatedDue) {
      agreementWithDue.agreement_renewal_due_date = calculatedDue;
    }
    
    // Initialize lifecycle fields for new agreement
    const now = new Date().toISOString();
    agreementWithDue.status = agreementWithDue.status || 'active';
    agreementWithDue.activeDate = agreementWithDue.activeDate || now;
    agreementWithDue.inactiveDate = agreementWithDue.inactiveDate || null;
    agreementWithDue.statusHistory = agreementWithDue.statusHistory || [{
      status: agreementWithDue.status,
      date: agreementWithDue.activeDate,
      reason: 'Initial creation'
    }];
    // Sync legacy status
    agreementWithDue.agreement_status = agreementWithDue.status === 'active' ? 'Active' : 'Inactive';

    // Initialize new vacate and refund fields with defaults
    agreementWithDue.agreement_scheduled_to_vacate = agreementWithDue.agreement_scheduled_to_vacate === true || 
                                                     agreementWithDue.agreement_scheduled_to_vacate === 'Yes' || 
                                                     agreementWithDue.agreement_scheduled_to_vacate === 'yes' || 
                                                     false;
    agreementWithDue.agreement_vacate_date = agreementWithDue.agreement_vacate_date || null;
    agreementWithDue.agreement_advance_due_back = parseFloat(agreementWithDue.agreement_advance_due_back) || 0;
    agreementWithDue.agreement_advance_received = parseFloat(agreementWithDue.agreement_advance_received) || 0;
    agreementWithDue.agreement_maintenance_cut = parseFloat(agreementWithDue.agreement_maintenance_cut) || 0;

    // Convert vacate date if provided
    if (agreementWithDue.agreement_vacate_date) {
      agreementWithDue.agreement_vacate_date = this.convertExcelDate(agreementWithDue.agreement_vacate_date) || agreementWithDue.agreement_vacate_date;
    }

    this.data.agreement_master.push(agreementWithDue);
    return agreementWithDue;
  }
  
  deactivateAgreement(agreementId, reason = 'Marked inactive by user') {
    const index = this.data.agreement_master.findIndex(a => a.agreement_id === agreementId);
    if (index !== -1) {
      const now = new Date().toISOString();
      const agreement = this.data.agreement_master[index];
      agreement.status = 'inactive';
      agreement.inactiveDate = now;
      agreement.agreement_status = 'Inactive';
      agreement.statusHistory = agreement.statusHistory || [];
      agreement.statusHistory.push({
        status: 'inactive',
        date: now,
        reason: reason
      });
      return agreement;
    }
    return null;
  }

  updateEmployee(employeeId, updates) {
    const index = this.data.employee_master.findIndex(e => e.employee_id === employeeId);
    if (index !== -1) {
      const employee = this.data.employee_master[index];
      const now = new Date().toISOString();
      
      // Handle status changes
      if (updates.status && updates.status !== employee.status) {
        if (updates.status === 'active' && employee.status === 'inactive') {
          // Reactivating
          employee.activeDate = now;
          employee.inactiveDate = null;
        } else if (updates.status === 'inactive' && employee.status === 'active') {
          // Deactivating
          employee.inactiveDate = now;
        }
        employee.status = updates.status;
        employee.employee_status = updates.status === 'active' ? 'Active' : 'Inactive';
        employee.statusHistory = employee.statusHistory || [];
        employee.statusHistory.push({
          status: updates.status,
          date: now,
          reason: updates.reason || 'Status updated'
        });
        delete updates.status;
        delete updates.reason;
      }
      
      this.data.employee_master[index] = { ...employee, ...updates };
      return this.data.employee_master[index];
    }
    return null;
  }

  addEmployee(employee) {
    // Initialize lifecycle fields for new employee
    const now = new Date().toISOString();
    employee.status = employee.status || 'active';
    employee.activeDate = employee.activeDate || now;
    employee.inactiveDate = employee.inactiveDate || null;
    employee.statusHistory = employee.statusHistory || [{
      status: employee.status,
      date: employee.activeDate,
      reason: 'Initial creation'
    }];
    // Sync legacy status
    employee.employee_status = employee.status === 'active' ? 'Active' : 'Inactive';
    
    this.data.employee_master.push(employee);
    return employee;
  }
  
  deactivateEmployee(employeeId, reason = 'Marked inactive by user') {
    const index = this.data.employee_master.findIndex(e => e.employee_id === employeeId);
    if (index !== -1) {
      const now = new Date().toISOString();
      const employee = this.data.employee_master[index];
      employee.status = 'inactive';
      employee.inactiveDate = now;
      employee.employee_status = 'Inactive';
      employee.statusHistory = employee.statusHistory || [];
      employee.statusHistory.push({
        status: 'inactive',
        date: now,
        reason: reason
      });
      return employee;
    }
    return null;
  }
}

// Singleton instance
const excelReader = new ExcelReader();

module.exports = excelReader;

