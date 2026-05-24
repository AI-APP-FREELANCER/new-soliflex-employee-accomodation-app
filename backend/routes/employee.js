const express = require('express');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const router  = express.Router();
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
    destination: (req, file, cb) => { ensureDirs(); cb(null, EMPLOYEE_PHOTOS_DIR); },
    filename:    (req, file, cb) => {
      const ext = ALLOWED_MIMES[file.mimetype];
      if (!ext) return cb(new Error('Invalid image type'));
      cb(null, `${req.params.id}.${ext}`);
    },
  }),
  limits:     { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMES[file.mimetype]) cb(null, true);
    else cb(new Error('Only JPG, JPEG, PNG and WebP images are allowed'));
  },
});

// Normalize for frontend (Active/Inactive display)
const toFrontend = (emp) => {
  const enriched  = enrichEmployeePhoto(emp);
  const isInactive = String(enriched.employee_status || '').trim().toUpperCase() === 'INACTIVE';
  const displayStatus = isInactive ? 'Inactive' : 'Active';
  return { ...enriched, status: displayStatus, employee_status: displayStatus };
};

// Normalize for DB write (ACTIVE/INACTIVE uppercase)
const toBackend = (data) => {
  const inputStatus   = data.status || data.employee_status || 'Active';
  const storageStatus = String(inputStatus).trim().toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
  const rest = { ...data };
  delete rest.employee_photo_ext;
  delete rest.has_employee_photo;
  return { ...rest, employee_status: storageStatus, status: storageStatus };
};

// Photo routes
router.get('/:id/photo', async (req, res) => {
  try {
    const employees = await excelReader.getEmployees('all');
    const employee  = employees.find(e => e.employee_id === req.params.id);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    const ext      = normalizeStoredExt(employee.employee_photo_ext);
    const resolved = resolveExistingPhoto(EMPLOYEE_PHOTOS_DIR, req.params.id, ext);
    if (!resolved) return res.status(404).json({ error: 'Photo not found' });
    res.setHeader('Content-Type', resolved.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${req.params.id}${path.extname(resolved.filePath)}"`);
    fs.createReadStream(resolved.filePath).pipe(res);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error streaming employee photo:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/photo', uploadEmployeePhoto.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const ext = ALLOWED_MIMES[req.file.mimetype];
    if (!ext)  return res.status(400).json({ error: 'Invalid image type' });

    const employees = await excelReader.getEmployees('all');
    const employee  = employees.find(e => e.employee_id === req.params.id);
    if (!employee) {
      const orphan = path.join(EMPLOYEE_PHOTOS_DIR, req.file.filename);
      if (fs.existsSync(orphan)) fs.unlinkSync(orphan);
      return res.status(404).json({ error: 'Employee not found' });
    }

    removeOtherExtensions(EMPLOYEE_PHOTOS_DIR, req.params.id, ext);
    const updated = await excelReader.updateEmployee(req.params.id, { employee_photo_ext: ext });
    res.json(toFrontend(updated));
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error uploading employee photo:', error.message);
    if (error.message && error.message.includes('Only JPG'))
      return res.status(400).json({ error: error.message });
    if (error.code === 'LIMIT_FILE_SIZE')
      return res.status(400).json({ error: 'File size exceeds 5MB limit' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id/photo', async (req, res) => {
  try {
    const employees = await excelReader.getEmployees('all');
    const employee  = employees.find(e => e.employee_id === req.params.id);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    ['jpg', 'jpeg', 'png', 'webp'].forEach(e => {
      const p = path.join(EMPLOYEE_PHOTOS_DIR, `${req.params.id}.${e}`);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    });
    const updated = await excelReader.updateEmployee(req.params.id, { employee_photo_ext: '' });
    res.json(toFrontend(updated));
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error deleting employee photo:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET all
router.get('/', async (req, res) => {
  try {
    let employees = await excelReader.getEmployees('all');
    employees = employees.map(toFrontend);
    if (req.query.status && req.query.status.toLowerCase() !== 'all') {
      const target = req.query.status.trim().toLowerCase();
      employees = employees.filter(e => e.status.toLowerCase() === target);
    }
    res.json(employees);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error fetching employees:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET by ID
router.get('/:id', async (req, res) => {
  try {
    const employees = await excelReader.getEmployees('all');
    const employee  = employees.find(e => e.employee_id === req.params.id);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    res.json(toFrontend(employee));
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error fetching employee:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET by residence (legacy route)
router.get('/residence/:residenceId', async (req, res) => {
  try {
    const employees = await excelReader.getEmployees('all');
    res.json(employees.filter(e => e.residence_id === req.params.residenceId).map(toFrontend));
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error fetching employees by residence:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST create
router.post('/', async (req, res) => {
  try {
    const payload      = toBackend(req.body);
    const newEmployee  = await excelReader.addEmployee(payload);
    res.status(201).json(toFrontend(newEmployee));
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error creating employee:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT update
router.put('/:id', async (req, res) => {
  try {
    const payload = toBackend(req.body);
    const updated = await excelReader.updateEmployee(req.params.id, payload);
    if (!updated) return res.status(404).json({ error: 'Employee not found' });
    res.json(toFrontend(updated));
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error updating employee:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await excelReader.deleteEmployee(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Employee not found' });
    res.json({ message: 'Employee deleted successfully' });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error deleting employee:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
