class Agreement {
  constructor(data) {
    this.agreement_id = data.agreement_id;
    this.agreement_residence_id = data.agreement_residence_id;
    this.agreement_possesion_date = data.agreement_possesion_date || null;
    this.agreement_renewal_due_date = data.agreement_renewal_due_date || null;
    this.agreement_employee_unit = data.agreement_employee_unit || null;
    this.agreement_advance_amount = data.agreement_advance_amount || 0;
    this.agreement_monthly_rent_amount = data.agreement_monthly_rent_amount || 0;
    
    // Vacate and Refund Fields
    this.agreement_scheduled_to_vacate = data.agreement_scheduled_to_vacate === true || 
                                         data.agreement_scheduled_to_vacate === 'Yes' || 
                                         data.agreement_scheduled_to_vacate === 'yes' || 
                                         false;
    this.agreement_vacate_date = data.agreement_vacate_date || null;
    this.agreement_advance_due_back = parseFloat(data.agreement_advance_due_back) || 0;
    this.agreement_advance_received = parseFloat(data.agreement_advance_received) || 0;
    this.agreement_maintenance_cut = parseFloat(data.agreement_maintenance_cut) || 0;
    // MIS: compliance and notice
    this.agreement_notice_period_days = parseInt(data.agreement_notice_period_days, 10) || null;
    this.agreement_notice_due_by_date = data.agreement_notice_due_by_date || null;
    this.agreement_statutory_status = data.agreement_statutory_status || null;
    this.agreement_document_location = data.agreement_document_location || null;

    // Legacy status field (map to new status)
    const legacyStatus = data.agreement_status || 'Active';
    this.agreement_status = legacyStatus;
    
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

module.exports = Agreement;

