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

/** Bulk enrichment for list: single DB round-trip. */
async function enrichResidenceList(residences) {
  if (!residences.length) return residences;
  const { rows } = await pool.query(
    `SELECT entity_id FROM file_uploads WHERE entity_type='residence' AND doc_type='owner_photo'`
  );
  const withPhoto = new Set(rows.map(r => r.entity_id));
  return residences.map(r => ({ ...r, has_owner_photo: withPhoto.has(r.residence_id) }));
}

/** Single-record enrichment. */
async function enrichResidence(r) {
  const { rows } = await pool.query(
    `SELECT 1 FROM file_uploads WHERE entity_type='residence' AND entity_id=$1 AND doc_type='owner_photo' LIMIT 1`,
    [r.residence_id]
  );
  return { ...r, has_owner_photo: rows.length > 0 };
}

// ─── Owner photo uploader factory ────────────────────────────────────────────

function ownerPhotoUploader(residenceId) {
  const docType      = DOC_TYPES.OWNER_PHOTO;
  const allowedMimes = getAllowedMimes(docType);
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        try   { cb(null, ensureEntityDir('residence', residenceId)); }
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

// ─── Owner photo routes ────────────────────────────────────────────────────────

router.get('/:id/owner-photo', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM file_uploads WHERE entity_type='residence' AND entity_id=$1
         AND doc_type='owner_photo' ORDER BY uploaded_at DESC LIMIT 1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No owner photo on file' });
    const record   = rows[0];
    const filePath = resolveFilePath('residence', req.params.id, record.stored_filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Photo file not found on disk' });
    res.setHeader('Content-Type', contentTypeForExt(record.file_ext));
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(record.stored_filename)}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/owner-photo', async (req, res) => {
  const residenceId = req.params.id;
  ownerPhotoUploader(residenceId).single('file')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File size exceeds 5MB limit' });
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    try {
      const residences = await excelReader.getResidences('all');
      const residence  = residences.find(r => r.residence_id === residenceId);
      if (!residence) {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: 'Residence not found' });
      }
      // Replace any existing owner photo
      const { rows: old } = await pool.query(
        `SELECT * FROM file_uploads WHERE entity_type='residence' AND entity_id=$1 AND doc_type='owner_photo'`,
        [residenceId]
      );
      for (const o of old) {
        const fp = resolveFilePath('residence', residenceId, o.stored_filename);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
        await pool.query('DELETE FROM file_uploads WHERE file_id=$1', [o.file_id]);
      }
      // Insert new DB record
      const allowedMimes = getAllowedMimes(DOC_TYPES.OWNER_PHOTO);
      const ext    = allowedMimes[req.file.mimetype];
      const fileId = crypto.randomBytes(16).toString('hex');
      await pool.query(
        `INSERT INTO file_uploads
           (file_id, entity_type, entity_id, doc_type, original_name, stored_filename, file_ext, file_size_bytes, mime_type)
         VALUES ($1,'residence',$2,'owner_photo',$3,$4,$5,$6,$7)`,
        [fileId, residenceId, req.file.originalname, req.file.filename, ext, req.file.size, req.file.mimetype]
      );
      const updated = await excelReader.updateResidence(residenceId, { residence_owner_photo_ext: ext });
      res.json({ ...updated, has_owner_photo: true });
    } catch (dbErr) {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(500).json({ error: 'Failed to save file record' });
    }
  });
});

router.delete('/:id/owner-photo', async (req, res) => {
  try {
    const residenceId = req.params.id;
    const { rows } = await pool.query(
      `SELECT * FROM file_uploads WHERE entity_type='residence' AND entity_id=$1 AND doc_type='owner_photo'`,
      [residenceId]
    );
    for (const rec of rows) {
      const fp = resolveFilePath('residence', residenceId, rec.stored_filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
      await pool.query('DELETE FROM file_uploads WHERE file_id=$1', [rec.file_id]);
    }
    const updated = await excelReader.updateResidence(residenceId, { residence_owner_photo_ext: '' });
    res.json({ ...updated, has_owner_photo: false });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── CRUD routes ───────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const statusFilter = req.query.status || 'active';
    const residences   = await excelReader.getResidences(statusFilter);
    res.json(await enrichResidenceList(residences));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const residences = await excelReader.getResidences('all');
    const residence  = residences.find(r => r.residence_id === req.params.id);
    if (!residence) return res.status(404).json({ error: 'Residence not found' });
    res.json(await enrichResidence(residence));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const data = { ...req.body };
    if (!data.residence_id) {
      const residences = await excelReader.getResidences('all');
      const maxId = residences.length > 0
        ? Math.max(...residences.map(r => { const m = r.residence_id?.match(/\d+$/); return m ? parseInt(m[0]) : 0; }))
        : 0;
      data.residence_id = `residence_id_${String(maxId + 1).padStart(3, '0')}`;
    }
    if (!data.residence_status) data.residence_status = 'active';
    const newResidence = await excelReader.addResidence(data);
    res.status(201).json(await enrichResidence(newResidence));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updates = { ...req.body };
    delete updates.residence_id;
    delete updates.residence_owner_photo_ext;
    delete updates.has_owner_photo;
    const updated = await excelReader.updateResidence(req.params.id, updates);
    if (!updated) return res.status(404).json({ error: 'Residence not found' });
    res.json(await enrichResidence(updated));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id/deactivate', async (req, res) => {
  try {
    const reason      = req.body.reason || 'Marked inactive by user';
    const deactivated = await excelReader.deactivateResidence(req.params.id, reason);
    if (!deactivated) return res.status(404).json({ error: 'Residence not found' });
    res.json(await enrichResidence(deactivated));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
