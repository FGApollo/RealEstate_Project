const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const { supabase } = require('../config/supabase');
const { MAX_IMAGE_BYTES, validateImageBuffer } = require('./imageValidation');
const { badRequest, positiveId } = require('./businessValidation');

const PUBLIC_IMAGE_MAX_DIMENSION = 1600;
const PUBLIC_IMAGE_WEBP_QUALITY = 82;
const PUBLIC_IMAGE_OPTIMIZE_MIN_BYTES = 16 * 1024;

const optimizePublicImageBuffer = async (validatedImage) => {
  const meta = await sharp(validatedImage.buffer, { failOn: 'warning', animated: false }).metadata();
  const needsResize = (meta.width || 0) > PUBLIC_IMAGE_MAX_DIMENSION || (meta.height || 0) > PUBLIC_IMAGE_MAX_DIMENSION;

  // Keep already-tiny images in their validated format when no resize is needed.
  if (!needsResize && validatedImage.size <= PUBLIC_IMAGE_OPTIMIZE_MIN_BYTES) {
    return validatedImage;
  }

  const pipeline = sharp(validatedImage.buffer, { failOn: 'warning', animated: false });
  if (needsResize) {
    pipeline.resize({
      width: PUBLIC_IMAGE_MAX_DIMENSION,
      height: PUBLIC_IMAGE_MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true
    });
  }
  const optimized = await pipeline
    .webp({ quality: PUBLIC_IMAGE_WEBP_QUALITY, effort: 4 })
    .toBuffer();

  if (optimized.length > MAX_IMAGE_BYTES) {
    throw Object.assign(badRequest('Ảnh sau khi nén vẫn vượt quá 5MB.'), { statusCode: 413 });
  }

  if (!needsResize && optimized.length >= validatedImage.size) {
    return validatedImage;
  }

  return {
    buffer: optimized,
    mimetype: 'image/webp',
    extension: 'webp',
    size: optimized.length
  };
};

const savePublicImage = async (value, category, userId) => {
  if (value === undefined || value === null || value === '') return value;
  if (typeof value !== 'string') throw badRequest('Invalid image.');
  if (value.startsWith('/uploads/') && /^\/uploads\/[\w.-]+$/.test(value)) return value;
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (value.length <= 4000 && !url.username && !url.password) return url.href;
    } catch { /* report a validation error below */ }
    throw badRequest('Invalid image URL.');
  }
  const match = /^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw badRequest('Ảnh phải có định dạng JPG, PNG hoặc WEBP.');
  if (match[1].length > Math.ceil(5 * 1024 * 1024 / 3) * 4) {
    throw Object.assign(badRequest('Ảnh không được vượt quá 5MB.'), { statusCode: 413 });
  }
  const validated = await validateImageBuffer(Buffer.from(match[1], 'base64'));
  const image = await optimizePublicImageBuffer(validated);
  const ownerId = positiveId(userId, 'userId');
  const filename = `${category}-${ownerId}-${crypto.randomUUID()}.${image.extension}`;
  const objectPath = `${category}/${ownerId}/${filename}`;
  const { error } = await supabase.storage.from('property-images')
    .upload(objectPath, image.buffer, {
      contentType: image.mimetype,
      cacheControl: '31536000',
      upsert: false
    });
  if (error) {
    // Không ghi tạm ra ổ đĩa: trên máy chủ deploy, ổ đĩa bị xóa mỗi lần triển khai nên ảnh sẽ mất.
    console.error('Public image upload failed:', error.message || error);
    throw Object.assign(new Error('Không thể lưu ảnh lúc này, vui lòng thử lại.'), { statusCode: 503 });
  }
  return supabase.storage.from('property-images').getPublicUrl(objectPath).data.publicUrl;
};

// Client-supplied URLs are never authority to delete another user's object.
// Legacy objects without an owner namespace are retained until a storage audit.
const deleteOwnedListingImage = async (value, userId) => {
  if (typeof value !== 'string') return;
  const ownerId = positiveId(userId, 'userId');
  const filenamePattern = new RegExp(`^listings-${ownerId}-[0-9a-f-]{36}\\.(?:jpg|jpeg|png|webp)$`);
  let url;
  try { url = new URL(value, 'http://local.invalid'); } catch { return; }
  const storageBase = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const prefix = `/storage/v1/object/public/property-images/listings/${ownerId}/`;
  if (storageBase && url.origin === new URL(storageBase).origin && url.pathname.startsWith(prefix)) {
    const filename = url.pathname.slice(prefix.length);
    if (filenamePattern.test(filename) && !url.search && !url.hash) {
      const { error } = await supabase.storage.from('property-images').remove([`listings/${ownerId}/${filename}`]);
      if (error) throw new Error('Could not delete listing image.');
    }
    return;
  }
  if (!url.pathname.startsWith('/uploads/')) return;
  // Only local relative paths generated here are accepted; arbitrary remote
  // URLs ending in /uploads/name are not evidence of local ownership.
  if (!value.startsWith('/uploads/')) return;
  const filename = url.pathname.slice('/uploads/'.length);
  if (!filenamePattern.test(filename)) return;
  await fs.unlink(path.join(path.resolve(__dirname, '../public/uploads'), filename)).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
};

module.exports = {
  PUBLIC_IMAGE_MAX_DIMENSION,
  PUBLIC_IMAGE_WEBP_QUALITY,
  optimizePublicImageBuffer,
  savePublicImage,
  deleteOwnedListingImage
};
