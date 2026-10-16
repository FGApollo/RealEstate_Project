process.env.SUPABASE_URL = 'https://isolated-edge.example.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'isolated-edge-service-key';
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const sharp = require('sharp');
const express = require('express');
const axios = require('axios');
const { validateImageBuffer, validateUploadedImages } = require('../services/imageValidation');
const { supabase } = require('../config/supabase');
const { getKycStoragePath, getKycImageBuffer, signVerificationImages } = require('../services/kycStorage');
const { validateEvidenceReferences, getEvidencePath, signEvidenceUrls } = require('../services/evidenceStorage');
const { compareFaces, getFacePlusPlusApiUrl } = require('../services/faceCompareService');
const { analyzeCitizenId } = require('../services/ocrService');
const { securityHeaders, apiErrorHandler } = require('../middleware/securityHeaders');
const originalEnv = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
});

test('actual image decoding rejects spoofed SVG/text/corrupt data, oversized bytes and pixel bombs', async () => {
  for (const input of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), Buffer.from('not an image'), Buffer.alloc(5 * 1024 * 1024 + 1)]) {
    await assert.rejects(validateImageBuffer(input), { code: 'INVALID_IMAGE' });
  }
  const bomb = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: 'white' } }).png().toBuffer();
  await assert.rejects(validateImageBuffer(bomb), { code: 'INVALID_IMAGE' });
});

test('valid decoded images use actual MIME/extension and remove EXIF/trailing content', async () => {
  const input = await sharp({ create: { width: 24, height: 32, channels: 3, background: 'blue' } })
    .jpeg().withMetadata({ exif: { IFD0: { Artist: 'Private fixture name' } } }).toBuffer();
  const output = await validateImageBuffer(Buffer.concat([input, Buffer.from('<script>trailing payload</script>')]));
  assert.equal(output.mimetype, 'image/jpeg');
  assert.equal(output.extension, 'jpg');
  assert.equal((await sharp(output.buffer).metadata()).exif, undefined);
  assert.equal(output.buffer.includes(Buffer.from('trailing payload')), false);
  const file = { buffer: input, mimetype: 'image/png' };
  let nextCalled = false;
  await validateUploadedImages({ file }, { status() { throw new Error('Unexpected reject'); } }, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(file.mimetype, 'image/jpeg');
});

test('KYC storage supports legacy same-project URLs and rejects SSRF/path traversal', async (t) => {
  const objectPath = 'kyc/42/1712000-front.jpg';
  assert.equal(getKycStoragePath(objectPath), objectPath);
  assert.equal(getKycStoragePath(`${process.env.SUPABASE_URL}/storage/v1/object/public/kyc-documents/${objectPath}`), objectPath);
  for (const value of ['http://127.0.0.1/secrets', 'https://other.example/storage/v1/object/public/kyc-documents/kyc/42/x.jpg', '../secret.jpg', 'kyc/42/%2e%2e.jpg', 'file:///etc/passwd']) {
    assert.throws(() => getKycStoragePath(value));
  }
  let downloads = 0;
  t.mock.method(supabase.storage, 'from', () => ({
    async download(path) { downloads++; assert.equal(path, objectPath); return { data: new Blob(['fixture image']) }; },
    async createSignedUrl(path, expiry) { assert.equal(path, objectPath); assert.equal(expiry, 300); return { data: { signedUrl: 'https://signed.invalid/fixture?token=isolated' } }; }
  }));
  assert.equal((await getKycImageBuffer(objectPath)).toString(), 'fixture image');
  await assert.rejects(getKycImageBuffer('http://127.0.0.1/secrets'));
  assert.equal(downloads, 1);
  const signed = await signVerificationImages({ id: 1, id_card_front_url: objectPath });
  assert.match(signed.id_card_front_url, /signed.invalid/);
  assert.equal(signed.image_urls_expire_in, 300);
});

test('appeal evidence accepts only own uploaded references and signs only trusted stored paths', async (t) => {
  const own = `evidence/42/${crypto.randomUUID()}.jpg`;
  assert.deepEqual(validateEvidenceReferences([own], 42), [own]);
  for (const list of [[own.replace('/42/', '/43/')], ['https://evil.example/x.jpg'], ['../x.png'], Array(6).fill(own)]) {
    assert.throws(() => validateEvidenceReferences(list, 42), { statusCode: 400 });
  }
  const legacy = `evidence-${crypto.randomUUID()}.png`;
  assert.equal(getEvidencePath(`${process.env.SUPABASE_URL}/storage/v1/object/public/evidence-documents/${legacy}`), legacy);
  let signedCalls = 0;
  t.mock.method(supabase.storage, 'from', () => ({ async createSignedUrl(path, ttl) { signedCalls++; assert.equal(ttl, 300); return { data: { signedUrl: `https://signed.invalid/${path}` } }; } }));
  const urls = await signEvidenceUrls([own, 'https://evil.example/collect']);
  assert.equal(urls.length, 1);
  assert.equal(signedCalls, 1);
});

test('real face mismatch/provider failure never falls back to forced demo approval', async (t) => {
  process.env.NODE_ENV = 'test'; process.env.KYC_ALLOW_DEMO = 'true';
  process.env.KYC_FACE_MATCH_PROVIDER = 'facepp'; process.env.KYC_FACE_MATCH_DEMO_RESULT = 'pass';
  process.env.FACEPP_API_KEY = 'fixture'; process.env.FACEPP_API_SECRET = 'fixture';
  const input = await sharp(crypto.randomBytes(240 * 240 * 3), { raw: { width: 240, height: 240, channels: 3 } }).jpeg().toBuffer();
  const post = t.mock.method(axios, 'post', async (url, form, config) => {
    assert.equal(config.maxRedirects, 0); assert.ok(config.maxContentLength < Infinity);
    return { data: { confidence: 12 } };
  });
  const mismatch = await compareFaces(input, input);
  assert.equal(mismatch.isMatch, false); assert.equal(mismatch.provider, 'facepp');
  post.mock.mockImplementation(async () => { throw Object.assign(new Error('fixture failure'), { code: 'ECONNRESET' }); });
  const failure = await compareFaces(input, input);
  assert.equal(failure.isMatch, false); assert.equal(failure.provider, 'facepp');
  delete process.env.FACEPP_API_KEY;
  assert.equal((await compareFaces(input, input)).isMatch, false);
});

test('production ignores forced demo face/OCR approvals and rejects arbitrary Face++ endpoints', async () => {
  process.env.NODE_ENV = 'production'; process.env.KYC_ALLOW_DEMO = 'true';
  process.env.KYC_FACE_MATCH_PROVIDER = 'demo'; process.env.KYC_DEMO_MODE = 'pass';
  assert.equal((await compareFaces(Buffer.from('invalid'), Buffer.from('invalid'))).isMatch, false);
  assert.equal((await analyzeCitizenId(Buffer.from('invalid'), Buffer.from('invalid'))).isValid, false);
  for (const endpoint of ['http://127.0.0.1/', 'https://api-us.faceplusplus.com.evil.example/facepp/v3/compare', 'https://api-us.faceplusplus.com/elsewhere']) {
    process.env.FACEPP_API_URL = endpoint; assert.throws(getFacePlusPlusApiUrl);
  }
});

test('API emits security/no-store headers and generic parser/server errors', async () => {
  const app = express(); app.disable('x-powered-by'); app.use(securityHeaders);
  app.use(express.json({ limit: '1kb' }));
  app.post('/api/fixture', (req, res) => res.json({ ok: true }));
  app.get('/api/error', () => { throw new Error('database password SECRET fixture'); });
  app.use(apiErrorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const malformed = await fetch(`${base}/api/fixture`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
    assert.equal(malformed.status, 400); assert.equal(malformed.headers.get('cache-control'), 'no-store');
    assert.equal(malformed.headers.get('x-content-type-options'), 'nosniff'); assert.equal(malformed.headers.get('x-powered-by'), null);
    const tooLarge = await fetch(`${base}/api/fixture`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: 'x'.repeat(2000) }) });
    assert.equal(tooLarge.status, 413);
    const error = await fetch(`${base}/api/error`);
    assert.equal(error.status, 500); assert.doesNotMatch(await error.text(), /SECRET|password/);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('private local evidence is blocked even when its filename is URL encoded', () => {
  const { denyPrivateUploads } = require('../middleware/securityHeaders');
  for (const path of ['/evidence-fixture.png', '/%65vidence-fixture.png', '/folder/%65vidence-fixture.png']) {
    let result;
    denyPrivateUploads({ path }, { sendStatus: (status) => { result = status; } }, () => { result = 'served'; });
    assert.equal(result, 404);
  }
});
