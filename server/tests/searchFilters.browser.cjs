// Isolated frontend audit: all API traffic is fulfilled locally. No production
// accounts, mail, database records or authentication credentials are used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

const root = path.resolve(__dirname, '../..');
const output = path.join(root, '.local/search-filter-verification');
const provinces = [
  { code: 79, name: 'Thành phố Hồ Chí Minh', wards: [{ code: 1, name: 'Phường An Khánh' }] },
  { code: 1, name: 'Thành phố Hà Nội', wards: [{ code: 2, name: 'Phường Ba Đình' }] }
];
const properties = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1, title: `Căn hộ nhiều ánh sáng ${i + 1}`, address: 'Phường An Khánh, Thành phố Hồ Chí Minh',
  price: 8000000, area: 65, bedrooms: 2, bathrooms: 1, listing_type: 'RENT', thumbnail: '/auth-welcome.png'
}));

(async () => {
  process.env.VITE_API_URL = 'https://search-filter-fixture.example';
  const { createServer } = await import('vite');
  const vite = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });
  let browser;
  try {
    fs.mkdirSync(output, { recursive: true });
    await vite.listen();
    const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
    browser = await chromium.launch({ headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
    const page = await browser.newPage();
    const requests = [];
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://search-filter-fixture.example/api/**', (route) => {
      const url = new URL(route.request().url());
      const headers = { 'access-control-allow-origin': base, 'access-control-allow-credentials': 'true',
        'access-control-allow-headers': 'Content-Type, Authorization', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (url.pathname.endsWith('/properties')) {
        requests.push(url.searchParams.get('filters'));
        return route.fulfill({ json: { properties }, headers });
      }
      if (url.pathname.endsWith('/auth/refresh')) return route.fulfill({ status: 401, json: { error: 'No fixture session' }, headers });
      return route.fulfill({ json: {}, headers });
    });
    await page.route('**/data/vn-admin-2025.json', (route) => route.fulfill({ json: {
      provinces: provinces.map((province) => ({ c: province.code, n: province.name,
        w: province.wards.map((ward) => [ward.code, ward.name]) }))
    } }));
    const widths = [1440, 1024, 820, 768, 700, 430, 390, 375, 360, 320];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`${base}/search`);
      await page.getByRole('heading', { name: 'Tất cả tin đăng', exact: true }).waitFor();
      await page.locator('.search-card').first().waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Horizontal overflow at ${width}`);
      const fields = await page.locator('.search-filter-field').evaluateAll((items) => items.map((item) => {
        const rect = item.getBoundingClientRect(); return { top: rect.top, left: rect.left, right: rect.right, height: rect.height };
      }));
      assert.ok(fields.every((field) => field.left >= 0 && field.right <= width && field.height >= 44));
      if ([1440, 390, 320].includes(width)) await page.screenshot({ path: path.join(output, `search-${width}.png`) });
      if (width > 900) assert.ok(fields.every((field) => Math.abs(field.top - fields[0].top) < 1), `Field alignment at ${width}: ${JSON.stringify(fields)}`);
      else {
        assert.equal(fields[0].top, fields[1].top);
        assert.equal(fields[2].top, fields[3].top);
        assert.ok(fields[2].top > fields[0].top);
      }
      await page.getByRole('button', { name: /Khu vực/ }).click();
      const panel = page.getByRole('dialog', { name: 'Chọn khu vực' });
      await panel.waitFor();
      const rect = await panel.boundingBox();
      assert.ok(rect.x >= 0 && rect.x + rect.width <= width, `Location panel overflow at ${width}`);
      if (width === 390) await page.screenshot({ path: path.join(output, 'search-390-location.png') });
      await page.keyboard.press('Escape');
      assert.equal(await panel.count(), 0);
      assert.equal(await page.getByRole('button', { name: /Khu vực/ }).evaluate((element) => element === document.activeElement), true);
      await page.evaluate(() => scrollTo(0, 500));
      if (width > 900) {
        const bar = await page.locator('.search-page-bar-wrap').boundingBox();
        const header = await page.locator('.app-header-navbar').boundingBox();
        assert.ok(bar.y >= header.y + header.height - 1, `Sticky filters overlap header at ${width}`);
      }
    }

    await page.setViewportSize({ width: 390, height: 420 });
    await page.goto(`${base}/search`);
    await page.getByRole('button', { name: /Khu vực/ }).click();
    const shortPanel = await page.getByRole('dialog', { name: 'Chọn khu vực' }).boundingBox();
    assert.ok(shortPanel.y >= 0 && shortPanel.y + shortPanel.height <= 420, 'Location panel must fit a short mobile viewport');
    await page.getByRole('button', { name: 'Xong', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/search`);
    await page.locator('.search-card').first().waitFor();
    const initialRequests = requests.length;
    await page.getByLabel('Loại bất động sản', { exact: true }).selectOption('Căn Hộ');
    await page.getByLabel('Khoảng giá', { exact: true }).selectOption('5m-10m');
    await page.getByLabel('Hình thức', { exact: true }).selectOption('RENT');
    await page.getByRole('button', { name: /Khu vực/ }).click();
    await page.getByLabel('Tỉnh/Thành phố', { exact: true }).selectOption('Thành phố Hồ Chí Minh');
    await page.getByLabel('Phường/Xã', { exact: true }).selectOption('Phường An Khánh');
    await page.getByRole('button', { name: 'Xong', exact: true }).click();
    assert.equal(requests.length, initialRequests, 'Editing a draft must not fetch or apply filters');
    await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
    await page.waitForURL((url) => url.searchParams.get('listing') === 'RENT');
    const params = new URL(page.url()).searchParams;
    assert.equal(params.get('type'), 'Căn Hộ');
    assert.equal(params.get('province'), 'Thành phố Hồ Chí Minh');
    assert.equal(params.get('ward'), 'Phường An Khánh');
    assert.equal(params.get('minPrice'), '5000000');
    assert.equal(params.get('maxPrice'), '10000000');
    await page.getByRole('button', { name: /Khu vực/ }).click();
    await page.getByLabel('Tỉnh/Thành phố', { exact: true }).selectOption('Thành phố Hà Nội');
    assert.equal(await page.getByLabel('Phường/Xã', { exact: true }).inputValue(), '');
    await page.getByLabel('Loại bất động sản', { exact: true }).focus();
    assert.equal(await page.getByRole('dialog', { name: 'Chọn khu vực' }).count(), 0);
    await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
    await page.waitForURL((url) => url.searchParams.get('province') === 'Thành phố Hà Nội');
    assert.equal(new URL(page.url()).searchParams.has('ward'), false);

    const custom = new URLSearchParams({ minPrice: '123', maxPrice: '456', minArea: '20', q: 'sân vườn' });
    custom.append('type', 'Nhà Ở'); custom.append('type', 'Căn Hộ'); custom.append('beds', '2'); custom.append('tag', 'Balcony');
    await page.goto(`${base}/search?${custom}`);
    await page.getByLabel('Loại bất động sản', { exact: true }).waitFor({ state: 'attached' });
    assert.equal(await page.getByLabel('Loại bất động sản', { exact: true }).inputValue(), 'CUSTOM');
    assert.equal(await page.getByLabel('Khoảng giá', { exact: true }).inputValue(), 'CUSTOM');
    await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).focus();
    await page.keyboard.press('Enter');
    const retained = new URL(page.url()).searchParams;
    for (const key of ['minPrice', 'maxPrice', 'minArea', 'q', 'beds', 'tag']) assert.equal(retained.get(key), custom.get(key));
    assert.deepEqual(retained.getAll('type'), custom.getAll('type'));
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, widths, propertyRequests: requests.length, screenshots: output }));
  } finally {
    await browser?.close();
    await vite.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
