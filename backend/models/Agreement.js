class Agreement {
  constructor(data) {
    this.agreement_id = data.agreement_id;
    this.agreement_residence_id = data.agreement_residence_id;
    this.agreement_possesion_date = data.agreement_possesion_date || null;
    this.agreement_renewal_due_date = data.agreement_renewal_due_date || null;
    this.agreement_employee_unit = data.agreement_employee_unit || null;
    this.agreement_advance_amount = data.agreement_advance_amount || 0;
    this.agreement_monthly_rent_amount = data.agreement_monthly_rent_amount || 0;
    this.agreement_status = data.agreement_status || 'Active';
  }
}

module.exports = Agreement;

