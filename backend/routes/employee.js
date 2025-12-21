const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const excelReader = require('../data/excelReader');

// All routes require authentication
router.use(authenticateToken);

// GET all employees with optional status filter
router.get('/', (req, res) => {
  try {
    // CRITICAL FIX: Always fetch 'all' to ensure we have the full dataset
    let employees = excelReader.getEmployees('all');
    
    // Apply Status Filter Manually
    if (req.query.status && req.query.status.toLowerCase() !== 'all') {
      const targetStatus = req.query.status.trim().toLowerCase();
      
      employees = employees.filter(e => {
        const s = String(e.status || e.employee_status || '').trim().toLowerCase();
        
        // Handle "Active" logic: matches 'active', empty string, or null/undefined
        if (targetStatus === 'active') {
          return s === 'active' || s === '' || s === 'null' || s === 'undefined';
        }
        // Handle other statuses (e.g., 'inactive')
        return s === targetStatus;
      });
    }
    
    res.json(employees);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
    

// GET employee by ID
router.get('/:id', (req, res) => {
  try {
    const employees = excelReader.getEmployees();
    const employee = employees.find(e => e.employee_id === req.params.id);
    
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    res.json(employee);
  } catch (error) {
    console.error('Error fetching employee:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST create new employee
router.post('/', (req, res) => {
  try {
    const data = req.body;
    
    // Employee ID should be provided (alphanumeric as per requirements)
    if (!data.employee_id) {
      return res.status(400).json({ error: 'employee_id is required' });
    }
    
    // Check if employee_id already exists
    const employees = excelReader.getEmployees();
    if (employees.find(e => e.employee_id === data.employee_id)) {
      return res.status(400).json({ error: 'Employee ID already exists' });
    }
    
    // Set default status if not provided
    if (!data.employee_status) {
      data.employee_status = 'Active';
    }
    
    const newEmployee = excelReader.addEmployee(data);
    res.status(201).json(newEmployee);
  } catch (error) {
    console.error('Error creating employee:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT update employee (no deletion, only status updates and field edits)
router.put('/:id', (req, res) => {
  try {
    const employeeId = req.params.id;
    const updates = req.body;
    
    // Prevent deletion of employee_id
    delete updates.employee_id;
    
    const updatedEmployee = excelReader.updateEmployee(employeeId, updates);
    
    if (!updatedEmployee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    res.json(updatedEmployee);
  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH deactivate employee (soft delete)
router.patch('/:id/deactivate', (req, res) => {
  try {
    const employeeId = req.params.id;
    const reason = req.body.reason || 'Marked inactive by user';
    
    const deactivatedEmployee = excelReader.deactivateEmployee(employeeId, reason);
    
    if (!deactivatedEmployee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    res.json(deactivatedEmployee);
  } catch (error) {
    console.error('Error deactivating employee:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

