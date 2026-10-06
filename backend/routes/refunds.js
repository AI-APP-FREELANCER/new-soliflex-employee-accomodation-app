/**
 * Advance refund management.
 *
 * Process for a vacated (or vacating) agreement:
 *   1. Record landlord deductions (electricity / water / other)  → expected refund
 *   2. Mark the refund as requested and set a follow-up date
 *   3. Record each amount the landlord pays back as a receipt (partial payments allowed)
 *   4. The refund is settled automatically when receipts cover the expected refund
 *
 *   GET    /api/refunds                                 all refund cases with their position
 *   GET    /api/refunds/:agreementId                    one case + receipts
 *   PUT    /api/refunds/:agreementId/deductions         set deductions (and due-back override)
 *   PUT    /api/refunds/:agreementId/follow-up          requested date / follow-up date / notes
 *   POST   /api/refunds/:agreementId/receipts           record an amount received
 *   DELETE /api/refunds/:agreementId/receipts/:id       remove a wrongly entered receipt
 */
const express = require('express');
const router  = express.Router();
const { authenticateToken } = require('../middleware/auth');
const pool = require('../data/db');
const { loadSnapshot, refundPosition } = require('../data/accommodationSnapshot');
const refundService = require('../data/refundService');

router.use(authenticateToken);

const fail = (res, err) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  if (process.env.NODE_ENV === 'development') console.error('Refund route error:', err.message);
  return res.status(500).json({ error: 'Internal server error' });
};

router.get('/', async (req, res) => {
  try {
    const snap = await loadSnapshot();
    const { employeeName } = snap.helpers;
    const linked = {};
    snap.employees.forEach(e => {
      if (e.emplyee_allocated_agreement_id) (linked[e.emplyee_allocated_agreement_id] ||= []).push(employeeName(e));
    });
    const rows = snap.agreements
      .filter(a => snap.refunds[a.agreement_id].isRefundCase || req.query.all === 'true')
      .map(a => {
        const rp = snap.refunds[a.agreement_id];
        const r = snap.residenceById[a.agreement_residence_id];
        return {
          agreement_id: a.agreement_id,
          residence_id: a.agreement_residence_id,
          residence: snap.helpers.residenceLabel(r),
          landlord: r?.residence_owner_name || '—',
          landlord_phone: r?.residence_owner_phone || r?.residence_owner_contact || null,
          unit: snap.unitName(a.agreement_employee_unit),
          agreement_status: snap.helpers.isActiveStatus(a.agreement_status) ? 'Active' : 'Inactive',
          vacate_date: a.agreement_vacate_date || (a.inactiveDate ? a.inactiveDate.split('T')[0] : null),
          occupants: (linked[a.agreement_id] || []).join(', '),
          requested_date: a.agreement_refund_requested_date || null,
          follow_up_date: a.agreement_refund_followup_date || null,
          settled_date: a.agreement_refund_settled_date || null,
          notes: a.agreement_refund_notes || null,
          last_receipt_date: rp.lastReceiptDate,
          advance: rp.advance,
          due_back: rp.dueBack,
          deductions: rp.deductions,
          deduction_breakdown: rp.deductionBreakdown,
          expected: rp.expected,
          received: rp.received,
          outstanding: rp.outstanding,
          stage: rp.stage,
        };
      })
      .sort((a, b) => b.outstanding - a.outstanding);
    res.json({
      summary: {
        expected: snap.totals.refundExpected,
        received: snap.totals.refundReceived,
        deductions: snap.totals.refundDeductions,
        outstanding: snap.totals.refundOutstanding,
        upcoming: snap.totals.refundUpcoming,
        openCases: snap.totals.refundCasesOpen,
      },
      rows,
    });
  } catch (err) { fail(res, err); }
});

router.get('/:agreementId', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM agreement_master WHERE agreement_id = $1', [req.params.agreementId]);
    if (!rows.length) return res.status(404).json({ error: 'Agreement not found' });
    const receipts = await refundService.listReceipts(req.params.agreementId);
    const received = receipts.reduce((s, r) => s + Number(r.amount), 0);
    res.json({
      agreement_id: req.params.agreementId,
      position: refundPosition(rows[0], received, new Date()),
      requested_date: rows[0].agreement_refund_requested_date,
      follow_up_date: rows[0].agreement_refund_followup_date,
      settled_date: rows[0].agreement_refund_settled_date,
      notes: rows[0].agreement_refund_notes,
      receipts,
    });
  } catch (err) { fail(res, err); }
});

router.put('/:agreementId/deductions', async (req, res) => {
  try { res.json(await refundService.setDeductions(req.params.agreementId, req.body)); }
  catch (err) { fail(res, err); }
});

router.put('/:agreementId/follow-up', async (req, res) => {
  try { res.json(await refundService.setFollowUp(req.params.agreementId, req.body)); }
  catch (err) { fail(res, err); }
});

router.post('/:agreementId/receipts', async (req, res) => {
  try { res.status(201).json(await refundService.addReceipt(req.params.agreementId, { ...req.body, user: req.user?.username })); }
  catch (err) { fail(res, err); }
});

router.delete('/:agreementId/receipts/:receiptId', async (req, res) => {
  try { res.json(await refundService.deleteReceipt(req.params.agreementId, Number(req.params.receiptId))); }
  catch (err) { fail(res, err); }
});

module.exports = router;
