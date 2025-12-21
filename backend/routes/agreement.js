const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const excelReader = require('../data/excelReader');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

// All routes require authentication
router.use(authenticateToken);

/**
 * Enrich agreement with virtual fields and Normalize Status
 */
function enrichAgreement(agreement) {
  const today = dayjs.tz(dayjs(), 'Asia/Kolkata').startOf('day');
  const renewalDueDate = agreement.agreement_renewal_due_date;
  
  // --- ROBUST STATUS NORMALIZATION ---
  // 1. Get raw status from possible fields
  let rawStatus = agreement.status || agreement.agreement_status || '';
  // 2. Convert to string, trim whitespace
  rawStatus = String(rawStatus).trim();
  // 3. Normalize to Title Case (e.g. "active" -> "Active", "INACTIVE" -> "Inactive")
  //    This ensures the Frontend sees consistent "Active" or "Inactive" tags.
  const normalizedStatus = rawStatus.length > 0 
    ? rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase() 
    : 'Active'; // Default to Active if missing

  // Overwrite with clean status
  agreement.agreement_status = normalizedStatus;

  const isInactive = normalizedStatus === 'Inactive';
  
  // If renewal date is missing or agreement is inactive, return N/A for renewal logic
  if (!renewalDueDate || isInactive) {
    return {
      ...agreement,
      computed_renewal_status: 'N/A',
      days_until_renewal: null,
      formatted_renewal_date: null
    };
  }
  
  // Parse renewal date robustly
  let dueDate;
  try {
    // Try parsing as ISO string first
    dueDate = dayjs.tz(renewalDueDate, 'Asia/Kolkata').startOf('day');
    if (!dueDate.isValid()) {
      // Try parsing as YYYY-MM-DD format
      dueDate = dayjs(renewalDueDate, 'YYYY-MM-DD', true).tz('Asia/Kolkata').startOf('day');
    }
  } catch (error) {
    return { ...agreement, computed_renewal_status: 'N/A', days_until_renewal: null };
  }
  
  if (!dueDate.isValid()) {
    return { ...agreement, computed_renewal_status: 'N/A', days_until_renewal: null };
  }
  
  // Calculate days until renewal (negative for past due)
  const daysUntilRenewal = dueDate.diff(today, 'day');
  const ninetyDaysFromNow = today.add(90, 'day');
  
  // Determine renewal status
  let computedStatus = 'Safe';
  if (dueDate.isBefore(today, 'day')) {
    computedStatus = 'Past Due';
  } else if (dueDate.isSame(today, 'day') || 
             (dueDate.isAfter(today, 'day') && dueDate.isBefore(ninetyDaysFromNow.add(1, 'day'), 'day'))) {
    computedStatus = 'Due Soon';
  }
  
  return {
    ...agreement,
    computed_renewal_status: computedStatus,
    days_until_renewal: daysUntilRenewal,
    formatted_renewal_date: dueDate.format('YYYY-MM-DD')
  };
}

// GET all agreements with Server-Side Filtering override
router.get('/', (req, res) => {
  try {
    // 1. ALWAYS fetch ALL data to bypass Excel Reader bugs
    let agreements = excelReader.getAgreements('all');
    
    // 2. Enrich & Normalize FIRST
    agreements = agreements.map(enrichAgreement);

    // 3. Manual Status Filter (Robust Case-Insensitive)
    if (req.query.status && req.query.status.toLowerCase() !== 'all') {
      const targetStatus = req.query.status.trim().toLowerCase(); // e.g. 'active'
      agreements = agreements.filter(a => {
        // Compare against the normalized status we created in enrichAgreement
        return a.agreement_status.toLowerCase() === targetStatus;
      });
    }
    
    // 4. Filter by residence_id
    if (req.query.residence_id) {
      agreements = agreements.filter(a => 
        a.agreement_residence_id === req.query.residence_id
      );
    }
    
    // 5. Filter by renewal_status
    if (req.query.renewal_status) {
      agreements = agreements.filter(a => 
        a.computed_renewal_status === req.query.renewal_status
      );
    }
    
    res.json(agreements);
  } catch (error) {
    console.error('Error fetching agreements:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET active agreements only (Legacy support)
router.get('/active', (req, res) => {
  try {
    const agreements = excelReader.getAgreements('all');
    const enriched = agreements.map(enrichAgreement);
    // Filter using our robust normalized status
    const activeOnly = enriched.filter(a => a.agreement_status === 'Active');
    res.json(activeOnly);
  } catch (error) {
    console.error('Error fetching active agreements:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET agreement by ID
router.get('/:id', (req, res) => {
  try {
    const agreements = excelReader.getAgreements('all');
    const agreement = agreements.find(a => a.agreement_id === req.params.id);
    
    if (!agreement) {
      return res.status(404).json({ error: 'Agreement not found' });
    }
    
    res.json(enrichAgreement(agreement));
  } catch (error) {
    console.error('Error fetching agreement:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET agreements by residence_id
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

// POST create new agreement
router.post('/', (req, res) => {
  try {
    const data = req.body;
    
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
    
    if (!data.agreement_status) {
      data.agreement_status = 'Active';
    }
    
    const newAgreement = excelReader.addAgreement(data);
    res.status(201).json(newAgreement);
  } catch (error) {
    console.error('Error creating agreement:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT update agreement
router.put('/:id', (req, res) => {
  try {
    const agreementId = req.params.id;
    const updates = req.body;
    delete updates.agreement_id;
    
    const updatedAgreement = excelReader.updateAgreement(agreementId, updates);
    
    if (!updatedAgreement) {
      return res.status(404).json({ error: 'Agreement not found' });
    }
    
    res.json(updatedAgreement);
  } catch (error) {
    console.error('Error updating agreement:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH deactivate agreement
router.patch('/:id/deactivate', (req, res) => {
  try {
    const agreementId = req.params.id;
    const reason = req.body.reason || 'Marked inactive by user';
    
    const deactivatedAgreement = excelReader.deactivateAgreement(agreementId, reason);
    
    if (!deactivatedAgreement) {
      return res.status(404).json({ error: 'Agreement not found' });
    }
    
    res.json(deactivatedAgreement);
  } catch (error) {
    console.error('Error deactivating agreement:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;