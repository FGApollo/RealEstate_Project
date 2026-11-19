// Real Swipe page with a local, in-memory API fixture. No production accounts,
// database writes, or mail delivery are used by this audit.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

const root = path.resolve(__dirname, '../..');
const output = path.join(root, '.local/swipe-mobile-verification');
const user = { id: 1, name: 'Thịnh Nguyễn', email: 'swipe-fixture@example.test', role: 'USER', is_active: true,
  email_verified_at: '2026-01-01', verification_status: 'VERIFIED' };
const properties = Array.from({ length: 10 }, (_, index) => ({
  id: index + 1, owner_id: 9, title: index === 0
    ? 'Phú Nhuận cho thuê sàn văn phòng 275m² – 458m² ngay sát sân bay TSN'
    : `Văn phòng ${index + 1} nhiều ánh sáng, phù hợp doanh nghiệp`,
  address: 'Phường Phú Nhuận, Thành phố Hồ Chí Minh', price: 133200000, area: 275,
  bedrooms: 1, bathrooms: 1, listing_type: 'RENT', property_type: 'Văn Phòng', status: 'AVAILABLE',
  thumbnail: process.env.SWIPE_AUDIT_IMAGE ? '/swipe-fixture-office.png' : '/auth-welcome.png',
  description: 'Không gian làm việc nhiều ánh sáng, thuận tiện di chuyển.',
  owner: { id: 9, name: 'Swipe Nest', role: 'AGENT', is_official: true, verification_status: 'VERIFIED' }
}));

(async () => {
  process.env.VITE_API_URL = 'https://swipe-mobile-fixture.example';
  const { createServer } = await import('vite');
  const vite = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });
  let browser;
  let mode = 'normal';
  let favorites = [];
  const events = [];
  try {
    fs.mkdirSync(output, { recursive: true });
    await vite.listen();
    const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
    browser = await chromium.launch({ headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const feed = () => mode === 'empty' ? [] : mode === 'long' ? [{ ...properties[0],
      title: `${properties[0].title} ${'Không gian phù hợp cho doanh nghiệp lớn và nhỏ. '.repeat(5)}`,
      address: 'Phường có tên rất dài, thuộc khu vực trung tâm Thành phố Hồ Chí Minh, thuận tiện kết nối giao thông và tiện ích.',
      area: 12345, bedrooms: 12, bathrooms: 10 }] : mode === 'no-image' ? [{ ...properties[0], thumbnail: null }] : properties;
    await page.route('https://swipe-mobile-fixture.example/api/**', (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const headers = { 'access-control-allow-origin': base, 'access-control-allow-credentials': 'true',
        'access-control-allow-headers': 'Content-Type, Authorization', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
      const reply = (json, status = 200) => route.fulfill({ json, status, headers });
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (url.pathname.endsWith('/auth/refresh')) return reply({ user, accessToken: 'isolated-fixture-access-token' });
      if (url.pathname.endsWith('/me/preferences')) return reply({ preferences: { onboarding_completed: true } });
      if (url.pathname.endsWith('/recommendations')) return reply({ properties: feed(), pagination: { hasMore: false } });
      if (url.pathname.endsWith('/me/swipe-history')) return reply({ items: [], hasMore: false });
      if (url.pathname.endsWith('/me/property-events')) { events.push(request.postDataJSON()); return reply({ success: true }); }
      if (url.pathname.endsWith('/favorites')) {
        if (request.method() === 'POST') {
          const id = request.postDataJSON().propertyId;
          if (!favorites.some((item) => item.id === id)) favorites.push(properties.find((item) => item.id === id));
        }
        return reply({ favorites });
      }
      if (url.pathname.endsWith('/reviews')) return reply({ reviews: [], averageRating: 0, totalReviews: 0 });
      if (url.pathname.endsWith('/similar')) return reply({ properties: [] });
      if (/\/properties\/\d+$/.test(url.pathname)) return reply({ property: properties.find((item) => item.id === Number(url.pathname.split('/').pop())) });
      return reply({ success: true, data: [] });
    });
    if (process.env.SWIPE_AUDIT_IMAGE) await page.route('**/swipe-fixture-office.png', (route) => route.fulfill({
      contentType: process.env.SWIPE_AUDIT_IMAGE.endsWith('.jpg') ? 'image/jpeg' : 'image/png', body: fs.readFileSync(process.env.SWIPE_AUDIT_IMAGE)
    }));
    const open = async () => {
      await page.goto(`${base}/swipe/${encodeURIComponent('Văn Phòng')}`);
      await page.locator('.swipe-property-card').waitFor();
    };
    const inspect = async (label, width, height) => {
      const metrics = await page.evaluate(() => {
        const rect = (selector) => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return { top: r.top + scrollY, bottom: r.bottom + scrollY, left: r.left, right: r.right, height: r.height };
        };
        return { overflow: document.documentElement.scrollWidth > innerWidth,
          card: rect('.swipe-property-card'), media: rect('.swipe-property-media'), title: rect('.swipe-property-heading'),
          info: rect('.swipe-property-overlay'), actions: rect('.swipe-experience-actions'),
          hint: rect('.swipe-discover-hint'), footer: rect('.swipe-bottom-tools'), chat: rect('.swipe-chat-prompt'),
          infoPosition: getComputedStyle(document.querySelector('.swipe-property-overlay')).position };
      });
      assert.equal(metrics.overflow, false, `Overflow: ${label}`);
      if (width <= 820) {
        assert.equal(metrics.infoPosition, 'relative');
        assert.ok(metrics.title.top >= metrics.media.bottom - 2, `Text overlaps photo: ${label}`);
        assert.ok(metrics.actions.top >= metrics.card.bottom + 10, `Card overlaps controls: ${label}`);
        assert.ok(metrics.hint.top >= metrics.actions.bottom, `Controls overlap hint: ${label}`);
        assert.ok(metrics.chat.top >= metrics.footer.bottom, `Mascot overlaps controls: ${label}`);
        assert.ok(metrics.card.left >= 0 && metrics.card.right <= width);
      }
      await page.locator('.swipe-experience-actions .details').scrollIntoViewIfNeeded();
      assert.equal(await page.locator('.swipe-experience-actions .details').evaluate((button) => {
        const r = button.getBoundingClientRect();
        return button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      }), true, `Detail button is obstructed: ${label}`);
      if (['390x844', '320x568', 'long-390x667'].includes(label)) {
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({ path: path.join(output, `swipe-${label}.png`), fullPage: true });
      }
      return { label, width, height, cardHeight: metrics.card.height };
    };
    const results = [];
    for (const [width, height] of [[320,568],[360,640],[375,667],[390,844],[414,736],[430,932],[768,1024],[820,1180],[1024,900],[1440,1000]]) {
      await page.setViewportSize({ width, height });
      await open();
      results.push(await inspect(`${width}x${height}`, width, height));
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await open();
    for (const height of [667, 560, 420, 844]) {
      await page.setViewportSize({ width: 390, height });
      await page.evaluate(() => scrollTo(0, 0));
      results.push(await inspect(`resize-390x${height}`, 390, height));
    }
    for (const variant of ['long', 'no-image']) {
      mode = variant;
      await page.setViewportSize({ width: 390, height: 667 });
      await open();
      results.push(await inspect(`${variant}-390x667`, 390, 667));
    }
    mode = 'normal'; favorites = []; events.length = 0;
    await page.setViewportSize({ width: 390, height: 844 });
    await open();
    await page.getByRole('button', { name: 'Xem thông tin chi tiết', exact: true }).click();
    await page.locator('.detail-modal-content').waitFor();
    await page.locator('.detail-modal-content').getByRole('button', { name: 'Close', exact: true }).click();
    const advance = async (selector, nextId) => {
      await page.locator(selector).click();
      await page.waitForFunction((title) => document.querySelector('.swipe-property-heading h2')?.textContent === title,
        properties[nextId - 1].title);
      await page.locator('.swipe-experience-actions .like').waitFor({ state: 'visible' });
      await page.waitForFunction(() => !document.querySelector('.swipe-experience-actions .like').disabled);
    };
    await advance('.swipe-property-favorite', 2);
    await advance('.swipe-experience-actions .dislike', 3);
    await advance('.swipe-experience-actions .like', 4);
    await advance('.swipe-deck-arrow.previous', 5);
    await advance('.swipe-deck-arrow.next', 6);
    for (const [direction, nextId] of [[-1, 7], [1, 8]]) {
      await page.locator('.swipe-property-media').scrollIntoViewIfNeeded();
      const box = await page.locator('.swipe-property-media').boundingBox();
      const x = box.x + box.width / 2; const y = box.y + box.height * .72;
      await page.mouse.move(x, y); await page.mouse.down();
      await page.mouse.move(x + direction * 155, y, { steps: 12 }); await page.mouse.up();
      await page.waitForFunction((title) => document.querySelector('.swipe-property-heading h2')?.textContent === title,
        properties[nextId - 1].title);
      await page.waitForFunction(() => !document.querySelector('.swipe-experience-actions .like').disabled);
    }
    assert.deepEqual(events.filter((event) => event.action !== 'VIEW').map((event) => [event.propertyId,event.action]),
      [[1,'LIKE'],[2,'DISLIKE'],[3,'LIKE'],[4,'DISLIKE'],[5,'LIKE'],[6,'DISLIKE'],[7,'LIKE']]);
    assert.deepEqual(favorites.map((item) => item.id), [1,3,5,7]);
    await page.getByRole('button', { name: 'Lịch sử vuốt', exact: true }).click();
    await page.getByRole('dialog', { name: 'Lịch sử vuốt', exact: true }).waitFor();
    await page.locator('.swipe-history-drawer-close').click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'Yêu thích', exact: true }).click();
    await page.getByRole('heading', { name: 'Bất động sản yêu thích', exact: true }).waitFor();
    await page.locator('.saved-content-area').getByText(properties[0].title, { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Khám phá', exact: true }).click();
    await page.locator('.swipe-property-heading').getByText(properties[7].title, { exact: true }).waitFor();
    mode = 'empty'; await page.reload();
    await page.getByText('Chưa có tin phù hợp', { exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 667 });
    await page.getByRole('button', { name: 'Lịch sử vuốt', exact: true }).click();
    await page.getByRole('dialog', { name: 'Lịch sử vuốt', exact: true }).waitFor();
    await page.locator('.swipe-history-drawer-close').click();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, results, actions: events.length, screenshots: output }));
  } finally { await browser?.close(); await vite.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
