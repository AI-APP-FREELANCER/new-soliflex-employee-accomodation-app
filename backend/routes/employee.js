const express = require('express');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const crypto  = require('crypto');
const router  = express.Router();

const { authenticateToken } = require('../middleware/auth');
const excelReader = require('../data/excelReader');
const pool = require('../data/db');
const {
  DOC_TYPES,
  getAllowedMimes,
  getMaxFileSizeBytes,
  ensureEntityDir,
  generateStoredFilename,
  resolveFilePath,
  contentTypeForExt,
} = require('../utils/fileStorage');

router.use(authenticateToken);

// ─── Enrichment helpers ────────────────────────────────────────────────────────

async function employeePhotoCount(employeeId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM file_uploads WHERE entity_type='employee' AND entity_id=$1 AND doc_type='employee_photo' LIMIT 1`,
    [employeeId]
  );
  return rows.length > 0;
}

async function enrichEmployeeList(employees) {
  if (!employees.length) return employees;
  const { rows } = await pool.query(
    `SELECT entity_id FROM file_uploads WHERE entity_type='employee' AND doc_type='employee_photo'`
  );
  const withPhoto = new Set(rows.map(r => r.entity_id));
  return employees.map(emp => toFrontend({ ...emp, has_employee_photo: withPhoto.has(emp.employee_id) }));
}

async function enrichEmployee(emp) {
  const has = await employeePhotoCount(emp.employee_id);
  return toFrontend({ ...emp, has_employee_photo: has });
}

// ─── Status normalizers ───────────────────────────────────────────────────────

const toFrontend = (emp) => {
  const isInactive    = String(emp.employee_status || '').trim().toUpperCase() === 'INACTIVE';
  const displayStatus = isInactive ? 'Inactive' : 'Active';
  return { ...emp, status: displayStatus, employee_status: displayStatus };
};

const toBackend = (data) => {
  const inputStatus   = data.status || data.employee_status || 'Active';
  const storageStatus = String(inputStatus).trim().toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
  const rest = { ...data };
  delete rest.employee_photo_ext;
  delete rest.has_employee_photo;
  return { ...rest, employee_status: storageStatus, status: storageStatus };
};

// ─── Employee photo uploader factory ─────────────────────────────────────────

function employeePhotoUploader(employeeId) {
  const docType      = DOC_TYPES.EMPLOYEE_PHOTO;
  const allowedMimes = getAllowedMimes(docType);
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        try   { cb(null, ensureEntityDir('employee', employeeId)); }
        catch (e) { cb(e); }
      },
      filename: (req, file, cb) => {
        const ext = allowedMimes[file.mimetype];
        if (!ext) return cb(new Error('Only JPG, PNG, WebP images are allowed'));
        cb(null, generateStoredFilename(docType, ext));
      },
    }),
    limits:     { fileSize: getMaxFileSizeBytes(docType) },
    fileFilter: (req, file, cb) => {
      if (allowedMimes[file.mimetype]) cb(null, true);
      else cb(new Error('Only JPG, JPEG, PNG and WebP images are allowed'));
    },
  });
}

// ─── Employee photo routes ────────────────────────────────────────────────────

router.get('/:id/photo', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM file_uploads WHERE entity_type='employee' AND entity_id=$1
         AND doc_type='employee_photo' ORDER BY uploaded_at DESC LIMIT 1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No employee photo on file' });
    const record   = rows[0];
    const filePath = resolveFilePath('employee', req.params.id, record.stored_filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Photo file not found on disk' });
    res.setHeader('Content-Type', contentTypeForExt(record.file_ext));
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(record.stored_filename)}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/photo', async (req, res) => {
  const employeeId = req.params.id;
  employeePhotoUploader(employeeId).single('file')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File size exceeds 5MB limit' });
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    try {
      const employees = await excelReader.getEmployees('all');
      const employee  = employees.find(e => e.employee_id === employeeId);
      if (!employee) {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: 'Employee not found' });
      }
      // Replace existing photo
      const { rows: old } = await pool.query(
        `SELECT * FROM file_uploads WHERE entity_type='employee' AND entity_id=$1 AND doc_type='employee_photo'`,
        [employeeId]
      );
      for (const o of old) {
        const fp = resolveFilePath('employee', employeeId, o.stored_filename);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
        await pool.query('DELETE FROM file_uploads WHERE file_id=$1', [o.file_id]);
      }
      const allowedMimes = getAllowedMimes(DOC_TYPES.EMPLOYEE_PHOTO);
      const ext    = allowedMimes[req.file.mimetype];
      const fileId = crypto.randomBytes(16).toString('hex');
      await pool.query(
        `INSERT INTO file_uploads
           (file_id, entity_type, entity_id, doc_type, original_name, stored_filename, file_ext, file_size_bytes, mime_type)
         VALUES ($1,'employee',$2,'employee_photo',$3,$4,$5,$6,$7)`,
        [fileId, employeeId, req.file.originalname, req.file.filename, ext, req.file.size, req.file.mimetype]
      );
      const updated = await excelReader.updateEmployee(employeeId, { employee_photo_ext: ext });
      res.json(toFrontend({ ...updated, has_employee_photo: true }));
    } catch (dbErr) {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(500).json({ error: 'Failed to save file record' });
    }
  });
});

router.delete('/:id/photo', async (req, res) => {
  try {
    const employeeId = req.params.id;
    const { rows } = await pool.query(
      `SELECT * FROM file_uploads WHERE entity_type='employee' AND entity_id=$1 AND doc_type='employee_photo'`,
      [employeeId]
    );
    for (const rec of rows) {
      const fp = resolveFilePath('employee', employeeId, rec.stored_filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
      await pool.query('DELETE FROM file_uploads WHERE file_id=$1', [rec.file_id]);
    }
    const updated = await excelReader.updateEmployee(employeeId, { employee_photo_ext: '' });
    res.json(toFrontend({ ...updated, has_employee_photo: false }));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── CRUD routes ───────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    let employees = await excelReader.getEmployees('all');
    const enriched = await enrichEmployeeList(employees);
    if (req.query.status && req.query.status.toLowerCase() !== 'all') {
      const target = req.query.status.trim().toLowerCase();
      return res.json(enriched.filter(e => e.status.toLowerCase() === target));
    }
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/residence/:residenceId', async (req, res) => {
  try {
    const employees = await excelReader.getEmployees('all');
    const filtered  = employees.filter(e => e.residence_id === req.params.residenceId);
    res.json(await enrichEmployeeList(filtered));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const employees = await excelReader.getEmployees('all');
    const employee  = employees.find(e => e.employee_id === req.params.id);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    res.json(await enrichEmployee(employee));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const payload     = toBackend(req.body);
    const newEmployee = await excelReader.addEmployee(payload);
    res.status(201).json(toFrontend({ ...newEmployee, has_employee_photo: false }));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const payload = toBackend(req.body);
    const updated = await excelReader.updateEmployee(req.params.id, payload);
    if (!updated) return res.status(404).json({ error: 'Employee not found' });

    // ── Auto-release bed when employee is set INACTIVE ────────────────────
    const newStatus = String(updated.employee_status || '').toUpperCase();
    if (newStatus === 'INACTIVE') {
      try {
        const releaseDate = updated.employee_last_working_date || new Date().toISOString().split('T')[0];
        await pool.query(`
          UPDATE bed_allocations
          SET is_active = false, release_date = $2, release_reason = 'Employee Inactive / Left Organisation', updated_at = NOW()
          WHERE employee_id = $1 AND is_active = true
        `, [req.params.id, releaseDate]);
      } catch (bedErr) {
        // Non-fatal: log but don't fail the employee update
        if (process.env.NODE_ENV === 'development') console.error('Bed auto-release error:', bedErr.message);
      }
    }

    res.json(await enrichEmployee(updated));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await excelReader.deleteEmployee(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Employee not found' });
    res.json({ message: 'Employee deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
