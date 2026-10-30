const { supabase } = require('../config/supabase');

const KYC_BUCKET = 'kyc-documents';
const SIGNED_URL_TTL_SECONDS = 5 * 60;
const MAX_KYC_BYTES = 5 * 1024 * 1024;

// Older rows contain public URLs even though the bucket is private. Accept
// those exact same-project URLs solely to recover their object path; never fetch
// an arbitrary URL stored in the database with the server's network access.
const getKycStoragePath = (value) => {
  if (typeof value !== 'string' || !value || value.length > 2048) throw new Error('Invalid stored KYC image');
  let objectPath = value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    let parsed;
    try { parsed = new URL(value); } catch { throw new Error('Invalid stored KYC image'); }
    const configuredOrigin = new URL(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL).origin;
    const prefix = `/storage/v1/object/public/${KYC_BUCKET}/`;
    if (parsed.origin !== configuredOrigin || parsed.username || parsed.password || parsed.search || parsed.hash
      || !parsed.pathname.startsWith(prefix)) throw new Error('Invalid stored KYC image');
    try { objectPath = decodeURIComponent(parsed.pathname.slice(prefix.length)); } catch { throw new Error('Invalid stored KYC image'); }
  }
  if (!/^kyc\/[1-9]\d*\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(objectPath)) throw new Error('Invalid stored KYC image');
  return objectPath;
};

const getKycImageBuffer = async (value) => {
  const objectPath = getKycStoragePath(value);
  const { data, error } = await supabase.storage.from(KYC_BUCKET).download(objectPath);
  if (error || !data) throw new Error('Failed to download stored KYC image');
  if (data.size > MAX_KYC_BYTES) throw new Error('Stored KYC image is too large');
  const buffer = Buffer.from(await data.arrayBuffer());
  if (buffer.length > MAX_KYC_BYTES) throw new Error('Stored KYC image is too large');
  return buffer;
};

const signKycImage = async (value) => {
  if (!value) return null;
  const objectPath = getKycStoragePath(value);
  const { data, error } = await supabase.storage.from(KYC_BUCKET).createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw new Error('Failed to prepare KYC image preview');
  return data.signedUrl;
};

const signVerificationImages = async (verification) => {
  const signed = { ...verification };
  for (const key of ['id_card_front_url', 'id_card_back_url', 'selfie_url']) {
    signed[key] = await signKycImage(verification[key]);
  }
  signed.image_urls_expire_in = SIGNED_URL_TTL_SECONDS;
  return signed;
};

module.exports = { KYC_BUCKET, SIGNED_URL_TTL_SECONDS, getKycStoragePath, getKycImageBuffer, signVerificationImages };
