const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const excelReader = require('../data/excelReader');
const {
  EMPLOYEE_PHOTOS_DIR,
  ALLOWED_MIMES,
  ensureDirs,
  normalizeStoredExt,
  removeOtherExtensions,
  resolveExistingPhoto,
  hasPhotoOnDisk,
} = require('../utils/photoStorage');

router.use(authenticateToken);

ensureDirs();

function enrichEmployeePhoto(emp) {
  const ext = normalizeStoredExt(emp.employee_photo_ext);
  const has_employee_photo = hasPhotoOnDisk(EMPLOYEE_PHOTOS_DIR, emp.employee_id, ext);
  return { ...emp, employee_photo_ext: ext, has_employee_photo };
}

const uploadEmployeePhoto = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      ensureDirs();
      cb(null, EMPLOYEE_PHOTOS_DIR);
    },
    filename: (req, file, cb) => {
      const ext = ALLOWED_MIMES[file.mimetype];
      if (!ext) return cb(new Error('Invalid image type'));
      cb(null, `${req.params.id}.${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMES[file.mimetype]) cb(null, true);
    else cb(new Error('Only JPG, JPEG, PNG and WebP images are allowed'));
  },
});

router.get('/:id/photo', (req, res) => {
  try {
    const employees = excelReader.getEmployees('all');
    const employee = employees.find((e) => e.employee_id === req.params.id);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    const ext = normalizeStoredExt(employee.employee_photo_ext);
    const resolved = resolveExistingPhoto(EMPLOYEE_PHOTOS_DIR, req.params.id, ext);
    if (!resolved) return res.status(404).json({ error: 'Photo not found' });
    res.setHeader('Content-Type', resolved.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${req.params.id}${path.extname(resolved.filePath)}"`);
    fs.createReadStream(resolved.filePath).pipe(res);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error streaming employee photo:', error.message);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/photo', uploadEmployeePhoto.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const ext = ALLOWED_MIMES[req.file.mimetype];
    if (!ext) return res.status(400).json({ error: 'Invalid image type' });

    const employee = excelReader.getEmployees('all').find((e) => e.employee_id === req.params.id);
    if (!employee) {
      const orphan = path.join(EMPLOYEE_PHOTOS_DIR, req.file.filename);
      if (fs.existsSync(orphan)) fs.unlinkSync(orphan);
      return res.status(404).json({ error: 'Employee not found' });
    }

    removeOtherExtensions(EMPLOYEE_PHOTOS_DIR, req.params.id, ext);
    excelReader.updateEmployee(req.params.id, { employee_photo_ext: ext });
    const updated = excelReader.getEmployees('all').find((e) => e.employee_id === req.params.id);
    res.json(toFrontend(updated));
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error uploading employee photo:', error.message);
    }
    if (error.message && error.message.includes('Only JPG')) {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size exceeds 5MB limit' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id/photo', (req, res) => {
  try {
    const employee = excelReader.getEmployees('all').find((e) => e.employee_id === req.params.id);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    ['jpg', 'jpeg', 'png', 'webp'].forEach((e) => {
      const p = path.join(EMPLOYEE_PHOTOS_DIR, `${req.params.id}.${e}`);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    });
    excelReader.updateEmployee(req.params.id, { employee_photo_ext: '' });
    const updated = excelReader.getEmployees('all').find((e) => e.employee_id === req.params.id);
    res.json(toFrontend(updated));
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error deleting employee photo:', error.message);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- HELPER: Prepare Data for Frontend (Read) ---
// Excel ('ACTIVE'/'INACTIVE') -> Frontend ('Active'/'Inactive')
const toFrontend = (emp) => {
  const enriched = enrichEmployeePhoto(emp);
  // Read from the correct backend column 'employee_status'
  // Also check 'status' just in case of mixed data
  const rawVal = enriched.employee_status || enriched.status || '';
  
  // STRICT CHECK: Only 'INACTIVE' (case-insensitive) means Inactive.
  // Everything else (ACTIVE, Active, blank, null) means Active.
  const isInactive = String(rawVal).trim().toUpperCase() === 'INACTIVE';
  const displayStatus = isInactive ? 'Inactive' : 'Active';

  return {
    ...enriched,
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

  const rest = { ...data };
  delete rest.employee_photo_ext;
  delete rest.has_employee_photo;

  return {
    ...rest,
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