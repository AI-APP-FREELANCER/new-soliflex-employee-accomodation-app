const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const excelReader = require('../data/excelReader');
const {
  OWNER_PHOTOS_DIR,
  ALLOWED_MIMES,
  ensureDirs,
  normalizeStoredExt,
  removeOtherExtensions,
  resolveExistingPhoto,
  hasPhotoOnDisk,
} = require('../utils/photoStorage');

router.use(authenticateToken);
ensureDirs();

function enrichResidence(r) {
  const ext = normalizeStoredExt(r.residence_owner_photo_ext);
  const has_owner_photo = hasPhotoOnDisk(OWNER_PHOTOS_DIR, r.residence_id, ext);
  return { ...r, residence_owner_photo_ext: ext, has_owner_photo };
}

const uploadOwnerPhoto = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => { ensureDirs(); cb(null, OWNER_PHOTOS_DIR); },
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

// --- Owner photo ---
router.get('/:id/owner-photo', async (req, res) => {
  try {
    const residences = await excelReader.getResidences('all');
    const residence  = residences.find(r => r.residence_id === req.params.id);
    if (!residence) return res.status(404).json({ error: 'Residence not found' });
    const ext      = normalizeStoredExt(residence.residence_owner_photo_ext);
    const resolved = resolveExistingPhoto(OWNER_PHOTOS_DIR, req.params.id, ext);
    if (!resolved) return res.status(404).json({ error: 'Photo not found' });
    res.setHeader('Content-Type', resolved.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${req.params.id}${path.extname(resolved.filePath)}"`);
    fs.createReadStream(resolved.filePath).pipe(res);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error streaming owner photo:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/owner-photo', uploadOwnerPhoto.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const ext = ALLOWED_MIMES[req.file.mimetype];
    if (!ext)  return res.status(400).json({ error: 'Invalid image type' });

    const residences = await excelReader.getResidences('all');
    const residence  = residences.find(r => r.residence_id === req.params.id);
    if (!residence) {
      const orphan = path.join(OWNER_PHOTOS_DIR, req.file.filename);
      if (fs.existsSync(orphan)) fs.unlinkSync(orphan);
      return res.status(404).json({ error: 'Residence not found' });
    }

    removeOtherExtensions(OWNER_PHOTOS_DIR, req.params.id, ext);
    const updated = await excelReader.updateResidence(req.params.id, { residence_owner_photo_ext: ext });
    res.json(enrichResidence(updated));
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error uploading owner photo:', error.message);
    if (error.message && error.message.includes('Only JPG'))
      return res.status(400).json({ error: error.message });
    if (error.code === 'LIMIT_FILE_SIZE')
      return res.status(400).json({ error: 'File size exceeds 5MB limit' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id/owner-photo', async (req, res) => {
  try {
    const residences = await excelReader.getResidences('all');
    const residence  = residences.find(r => r.residence_id === req.params.id);
    if (!residence) return res.status(404).json({ error: 'Residence not found' });
    ['jpg', 'jpeg', 'png', 'webp'].forEach(e => {
      const p = path.join(OWNER_PHOTOS_DIR, `${req.params.id}.${e}`);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    });
    const updated = await excelReader.updateResidence(req.params.id, { residence_owner_photo_ext: '' });
    res.json(enrichResidence(updated));
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error deleting owner photo:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET all
router.get('/', async (req, res) => {
  try {
    const statusFilter = req.query.status || 'active';
    const residences   = await excelReader.getResidences(statusFilter);
    res.json(residences.map(enrichResidence));
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error fetching residences:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET by ID
router.get('/:id', async (req, res) => {
  try {
    const residences = await excelReader.getResidences('all');
    const residence  = residences.find(r => r.residence_id === req.params.id);
    if (!residence) return res.status(404).json({ error: 'Residence not found' });
    res.json(enrichResidence(residence));
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error fetching residence:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST create
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
    res.status(201).json(enrichResidence(newResidence));
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error creating residence:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT update
router.put('/:id', async (req, res) => {
  try {
    const updates = { ...req.body };
    delete updates.residence_id;
    delete updates.residence_owner_photo_ext;
    delete updates.has_owner_photo;
    const updated = await excelReader.updateResidence(req.params.id, updates);
    if (!updated) return res.status(404).json({ error: 'Residence not found' });
    res.json(enrichResidence(updated));
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error updating residence:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH deactivate
router.patch('/:id/deactivate', async (req, res) => {
  try {
    const reason     = req.body.reason || 'Marked inactive by user';
    const deactivated = await excelReader.deactivateResidence(req.params.id, reason);
    if (!deactivated) return res.status(404).json({ error: 'Residence not found' });
    res.json(enrichResidence(deactivated));
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error deactivating residence:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
