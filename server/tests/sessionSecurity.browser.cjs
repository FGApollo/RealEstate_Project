// Browser UI regression uses the real App/AuthProvider with isolated HTTP fixtures.
// Backend credential/permission behavior is tested separately with real JWTs/SQL.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const express = require('express');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

(async () => {
  const app = express();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  process.env.VITE_API_URL = base;
  let browser;
  let vite;
  const out = path.resolve(__dirname, '../../.local/security-review');
  fs.mkdirSync(out, { recursive: true });
  try {
    const { createServer } = await import('vite');
    vite = await createServer({ root: path.resolve(__dirname, '../..'), server: { middlewareMode: true }, appType: 'custom' });
    app.use(vite.middlewares);
    app.use(async (_req, res) => res.type('html').send(await vite.transformIndexHtml('/', '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/server/tests/fixtures/sessionPreview.jsx"></script></body></html>')));
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
    const checks = [];
    const errors = [];
    for (const [role, expected] of [['ADMIN', '/admin'], ['AGENT', '/sale/overview'], ['USER', '/']]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(`${role}: ${error.message}`));
      let loggedIn = true;
      let currentRole = role;
      let refreshes = 0;
      let allowApi = true;
      let submittedEvidence;
      let favoriteMutations = 0;
      const evidenceReference = 'evidence/9001/00000000-0000-0000-0000-000000000000.png';
      const evidencePreview = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ+QAAAAASUVORK5CYII=';
      page.on('dialog', (dialog) => dialog.accept());
      const user = () => ({ id: 9001, name: `Isolated ${currentRole}`, email: 'fixture@example.test', role: currentRole, is_active: true, phone_verified: true, trust_score: 50 });
      await page.route('**/api/**', async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        let status = 200;
        let body = {};
        if (pathname === '/api/login') {
          loggedIn = true;
          body = { user: user(), accessToken: `fixture-login-${currentRole}` };
        } else if (pathname === '/api/auth/refresh') {
          refreshes += 1;
          await new Promise((resolve) => setTimeout(resolve, 80));
          status = loggedIn ? 200 : 401;
          body = loggedIn ? { user: user(), accessToken: `fixture-${currentRole}-${refreshes}` } : {};
        } else if (pathname === '/api/auth/logout') {
          assert.ok(route.request().headers().authorization?.startsWith('Bearer '));
          loggedIn = false;
        } else if (pathname === '/api/me/preferences') body = { preferences: { onboarding_completed: true } };
        else if (pathname.includes('/kyc/')) body = [];
        else if (pathname === '/api/properties') body = { properties: [], total: 0 };
        else if (pathname.includes('/recommendations')) body = { properties: [], hasMore: false };
        else if (pathname.includes('/favorites')) { body = { favorites: [] }; if (route.request().method() === 'POST') favoriteMutations++; }
        else if (pathname.includes('/conversations')) body = { conversations: [] };
        else if (pathname === '/api/agent/overview') body = { agent: user(), activeListings: [], totalProperties: 0, totalViews: 0, totalFavorites: 0 };
        else if (pathname.includes('/stats')) body = { stats: {} };
        else if (pathname.includes('/properties')) body = { properties: [] };
        else if (pathname.includes('/violations')) body = { violations: [] };
        else if (pathname.includes('/profile')) body = { user: user() };
        else if (pathname === '/api/appeals/my-violations') body = { violations: [{ id: 7, reason: 'WRONG_PRICE', status: 'RESOLVED', created_at: '2026-10-16', property: { id: 4, title: 'Isolated listing', is_hidden: true } }] };
        else if (pathname === '/api/appeals/upload-evidence') body = { success: true, files: [{ reference: evidenceReference, previewUrl: evidencePreview }] };
        else if (pathname === '/api/appeals') { submittedEvidence = route.request().postDataJSON(); body = { success: true }; }
        else if (pathname === '/api/__protected_probe') status = allowApi ? 200 : 401;
        await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      });
      await page.addInitScript(() => {
        localStorage.setItem('user', JSON.stringify({ id: 666, name: 'Forged Admin', role: 'ADMIN' }));
        localStorage.setItem('swipeHistory', JSON.stringify([{ title: 'Another account history' }]));
        window.customerHomeMounted = false;
        new MutationObserver(() => {
          if (document.querySelector('.home-container')) window.customerHomeMounted = true;
        }).observe(document, { subtree: true, childList: true });
      });
      await page.goto(base);
      await page.waitForURL(`${base}${expected}`);
      const accountVisible = () => role === 'AGENT'
        ? page.getByRole('heading', { name: `Xin chào, Isolated ${role}`, exact: true })
        : page.getByText(`Isolated ${role}`, { exact: true }).first();
      await accountVisible().waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('user')), null);
      assert.equal(await page.evaluate(() => localStorage.getItem('swipeHistory')), null);
      if (role !== 'USER') assert.equal(await page.evaluate(() => window.customerHomeMounted), false);
      await page.reload();
      await page.waitForURL(`${base}${expected}`);
      await accountVisible().waitFor();
      checks.push(`${role}: reopen/reload routes to ${expected}; forged storage ignored`);
      if (role === 'AGENT') {
        await page.getByRole('button', { name: 'Vi phạm & Khiếu nại' }).click();
        await page.getByRole('button', { name: 'Gửi Khiếu Nại / Kháng Cáo' }).click();
        await page.locator('input[type=file]').setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from(evidencePreview.split(',')[1], 'base64') });
        await page.locator('.v-upload-thumb-img').waitFor();
        assert.equal(await page.locator('.v-upload-thumb-img').getAttribute('src'), evidencePreview);
        assert.equal(await page.locator('input[type=url]').count(), 0);
        await page.locator('.v-textarea').fill('Isolated evidence regression');
        await page.getByRole('button', { name: 'Gửi đơn khiếu nại', exact: true }).click();
        await page.locator('.v-modal-overlay').waitFor({ state: 'hidden' });
        assert.deepEqual(submittedEvidence.evidenceUrls, [evidenceReference]);
        checks.push('Private evidence upload previews correctly and submits its own storage reference, without arbitrary external URL input');
      }
      if (role === 'ADMIN') {
        await page.screenshot({ path: path.join(out, 'restored-admin.png') });
        await page.goto(`${base}/login`);
        await page.waitForURL(`${base}/admin`);
        await page.goto(`${base}/profile`);
        await page.waitForURL(`${base}/admin`);
        checks.push('ADMIN cannot enter customer profile or authenticated login screen');
        currentRole = 'USER';
        await page.evaluate(async (apiBase) => {
          const { restoreSession } = await import('/src/auth/apiClient.js');
          await restoreSession();
          return apiBase;
        }, base);
        await page.waitForURL(`${base}/`);
        await page.getByRole('button', { name: 'Menu tài khoản' }).click();
        await page.getByRole('button', { name: 'Đăng xuất', exact: true }).first().click();
        await page.getByRole('button', { name: 'Đăng nhập', exact: true }).first().waitFor();
        await page.goBack();
        await page.goto(`${base}/admin`);
        await page.waitForURL(`${base}/login`);
        checks.push('Server role refresh updates guards immediately; logout clears session; back/protected URL requires login');
        await page.evaluate(async () => {
          const { savePendingAuthAction } = await import('/src/auth/pendingAuthAction.js');
          savePendingAuthAction({ type: 'FAVORITE_PROPERTY', propertyId: '4', returnTo: '/' });
        });
        currentRole = 'ADMIN';
        await page.locator('input[name=email]').fill('fixture@example.test');
        await page.locator('input[name=password]').fill('IsolatedPassword2026!');
        await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
        await page.waitForURL(`${base}/admin`);
        assert.equal(favoriteMutations, 0);
        assert.equal(await page.evaluate(async () => (await import('/src/auth/pendingAuthAction.js')).readPendingAuthAction()), null);
        checks.push('Actual Admin login form discards a stored customer favorite action and enters Admin without making that mutation');
        allowApi = false;
      }
      await context.close();
    }
    assert.deepEqual(errors, []);
    const report = { checks, errors, scope: 'Real frontend App/AuthProvider, isolated HTTP fixtures. Backend JWT/SQL checked in node tests.' };
    fs.writeFileSync(path.join(out, 'session-browser-results.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser?.close();
    await vite?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
