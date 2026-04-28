const path = require('path');
const fs = require('fs');

const OWNER_PHOTOS_DIR = path.join(__dirname, '../../owner_photos');
const EMPLOYEE_PHOTOS_DIR = path.join(__dirname, '../../employee_photos');

/** Maps upload mimetype → file extension (single canonical ext on disk) */
const ALLOWED_MIMES = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/pjpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const CONTENT_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function ensureDirs() {
  [OWNER_PHOTOS_DIR, EMPLOYEE_PHOTOS_DIR].forEach((d) => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}

function normalizeStoredExt(ext) {
  if (ext === undefined || ext === null || ext === '') return '';
  const e = String(ext).toLowerCase().replace(/^\./, '');
  if (e === 'jpeg') return 'jpg';
  return e;
}

/** Remove any other image file for this id (different extension). */
function removeOtherExtensions(dir, id, keepExt) {
  const keep = normalizeStoredExt(keepExt);
  ['jpg', 'jpeg', 'png', 'webp'].forEach((e) => {
    if (e === keep || (keep === 'jpg' && e === 'jpeg')) return;
    const p = path.join(dir, `${id}.${e}`);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });
}

/**
 * Resolve path for stored ext; if missing, try common alternates (legacy).
 * Returns { filePath, contentType } or null.
 */
function resolveExistingPhoto(dir, id, storedExt) {
  const e = normalizeStoredExt(storedExt);
  if (!e) return null;
  const candidates = e === 'jpg' ? [`${id}.jpg`, `${id}.jpeg`] : [`${id}.${e}`];
  for (const name of candidates) {
    const filePath = path.join(dir, name);
    if (fs.existsSync(filePath)) {
      const extFromFile = name.endsWith('.jpeg') ? 'jpeg' : name.split('.').pop();
      const contentType = CONTENT_TYPES[extFromFile] || 'application/octet-stream';
      return { filePath, contentType };
    }
  }
  return null;
}

function hasPhotoOnDisk(dir, id, storedExt) {
  return !!resolveExistingPhoto(dir, id, storedExt);
}

module.exports = {
  OWNER_PHOTOS_DIR,
  EMPLOYEE_PHOTOS_DIR,
  ALLOWED_MIMES,
  CONTENT_TYPES,
  ensureDirs,
  normalizeStoredExt,
  removeOtherExtensions,
  resolveExistingPhoto,
  hasPhotoOnDisk,
};
