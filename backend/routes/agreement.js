const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const excelReader = require('../data/excelReader');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

dayjs.extend(utc);
dayjs.extend(timezone);

router.use(authenticateToken);

// --- PDF ATTACHMENT CONFIGURATION ---
// Ensure attachments folder exists in project root
const ATTACHMENTS_DIR = path.join(__dirname, '../../attachments');
if (!fs.existsSync(ATTACHMENTS_DIR)) {
  fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, ATTACHMENTS_DIR),
  filename: (req, file, cb) => cb(null, `${req.params.id}.pdf`) // Rename to ID.pdf
});

const upload = multer({ 
  storage: storage, 
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// --- HELPER: Fix NaN Issues ---
const parseCurrency = (val) => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  // Remove commas, currency symbols, leave only digits, dots, minus
  const clean = String(val).replace(/[^\d.-]/g, '');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
};

// --- HELPER: Enrich & Normalize ---
function enrichAgreement(agreement) {
  const today = dayjs.tz(dayjs(), 'Asia/Kolkata').startOf('day');
  
  // 1. Fix Currency Fields
  agreement.agreement_monthly_rent_amount = parseCurrency(agreement.agreement_monthly_rent_amount);
  agreement.agreement_advance_amount = parseCurrency(agreement.agreement_advance_amount);

  // 2. Robust Status Normalization
  // Check both key variations. Trim whitespace.
  let rawStatus = agreement.agreement_status || agreement.status || '';
  rawStatus = String(rawStatus).trim();
  
  // Logic: If explicitly "Inactive", set Inactive. Otherwise (Active, active, "", null) -> Active.
  let normalizedStatus = 'Active';
  if (rawStatus.toLowerCase() === 'inactive') {
    normalizedStatus = 'Inactive';
  }
  
  // Update the object
  agreement.agreement_status = normalizedStatus;

  // 3. Renewal Logic
  const renewalDueDate = agreement.agreement_renewal_due_date;
  const isInactive = normalizedStatus === 'Inactive';
  
  if (!renewalDueDate || isInactive) {
    return { 
      ...agreement, 
      computed_renewal_status: 'N/A',
      days_until_renewal: null,
      formatted_renewal_date: null
    };
  }
  
  let dueDate = dayjs.tz(renewalDueDate, 'Asia/Kolkata').startOf('day');
  if (!dueDate.isValid()) {
    dueDate = dayjs(renewalDueDate, 'YYYY-MM-DD').tz('Asia/Kolkata').startOf('day');
  }
  
  if (!dueDate.isValid()) {
    return { ...agreement, computed_renewal_status: 'N/A', days_until_renewal: null };
  }
  
  const daysUntilRenewal = dueDate.diff(today, 'day');
  const ninetyDaysFromNow = today.add(90, 'day');
  
  let computedStatus = 'Safe';
  if (dueDate.isBefore(today, 'day')) {
    computedStatus = 'Past Due';
  } else if (dueDate.isSame(today, 'day') || dueDate.isBefore(ninetyDaysFromNow.add(1, 'day'))) {
    computedStatus = 'Due Soon';
  }
  
  return { 
    ...agreement, 
    computed_renewal_status: computedStatus, 
    days_until_renewal: daysUntilRenewal, 
    formatted_renewal_date: dueDate.format('YYYY-MM-DD') 
  };
}

// GET / - Fetch All with Filters
router.get('/', (req, res) => {
  try {
    // 1. Fetch ALL data (Bypass reader filtering)
    let agreements = excelReader.getAgreements('all');
    
    // 2. Enrich & Normalize
    agreements = agreements.map(enrichAgreement);

    // 3. Add has_attachment flag for each agreement
    agreements = agreements.map(agreement => {
      const filePath = path.join(ATTACHMENTS_DIR, `${agreement.agreement_id}.pdf`);
      return {
        ...agreement,
        has_attachment: fs.existsSync(filePath)
      };
    });

    // 4. Apply Status Filter
    if (req.query.status && req.query.status.toLowerCase() !== 'all') {
      const target = req.query.status.trim().toLowerCase();
      agreements = agreements.filter(a => a.agreement_status.toLowerCase() === target);
    }
    
    // 5. Apply Renewal Filter
    if (req.query.renewal_status) {
      agreements = agreements.filter(a => a.computed_renewal_status === req.query.renewal_status);
    }

    // 6. Apply Residence Filter
    if (req.query.residence_id) {
      agreements = agreements.filter(a => a.agreement_residence_id === req.query.residence_id);
    }

    res.json(agreements);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching agreements:', error.message);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /active - Legacy Route
router.get('/active', (req, res) => {
  try {
    const agreements = excelReader.getAgreements('all');
    const enriched = agreements.map(enrichAgreement);
    const activeOnly = enriched.filter(a => a.agreement_status === 'Active');
    res.json(activeOnly);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching active agreements:', error.message);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- PDF ATTACHMENT ROUTES (Must be defined before GET /:id to avoid route conflicts) ---

// GET /:id/attachment - Stream PDF attachment
router.get('/:id/attachment', (req, res) => {
  try {
    const filePath = path.join(ATTACHMENTS_DIR, `${req.params.id}.pdf`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${req.params.id}.pdf"`);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error streaming attachment:', error.message);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /:id/attachment - Upload PDF attachment
router.post('/:id/attachment', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    res.json({ 
      message: 'File uploaded successfully',
      filename: req.file.filename 
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error uploading attachment:', error.message);
    }
    
    if (error.message === 'Only PDF files are allowed') {
      return res.status(400).json({ error: error.message });
    }
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size exceeds 3MB limit' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /:id/attachment - Delete PDF attachment
router.delete('/:id/attachment', (req, res) => {
  try {
    const filePath = path.join(ATTACHMENTS_DIR, `${req.params.id}.pdf`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    
    fs.unlinkSync(filePath);
    res.json({ message: 'Attachment deleted successfully' });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error deleting attachment:', error.message);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:id - Single Agreement
router.get('/:id', (req, res) => {
  try {
    const agreements = excelReader.getAgreements('all');
    const agreement = agreements.find(a => a.agreement_id === req.params.id);
    
    if (!agreement) return res.status(404).json({ error: 'Agreement not found' });
    
    const enriched = enrichAgreement(agreement);
    const filePath = path.join(ATTACHMENTS_DIR, `${enriched.agreement_id}.pdf`);
    enriched.has_attachment = fs.existsSync(filePath);
    
    res.json(enriched);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching agreement:', error.message);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /residence/:residenceId - By Residence
router.get('/residence/:residenceId', (req, res) => {
  try {
    const agreements = excelReader.getAgreements('all');
    const residenceAgreements = agreements.filter(a => 
      a.agreement_residence_id === req.params.residenceId
    );
    res.json(residenceAgreements.map(enrichAgreement));
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching agreements by residence:', error.message);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST / - Create
router.post('/', (req, res) => {
  try {
    const data = req.body;
    // Auto-ID Logic
    if (!data.agreement_id) {
      const agreements = excelReader.getAgreements();
      const maxId = agreements.length > 0 
        ? Math.max(...agreements.map(a => {
            const match = a.agreement_id?.match(/\d+$/);
            return match ? parseInt(match[0]) : 0;
          }))
        : 0;
      data.agreement_id = `agreement_${String(maxId + 1).padStart(3, '0')}`;
    }
    if (!data.agreement_status) data.agreement_status = 'Active';
    
    const newAgreement = excelReader.addAgreement(data);
    res.status(201).json(newAgreement);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error creating agreement:', error.message);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /:id - Update
router.put('/:id', (req, res) => {
  try {
    const agreementId = req.params.id;
    const updates = req.body;
    delete updates.agreement_id; // Don't allow changing ID
    
    const updatedAgreement = excelReader.updateAgreement(agreementId, updates);
    if (!updatedAgreement) return res.status(404).json({ error: 'Agreement not found' });
    
    res.json(updatedAgreement);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error updating agreement:', error.message);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /:id/deactivate - Deactivate
router.patch('/:id/deactivate', (req, res) => {
  try {
    const agreementId = req.params.id;
    const reason = req.body.reason || 'Marked inactive by user';
    
    const deactivatedAgreement = excelReader.deactivateAgreement(agreementId, reason);
    if (!deactivatedAgreement) return res.status(404).json({ error: 'Agreement not found' });
    
    res.json(deactivatedAgreement);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error deactivating agreement:', error.message);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- PDF ATTACHMENT ROUTES ---

// POST /:id/attachment - Upload PDF attachment
router.post('/:id/attachment', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    res.json({ 
      message: 'File uploaded successfully',
      filename: req.file.filename 
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error uploading attachment:', error.message);
    }
    
    if (error.message === 'Only PDF files are allowed') {
      return res.status(400).json({ error: error.message });
    }
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size exceeds 3MB limit' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:id/attachment - Stream PDF attachment
router.get('/:id/attachment', (req, res) => {
  try {
    const filePath = path.join(ATTACHMENTS_DIR, `${req.params.id}.pdf`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename=' + path.basename(filePath));
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error streaming attachment:', error.message);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /:id/attachment - Delete PDF attachment
router.delete('/:id/attachment', (req, res) => {
  try {
    const filePath = path.join(ATTACHMENTS_DIR, `${req.params.id}.pdf`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    
    fs.unlinkSync(filePath);
    res.json({ message: 'Attachment deleted successfully' });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error deleting attachment:', error.message);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;