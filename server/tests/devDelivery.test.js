const test = require('node:test');
const assert = require('node:assert/strict');
const { isDevConsoleDeliveryEnabled, devFrontendOrigin, maskEmail } = require('../services/devDeliveryPolicy');

test('console delivery needs both a development/test NODE_ENV and the explicit flag', () => {
  assert.equal(isDevConsoleDeliveryEnabled({ NODE_ENV: 'development', DEV_CONSOLE_DELIVERY: 'true' }), true);
  assert.equal(isDevConsoleDeliveryEnabled({ NODE_ENV: 'test', DEV_CONSOLE_DELIVERY: 'true' }), true);
  assert.equal(isDevConsoleDeliveryEnabled({ NODE_ENV: 'production', DEV_CONSOLE_DELIVERY: 'true' }), false);
  assert.equal(isDevConsoleDeliveryEnabled({ DEV_CONSOLE_DELIVERY: 'true' }), false);
  assert.equal(isDevConsoleDeliveryEnabled({ NODE_ENV: 'development' }), false);
  assert.equal(isDevConsoleDeliveryEnabled({ NODE_ENV: 'development', DEV_CONSOLE_DELIVERY: '1' }), false);
});

test('dev links use the configured frontend origin and logs mask the address', () => {
  assert.equal(devFrontendOrigin({ FRONTEND_URL: 'http://127.0.0.1:5174/ignored' }), 'http://127.0.0.1:5174');
  assert.equal(devFrontendOrigin({}), 'http://localhost:5173');
  assert.equal(maskEmail('agent.one@example.test'), 'ag***@example.test');
});

test('email delivery: dev console mode prints the link instead of failing; otherwise it stays fail-closed', async (t) => {
  const keys = ['NODE_ENV', 'DEV_CONSOLE_DELIVERY', 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'GMAIL_SENDER_EMAIL', 'FRONTEND_URL'];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  t.after(() => keys.forEach((key) => (saved[key] === undefined ? delete process.env[key] : (process.env[key] = saved[key]))));
  keys.forEach((key) => delete process.env[key]);
  const emailService = require('../services/emailService');

  process.env.NODE_ENV = 'production';
  process.env.DEV_CONSOLE_DELIVERY = 'true';
  assert.throws(() => emailService.assertConfigured(), (error) => error.code === 'EMAIL_DELIVERY_UNAVAILABLE');
  await assert.rejects(emailService.sendVerificationEmail({ email: 'a@example.test', token: 'abc' }), (error) => error.code === 'EMAIL_DELIVERY_UNAVAILABLE');

  process.env.NODE_ENV = 'development';
  assert.doesNotThrow(() => emailService.assertConfigured());
  const printed = [];
  t.mock.method(console, 'info', (line) => printed.push(line));
  const result = await emailService.sendVerificationEmail({ email: 'agent@example.test', token: 'tok123' });
  assert.deepEqual(result, { devConsole: true });
  assert.equal(printed.length, 1);
  assert.match(printed[0], /ag\*\*\*@example\.test: http:\/\/localhost:5173\/verify-email#token=tok123$/);
});

test('OTP mock: the code is printed only in dev console mode', async (t) => {
  const keys = ['NODE_ENV', 'DEV_CONSOLE_DELIVERY', 'ESMS_API_KEY', 'ESMS_SECRET_KEY', 'ESMS_MOCK'];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  t.after(() => keys.forEach((key) => (saved[key] === undefined ? delete process.env[key] : (process.env[key] = saved[key]))));
  keys.forEach((key) => delete process.env[key]);
  const esmsService = require('../services/esmsService');
  const printed = [];
  t.mock.method(console, 'info', (line) => printed.push(line));
  t.mock.method(console, 'warn', () => {});

  process.env.NODE_ENV = 'development';
  let result = await esmsService.sendOtpSms({ phone: '0911000003', otp: '123456' });
  assert.equal(result.devConsole, false);
  assert.equal(printed.length, 0);

  process.env.DEV_CONSOLE_DELIVERY = 'true';
  result = await esmsService.sendOtpSms({ phone: '0911000003', otp: '654321' });
  assert.equal(result.devConsole, true);
  assert.deepEqual(printed, ['[DEV] Mã OTP cho 091*****03: 654321']);
});
