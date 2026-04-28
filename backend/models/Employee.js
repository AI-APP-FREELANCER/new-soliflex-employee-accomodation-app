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
    // MIS: last working day for 15-day notice and replacement planning
    this.employee_last_working_date = data.employee_last_working_date || null;
    this.employee_notice_served = data.employee_notice_served === true || data.employee_notice_served === 'Yes' || data.employee_notice_served === 'yes' || false;
    // Optional employee photo: extension when uploaded; file under employee_photos/
    this.employee_photo_ext = data.employee_photo_ext
      ? String(data.employee_photo_ext).toLowerCase().replace(/^\./, '')
      : '';

    // Legacy status field (map to new status)
    const legacyStatus = data.employee_status || 'Active';
    this.employee_status = legacyStatus;
    
    // Lifecycle Management Fields
    this.status = (legacyStatus === 'Active' || legacyStatus === 'active') ? 'active' : 'inactive';
    this.activeDate = data.activeDate || (this.status === 'active' ? new Date().toISOString() : null);
    this.inactiveDate = data.inactiveDate || (this.status === 'inactive' ? new Date().toISOString() : null);
    this.statusHistory = data.statusHistory || [];
    
    // Initialize status history if not present
    if (this.statusHistory.length === 0 && this.activeDate) {
      this.statusHistory.push({
        status: this.status,
        date: this.activeDate,
        reason: 'Initial creation'
      });
    }
  }
}

module.exports = Employee;

