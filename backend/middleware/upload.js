const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
    cb(null, safeName);
  }
});

// Checks the first few bytes of a file against known "magic number" signatures.
// A renamed .exe or an HTML file with a fake .jpg extension will fail this
// even though its extension/mimetype claim to be an image — extension and
// declared mimetype are both attacker-controlled, real file bytes aren't.
const MAGIC_BYTES = {
  jpg: [[0xFF, 0xD8, 0xFF]],
  png: [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
  gif: [[0x47, 0x49, 0x46, 0x38]],
  webp: [[0x52, 0x49, 0x46, 0x46]] // followed by "WEBP" at offset 8, checked separately
};

function bufferMatchesSignature(buffer, signature) {
  return signature.every((byte, i) => buffer[i] === byte);
}

function isRealImage(buffer) {
  if (!buffer || buffer.length < 12) return false;
  if (MAGIC_BYTES.jpg.some(sig => bufferMatchesSignature(buffer, sig))) return true;
  if (MAGIC_BYTES.png.some(sig => bufferMatchesSignature(buffer, sig))) return true;
  if (MAGIC_BYTES.gif.some(sig => bufferMatchesSignature(buffer, sig))) return true;
  if (bufferMatchesSignature(buffer, MAGIC_BYTES.webp[0]) && buffer.slice(8, 12).toString('ascii') === 'WEBP') return true;
  return false;
}

// Reads just enough of the just-saved file to check its magic bytes, and
// deletes it if the real content doesn't match an allowed image format.
function verifyImageContent(req, res, next) {
  if (!req.file) return next();
  const filePath = req.file.path;
  fs.open(filePath, 'r', (openErr, fd) => {
    if (openErr) return next();
    const buffer = Buffer.alloc(12);
    fs.read(fd, buffer, 0, 12, 0, (readErr) => {
      fs.close(fd, () => {});
      if (readErr || !isRealImage(buffer)) {
        fs.unlink(filePath, () => {});
        return next(new Error('The uploaded file is not a valid image (its content did not match its extension).'));
      }
      next();
    });
  });
}

// SVG intentionally NOT allowed — an SVG can embed <script> and run
// arbitrary JS in the browser of anyone who views it (stored XSS).
function fileFilter(req, file, cb) {
  const allowed = /jpeg|jpg|png|gif|webp/;
  const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
  const mimeOk = allowed.test(file.mimetype);
  if (extOk && mimeOk) return cb(null, true);
  cb(new Error('Only image files (jpg, png, gif, webp) are allowed'));
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Enquiry attachments (project briefs, reference files) — images + common docs.
// These aren't rendered inline in a browser the way an admin-uploaded image
// might be, so a lighter extension-based check is enough here; the risk that
// matters for these is disk space / malware hosting, not stored XSS.
function docFileFilter(req, file, cb) {
  const allowed = /jpeg|jpg|png|gif|webp|pdf|doc|docx|xls|xlsx|zip/;
  const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
  if (extOk) return cb(null, true);
  cb(new Error('Only images, PDF, Word, Excel, or ZIP files are allowed'));
}

const uploadDoc = multer({
  storage,
  fileFilter: docFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

const sharp = require('sharp');

// Automatic image pipeline — runs after upload + magic-byte validation, before
// the route handler touches req.file/req.files. For every uploaded image it:
//   1. Resizes down to a sane max width (keeps aspect ratio, never upscales)
//   2. Re-encodes as WebP at a strong-but-clean compression quality
//   3. Generates a small thumbnail (suffixed "-thumb.webp") for admin list
//      previews and image-grid pages, so those never have to load full-size files
// It rewrites file.filename/file.path/file.mimetype in place, so every existing
// route that does `'/uploads/' + file.filename` keeps working unmodified and
// automatically gets a compressed, responsive-ready WebP image.
const MAX_WIDTH = 1920;
const THUMB_WIDTH = 480;
const WEBP_QUALITY = 78;

async function processOneFile(file) {
  if (!file || !file.path) return;
  const dir = path.dirname(file.path);
  const baseName = path.basename(file.filename, path.extname(file.filename));
  const webpName = baseName + '.webp';
  const webpPath = path.join(dir, webpName);
  const thumbName = baseName + '-thumb.webp';
  const thumbPath = path.join(dir, thumbName);

  try {
    const image = sharp(file.path, { animated: true }); // animated: true keeps GIF motion when the source is a GIF
    const metadata = await image.metadata();

    await sharp(file.path, { animated: true })
      .resize({ width: Math.min(metadata.width || MAX_WIDTH, MAX_WIDTH), withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toFile(webpPath);

    await sharp(file.path)
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: 70 })
      .toFile(thumbPath);

    // The original upload (jpg/png/gif) is no longer needed once we have the WebP
    if (file.path !== webpPath) fs.unlink(file.path, () => {});

    file.filename = webpName;
    file.path = webpPath;
    file.mimetype = 'image/webp';
    file.thumbnailFilename = thumbName;
  } catch (err) {
    // If sharp fails for any reason (corrupt file, unsupported variant), keep
    // the original upload rather than losing the file entirely.
    console.warn('Image processing skipped for', file.originalname, '-', err.message);
  }
}

async function processImages(req, res, next) {
  try {
    const files = [];
    if (req.file) files.push(req.file);
    if (req.files) {
      if (Array.isArray(req.files)) files.push(...req.files);
      else Object.values(req.files).forEach(arr => files.push(...arr));
    }
    await Promise.all(files.map(processOneFile));
    next();
  } catch (err) {
    next(err);
  }
}

// Deletes both the main image and its generated thumbnail (if any) for a
// given "/uploads/xxx.webp" path. Existing callers of removeUploadedFile
// already do this for the main file — this variant also cleans the thumb.
function removeUploadedFileWithThumb(uploadPath) {
  if (!uploadPath) return;
  const filename = path.basename(uploadPath);
  const full = path.join(uploadDir, filename);
  fs.unlink(full, () => {});
  const thumbName = path.basename(filename, path.extname(filename)) + '-thumb.webp';
  fs.unlink(path.join(uploadDir, thumbName), () => {});
}

module.exports = { upload, uploadDoc, uploadDir, verifyImageContent, processImages, removeUploadedFileWithThumb };
