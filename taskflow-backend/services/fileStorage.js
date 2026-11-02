const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads', 'chat');

// extension -> the type WE trust (never the type the browser claims)
const ALLOWED_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
};

// only images may be displayed inside the page; everything else is a download
const INLINE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

// the first bytes of a real file of each type
const ZIP = [[0x50, 0x4b, 0x03, 0x04]];
const OLD_OFFICE = [[0xd0, 0xcf, 0x11, 0xe0]];
const SIGNATURES = {
  '.jpg': [[0xff, 0xd8, 0xff]],
  '.jpeg': [[0xff, 0xd8, 0xff]],
  '.png': [[0x89, 0x50, 0x4e, 0x47]],
  '.gif': [[0x47, 0x49, 0x46, 0x38]],
  '.pdf': [[0x25, 0x50, 0x44, 0x46]],
  '.zip': ZIP,
  '.docx': ZIP,
  '.xlsx': ZIP,
  '.pptx': ZIP,
  '.doc': OLD_OFFICE,
  '.xls': OLD_OFFICE,
  '.ppt': OLD_OFFICE,
  // .webp is checked separately, .txt and .csv have no signature
};

// Saves into uploads/chat/<conversationId>/<random name>.<ext>
// (req.conversation is set by the membership check BEFORE multer runs)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOAD_ROOT, req.conversation._id.toString());
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, crypto.randomBytes(16).toString('hex') + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_TYPES[ext]) {
      return cb(new Error('This file type is not allowed'));
    }
    cb(null, true);
  },
});

// Does the content of the saved file really look like its extension says?
const matchesSignature = async (filePath, ext) => {
  if (ext === '.txt' || ext === '.csv') return true;

  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(12);
    await handle.read(buffer, 0, 12, 0);

    if (ext === '.webp') {
      return (
        buffer.toString('ascii', 0, 4) === 'RIFF' &&
        buffer.toString('ascii', 8, 12) === 'WEBP'
      );
    }

    const rules = SIGNATURES[ext];
    if (!rules) return false;
    return rules.some((signature) => signature.every((byte, i) => buffer[i] === byte));
  } finally {
    await handle.close();
  }
};

// path of a stored file (path.basename makes path tricks like "../" impossible)
const absolutePath = (conversationId, storedName) =>
  path.join(UPLOAD_ROOT, String(conversationId), path.basename(storedName));

const removeFile = async (filePath) => {
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    // already gone: nothing to do
  }
};

// a safe name to show in the UI
const cleanName = (name) =>
  String(name)
    .replace(/[\\/\u0000-\u001f]/g, '_')
    .slice(0, 150);

module.exports = {
  MAX_FILE_SIZE,
  ALLOWED_TYPES,
  INLINE_TYPES,
  upload,
  matchesSignature,
  absolutePath,
  removeFile,
  cleanName,
};