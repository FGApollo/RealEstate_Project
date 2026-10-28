process.env.SUPABASE_URL = 'https://payments.example.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'isolated-test-key';
process.env.JWT_SECRET = 'isolated-payment-test-secret-over-32-characters';
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const { PayOS } = require('@payos/node');
const { createPaymentService, transactionTime } = require('../services/paymentService');
const { createPayosService, frontendOrigin, checkoutUrl } = require('../services/payosService');
const { createAnalyticsDatabase, connectTestDatabase } = require('./helpers/analyticsDatabase');
const LINK = '1234567890abcdef1234567890abcdef';
let db;
const rpc = async (name, args) => (await db.query(`SELECT public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) AS data`, args)).rows[0].data;
const reserve = (userId = 9, requestId = randomUUID()) => rpc('reserve_agent_payment', [userId, 'PAID', requestId]);
const settle = (order, amount = order.amount_vnd, link = LINK) => rpc('settle_agent_payment', [order.order_code, link, amount, new Date().toISOString(), 'test-reference']);
const row = async (id, userId) => (await db.query('SELECT * FROM agent_payment_orders WHERE id=$1 AND ($2::integer IS NULL OR user_id=$2)', [id, userId ?? null])).rows[0] || null;
const repo = {
  plans: async () => (await db.query('SELECT * FROM agent_billing_plans WHERE active')).rows,
  find: row,
  findByCode: async (code) => (await db.query('SELECT * FROM agent_payment_orders WHERE order_code=$1', [code])).rows[0] || null,
  reserve: (user, plan, request) => rpc('reserve_agent_payment', [user, plan, request]),
  claimSync: (id) => rpc('claim_agent_payment_sync', [id]),
  update: (order, provider, url, status) => rpc('update_agent_payment', [order.id, provider.id || provider.paymentLinkId, url, status]),
  settle: (order, provider, paidAt, reference) => rpc('settle_agent_payment', [order.order_code, provider.id, provider.amountPaid, paidAt, reference || null]),
  list: async (user, page, limit) => ({ items: (await db.query('SELECT * FROM agent_payment_orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3', [user, limit, (page - 1) * limit])).rows,
    total: Number((await db.query('SELECT count(*) n FROM agent_payment_orders WHERE user_id=$1', [user])).rows[0].n), page, limit })
};
function gateway(overrides = {}) {
  let snapshot;
  return {
    availability: () => ({ available: true }),
    create: async (order) => {
      snapshot = { id: LINK, orderCode: Number(order.order_code), amount: order.amount_vnd, status: 'PENDING', currency: 'VND' };
      return { ...snapshot, paymentLinkId: LINK, checkoutUrl: `https://pay.payos.vn/web/${LINK}` };
    },
    get: async () => ({ ...snapshot, status: 'PAID', amountPaid: snapshot.amount, amountRemaining: 0, transactions: [] }),
    cancel: async () => ({ ...snapshot, status: 'CANCELLED' }),
    verifyWebhook: async (body) => body.data,
    ...overrides
  };
}
before(async () => {
  db = await createAnalyticsDatabase();
  await db.exec("SET timezone='UTC'");
  await db.exec('CREATE SEQUENCE test_sub_id; ALTER TABLE seller_subscriptions ALTER COLUMN id SET DEFAULT nextval(\'test_sub_id\');');
  for (const file of ['014-agent-payos-payments.sql', '015-payos-revenue-analytics.sql']) {
    await db.exec(fs.readFileSync(path.join(__dirname, '../db-migration', file), 'utf8'));
  }
});
beforeEach(async () => {
  await db.exec(`TRUNCATE users CASCADE;
    INSERT INTO users(id,name,role) VALUES (1,'Customer','USER'),(2,'Admin','ADMIN'),(9,'Agent A','AGENT'),(10,'Agent B','AGENT');
    UPDATE agent_billing_plans SET amount_vnd=1000000,active=true;`);
});
after(async () => db?.close());

test('reservation is idempotent across retries/devices and price is an immutable DB snapshot', async () => {
  const id = randomUUID();
  const [a, b] = await Promise.all([reserve(9, id), reserve(9)]);
  assert.equal(a.id, b.id);
  await db.exec('UPDATE agent_billing_plans SET amount_vnd=2000000');
  const retry = await reserve(9, id);
  assert.equal(retry.amount_vnd, 1000000);
  assert.equal((await reserve(10)).amount_vnd, 2000000);
  assert.equal(Number((await db.query('SELECT count(*) n FROM agent_payment_orders')).rows[0].n), 2);
});
test('only active agents reserve orders; trial can only be granted once', async () => {
  await assert.rejects(reserve(1), /Agent unavailable/);
  await assert.rejects(reserve(2), /Agent unavailable/);
  await db.exec('UPDATE users SET is_active=false WHERE id=10');
  await assert.rejects(reserve(10), /Agent unavailable/);
  await rpc('start_agent_free_trial', [9]);
  await assert.rejects(rpc('start_agent_free_trial', [9]), /Trial already used/);
});
test('verified settlement grants exactly once, extends calendar month and keeps disabled accounts disabled', async () => {
  await db.exec(`INSERT INTO seller_subscriptions(user_id,plan_name,status,start_date,end_date) VALUES(9,'FREE_TRIAL','ACTIVE','2026-01-01','2099-01-31 10:00:00')`);
  const order = await reserve();
  await db.exec('UPDATE users SET is_active=false WHERE id=9');
  const first = await settle(order);
  const second = await settle(order);
  assert.equal(first.status, 'PAID');
  assert.equal(first.grant_end, second.grant_end);
  assert.match(first.grant_end, /^2099-02-28T10:00:00/);
  assert.equal((await db.query('SELECT plan_name FROM seller_subscriptions WHERE user_id=9')).rows[0].plan_name, 'PAID');
  assert.equal((await db.query('SELECT is_active FROM users WHERE id=9')).rows[0].is_active, false);
});
test('amount/link mismatches roll back without a subscription; late confirmed payment can settle cancelled order', async () => {
  const order = await reserve();
  await assert.rejects(settle(order, 1), /mismatch/);
  assert.equal(Number((await db.query('SELECT count(*) n FROM seller_subscriptions')).rows[0].n), 0);
  await rpc('update_agent_payment', [order.id, LINK, `https://pay.payos.vn/web/${LINK}`, 'CANCELLED']);
  await assert.rejects(settle(order, order.amount_vnd, 'abcdef1234567890abcdef1234567890'), /mismatch/);
  assert.equal((await settle(order)).status, 'PAID');
  assert.equal((await rpc('update_agent_payment', [order.id, LINK, null, 'EXPIRED'])).status, 'PAID');
});

test('two paid renewals add two months to the remaining trial and keep one current entitlement', async () => {
  const trial = await rpc('start_agent_free_trial', [9]);
  const a = await reserve(); const first = await settle(a);
  const b = await reserve(); const second = await settle(b, b.amount_vnd, 'abcdef1234567890abcdef1234567890');
  const expected = (await db.query("SELECT (($1::timestamp + interval '1 month') + interval '1 month') AT TIME ZONE 'UTC' AS expiry", [trial.end_date])).rows[0].expiry;
  assert.equal(new Date(second.grant_end).toISOString(), expected.toISOString());
  assert.ok(new Date(second.grant_end) > new Date(first.grant_end));
  assert.equal(Number((await db.query('SELECT count(*) n FROM seller_subscriptions WHERE user_id=9')).rows[0].n), 1);
  await assert.rejects(rpc('start_agent_free_trial', [9]), /Trial already used/);
});
test('expiry allows a new order; retrying old request never revives the expired bill', async () => {
  const request = randomUUID(); const order = await reserve(9, request);
  await db.query("UPDATE agent_payment_orders SET expires_at=now()-interval '1 minute' WHERE id=$1", [order.id]);
  assert.equal((await reserve(9, request)).status, 'EXPIRED');
  assert.notEqual((await reserve()).id, order.id);
});
test('new payment tables and every RPC deny anonymous/authenticated access', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    try {
      await assert.rejects(db.query('SELECT * FROM agent_payment_orders'), /permission denied/);
      await assert.rejects(db.query('SELECT * FROM agent_billing_plans'), /permission denied/);
      await assert.rejects(reserve(), /permission denied/);
      await assert.rejects(rpc('settle_agent_payment', [1000, LINK, 1, new Date().toISOString(), 'x']), /permission denied/);
      await assert.rejects(rpc('start_agent_free_trial', [9]), /permission denied/);
      await assert.rejects(rpc('admin_payment_revenue', ['2026-01-01', '2026-01-02', 'day', '2026-01-02T12:00:00Z']), /permission denied/);
    } finally { await db.exec('RESET ROLE'); }
  }
});
test('service ignores browser payment status, prevents IDOR and rejects client price/user injection', async () => {
  const pay = gateway(); const service = createPaymentService(repo, pay);
  const order = await service.create(9, { planCode: 'PAID', planVersion: 1, requestId: randomUUID() });
  assert.equal(order.status, 'PENDING');
  await assert.rejects(service.get(10, order.id), { statusCode: 404 });
  await assert.rejects(service.cancel(10, order.id), { statusCode: 404 });
  await assert.rejects(service.create(9, { planCode: 'PAID', planVersion: 1, requestId: randomUUID(), amount: 1 }), { statusCode: 400 });
  await assert.rejects(service.create(9, { planCode: 'PAID', planVersion: 1, requestId: randomUUID(), userId: 10 }), { statusCode: 400 });
  assert.equal((await row(order.id)).status, 'PENDING');
  assert.equal((await service.get(9, order.id)).status, 'PAID');
});
test('duplicate webhooks and polling settle only once; unknown confirmation samples are acknowledged', async () => {
  const service = createPaymentService(repo, gateway());
  const order = await service.create(9, { planCode: 'PAID', planVersion: 1, requestId: randomUUID() });
  const body = { data: { orderCode: order.orderCode, paymentLinkId: LINK, code: '00' } };
  await Promise.all([service.webhook(body), service.webhook(body)]);
  const first = await row(order.id);
  await service.webhook(body);
  assert.equal((await row(order.id)).grant_end.toISOString(), first.grant_end.toISOString());
  assert.deepEqual(await service.webhook({ data: { orderCode: 123, code: '00' } }), { received: true, ignored: true });
});
test('provider mismatch, underpayment, outages and forged webhook never activate', async () => {
  for (const remote of [{ amount: 1 }, { amountPaid: 1 }, { id: 'abcdef1234567890abcdef1234567890' }]) {
    await db.exec('TRUNCATE agent_payment_orders CASCADE');
    const base = gateway();
    const get = base.get;
    base.get = async () => ({ ...await get(), ...remote });
    const service = createPaymentService(repo, base);
    const order = await service.create(9, { planCode: 'PAID', planVersion: 1, requestId: randomUUID() });
    await assert.rejects(service.get(9, order.id));
    assert.equal((await row(order.id)).status, 'PENDING');
  }
  assert.equal(Number((await db.query('SELECT count(*) n FROM seller_subscriptions')).rows[0].n), 0);
  const service = createPaymentService(repo, gateway({ verifyWebhook: async () => { throw Object.assign(new Error('bad signature'), { statusCode: 400 }); } }));
  await assert.rejects(service.webhook({}), { statusCode: 400 });
});
test('ambiguous create response recovers the same order without a second reservation', async () => {
  const pay = gateway(); const create = pay.create;
  pay.create = async (order) => { await create(order); throw new Error('network interrupted'); };
  const service = createPaymentService(repo, pay);
  const order = await service.create(9, { planCode: 'PAID', planVersion: 1, requestId: randomUUID() });
  assert.equal(order.status, 'PAID');
  assert.equal(Number((await db.query('SELECT count(*) n FROM agent_payment_orders')).rows[0].n), 1);
});
test('real official SDK verifies signed webhooks and rejects tampering; missing keys fail closed', async () => {
  const env = { PAYOS_CLIENT_ID: 'test-client', PAYOS_API_KEY: 'test-api', PAYOS_CHECKSUM_KEY: 'test-checksum', FRONTEND_URL: 'https://frontend.example.test', PAYOS_ENABLED: 'true' };
  const sdk = new PayOS({ clientId: env.PAYOS_CLIENT_ID, apiKey: env.PAYOS_API_KEY, checksumKey: env.PAYOS_CHECKSUM_KEY });
  const data = { orderCode: 123456, amount: 1000000, currency: 'VND', code: '00', paymentLinkId: LINK };
  const signature = await sdk.crypto.createSignatureFromObj(data, env.PAYOS_CHECKSUM_KEY);
  const provider = createPayosService(env);
  assert.deepEqual(await provider.verifyWebhook({ data, signature }), data);
  await assert.rejects(provider.verifyWebhook({ data: { ...data, amount: 1 }, signature }), { statusCode: 400 });
  assert.equal(createPayosService({}).availability().available, false);
  await assert.rejects(createPayosService({}).verifyWebhook({}), { statusCode: 503 });
  await assert.rejects(createPayosService({}).create({}), { statusCode: 503 });
  assert.throws(() => frontendOrigin({ FRONTEND_URL: 'https://victim.example/path' }));
  assert.throws(() => checkoutUrl('https://pay.payos.vn.evil.example/web/' + LINK));
  assert.throws(() => checkoutUrl('javascript:alert(1)'));
  assert.equal(transactionTime('2026-10-17 01:00:00'), '2026-10-16T18:00:00.000Z');
});
test('real SQL revenue counts only verified PAID, reconciles charts and groups Vietnam dates', async () => {
  await db.exec('UPDATE agent_billing_plans SET amount_vnd=100000');
  const a = await reserve(); await settle(a);
  await db.exec('UPDATE agent_billing_plans SET amount_vnd=200000');
  const b = await reserve(10); await settle(b, 200000, 'abcdef1234567890abcdef1234567890');
  await db.exec('UPDATE agent_billing_plans SET amount_vnd=500000');
  const c = await reserve();
  await rpc('update_agent_payment', [c.id, '11111111111111111111111111111111', null, 'FAILED']);
  await db.exec("UPDATE agent_payment_orders SET paid_at='2026-10-16T18:00:00Z',verified_at='2026-10-16T19:00:00Z',created_at='2026-10-16T17:30:00Z'");
  const revenue = await rpc('admin_payment_revenue', ['2026-10-17','2026-10-17','day','2026-10-17T12:00:00Z']);
  assert.equal(revenue.periodGross, 300000);
  assert.equal(revenue.successfulTransactions, 2);
  assert.deepEqual(revenue.trend, [{ date: '2026-10-17', gross: 300000 }]);
  assert.equal(revenue.byPackage.reduce((sum, item) => sum + item.gross, 0), 300000);
  assert.equal(revenue.periodNet, null);
  assert.equal(revenue.periodRefunds, null);
  assert.equal(revenue.refundsAvailable, false);
  const transactions = await rpc('admin_payment_transactions', ['2026-10-17','2026-10-17',1,2,'2026-10-17T12:00:00Z']);
  assert.equal(transactions.total, 3); assert.equal(transactions.items.length, 2);
  assert.ok(transactions.items.every((item) => !('checkout_url' in item) && !('provider_reference' in item)));
  assert.equal((await rpc('admin_payment_revenue', ['2026-10-16','2026-10-16','day','2026-10-17T12:00:00Z'])).periodGross, 0);
  for (const bucket of ['week','month','year']) {
    const data = await rpc('admin_payment_revenue', ['2026-10-01','2026-10-17',bucket,'2026-10-17T12:00:00Z']);
    assert.equal(data.trend.reduce((sum,item)=>sum+item.gross,0),300000);
    assert.equal(data.monthly.reduce((sum,item)=>sum+item.gross,0),300000);
  }
  await assert.rejects(rpc('admin_payment_transactions', ['2026-10-01','2026-10-17',1,51,'2026-10-17T12:00:00Z']), /Invalid transaction/);
  await assert.rejects(rpc('admin_payment_revenue', ['2000-01-01','2026-10-17','day','2026-10-17T12:00:00Z']), /Invalid analytics/);
});

test('HTTP uses real JWT/session and Agent ownership guards, with public signed-only webhook', async () => {
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const { getJwtConfig } = require('../services/authSessionService');
  const { supabase } = require('../config/supabase');
  const productionService = require('../services/paymentService');
  const original = { ...productionService };
  const service = createPaymentService(repo, gateway({ verifyWebhook: async (body) => {
    if (body.signature !== 'verified-fixture') throw Object.assign(new Error('Invalid signature'), { statusCode: 400 });
    return body.data;
  } }));
  Object.assign(productionService, service);
  const restore = connectTestDatabase(supabase, db);
  const app = express(); app.use(express.json({ limit: '32kb' }));
  app.use('/api/payments', require('../routes/paymentRoutes'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/payments`;
  const tokenFor = async (id) => {
    const sid = randomUUID();
    await db.query('INSERT INTO auth_sessions(id,user_id,expires_at) VALUES($1,$2,$3)', [sid,id,new Date(Date.now()+60000).toISOString()]);
    const { secret,issuer,audience } = getJwtConfig();
    return jwt.sign({ token_use: 'access',sid }, secret, { algorithm: 'HS256',subject:String(id),issuer,audience,expiresIn:'1m' });
  };
  try {
    assert.equal((await fetch(`${base}/catalog`)).status, 401);
    for (const userId of [1,2]) assert.equal((await fetch(`${base}/catalog`, { headers: { Authorization: `Bearer ${await tokenFor(userId)}` } })).status, 403);
    const headers = { Authorization: `Bearer ${await tokenFor(9)}`, 'Content-Type':'application/json' };
    assert.equal((await fetch(`${base}/catalog`,{headers})).status,200);
    const response = await fetch(base,{ method:'POST',headers,body:JSON.stringify({planCode:'PAID',planVersion:1,requestId:randomUUID()}) });
    assert.equal(response.status,200); const order=await response.json();
    assert.equal((await fetch(`${base}/${order.id}`,{headers:{Authorization:`Bearer ${await tokenFor(10)}`}})).status,404);
    assert.equal((await fetch(`${base}/payos/webhook`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,400);
    const webhook = { signature:'verified-fixture',data:{orderCode:order.orderCode,code:'00',paymentLinkId:LINK} };
    assert.equal((await fetch(`${base}/payos/webhook`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(webhook)})).status,200);
    assert.equal((await row(order.id)).status,'PAID');
    assert.equal((await fetch(base,{method:'POST',headers,body:JSON.stringify({planCode:'PAID',planVersion:1,requestId:randomUUID(),amount:1})})).status,400);
    await db.exec('UPDATE users SET is_active=false WHERE id=9');
    assert.equal((await fetch(`${base}/catalog`,{headers})).status,403);
  } finally {
    Object.assign(productionService,original); restore();
    await new Promise((resolve)=>server.close(resolve));
  }
});

test('official SDK signs create/get/cancel and rejects unsigned or tampered provider responses', async () => {
  const env={PAYOS_CLIENT_ID:'client',PAYOS_API_KEY:'api',PAYOS_CHECKSUM_KEY:'checksum',PAYOS_ENABLED:'true',FRONTEND_URL:'https://frontend.example.test'};
  const sdk=new PayOS({clientId:'client',apiKey:'api',checksumKey:'checksum'});
  let corrupt=false; const calls=[];
  const provider=createPayosService(env,{fetch:async(input,init)=>{
    calls.push({url:String(input),method:init.method,body:init.body ? JSON.parse(init.body):null});
    const data=init.method==='POST' && !String(input).endsWith('/cancel')
      ? {orderCode:1000000000000,amount:1000000,paymentLinkId:LINK,status:'PENDING',currency:'VND',checkoutUrl:`https://pay.payos.vn/web/${LINK}`}
      : {orderCode:1000000000000,amount:1000000,id:LINK,status:String(input).endsWith('/cancel')?'CANCELLED':'PENDING',amountPaid:0,amountRemaining:1000000,transactions:[]};
    const signature=await sdk.crypto.createSignatureFromObj(data,'checksum');
    return new Response(JSON.stringify({code:'00',desc:'success',data,signature:corrupt?'bad-signature':signature}),{headers:{'Content-Type':'application/json'}});
  }});
  const order={id:randomUUID(),order_code:1000000000000,amount_vnd:1000000,plan_name:'Premium',duration_months:1,expires_at:new Date(Date.now()+1800000).toISOString()};
  await provider.create(order); await provider.get(order.order_code); await provider.cancel(order.order_code);
  assert.ok(calls.every((call)=>call.url.startsWith('https://api-merchant.payos.vn/v2/payment-requests')));
  assert.ok(calls[0].body.signature); assert.equal(calls[0].body.amount,1000000);
  assert.equal(calls[0].body.returnUrl,`https://frontend.example.test/sale/payment/${order.id}`);
  assert.equal(calls[0].body.description.length,9);
  assert.equal(calls[2].body.cancellationReason,'Agent requested cancellation');
  corrupt=true; await assert.rejects(provider.get(order.order_code));
});
