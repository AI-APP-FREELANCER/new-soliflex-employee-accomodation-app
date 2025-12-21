const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const excelReader = require('../data/excelReader');

// All routes require authentication
router.use(authenticateToken);

// GET all agreements with optional status filter
router.get('/', (req, res) => {
  try {
    const statusFilter = req.query.status || 'active'; // Default to 'active'
    const agreements = excelReader.getAgreements(statusFilter);
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
    res.json(agreements);
  } catch (error) {
    console.error('Error fetching active agreements:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET agreement by ID
router.get('/:id', (req, res) => {
  try {
    const agreements = excelReader.getAgreements();
    const agreement = agreements.find(a => a.agreement_id === req.params.id);
    
    if (!agreement) {
      return res.status(404).json({ error: 'Agreement not found' });
    }
    
    res.json(agreement);
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
    res.json(residenceAgreements);
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

