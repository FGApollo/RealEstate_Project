const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveOtpTemplate, sendOtpSms } = require('../services/esmsService');

test('resolveOtpTemplate returns standard approved template for fixed cheap number (SmsType = 8)', () => {
  const origEnv = process.env.ESMS_OTP_TEMPLATE;
  try {
    delete process.env.ESMS_OTP_TEMPLATE;
    assert.equal(resolveOtpTemplate('8', ''), 'Ma OTP cua ban la {otp}');

    // If an invalid template like "{otp} la ma xac minh OTP cua ban." is configured for SmsType = 8,
    // resolveOtpTemplate safely corrects it to the approved telco template
    process.env.ESMS_OTP_TEMPLATE = '{otp} la ma xac minh OTP cua ban.';
    assert.equal(resolveOtpTemplate('8', ''), 'Ma OTP cua ban la {otp}');

    // If a valid custom template containing "Ma OTP" or "Ma Xac Nhan" is given, it is respected
    process.env.ESMS_OTP_TEMPLATE = 'Ma OTP cua ban la: {otp}';
    assert.equal(resolveOtpTemplate('8', ''), 'Ma OTP cua ban la: {otp}');
  } finally {
    if (origEnv !== undefined) process.env.ESMS_OTP_TEMPLATE = origEnv;
    else delete process.env.ESMS_OTP_TEMPLATE;
  }
});

test('resolveOtpTemplate returns test brandname template for Baotrixemay (SmsType = 2)', () => {
  const origEnv = process.env.ESMS_OTP_TEMPLATE;
  try {
    delete process.env.ESMS_OTP_TEMPLATE;
    assert.equal(
      resolveOtpTemplate('2', 'Baotrixemay'),
      '{otp} la ma xac minh dang ky Baotrixemay cua ban'
    );
  } finally {
    if (origEnv !== undefined) process.env.ESMS_OTP_TEMPLATE = origEnv;
    else delete process.env.ESMS_OTP_TEMPLATE;
  }
});

test('sendOtpSms with SmsType = 8 never sends Brandname field and sets IsUnicode to 0', async () => {
  const origType = process.env.ESMS_SMS_TYPE;
  const origBrand = process.env.ESMS_BRANDNAME;
  const origApiKey = process.env.ESMS_API_KEY;
  const origSecret = process.env.ESMS_SECRET_KEY;
  const origMock = process.env.ESMS_MOCK;
  const origSandbox = process.env.ESMS_SANDBOX;

  try {
    process.env.ESMS_SMS_TYPE = '8';
    process.env.ESMS_BRANDNAME = 'Baotrixemay';
    process.env.ESMS_API_KEY = 'TEST_KEY';
    process.env.ESMS_SECRET_KEY = 'TEST_SECRET';
    process.env.ESMS_MOCK = 'false';
    process.env.ESMS_SANDBOX = '1';

    let capturedPayload = null;
    const originalFetch = global.fetch;
    global.fetch = async (url, opts) => {
      capturedPayload = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({ CodeResult: '100', SMSID: 'TEST_SMS_123' })
      };
    };

    try {
      const res = await sendOtpSms({ phone: '0903618752', otp: '640101' });
      assert.equal(res.success, true);
      assert.equal(capturedPayload.SmsType, '8');
      assert.equal(capturedPayload.IsUnicode, '0');
      assert.equal(capturedPayload.Brandname, undefined);
      assert.equal(capturedPayload.Content, 'Ma OTP cua ban la 640101');
    } finally {
      global.fetch = originalFetch;
    }
  } finally {
    process.env.ESMS_SMS_TYPE = origType;
    process.env.ESMS_BRANDNAME = origBrand;
    process.env.ESMS_API_KEY = origApiKey;
    process.env.ESMS_SECRET_KEY = origSecret;
    process.env.ESMS_MOCK = origMock;
    process.env.ESMS_SANDBOX = origSandbox;
  }
});
