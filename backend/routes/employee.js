const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const excelReader = require('../data/excelReader');

router.use(authenticateToken);

// --- HELPER: Prepare Data for Frontend (Read) ---
// Excel ('ACTIVE'/'INACTIVE') -> Frontend ('Active'/'Inactive')
const toFrontend = (emp) => {
  // Read from the correct backend column 'employee_status'
  // Also check 'status' just in case of mixed data
  const rawVal = emp.employee_status || emp.status || '';
  
  // STRICT CHECK: Only 'INACTIVE' (case-insensitive) means Inactive.
  // Everything else (ACTIVE, Active, blank, null) means Active.
  const isInactive = String(rawVal).trim().toUpperCase() === 'INACTIVE';
  const displayStatus = isInactive ? 'Inactive' : 'Active';

  return {
    ...emp,
    status: displayStatus,       // Standardized key for React
    employee_status: displayStatus // Keep legacy key populated for safety
  };
};

// --- HELPER: Prepare Data for Backend (Write) ---
// Frontend ('Active'/'Inactive') -> Excel ('ACTIVE'/'INACTIVE')
const toBackend = (data) => {
  // Get status from incoming request
  const inputStatus = data.status || data.employee_status || 'Active';
  
  // Convert to UPPERCASE for Excel storage
  const storageStatus = String(inputStatus).trim().toUpperCase() === 'INACTIVE' 
    ? 'INACTIVE' 
    : 'ACTIVE';

  return {
    ...data,
    employee_status: storageStatus, // Ensure correct column name
    status: storageStatus           // Sync 'status' field too
  };
};

// GET / - Fetch All Employees
router.get('/', (req, res) => {
  try {
    // 1. Fetch raw data from Excel
    let employees = excelReader.getEmployees('all');

    // 2. Transform to Frontend format (Active/Inactive)
    employees = employees.map(toFrontend);

    // 3. Apply Filter (Frontend expects 'Active' or 'Inactive')
    if (req.query.status && req.query.status.toLowerCase() !== 'all') {
      const targetStatus = req.query.status.trim().toLowerCase(); // e.g., 'active'
      employees = employees.filter(e => e.status.toLowerCase() === targetStatus);
    }

    res.json(employees);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching employees:', error.message);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:id - Single Employee
router.get('/:id', (req, res) => {
  try {
    const employees = excelReader.getEmployees('all');
    const employee = employees.find(e => e.employee_id === req.params.id);
    
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    
    res.json(toFrontend(employee));
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching employee:', error.message);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /residence/:residenceId
router.get('/residence/:residenceId', (req, res) => {
  try {
    const employees = excelReader.getEmployees('all');
    const residents = employees.filter(e => e.residence_id === req.params.residenceId);
    res.json(residents.map(toFrontend));
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching employees by residence:', error.message);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST / - Create Employee (Saves as UPPERCASE)
router.post('/', (req, res) => {
  try {
    // Convert incoming data to Backend format (ACTIVE/INACTIVE)
    const payload = toBackend(req.body);
    
    const newEmployee = excelReader.addEmployee(payload);
    // Return Frontend format
    res.status(201).json(toFrontend(newEmployee));
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error creating employee:', error.message);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /:id - Update Employee (Saves as UPPERCASE)
router.put('/:id', (req, res) => {
  try {
    // Convert updates to Backend format
    const payload = toBackend(req.body);
    
    const updated = excelReader.updateEmployee(req.params.id, payload);
    if (!updated) return res.status(404).json({ error: 'Employee not found' });
    
    // Return Frontend format
    res.json(toFrontend(updated));
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error updating employee:', error.message);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /:id
router.delete('/:id', (req, res) => {
  try {
    const deleted = excelReader.deleteEmployee(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Employee not found' });
    res.json({ message: 'Employee deleted successfully' });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error deleting employee:', error.message);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;