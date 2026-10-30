// Isolated end-to-end verification: real application + authenticated backend +
// real PostgreSQL migrations. Never contacts a live payment gateway or database.
process.env.SUPABASE_URL = 'https://isolated-plan-browser.example.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'isolated-browser-test-key';
process.env.JWT_SECRET = 'isolated-service-plan-browser-secret-over-32-characters';
const fs = require('node:fs'); const path = require('node:path');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const express = require('express'); const jwt = require('jsonwebtoken');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { connectBillingDatabase } = require('./helpers/billingDatabase');
const { createTierDatabase } = require('./helpers/tierDatabase');
const { supabase } = require('../config/supabase');
const { getJwtConfig } = require('../services/authSessionService');
const adminPlans = require('../services/adminPlanService');
const paymentService = require('../services/paymentService');

(async () => {
  const db = await createTierDatabase(); const restore = connectBillingDatabase(supabase, db);
  const originalPayment = { ...paymentService };
  Object.assign(paymentService, paymentService.createPaymentService(undefined, { availability: () => ({ available: true }) }));
  const out = path.resolve(__dirname, '../../.local/service-plans-verification'); fs.mkdirSync(out, { recursive: true });
  let browser, server, vite; const checks = []; const errors = [];
  try {
    await db.exec("INSERT INTO users(id,name,role) VALUES(2,'Admin User','ADMIN'),(9,'Test Agent','AGENT')");
    const sessions = {};
    for (const id of [2,9]) {
      const sid = randomUUID(); await db.query("INSERT INTO auth_sessions(id,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')", [sid, id]);
      const { secret, issuer, audience } = getJwtConfig();
      sessions[id] = jwt.sign({ token_use: 'access', sid }, secret, { algorithm: 'HS256', subject: String(id), issuer, audience, expiresIn: '1h' });
    }
    let loginId = 2;
    const user = async () => (await db.query('SELECT * FROM users WHERE id=$1', [loginId])).rows[0];
    const app = express(); app.use(express.json());
    app.post('/api/auth/refresh', async (_req,res) => res.json({ user: await user(), accessToken: sessions[loginId] }));
    app.use('/api/admin', require('../routes/adminRoutes'));
    app.use('/api/payments', require('../routes/paymentRoutes'));
    app.use('/api/subscriptions', require('../routes/subscriptionRoutes'));
    app.get('/api/agent/overview', async (_req,res) => res.json({ agent: await user(), activeListings: [], totalProperties: 0, totalViews: 0, totalFavorites: 0 }));
    app.use('/api', (_req,res) => res.json({ verifications: [], properties: [], conversations: [], stats: {}, violations: [] }));
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`; process.env.VITE_API_URL = base;
    const { createServer } = await import('vite');
    vite = await createServer({ root: path.resolve(__dirname, '../..'), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
    app.use(vite.middlewares);
    app.use(async (_req,res) => res.type('html').send(await vite.transformIndexHtml('/', '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/server/tests/fixtures/sessionPreview.jsx"></script></body></html>')));
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
    const page = await browser.newPage({ viewport: { width: 1536, height: 1100 } });
    page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/admin'); await page.getByRole('button', { name: 'Gói dịch vụ & Giá bán', exact: true }).click();
    await page.getByRole('heading', { name: 'Quản lý gói dịch vụ', exact: true }).waitFor();
    await page.getByLabel('Giá bán mới').waitFor();
    assert.equal(Math.round(await page.locator('.admin-sidebar').evaluate(element => element.getBoundingClientRect().width)), 238);
    assert.equal(await page.getByRole('button', { name: 'Gói dịch vụ & Giá bán', exact: true }).getAttribute('aria-current'), 'page');
    await page.getByRole('button', { name: 'Help Center', exact: true }).click();
    await page.getByRole('dialog', { name: 'Trợ giúp quản trị', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Đóng', exact: true }).click();
    assert.equal(await page.getByLabel('Giá bán mới').inputValue(), '349000');
    assert.equal(await page.locator('.service-plan-item').count(), 3);
    await page.screenshot({ path: path.join(out, 'admin-plans-desktop.png'), fullPage: true });
    checks.push('Admin shell loads three real catalog rows and current PostgreSQL price');
    await page.getByLabel('Giá bán mới').fill('1500000');
    await page.getByLabel('Chu kỳ thanh toán').selectOption('3');
    await page.getByLabel('Lý do thay đổi').fill('Điều chỉnh giá theo chính sách mới');
    await page.getByRole('button', { name: 'Lưu cấu hình mới', exact: true }).click();
    await page.getByRole('dialog', { name: 'Xác nhận thay đổi gói' }).waitFor();
    assert.equal((await db.query("SELECT amount_vnd FROM agent_billing_plans WHERE code='LITE'")).rows[0].amount_vnd, 349000);
    await page.getByRole('button', { name: 'Xác nhận lưu', exact: true }).click();
    await page.getByText('Đã lưu cấu hình mới.', { exact: true }).waitFor();
    assert.equal((await db.query("SELECT amount_vnd,duration_months FROM agent_billing_plans WHERE code='LITE'")).rows[0].amount_vnd, 1500000);
    checks.push('Explicit confirmation → authenticated Admin RPC → atomic price and audit update');
    await page.getByRole('button', { name: 'Xem trang Agent', exact: true }).click();
    const preview = page.getByRole('dialog', { name: 'Trang gói dịch vụ dành cho Agent' });
    await preview.waitFor(); assert.equal(await preview.locator('.pricing-card').count(), 3);
    assert.ok((await preview.textContent()).includes('1.500.000'));
    await preview.getByRole('button', { name: 'Đóng', exact: true }).click();
    await page.getByLabel('Giá bán mới').fill('1800000');
    await page.getByRole('radio', { name: /Lên lịch thay đổi/ }).check();
    const scheduleTime = new Date(Date.now() + 8 * 3600000).toISOString().slice(0,16);
    await page.getByLabel(/Ngày giờ Việt Nam/).fill(scheduleTime);
    await page.getByLabel('Lý do thay đổi').fill('Áp dụng bảng giá vào ngày tiếp theo');
    await page.getByRole('button', { name: 'Lưu cấu hình mới', exact: true }).click();
    await page.getByRole('button', { name: 'Xác nhận lưu', exact: true }).click();
    await page.getByText('Có lịch thay đổi đang chờ', { exact: true }).waitFor();
    assert.equal((await db.query("SELECT amount_vnd FROM agent_billing_plans WHERE code='LITE'")).rows[0].amount_vnd, 1500000);
    assert.equal(await page.getByLabel('Giá bán mới').isDisabled(), true);
    await page.getByRole('button', { name: 'Hủy lịch này', exact: true }).click();
    await page.getByLabel('Lý do hủy').fill('Chưa triển khai mức giá dự kiến');
    await page.getByRole('button', { name: 'Xác nhận lưu', exact: true }).click();
    await page.getByText('Đã hủy lịch thay đổi.', { exact: true }).waitFor();
    checks.push('Scheduled Vietnam-time price remains pending; cancellation restores editing without changing current price');
    const version = (await db.query("SELECT version FROM agent_billing_plans WHERE code='LITE'")).rows[0].version;
    await adminPlans.change(2, { planCode: 'LITE', action: 'SAVE', requestId: randomUUID(), expectedVersion: version,
      amount: 2000000, durationMonths: 3, active: true, reason: 'Một Admin khác cập nhật giá', effectiveAt: null });
    await page.getByLabel('Giá bán mới').fill('1700000'); await page.getByLabel('Lý do thay đổi').fill('Thử lưu phiên bản cấu hình cũ');
    await page.getByRole('button', { name: 'Lưu cấu hình mới', exact: true }).click();
    await page.getByRole('button', { name: 'Xác nhận lưu', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.equal((await db.query("SELECT amount_vnd FROM agent_billing_plans WHERE code='LITE'")).rows[0].amount_vnd, 2000000);
    assert.equal(await page.getByLabel('Giá bán mới').inputValue(), '1700000');
    await page.getByRole('button', { name: 'Làm mới cấu hình', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('service-price')?.value === '2000000');
    checks.push('Stale Admin edit gets 409 and retains draft; refresh obtains current DB version');
    await page.getByRole('button', { name: 'Lịch sử thay đổi', exact: true }).click();
    await page.locator('.service-history tbody tr').first().waitFor();
    assert.equal(await page.locator('.service-history tbody tr').count(), 4);
    await page.screenshot({ path: path.join(out, 'admin-plans-history.png'), fullPage: true });
    for (const width of [768,390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal overflow at ${width}px`);
      assert.ok(await page.locator('.service-workspace').evaluate(element => element.getBoundingClientRect().width >= 320));
      await page.screenshot({ path: path.join(out, `admin-plans-${width}.png`), fullPage: true });
    }
    checks.push('Audit history reads actual persisted rows; tablet/mobile layout stays readable without page overflow');
    loginId = 9; await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(base + '/sale/overview?tab=pricing');
    await page.locator('.pricing-card').filter({has:page.getByRole('heading',{name:'Lite',exact:true})}).getByRole('button', { name: 'Thanh toán bằng payOS', exact: true }).waitFor();
    assert.ok((await page.locator('.pricing-card').filter({has:page.getByRole('heading',{name:'Lite',exact:true})}).textContent()).includes('2.000.000'));
    await page.locator('.pricing-card').filter({has:page.getByRole('heading',{name:'Lite',exact:true})}).getByRole('button', { name: 'Thanh toán bằng payOS', exact: true }).click();
    const orderDialog = page.getByRole('dialog', { name: 'Xác nhận thanh toán', exact: true });
    await orderDialog.waitFor(); assert.ok((await orderDialog.textContent()).includes('2.000.000'));
    await orderDialog.getByRole('button', { name: 'Quay lại', exact: true }).click();
    await page.screenshot({ path: path.join(out, 'agent-updated-price.png'), fullPage: true });
    checks.push('Agent sees saved DB amount and duration and must confirm before creating an order');
    assert.deepEqual(errors, []);
    const report = { checks, errors, database: 'isolated PostgreSQL', liveDataChanged: false };
    fs.writeFileSync(path.join(out, 'browser-results.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    if (browser) { const pages = browser.contexts().flatMap(context => context.pages()); if (pages[0]) await pages[0].screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {}); }
    throw error;
  } finally { await browser?.close(); await vite?.close(); if (server) await new Promise(resolve => server.close(resolve)); restore(); Object.assign(paymentService, originalPayment); await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
