class Employee {
  constructor(data) {
    this.employee_id = data.employee_id;
    this.emplyee_allocated_agreement_id = data.emplyee_allocated_agreement_id || null;
    this.employee_first_name = data.employee_first_name || null;
    this.employee_last_name = data.employee_last_name || null;
    this.employee_sir_name = data.employee_sir_name || null;
    this.employee_department = data.employee_department || null;
    this.employee_designation = data.employee_designation || null;
    this.employee_date_of_joining = data.employee_date_of_joining || null;
    this.employee_status = data.employee_status || 'Active';
  }
}

module.exports = Employee;

