/**
 * Data layer — PostgreSQL-backed replacement for the old Excel-based reader.
 * Exports a singleton with the same interface the routes expect, but all methods
 * are now async (return Promises).  Routes must await every call.
 */
const pool = require('./db');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(val) {
  if (!val) return null;
  if (typeof val === 'string') return val.split('T')[0]; // strip time if present
  if (val instanceof Date) return val.toISOString().split('T')[0];
  return null;
}

function parseNum(val) {
  if (val === null || val === undefined || val === '') return 0;
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function padId(n, len = 3) {
  return String(n).padStart(len, '0');
}

// Pull the trailing number from IDs like "residence_id_001" → 1
function trailingNum(id) {
  const m = (id || '').match(/(\d+)$/);
  return m ? parseInt(m[1]) : 0;
}

// ─── Row normalisers ──────────────────────────────────────────────────────────

function normalizeResidence(r) {
  if (!r) return null;
  const status = (r.residence_status || 'active').toLowerCase();
  return {
    ...r,
    residence_house_count:   parseInt(r.residence_house_count) || 1,
    residence_status:        status,
    residence_owner_photo_ext: r.residence_owner_photo_ext || '',
    residence_owner_rating:  r.residence_owner_rating || null,
    // Lifecycle aliases expected by routes / misReports
    status:        status,
    activeDate:    r.active_date   ? new Date(r.active_date).toISOString()   : null,
    inactiveDate:  r.inactive_date ? new Date(r.inactive_date).toISOString() : null,
    statusHistory: r.status_history || [],
  };
}

function normalizeAgreement(a) {
  if (!a) return null;
  const status = (a.agreement_status || 'active').toLowerCase();
  return {
    ...a,
    agreement_status:              status,
    agreement_advance_amount:      parseNum(a.agreement_advance_amount),
    agreement_monthly_rent_amount: parseNum(a.agreement_monthly_rent_amount),
    agreement_rent_per_house:      parseNum(a.agreement_rent_per_house),
    agreement_advance_due_back:    parseNum(a.agreement_advance_due_back),
    agreement_advance_received:    parseNum(a.agreement_advance_received),
    agreement_maintenance_cut:     parseNum(a.agreement_maintenance_cut),
    agreement_deduction_electricity: parseNum(a.agreement_deduction_electricity),
    agreement_deduction_water:       parseNum(a.agreement_deduction_water),
    agreement_deduction_other:       parseNum(a.agreement_deduction_other),
    agreement_scheduled_to_vacate: !!a.agreement_scheduled_to_vacate,
    agreement_set_to_vacate:       !!a.agreement_set_to_vacate,
    agreement_notice_period_days:  a.agreement_notice_period_days != null ? parseInt(a.agreement_notice_period_days) : null,
    agreement_possesion_date:      formatDate(a.agreement_possesion_date),
    agreement_renewal_due_date:    formatDate(a.agreement_renewal_due_date),
    agreement_vacate_date:         formatDate(a.agreement_vacate_date),
    agreement_notice_due_by_date:  formatDate(a.agreement_notice_due_by_date),
    status:       status,
    activeDate:   a.active_date   ? new Date(a.active_date).toISOString()   : null,
    inactiveDate: a.inactive_date ? new Date(a.inactive_date).toISOString() : null,
    statusHistory: a.status_history || [],
  };
}

function normalizeEmployee(e) {
  if (!e) return null;
  const rawStatus = String(e.employee_status || 'ACTIVE').trim().toUpperCase();
  const status    = rawStatus === 'INACTIVE' ? 'inactive' : 'active';
  return {
    ...e,
    employee_status:          rawStatus,
    employee_photo_ext:       e.employee_photo_ext || '',
    employee_notice_served:   !!e.employee_notice_served,
    employee_date_of_joining: formatDate(e.employee_date_of_joining),
    employee_last_working_date: formatDate(e.employee_last_working_date),
    status:       status,
    activeDate:   e.active_date   ? new Date(e.active_date).toISOString()   : null,
    inactiveDate: e.inactive_date ? new Date(e.inactive_date).toISOString() : null,
    statusHistory: e.status_history || [],
  };
}

// ─── Renewal due-date helper (possession + 11 months) ────────────────────────

function calculateRenewalDueDate(possessionDate, durationMonths = 11) {
  if (!possessionDate) return null;
  const start = new Date(possessionDate);
  if (isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setMonth(end.getMonth() + durationMonths);
  end.setHours(12, 0, 0, 0);
  return end.toISOString().split('T')[0];
}

// ─── Status-change helper (shared by all three entity update methods) ─────────

function applyStatusChange(current, updates, statusCol) {
  const now = new Date().toISOString();
  const incomingStatus = updates.status;
  if (!incomingStatus || incomingStatus === current[statusCol]) {
    return { statusChanged: false, now };
  }

  const fields = {
    [statusCol]: incomingStatus,
    active_date:   incomingStatus === 'active'   ? now : current.active_date,
    inactive_date: incomingStatus === 'inactive' ? now : null,
    status_history: [
      ...(current.status_history || []),
      { status: incomingStatus, date: now, reason: updates.reason || 'Status updated' }
    ],
  };

  delete updates.status;
  delete updates.reason;
  return { statusChanged: true, now, fields };
}

// ─── Dynamic UPDATE builder ───────────────────────────────────────────────────

function buildUpdate(table, idCol, id, fields) {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (!entries.length) return null;

  // Always bump updated_at
  entries.push(['updated_at', new Date().toISOString()]);

  const setClauses = entries.map(([col], i) => `"${col}" = $${i + 2}`).join(', ');
  const values     = entries.map(([, v]) => v);

  return {
    text:   `UPDATE ${table} SET ${setClauses} WHERE "${idCol}" = $1 RETURNING *`,
    values: [id, ...values],
  };
}

// ─── Data class ───────────────────────────────────────────────────────────────

class DbReader {

  // ── Residences ──────────────────────────────────────────────────────────────

  async getResidences(statusFilter = 'active') {
    const res = await pool.query('SELECT * FROM residence_master ORDER BY created_at ASC');
    let rows = res.rows.map(normalizeResidence);
    if (statusFilter === 'active')   return rows.filter(r => r.status === 'active');
    if (statusFilter === 'inactive') return rows.filter(r => r.status === 'inactive');
    return rows;
  }

  async addResidence(data) {
    const now = new Date().toISOString();
    const id  = data.residence_id;
    const statusHistory = [{ status: 'active', date: now, reason: 'Initial creation' }];

    const res = await pool.query(`
      INSERT INTO residence_master (
        residence_id, residence_owner_id, residence_owner_name,
        residence_door_number,
        residence_address_line_1, residence_address_line_2, residence_address_line_3,
        residence_state, residence_pin_code, residence_country,
        residence_house_count, residence_status,
        residence_owner_contact, residence_area,
        residence_geo_location, residence_map_link,
        residence_owner_photo_ext,
        active_date, status_history, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW(),NOW())
      RETURNING *
    `, [
      id,
      data.residence_owner_id   || null,
      data.residence_owner_name || null,
      data.residence_door_number || null,
      data.residence_address_line_1 || null,
      data.residence_address_line_2 || null,
      data.residence_address_line_3 || null,
      data.residence_state   || 'Karnataka',
      data.residence_pin_code || null,
      data.residence_country || 'India',
      data.residence_house_count || 1,
      'active',
      data.residence_owner_contact || null,
      data.residence_area  || null,
      data.residence_geo_location || null,
      data.residence_map_link || null,
      data.residence_owner_photo_ext || '',
      now,
      JSON.stringify(statusHistory),
    ]);
    return normalizeResidence(res.rows[0]);
  }

  async updateResidence(id, updates) {
    const cur = await pool.query('SELECT * FROM residence_master WHERE residence_id = $1', [id]);
    if (!cur.rows.length) return null;
    const current = cur.rows[0];

    const fields = {};
    const sc = applyStatusChange(current, updates, 'residence_status');
    if (sc.statusChanged) Object.assign(fields, sc.fields);

    // Allowed updatable columns
    const allowed = [
      'residence_owner_id','residence_owner_name','residence_door_number',
      'residence_address_line_1','residence_address_line_2','residence_address_line_3',
      'residence_state','residence_pin_code','residence_country',
      'residence_house_count','residence_owner_contact','residence_area',
      'residence_geo_location','residence_map_link','residence_owner_photo_ext',
      'residence_owner_rating',
    ];
    allowed.forEach(col => { if (updates[col] !== undefined) fields[col] = updates[col]; });

    if (fields.status_history && typeof fields.status_history === 'object') {
      fields.status_history = JSON.stringify(fields.status_history);
    }

    const q = buildUpdate('residence_master', 'residence_id', id, fields);
    if (!q) {
      return normalizeResidence(current);
    }
    const res = await pool.query(q.text, q.values);
    return normalizeResidence(res.rows[0]);
  }

  async deactivateResidence(id, reason = 'Marked inactive by user') {
    return this.updateResidence(id, { status: 'inactive', reason });
  }

  // ── Agreements ──────────────────────────────────────────────────────────────

  async getAgreements(statusFilter = 'active') {
    const res = await pool.query('SELECT * FROM agreement_master ORDER BY created_at ASC');
    let rows = res.rows.map(normalizeAgreement);
    if (statusFilter === 'active')   return rows.filter(a => a.status === 'active');
    if (statusFilter === 'inactive') return rows.filter(a => a.status === 'inactive');
    return rows;
  }

  async addAgreement(data) {
    const now = new Date().toISOString();
    const id  = data.agreement_id;
    const statusHistory = [{ status: 'active', date: now, reason: 'Initial creation' }];

    const possessionDate = data.agreement_possesion_date || null;
    const renewalDueDate = calculateRenewalDueDate(possessionDate) || data.agreement_renewal_due_date || null;

    const res = await pool.query(`
      INSERT INTO agreement_master (
        agreement_id, agreement_residence_id,
        agreement_possesion_date, agreement_renewal_due_date,
        agreement_employee_unit,
        agreement_advance_amount, agreement_monthly_rent_amount,
        agreement_rent_per_house, agreement_advance_in_months,
        agreement_status, agreement_statutory_status, agreement_company,
        agreement_scheduled_to_vacate, agreement_set_to_vacate,
        agreement_advance_due_back, agreement_advance_received, agreement_maintenance_cut,
        agreement_deduction_electricity, agreement_deduction_water, agreement_deduction_other,
        agreement_notice_period_days, agreement_notice_due_by_date,
        agreement_document_location,
        active_date, status_history, created_at, updated_at
      ) VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,NOW(),NOW())
      RETURNING *
    `, [
      id,                                              // $1
      data.agreement_residence_id || null,             // $2
      possessionDate,                                  // $3
      renewalDueDate,                                  // $4
      data.agreement_employee_unit || null,            // $5
      parseNum(data.agreement_advance_amount),         // $6
      parseNum(data.agreement_monthly_rent_amount),    // $7
      parseNum(data.agreement_rent_per_house),         // $8
      data.agreement_advance_in_months || null,        // $9
      'active',                                        // $10
      data.agreement_statutory_status || null,         // $11
      data.agreement_company || null,                  // $12
      !!(data.agreement_scheduled_to_vacate),          // $13
      !!(data.agreement_set_to_vacate),                // $14
      parseNum(data.agreement_advance_due_back),       // $15
      parseNum(data.agreement_advance_received),       // $16
      parseNum(data.agreement_maintenance_cut),        // $17
      parseNum(data.agreement_deduction_electricity),  // $18
      parseNum(data.agreement_deduction_water),        // $19
      parseNum(data.agreement_deduction_other),        // $20
      data.agreement_notice_period_days || null,       // $21
      data.agreement_notice_due_by_date || null,       // $22
      data.agreement_document_location || null,        // $23
      now,                                             // $24
      JSON.stringify(statusHistory),                   // $25
    ]);
    return normalizeAgreement(res.rows[0]);
  }

  async updateAgreement(id, updates) {
    const cur = await pool.query('SELECT * FROM agreement_master WHERE agreement_id = $1', [id]);
    if (!cur.rows.length) return null;
    const current = cur.rows[0];

    const fields = {};
    const sc = applyStatusChange(current, updates, 'agreement_status');
    if (sc.statusChanged) {
      Object.assign(fields, sc.fields);
      // When going inactive, auto-seed advance_due_back if not already set
      if (fields.agreement_status === 'inactive' && !current.agreement_advance_due_back) {
        fields.agreement_advance_due_back = parseNum(current.agreement_advance_amount);
      }
    }

    // Allowed updatable columns
    const allowed = [
      'agreement_residence_id','agreement_possesion_date','agreement_renewal_due_date',
      'agreement_employee_unit','agreement_advance_amount','agreement_monthly_rent_amount',
      'agreement_rent_per_house','agreement_advance_in_months',
      'agreement_scheduled_to_vacate','agreement_set_to_vacate','agreement_vacate_date',
      'agreement_advance_due_back','agreement_advance_received','agreement_maintenance_cut',
      'agreement_deduction_electricity','agreement_deduction_water','agreement_deduction_other',
      'agreement_notice_period_days','agreement_notice_due_by_date',
      'agreement_statutory_status','agreement_document_location','agreement_company',
    ];
    allowed.forEach(col => { if (updates[col] !== undefined) fields[col] = updates[col]; });

    // Normalise booleans
    if (fields.agreement_scheduled_to_vacate !== undefined)
      fields.agreement_scheduled_to_vacate = !!fields.agreement_scheduled_to_vacate;
    if (fields.agreement_set_to_vacate !== undefined)
      fields.agreement_set_to_vacate = !!fields.agreement_set_to_vacate;

    // Recalculate renewal due date when possession date changes
    const newPossession = fields.agreement_possesion_date || current.agreement_possesion_date;
    const recalc = calculateRenewalDueDate(newPossession);
    if (recalc && !fields.agreement_renewal_due_date) {
      fields.agreement_renewal_due_date = recalc;
    }

    if (fields.status_history && typeof fields.status_history === 'object') {
      fields.status_history = JSON.stringify(fields.status_history);
    }

    const q = buildUpdate('agreement_master', 'agreement_id', id, fields);
    if (!q) return normalizeAgreement(current);
    const res = await pool.query(q.text, q.values);
    return normalizeAgreement(res.rows[0]);
  }

  async deactivateAgreement(id, reason = 'Marked inactive by user') {
    return this.updateAgreement(id, { status: 'inactive', reason });
  }

  // ── Employees ───────────────────────────────────────────────────────────────

  async getEmployees(statusFilter = 'active') {
    const res = await pool.query('SELECT * FROM employee_master ORDER BY created_at ASC');
    let rows = res.rows.map(normalizeEmployee);
    if (statusFilter === 'active')   return rows.filter(e => e.status === 'active');
    if (statusFilter === 'inactive') return rows.filter(e => e.status === 'inactive');
    return rows;
  }

  async addEmployee(data) {
    const now = new Date().toISOString();
    const statusHistory = [{ status: 'active', date: now, reason: 'Initial creation' }];
    const rawStatus = String(data.employee_status || data.status || 'ACTIVE').trim().toUpperCase();

    const res = await pool.query(`
      INSERT INTO employee_master (
        employee_id, emplyee_allocated_agreement_id,
        employee_first_name, employee_last_name, employee_sir_name,
        employee_department, employee_designation,
        employee_date_of_joining, employee_status,
        employee_mobile_number, employee_room_number, employee_floor,
        employee_last_working_date, employee_notice_served,
        employee_photo_ext,
        active_date, status_history, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW(),NOW())
      RETURNING *
    `, [
      data.employee_id,
      data.emplyee_allocated_agreement_id || null,
      data.employee_first_name || null,
      data.employee_last_name  || null,
      data.employee_sir_name   || null,
      data.employee_department || null,
      data.employee_designation || null,
      data.employee_date_of_joining || null,
      rawStatus,
      data.employee_mobile_number || null,
      data.employee_room_number   || null,
      data.employee_floor         || null,
      data.employee_last_working_date || null,
      !!(data.employee_notice_served),
      data.employee_photo_ext || '',
      now,
      JSON.stringify(statusHistory),
    ]);
    return normalizeEmployee(res.rows[0]);
  }

  async updateEmployee(id, updates) {
    const cur = await pool.query('SELECT * FROM employee_master WHERE employee_id = $1', [id]);
    if (!cur.rows.length) return null;
    const current = cur.rows[0];

    const fields = {};
    const incomingStatus = updates.status || updates.employee_status;
    if (incomingStatus) {
      const newStatus = String(incomingStatus).trim().toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
      const now = new Date().toISOString();
      if (newStatus !== current.employee_status) {
        fields.employee_status = newStatus;
        fields.active_date     = newStatus === 'ACTIVE'   ? now : current.active_date;
        fields.inactive_date   = newStatus === 'INACTIVE' ? now : null;
        fields.status_history  = JSON.stringify([
          ...(current.status_history || []),
          { status: newStatus.toLowerCase(), date: now, reason: updates.reason || 'Status updated' },
        ]);
      }
      delete updates.status;
      delete updates.reason;
      delete updates.employee_status;
    }

    const allowed = [
      'emplyee_allocated_agreement_id',
      'employee_first_name','employee_last_name','employee_sir_name',
      'employee_department','employee_designation',
      'employee_date_of_joining','employee_mobile_number',
      'employee_room_number','employee_floor',
      'employee_last_working_date','employee_notice_served',
      'employee_photo_ext',
    ];
    allowed.forEach(col => { if (updates[col] !== undefined) fields[col] = updates[col]; });

    if (fields.employee_notice_served !== undefined)
      fields.employee_notice_served = !!fields.employee_notice_served;

    const q = buildUpdate('employee_master', 'employee_id', id, fields);
    if (!q) return normalizeEmployee(current);
    const res = await pool.query(q.text, q.values);
    return normalizeEmployee(res.rows[0]);
  }

  async deactivateEmployee(id, reason = 'Marked inactive by user') {
    return this.updateEmployee(id, { status: 'INACTIVE', reason });
  }

  async deleteEmployee(id) {
    const cur = await pool.query('SELECT * FROM employee_master WHERE employee_id = $1', [id]);
    if (!cur.rows.length) return null;
    await pool.query('DELETE FROM employee_master WHERE employee_id = $1', [id]);
    return normalizeEmployee(cur.rows[0]);
  }
}

// Singleton — same shape as the old excelReader singleton
const dbReader = new DbReader();
module.exports = dbReader;
