const test = require('node:test');
const assert = require('node:assert/strict');
const { buildVerificationEmail } = require('../emails/verificationEmail');

test('verification email keeps a usable link and plain text when images are unavailable', () => {
  const link = 'https://swipenest.example/verify-email#token=one-time-token';
  const email = buildVerificationEmail({ link, year: 2026 });
  assert.match(email.html, new RegExp(`href="${link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  assert.match(email.html, /<a[^>]+>[^]*?Xác thực email ngay/);
  assert.ok(email.text.includes(link));
  assert.match(email.text, /Liên kết hết hạn sau 24 giờ/);
  assert.match(email.html, /©|&copy;/);
  assert.match(email.html, /2026 SwipeNest/);
  assert.doesNotMatch(email.html, /\{\{\w+\}\}|<script|<form/i);
});

test('every image in the email has a matching inline PNG, with no hosted image dependency', () => {
  const email = buildVerificationEmail({ link: 'https://swipenest.example/verify-email#token=test' });
  const references = [...email.html.matchAll(/src="cid:([^"]+)"/g)].map(([, id]) => id);
  assert.equal(references.length, email.inlineAttachments.length);
  assert.equal(new Set(references).size, references.length);
  for (const attachment of email.inlineAttachments) {
    assert.ok(references.includes(attachment.contentId));
    assert.equal(attachment.contentType, 'image/png');
    assert.deepEqual(attachment.content.subarray(0, 8), Buffer.from([137,80,78,71,13,10,26,10]));
  }
  assert.doesNotMatch(email.html, /src="(?:https?:|data:)/);
  // Gmail's HTML clipping limit is 102 KB; image bytes are separate MIME parts.
  assert.ok(Buffer.byteLength(email.html) < 80 * 1024);
});

test('verification URLs are escaped in HTML attributes and stay intact in plain text', () => {
  const link = 'https://swipenest.example/verify-email?from=signup&lang=vi#token=a"<>\'';
  const email = buildVerificationEmail({ link });
  assert.ok(email.text.includes(link));
  assert.ok(email.html.includes('from=signup&amp;lang=vi#token=a&quot;&lt;&gt;&#39;'));
  assert.ok(!email.html.includes(link));
});
