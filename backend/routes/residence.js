const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const excelReader = require('../data/excelReader');

// All routes require authentication
router.use(authenticateToken);

// GET all residences
router.get('/', (req, res) => {
  try {
    const residences = excelReader.getResidences();
    res.json(residences);
  } catch (error) {
    console.error('Error fetching residences:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET residence by ID
router.get('/:id', (req, res) => {
  try {
    const residences = excelReader.getResidences();
    const residence = residences.find(r => r.residence_id === req.params.id);
    
    if (!residence) {
      return res.status(404).json({ error: 'Residence not found' });
    }
    
    res.json(residence);
  } catch (error) {
    console.error('Error fetching residence:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST create new residence
router.post('/', (req, res) => {
  try {
    const data = req.body;
    
    // Generate residence_id if not provided
    if (!data.residence_id) {
      const residences = excelReader.getResidences();
      const maxId = residences.length > 0 
        ? Math.max(...residences.map(r => {
            const match = r.residence_id?.match(/\d+$/);
            return match ? parseInt(match[0]) : 0;
          }))
        : 0;
      data.residence_id = `residence_id_${String(maxId + 1).padStart(3, '0')}`;
    }
    
    // Set default status if not provided
    if (!data.residence_status) {
      data.residence_status = 'Active';
    }
    
    const newResidence = excelReader.addResidence(data);
    res.status(201).json(newResidence);
  } catch (error) {
    console.error('Error creating residence:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT update residence (no deletion, only status updates and field edits)
router.put('/:id', (req, res) => {
  try {
    const residenceId = req.params.id;
    const updates = req.body;
    
    // Prevent deletion of residence_id
    delete updates.residence_id;
    
    const updatedResidence = excelReader.updateResidence(residenceId, updates);
    
    if (!updatedResidence) {
      return res.status(404).json({ error: 'Residence not found' });
    }
    
    res.json(updatedResidence);
  } catch (error) {
    console.error('Error updating residence:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

