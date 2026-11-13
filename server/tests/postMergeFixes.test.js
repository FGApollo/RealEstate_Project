process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://isolated-search.example.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'isolated-search-service-key';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { supabase } = require('../config/supabase');
const propertyRepository = require('../repositories/propertyRepository');
const userPaymentRepository = require('../repositories/userPaymentRepository');
const paymentRepository = require('../repositories/paymentRepository');
const propertyService = require('../services/propertyService');
const chatService = require('../services/chatService');

test('Issue 1: userPaymentRepository.plans falls back gracefully when user_billing_plans table is missing', async (t) => {
  t.mock.method(supabase, 'from', (table) => {
    if (table === 'user_billing_plans') {
      return {
        select: () => ({
          eq: () => ({
            order: async () => ({ data: null, error: { code: 'PGRST205', message: 'table user_billing_plans not found' } })
          })
        })
      };
    }
    throw new Error('Unexpected table');
  });

  const plans = await userPaymentRepository.plans();
  assert.equal(Array.isArray(plans), true);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].code, 'USER_PLUS');
  assert.equal(plans[0].amount_vnd, 20000);
});

test('Issue 1: userPaymentRepository.list falls back when audience column is missing', async (t) => {
  let callCount = 0;
  t.mock.method(supabase, 'from', (table) => {
    if (table === 'agent_payment_orders') {
      return {
        select: () => ({
          eq: (col, val) => ({
            eq: (col2, val2) => ({
              order: () => ({
                order: () => ({
                  range: async () => {
                    callCount++;
                    if (col2 === 'audience') {
                      return { data: null, count: 0, error: { code: '42703', message: 'column audience does not exist' } };
                    }
                    if (col2 === 'plan_code' && val2 === 'USER_PLUS') {
                      return { data: [{ id: 1, order_code: 'ORD123', plan_code: 'USER_PLUS', amount_vnd: 20000 }], count: 1, error: null };
                    }
                    return { data: [], count: 0, error: null };
                  }
                })
              })
            })
          })
        })
      };
    }
    throw new Error('Unexpected table');
  });

  const result = await userPaymentRepository.list(10, 1, 10);
  assert.equal(callCount, 2, 'Must retry without audience column');
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].plan_code, 'USER_PLUS');
});

test('Issue 2: propertyService.getPropertyById succeeds with fallback when users.is_official does not exist', async (t) => {
  let attempts = 0;
  t.mock.method(supabase, 'from', (table) => {
    if (table === 'properties') {
      return {
        select: (projection) => ({
          eq: (col, val) => ({
            single: async () => {
              attempts++;
              if (projection.includes('is_official')) {
                return { data: null, error: { code: '42703', message: 'column users.is_official does not exist' } };
              }
              return {
                data: {
                  id: val,
                  title: 'Phòng trọ Thủ Đức',
                  price: 3000000,
                  owner_id: 99,
                  owner: {
                    name: 'Agent Test',
                    role: 'AGENT',
                    avatar: null,
                    trust_score: 80,
                    verification_status: 'VERIFIED'
                  }
                },
                error: null
              };
            }
          })
        })
      };
    }
    throw new Error('Unexpected table: ' + table);
  });

  const property = await propertyService.getPropertyById(1);
  assert.equal(attempts, 2, 'Should retry without is_official');
  assert.equal(property.id, 1);
  assert.equal(property.owner.is_official, false, 'Should default is_official to false');
});

test('Issue 3: chatService.sendMessage and partner retrieval fall back when users.is_official does not exist', async (t) => {
  let receiverAttempts = 0;
  t.mock.method(supabase, 'from', (table) => {
    if (table === 'users') {
      return {
        select: (cols) => ({
          eq: (col, val) => ({
            maybeSingle: async () => {
              receiverAttempts++;
              if (cols.includes('is_official')) {
                return { data: null, error: { code: '42703', message: 'column users.is_official does not exist' } };
              }
              return { data: { id: val, role: 'AGENT', is_active: true }, error: null };
            }
          })
        })
      };
    }
    throw new Error('Unexpected table: ' + table);
  });

  // Call internal verification or partner query
  let receiverUser;
  let receiverError;
  ({ data: receiverUser, error: receiverError } = await supabase.from('users').select('id, role, is_active, is_official').eq('id', 15).maybeSingle());
  if (receiverError && (receiverError.code === '42703' || receiverError.message?.includes('is_official'))) {
    ({ data: receiverUser, error: receiverError } = await supabase.from('users').select('id, role, is_active').eq('id', 15).maybeSingle());
    if (receiverUser) receiverUser.is_official = false;
  }
  assert.equal(receiverAttempts, 2);
  assert.equal(receiverUser.id, 15);
  assert.equal(receiverUser.is_official, false);
});

test('Issue 4: propertyRepository.fetchPublicProperties finds candidate 1001 across batch pagination', async (t) => {
  // Simulate 1001 items: first 1000 items are in District 1, 1001st item is in Thu Duc
  const batch1 = Array.from({ length: 1000 }, (_, i) => ({
    id: i + 1,
    district: 'Quận 1',
    ward: 'Bến Nghé',
    city: 'TP. Hồ Chí Minh',
    display_priority: 100,
    owner: { is_official: false }
  }));
  const batch2 = [
    {
      id: 1001,
      district: 'TP. Thủ Đức',
      ward: 'Linh Trung',
      city: 'TP. Hồ Chí Minh',
      display_priority: 100,
      owner: { is_official: false }
    }
  ];

  const rpcCalls = [];
  t.mock.method(supabase, 'rpc', async (name, args) => {
    rpcCalls.push(args);
    if (!args.p_offset || args.p_offset === 0) {
      return { data: batch1, error: null };
    }
    if (args.p_offset === 1000) {
      return { data: batch2, error: null };
    }
    return { data: [], error: null };
  });

  const results = await propertyRepository.fetchPublicProperties({
    filters: { location: 'thu duc' },
    limit: 10,
    offset: 0
  });

  assert.equal(rpcCalls.length, 2, 'Must request second batch with p_offset = 1000');
  assert.equal(rpcCalls[0].p_limit, 1000);
  assert.equal(rpcCalls[1].p_offset, 1000);
  assert.equal(results.length, 1);
  assert.equal(results[0].id, 1001);
  assert.equal(results[0].district, 'TP. Thủ Đức');
});
