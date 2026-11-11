process.env.SUPABASE_URL = 'https://image-storage.example.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'isolated-image-storage-key';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { supabase } = require('../config/supabase');
const { savePublicImage } = require('../services/publicImageStorage');

test('storage failure returns 503 and never falls back to the local disk', async (t) => {
  const uploadDirectory = path.resolve(__dirname, '../public/uploads');
  const before = fs.existsSync(uploadDirectory) ? fs.readdirSync(uploadDirectory).length : 0;
  t.mock.method(console, 'error', () => {});
  t.mock.method(supabase.storage, 'from', () => ({
    async upload() { return { error: { message: 'bucket unavailable' } }; }
  }));
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#336699' } }).png().toBuffer();
  await assert.rejects(
    savePublicImage(`data:image/png;base64,${png.toString('base64')}`, 'listings', 7),
    (error) => error.statusCode === 503 && /Không thể lưu ảnh/.test(error.message)
  );
  const after = fs.existsSync(uploadDirectory) ? fs.readdirSync(uploadDirectory).length : 0;
  assert.equal(after, before);
});
