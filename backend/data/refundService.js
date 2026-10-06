/**
 * Advance refund bookkeeping. Receipts are the record of money actually received;
 * agreement_master.agreement_advance_received is kept equal to their sum so older
 * screens and exports stay correct.
 */
const pool = require('./db');
const { refundPosition } = require('./accommodationSnapshot');

class RefundError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const money = (v) => {
  if (v === undefined || v === null || v === '') return 0;
  const n = parseFloat(v);
  if (isNaN(n) || n < 0) throw new RefundError('Amounts must be valid non-negative numbers');
  return Math.round(n * 100) / 100;
};

async function withAgreement(agreementId, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM agreement_master WHERE agreement_id = $1 FOR UPDATE', [agreementId]);
    if (!rows.length) throw new RefundError('Agreement not found', 404);
    const result = await fn(client, rows[0]);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function assertRefundCase(agreement) {
  const inactive = String(agreement.agreement_status || '').toLowerCase() === 'inactive';
  const vacating = agreement.agreement_scheduled_to_vacate === true;
  if (!inactive && !vacating) {
    throw new RefundError('Refunds can only be recorded once the agreement is vacated or scheduled to vacate');
  }
}

/** Recompute received total and settled date after any change, and return the new position. */
async function resync(client, agreementId) {
  const sum = await client.query('SELECT COALESCE(SUM(amount), 0) AS total FROM advance_refund_receipts WHERE agreement_id = $1', [agreementId]);
  const received = Number(sum.rows[0].total);
  const { rows } = await client.query('SELECT * FROM agreement_master WHERE agreement_id = $1', [agreementId]);
  const pos = refundPosition(rows[0], received, new Date());
  const settled = pos.stage === 'Settled';
  const upd = await client.query(`
    UPDATE agreement_master SET
      agreement_advance_received = $2,
      agreement_refund_settled_date = CASE WHEN $3 THEN COALESCE(agreement_refund_settled_date, CURRENT_DATE) ELSE NULL END,
      updated_at = NOW()
    WHERE agreement_id = $1 RETURNING *
  `, [agreementId, received, settled]);
  return { agreement: upd.rows[0], position: refundPosition(upd.rows[0], received, new Date()) };
}

async function listReceipts(agreementId) {
  const { rows } = await pool.query(
    'SELECT * FROM advance_refund_receipts WHERE agreement_id = $1 ORDER BY received_date, receipt_id', [agreementId]);
  return rows;
}

async function setDeductions(agreementId, body) {
  return withAgreement(agreementId, async (client, ag) => {
    assertRefundCase(ag);
    const electricity = money(body.electricity ?? body.agreement_deduction_electricity);
    const water       = money(body.water ?? body.agreement_deduction_water);
    const other       = money(body.other ?? body.agreement_deduction_other);
    const total = electricity + water + other;
    const advance = Number(ag.agreement_advance_amount) || 0;
    const dueBack = body.due_back !== undefined && body.due_back !== null && body.due_back !== ''
      ? money(body.due_back)
      : (Number(ag.agreement_advance_due_back) > 0 ? Number(ag.agreement_advance_due_back) : advance);
    if (total > dueBack) throw new RefundError(`Deductions (₹${total}) cannot exceed the advance due back (₹${dueBack})`);
    const received = Number(ag.agreement_advance_received) || 0;
    if (received > dueBack - total) {
      throw new RefundError(`₹${received} has already been received, which is more than the refund would be after these deductions`);
    }
    await client.query(`
      UPDATE agreement_master SET
        agreement_advance_due_back = $2,
        agreement_deduction_electricity = $3,
        agreement_deduction_water = $4,
        agreement_deduction_other = $5,
        agreement_maintenance_cut = $6,
        updated_at = NOW()
      WHERE agreement_id = $1
    `, [agreementId, dueBack, electricity, water, other, total]);
    return resync(client, agreementId);
  });
}

async function setFollowUp(agreementId, body) {
  return withAgreement(agreementId, async (client, ag) => {
    assertRefundCase(ag);
    const pick = (k, col) => (body[k] !== undefined ? (body[k] || null) : ag[col]);
    await client.query(`
      UPDATE agreement_master SET
        agreement_refund_requested_date = $2,
        agreement_refund_followup_date  = $3,
        agreement_refund_notes          = $4,
        updated_at = NOW()
      WHERE agreement_id = $1
    `, [agreementId,
        pick('requested_date', 'agreement_refund_requested_date'),
        pick('follow_up_date', 'agreement_refund_followup_date'),
        pick('notes', 'agreement_refund_notes')]);
    return resync(client, agreementId);
  });
}

async function addReceipt(agreementId, { amount, received_date, payment_mode, reference_no, notes, user }) {
  return withAgreement(agreementId, async (client, ag) => {
    assertRefundCase(ag);
    const amt = money(amount);
    if (amt <= 0) throw new RefundError('Amount must be greater than zero');
    const sum = await client.query('SELECT COALESCE(SUM(amount), 0) AS total FROM advance_refund_receipts WHERE agreement_id = $1', [agreementId]);
    const pos = refundPosition(ag, Number(sum.rows[0].total), new Date());
    if (amt > pos.outstanding + 0.005) {
      throw new RefundError(`Amount exceeds the outstanding refund of ₹${pos.outstanding.toLocaleString('en-IN')}. Check the deductions first.`);
    }
    await client.query(`
      INSERT INTO advance_refund_receipts (agreement_id, amount, received_date, payment_mode, reference_no, notes, recorded_by)
      VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4, $5, $6, $7)
    `, [agreementId, amt, received_date || null, payment_mode || null, reference_no || null, notes || null, user || null]);
    return resync(client, agreementId);
  });
}

async function deleteReceipt(agreementId, receiptId) {
  return withAgreement(agreementId, async (client) => {
    const del = await client.query('DELETE FROM advance_refund_receipts WHERE receipt_id = $1 AND agreement_id = $2 RETURNING *', [receiptId, agreementId]);
    if (!del.rows.length) throw new RefundError('Receipt not found', 404);
    return resync(client, agreementId);
  });
}

/**
 * One-step settlement used by the Agreements screen's "Process Refund" form:
 * record deductions and the landlord paying back the remaining amount in full.
 */
async function settleInFull(agreementId, deductions, user) {
  await setDeductions(agreementId, deductions);
  return withAgreement(agreementId, async (client, ag) => {
    const sum = await client.query('SELECT COALESCE(SUM(amount), 0) AS total FROM advance_refund_receipts WHERE agreement_id = $1', [agreementId]);
    const pos = refundPosition(ag, Number(sum.rows[0].total), new Date());
    if (pos.outstanding > 0) {
      await client.query(`
        INSERT INTO advance_refund_receipts (agreement_id, amount, received_date, notes, recorded_by)
        VALUES ($1, $2, CURRENT_DATE, 'Balance received in full (Process Refund)', $3)
      `, [agreementId, pos.outstanding, user || null]);
    }
    return resync(client, agreementId);
  });
}

module.exports = { RefundError, listReceipts, setDeductions, setFollowUp, addReceipt, deleteReceipt, settleInFull };
