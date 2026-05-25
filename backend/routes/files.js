/**
 * /api/files — Generic file management for all entity types.
 *
 * Routes:
 *   GET    /api/files/:entityType/:entityId              list files (optional ?doc_type=)
 *   GET    /api/files/:entityType/:entityId/:fileId/stream  stream file
 *   POST   /api/files/:entityType/:entityId/upload?doc_type=  upload file
 *   DELETE /api/files/:entityType/:entityId/:fileId      delete file
 */
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const crypto  = require('crypto');
const router  = express.Router();

const { authenticateToken } = require('../middleware/auth');
const pool = require('../data/db');
const {
  DOC_TYPES,
  DOC_TYPE_LABELS,
  ENTITY_DOC_TYPES,
  getAllowedMimes,
  getMaxFileSizeBytes,
  ensureEntityDir,
  generateStoredFilename,
  resolveFilePath,
  contentTypeForExt,
} = require('../utils/fileStorage');

router.use(authenticateToken);

const VALID_ENTITY_TYPES = ['residence', 'agreement', 'employee'];

// ─── helpers ──────────────────────────────────────────────────────────────────

function validateEntityType(res, entityType) {
  if (!VALID_ENTITY_TYPES.includes(entityType)) {
    res.status(400).json({ error: `Invalid entity type. Must be one of: ${VALID_ENTITY_TYPES.join(', ')}` });
    return false;
  }
  return true;
}

function validateDocType(res, entityType, docType) {
  const valid = Object.values(DOC_TYPES);
  if (!valid.includes(docType)) {
    res.status(400).json({ error: `Invalid doc_type. Valid values: ${valid.join(', ')}` });
    return false;
  }
  const allowed = ENTITY_DOC_TYPES[entityType] || [];
  if (!allowed.includes(docType)) {
    res.status(400).json({
      error: `doc_type "${docType}" is not allowed for entity type "${entityType}". Allowed: ${allowed.join(', ')}`,
    });
    return false;
  }
  return true;
}

// ─── GET /api/files/:entityType/:entityId ─────────────────────────────────────
// Optional query: ?doc_type=employee_photo

router.get('/:entityType/:entityId', async (req, res) => {
  const { entityType, entityId } = req.params;
  if (!validateEntityType(res, entityType)) return;
  try {
    let q      = 'SELECT * FROM file_uploads WHERE entity_type=$1 AND entity_id=$2';
    const params = [entityType, entityId];
    if (req.query.doc_type) {
      q += ' AND doc_type=$3';
      params.push(req.query.doc_type);
    }
    q += ' ORDER BY sort_order ASC, uploaded_at ASC';
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// ─── GET /api/files/:entityType/:entityId/:fileId/stream ──────────────────────

router.get('/:entityType/:entityId/:fileId/stream', async (req, res) => {
  const { entityType, entityId, fileId } = req.params;
  if (!validateEntityType(res, entityType)) return;
  try {
    const { rows } = await pool.query(
      'SELECT * FROM file_uploads WHERE file_id=$1 AND entity_type=$2 AND entity_id=$3',
      [fileId, entityType, entityId],
    );
    if (!rows.length) return res.status(404).json({ error: 'File not found' });

    const record   = rows[0];
    const filePath = resolveFilePath(entityType, entityId, record.stored_filename);
    if (!fs.existsSync(filePath))
      return res.status(404).json({ error: 'File not found on disk. It may have been moved or deleted.' });

    const ct = contentTypeForExt(record.file_ext);
    res.setHeader('Content-Type', ct);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(record.original_name || record.stored_filename)}"`,
    );
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ error: 'Failed to stream file' });
  }
});

// ─── POST /api/files/:entityType/:entityId/upload?doc_type= ──────────────────

router.post('/:entityType/:entityId/upload', (req, res) => {
  const { entityType, entityId } = req.params;
  if (!validateEntityType(res, entityType)) return;

  const docType = req.query.doc_type || req.body?.doc_type;
  if (!docType) return res.status(400).json({ error: 'doc_type query parameter is required' });
  if (!validateDocType(res, entityType, docType)) return;

  const allowedMimes = getAllowedMimes(docType);
  const maxSize      = getMaxFileSizeBytes(docType);

  const uploader = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        try   { cb(null, ensureEntityDir(entityType, entityId)); }
        catch (e) { cb(e); }
      },
      filename: (req, file, cb) => {
        const ext = allowedMimes[file.mimetype];
        if (!ext) return cb(new Error('File type not allowed for this document type'));
        cb(null, generateStoredFilename(docType, ext));
      },
    }),
    limits:     { fileSize: maxSize },
    fileFilter: (req, file, cb) => {
      if (allowedMimes[file.mimetype]) cb(null, true);
      else cb(new Error(
        `Invalid file type for "${DOC_TYPE_LABELS[docType] || docType}". ` +
        (allowedMimes === getAllowedMimes('agreement_pdf')
          ? 'Only PDF files are allowed.'
          : 'Only JPG, PNG, WebP images are allowed.')
      ));
    },
  });

  uploader.single('file')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE')
        return res.status(400).json({ error: `File too large. Maximum ${maxSize / 1024 / 1024}MB allowed.` });
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    try {
      const ext    = allowedMimes[req.file.mimetype];
      const fileId = crypto.randomBytes(16).toString('hex');
      const sortOrder = parseInt(req.query.sort_order) || 0;

      const { rows } = await pool.query(
        `INSERT INTO file_uploads
           (file_id, entity_type, entity_id, doc_type, original_name,
            stored_filename, file_ext, file_size_bytes, mime_type, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [
          fileId, entityType, entityId, docType,
          req.file.originalname, req.file.filename,
          ext, req.file.size, req.file.mimetype, sortOrder,
        ],
      );
      res.status(201).json(rows[0]);
    } catch (dbErr) {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(500).json({ error: 'Failed to save file record to database' });
    }
  });
});

// ─── DELETE /api/files/:entityType/:entityId/:fileId ─────────────────────────

router.delete('/:entityType/:entityId/:fileId', async (req, res) => {
  const { entityType, entityId, fileId } = req.params;
  if (!validateEntityType(res, entityType)) return;
  try {
    const { rows } = await pool.query(
      'SELECT * FROM file_uploads WHERE file_id=$1 AND entity_type=$2 AND entity_id=$3',
      [fileId, entityType, entityId],
    );
    if (!rows.length) return res.status(404).json({ error: 'File not found' });

    const record   = rows[0];
    const filePath = resolveFilePath(entityType, entityId, record.stored_filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await pool.query('DELETE FROM file_uploads WHERE file_id=$1', [fileId]);
    res.json({ message: 'File deleted successfully', file_id: fileId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

module.exports = router;
