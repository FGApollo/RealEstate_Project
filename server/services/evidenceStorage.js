const { supabase } = require('../config/supabase');

const EVIDENCE_BUCKET = 'evidence-documents';
const EVIDENCE_URL_TTL_SECONDS = 5 * 60;
const OWN_PATH = /^evidence\/([1-9]\d*)\/[a-f0-9-]{36}\.(?:jpg|png|webp)$/;
const LEGACY_PATH = /^evidence-[a-f0-9-]{36}\.(?:jpg|png|webp)$/;
const invalidEvidence = () => Object.assign(new Error('Ảnh minh chứng không hợp lệ hoặc không thuộc tài khoản này.'), { statusCode: 400 });

const validateEvidenceReferences = (list, userId) => {
  if (!Array.isArray(list) || list.length > 5) throw invalidEvidence();
  for (const value of list) {
    const match = typeof value === 'string' && value.match(OWN_PATH);
    if (!match || String(match[1]) !== String(userId)) throw invalidEvidence();
  }
  return list;
};

const getEvidencePath = (value) => {
  if (typeof value !== 'string' || value.length > 2048) throw invalidEvidence();
  let objectPath = value;
  if (value.startsWith('https://')) {
    const url = new URL(value);
    const prefix = `/storage/v1/object/public/${EVIDENCE_BUCKET}/`;
    const configuredOrigin = new URL(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL).origin;
    if (url.origin !== configuredOrigin || url.username || url.password || url.search || url.hash
      || !url.pathname.startsWith(prefix)) throw invalidEvidence();
    try { objectPath = decodeURIComponent(url.pathname.slice(prefix.length)); } catch { throw invalidEvidence(); }
  }
  if (!OWN_PATH.test(objectPath) && !LEGACY_PATH.test(objectPath)) throw invalidEvidence();
  return objectPath;
};

const signEvidenceUrls = async (list) => {
  if (!Array.isArray(list) || list.length > 5) throw invalidEvidence();
  return Promise.all(list.map(async (value) => {
    let objectPath;
    try { objectPath = getEvidencePath(value); } catch { return null; }
    const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(objectPath, EVIDENCE_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  })).then((urls) => urls.filter(Boolean));
};

module.exports = { EVIDENCE_BUCKET, EVIDENCE_URL_TTL_SECONDS, validateEvidenceReferences, getEvidencePath, signEvidenceUrls };
