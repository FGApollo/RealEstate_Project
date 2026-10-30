// Layout fixtures exist only in this isolated test server. Production APIs and
// database records are never changed by this audit.
process.env.SUPABASE_URL = 'https://mobile-layout.example.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'isolated-mobile-layout-test-key';
process.env.JWT_SECRET = 'isolated-mobile-layout-jwt-secret-over-32-bytes';
const fs = require('node:fs'); const path = require('node:path');
const assert = require('node:assert/strict'); const { randomUUID } = require('node:crypto');
const express = require('express'); const jwt = require('jsonwebtoken');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { connectBillingDatabase } = require('./helpers/billingDatabase');
const { createTierDatabase } = require('./helpers/tierDatabase');
const { supabase } = require('../config/supabase');
const { getJwtConfig } = require('../services/authSessionService');
const { createPaymentService } = require('../services/paymentService');
const paymentService = require('../services/paymentService');

(async () => {
  const db = await createTierDatabase(); const restore = connectBillingDatabase(supabase, db);
  const originalPayment = { ...paymentService };
  Object.assign(paymentService, createPaymentService(undefined, { availability: () => ({ available: false, reason: 'Thanh toán chưa sẵn sàng trong môi trường kiểm thử.' }) }));
  const out = path.resolve(__dirname, '../../.local/mobile-verification'); fs.mkdirSync(out, { recursive: true });
  let server, vite, browser; let loginId = null; const sessions = {}; const results = []; const runtimeErrors = [];
  const image = '/auth-welcome.png';
  const properties = [1,2,3].map(id => ({ id, owner_id: 9, title: `Căn hộ ${id} tại khu đô thị, không gian sống tiện nghi dành cho gia đình`,
    description: 'Căn hộ nhiều ánh sáng, đầy đủ nội thất, gần trường học và các tiện ích. '.repeat(6),
    price: 15000000 + id * 1000000, area: 75, bedrooms: 2, bathrooms: 2, property_type: 'Căn Hộ', listing_type: 'RENT',
    city: 'TP. Hồ Chí Minh', district: 'Quận 1', ward: 'Phường Bến Nghé', address: 'Phường Bến Nghé, TP. Hồ Chí Minh',
    thumbnail: image, status: 'AVAILABLE', is_hidden: false, views: 32, favorites_count: 5,
    created_at: new Date().toISOString(), property_images: [{ image_url: image }], property_features: [{ feature_name: 'Ban công' }],
    lifestyle_tags: [], owner: { id: 9, name: 'Môi giới kiểm thử', verification_status: 'VERIFIED', trust_score: 85 } }));
  const preferenceOptions = { property_types: [{ key: 'CAN_HO', label: 'Căn hộ' }, { key: 'PHONG_TRO', label: 'Phòng trọ' }],
    locations: [{ key: 'hcm', label: 'TP. Hồ Chí Minh' }], features: [{ key: 'BALCONY', label: 'Ban công' }] };
  try {
    await db.exec("INSERT INTO users(id,name,email,role,phone,phone_verified,verification_status) VALUES(1,'Khách hàng có tên dài để kiểm tra giao diện','customer@example.test','USER','0901234567',true,'VERIFIED'),(2,'Admin User','admin@example.test','ADMIN','0901234568',true,'VERIFIED'),(9,'Môi giới chuyên nghiệp tên dài','agent@example.test','AGENT','0901234569',true,'VERIFIED')");
    for (const id of [1,2,9]) {
      const sid = randomUUID(); await db.query("INSERT INTO auth_sessions(id,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')", [sid,id]);
      const { secret, issuer, audience } = getJwtConfig();
      sessions[id] = jwt.sign({ token_use: 'access', sid }, secret, { algorithm: 'HS256', subject: String(id), issuer, audience, expiresIn: '1h' });
    }
    const current = async () => loginId ? (await db.query('SELECT * FROM users WHERE id=$1', [loginId])).rows[0] : null;
    const app = express(); app.use(express.json());
    app.post('/api/auth/refresh', async (_req,res) => loginId ? res.json({ user: await current(), accessToken: sessions[loginId] }) : res.status(401).json({ error: 'Guest fixture' }));
    app.get('/api/me/preferences', (_req,res) => res.json({ preferences: { onboarding_completed: true, preferred_property_types: ['CAN_HO'], preferred_features: [] } }));
    app.get('/api/me/preference-options', (_req,res) => res.json({ options: preferenceOptions }));
    app.get('/api/users/profile', async (_req,res) => res.json({ user: await current() }));
    app.get('/api/admin/kyc/rejected', (_req,res) => res.json([]));
    app.get('/api/admin/reviews', (_req,res) => res.json([]));
    app.get('/api/admin/trust-score-logs', (_req,res) => res.json({ logs: [], stats: { totalLogs: 0, totalBonus: 0, totalPenalty: 0, totalRefund: 0 }, pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } }));
    app.get('/api/reports/admin', (_req,res) => res.json([])); app.get('/api/appeals/admin', (_req,res) => res.json([]));
    app.get('/api/appeals/my-violations', (_req,res) => res.json({ violations: [], total: 0, trustScore: 85 }));
    app.get('/api/kyc/status', (_req,res) => res.json({ hasCardUploaded: true, isVerified: true, verification_status: 'VERIFIED', latestVerificationStatus: 'APPROVED' }));
    app.get('/api/agent/overview', async (_req,res) => res.json({ agent: await current(), activeListings: properties, totalProperties: 3, totalViews: 96, totalFavorites: 15 }));
    app.get('/api/agent/reviews', (_req,res) => res.json([]));
    app.get('/api/chat/funnel/stats', (_req,res) => res.json({ AWARENESS: 2, CONSIDERATION: 1, INTENT: 1, ACTION: 1 }));
    app.get('/api/chat/conversations', async (_req,res) => res.json({ conversations: [{ partner: { id: loginId === 9 ? 1 : 9,
      name: 'Người liên hệ có tên dài, chuyên viên tư vấn bất động sản', email: 'long-contact-name@example.test', role: loginId === 9 ? 'USER' : 'AGENT', phone: '0901234567' },
      lastMessage: 'Tôi muốn tìm hiểu thêm thông tin và đặt lịch xem căn hộ vào cuối tuần.', lastMessageTime: new Date().toISOString(), unreadCount: 1,
      property: properties[0], funnelStage: 'AWARENESS' }] }));
    app.get('/api/chat/messages', (_req,res) => res.json({ messages: [{ id: 1, sender_id: loginId === 9 ? 1 : 9, receiver_id: loginId,
      message: 'Tin nhắn kiểm tra nội dung dài trên màn hình nhỏ. '.repeat(8), property_id: 1, property: properties[0], created_at: new Date().toISOString(), attachments: [], is_read: false }] }));
    app.post('/api/chat/read', (_req,res) => res.json({ success: true }));
    app.get('/api/favorites', (_req,res) => res.json({ favorites: properties.map(item => ({ ...item, favorite_id: item.id })) }));
    app.get('/api/recommendations', (_req,res) => res.json({ properties, pagination: { offset: 0, hasMore: false, feedToken: null } }));
    app.get('/api/properties', (_req,res) => res.json({ properties }));
    app.get('/api/properties/:id/reviews', (_req,res) => res.json({ reviews: [], averageRating: 0, totalReviews: 0 }));
    app.get('/api/properties/:id/similar', (_req,res) => res.json({ properties }));
    app.get('/api/properties/:id', (req,res) => res.json({ property: properties.find(item => item.id === Number(req.params.id)) || properties[0] }));
    app.use('/api/payments', require('../routes/paymentRoutes')); app.use('/api/subscriptions', require('../routes/subscriptionRoutes'));
    app.use('/api/admin', require('../routes/adminRoutes')); app.use('/api', (_req,res) => res.json({ success: true, data: [], stats: {} }));
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`; process.env.VITE_API_URL = base;
    const { createServer } = await import('vite'); vite = await createServer({ root: path.resolve(__dirname,'../..'), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
    app.use(vite.middlewares); app.use(async (_req,res) => res.type('html').send(await vite.transformIndexHtml('/', '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/server/tests/fixtures/sessionPreview.jsx"></script></body></html>')));
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
    const page = await browser.newPage(); page.setDefaultTimeout(8000);
    page.on('pageerror', error => runtimeErrors.push({ path: page.url(), error: error.message }));
    await page.route('**/*', route => route.request().url().startsWith(base) || route.request().url().startsWith('data:') ? route.continue() : route.abort());
    const inspect = async (name, width) => {
      await page.waitForFunction(() => !document.querySelector('.page-loading, .auth-loading') && document.getElementById('root')?.textContent?.trim().length > 20);
      await page.evaluate(() => window.scrollTo(0,0));
      await page.waitForTimeout(180);
      const metrics = await page.evaluate(() => {
        const visible = element => { const s = getComputedStyle(element); const r = element.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
        const nodes = [...document.querySelectorAll('body *')].filter(visible);
        const outside = nodes.filter(element => { const r = element.getBoundingClientRect(); return r.right > innerWidth + 2 && r.width > 30; }).slice(0,12)
          .map(element => ({ selector: element.tagName.toLowerCase() + '.' + String(element.className).replaceAll(' ','.'), width: Math.round(element.getBoundingClientRect().width), right: Math.round(element.getBoundingClientRect().right) }));
        const main = document.querySelector('.agent-dashboard > .main-content, .admin-main');
        return { width: innerWidth, pageWidth: document.documentElement.scrollWidth, mainWidth: main ? Math.round(main.getBoundingClientRect().width) : null, outside,
          heading: document.querySelector('h1,h2')?.textContent?.trim(), bodyHeight: document.body.scrollHeight };
      });
      const result = { name, width, url: new URL(page.url()).pathname, ...metrics, okay: metrics.pageWidth <= width + 1 && (metrics.mainWidth == null || metrics.mainWidth >= Math.min(320,width - 24)) };
      results.push(result); console.log(JSON.stringify({ name, width, pageWidth: result.pageWidth, mainWidth: result.mainWidth, okay: result.okay }));
      if (width === 390 || !result.okay) await page.screenshot({ path: path.join(out, `${name}-${width}.png`), fullPage: true });
    };
    const widths = (process.env.MOBILE_WIDTHS || '320,360,390,430,768').split(',').map(Number);
    for (const width of widths) {
      await page.setViewportSize({ width, height: width === 768 ? 1024 : 844 });
      if (process.env.MOBILE_INTERACTIONS_ONLY) {
        loginId = 1;
        await page.goto(base + '/swipe/T%E1%BA%A5t%20c%E1%BA%A3');
        await page.locator('.swipe-filter-pill').click(); await inspect('swipe-filters',width);
        await page.locator('.filter-modal-content .modal-close-btn').click();
        await page.getByRole('button',{name:'Mở menu',exact:true}).click();
        await page.getByRole('dialog',{name:'Menu điều hướng',exact:true}).getByRole('button',{name:'Yêu thích',exact:true}).click();
        await page.locator('.saved-property-card').first().waitFor(); await inspect('favorites',width);
        await page.goto(base + '/'); await page.getByRole('button',{name:'Tìm kiếm hoặc bộ lọc',exact:true}).click();
        await page.locator('.home-filter-modal-content').waitFor(); await inspect('home-filters',width);
        await page.locator('.home-filter-modal-content .modal-close-btn').click();
        await page.goto(base + '/chat');
        await page.locator('.conversation-item').first().waitFor({state:'attached'});
        if (await page.locator('.chat-sidebar').isVisible()) await page.locator('.conversation-item').first().click();
        await page.setViewportSize({width,height:420}); await page.waitForTimeout(100);
        assert.ok(await page.locator('.message-input-form').evaluate(element=>element.getBoundingClientRect().bottom<=innerHeight+1));
        await inspect('chat-short-viewport',width);
        loginId=9; await page.setViewportSize({width,height:844}); await page.goto(base+'/sale/overview');
        await page.getByRole('button',{name:'Mở menu môi giới',exact:true}).click(); await inspect('agent-menu',width);
        await page.locator('.sidebar-nav').getByRole('button',{name:'Tin nhắn',exact:true}).click();
        await page.locator('.conv-card').first().click();
        await page.setViewportSize({width,height:420}); await page.waitForTimeout(100);
        assert.ok(await page.locator('.agent-chat-input-form').evaluate(element=>element.getBoundingClientRect().bottom<=innerHeight+1));
        assert.ok(await page.locator('.agent-chat-input-form input[type=text]').evaluate(element=>element.getBoundingClientRect().width>=100));
        await inspect('agent-chat-short-viewport',width);
        await page.getByRole('button',{name:'Quay lại danh sách hội thoại',exact:true}).click();
        assert.equal(await page.locator('.agent-chat-sidebar').isVisible(),true);
        continue;
      }
      loginId = null;
      for (const [name, url] of [['login','/login'],['register','/register'],['agent-login','/login/agent'],['agent-register','/register/agent'],['verify-email','/verify-email'],['resend-verification','/resend-verification'],['forgot-password','/forgot-password'],['not-found','/missing-page'],['home-guest','/']]) {
        await page.goto(base + url); await inspect(name,width);
        if (name === 'home-guest') {
          await page.getByRole('button',{name:'Mở menu',exact:true}).click();
          await page.getByRole('dialog',{name:'Menu điều hướng',exact:true}).waitFor(); await inspect('customer-menu',width);
          await page.keyboard.press('Escape');
          assert.equal(await page.getByRole('dialog',{name:'Menu điều hướng',exact:true}).count(), 0);
        }
      }
      loginId = 1;
      for (const [name,url] of [['home-user','/'],['swipe','/swipe/T%E1%BA%A5t%20c%E1%BA%A3'],['profile','/profile'],['onboarding','/onboarding?edit=1'],['chat-inbox','/chat']]) {
        await page.goto(base + url); await inspect(name,width);
        if (name === 'chat-inbox') {
          if (await page.locator('.chat-sidebar').isVisible()) await page.locator('.chat-sidebar .conversation-item').first().click(); await inspect('chat-thread',width);
          if (width === 390) {
            await page.setViewportSize({ width, height: 420 });
            await page.waitForTimeout(100);
            assert.ok(await page.locator('.message-input-form').evaluate(element => element.getBoundingClientRect().bottom <= innerHeight + 1));
            await inspect('chat-short-viewport',width);
            await page.setViewportSize({ width, height: 844 });
          }
        }
        if (name === 'profile') { await page.getByRole('button',{name:'Bảo mật & Mật khẩu',exact:true}).click(); await inspect('profile-password',width); }
        if (name === 'swipe') {
          await page.getByRole('button',{name:/Bộ lọc/}).first().click().catch(() => {});
          if (await page.locator('.modal-backdrop').count()) { await inspect('swipe-filters',width); await page.keyboard.press('Escape'); }
        }
      }
      await page.goto(base + '/?propertyId=1'); await page.locator('.detail-modal-content').waitFor(); await inspect('property-detail',width);
      loginId = 9; await page.goto(base + '/sale/overview'); await page.locator('.sidebar-nav').waitFor({ state: 'attached' }); await inspect('agent-overview',width);
      for (const [name,label] of [['agent-listings','Bất động sản'],['agent-chat','Tin nhắn'],['agent-analytics','Phân tích'],['agent-feedback','Đánh giá'],['agent-violations','Vi phạm & Khiếu nại'],['agent-profile','Hồ sơ cá nhân']]) {
        await page.getByRole('button',{name:'Mở menu môi giới',exact:true}).click();
        await page.locator('.sidebar-nav').getByRole('button',{name:label,exact:true}).click(); await inspect(name,width);
        if (name === 'agent-chat') {
          await page.locator('.conv-card').first().click(); await inspect('agent-chat-thread',width);
          assert.ok(await page.locator('.agent-chat-input-form input[type=text]').evaluate(element => element.getBoundingClientRect().width >= 100));
          if (width === 390) {
            await page.setViewportSize({ width, height: 420 }); await page.waitForTimeout(100);
            assert.ok(await page.locator('.agent-chat-input-form').evaluate(element => element.getBoundingClientRect().bottom <= innerHeight + 1));
            await inspect('agent-chat-short-viewport',width); await page.setViewportSize({ width, height: 844 });
          }
          await page.getByRole('button',{name:'Quay lại danh sách hội thoại',exact:true}).click();
          assert.equal(await page.locator('.agent-chat-sidebar').isVisible(), true);
        }
        if (name === 'agent-listings') {
          await page.getByTitle('Xem chi tiết',{exact:true}).first().click(); await inspect('agent-property-detail',width);
          await page.locator('.detail-modal-content .modal-close-btn').click();
          await page.getByTitle('Chỉnh sửa',{exact:true}).first().click(); await inspect('edit-listing',width);
          await page.getByRole('button',{name:'Mở menu môi giới',exact:true}).click();
          await page.locator('.sidebar-nav').getByRole('button',{name:'Bất động sản',exact:true}).click();
          await page.getByText('Tạo tin đăng mới',{exact:true}).click(); await inspect('create-listing-info',width);
          await page.getByRole('button',{name:'Tiếp theo',exact:true}).click(); await inspect('create-listing-photos',width);
          await page.locator('input[type=file]').setInputFiles({ name: 'layout.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWEcAAAAASUVORK5CYII=', 'base64') });
          await page.getByRole('button',{name:'Tiếp theo',exact:true}).click(); await inspect('create-listing-review',width);
        }
      }
      await page.goto(base + '/sale/overview?tab=pricing'); await page.getByRole('heading',{name:'Gói dịch vụ & thanh toán',exact:true}).waitFor(); await inspect('agent-pricing',width);
      await page.goto(base + '/sale/payment/00000000-0000-4000-8000-000000000001'); await inspect('agent-payment-error',width);
      loginId = 2; await page.goto(base + '/admin'); await page.locator('.admin-nav-section').waitFor({ state: 'attached' }); await inspect('admin-accounts',width);
      for (const [name,label] of [['admin-reports','Kiểm duyệt báo cáo'],['admin-reviews','Kiểm duyệt đánh giá'],['admin-appeals','Xử lý khiếu nại'],['admin-audit','Nhật ký điểm uy tín'],['admin-plans','Gói dịch vụ & Giá bán'],['admin-analytics','Thống kê & Báo cáo']]) {
        await page.getByRole('button',{name:'Mở menu quản trị',exact:true}).click();
        await page.locator('.admin-nav-section').getByRole('button',{name:label,exact:true}).click(); await inspect(name,width);
        if (name === 'admin-audit') { await page.getByRole('button',{name:'Điều chỉnh điểm thủ công',exact:true}).click(); await inspect('admin-adjust-dialog',width); await page.locator('.admin-adjust-modal .admin-modal-close-btn').click(); }
        if (name === 'admin-plans') { await page.getByRole('button',{name:'Xem trang Agent',exact:true}).click(); await inspect('admin-agent-preview',width); await page.getByRole('dialog').getByRole('button',{name:'Đóng',exact:true}).click(); }
        if (name === 'admin-analytics') for (const [section,tab] of [['users','Người dùng'],['subscriptions','Gói dịch vụ'],['revenue','Doanh thu'],['transactions','Giao dịch']]) {
          await page.getByRole('tab',{name:tab,exact:true}).click(); await inspect(`admin-analytics-${section}`,width);
        }
      }
    }
    // Lost mobile chunk: the page has a recovery action rather than going blank.
    loginId = 1;
    const recovery = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await recovery.route('**/src/pages/UserProfile.jsx*', route => route.abort());
    await recovery.goto(base + '/profile');
    await recovery.getByRole('heading',{name:'Chưa thể mở trang',exact:true}).waitFor();
    assert.equal(await recovery.getByRole('button',{name:'Tải lại trang',exact:true}).isVisible(), true);
    await recovery.close();
    const report = { mode: process.env.MOBILE_AUDIT_ONLY ? 'audit' : 'verify', results, runtimeErrors, fixtureDataOnly: true,
      recoveryUiVerified: true };
    fs.writeFileSync(path.join(out, process.env.MOBILE_RESULT_TAG ? `${process.env.MOBILE_RESULT_TAG}.json` : process.env.MOBILE_AUDIT_ONLY ? 'before.json' : 'results.json'), JSON.stringify(report,null,2));
    if (!process.env.MOBILE_AUDIT_ONLY) { assert.deepEqual(results.filter(result => !result.okay), [], 'All screens must fit without squeezing their content'); assert.deepEqual(runtimeErrors, []); }
  } finally { await browser?.close(); await vite?.close(); if (server) await new Promise(resolve => server.close(resolve)); restore(); Object.assign(paymentService,originalPayment); await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
