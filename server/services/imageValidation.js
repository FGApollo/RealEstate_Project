const sharp = require('sharp');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 20_000_000;
const IMAGE_FORMATS = { jpeg: ['image/jpeg', 'jpg'], png: ['image/png', 'png'], webp: ['image/webp', 'webp'] };

const invalidImage = () => Object.assign(new Error('Only valid JPG, PNG or WEBP images up to 5MB and 20 megapixels are allowed'), {
  statusCode: 400,
  code: 'INVALID_IMAGE'
});

// Decode and re-encode, instead of trusting a multipart Content-Type, extension,
// or a data URL. This also removes EXIF/GPS and non-image trailing payloads.
const validateImageBuffer = async (buffer) => {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_IMAGE_BYTES) throw invalidImage();
  try {
    const image = sharp(buffer, { failOn: 'warning', limitInputPixels: MAX_IMAGE_PIXELS, animated: false });
    const metadata = await image.metadata();
    const format = IMAGE_FORMATS[metadata.format];
    if (!format || !metadata.width || !metadata.height || (metadata.pages || 1) > 1
      || metadata.width * metadata.height > MAX_IMAGE_PIXELS) throw invalidImage();
    const normalized = await image.rotate().toFormat(metadata.format).toBuffer();
    if (normalized.length > MAX_IMAGE_BYTES) throw invalidImage();
    return { buffer: normalized, mimetype: format[0], extension: format[1], size: normalized.length };
  } catch {
    throw invalidImage();
  }
};

const normalizeImageFile = async (file) => Object.assign(file, await validateImageBuffer(file?.buffer));

const validateUploadedImages = async (req, res, next) => {
  try {
    const files = req.file ? [req.file] : Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat();
    // Validate sequentially to bound decoded-image memory per request.
    for (const file of files) await normalizeImageFile(file);
    next();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

module.exports = { MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, validateImageBuffer, normalizeImageFile, validateUploadedImages };
