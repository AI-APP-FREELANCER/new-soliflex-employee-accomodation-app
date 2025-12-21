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
 * Enrich agreement with virtual fields:
 * - computed_renewal_status: 'Past Due' | 'Due Soon' | 'Safe' | 'N/A'
 * - days_until_renewal: integer (negative for past due, positive for future)
 * - formatted_renewal_date: 'YYYY-MM-DD' format or null
 */
function enrichAgreement(agreement) {
  const today = dayjs.tz(dayjs(), 'Asia/Kolkata').startOf('day');
  const renewalDueDate = agreement.agreement_renewal_due_date;
  const isInactive = agreement.status === 'inactive' || 
                     agreement.agreement_status === 'Inactive';
  
  // If renewal date is missing or agreement is inactive, return N/A
  if (!renewalDueDate || isInactive) {
    return {
      ...agreement,
      computed_renewal_status: 'N/A',
      days_until_renewal: null,
      formatted_renewal_date: null
    };
  }
  
  // Parse renewal date
  let dueDate;
  try {
    // Try parsing as ISO string first
    dueDate = dayjs.tz(renewalDueDate, 'Asia/Kolkata').startOf('day');
    if (!dueDate.isValid()) {
      // Try parsing as YYYY-MM-DD format
      dueDate = dayjs(renewalDueDate, 'YYYY-MM-DD', true).tz('Asia/Kolkata').startOf('day');
    }
  } catch (error) {
    // If parsing fails, return N/A
    return {
      ...agreement,
      computed_renewal_status: 'N/A',
      days_until_renewal: null,
      formatted_renewal_date: null
    };
  }
  
  if (!dueDate.isValid()) {
    return {
      ...agreement,
      computed_renewal_status: 'N/A',
      days_until_renewal: null,
      formatted_renewal_date: null
    };
  }
  
  // Calculate days until renewal (negative for past due)
  const daysUntilRenewal = dueDate.diff(today, 'day');
  const ninetyDaysFromNow = today.add(90, 'day');
  
  // Determine renewal status
  let computedStatus;
  if (dueDate.isBefore(today, 'day')) {
    computedStatus = 'Past Due';
  } else if (dueDate.isSame(today, 'day') || 
             (dueDate.isAfter(today, 'day') && dueDate.isBefore(ninetyDaysFromNow.add(1, 'day'), 'day'))) {
    computedStatus = 'Due Soon';
  } else {
    computedStatus = 'Safe';
  }
  
  return {
    ...agreement,
    computed_renewal_status: computedStatus,
    days_until_renewal: daysUntilRenewal,
    formatted_renewal_date: dueDate.format('YYYY-MM-DD')
  };
}

// GET all agreements with robust server-side filtering
router.get('/', (req, res) => {
  try {
    // 1. ALWAYS fetch ALL data. Do not trust the reader to filter.
    let agreements = excelReader.getAgreements('all');
    
    // 2. Enrich with virtual fields (Dates & Status) BEFORE filtering
    agreements = agreements.map(enrichAgreement);
    
    // 3. Apply Status Filter (Case-Insensitive)
    if (req.query.status && req.query.status.toLowerCase() !== 'all') {
      const targetStatus = req.query.status.trim().toLowerCase();
      agreements = agreements.filter(a => {
        const s = String(a.agreement_status || a.status || '').trim().toLowerCase();
        return s === targetStatus;
      });
    }
    
    // 4. Apply Renewal Status Filter (Past Due / Due Soon)
    if (req.query.renewal_status) {
      const targetRenewal = req.query.renewal_status;
      agreements = agreements.filter(a => a.computed_renewal_status === targetRenewal);
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

// GET active agreements only (legacy endpoint for backward compatibility)
router.get('/active', (req, res) => {
  try {
    const agreements = excelReader.getAgreements('active');
    // Enrich agreements with virtual fields
    const enrichedAgreements = agreements.map(enrichAgreement);
    res.json(enrichedAgreements);
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
    
    // Enrich agreement with virtual fields
    const enrichedAgreement = enrichAgreement(agreement);
    res.json(enrichedAgreement);
  } catch (error) {
    console.error('Error fetching agreement:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET agreements by residence_id (includes all statuses for historical reference)
router.get('/residence/:residenceId', (req, res) => {
  try {
    const agreements = excelReader.getAgreements('all'); // Get all for historical reference
    const residenceAgreements = agreements.filter(a => 
      a.agreement_residence_id === req.params.residenceId
    );
    // Enrich agreements with virtual fields
    const enrichedAgreements = residenceAgreements.map(enrichAgreement);
    res.json(enrichedAgreements);
  } catch (error) {
    console.error('Error fetching agreements by residence:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST create new agreement
router.post('/', (req, res) => {
  try {
    const data = req.body;
    
    // Generate agreement_id if not provided
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
    
    // Set default status if not provided
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

// PUT update agreement (no deletion, only status updates and field edits)
router.put('/:id', (req, res) => {
  try {
    const agreementId = req.params.id;
    const updates = req.body;
    
    // Prevent deletion of agreement_id
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

// PATCH deactivate agreement (soft delete)
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

