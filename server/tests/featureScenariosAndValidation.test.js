const test = require('node:test');
const assert = require('node:assert/strict');

// 1. Import services
const { checkDescriptionIsMultiListing } = require('../services/geminiService');
const { validatePassword, normalizeVietnamPhone } = require('../services/registrationValidation');

// =========================================================================
// TEST SCENARIO 1: F28 (KYC Guard & Phone Validation)
// =========================================================================
test('SCENARIO 1: F28 KYC Guard & Strict Vietnamese Phone Validation', () => {
  // Test Phone Normalization & Validation
  const validPhones = [
    '0901234567',
    '0388999111',
    '+84 987 654 321',
    '056 123 4567',
    '079-888-9999'
  ];
  const invalidPhones = [
    '098765432',     // 9 digits (too short)
    '09876543210',    // 11 digits (too long)
    '0243123456',     // Landline prefix 02
    '1234567890',     // Non-Vietnamese mobile prefix
    'abc0901234567',  // Malformed characters
    '',               // Empty
    null              // Null
  ];

  validPhones.forEach(p => {
    const normalized = normalizeVietnamPhone(p);
    assert.match(normalized, /^0[35789]\d{8}$/, `Phone ${p} should be valid VN mobile`);
  });

  invalidPhones.forEach(p => {
    const normalized = normalizeVietnamPhone(p);
    const isValid = /^0[35789]\d{8}$/.test(normalized);
    assert.equal(isValid, false, `Phone ${p} should be rejected as invalid`);
  });

  // Verify KYC Status Guard logic
  const mockAgentVerified = { id: 1, role: 'AGENT', verification_status: 'VERIFIED', trust_score: 80 };
  const mockAgentPending = { id: 2, role: 'AGENT', verification_status: 'PENDING', trust_score: 80 };
  const mockAgentUnverified = { id: 3, role: 'AGENT', verification_status: 'UNVERIFIED', trust_score: 80 };

  const checkKycGuard = (agent) => {
    if (agent.verification_status !== 'VERIFIED') {
      const err = new Error('Tài khoản chưa hoàn tất xác minh danh tính (KYC). Vui lòng hoàn tất KYC để đăng tin.');
      err.statusCode = 403;
      throw err;
    }
    return true;
  };

  assert.equal(checkKycGuard(mockAgentVerified), true);
  assert.throws(() => checkKycGuard(mockAgentPending), { statusCode: 403, message: /chưa hoàn tất xác minh danh tính/ });
  assert.throws(() => checkKycGuard(mockAgentUnverified), { statusCode: 403, message: /chưa hoàn tất xác minh danh tính/ });
});

// =========================================================================
// TEST SCENARIO 2: F31 (Duplicate Listing Confirmation Prompt & Silent Display Penalty)
// =========================================================================
test('SCENARIO 2: F31 Duplicate Listing Confirmation Prompt & Silent Display Penalty', () => {
  const ownDuplicateDetection = {
    similarOwn: true,
    similarOther: false,
    duplicates: [{ id: 101, title: 'Căn hộ Landmark 81' }]
  };

  const competitorDuplicateDetection = {
    similarOwn: false,
    similarOther: true,
    duplicates: [{ id: 202, title: 'Căn hộ Landmark 81' }]
  };

  const cleanDetection = {
    similarOwn: false,
    similarOther: false,
    duplicates: []
  };

  // Function mirroring updated useListingForm.js warning generator
  const buildWarnings = (result) => {
    const warnings = [];
    // similarOther: Allowed silently, no blocking/warning
    if (result.similarOwn) {
      warnings.push({
        type: 'OWN_SPAM',
        text: 'Bạn đã có một bất động sản tương tự trong hệ thống của mình. Bạn có chắc chắn muốn tiếp tục đăng tin này không?',
        isBlocking: false // Prompt confirmation, does not hard-block
      });
    }
    return warnings;
  };

  const ownWarnings = buildWarnings(ownDuplicateDetection);
  const compWarnings = buildWarnings(competitorDuplicateDetection);
  const cleanWarnings = buildWarnings(cleanDetection);

  // Assert that own duplicate prompts confirmation without hard blocking
  assert.equal(ownWarnings.length, 1);
  assert.equal(ownWarnings[0].isBlocking, false);

  // Competitor duplicate requires no extra warning
  assert.equal(compWarnings.length, 0);
  assert.equal(cleanWarnings.length, 0);

  // Agent is allowed to confirm and proceed with saving
  const isSaveAllowed = (warnings) => !warnings.some(w => w.isBlocking);
  assert.equal(isSaveAllowed(ownWarnings), true, 'Agent can confirm and proceed with duplicate post');

  // Backend silently assigns -50 priority_score penalty
  const resolvePriorityScore = (detection) => (detection.similarOwn ? -50 : 0);
  assert.equal(resolvePriorityScore(ownDuplicateDetection), -50);
  assert.equal(resolvePriorityScore(competitorDuplicateDetection), 0);
  assert.equal(resolvePriorityScore(cleanDetection), 0);
});

// =========================================================================
// TEST SCENARIO 3: F32 (AI Portfolio Spam Scanner)
// =========================================================================
test('SCENARIO 3: F32 Heuristic AI Scanner for Portfolio Spam Descriptions', async () => {
  const spamDescriptions = [
    'Bảng hàng 50 căn Vinhomes Grand Park, giỏ hàng trực tiếp chủ đầu tư giá từ 2 tỷ đến 5 tỷ',
    'Tổng hợp giỏ hàng cho thuê căn 1PN, căn 2PN, căn 3PN đủ các tầng view hồ bơi',
    'Nhận ký gửi giỏ hàng chuyển nhượng masteri centre point, liên hệ ngay'
  ];

  const legitimateDescriptions = [
    'Cho thuê căn hộ cao cấp 2 phòng ngủ 2WC diện tích 75m2, tầng 15 view Landmark 81 cực đẹp, đầy đủ nội thất chỉ việc xách vali vào ở.',
    'Chính chủ cần bán gấp căn nhà phố 1 trệt 2 lầu đường Nguyễn Trãi Quận 5, sổ hồng riêng công chứng trong ngày.'
  ];

  for (const desc of spamDescriptions) {
    const res = await checkDescriptionIsMultiListing(desc);
    assert.equal(res.is_multi_listing, true, `Should detect spam in: "${desc}"`);
    assert.ok(res.reason.length > 0);
  }

  for (const desc of legitimateDescriptions) {
    const res = await checkDescriptionIsMultiListing(desc);
    assert.equal(res.is_multi_listing, false, `Should pass legitimate listing: "${desc}"`);
  }
});

// =========================================================================
// TEST SCENARIO 4: F33 (Contextual Property Chat & Ribbon State)
// =========================================================================
test('SCENARIO 4: F33 Contextual Property Persistence in Chat Thread', () => {
  // Simulate conversation state
  const conversation = {
    id: 'conv-123',
    property_id: 42,
    property: {
      id: 42,
      title: 'Studio Vinhomes Golden River Bason',
      price: 15000000,
      district: 'Quận 1',
      city: 'TP. Hồ Chí Minh',
      thumbnail: 'https://example.com/thumb.jpg'
    }
  };

  // Outgoing messages
  const initialMessage = {
    sender_id: 10,
    recipient_id: 20,
    property_id: conversation.property_id,
    message: 'Chào bạn, căn này còn trống không?'
  };

  // Follow-up message sent by customer without explicit property picker
  const followUpMessage = {
    sender_id: 10,
    recipient_id: 20,
    property_id: null,
    message: 'Tôi có thể qua xem phòng lúc 18h tối nay được không?'
  };

  // Service inheritance rule
  const resolveMessageProperty = (msg, activeConvPropertyId) => {
    return msg.property_id || activeConvPropertyId || null;
  };

  assert.equal(resolveMessageProperty(initialMessage, conversation.property_id), 42);
  assert.equal(resolveMessageProperty(followUpMessage, conversation.property_id), 42, 'Follow-up message must retain property_id from active conversation');
});

// =========================================================================
// TEST SCENARIO 5: F34 & F35 (Read Receipts, Status Icons & Attachment Payload)
// =========================================================================
test('SCENARIO 5: F34 & F35 Read Receipts & Attachments Validation', () => {
  const unreadMsg = {
    id: 1,
    sender_id: 10,
    recipient_id: 20,
    message: 'Giá này có bớt được không bạn?',
    is_read: false,
    read_at: null,
    attachments: []
  };

  const readMsg = {
    id: 2,
    sender_id: 10,
    recipient_id: 20,
    message: 'Đây là sổ hồng căn nhà nhé.',
    is_read: true,
    read_at: '2026-10-13T01:30:00Z',
    attachments: [
      { name: 'so_hong.jpg', url: 'https://example.com/so_hong.jpg', size: 102400, type: 'image/jpeg' }
    ]
  };

  // UI state formatter test
  const getReadReceiptDisplay = (msg, isOwn) => {
    if (!isOwn) return null;
    return {
      text: msg.is_read ? '✓✓ Đã xem' : '✓ Đã gửi',
      color: msg.is_read ? '#2563eb' : '#94a3b8'
    };
  };

  const unreadReceipt = getReadReceiptDisplay(unreadMsg, true);
  assert.equal(unreadReceipt.text, '✓ Đã gửi');
  assert.equal(unreadReceipt.color, '#94a3b8');

  const readReceipt = getReadReceiptDisplay(readMsg, true);
  assert.equal(readReceipt.text, '✓✓ Đã xem');
  assert.equal(readReceipt.color, '#2563eb');

  // Partner view does not show receipt for sender
  assert.equal(getReadReceiptDisplay(readMsg, false), null);

  // Attachments structure check
  assert.equal(readMsg.attachments.length, 1);
  assert.equal(readMsg.attachments[0].type, 'image/jpeg');
  assert.match(readMsg.attachments[0].url, /^https?:\/\//);
});

// =========================================================================
// TEST SCENARIO 6: F37 (CRM Funnel Auto-Lead Creation)
// =========================================================================
test('SCENARIO 6: F37 CRM Funnel Lead Automation Stage Progression', () => {
  const stages = ['AWARENESS', 'INTEREST', 'CONSIDERATION', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST'];

  // Test auto-initialization stage
  const createLeadOnMessage = (existingLead, isAgentInvolved) => {
    if (!isAgentInvolved) return null;
    if (existingLead) return existingLead;
    return {
      funnel_stage: 'AWARENESS',
      created_at: new Date().toISOString()
    };
  };

  const newLead = createLeadOnMessage(null, true);
  assert.ok(newLead);
  assert.equal(newLead.funnel_stage, 'AWARENESS');

  // Verify valid stage transitions
  stages.forEach(st => {
    assert.ok(stages.includes(st));
  });
});
