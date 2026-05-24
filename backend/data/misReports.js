/**
 * MIS Reports - Builds all table data for the dashboard (table-only MIS).
 * Uses the DB-backed excelReader for agreements, employees, residences.
 */
const excelReader = require('./excelReader');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

const parseCurrency = (val) => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const clean = String(val).replace(/[^\d.-]/g, '');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
};

const normalizeStatus = (status) => {
  const s = String(status || '').trim().toLowerCase();
  return s === 'inactive' ? 'inactive' : 'active';
};

const isAgreementActive = (a) => normalizeStatus(a.agreement_status || a.status) === 'active';
const isEmployeeActive = (e) => String(e.employee_status || e.status || '').trim().toUpperCase() === 'ACTIVE';

function getEmployeeName(e) {
  const parts = [e.employee_first_name, e.employee_last_name, e.employee_sir_name].filter(Boolean);
  return parts.join(' ').trim() || e.employee_id || '—';
}

function getResidenceAddressShort(r) {
  if (!r) return '—';
  return [r.residence_address_line_1, r.residence_address_line_2].filter(Boolean).join(', ') || r.residence_id || '—';
}

/**
 * Returns full MIS payload: ownerSummary, proactive pipeline tables, cost optimization, departmental, financial/compliance, byOwner.
 */
async function getMISData() {
  const today = dayjs.tz(dayjs(), 'Asia/Kolkata').startOf('day');
  const [agreements, employees, residences] = await Promise.all([
    excelReader.getAgreements('all'),
    excelReader.getEmployees('all'),
    excelReader.getResidences('all'),
  ]);

  const agreementById = {};
  const residenceById = {};
  const employeeByAgreementId = {};
  const agreementsByResidenceId = {};
  agreements.forEach(a => {
    agreementById[a.agreement_id] = a;
    const rid = a.agreement_residence_id;
    if (!agreementsByResidenceId[rid]) agreementsByResidenceId[rid] = [];
    agreementsByResidenceId[rid].push(a);
  });
  residences.forEach(r => { residenceById[r.residence_id] = r; });
  employees.forEach(e => {
    const aid = e.emplyee_allocated_agreement_id;
    if (aid) employeeByAgreementId[aid] = e;
  });

  // --- Module 0: Owner's Summary ---
  let totalMonthlyRent = 0, totalAdvanceLocked = 0, totalAdvanceDueBack = 0, totalNetReceived = 0;
  let pastDue = 0, dueSoon = 0, totalScheduledToVacate = 0;
  let activeEmployees = 0, inactiveEmployees = 0;
  const ninetyDaysFromNow = today.add(90, 'day');

  agreements.forEach(a => {
    if (!isAgreementActive(a)) return;
    totalMonthlyRent += parseCurrency(a.agreement_monthly_rent_amount);
    totalAdvanceLocked += parseCurrency(a.agreement_advance_amount);
  });
  agreements.forEach(a => {
    if (normalizeStatus(a.agreement_status || a.status) !== 'inactive') return;
    const dueBack = parseCurrency(a.agreement_advance_due_back || a.agreement_advance_amount || 0);
    const received = parseCurrency(a.agreement_advance_received || 0);
    if (received === 0 || !a.agreement_advance_received) totalAdvanceDueBack += dueBack;
  });
  agreements.forEach(a => { totalNetReceived += parseCurrency(a.agreement_advance_received || 0); });
  agreements.forEach(a => {
    if (a.agreement_scheduled_to_vacate === true || a.agreement_scheduled_to_vacate === 'Yes' || a.agreement_scheduled_to_vacate === 'yes') totalScheduledToVacate++;
  });
  agreements.forEach(a => {
    if (!isAgreementActive(a)) return;
    const dueDate = a.agreement_renewal_due_date ? dayjs.tz(a.agreement_renewal_due_date, 'Asia/Kolkata').startOf('day') : null;
    if (!dueDate || !dueDate.isValid()) return;
    if (dueDate.isBefore(today, 'day')) pastDue++;
    else if (dueDate.isSame(today, 'day') || dueDate.isBefore(ninetyDaysFromNow.add(1, 'day'), 'day')) dueSoon++;
  });
  employees.forEach(e => {
    const s = String(e.employee_status || e.status || '').trim().toUpperCase();
    if (s === 'ACTIVE') activeEmployees++; else inactiveEmployees++;
  });

  const totalProperties = residences.length;
  const occupiedCount = residences.filter(r => {
    const list = agreementsByResidenceId[r.residence_id] || [];
    return list.some(a => isAgreementActive(a));
  }).length;
  const vacantCount = totalProperties - occupiedCount;
  const utilizationPct = totalProperties > 0 ? Math.round((occupiedCount / totalProperties) * 100) : 0;

  // Enhanced KPI stats for the professional dashboard
  const activeResidences = residences.filter(r => normalizeStatus(r.residence_status || 'active') === 'active').length;
  const inactiveResidences = totalProperties - activeResidences;
  const totalRooms = residences.reduce((s, r) => s + (parseInt(r.residence_house_count, 10) || 0), 0);
  const activeAgreementCount = agreements.filter(a => isAgreementActive(a)).length;
  const occupiedRooms = activeAgreementCount; // each active agreement = 1 occupied unit
  const vacantRooms = Math.max(0, totalRooms - occupiedRooms);
  const roomOccupancyPct = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;
  const vacantResidences = Math.max(0, activeResidences - occupiedCount);
  const allocatedEmployees = employees.filter(e => isEmployeeActive(e) && e.emplyee_allocated_agreement_id).length;
  const unallocatedEmployees = Math.max(0, activeEmployees - allocatedEmployees);
  const leavingIn30Days = employees.filter(e => {
    const lwd = e.employee_last_working_date ? dayjs(e.employee_last_working_date) : null;
    return lwd && lwd.isValid() && !lwd.isBefore(today, 'day') && lwd.isBefore(today.add(31, 'day'), 'day');
  }).length;
  const leavingIn60Days = employees.filter(e => {
    const lwd = e.employee_last_working_date ? dayjs(e.employee_last_working_date) : null;
    return lwd && lwd.isValid() && !lwd.isBefore(today, 'day') && lwd.isBefore(today.add(61, 'day'), 'day');
  }).length;
  const leavingIn90Days = employees.filter(e => {
    const lwd = e.employee_last_working_date ? dayjs(e.employee_last_working_date) : null;
    return lwd && lwd.isValid() && !lwd.isBefore(today, 'day') && lwd.isBefore(today.add(91, 'day'), 'day');
  }).length;
  let totalAdvancePending = 0;
  agreements.forEach(a => {
    const dueBack = parseCurrency(a.agreement_advance_due_back || a.agreement_advance_amount || 0);
    const received = parseCurrency(a.agreement_advance_received || 0);
    if (dueBack > received) totalAdvancePending += (dueBack - received);
  });

  const ownerSummary = [
    { metric: 'Total Monthly Burn (Rent)', currentValue: totalMonthlyRent, monthOverMonthTrend: '—', actionRequired: '—' },
    { metric: 'System Utilization (%)', currentValue: `${utilizationPct}%`, monthOverMonthTrend: '—', actionRequired: vacantCount > 0 ? `${vacantCount} properties vacant` : '—' },
    { metric: 'Pipeline Ready (Scheduled to Vacate)', currentValue: totalScheduledToVacate, monthOverMonthTrend: '—', actionRequired: totalScheduledToVacate > 0 ? 'Map to upcoming vacancies' : '—' },
    { metric: 'Advances at Risk (Due Back)', currentValue: totalAdvanceDueBack, monthOverMonthTrend: '—', actionRequired: totalAdvanceDueBack > 0 ? 'Follow up on refunds' : '—' },
    { metric: 'Past Due Renewals', currentValue: pastDue, monthOverMonthTrend: '—', actionRequired: pastDue > 0 ? 'Review past due agreements' : '—' },
    { metric: 'Due in 90 Days', currentValue: dueSoon, monthOverMonthTrend: '—', actionRequired: dueSoon > 0 ? 'Plan renewals' : '—' },
    { metric: 'Total Properties', currentValue: totalProperties, monthOverMonthTrend: '—', actionRequired: '—' },
    { metric: 'Active Employees', currentValue: activeEmployees, monthOverMonthTrend: '—', actionRequired: '—' },
    { metric: 'Inactive Employees', currentValue: inactiveEmployees, monthOverMonthTrend: '—', actionRequired: '—' },
    { metric: 'Active Residences', currentValue: activeResidences, monthOverMonthTrend: '—', actionRequired: inactiveResidences > 0 ? `${inactiveResidences} inactive` : '—' },
    { metric: 'Occupied Residences', currentValue: occupiedCount, monthOverMonthTrend: '—', actionRequired: vacantResidences > 0 ? `${vacantResidences} active but vacant` : '—' },
    { metric: 'Total Room Capacity', currentValue: totalRooms, monthOverMonthTrend: '—', actionRequired: `${occupiedRooms} occupied · ${vacantRooms} vacant` },
    { metric: 'Room Occupancy (%)', currentValue: `${roomOccupancyPct}%`, monthOverMonthTrend: '—', actionRequired: roomOccupancyPct < 70 ? 'Optimize room allocation' : '—' },
    { metric: 'Allocated Employees', currentValue: allocatedEmployees, monthOverMonthTrend: '—', actionRequired: unallocatedEmployees > 0 ? `${unallocatedEmployees} active employees unallocated` : '—' },
    { metric: 'Employees Leaving ≤30 Days', currentValue: leavingIn30Days, monthOverMonthTrend: '—', actionRequired: leavingIn30Days > 0 ? 'Urgent — plan accommodation transitions' : '—' },
    { metric: 'Employees Leaving ≤60 Days', currentValue: leavingIn60Days, monthOverMonthTrend: '—', actionRequired: leavingIn60Days > 0 ? 'Start replacement planning' : '—' },
    { metric: 'Advance Pending Refund', currentValue: totalAdvancePending, monthOverMonthTrend: '—', actionRequired: totalAdvancePending > 0 ? 'Follow up with landlords' : '—' },
    { metric: 'Report Date', currentValue: today.format('DD-MM-YYYY'), monthOverMonthTrend: '—', actionRequired: '—' },
  ];

  // --- Module 1: Proactive Pipeline ---
  const upcomingVacancyReplacementTracker = [];
  const lwdWindowEnd = today.add(60, 'day');
  employees.forEach(e => {
    const lwd = e.employee_last_working_date ? dayjs(e.employee_last_working_date) : null;
    if (!lwd || !lwd.isValid()) return;
    if (lwd.isBefore(today, 'day')) return;
    if (lwd.isAfter(lwdWindowEnd)) return;
    const ag = e.emplyee_allocated_agreement_id ? agreementById[e.emplyee_allocated_agreement_id] : null;
    const res = ag && ag.agreement_residence_id ? residenceById[ag.agreement_residence_id] : null;
    upcomingVacancyReplacementTracker.push({
      employeeName: getEmployeeName(e),
      department: e.employee_department || '—',
      projectedLWD: e.employee_last_working_date,
      noticeStatus: e.employee_notice_served ? 'Ready for Inspection' : '—',
      allocatedResidence: res ? `${res.residence_id} ${getResidenceAddressShort(res)}` : '—',
      replacementCandidate: '—',
      transitionBuffer: '—',
      daysLeft: lwd.diff(today, 'day'),
    });
  });
  upcomingVacancyReplacementTracker.sort((a, b) => (a.projectedLWD || '').localeCompare(b.projectedLWD || ''));

  const propertiesBecomingAvailable = [];
  const windowEnd = today.add(90, 'day');
  agreements.forEach(a => {
    if (!(a.agreement_scheduled_to_vacate === true || a.agreement_scheduled_to_vacate === 'Yes' || a.agreement_scheduled_to_vacate === 'yes')) return;
    const vd = a.agreement_vacate_date ? dayjs(a.agreement_vacate_date) : null;
    if (!vd || !vd.isValid()) return;
    if (vd.isBefore(today, 'day')) return;
    if (vd.isAfter(windowEnd)) return;
    const res = residenceById[a.agreement_residence_id];
    const emp = employeeByAgreementId[a.agreement_id];
    propertiesBecomingAvailable.push({
      residenceId: a.agreement_residence_id,
      ownerName: res ? res.residence_owner_name : '—',
      vacateDate: a.agreement_vacate_date,
      currentEmployee: emp ? getEmployeeName(emp) : '—',
      currentEmployeeId: emp ? emp.employee_id : '—',
      department: emp ? emp.employee_department : '—',
      agreementId: a.agreement_id,
      daysUntilAvailable: vd.diff(today, 'day'),
    });
  });
  propertiesBecomingAvailable.sort((a, b) => (a.vacateDate || '').localeCompare(b.vacateDate || ''));

  const replacementPlanningSummary = [];
  agreements.forEach(a => {
    if (!(a.agreement_scheduled_to_vacate === true || a.agreement_scheduled_to_vacate === 'Yes' || a.agreement_scheduled_to_vacate === 'yes')) return;
    const res = residenceById[a.agreement_residence_id];
    const emp = employeeByAgreementId[a.agreement_id];
    replacementPlanningSummary.push({
      residenceId: a.agreement_residence_id,
      owner: res ? res.residence_owner_name : '—',
      vacateDate: a.agreement_vacate_date,
      outgoingEmployee: emp ? getEmployeeName(emp) : '—',
      outgoingEmployeeId: emp ? emp.employee_id : '—',
      department: emp ? emp.employee_department : '—',
      lastWorkingDate: emp ? emp.employee_last_working_date : '—',
      advanceDueBack: parseCurrency(a.agreement_advance_due_back || a.agreement_advance_amount),
      replacementCandidate: '—',
      suggestedAction: 'Plan next allocation',
    });
  });
  replacementPlanningSummary.sort((a, b) => (a.vacateDate || '').localeCompare(b.vacateDate || ''));

  // --- Module 2: Cost Optimization ---
  const propertyUtilizationOpportunityCost = [];
  residences.forEach(r => {
    const list = agreementsByResidenceId[r.residence_id] || [];
    const activeAgreements = list.filter(a => isAgreementActive(a));
    const capacity = parseInt(r.residence_house_count, 10) || 1;
    const occupancy = activeAgreements.length;
    let suggestion = '—';
    if (capacity > 1 && occupancy < capacity) suggestion = 'Consider full allocation';
    if (occupancy === 0 && list.length > 0) suggestion = 'Vacant - reallocate';
    propertyUtilizationOpportunityCost.push({
      residenceId: r.residence_id,
      address: getResidenceAddressShort(r),
      capacity,
      occupancy,
      vacancyDays: '—',
      lostRent: '—',
      optimizationSuggestion: suggestion,
    });
  });

  const costByProperty = [];
  agreements.forEach(a => {
    if (!isAgreementActive(a)) return;
    const res = residenceById[a.agreement_residence_id];
    const emp = employeeByAgreementId[a.agreement_id];
    const rent = parseCurrency(a.agreement_monthly_rent_amount);
    const advance = parseCurrency(a.agreement_advance_amount);
    const capacity = res ? (parseInt(res.residence_house_count, 10) || 1) : 1;
    costByProperty.push({
      residenceId: a.agreement_residence_id,
      ownerName: res ? res.residence_owner_name : '—',
      address: getResidenceAddressShort(res),
      monthlyRent: rent,
      advanceLocked: advance,
      agreementStatus: a.agreement_status || 'Active',
      employee: emp ? getEmployeeName(emp) : '—',
      costPerHead: capacity > 1 ? (rent / capacity).toFixed(2) : rent,
    });
  });

  const agreementROILedger = [];
  agreements.forEach(a => {
    const res = residenceById[a.agreement_residence_id];
    const rent = parseCurrency(a.agreement_monthly_rent_amount);
    const dueBack = parseCurrency(a.agreement_advance_due_back || a.agreement_advance_amount);
    const received = parseCurrency(a.agreement_advance_received || 0);
    const maintenance = parseCurrency(a.agreement_maintenance_cut || 0);
    const possession = a.agreement_possesion_date ? dayjs(a.agreement_possesion_date) : null;
    const tenureMonths = possession && possession.isValid() ? today.diff(possession, 'month') : null;
    const maintenanceEfficiency = (tenureMonths != null && tenureMonths > 0 && rent > 0)
      ? `${(maintenance / (tenureMonths * rent) * 100).toFixed(1)}%` : '—';
    agreementROILedger.push({
      landlordName: res ? res.residence_owner_name : '—',
      agreementId: a.agreement_id,
      historicalRentHikes: '—',
      advanceDueBack: dueBack,
      advanceReceived: received,
      advanceRecoveryStatus: received >= dueBack ? 'Closed' : (received > 0 ? 'Partial' : 'Pending'),
      maintenanceEfficiency,
    });
  });

  // --- Module 3: Departmental MIS ---
  const deptRent = {};
  const deptCount = {};
  employees.forEach(e => {
    const dept = (e.employee_department || 'Unassigned').trim();
    if (!deptCount[dept]) { deptCount[dept] = { total: 0, active: 0, inactive: 0, allocated: 0, unallocated: 0 }; }
    deptCount[dept].total++;
    if (isEmployeeActive(e)) deptCount[dept].active++; else deptCount[dept].inactive++;
    if (e.emplyee_allocated_agreement_id) deptCount[dept].allocated++; else deptCount[dept].unallocated++;
    const ag = e.emplyee_allocated_agreement_id ? agreementById[e.emplyee_allocated_agreement_id] : null;
    if (ag && isAgreementActive(ag)) {
      deptRent[dept] = (deptRent[dept] || 0) + parseCurrency(ag.agreement_monthly_rent_amount);
    }
  });

  const departmentalExpenseMatrix = [];
  Object.keys(deptCount).sort().forEach(dept => {
    const count = deptCount[dept];
    const residentCount = count.allocated;
    const cumulativeRent = deptRent[dept] || 0;
    const costPerHead = residentCount > 0 ? (cumulativeRent / residentCount).toFixed(2) : '—';
    departmentalExpenseMatrix.push({
      department: dept,
      totalResidentCount: residentCount,
      cumulativeMonthlyRent: cumulativeRent,
      costPerHead: costPerHead === '—' ? '—' : parseFloat(costPerHead),
      budgetVariance: '—',
    });
  });

  const designationMap = {};
  employees.forEach(e => {
    const des = (e.employee_designation || 'Unassigned').trim();
    if (!designationMap[des]) designationMap[des] = { count: 0, rent: 0, tenures: [] };
    designationMap[des].count++;
    const ag = e.emplyee_allocated_agreement_id ? agreementById[e.emplyee_allocated_agreement_id] : null;
    if (ag && isAgreementActive(ag)) {
      designationMap[des].rent += parseCurrency(ag.agreement_monthly_rent_amount);
      const pos = ag.agreement_possesion_date ? dayjs(ag.agreement_possesion_date) : null;
      if (pos && pos.isValid()) designationMap[des].tenures.push(today.diff(pos, 'month'));
    }
  });
  const designationWiseSpend = [];
  Object.keys(designationMap).sort().forEach(des => {
    const d = designationMap[des];
    const costPerHead = d.count > 0 && d.rent > 0 ? (d.rent / d.count).toFixed(2) : '—';
    const avgTenure = d.tenures.length > 0
      ? (d.tenures.reduce((s, t) => s + t, 0) / d.tenures.length).toFixed(1) + ' months'
      : '—';
    let accommodationGrade = '—';
    if (d.rent > 0 && d.count > 0) {
      const avg = d.rent / d.count;
      if (avg > 25000) accommodationGrade = 'High'; else if (avg > 15000) accommodationGrade = 'Medium'; else accommodationGrade = 'Low';
    }
    designationWiseSpend.push({
      designation: des,
      count: d.count,
      totalMonthlyRent: d.rent,
      costPerHead: costPerHead === '—' ? '—' : parseFloat(costPerHead),
      accommodationGrade,
      averageTenureInQuarters: avgTenure,
    });
  });

  const departmentWiseEmployeeSummary = [];
  Object.keys(deptCount).sort().forEach(dept => {
    const c = deptCount[dept];
    departmentWiseEmployeeSummary.push({
      department: dept,
      totalEmployees: c.total,
      active: c.active,
      inactive: c.inactive,
      allocated: c.allocated,
      unallocated: c.unallocated,
    });
  });

  const employeeMasterEnhanced = employees.map(e => {
    const ag = e.emplyee_allocated_agreement_id ? agreementById[e.emplyee_allocated_agreement_id] : null;
    const res = ag && ag.agreement_residence_id ? residenceById[ag.agreement_residence_id] : null;
    return {
      employeeId: e.employee_id,
      name: getEmployeeName(e),
      department: e.employee_department || '—',
      designation: e.employee_designation || '—',
      dateOfJoining: e.employee_date_of_joining || '—',
      status: e.employee_status || '—',
      allocatedResidenceId: res ? res.residence_id : '—',
      agreementId: e.emplyee_allocated_agreement_id || '—',
      renewalDue: ag ? ag.agreement_renewal_due_date : '—',
      lastWorkingDate: e.employee_last_working_date || '—',
      vacateDate: ag && (ag.agreement_scheduled_to_vacate === true || ag.agreement_scheduled_to_vacate === 'Yes' || ag.agreement_scheduled_to_vacate === 'yes') ? ag.agreement_vacate_date : '—',
    };
  });

  // --- Module 4: Financial & Compliance ---
  const refundPipeline30 = today.add(30, 'day');
  let refundsInPipeline30 = 0;
  agreements.forEach(a => {
    if (!(a.agreement_scheduled_to_vacate === true || a.agreement_scheduled_to_vacate === 'Yes' || a.agreement_scheduled_to_vacate === 'yes')) return;
    const vd = a.agreement_vacate_date ? dayjs(a.agreement_vacate_date) : null;
    if (vd && vd.isValid() && !vd.isBefore(today, 'day') && !vd.isAfter(refundPipeline30)) {
      refundsInPipeline30 += parseCurrency(a.agreement_advance_due_back || a.agreement_advance_amount || 0);
    }
  });

  const advanceRefundLiquidity = [];
  agreements.forEach(a => {
    const adv = parseCurrency(a.agreement_advance_amount || 0);
    const dueBack = parseCurrency(a.agreement_advance_due_back || adv);
    const received = parseCurrency(a.agreement_advance_received || 0);
    if (adv === 0 && dueBack === 0) return;
    const res = residenceById[a.agreement_residence_id];
    const emp = employeeByAgreementId[a.agreement_id];
    const netRealization = received - parseCurrency(a.agreement_maintenance_cut || 0);
    advanceRefundLiquidity.push({
      agreementId: a.agreement_id,
      employee: emp ? getEmployeeName(emp) : '—',
      residenceLandlord: res ? res.residence_owner_name : '—',
      totalAdvanceLocked: adv,
      refundsInPipeline30: a.agreement_scheduled_to_vacate && a.agreement_vacate_date ? dueBack : 0,
      advanceDueBack: dueBack,
      advanceReceived: received,
      netRefundRealization: netRealization,
      landlordRating: res && res.residence_owner_rating ? res.residence_owner_rating : '—',
    });
  });

  const advancePipeline = [];
  agreements.forEach(a => {
    const adv = parseCurrency(a.agreement_advance_amount || 0);
    const dueBack = parseCurrency(a.agreement_advance_due_back || adv);
    const received = parseCurrency(a.agreement_advance_received || 0);
    if (adv === 0 && dueBack === 0) return;
    const res = residenceById[a.agreement_residence_id];
    const emp = employeeByAgreementId[a.agreement_id];
    const pending = dueBack - received;
    let status = 'Pending';
    if (received >= dueBack) status = 'Closed'; else if (received > 0) status = 'Partially received';
    advancePipeline.push({
      agreementId: a.agreement_id,
      residence: res ? res.residence_id : '—',
      employee: emp ? getEmployeeName(emp) : '—',
      advanceLocked: adv,
      advanceDueBack: dueBack,
      advanceReceived: received,
      pending,
      status,
    });
  });

  const noticeDueBy = (ag) => {
    const renewal = ag.agreement_renewal_due_date ? dayjs(ag.agreement_renewal_due_date) : null;
    const days = ag.agreement_notice_period_days != null ? parseInt(ag.agreement_notice_period_days, 10) : 30;
    if (renewal && renewal.isValid()) return renewal.subtract(days, 'day').format('YYYY-MM-DD');
    return ag.agreement_notice_due_by_date || '—';
  };

  const complianceRenewalRisk = agreements.map(a => {
    const res = residenceById[a.agreement_residence_id];
    const emp = employeeByAgreementId[a.agreement_id];
    return {
      agreementId: a.agreement_id,
      residenceId: a.agreement_residence_id,
      employee: emp ? getEmployeeName(emp) : '—',
      renewalDueDate: a.agreement_renewal_due_date || '—',
      noticePeriodRequirement: noticeDueBy(a),
      statutoryStatus: a.agreement_statutory_status || '—',
      documentLocation: a.agreement_document_location || '—',
    };
  });

  const renewalsPastDue = [];
  const renewalsDueSoon = [];
  agreements.forEach(a => {
    if (!isAgreementActive(a)) return;
    const dueDate = a.agreement_renewal_due_date ? dayjs.tz(a.agreement_renewal_due_date, 'Asia/Kolkata').startOf('day') : null;
    if (!dueDate || !dueDate.isValid()) return;
    const res = residenceById[a.agreement_residence_id];
    const emp = employeeByAgreementId[a.agreement_id];
    const row = {
      agreementId: a.agreement_id,
      residenceId: a.agreement_residence_id,
      employee: emp ? getEmployeeName(emp) : '—',
      renewalDueDate: a.agreement_renewal_due_date,
      monthlyRent: parseCurrency(a.agreement_monthly_rent_amount),
    };
    if (dueDate.isBefore(today, 'day')) {
      row.daysPastDue = today.diff(dueDate, 'day');
      renewalsPastDue.push(row);
    } else if (dueDate.isSame(today, 'day') || dueDate.isBefore(ninetyDaysFromNow.add(1, 'day'), 'day')) {
      row.daysUntilDue = dueDate.diff(today, 'day');
      renewalsDueSoon.push(row);
    }
  });

  const scheduledToVacate = agreements.filter(a =>
    a.agreement_scheduled_to_vacate === true || a.agreement_scheduled_to_vacate === 'Yes' || a.agreement_scheduled_to_vacate === 'yes'
  ).map(a => {
    const res = residenceById[a.agreement_residence_id];
    const emp = employeeByAgreementId[a.agreement_id];
    const received = parseCurrency(a.agreement_advance_received || 0);
    const dueBack = parseCurrency(a.agreement_advance_due_back || a.agreement_advance_amount || 0);
    return {
      agreementId: a.agreement_id,
      employee: emp ? getEmployeeName(emp) : '—',
      residence: res ? res.residence_id : '—',
      vacateDate: a.agreement_vacate_date,
      advanceDueBack: dueBack,
      advanceReceived: received,
      status: received >= dueBack ? 'Processed' : 'Pending refund',
    };
  });

  const refundStatus = agreements.filter(a => normalizeStatus(a.agreement_status || a.status) === 'inactive' || (a.agreement_scheduled_to_vacate === true || a.agreement_scheduled_to_vacate === 'Yes' || a.agreement_scheduled_to_vacate === 'yes')).map(a => {
    const dueBack = parseCurrency(a.agreement_advance_due_back || a.agreement_advance_amount || 0);
    const received = parseCurrency(a.agreement_advance_received || 0);
    const maintenance = parseCurrency(a.agreement_maintenance_cut || 0);
    const netReturned = received - maintenance;
    const emp = employeeByAgreementId[a.agreement_id];
    const res = residenceById[a.agreement_residence_id];
    return {
      agreementId: a.agreement_id,
      employee: emp ? getEmployeeName(emp) : '—',
      residence: res ? res.residence_id : '—',
      advanceDueBack: dueBack,
      advanceReceived: received,
      maintenanceCut: maintenance,
      netReturned,
      status: received >= dueBack ? 'Processed' : 'Pending',
    };
  });

  // --- Module 5: By Owner ---
  const byOwner = {};
  residences.forEach(r => {
    const owner = (r.residence_owner_name || 'Unassigned').trim();
    if (!byOwner[owner]) byOwner[owner] = { propertyCount: 0, totalMonthlyRent: 0, totalAdvanceLocked: 0, activeAgreements: 0, landlordRating: r.residence_owner_rating || '—' };
    byOwner[owner].propertyCount++;
    const list = agreementsByResidenceId[r.residence_id] || [];
    list.forEach(a => {
      if (isAgreementActive(a)) {
        byOwner[owner].totalMonthlyRent += parseCurrency(a.agreement_monthly_rent_amount);
        byOwner[owner].totalAdvanceLocked += parseCurrency(a.agreement_advance_amount);
        byOwner[owner].activeAgreements++;
      }
    });
  });
  const byOwnerLandlord = Object.keys(byOwner).sort().map(owner => ({
    ownerName: owner,
    propertyCount: byOwner[owner].propertyCount,
    totalMonthlyRent: byOwner[owner].totalMonthlyRent,
    totalAdvanceLocked: byOwner[owner].totalAdvanceLocked,
    activeAgreements: byOwner[owner].activeAgreements,
    landlordRating: byOwner[owner].landlordRating,
    status: byOwner[owner].activeAgreements > 0 ? 'Active' : '—',
  }));

  return {
    reportDate: today.format('DD-MM-YYYY'),
    ownerSummary,
    upcomingVacancyReplacementTracker,
    propertiesBecomingAvailable,
    replacementPlanningSummary,
    propertyUtilizationOpportunityCost,
    costByProperty,
    agreementROILedger,
    departmentalExpenseMatrix,
    designationWiseSpend,
    departmentWiseEmployeeSummary,
    employeeMasterEnhanced,
    advanceRefundLiquidity,
    advancePipeline,
    complianceRenewalRisk,
    renewalsPastDue,
    renewalsDueSoon,
    scheduledToVacate,
    refundStatus,
    byOwnerLandlord,
    summary: {
      totalProperties,
      activeEmployees, inactiveEmployees,
      totalMonthlyRent, totalAdvanceLocked, totalAdvanceDueBack, totalNetReceived,
      totalScheduledToVacate, pastDue, dueSoon,
      // Enhanced KPIs:
      activeResidences, inactiveResidences,
      occupiedResidences: occupiedCount, vacantResidences,
      totalRooms, occupiedRooms, vacantRooms, roomOccupancyPct, utilizationPct,
      allocatedEmployees, unallocatedEmployees,
      leavingIn30Days, leavingIn60Days, leavingIn90Days,
      totalAdvancePending,
    },
  };
}

module.exports = { getMISData };
