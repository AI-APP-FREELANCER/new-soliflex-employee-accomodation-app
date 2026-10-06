/**
 * MIS Reports - Builds all table data for the dashboard.
 * Every figure comes from the shared accommodation snapshot so the KPI cards,
 * tables and exports agree with each other (see accommodationSnapshot.js for
 * the definitions of occupancy, allocation, rent share and refunds).
 */
const { loadSnapshot } = require('./accommodationSnapshot');
const dayjs = require('dayjs');

/**
 * Returns full MIS payload: ownerSummary, occupancy & vacancy tables, pipeline tables,
 * cost optimization, departmental, financial/compliance, byOwner.
 */
async function getMISData() {
  const snap = await loadSnapshot();
  const {
    today, agreements, employees, residences,
    residenceById, agreementById, residenceStats, employeeAllocation, rentShareByEmployee,
    refunds, totals: t, units, unitName,
  } = snap;
  const { num, isActiveStatus, isEmployeeActive, isScheduledToVacate, employeeName, residenceLabel } = snap.helpers;

  const shortAddress = (r) => (r ? ([r.residence_address_line_1, r.residence_address_line_2].filter(Boolean).join(', ') || r.residence_id) : '—');

  // Active occupants of each agreement (room-allocated or linked to the residence).
  const occupantsByAgreement = {};
  employees.forEach(e => {
    if (!isEmployeeActive(e)) return;
    const al = employeeAllocation[e.employee_id];
    if (al.agreement_id) (occupantsByAgreement[al.agreement_id] ||= []).push(e);
  });
  // Employees ever linked to an agreement (for vacated agreements, who lived there).
  const linkedByAgreement = {};
  employees.forEach(e => {
    if (e.emplyee_allocated_agreement_id) (linkedByAgreement[e.emplyee_allocated_agreement_id] ||= []).push(e);
  });
  const occupantLabel = (agId) => {
    const list = occupantsByAgreement[agId] || linkedByAgreement[agId] || [];
    if (!list.length) return '—';
    return list.length === 1 ? employeeName(list[0]) : `${employeeName(list[0])} +${list.length - 1} more`;
  };

  // ── Renewal counts ─────────────────────────────────────────────────────────
  const ninetyDaysFromNow = today.add(90, 'day');
  let pastDue = 0, dueSoon = 0;
  const renewalsPastDue = [];
  const renewalsDueSoon = [];
  agreements.forEach(a => {
    if (!isActiveStatus(a.agreement_status)) return;
    const dueDate = a.agreement_renewal_due_date ? dayjs.tz(a.agreement_renewal_due_date, 'Asia/Kolkata').startOf('day') : null;
    if (!dueDate || !dueDate.isValid()) return;
    const row = {
      agreementId: a.agreement_id,
      residenceId: a.agreement_residence_id,
      employee: occupantLabel(a.agreement_id),
      renewalDueDate: a.agreement_renewal_due_date,
      monthlyRent: num(a.agreement_monthly_rent_amount),
    };
    if (dueDate.isBefore(today, 'day')) {
      pastDue++;
      renewalsPastDue.push({ ...row, daysPastDue: today.diff(dueDate, 'day') });
    } else if (!dueDate.isAfter(ninetyDaysFromNow, 'day')) {
      dueSoon++;
      renewalsDueSoon.push({ ...row, daysUntilDue: dueDate.diff(today, 'day') });
    }
  });

  const vacatingAgreements = agreements.filter(a => isActiveStatus(a.agreement_status) && isScheduledToVacate(a));
  const totalScheduledToVacate = vacatingAgreements.length;

  const leavingWithin = (days) => employees.filter(e => {
    if (!isEmployeeActive(e)) return false;
    const lwd = e.employee_last_working_date ? dayjs(e.employee_last_working_date) : null;
    return lwd && lwd.isValid() && !lwd.isBefore(today, 'day') && !lwd.isAfter(today.add(days, 'day'), 'day');
  }).length;
  const leavingIn30Days = leavingWithin(30);
  const leavingIn60Days = leavingWithin(60);
  const leavingIn90Days = leavingWithin(90);

  const activeAllocated = t.employeesWithRoom + t.employeesResidenceOnly;
  const utilizationPct = t.activeResidences > 0 ? Math.round((t.occupiedResidences / t.activeResidences) * 100) : 0;

  // ── Module 0: Owner's Summary ──────────────────────────────────────────────
  const ownerSummary = [
    { metric: 'Total Monthly Burn (Rent)', currentValue: t.monthlyRent, monthOverMonthTrend: '—', actionRequired: `${t.activeAgreements} active agreements` },
    { metric: 'Bed Occupancy (%)', currentValue: `${t.occupancyPct}%`, monthOverMonthTrend: '—', actionRequired: t.vacantBeds > 0 ? `${t.vacantBeds} vacant beds across ${t.roomsWithVacancy} rooms` : '—' },
    { metric: 'Total Bed Capacity', currentValue: t.bedCapacity, monthOverMonthTrend: '—', actionRequired: `${t.occupiedBeds} occupied · ${t.vacantBeds} vacant` },
    { metric: 'Rooms (Full / Partial / Vacant)', currentValue: `${t.fullRooms} / ${t.partialRooms} / ${t.vacantRooms}`, monthOverMonthTrend: '—', actionRequired: `${t.totalRooms} rooms configured` },
    { metric: 'Residences Without Room Setup', currentValue: t.residencesWithoutStructure, monthOverMonthTrend: '—', actionRequired: t.residencesWithoutStructure > 0 ? 'Add floors & rooms so occupancy is measured' : '—' },
    { metric: 'Occupied Residences', currentValue: t.occupiedResidences, monthOverMonthTrend: '—', actionRequired: t.vacantResidences > 0 ? `${t.vacantResidences} active residences with no occupants` : '—' },
    { metric: 'Active Employees', currentValue: t.activeEmployees, monthOverMonthTrend: '—', actionRequired: '—' },
    { metric: 'Employees Allocated to a Room', currentValue: t.employeesWithRoom, monthOverMonthTrend: '—', actionRequired: t.employeesResidenceOnly > 0 ? `${t.employeesResidenceOnly} more linked to a residence but no room yet` : '—' },
    { metric: 'Employees Not Allocated', currentValue: t.employeesUnallocated, monthOverMonthTrend: '—', actionRequired: t.employeesUnallocated > 0 ? 'Assign accommodation' : '—' },
    { metric: 'Inactive Employees', currentValue: t.inactiveEmployees, monthOverMonthTrend: '—', actionRequired: t.bedsHeldByInactive > 0 ? `${t.bedsHeldByInactive} beds still held by inactive employees — release them` : '—' },
    { metric: 'Pipeline Ready (Scheduled to Vacate)', currentValue: totalScheduledToVacate, monthOverMonthTrend: '—', actionRequired: totalScheduledToVacate > 0 ? 'Map to upcoming vacancies' : '—' },
    { metric: 'Past Due Renewals', currentValue: pastDue, monthOverMonthTrend: '—', actionRequired: pastDue > 0 ? 'Review past due agreements' : '—' },
    { metric: 'Due in 90 Days', currentValue: dueSoon, monthOverMonthTrend: '—', actionRequired: dueSoon > 0 ? 'Plan renewals' : '—' },
    { metric: 'Advance Locked (Active Agreements)', currentValue: t.advanceLocked, monthOverMonthTrend: '—', actionRequired: '—' },
    { metric: 'Advance Refund Outstanding', currentValue: t.refundOutstanding, monthOverMonthTrend: '—', actionRequired: t.refundOutstanding > 0 ? `${t.refundCasesOpen} vacated agreements — follow up with landlords` : '—' },
    { metric: 'Advance Refund Received', currentValue: t.refundReceived, monthOverMonthTrend: '—', actionRequired: '—' },
    { metric: 'Advance Refunds Upcoming (Vacating)', currentValue: t.refundUpcoming, monthOverMonthTrend: '—', actionRequired: t.refundUpcoming > 0 ? 'Request refund on vacating' : '—' },
    { metric: 'Employees Leaving ≤30 Days', currentValue: leavingIn30Days, monthOverMonthTrend: '—', actionRequired: leavingIn30Days > 0 ? 'Urgent — plan accommodation transitions' : '—' },
    { metric: 'Report Date', currentValue: today.format('DD-MM-YYYY'), monthOverMonthTrend: '—', actionRequired: '—' },
  ];

  // ── Occupancy & vacancy (room level) ───────────────────────────────────────
  const residenceOccupancy = Object.values(residenceStats)
    .filter(r => r.status === 'active')
    .map(r => ({
      residenceId: r.residence_id,
      residence: r.name,
      owner: r.owner || '—',
      unit: r.unit,
      floors: r.floors.length,
      rooms: r.totalRooms,
      capacity: r.capacity,
      occupied: r.occupied,
      vacant: r.vacant,
      occupancyPct: r.occupancyPct,
      fullRooms: r.fullRooms,
      partialRooms: r.partialRooms,
      vacantRooms: r.vacantRooms,
      residentsWithoutRoom: r.residentsWithoutRoom.length,
      setupStatus: r.structureConfigured ? 'Configured' : 'Room setup pending',
    }))
    .sort((a, b) => b.vacant - a.vacant || a.residenceId.localeCompare(b.residenceId));

  const roomVacancy = [];
  Object.values(residenceStats).forEach(r => {
    if (r.status !== 'active') return;
    r.rooms.filter(room => room.countable).forEach(room => {
      roomVacancy.push({
        roomId: room.room_id,
        residenceId: r.residence_id,
        residence: r.name,
        unit: r.unit,
        floor: room.floor_number || '—',
        room: room.room_number,
        roomType: room.room_type || '—',
        capacity: room.capacity,
        occupied: room.occupied,
        vacant: room.vacant,
        occupancyPct: room.occupancyPct,
        status: room.status,
        occupants: room.beds.filter(b => b.occupied).map(b => b.allocation.employee_name).join(', ') || '—',
      });
    });
  });
  roomVacancy.sort((a, b) => b.vacant - a.vacant || a.residenceId.localeCompare(b.residenceId) || String(a.room).localeCompare(String(b.room)));

  // ── Module 1: Proactive Pipeline ───────────────────────────────────────────
  const allocationLabel = (e) => {
    const al = employeeAllocation[e.employee_id];
    if (!al.residence_id) return '—';
    const r = residenceById[al.residence_id];
    const base = `${al.residence_id} ${shortAddress(r)}`;
    return al.type === 'ROOM' ? `${base} · Room ${al.room_number}` : base;
  };

  const upcomingVacancyReplacementTracker = [];
  const lwdWindowEnd = today.add(60, 'day');
  employees.forEach(e => {
    if (!isEmployeeActive(e)) return;
    const lwd = e.employee_last_working_date ? dayjs(e.employee_last_working_date) : null;
    if (!lwd || !lwd.isValid() || lwd.isBefore(today, 'day') || lwd.isAfter(lwdWindowEnd)) return;
    upcomingVacancyReplacementTracker.push({
      employeeName: employeeName(e),
      department: e.employee_department || '—',
      projectedLWD: e.employee_last_working_date,
      noticeStatus: e.employee_notice_served ? 'Notice served' : '—',
      allocatedResidence: allocationLabel(e),
      replacementCandidate: '—',
      transitionBuffer: '—',
      daysLeft: lwd.diff(today, 'day'),
    });
  });
  upcomingVacancyReplacementTracker.sort((a, b) => (a.projectedLWD || '').localeCompare(b.projectedLWD || ''));

  const propertiesBecomingAvailable = [];
  const windowEnd = today.add(90, 'day');
  vacatingAgreements.forEach(a => {
    const vd = a.agreement_vacate_date ? dayjs(a.agreement_vacate_date) : null;
    if (!vd || !vd.isValid() || vd.isBefore(today, 'day') || vd.isAfter(windowEnd)) return;
    const res = residenceById[a.agreement_residence_id];
    const occ = occupantsByAgreement[a.agreement_id] || [];
    propertiesBecomingAvailable.push({
      residenceId: a.agreement_residence_id,
      ownerName: res ? res.residence_owner_name : '—',
      vacateDate: a.agreement_vacate_date,
      currentEmployee: occupantLabel(a.agreement_id),
      currentEmployeeId: occ[0]?.employee_id || '—',
      department: occ[0]?.employee_department || '—',
      agreementId: a.agreement_id,
      daysUntilAvailable: vd.diff(today, 'day'),
    });
  });
  propertiesBecomingAvailable.sort((a, b) => (a.vacateDate || '').localeCompare(b.vacateDate || ''));

  const replacementPlanningSummary = vacatingAgreements.map(a => {
    const res = residenceById[a.agreement_residence_id];
    const occ = occupantsByAgreement[a.agreement_id] || [];
    return {
      residenceId: a.agreement_residence_id,
      owner: res ? res.residence_owner_name : '—',
      vacateDate: a.agreement_vacate_date,
      outgoingEmployee: occupantLabel(a.agreement_id),
      outgoingEmployeeId: occ[0]?.employee_id || '—',
      department: occ[0]?.employee_department || '—',
      lastWorkingDate: occ[0]?.employee_last_working_date || '—',
      advanceDueBack: refunds[a.agreement_id].expected,
      replacementCandidate: '—',
      suggestedAction: occ.length > 0 ? `Re-house ${occ.length} employee(s) before vacating` : 'Plan next allocation',
    };
  }).sort((a, b) => (a.vacateDate || '').localeCompare(b.vacateDate || ''));

  // ── Module 2: Cost Optimization ────────────────────────────────────────────
  const propertyUtilizationOpportunityCost = residenceOccupancy.map(r => {
    const rent = residenceStats[r.residenceId].monthly_rent;
    let suggestion = '—';
    if (r.setupStatus !== 'Configured') suggestion = 'Set up floors & rooms to track occupancy';
    else if (r.capacity > 0 && r.occupied === 0) suggestion = 'Vacant — allocate or review agreement';
    else if (r.vacant > 0) suggestion = `${r.vacant} bed(s) free — allocate before renting elsewhere`;
    return {
      residenceId: r.residenceId,
      address: shortAddress(residenceById[r.residenceId]),
      capacity: r.capacity,
      occupancy: r.occupied,
      vacant: r.vacant,
      occupancyPct: r.occupancyPct,
      monthlyRent: rent,
      vacancyCost: r.capacity > 0 ? Math.round((rent / r.capacity) * r.vacant) : 0,
      vacancyDays: '—',
      lostRent: r.capacity > 0 ? Math.round((rent / r.capacity) * r.vacant) : '—',
      optimizationSuggestion: suggestion,
    };
  });

  const costByProperty = [];
  agreements.forEach(a => {
    if (!isActiveStatus(a.agreement_status)) return;
    const res = residenceById[a.agreement_residence_id];
    const stats = residenceStats[a.agreement_residence_id];
    const rent = num(a.agreement_monthly_rent_amount);
    const occupants = (occupantsByAgreement[a.agreement_id] || []).length;
    costByProperty.push({
      residenceId: a.agreement_residence_id,
      ownerName: res ? res.residence_owner_name : '—',
      address: shortAddress(res),
      unit: unitName(a.agreement_employee_unit),
      monthlyRent: rent,
      advanceLocked: num(a.agreement_advance_amount),
      agreementStatus: 'Active',
      employee: occupantLabel(a.agreement_id),
      occupants,
      capacity: stats ? stats.capacity : 0,
      costPerHead: occupants > 0 ? Math.round(rent / occupants) : '—',
      costPerBed: stats && stats.capacity > 0 ? Math.round(rent / stats.capacity) : '—',
    });
  });

  const agreementROILedger = agreements.map(a => {
    const res = residenceById[a.agreement_residence_id];
    const rp = refunds[a.agreement_id];
    const rent = num(a.agreement_monthly_rent_amount);
    const possession = a.agreement_possesion_date ? dayjs(a.agreement_possesion_date) : null;
    const tenureMonths = possession && possession.isValid() ? today.diff(possession, 'month') : null;
    const maintenanceEfficiency = (rp.isRefundCase && tenureMonths > 0 && rent > 0)
      ? `${(rp.deductions / (tenureMonths * rent) * 100).toFixed(1)}%` : '—';
    return {
      landlordName: res ? res.residence_owner_name : '—',
      agreementId: a.agreement_id,
      historicalRentHikes: '—',
      advanceDueBack: rp.isRefundCase ? rp.dueBack : 0,
      advanceReceived: rp.received,
      advanceRecoveryStatus: rp.stage,
      maintenanceEfficiency,
    };
  });

  // ── Module 3: Departmental MIS ─────────────────────────────────────────────
  const deptCount = {};
  const deptRent = {};
  employees.forEach(e => {
    const dept = (e.employee_department || 'Unassigned').trim();
    const c = (deptCount[dept] ||= { total: 0, active: 0, inactive: 0, withRoom: 0, residenceOnly: 0, unallocated: 0 });
    c.total++;
    if (!isEmployeeActive(e)) { c.inactive++; return; }
    c.active++;
    const type = employeeAllocation[e.employee_id].type;
    if (type === 'ROOM') c.withRoom++;
    else if (type === 'RESIDENCE_ONLY') c.residenceOnly++;
    else c.unallocated++;
    if (rentShareByEmployee[e.employee_id]) deptRent[dept] = (deptRent[dept] || 0) + rentShareByEmployee[e.employee_id];
  });

  const departmentalExpenseMatrix = Object.keys(deptCount).sort().map(dept => {
    const c = deptCount[dept];
    const residents = c.withRoom + c.residenceOnly;
    const rent = Math.round(deptRent[dept] || 0);
    return {
      department: dept,
      totalResidentCount: residents,
      cumulativeMonthlyRent: rent,
      costPerHead: residents > 0 ? Math.round(rent / residents) : '—',
      budgetVariance: '—',
    };
  });

  const designationMap = {};
  employees.forEach(e => {
    if (!isEmployeeActive(e)) return;
    const des = (e.employee_designation || 'Unassigned').trim();
    const d = (designationMap[des] ||= { count: 0, residents: 0, rent: 0, tenures: [] });
    d.count++;
    const al = employeeAllocation[e.employee_id];
    if (!al.agreement_id) return;
    d.residents++;
    d.rent += rentShareByEmployee[e.employee_id] || 0;
    const ag = agreementById[al.agreement_id];
    const pos = ag?.agreement_possesion_date ? dayjs(ag.agreement_possesion_date) : null;
    if (pos && pos.isValid()) d.tenures.push(today.diff(pos, 'month'));
  });
  const designationWiseSpend = Object.keys(designationMap).sort().map(des => {
    const d = designationMap[des];
    const perHead = d.residents > 0 ? d.rent / d.residents : 0;
    let accommodationGrade = '—';
    if (perHead > 0) accommodationGrade = perHead > 25000 ? 'High' : perHead > 15000 ? 'Medium' : 'Low';
    return {
      designation: des,
      count: d.count,
      totalMonthlyRent: Math.round(d.rent),
      costPerHead: perHead > 0 ? Math.round(perHead) : '—',
      accommodationGrade,
      averageTenureInQuarters: d.tenures.length ? (d.tenures.reduce((s, x) => s + x, 0) / d.tenures.length).toFixed(1) + ' months' : '—',
    };
  });

  const departmentWiseEmployeeSummary = Object.keys(deptCount).sort().map(dept => {
    const c = deptCount[dept];
    return {
      department: dept,
      totalEmployees: c.total,
      active: c.active,
      inactive: c.inactive,
      allocated: c.withRoom + c.residenceOnly,
      withRoom: c.withRoom,
      residenceOnly: c.residenceOnly,
      unallocated: c.unallocated,
    };
  });

  const employeeMasterEnhanced = employees.map(e => {
    const al = employeeAllocation[e.employee_id];
    const ag = al.agreement_id ? agreementById[al.agreement_id] : null;
    return {
      employeeId: e.employee_id,
      name: employeeName(e),
      department: e.employee_department || '—',
      designation: e.employee_designation || '—',
      dateOfJoining: e.employee_date_of_joining || '—',
      status: isEmployeeActive(e) ? 'Active' : 'Inactive',
      allocationStatus: !isEmployeeActive(e) ? '—' : al.type === 'ROOM' ? 'Room allocated' : al.type === 'RESIDENCE_ONLY' ? 'Room not assigned' : 'Not allocated',
      allocatedResidenceId: al.residence_id || '—',
      room: al.room_number ? `${al.floor_number ? al.floor_number + ' · ' : ''}Room ${al.room_number}` : '—',
      agreementId: al.agreement_id || '—',
      renewalDue: ag ? ag.agreement_renewal_due_date : '—',
      lastWorkingDate: e.employee_last_working_date || '—',
      vacateDate: ag && isScheduledToVacate(ag) ? ag.agreement_vacate_date : '—',
    };
  });

  // ── Module 4: Financial & Compliance ───────────────────────────────────────
  const refundRow = (a) => {
    const rp = refunds[a.agreement_id];
    const res = residenceById[a.agreement_residence_id];
    return {
      agreementId: a.agreement_id,
      residence: a.agreement_residence_id || '—',
      residenceLandlord: res ? res.residence_owner_name : '—',
      employee: occupantLabel(a.agreement_id),
      vacateDate: a.agreement_vacate_date || (a.inactiveDate ? a.inactiveDate.split('T')[0] : null),
      advanceLocked: rp.advance,
      advanceDueBack: rp.dueBack,
      deductions: rp.deductions,
      expectedRefund: rp.expected,
      advanceReceived: rp.received,
      pending: rp.outstanding,
      status: rp.stage,
      requestedDate: a.agreement_refund_requested_date || null,
      followUpDate: a.agreement_refund_followup_date || null,
      lastReceiptDate: rp.lastReceiptDate,
      landlordRating: res && res.residence_owner_rating ? res.residence_owner_rating : '—',
    };
  };

  const refundCases = agreements.filter(a => refunds[a.agreement_id].isRefundCase);
  const advancePipeline = refundCases.map(refundRow).sort((a, b) => b.pending - a.pending);

  const advanceRefundLiquidity = refundCases.map(a => {
    const r = refundRow(a);
    const vd = a.agreement_vacate_date ? dayjs(a.agreement_vacate_date) : null;
    const in30 = vd && vd.isValid() && !vd.isBefore(today, 'day') && !vd.isAfter(today.add(30, 'day'));
    return {
      agreementId: r.agreementId,
      employee: r.employee,
      residenceLandlord: r.residenceLandlord,
      totalAdvanceLocked: r.advanceLocked,
      refundsInPipeline30: in30 ? r.expectedRefund : 0,
      advanceDueBack: r.advanceDueBack,
      advanceReceived: r.advanceReceived,
      netRefundRealization: r.advanceReceived,
      landlordRating: r.landlordRating,
    };
  });

  const noticeDueBy = (ag) => {
    const renewal = ag.agreement_renewal_due_date ? dayjs(ag.agreement_renewal_due_date) : null;
    const days = ag.agreement_notice_period_days != null ? parseInt(ag.agreement_notice_period_days, 10) : 30;
    if (renewal && renewal.isValid()) return renewal.subtract(days, 'day').format('YYYY-MM-DD');
    return ag.agreement_notice_due_by_date || '—';
  };

  const complianceRenewalRisk = agreements.filter(a => isActiveStatus(a.agreement_status)).map(a => ({
    agreementId: a.agreement_id,
    residenceId: a.agreement_residence_id,
    employee: occupantLabel(a.agreement_id),
    renewalDueDate: a.agreement_renewal_due_date || '—',
    noticePeriodRequirement: noticeDueBy(a),
    statutoryStatus: a.agreement_statutory_status || '—',
    documentLocation: a.agreement_document_location || '—',
  }));

  const scheduledToVacate = vacatingAgreements.map(a => {
    const r = refundRow(a);
    return {
      agreementId: r.agreementId,
      employee: r.employee,
      residence: r.residence,
      vacateDate: a.agreement_vacate_date,
      advanceDueBack: r.expectedRefund,
      advanceReceived: r.advanceReceived,
      status: r.status,
    };
  });

  const refundStatus = refundCases.map(a => {
    const r = refundRow(a);
    return {
      agreementId: r.agreementId,
      employee: r.employee,
      residence: r.residence,
      advanceDueBack: r.advanceDueBack,
      maintenanceCut: r.deductions,
      expectedRefund: r.expectedRefund,
      advanceReceived: r.advanceReceived,
      netReturned: r.advanceReceived,
      pending: r.pending,
      status: r.status,
    };
  });

  // ── Module 5: By Owner ─────────────────────────────────────────────────────
  const byOwner = {};
  residences.forEach(r => {
    const owner = (r.residence_owner_name || 'Unassigned').trim();
    const o = (byOwner[owner] ||= { propertyCount: 0, totalMonthlyRent: 0, totalAdvanceLocked: 0, activeAgreements: 0, refundOutstanding: 0, landlordRating: r.residence_owner_rating || '—' });
    o.propertyCount++;
  });
  agreements.forEach(a => {
    const res = residenceById[a.agreement_residence_id];
    const owner = ((res && res.residence_owner_name) || 'Unassigned').trim();
    const o = (byOwner[owner] ||= { propertyCount: 0, totalMonthlyRent: 0, totalAdvanceLocked: 0, activeAgreements: 0, refundOutstanding: 0, landlordRating: '—' });
    if (isActiveStatus(a.agreement_status)) {
      o.totalMonthlyRent += num(a.agreement_monthly_rent_amount);
      o.totalAdvanceLocked += num(a.agreement_advance_amount);
      o.activeAgreements++;
    }
    o.refundOutstanding += refunds[a.agreement_id].outstanding;
  });
  const byOwnerLandlord = Object.keys(byOwner).sort().map(owner => ({
    ownerName: owner,
    ...byOwner[owner],
    status: byOwner[owner].activeAgreements > 0 ? 'Active' : '—',
  }));

  return {
    reportDate: today.format('DD-MM-YYYY'),
    ownerSummary,
    residenceOccupancy,
    roomVacancy,
    unitSummary: units,
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
      totalProperties: residences.length,
      activeEmployees: t.activeEmployees,
      inactiveEmployees: t.inactiveEmployees,
      totalMonthlyRent: t.monthlyRent,
      totalAdvanceLocked: t.advanceLocked,
      totalAdvanceDueBack: t.refundExpected,
      totalNetReceived: t.refundReceived,
      totalAdvancePending: t.refundOutstanding,
      totalRefundDeductions: t.refundDeductions,
      totalRefundUpcoming: t.refundUpcoming,
      refundCasesOpen: t.refundCasesOpen,
      totalScheduledToVacate, pastDue, dueSoon,
      activeResidences: t.activeResidences,
      inactiveResidences: t.inactiveResidences,
      occupiedResidences: t.occupiedResidences,
      vacantResidences: t.vacantResidences,
      residencesWithStructure: t.residencesWithStructure,
      residencesWithoutStructure: t.residencesWithoutStructure,
      utilizationPct,
      totalRooms: t.totalRooms,
      fullRooms: t.fullRooms,
      partialRooms: t.partialRooms,
      vacantRooms: t.vacantRooms,
      roomsWithVacancy: t.roomsWithVacancy,
      occupiedRooms: t.fullRooms + t.partialRooms,
      totalBeds: t.bedCapacity,
      occupiedBeds: t.occupiedBeds,
      vacantBeds: t.vacantBeds,
      bedsHeldByInactive: t.bedsHeldByInactive,
      bedOccupancyPct: t.occupancyPct,
      roomOccupancyPct: t.occupancyPct,
      allocatedEmployees: activeAllocated,
      employeesWithRoom: t.employeesWithRoom,
      employeesResidenceOnly: t.employeesResidenceOnly,
      unallocatedEmployees: t.employeesUnallocated,
      leavingIn30Days, leavingIn60Days, leavingIn90Days,
    },
  };
}

module.exports = { getMISData };
