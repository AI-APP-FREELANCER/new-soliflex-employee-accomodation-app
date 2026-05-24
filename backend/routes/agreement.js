const express = require('express');
const router  = express.Router();
const { authenticateToken } = require('../middleware/auth');
const excelReader = require('../data/excelReader');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const multer = require('multer');
const path = require('path');
const fs   = require('fs');

dayjs.extend(utc);
dayjs.extend(timezone);

router.use(authenticateToken);

// PDF attachment storage
const ATTACHMENTS_DIR = path.join(__dirname, '../../attachments');
if (!fs.existsSync(ATTACHMENTS_DIR)) fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, ATTACHMENTS_DIR),
    filename:    (req, file, cb) => cb(null, `${req.params.id}.pdf`),
  }),
  limits:     { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'), false);
  },
});

const parseCurrency = (val) => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const n = parseFloat(String(val).replace(/[^\d.-]/g, ''));
  return isNaN(n) ? 0 : n;
};

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

// GET /
router.get('/', async (req, res) => {
  try {
    let agreements = await excelReader.getAgreements('all');
    agreements = agreements.map(enrichAgreement);
    agreements = agreements.map(a => ({
      ...a,
      has_attachment: fs.existsSync(path.join(ATTACHMENTS_DIR, `${a.agreement_id}.pdf`)),
    }));
    if (req.query.status && req.query.status.toLowerCase() !== 'all') {
      const target = req.query.status.trim().toLowerCase();
      agreements = agreements.filter(a => a.agreement_status.toLowerCase() === target);
    }
    if (req.query.renewal_status)
      agreements = agreements.filter(a => a.computed_renewal_status === req.query.renewal_status);
    if (req.query.residence_id)
      agreements = agreements.filter(a => a.agreement_residence_id === req.query.residence_id);
    res.json(agreements);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error fetching agreements:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /active (legacy)
router.get('/active', async (req, res) => {
  try {
    const agreements = await excelReader.getAgreements('all');
    const enriched   = agreements.map(enrichAgreement);
    res.json(enriched.filter(a => a.agreement_status === 'Active'));
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error fetching active agreements:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- PDF attachment routes (must be before GET /:id) ---

router.get('/:id/attachment', (req, res) => {
  try {
    const filePath = path.join(ATTACHMENTS_DIR, `${req.params.id}.pdf`);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Attachment not found' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${req.params.id}.pdf"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error streaming attachment:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/attachment', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ message: 'File uploaded successfully', filename: req.file.filename });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error uploading attachment:', error.message);
    if (error.message === 'Only PDF files are allowed')
      return res.status(400).json({ error: error.message });
    if (error.code === 'LIMIT_FILE_SIZE')
      return res.status(400).json({ error: 'File size exceeds 3MB limit' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id/attachment', (req, res) => {
  try {
    const filePath = path.join(ATTACHMENTS_DIR, `${req.params.id}.pdf`);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Attachment not found' });
    fs.unlinkSync(filePath);
    res.json({ message: 'Attachment deleted successfully' });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error deleting attachment:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:id
router.get('/:id', async (req, res) => {
  try {
    const agreements = await excelReader.getAgreements('all');
    const agreement  = agreements.find(a => a.agreement_id === req.params.id);
    if (!agreement) return res.status(404).json({ error: 'Agreement not found' });
    const enriched = enrichAgreement(agreement);
    enriched.has_attachment = fs.existsSync(path.join(ATTACHMENTS_DIR, `${enriched.agreement_id}.pdf`));
    res.json(enriched);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error fetching agreement:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /residence/:residenceId
router.get('/residence/:residenceId', async (req, res) => {
  try {
    const agreements = await excelReader.getAgreements('all');
    res.json(agreements.filter(a => a.agreement_residence_id === req.params.residenceId).map(enrichAgreement));
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error fetching agreements by residence:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST create
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
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error creating agreement:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT update
router.put('/:id', async (req, res) => {
  try {
    const agreementId = req.params.id;
    const updates = { ...req.body };
    delete updates.agreement_id;

    if (updates.agreement_maintenance_cut !== undefined) {
      const agreements = await excelReader.getAgreements('all');
      const agreement  = agreements.find(a => a.agreement_id === agreementId);
      if (agreement) {
        const advanceDueBack  = parseFloat(updates.agreement_advance_due_back || agreement.agreement_advance_due_back || agreement.agreement_advance_amount || 0);
        const maintenanceCut  = parseFloat(updates.agreement_maintenance_cut);
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
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error updating agreement:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH deactivate
router.patch('/:id/deactivate', async (req, res) => {
  try {
    const reason      = req.body.reason || 'Marked inactive by user';
    const deactivated = await excelReader.deactivateAgreement(req.params.id, reason);
    if (!deactivated) return res.status(404).json({ error: 'Agreement not found' });
    res.json(enrichAgreement(deactivated));
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error deactivating agreement:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST schedule-vacate
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
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error scheduling vacate:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST revoke-vacate
router.post('/:id/revoke-vacate', async (req, res) => {
  try {
    const updated = await excelReader.updateAgreement(req.params.id, {
      agreement_scheduled_to_vacate: false,
      agreement_vacate_date: null,
    });
    if (!updated) return res.status(404).json({ error: 'Agreement not found' });
    res.json(enrichAgreement(updated));
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error revoking vacate:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST process-refund
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
      agreement_advance_due_back:    advanceDueBack,
      agreement_maintenance_cut:     maintenanceCut,
      agreement_deduction_electricity: electric,
      agreement_deduction_water:     water,
      agreement_deduction_other:     other,
      agreement_advance_received:    advanceDueBack - maintenanceCut,
    });
    if (!updated) return res.status(404).json({ error: 'Agreement not found' });
    res.json(enrichAgreement(updated));
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error processing refund:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
