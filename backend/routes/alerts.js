/**
 * Alerts — computed live from current data each time they are requested, so they
 * always reflect what still needs doing (an alert disappears once it is handled).
 *
 *   GET /api/alerts  →  { counts: { high, medium, low }, alerts: [...] }
 *
 * Each alert: { id, severity, category, title, detail, link }
 * `id` is stable for the same underlying issue so the UI can remember dismissals.
 */
const express = require('express');
const router  = express.Router();
const dayjs = require('dayjs');
const { authenticateToken } = require('../middleware/auth');
const { loadSnapshot } = require('../data/accommodationSnapshot');

router.use(authenticateToken);

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

router.get('/', async (req, res) => {
  try {
    const snap = await loadSnapshot();
    const { today, agreements, employees, residenceStats, employeeAllocation, refunds, residenceById } = snap;
    const { isActiveStatus, isEmployeeActive, isScheduledToVacate, employeeName, residenceLabel } = snap.helpers;
    const fmt = (d) => dayjs(d).format('DD-MM-YYYY');
    const alerts = [];
    const push = (a) => alerts.push(a);

    // ── Agreements: renewals and notice deadlines ────────────────────────────
    agreements.forEach(a => {
      if (!isActiveStatus(a.agreement_status)) return;
      const where = residenceLabel(residenceById[a.agreement_residence_id]);
      if (a.agreement_renewal_due_date) {
        const due = dayjs(a.agreement_renewal_due_date);
        const days = due.diff(today, 'day');
        if (days < 0) {
          push({ id: `renewal-overdue-${a.agreement_id}-${a.agreement_renewal_due_date}`, severity: 'high', category: 'Renewal',
            title: `Agreement ${a.agreement_id} renewal overdue by ${-days} days`,
            detail: `${where} — renewal was due ${fmt(due)}`, link: '/agreements?filter=pastDue' });
        } else if (days <= 30) {
          push({ id: `renewal-due-${a.agreement_id}-${a.agreement_renewal_due_date}`, severity: 'medium', category: 'Renewal',
            title: `Agreement ${a.agreement_id} renewal due in ${days} days`,
            detail: `${where} — due ${fmt(due)}`, link: '/agreements?filter=due90' });
        }
        const noticeDays = a.agreement_notice_period_days != null ? parseInt(a.agreement_notice_period_days, 10) : null;
        if (noticeDays && !isScheduledToVacate(a)) {
          const noticeBy = due.subtract(noticeDays, 'day');
          const left = noticeBy.diff(today, 'day');
          if (left >= 0 && left <= 15) {
            push({ id: `notice-${a.agreement_id}-${noticeBy.format('YYYY-MM-DD')}`, severity: 'medium', category: 'Renewal',
              title: `Decide renew / vacate for ${a.agreement_id} within ${left} days`,
              detail: `${noticeDays}-day notice to landlord must be given by ${fmt(noticeBy)}`, link: '/agreements' });
          }
        }
      }
      // Vacating soon but people still housed there.
      if (isScheduledToVacate(a) && a.agreement_vacate_date) {
        const stats = residenceStats[a.agreement_residence_id];
        const housed = stats ? stats.occupied + stats.residentsWithoutRoom.length : 0;
        const left = dayjs(a.agreement_vacate_date).diff(today, 'day');
        if (housed > 0 && left <= 30) {
          push({ id: `vacate-occupied-${a.agreement_id}`, severity: 'high', category: 'Vacate',
            title: `${housed} employee(s) still housed in a residence vacating ${left < 0 ? `${-left} days ago` : `in ${left} days`}`,
            detail: `${where} — transfer them before ${fmt(a.agreement_vacate_date)}`, link: `/residences?view=${a.agreement_residence_id}` });
        }
      }
    });

    // ── Residences: occupants without a running agreement, setup gaps ────────
    Object.values(residenceStats).forEach(r => {
      if (r.occupied > 0 && (!r.agreement_id || r.status !== 'active')) {
        push({ id: `no-agreement-${r.residence_id}`, severity: 'high', category: 'Allocation',
          title: `${r.occupied} employee(s) allocated in ${r.name} which has no active agreement`,
          detail: 'Renew the agreement or transfer the occupants', link: `/residences?view=${r.residence_id}` });
      }
      if (r.status === 'active' && !r.structureConfigured) {
        push({ id: `no-rooms-${r.residence_id}`, severity: 'low', category: 'Setup',
          title: `Rooms not set up for ${r.name}`,
          detail: 'Add floors and rooms so vacancy and occupancy can be tracked', link: `/residences?view=${r.residence_id}` });
      }
      r.rooms.forEach(room => room.beds.forEach(bed => {
        const al = bed.allocation;
        if (!al) return;
        if (al.employee_status !== 'Active') {
          push({ id: `inactive-holding-${bed.bed_id}-${al.alloc_id}`, severity: 'high', category: 'Allocation',
            title: `Inactive employee ${al.employee_name} still holds a bed`,
            detail: `${r.name} · Room ${room.room_number} · ${bed.bed_label} — vacate to free the bed`, link: `/residences?view=${r.residence_id}` });
          return;
        }
        const lwd = al.last_working_date ? dayjs(al.last_working_date) : null;
        if (lwd && lwd.isValid()) {
          const left = lwd.diff(today, 'day');
          if (left < 0) {
            push({ id: `lwd-passed-${al.alloc_id}`, severity: 'high', category: 'Vacate',
              title: `${al.employee_name}'s last working day was ${fmt(lwd)} — bed not vacated`,
              detail: `${r.name} · Room ${room.room_number}`, link: `/residences?view=${r.residence_id}` });
          } else if (left <= 7) {
            push({ id: `lwd-soon-${al.alloc_id}`, severity: 'medium', category: 'Vacate',
              title: `${al.employee_name} leaves in ${left} days — plan the vacate`,
              detail: `${r.name} · Room ${room.room_number} · last day ${fmt(lwd)}`, link: `/residences?view=${r.residence_id}` });
          }
        }
        if (al.release_date && dayjs(al.release_date).isBefore(today, 'day') && !(lwd && lwd.isBefore(today, 'day'))) {
          push({ id: `release-overdue-${al.alloc_id}-${al.release_date}`, severity: 'medium', category: 'Vacate',
            title: `Planned release date passed for ${al.employee_name}`,
            detail: `${r.name} · Room ${room.room_number} — planned ${fmt(al.release_date)}. Vacate or update the date.`, link: `/residences?view=${r.residence_id}` });
        }
      }));
    });

    // ── Employees: active but not allocated ──────────────────────────────────
    const unallocated = employees.filter(e => isEmployeeActive(e) && employeeAllocation[e.employee_id].type === 'UNALLOCATED');
    if (unallocated.length) {
      push({ id: `unallocated-${unallocated.length}`, severity: 'low', category: 'Allocation',
        title: `${unallocated.length} active employee(s) without accommodation`,
        detail: unallocated.slice(0, 5).map(employeeName).join(', ') + (unallocated.length > 5 ? '…' : ''), link: '/employees' });
    }
    const roomless = employees.filter(e => isEmployeeActive(e) && employeeAllocation[e.employee_id].type === 'RESIDENCE_ONLY');
    if (roomless.length) {
      push({ id: `roomless-${roomless.length}`, severity: 'low', category: 'Allocation',
        title: `${roomless.length} employee(s) linked to a residence but not assigned a room`,
        detail: 'Assign them to a room so room-level occupancy is accurate', link: '/residences' });
    }

    // ── Advance refunds ──────────────────────────────────────────────────────
    agreements.forEach(a => {
      const rp = refunds[a.agreement_id];
      if (rp.isRefundCase === false || rp.stage === 'Upcoming' || rp.outstanding <= 0) return;
      const where = residenceLabel(residenceById[a.agreement_residence_id]);
      const amount = `₹${Math.round(rp.outstanding).toLocaleString('en-IN')}`;
      if (rp.stage === 'Follow-up overdue') {
        push({ id: `refund-followup-${a.agreement_id}-${a.agreement_refund_followup_date}`, severity: 'high', category: 'Refund',
          title: `Refund follow-up overdue: ${amount} from ${residenceById[a.agreement_residence_id]?.residence_owner_name || 'landlord'}`,
          detail: `${a.agreement_id} · ${where} — follow-up was due ${fmt(a.agreement_refund_followup_date)}`, link: '/refunds' });
        return;
      }
      const vacated = a.inactiveDate ? dayjs(a.inactiveDate) : null;
      const age = vacated && vacated.isValid() ? today.diff(vacated, 'day') : null;
      if (!a.agreement_refund_requested_date && (age === null || age >= 7)) {
        push({ id: `refund-not-requested-${a.agreement_id}`, severity: 'medium', category: 'Refund',
          title: `Advance refund of ${amount} not yet requested`,
          detail: `${a.agreement_id} · ${where}${age !== null ? ` — vacated ${age} days ago` : ''}`, link: '/refunds' });
      }
    });

    alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.category.localeCompare(b.category));
    const counts = { high: 0, medium: 0, low: 0 };
    alerts.forEach(a => { counts[a.severity]++; });
    res.json({ generatedAt: new Date().toISOString(), counts, alerts });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') console.error('Alerts error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
