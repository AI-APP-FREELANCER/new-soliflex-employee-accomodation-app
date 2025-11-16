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
        } else {
          console.warn('Excel date conversion resulted in out-of-range year:', year, 'from serial:', dateValue);
        }
      }
    }
    
    // If conversion failed or date is out of range, return null
    console.warn('Invalid or out-of-range date detected:', dateValue, 'Type:', typeof dateValue);
    return null;
  }

  loadData() {
    try {
      const excelPath = path.join(__dirname, '../../agreement.xlsx');
      const workbook = XLSX.readFile(excelPath, {
        cellDates: true, // Try to parse dates automatically
        cellNF: false
      });
      
      // Read each worksheet
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
            } else if (sheetName === 'employee_master') {
              processedRow.employee_date_of_joining = this.convertExcelDate(processedRow.employee_date_of_joining);
            }
            
            return processedRow;
          });
          
          this.data[sheetName] = processedData;
        } else {
          console.warn(`Sheet ${sheetName} not found in Excel file`);
        }
      });
      
      this.loaded = true;
      console.log('Excel data loaded successfully');
      return this.data;
    } catch (error) {
      console.error('Error loading Excel data:', error.message);
      // Return empty data structure if file doesn't exist
      this.loaded = true;
      return this.data;
    }
  }

  getResidences() {
    if (!this.loaded) this.loadData();
    return this.data.residence_master;
  }

  getAgreements() {
    if (!this.loaded) this.loadData();
    return this.data.agreement_master;
  }

  getEmployees() {
    if (!this.loaded) this.loadData();
    return this.data.employee_master;
  }

  // Update methods for in-memory data
  updateResidence(residenceId, updates) {
    const index = this.data.residence_master.findIndex(r => r.residence_id === residenceId);
    if (index !== -1) {
      this.data.residence_master[index] = { ...this.data.residence_master[index], ...updates };
      return this.data.residence_master[index];
    }
    return null;
  }

  addResidence(residence) {
    this.data.residence_master.push(residence);
    return residence;
  }

  updateAgreement(agreementId, updates) {
    const index = this.data.agreement_master.findIndex(a => a.agreement_id === agreementId);
    if (index !== -1) {
      this.data.agreement_master[index] = { ...this.data.agreement_master[index], ...updates };
      return this.data.agreement_master[index];
    }
    return null;
  }

  addAgreement(agreement) {
    this.data.agreement_master.push(agreement);
    return agreement;
  }

  updateEmployee(employeeId, updates) {
    const index = this.data.employee_master.findIndex(e => e.employee_id === employeeId);
    if (index !== -1) {
      this.data.employee_master[index] = { ...this.data.employee_master[index], ...updates };
      return this.data.employee_master[index];
    }
    return null;
  }

  addEmployee(employee) {
    this.data.employee_master.push(employee);
    return employee;
  }
}

// Singleton instance
const excelReader = new ExcelReader();

module.exports = excelReader;

