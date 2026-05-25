const express = require('express');
const router  = express.Router();
const { authenticateToken } = require('../middleware/auth');
const excelReader = require('../data/excelReader');
const pool = require('../data/db');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');
const {
  DOC_TYPES,
  getAllowedMimes,
  getMaxFileSizeBytes,
  ensureEntityDir,
  generateStoredFilename,
  resolveFilePath,
  contentTypeForExt,
} = require('../utils/fileStorage');

dayjs.extend(utc);
dayjs.extend(timezone);

router.use(authenticateToken);

// ─── Currency helper ───────────────────────────────────────────────────────────

const parseCurrency = (val) => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const n = parseFloat(String(val).replace(/[^\d.-]/g, ''));
  return isNaN(n) ? 0 : n;
};

// ─── Agreement enrichment ──────────────────────────────────────────────────────

function enrichAgreement(agreement) {
  const today = dayjs.tz(dayjs(), 'Asia/Kolkata').startOf('day');

  agreement.agreement_monthly_rent_amount = parseCurrency(agreement.agreement_monthly_rent_amount);
  agreement.agreement_advance_amount      = parseCurrency(agreement.agreement_advance_amount);

  let rawStatus = String(agreement.agreement_status || agreement.status || '').trim();
  let normalizedStatus = rawStatus.toLowerCase() === 'inactive' ? 'Inactive' : 'Active';
  agreement.agreement_status = normalizedStatus;

  const renewalDueDate = agreement.agreement_renewal_due_date;
  if (!renewalDueDate || normalizedStatus === 'Inactive') {
    return { ...agreement, computed_renewal_status: 'N/A', days_until_renewal: null, formatted_renewal_date: null };
  }

  let dueDate = dayjs.tz(renewalDueDate, 'Asia/Kolkata').startOf('day');
  if (!dueDate.isValid()) dueDate = dayjs(renewalDueDate, 'YYYY-MM-DD').tz('Asia/Kolkata').startOf('day');
  if (!dueDate.isValid()) return { ...agreement, computed_renewal_status: 'N/A', days_until_renewal: null };

  const daysUntilRenewal  = dueDate.diff(today, 'day');
  const ninetyDaysFromNow = today.add(90, 'day');
  let computedStatus = 'Safe';
  if (dueDate.isBefore(today, 'day')) computedStatus = 'Past Due';
  else if (dueDate.isSame(today, 'day') || dueDate.isBefore(ninetyDaysFromNow.add(1, 'day'))) computedStatus = 'Due Soon';

  return {
    ...agreement,
    computed_renewal_status: computedStatus,
    days_until_renewal:      daysUntilRenewal,
    formatted_renewal_date:  dueDate.format('YYYY-MM-DD'),
  };
}

async function addAttachmentMeta(agreement) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS cnt FROM file_uploads WHERE entity_type='agreement' AND entity_id=$1 AND doc_type='agreement_pdf'`,
    [agreement.agreement_id]
  );
  return { ...agreement, attachment_count: parseInt(rows[0].cnt) || 0, has_attachment: parseInt(rows[0].cnt) > 0 };
}

async function addAttachmentMetaList(agreements) {
  if (!agreements.length) return agreements;
  const ids    = agreements.map(a => a.agreement_id);
  const { rows } = await pool.query(
    `SELECT entity_id, COUNT(*) AS cnt FROM file_uploads
       WHERE entity_type='agreement' AND doc_type='agreement_pdf' AND entity_id = ANY($1::text[])
       GROUP BY entity_id`,
    [ids]
  );
  const countMap = {};
  rows.forEach(r => { countMap[r.entity_id] = parseInt(r.cnt) || 0; });
  return agreements.map(a => ({
    ...a,
    attachment_count: countMap[a.agreement_id] || 0,
    has_attachment:   (countMap[a.agreement_id] || 0) > 0,
  }));
}

// ─── Agreement PDF uploader factory ───────────────────────────────────────────

function pdfUploader(agreementId) {
  const docType      = DOC_TYPES.AGREEMENT_PDF;
  const allowedMimes = getAllowedMimes(docType);
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        try   { cb(null, ensureEntityDir('agreement', agreementId)); }
        catch (e) { cb(e); }
      },
      filename: (req, file, cb) => {
        const ext = allowedMimes[file.mimetype];
        if (!ext) return cb(new Error('Only PDF files are allowed'));
        cb(null, generateStoredFilename(docType, ext));
      },
    }),
    limits:     { fileSize: getMaxFileSizeBytes(docType) },
    fileFilter: (req, file, cb) => {
      if (allowedMimes[file.mimetype]) cb(null, true);
      else cb(new Error('Only PDF files are allowed'));
    },
  });
}

// ─── Attachment routes (single / backward-compatible) ────────────────────────

/** GET latest PDF attachment for an agreement (backward compat) */
router.get('/:id/attachment', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM file_uploads WHERE entity_type='agreement' AND entity_id=$1
         AND doc_type='agreement_pdf' ORDER BY uploaded_at DESC LIMIT 1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No attachment found' });
    const record   = rows[0];
    const filePath = resolveFilePath('agreement', req.params.id, record.stored_filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Attachment file not found on disk' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(record.original_name || record.stored_filename)}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST upload a PDF for an agreement (appends — supports multiple) */
router.post('/:id/attachment', async (req, res) => {
  const agreementId = req.params.id;
  pdfUploader(agreementId).single('file')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File size exceeds 10MB limit' });
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    try {
      const fileId = crypto.randomBytes(16).toString('hex');
      const { rows } = await pool.query(
        `INSERT INTO file_uploads
           (file_id, entity_type, entity_id, doc_type, original_name, stored_filename, file_ext, file_size_bytes, mime_type)
         VALUES ($1,'agreement',$2,'agreement_pdf',$3,$4,$5,$6,$7)
         RETURNING *`,
        [fileId, agreementId, req.file.originalname, req.file.filename, 'pdf', req.file.size, req.file.mimetype]
      );
      res.status(201).json({ message: 'File uploaded successfully', file: rows[0] });
    } catch (dbErr) {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(500).json({ error: 'Failed to save file record' });
    }
  });
});

/** DELETE a specific attachment by file_id */
router.delete('/:id/attachment/:fileId', async (req, res) => {
  try {
    const agreementId = req.params.id;
    const fileId      = req.params.fileId;
    const { rows } = await pool.query(
      `SELECT * FROM file_uploads WHERE file_id=$1 AND entity_type='agreement' AND entity_id=$2`,
      [fileId, agreementId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Attachment not found' });
    const filePath = resolveFilePath('agreement', agreementId, rows[0].stored_filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await pool.query('DELETE FROM file_uploads WHERE file_id=$1', [fileId]);
    res.json({ message: 'Attachment deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** DELETE legacy route (no file_id — deletes most recent) */
router.delete('/:id/attachment', async (req, res) => {
  try {
    const agreementId = req.params.id;
    const { rows } = await pool.query(
      `SELECT * FROM file_uploads WHERE entity_type='agreement' AND entity_id=$1
         AND doc_type='agreement_pdf' ORDER BY uploaded_at DESC LIMIT 1`,
      [agreementId]
    );
    if (!rows.length) return res.status(404).json({ error: 'No attachment found' });
    const filePath = resolveFilePath('agreement', agreementId, rows[0].stored_filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await pool.query('DELETE FROM file_uploads WHERE file_id=$1', [rows[0].file_id]);
    res.json({ message: 'Attachment deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET list of all attachments for an agreement */
router.get('/:id/attachments', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM file_uploads WHERE entity_type='agreement' AND entity_id=$1
         AND doc_type='agreement_pdf' ORDER BY uploaded_at ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── CRUD routes ───────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    let agreements = await excelReader.getAgreements('all');
    agreements = agreements.map(enrichAgreement);
    agreements = await addAttachmentMetaList(agreements);
    if (req.query.status && req.query.status.toLowerCase() !== 'all') {
      const target = req.query.status.trim().toLowerCase();
      agreements = agreements.filter(a => a.agreement_status.toLowerCase() === target);
    }
    if (req.query.renewal_status)
      agreements = agreements.filter(a => a.computed_renewal_status === req.query.renewal_status);
    if (req.query.residence_id)
      agreements = agreements.filter(a => a.agreement_residence_id === req.query.residence_id);
    res.json(agreements);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/active', async (req, res) => {
  try {
    const agreements = await excelReader.getAgreements('all');
    const enriched   = agreements.map(enrichAgreement).filter(a => a.agreement_status === 'Active');
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/residence/:residenceId', async (req, res) => {
  try {
    const agreements = await excelReader.getAgreements('all');
    const filtered   = agreements.filter(a => a.agreement_residence_id === req.params.residenceId)
      .map(enrichAgreement);
    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const agreements = await excelReader.getAgreements('all');
    const agreement  = agreements.find(a => a.agreement_id === req.params.id);
    if (!agreement) return res.status(404).json({ error: 'Agreement not found' });
    const enriched = enrichAgreement(agreement);
    res.json(await addAttachmentMeta(enriched));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const data = { ...req.body };
    if (!data.agreement_id) {
      const agreements = await excelReader.getAgreements('all');
      const maxId = agreements.length > 0
        ? Math.max(...agreements.map(a => { const m = a.agreement_id?.match(/\d+$/); return m ? parseInt(m[0]) : 0; }))
        : 0;
      data.agreement_id = `agreement_${String(maxId + 1).padStart(3, '0')}`;
    }
    if (!data.agreement_status) data.agreement_status = 'active';
    const newAgreement = await excelReader.addAgreement(data);
    res.status(201).json(newAgreement);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const agreementId = req.params.id;
    const updates = { ...req.body };
    delete updates.agreement_id;

    if (updates.agreement_maintenance_cut !== undefined) {
      const agreements = await excelReader.getAgreements('all');
      const agreement  = agreements.find(a => a.agreement_id === agreementId);
      if (agreement) {
        const advanceDueBack = parseFloat(updates.agreement_advance_due_back || agreement.agreement_advance_due_back || agreement.agreement_advance_amount || 0);
        const maintenanceCut = parseFloat(updates.agreement_maintenance_cut);
        if (maintenanceCut > advanceDueBack)
          return res.status(400).json({ error: 'Maintenance cut cannot exceed advance due back amount' });
        updates.agreement_advance_received = advanceDueBack - maintenanceCut;
      }
    }

    if (updates.agreement_vacate_date) {
      const vd = dayjs(updates.agreement_vacate_date);
      if (vd.isValid()) updates.agreement_vacate_date = vd.format('YYYY-MM-DD');
    }

    const updated = await excelReader.updateAgreement(agreementId, updates);
    if (!updated) return res.status(404).json({ error: 'Agreement not found' });
    res.json(enrichAgreement(updated));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id/deactivate', async (req, res) => {
  try {
    const reason      = req.body.reason || 'Marked inactive by user';
    const deactivated = await excelReader.deactivateAgreement(req.params.id, reason);
    if (!deactivated) return res.status(404).json({ error: 'Agreement not found' });
    res.json(enrichAgreement(deactivated));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/schedule-vacate', async (req, res) => {
  try {
    const { agreement_vacate_date } = req.body;
    if (!agreement_vacate_date) return res.status(400).json({ error: 'Vacate date is required' });
    const vacateDate = dayjs(agreement_vacate_date);
    if (!vacateDate.isValid()) return res.status(400).json({ error: 'Invalid vacate date format' });
    const updated = await excelReader.updateAgreement(req.params.id, {
      agreement_scheduled_to_vacate: true,
      agreement_vacate_date: vacateDate.format('YYYY-MM-DD'),
    });
    if (!updated) return res.status(404).json({ error: 'Agreement not found' });
    res.json(enrichAgreement(updated));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/revoke-vacate', async (req, res) => {
  try {
    const updated = await excelReader.updateAgreement(req.params.id, {
      agreement_scheduled_to_vacate: false,
      agreement_vacate_date: null,
    });
    if (!updated) return res.status(404).json({ error: 'Agreement not found' });
    res.json(enrichAgreement(updated));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/process-refund', async (req, res) => {
  try {
    const { agreement_maintenance_cut, agreement_deduction_electricity, agreement_deduction_water, agreement_deduction_other } = req.body;

    const agreements = await excelReader.getAgreements('all');
    const agreement  = agreements.find(a => a.agreement_id === req.params.id);
    if (!agreement) return res.status(404).json({ error: 'Agreement not found' });

    const advanceDueBack = parseFloat(agreement.agreement_advance_due_back || agreement.agreement_advance_amount || 0);
    const hasBreakdown   = agreement_deduction_electricity != null || agreement_deduction_water != null || agreement_deduction_other != null;

    let maintenanceCut, electric = 0, water = 0, other = 0;
    if (hasBreakdown) {
      electric       = Math.max(0, parseFloat(agreement_deduction_electricity) || 0);
      water          = Math.max(0, parseFloat(agreement_deduction_water) || 0);
      other          = Math.max(0, parseFloat(agreement_deduction_other) || 0);
      maintenanceCut = electric + water + other;
    } else {
      if (agreement_maintenance_cut == null)
        return res.status(400).json({ error: 'Enter deduction amounts (electricity, water, other) or maintenance cut total' });
      maintenanceCut = parseFloat(agreement_maintenance_cut);
      if (isNaN(maintenanceCut) || maintenanceCut < 0)
        return res.status(400).json({ error: 'Maintenance cut must be a valid non-negative number' });
    }

    if (maintenanceCut > advanceDueBack)
      return res.status(400).json({ error: 'Total deductions cannot exceed advance due back amount' });

    const updated = await excelReader.updateAgreement(req.params.id, {
      agreement_advance_due_back:      advanceDueBack,
      agreement_maintenance_cut:       maintenanceCut,
      agreement_deduction_electricity: electric,
      agreement_deduction_water:       water,
      agreement_deduction_other:       other,
      agreement_advance_received:      advanceDueBack - maintenanceCut,
    });
    if (!updated) return res.status(404).json({ error: 'Agreement not found' });
    res.json(enrichAgreement(updated));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
