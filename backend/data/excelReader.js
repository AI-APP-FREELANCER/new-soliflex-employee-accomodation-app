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

  loadData() {
    try {
      const excelPath = path.join(__dirname, '../../agreement.xlsx');
      const workbook = XLSX.readFile(excelPath);
      
      // Read each worksheet
      const sheets = ['residence_master', 'agreement_master', 'employee_master'];
      
      sheets.forEach(sheetName => {
        if (workbook.SheetNames.includes(sheetName)) {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          this.data[sheetName] = jsonData;
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

