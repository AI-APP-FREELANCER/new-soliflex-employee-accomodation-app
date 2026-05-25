/**
 * fileStorage.js — Central file storage utility for all entity documents.
 *
 * Storage layout on persistent volume:
 *   $STORAGE_BASE/
 *     residences/{residence_id}/{doc_type}_{yyyymmddHHmmss}_{rand6}.{ext}
 *     agreements/{agreement_id}/{doc_type}_{yyyymmddHHmmss}_{rand6}.{ext}
 *     employees/{employee_id}/{doc_type}_{yyyymmddHHmmss}_{rand6}.{ext}
 *
 * Set STORAGE_BASE in .env:
 *   Production : /mnt/volume-1779683367876/soliflex-accommodation
 *   Development: ./uploads  (relative to project root, resolved below)
 */
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');
const dayjs  = require('dayjs');

const STORAGE_BASE = process.env.STORAGE_BASE ||
  path.join(__dirname, '../../uploads');

const ENTITY_DIRS = {
  residence: path.join(STORAGE_BASE, 'residences'),
  agreement: path.join(STORAGE_BASE, 'agreements'),
  employee:  path.join(STORAGE_BASE, 'employees'),
};

// ─── Document type registry ────────────────────────────────────────────────────

const DOC_TYPES = {
  OWNER_PHOTO:       'owner_photo',
  PROPERTY_PHOTO:    'property_photo',
  AGREEMENT_PDF:     'agreement_pdf',
  EMPLOYEE_PHOTO:    'employee_photo',
  AADHAR_FRONT:      'aadhar_front',
  AADHAR_BACK:       'aadhar_back',
  COMPANY_AGREEMENT: 'company_agreement',
  OTHER_DOCUMENT:    'other_document',
};

const DOC_TYPE_LABELS = {
  owner_photo:       'Owner Photo',
  property_photo:    'Property Photo',
  agreement_pdf:     'Agreement Soft Copy',
  employee_photo:    'Employee Photo',
  aadhar_front:      'Aadhar Card (Front)',
  aadhar_back:       'Aadhar Card (Back)',
  company_agreement: 'Company Agreement',
  other_document:    'Other Document',
};

/** Which doc types are valid per entity type */
const ENTITY_DOC_TYPES = {
  residence: ['owner_photo', 'property_photo'],
  agreement: ['agreement_pdf'],
  employee:  ['employee_photo', 'aadhar_front', 'aadhar_back', 'company_agreement', 'other_document'],
};

// ─── MIME / extension maps ─────────────────────────────────────────────────────

const ALLOWED_IMAGE_MIMES = {
  'image/jpeg':  'jpg',
  'image/jpg':   'jpg',
  'image/pjpeg': 'jpg',
  'image/png':   'png',
  'image/webp':  'webp',
};

const ALLOWED_PDF_MIMES = {
  'application/pdf': 'pdf',
};

const ALLOWED_MIXED_MIMES = { ...ALLOWED_IMAGE_MIMES, ...ALLOWED_PDF_MIMES };

const CONTENT_TYPES = {
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  png:  'image/png',
  webp: 'image/webp',
  pdf:  'application/pdf',
};

/** Doc types that only accept images */
const IMAGE_DOC_TYPES = new Set([
  'owner_photo', 'property_photo', 'employee_photo', 'aadhar_front', 'aadhar_back',
]);

/** Doc types that only accept PDFs */
const PDF_DOC_TYPES = new Set(['agreement_pdf']);

/** Doc types that accept both images and PDFs */
const MIXED_DOC_TYPES = new Set(['company_agreement', 'other_document']);

function getAllowedMimes(docType) {
  if (IMAGE_DOC_TYPES.has(docType)) return ALLOWED_IMAGE_MIMES;
  if (PDF_DOC_TYPES.has(docType))   return ALLOWED_PDF_MIMES;
  return ALLOWED_MIXED_MIMES;
}

function getMaxFileSizeBytes(docType) {
  if (PDF_DOC_TYPES.has(docType) || MIXED_DOC_TYPES.has(docType)) return 10 * 1024 * 1024;
  return 5 * 1024 * 1024;
}

// ─── Path helpers ──────────────────────────────────────────────────────────────

function entityDir(entityType, entityId) {
  const base = ENTITY_DIRS[entityType];
  if (!base) throw new Error(`Unknown entity type: ${entityType}`);
  return path.join(base, String(entityId));
}

function ensureEntityDir(entityType, entityId) {
  const dir = entityDir(entityType, entityId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function ensureBaseDirs() {
  Object.values(ENTITY_DIRS).forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}

/**
 * Generates a unique stored filename: {docType}_{YYYYMMDDHHmmss}_{6hex}.{ext}
 * Example: owner_photo_20260525143200_a3f9b2.jpg
 */
function generateStoredFilename(docType, ext) {
  const ts   = dayjs().format('YYYYMMDDHHmmss');
  const rand = crypto.randomBytes(3).toString('hex');
  return `${docType}_${ts}_${rand}.${ext}`;
}

function resolveFilePath(entityType, entityId, storedFilename) {
  return path.join(entityDir(entityType, entityId), storedFilename);
}

function contentTypeForExt(ext) {
  return CONTENT_TYPES[String(ext).toLowerCase()] || 'application/octet-stream';
}

module.exports = {
  STORAGE_BASE,
  ENTITY_DIRS,
  DOC_TYPES,
  DOC_TYPE_LABELS,
  ENTITY_DOC_TYPES,
  ALLOWED_IMAGE_MIMES,
  ALLOWED_PDF_MIMES,
  ALLOWED_MIXED_MIMES,
  CONTENT_TYPES,
  IMAGE_DOC_TYPES,
  PDF_DOC_TYPES,
  MIXED_DOC_TYPES,
  getAllowedMimes,
  getMaxFileSizeBytes,
  entityDir,
  ensureEntityDir,
  ensureBaseDirs,
  generateStoredFilename,
  resolveFilePath,
  contentTypeForExt,
};
