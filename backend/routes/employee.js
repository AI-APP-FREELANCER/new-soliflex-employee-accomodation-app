const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const excelReader = require('../data/excelReader');

router.use(authenticateToken);

// --- HELPER: Normalize Status ---
const normalizeEmployee = (emp) => {
  // Check all possible status keys
  let rawStatus = emp.status || emp.employee_status || '';
  rawStatus = String(rawStatus).trim();

  // If "Inactive" (case insensitive) -> Inactive
  // If Empty, Null, or anything else -> Active (Default)
  const status = rawStatus.toLowerCase() === 'inactive' ? 'Inactive' : 'Active';

  return {
    ...emp,
    status: status, // Standardize key to 'status'
    employee_status: status // Keep legacy key sync
  };
};

// GET / - Fetch All Employees with Filters
router.get('/', (req, res) => {
  try {
    // 1. Fetch ALL employees (Bypass reader filtering)
    let employees = excelReader.getEmployees('all');

    // 2. Normalize Status
    employees = employees.map(normalizeEmployee);

    // 3. Apply Filter
    if (req.query.status && req.query.status.toLowerCase() !== 'all') {
      const target = req.query.status.trim().toLowerCase();
      employees = employees.filter(e => e.status.toLowerCase() === target);
    }

    res.json(employees);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:id - Single Employee
router.get('/:id', (req, res) => {
  try {
    const employees = excelReader.getEmployees('all');
    const employee = employees.find(e => e.employee_id === req.params.id);
    
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    
    res.json(normalizeEmployee(employee));
  } catch (error) {
    console.error('Error fetching employee:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /residence/:residenceId - Employees by Residence
router.get('/residence/:residenceId', (req, res) => {
  try {
    const employees = excelReader.getEmployees('all');
    const residents = employees.filter(e => e.residence_id === req.params.residenceId);
    res.json(residents.map(normalizeEmployee));
  } catch (error) {
    console.error('Error fetching employees by residence:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST / - Create Employee
router.post('/', (req, res) => {
  try {
    const newEmployee = excelReader.addEmployee(req.body);
    res.status(201).json(normalizeEmployee(newEmployee));
  } catch (error) {
    console.error('Error creating employee:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /:id - Update Employee
router.put('/:id', (req, res) => {
  try {
    const updated = excelReader.updateEmployee(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Employee not found' });
    res.json(normalizeEmployee(updated));
  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /:id - Delete Employee
router.delete('/:id', (req, res) => {
  try {
    const deleted = excelReader.deleteEmployee(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Employee not found' });
    res.json({ message: 'Employee deleted successfully' });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;