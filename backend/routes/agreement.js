const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const excelReader = require('../data/excelReader');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

router.use(authenticateToken);

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

    // 3. Apply Status Filter
    if (req.query.status && req.query.status.toLowerCase() !== 'all') {
      const target = req.query.status.trim().toLowerCase();
      agreements = agreements.filter(a => a.agreement_status.toLowerCase() === target);
    }
    
    // 4. Apply Renewal Filter
    if (req.query.renewal_status) {
      agreements = agreements.filter(a => a.computed_renewal_status === req.query.renewal_status);
    }

    // 5. Apply Residence Filter
    if (req.query.residence_id) {
      agreements = agreements.filter(a => a.agreement_residence_id === req.query.residence_id);
    }

    res.json(agreements);
  } catch (error) {
    console.error('Error fetching agreements:', error);
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
    console.error('Error fetching active agreements:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:id - Single Agreement
router.get('/:id', (req, res) => {
  try {
    const agreements = excelReader.getAgreements('all');
    const agreement = agreements.find(a => a.agreement_id === req.params.id);
    
    if (!agreement) return res.status(404).json({ error: 'Agreement not found' });
    
    res.json(enrichAgreement(agreement));
  } catch (error) {
    console.error('Error fetching agreement:', error);
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
    console.error('Error fetching agreements by residence:', error);
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
    console.error('Error creating agreement:', error);
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
    console.error('Error updating agreement:', error);
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
    console.error('Error deactivating agreement:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;