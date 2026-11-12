// End-to-end API flow checks against the local server + dev Supabase.
// Run against a LOCAL server + a PERSONAL DEV database only (never production).
// Usage: node server/scripts/qa-flows.cjs <setup|register|phone-otp|kyc-name-review|kyc-reject|admin-kyc|kyc-dup|listing|plans|user|admin|reco|moderation>
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '../..');
const SERVER = path.join(ROOT, 'server');
const IMAGES = path.join(ROOT, 'test_images'); // local-only CCCD/selfie samples (gitignored)
const STATE = path.join(require('os').tmpdir(), 'swipenest-qa-state.json');
const req = require('module').createRequire(path.join(SERVER, 'package.json'));
req('dotenv').config({ path: path.join(SERVER, '.env'), quiet: true });
const { createClient } = req('@supabase/supabase-js');
const bcrypt = req('bcrypt');
const sharp = req('sharp');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
// Đổi địa chỉ khi cần: QA_API_URL=http://localhost:3001 QA_ORIGIN=http://localhost:5175 node server/scripts/qa-flows.cjs plus
const API = process.env.QA_API_URL || 'http://localhost:3000';
const ORIGIN = process.env.QA_ORIGIN || 'http://localhost:5173';
const PASSWORD = 'QaTest!2026x';
const ACCOUNTS = {
  user: { email: 'qa.user@qa.test', name: 'QA User', role: 'USER', phone: '0911000001' },
  agent1: { email: 'qa.agent1@qa.test', name: 'QA Agent One', role: 'AGENT', phone: '0911000002' },
  agent2: { email: 'qa.agent2@qa.test', name: 'QA Agent Two', role: 'AGENT', phone: '0911000003' },
  admin: { email: 'qa.admin@qa.test', name: 'QA Admin', role: 'ADMIN', phone: '0911000004' },
};
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
const save = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 2));

let failures = 0;
const short = (v) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s && s.length > 220 ? s.slice(0, 220) + '…' : s; };
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  → ' + short(detail) : ''}`);
  return ok;
}

const tokens = {};
async function call(who, method, url, body, { form } = {}) {
  const headers = { Origin: ORIGIN };
  if (who && tokens[who]) headers.Authorization = `Bearer ${tokens[who]}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(API + url, { method, headers, body: payload });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}
async function login(who) {
  const r = await call(null, 'POST', '/api/login', { email: ACCOUNTS[who].email, password: PASSWORD });
  tokens[who] = r.json?.accessToken;
  return check(`login ${who}`, r.status === 200 && !!tokens[who], r.status !== 200 ? r.json : undefined);
}
const userId = async (who) => (await db.from('users').select('id').eq('email', ACCOUNTS[who].email).single()).data.id;

async function setup() {
  const hash = await bcrypt.hash(PASSWORD, 10);
  for (const [key, a] of Object.entries(ACCOUNTS)) {
    const row = { name: a.name, email: a.email, password: hash, role: a.role, phone: a.phone, is_active: true,
      email_verified_at: new Date().toISOString(), trust_score: 50,
      verification_status: a.role === 'AGENT' ? 'UNVERIFIED' : 'VERIFIED' };
    const existing = (await db.from('users').select('id').eq('email', a.email).maybeSingle()).data;
    const r = existing ? await db.from('users').update(row).eq('id', existing.id).select('id').single()
      : await db.from('users').insert(row).select('id').single();
    check(`upsert ${key}`, !r.error, r.error?.message || `id=${r.data?.id}`);
    if (a.role === 'AGENT') {
      await db.from('identity_verifications').delete().eq('user_id', r.data.id);
      await db.from('seller_subscriptions').delete().eq('user_id', r.data.id);
    }
  }
  for (const who of Object.keys(ACCOUNTS)) await login(who);
}

async function uploadCard(who) {
  const form = new FormData();
  form.append('fullName', ACCOUNTS[who].name);
  form.append('phone', ACCOUNTS[who].phone);
  form.append('frontImage', new Blob([fs.readFileSync(path.join(IMAGES, 'cccd_card_front.png'))], { type: 'image/png' }), 'front.png');
  form.append('backImage', new Blob([fs.readFileSync(path.join(IMAGES, '1782734323417-back.png'))], { type: 'image/png' }), 'back.png');
  return call(who, 'POST', '/api/kyc/upload-card', undefined, { form });
}
async function uploadSelfie(who) {
  const form = new FormData();
  form.append('selfieImage', new Blob([fs.readFileSync(path.join(IMAGES, 'selfie_photo.jpg'))], { type: 'image/jpeg' }), 'selfie.jpg');
  return call(who, 'POST', '/api/kyc/upload-selfie', undefined, { form });
}

// Cấu hình mặc định ở máy dev: không có dịch vụ so khớp khuôn mặt → selfie đầu tiên chuyển hồ sơ cho admin
// (không bắt thử lại, không từ chối). Sau đó admin từ chối để bước admin-kyc có hồ sơ REJECTED.
async function kycReject() {
  await login('agent1');
  let s = await call('agent1', 'GET', '/api/kyc/status');
  check('kyc status before (UNVERIFIED, can start)', s.status === 200 && s.json.canStartKyc, s.json);
  const card = await uploadCard('agent1');
  check('kyc upload-card (OCR CCCD)', card.status === 200 && card.json.success !== false, card.json);
  if (card.status !== 200 || card.json.success === false) return;
  const ver = (await db.from('identity_verifications').select('id_card_front_url,status,ocr_data').eq('user_id', await userId('agent1')).order('id', { ascending: false }).limit(1).single()).data;
  check('kyc card stored in private bucket kyc-documents', /kyc-documents|^kyc\//.test(ver?.id_card_front_url || ''), ver?.id_card_front_url);
  s = await call('agent1', 'GET', '/api/kyc/status');
  check('kyc status after card (PENDING, step 3)', s.json.verificationStatus === 'PENDING' && s.json.pendingStep === 3, s.json);
  const selfie = await uploadSelfie('agent1');
  check('face service unavailable -> profile goes to admin review (not rejected)', selfie.status === 200
    && selfie.json.pendingAdminReview === true && selfie.json.reviewReason === 'FACE_CHECK_UNAVAILABLE', selfie.json);
  check('the message is in accented Vietnamese', /quản trị viên/.test(selfie.json.message || ''), selfie.json.message);
  const again = await uploadSelfie('agent1');
  check('a second selfie stays in admin review', again.json.pendingAdminReview === true, again.json);
  s = await call('agent1', 'GET', '/api/kyc/status');
  check('kyc status: PENDING, awaiting admin, reason FACE_CHECK_UNAVAILABLE', s.json.verificationStatus === 'PENDING'
    && s.json.awaitingAdminReview === true && s.json.reviewReason === 'FACE_CHECK_UNAVAILABLE', s.json);
  await login('admin');
  const agentId = await userId('agent1');
  const list = await call('admin', 'GET', '/api/admin/kyc?status=PENDING&page=1&limit=50');
  const item = (list.json.verifications || []).find((v) => v.user_id === agentId);
  check('admin pending list flags "Chưa so khớp khuôn mặt" with the selfie', !!item && item.face_check_unavailable === true && item.has_selfie === true, item || list.json);
  if (!item) return;
  const rejected = await call('admin', 'POST', `/api/admin/kyc/${item.id}/reject`, { rejectReason: 'QA: ảnh selfie không trùng người trên CCCD' });
  check('admin rejects the profile', rejected.status === 200, rejected.json);
  s = await call('agent1', 'GET', '/api/kyc/status');
  check('kyc status -> REJECTED', s.json.verificationStatus === 'REJECTED', s.json);
}

// Cần server chạy ở chế độ demo so khớp khuôn mặt:
//   NODE_ENV=development KYC_ALLOW_DEMO=true KYC_FACE_MATCH_PROVIDER=demo KYC_FACE_MATCH_DEMO_RESULT=pass
// Tên khai "QA Agent Two" khác tên trên CCCD mẫu nên hồ sơ phải chờ admin dù khuôn mặt khớp.
async function kycNameReview() {
  const a2 = await userId('agent2');
  await db.from('identity_verifications').delete().eq('user_id', a2);
  await db.from('users').update({ verification_status: 'UNVERIFIED' }).eq('id', a2);
  await login('agent2'); await login('admin');
  const card = await uploadCard('agent2');
  check('upload-card flags the name mismatch', card.status === 200 && card.json.nameMismatch === true, card.json);
  if (card.status !== 200) return;
  let list = await call('admin', 'GET', '/api/admin/kyc?status=PENDING&page=1&limit=20');
  let item = (list.json.verifications || []).find((v) => v.user_id === a2);
  check('pending list shows the record before selfie (Chưa làm selfie)', !!item && item.has_selfie === false && item.selfie_attempts === 0, item || list.json);
  const selfie = await uploadSelfie('agent2');
  check('matching selfie + name mismatch -> pendingAdminReview (not auto-approved)',
    selfie.status === 200 && selfie.json.pendingAdminReview === true && selfie.json.verificationStatus === 'PENDING', selfie.json);
  if (!selfie.json.pendingAdminReview) console.log('      (server có đang chạy chế độ demo so khớp khuôn mặt không?)');
  const s = await call('agent2', 'GET', '/api/kyc/status');
  check('agent status: PENDING + awaitingAdminReview', s.json.verificationStatus === 'PENDING' && s.json.awaitingAdminReview === true, s.json);
  list = await call('admin', 'GET', '/api/admin/kyc?status=PENDING&page=1&limit=20');
  item = (list.json.verifications || []).find((v) => v.user_id === a2);
  check('pending list: name_mismatch + has_selfie, no image paths', !!item && item.name_mismatch && item.has_selfie && !('selfie_url' in item), item || list.json);
  if (!item) return;
  const detail = (await call('admin', 'GET', `/api/admin/kyc/${item.id}`)).json.verification || {};
  check('detail shows OCR name vs declared name and a signed selfie', detail.full_name !== detail.declared_name
    && detail.declared_name === ACCOUNTS.agent2.name && /token=|sign/.test(detail.selfie_url || ''), { full_name: detail.full_name, declared_name: detail.declared_name });
  const ok = await call('admin', 'POST', `/api/admin/kyc/${item.id}/approve`, {});
  check('admin approves the pending record', ok.status === 200 && ok.json.applied === true, ok.json);
  const after = await call('agent2', 'GET', '/api/kyc/status');
  check('agent2 now VERIFIED', after.json.verificationStatus === 'VERIFIED', after.json.verificationStatus);
  // Trả CCCD mẫu lại cho các bước sau (agent1 dùng cùng ảnh).
  await db.from('identity_verifications').delete().eq('user_id', a2);
  await db.from('users').update({ verification_status: 'UNVERIFIED' }).eq('id', a2);
}

async function adminKyc() {
  await login('admin'); await login('agent1');
  const list = await call('admin', 'GET', '/api/admin/kyc?status=REJECTED&page=1&limit=50');
  const agentId = await userId('agent1');
  const rows = list.json.verifications || [];
  const item = rows.find((v) => v.user_id === agentId);
  check('admin sees agent1 in rejected KYC list (paginated)', list.status === 200 && !!item && Number.isInteger(list.json.total),
    list.status !== 200 ? list.json : `count=${rows.length} total=${list.json.total}`);
  const bad = await call('admin', 'GET', '/api/admin/kyc?status=APPROVED');
  check('invalid KYC list status is refused (400)', bad.status === 400, bad.status);
  if (!item) return;
  check('rejected record keeps the name-mismatch flag', item.name_mismatch === true, item.name_mismatch);
  const detailRes = await call('admin', 'GET', `/api/admin/kyc/${item.id}`); const detail = { status: detailRes.status, json: detailRes.json.verification || detailRes.json };
  check('admin KYC detail has signed CCCD images', detail.status === 200 && /token=|sign/.test(detail.json.id_card_front_url || ''), {
    front: !!detail.json.id_card_front_url, back: !!detail.json.id_card_back_url, selfie: !!detail.json.selfie_url });
  check('rejected record keeps the last selfie for admin review', /token=|sign/.test(detail.json.selfie_url || ''), detail.json.selfie_url ? 'signed' : null);
  const ok = await call('admin', 'POST', `/api/admin/kyc/${item.id}/approve`, {});
  check('admin approve KYC', ok.status === 200, ok.json);
  const s = await call('agent1', 'GET', '/api/kyc/status');
  check('agent1 now VERIFIED', s.json.verificationStatus === 'VERIFIED', s.json.verificationStatus);
  const tasks = await call('agent1', 'GET', '/api/trust-score/tasks');
  check('trust-score tasks load', tasks.status === 200, tasks.status !== 200 ? tasks.json : undefined);
  const claim = await call('agent1', 'POST', '/api/trust-score/kyc-completed/check', {});
  check('agent claims KYC +20 trust bonus', claim.status === 200, claim.json);
}

async function kycDuplicate() {
  const a2 = await userId('agent2');
  await db.from('identity_verifications').delete().eq('user_id', a2);
  await db.from('users').update({ verification_status: 'UNVERIFIED' }).eq('id', a2);
  await login('agent2');
  const card = await uploadCard('agent2');
  check('agent2 reusing an already-approved CCCD is blocked', card.json?.success === false || card.status >= 400, card.json);
}

async function tinyJpegDataUrl(seed) {
  const buf = await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: seed, g: 120, b: 200 } } }).jpeg().toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}
function listingPayload(title, extra = {}) {
  return { title, description: 'Căn hộ thử nghiệm QA, 2 phòng ngủ, gần trung tâm, nội thất đầy đủ.', price: 12000000,
    listing_type: 'RENT', area: 65, bedrooms: 2, bathrooms: 2, property_type: 'Căn Hộ', status: 'AVAILABLE', is_public: true,
    city: 'Hồ Chí Minh', district: 'Quận 1', ward: 'Phường Bến Nghé', floor_range: '5-10', address_detail: '12 Lê Lợi',
    address: '12 Lê Lợi, Phường Bến Nghé, Quận 1, Hồ Chí Minh', contact_phone: '0911000002',
    latitude: 10.7769, longitude: 106.7009, features: ['Hồ bơi', 'Gym'], lifestyle_tags: ['Gần trung tâm'], ...extra };
}

async function listing() {
  await login('agent1');
  const id = await userId('agent1');
  const noPlan = await call('agent1', 'POST', '/api/properties', listingPayload('QA no plan'));
  check('create listing without plan is refused (403)', noPlan.status === 403, noPlan.json);
  // Admin cấp gói Lite (không cần payOS).
  await login('admin');
  const grant = await call('admin', 'POST', `/api/admin/agents/${id}/subscription/grant`,
    { requestId: crypto.randomUUID(), planCode: 'LITE', months: 1, reason: 'Cấp gói cho kịch bản QA' });
  check('admin grants a Lite plan', grant.status === 200 && grant.json.subscription?.support_tier === 'LITE', grant.json);
  const subState = await call('agent1', 'GET', '/api/subscriptions');
  check('subscription state ACTIVE', subState.json?.status === 'ACTIVE', subState.json);

  const thumb = await tinyJpegDataUrl(10);
  const pre = await call('agent1', 'POST', '/api/properties/check-before-save', listingPayload('QA Căn hộ A', { thumbnail: thumb, images: [] }));
  check('check-before-save (duplicate/spam scan)', pre.status === 200, pre.json);
  const a = await call('agent1', 'POST', '/api/properties', listingPayload('QA Căn hộ A', { thumbnail: thumb, images: [thumb, await tinyJpegDataUrl(40)] }));
  check('create listing A (with base64 images)', a.status === 201, a.json?.error || `id=${a.json?.property?.id}`);
  const b = await call('agent1', 'POST', '/api/properties', listingPayload('QA Căn hộ B', { thumbnail: 'https://picsum.photos/400', price: 9000000, listing_type: 'SALE', property_type: 'Chung Cư' }));
  check('create listing B', b.status === 201, b.json?.error || `id=${b.json?.property?.id}`);
  if (a.status !== 201 || b.status !== 201) return;
  state.listingA = a.json.property.id; state.listingB = b.json.property.id; state.agent1Id = id; save();
  check('listing A thumbnail uploaded to Storage', /property-images/.test(a.json.property.thumbnail || ''), a.json.property.thumbnail);

  const pub = await call(null, 'GET', `/api/properties/${state.listingA}`);
  check('listing A publicly visible', pub.status === 200, pub.status);
  const ov = await call('agent1', 'GET', '/api/agent/overview');
  check('agent overview lists own listings', ov.status === 200, ov.status !== 200 ? ov.json : Object.keys(ov.json));

  const upd = await call('agent1', 'PUT', `/api/properties/${state.listingB}`, { title: 'QA Căn hộ B (đã sửa)', price: 9500000, bedrooms: 3, features: ['Ban công'], description: 'Mô tả đã cập nhật cho tin B.' });
  check('edit listing B fields', upd.status === 200 && upd.json.property?.price == 9500000 && upd.json.property?.bedrooms === 3, upd.json?.error || upd.json.property?.title);
  for (const st of ['SOLD', 'RENTED', 'AVAILABLE']) {
    const r = await call('agent1', 'PUT', `/api/properties/${state.listingB}`, { status: st });
    check(`change listing B status -> ${st}`, r.status === 200 && r.json.property?.status === st, r.json?.error || r.json.property?.status);
    if (st !== 'AVAILABLE') {
      const p = await call(null, 'GET', `/api/properties/${state.listingB}`);
      check(`  ${st} listing opens by id with its status (kept for favorites)`, p.status === 200 && p.json.property?.status === st, p.status);
      const publicList = await call(null, 'GET', '/api/properties?limit=24');
      check(`  ${st} listing is not in the public list`, !publicList.json.properties.some((item) => item.id === state.listingB), publicList.status);
    }
  }
  const other = await call('agent2', 'PUT', `/api/properties/${state.listingB}`, { title: 'hijack' });
  await login('agent2');
  const other2 = await call('agent2', 'PUT', `/api/properties/${state.listingB}`, { title: 'hijack' });
  check('another agent cannot edit listing B', other2.status === 403, other2.json);
  const del = await call('agent1', 'DELETE', `/api/properties/${state.listingB}`);
  check('delete listing B (soft delete)', del.status === 200, del.json);
  const row = (await db.from('properties').select('status').eq('id', state.listingB).single()).data;
  check('  listing B status in DB = DELETED', row?.status === 'DELETED', row);
}

async function user() {
  await login('user'); await login('agent1');
  const list = await call('user', 'GET', '/api/properties?limit=12');
  check('browse listings', list.status === 200 && list.json.properties?.length > 0, `count=${list.json.properties?.length}`);
  const A = state.listingA;
  const inList = await call('user', 'GET', `/api/properties?limit=24&filters=${encodeURIComponent(JSON.stringify({ city: 'Hồ Chí Minh', minPrice: 10000000, maxPrice: 15000000, bedrooms: ['2'] }))}`);
  check('filter (city+price+bedrooms) returns QA listing A', inList.status === 200 && inList.json.properties.some((p) => p.id === A), inList.json.error || inList.json.properties?.map((p) => p.id));
  const byType = await call('user', 'GET', '/api/properties?limit=24&property_type=C%C4%83n%20H%E1%BB%99');
  check('filter by category (Căn Hộ)', byType.status === 200 && byType.json.properties.every((p) => /căn hộ/i.test(p.property_type)), byType.json.properties?.map((p) => p.property_type).slice(0, 5));
  const rec = await call('user', 'GET', '/api/recommendations?listingType=RENT&limit=10');
  check('recommendations feed', rec.status === 200, rec.status !== 200 ? rec.json : undefined);
  const like = await call('user', 'POST', '/api/me/property-events', { propertyId: A, action: 'LIKE' });
  check('swipe right (LIKE event)', like.status === 201, like.json);
  const other = list.json.properties.find((p) => p.id !== A);
  const dislike = await call('user', 'POST', '/api/me/property-events', { propertyId: other.id, action: 'DISLIKE' });
  check('swipe left (DISLIKE event)', dislike.status === 201, dislike.json);
  const fav = await call('user', 'POST', '/api/favorites', { propertyId: A });
  check('swipe right adds favorite', fav.status === 200 || fav.status === 201, fav.json);
  const favs = await call('user', 'GET', '/api/favorites');
  const favList = favs.json.favorites || favs.json;
  check('favorites tab contains listing A', favs.status === 200 && JSON.stringify(favList).includes(`"id":${A}`), favs.status !== 200 ? favs.json : undefined);

  const detail = await call('user', 'GET', `/api/properties/${A}`);
  check('open detail modal (property)', detail.status === 200 && detail.json.property?.id === A, detail.status);
  check('  public DTO hides owner contact internals', detail.json.property && !('owner_id' in detail.json.property && detail.json.property.owner?.email), Object.keys(detail.json.property?.owner || {}));
  const sim = await call('user', 'GET', `/api/properties/${A}/similar`);
  check('similar listings', sim.status === 200, sim.status);

  const contact = await call('user', 'GET', `/api/properties/${A}/contact-agent`);
  check('"Chat" button resolves agent', contact.status === 200 && contact.json.agentId === state.agent1Id, contact.json);
  const msg = await call('user', 'POST', '/api/chat/messages', { receiverId: state.agent1Id, propertyId: A, message: 'Chào anh, căn này còn không ạ? (QA)' });
  check('user sends chat message', msg.status === 200 || msg.status === 201, msg.json);
  const conv = await call('agent1', 'GET', '/api/chat/conversations');
  const uid = await userId('user');
  check('agent sees conversation from user', conv.status === 200 && JSON.stringify(conv.json).includes(`${uid}`), conv.status);
  const reply = await call('agent1', 'POST', '/api/chat/messages', { receiverId: uid, propertyId: A, message: 'Dạ còn ạ, anh/chị muốn xem lúc nào? (QA)' });
  check('agent replies', reply.status === 200 || reply.status === 201, reply.json);
  const thread = await call('user', 'GET', `/api/chat/messages?otherId=${state.agent1Id}&limit=50`);
  const msgs = thread.json.messages || thread.json;
  check('user sees both messages in thread', thread.status === 200 && Array.isArray(msgs) && msgs.length >= 2, thread.status !== 200 ? thread.json : `n=${msgs.length}`);
  const read = await call('user', 'POST', '/api/chat/read', { partnerId: state.agent1Id });
  check('mark messages read', read.status === 200, read.json);
  const funnel = await call('agent1', 'POST', '/api/chat/funnel', { userId: uid, stage: 'INTENT' });
  check('agent CRM funnel stage update', funnel.status === 200, funnel.json);

  const reviews = await call('user', 'GET', `/api/properties/${A}/reviews`);
  check('view reviews', reviews.status === 200, reviews.status);
  const rv = await call('user', 'POST', `/api/properties/${A}/reviews`, { rating: 4, comment: 'Căn hộ đẹp, môi giới phản hồi nhanh. (QA)', images: [await tinyJpegDataUrl(90)] });
  check('post new review (with image)', rv.status === 201, rv.json);
  const dup = await call('user', 'POST', `/api/properties/${A}/reviews`, { rating: 5, comment: 'Lần 2 (QA)', images: [] });
  check('second review on same listing is refused', dup.status === 400 || dup.status === 409, dup.json);
  const after = await call('user', 'GET', `/api/properties/${A}/reviews`);
  const myReview = (after.json.reviews || []).find((r) => r.user_id === uid);
  check('new review appears in list', !!myReview, (after.json.reviews || []).length);
  const pa = await call(null, 'GET', `/api/properties/${A}`);
  check('rating trigger updated listing (avg=4, count=1)', Number(pa.json.property?.average_rating) === 4 && pa.json.property?.review_count === 1, { avg: pa.json.property?.average_rating, n: pa.json.property?.review_count });
  if (myReview) {
    state.reviewId = myReview.id; save();
    const agentReply = await call('agent1', 'POST', `/api/agent/reviews/${myReview.id}/reply`, { reply_text: 'Cảm ơn anh/chị đã đánh giá! (QA)' });
    check('agent replies to review', agentReply.status === 200 || agentReply.status === 201, agentReply.json);
  }
  // Báo cáo tin đăng (nút "Báo cáo" trên modal)
  await db.from('property_reports').delete().eq('property_id', A).eq('reporter_id', uid);
  const report = await call('user', 'POST', '/api/reports', { propertyId: A, reason: 'WRONG_PRICE', description: 'Giá trên tin khác giá thực tế (QA)' });
  check('user reports the listing', report.status === 201, report.json);
  const ownReport = await call('agent1', 'POST', '/api/reports', { propertyId: A, reason: 'OTHER', description: 'QA' });
  check('owner cannot report own listing', ownReport.status === 400, ownReport.json);

  // Tin yêu thích đã bán: vẫn nằm trong Yêu thích (kèm trạng thái), xem và nhắn môi giới được, không còn trong danh sách công khai
  const sold = await call('agent1', 'PUT', `/api/properties/${A}`, { status: 'SOLD' });
  check('agent marks favorited listing SOLD', sold.status === 200, sold.json?.error);
  const favsSold = await call('user', 'GET', '/api/favorites');
  const soldFav = (favsSold.json.favorites || favsSold.json || []).find((p) => p.id === A);
  check('SOLD listing stays in favorites with its status', soldFav?.status === 'SOLD', soldFav ? soldFav.status : 'missing');
  const soldDetail = await call('user', 'GET', `/api/properties/${A}`);
  check('SOLD listing detail still opens', soldDetail.status === 200 && soldDetail.json.property?.status === 'SOLD', soldDetail.status);
  const soldReviews = await call('user', 'GET', `/api/properties/${A}/reviews`);
  check('SOLD listing reviews still readable', soldReviews.status === 200, soldReviews.status);
  const soldContact = await call('user', 'GET', `/api/properties/${A}/contact-agent`);
  check('SOLD listing chat button still resolves agent', soldContact.status === 200 && soldContact.json.agentId === state.agent1Id, soldContact.json);
  const soldMsg = await call('user', 'POST', '/api/chat/messages', { receiverId: state.agent1Id, propertyId: A, message: 'Căn này bán rồi, còn căn tương tự không ạ? (QA)' });
  check('user can message about a SOLD listing', soldMsg.status === 200 || soldMsg.status === 201, soldMsg.json);
  const soldList = await call('user', 'GET', '/api/properties?limit=24');
  check('SOLD listing is not in the public list', soldList.status === 200 && !soldList.json.properties.some((p) => p.id === A), soldList.status);
  const reopen = await call('agent1', 'PUT', `/api/properties/${A}`, { status: 'AVAILABLE' });
  check('agent reopens the listing', reopen.status === 200, reopen.json?.error);

  const unfav = await call('user', 'POST', '/api/favorites/delete', { propertyId: A });
  check('remove favorite', unfav.status === 200, unfav.json);
}

async function admin() {
  await login('admin');
  for (const [label, url] of [
    ['analytics overview (users, subscriptions)', '/api/admin/analytics/overview?preset=30d'],
    ['payment transactions', '/api/admin/analytics/transactions?preset=30d&page=1&limit=10'],
    ['active subscription agents', `/api/admin/analytics/subscriptions/agents?at=${encodeURIComponent(new Date().toISOString())}&page=1&limit=10`],
    ['service plan catalog', '/api/admin/service-plans'],
  ]) {
    const r = await call('admin', 'GET', url);
    check(label, r.status === 200, r.status !== 200 ? r.json : Object.keys(r.json).slice(0, 8));
    if (label.startsWith('analytics')) console.log('      users:', short(r.json.users || r.json.dashboard?.users), '\n      revenue:', short(r.json.revenue || r.json.payments));
  }
  const reviews = await call('admin', 'GET', '/api/admin/reviews');
  const mine = (reviews.json.items || []).find((r) => r.id === state.reviewId);
  check('admin review moderation list (paginated) includes QA review', reviews.status === 200 && !!mine && Number.isInteger(reviews.json.total) && reviews.json.counts?.total >= 1,
    reviews.status !== 200 ? reviews.json : `items=${reviews.json.items.length} total=${reviews.json.total} counts=${JSON.stringify(reviews.json.counts)}`);
  const pageTwo = await call('admin', 'GET', '/api/admin/reviews?status=APPROVED&page=1&limit=2');
  check('review list honours status + limit', pageTwo.status === 200 && pageTwo.json.items.length <= 2 && pageTwo.json.items.every((r) => r.status === 'APPROVED'), pageTwo.json.items?.length);
  const badReviews = await call('admin', 'GET', '/api/admin/reviews?limit=500');
  check('review list rejects oversized limit (400)', badReviews.status === 400, badReviews.status);
  if (mine) {
    const hide = await call('admin', 'POST', `/api/admin/reviews/${state.reviewId}/status`, { status: 'HIDDEN' });
    check('admin hides review', hide.status === 200, hide.json);
    const pub = await call(null, 'GET', `/api/properties/${state.listingA}/reviews`);
    check('  hidden review no longer public', !(pub.json.reviews || []).some((r) => r.id === state.reviewId), (pub.json.reviews || []).length);
    const p = await call(null, 'GET', `/api/properties/${state.listingA}`);
    check('  rating recalculated after hide (count=0)', p.json.property?.review_count === 0, p.json.property?.review_count);
    const restore = await call('admin', 'POST', `/api/admin/reviews/${state.reviewId}/status`, { status: 'APPROVED' });
    check('admin restores review', restore.status === 200, restore.json);
  }
  const reports = await call('admin', 'GET', '/api/reports/admin');
  const reportRows = reports.json.reports || reports.json.items || reports.json || [];
  check('admin reports list includes the QA report', reports.status === 200 && JSON.stringify(reportRows).includes('Giá trên tin khác giá thực tế (QA)'),
    reports.status !== 200 ? reports.json : undefined);
  const logs = await call('admin', 'GET', '/api/admin/trust-score-logs');
  check('admin trust-score audit log', logs.status === 200, logs.status !== 200 ? logs.json : undefined);
  await login('user');
  const forbidden = await call('user', 'GET', '/api/admin/analytics/overview?preset=30d');
  check('USER cannot open admin analytics (403)', forbidden.status === 403, forbidden.status);
}

// Quản lý gói: bảng giá báo đúng loại giao dịch, admin cấp/đổi hạng/gỡ, môi giới hủy kỳ chờ.
async function plans() {
  await login('admin'); await login('agent1'); await login('user');
  const id = await userId('agent1');
  const lookup = await call('admin', 'GET', `/api/admin/agents/subscription?email=${encodeURIComponent(ACCOUNTS.agent1.email)}`);
  check('admin looks up an agent by email', lookup.status === 200 && lookup.json.agent?.id === id, lookup.json);
  const notAgent = await call('admin', 'GET', `/api/admin/agents/subscription?email=${encodeURIComponent(ACCOUNTS.user.email)}`);
  check('lookup of a non-agent returns 404', notAgent.status === 404, notAgent.status);
  const forbidden = await call('agent1', 'POST', `/api/admin/agents/${id}/subscription/grant`, { requestId: crypto.randomUUID(), planCode: 'PRO', months: 1, reason: 'Tự cấp gói' });
  check('agent cannot use admin plan API (403)', forbidden.status === 403, forbidden.status);

  const current = lookup.json.subscription?.support_tier;
  if (current !== 'LITE') {
    check('agent1 starts this phase on Lite (run the listing phase first)', false, current);
    return;
  }
  const catalog = await call('agent1', 'GET', '/api/payments/catalog');
  const actions = Object.fromEntries((catalog.json.plans || []).map((plan) => [plan.code, plan.purchase_action]));
  check('catalog marks Lite=RENEW, Plus/Pro=UPGRADE', actions.LITE === 'RENEW' && actions.PLUS === 'UPGRADE' && actions.PRO === 'UPGRADE', actions);

  const queued = await call('admin', 'POST', `/api/admin/agents/${id}/subscription/grant`, { requestId: crypto.randomUUID(), planCode: 'LITE', months: 1, reason: 'Xếp thêm một kỳ Lite' });
  check('granting the same tier queues a period', queued.status === 200 && queued.json.subscription?.upcoming?.length === 1, queued.json.subscription?.upcoming);

  const upgraded = await call('admin', 'POST', `/api/admin/agents/${id}/subscription/grant`, { requestId: crypto.randomUUID(), planCode: 'PRO', months: 1, reason: 'Nâng cấp lên Pro' });
  check('granting a higher tier upgrades immediately', upgraded.status === 200 && upgraded.json.subscription?.support_tier === 'PRO'
    && upgraded.json.subscription?.listing_limit === 50, upgraded.json.subscription?.support_tier);
  const catalogPro = await call('agent1', 'GET', '/api/payments/catalog');
  check('catalog now marks Lite as DOWNGRADE', catalogPro.json.plans?.find((plan) => plan.code === 'LITE')?.purchase_action === 'DOWNGRADE', catalogPro.json.currentTier);

  const shortReason = await call('agent1', 'POST', '/api/subscriptions/cancel', { reason: 'no' });
  check('cancel requires a reason (400)', shortReason.status === 400, shortReason.json);
  const cancelled = await call('agent1', 'POST', '/api/subscriptions/cancel', { reason: 'Không cần kỳ Lite xếp sau nữa' });
  check('agent cancels the queued period, running Pro stays', cancelled.status === 200 && cancelled.json.cancelled === 1
    && cancelled.json.subscription?.support_tier === 'PRO' && !cancelled.json.subscription?.upcoming?.length, cancelled.json);

  const changed = await call('admin', 'POST', `/api/admin/agents/${id}/subscription/change`, { requestId: crypto.randomUUID(), planCode: 'LITE', reason: 'Hạ hạng kỳ đang chạy' });
  check('admin changes the running tier immediately', changed.status === 200 && changed.json.subscription?.support_tier === 'LITE', changed.json);
  const same = await call('admin', 'POST', `/api/admin/agents/${id}/subscription/change`, { requestId: crypto.randomUUID(), planCode: 'LITE', reason: 'Không có gì thay đổi' });
  check('changing to the same tier is refused (409)', same.status === 409, same.status);

  const audit = await call('admin', 'GET', `/api/admin/agents/subscription?id=${id}`);
  const kinds = (audit.json.audit || []).map((entry) => entry.action);
  check('agent plan audit log records every action', ['GRANTED', 'CHANGED', 'CANCELLED_QUEUED'].every((kind) => kinds.includes(kind)), kinds);

  // Gỡ gói ở cuối rồi cấp lại Lite để các bước khác vẫn chạy được.
  const removed = await call('admin', 'POST', `/api/admin/agents/${id}/subscription/remove`, { requestId: crypto.randomUUID(), reason: 'Gỡ gói trong kịch bản QA' });
  check('admin removes the plan', removed.status === 200, removed.json);
  const noPlan = await call('agent1', 'POST', '/api/properties', listingPayload('QA after removal'));
  check('after removal, new public listings are refused (403)', noPlan.status === 403, noPlan.json);
  const regrant = await call('admin', 'POST', `/api/admin/agents/${id}/subscription/grant`, { requestId: crypto.randomUUID(), planCode: 'LITE', months: 1, reason: 'Cấp lại gói sau QA' });
  check('admin re-grants Lite', regrant.status === 200, regrant.json);
}

// Đọc dòng [DEV] mà server in ra terminal (cần NODE_ENV=development, DEV_CONSOLE_DELIVERY=true
// và biến QA_SERVER_LOG trỏ tới file log của server).
async function waitForServerLog(pattern, sinceLength) {
  const logPath = process.env.QA_SERVER_LOG;
  if (!logPath) return null;
  for (let i = 0; i < 40; i++) {
    const match = pattern.exec(fs.readFileSync(logPath, 'utf8').slice(sinceLength));
    if (match) return match[1];
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}
const serverLogLength = () => (process.env.QA_SERVER_LOG ? fs.readFileSync(process.env.QA_SERVER_LOG, 'utf8').length : 0);

// Luồng 1: đăng ký bằng email → xác minh email → đăng nhập.
async function register() {
  if (!process.env.QA_SERVER_LOG) { check('QA_SERVER_LOG is set (path of the server log)', false); return; }
  const email = 'qa.register@qa.test';
  const password = 'QaRegister!2026x';
  await db.from('users').delete().eq('email', email);
  const since = serverLogLength();
  const reg = await call(null, 'POST', '/api/register', { name: 'QA Register', email, password, confirmPassword: password, intent: 'USER_SIGNUP' });
  check('register a new USER account', reg.status === 202, reg.json);
  const early = await call(null, 'POST', '/api/login', { email, password });
  check('login before verifying the email is refused', early.status === 403 || early.status === 401, early.json);
  const token = await waitForServerLog(/verify-email#token=(\S+)/, since);
  check('dev mode prints the verification link to the server terminal', Boolean(token));
  if (!token) return;
  const verify = await call(null, 'POST', '/api/auth/verify-email', { token: decodeURIComponent(token) });
  check('verify the email with the link', verify.status === 200, verify.json);
  const reuse = await call(null, 'POST', '/api/auth/verify-email', { token: decodeURIComponent(token) });
  check('the same link cannot be used twice', reuse.status >= 400, reuse.status);
  const ok = await call(null, 'POST', '/api/login', { email, password });
  check('login after verification', ok.status === 200 && Boolean(ok.json.accessToken), ok.json);
  await db.from('users').delete().eq('email', email);
}

// Quên mật khẩu: yêu cầu liên kết → đặt mật khẩu mới → phiên cũ bị thu hồi, liên kết không dùng lại được.
async function passwordReset() {
  if (!process.env.QA_SERVER_LOG) { check('QA_SERVER_LOG is set (path of the server log)', false); return; }
  const email = 'qa.reset@qa.test';
  const oldPassword = 'QaResetOld!2026x';
  const newPassword = 'QaResetNew!2026x';
  await db.from('users').delete().eq('email', email);
  const created = await db.from('users').insert({ name: 'QA Reset', email, password: await bcrypt.hash(oldPassword, 10), role: 'USER',
    is_active: true, email_verified_at: new Date().toISOString(), trust_score: 50, verification_status: 'VERIFIED' }).select('id').single();
  check('create a throwaway account for the reset test', !created.error, created.error?.message);
  const session = await call(null, 'POST', '/api/login', { email, password: oldPassword });
  tokens.reset = session.json?.accessToken;
  check('login with the old password', session.status === 200 && Boolean(tokens.reset), session.json);

  const unknown = await call(null, 'POST', '/api/auth/forgot-password', { email: 'nobody.here@qa.test' });
  const since = serverLogLength();
  const known = await call(null, 'POST', '/api/auth/forgot-password', { email });
  check('unknown and known emails get the same answer (no account enumeration)', unknown.status === 202 && known.status === 202
    && unknown.json.message === known.json.message, { unknown: unknown.json, known: known.json });
  const token = await waitForServerLog(/reset-password#token=(\S+)/, since);
  check('dev mode prints the reset link to the server terminal', Boolean(token));
  if (!token) return;
  const weak = await call(null, 'POST', '/api/auth/reset-password', { token: decodeURIComponent(token), password: 'short', confirmPassword: 'short' });
  check('a weak new password is refused and the link stays usable', weak.status === 400 && weak.json.code !== 'RESET_TOKEN_INVALID', weak.json);
  const reset = await call(null, 'POST', '/api/auth/reset-password', { token: decodeURIComponent(token), password: newPassword, confirmPassword: newPassword });
  check('set a new password with the link', reset.status === 200 && reset.json.reset === true, reset.json);
  const reuse = await call(null, 'POST', '/api/auth/reset-password', { token: decodeURIComponent(token), password: newPassword, confirmPassword: newPassword });
  check('the same link cannot be used twice', reuse.status === 400 && reuse.json.code === 'RESET_TOKEN_INVALID', reuse.json);
  const me = await call('reset', 'GET', '/api/auth/me');
  check('the session opened before the reset is revoked', me.status === 401, me.status);
  const oldLogin = await call(null, 'POST', '/api/login', { email, password: oldPassword });
  check('the old password no longer works', oldLogin.status === 401, oldLogin.status);
  const newLogin = await call(null, 'POST', '/api/login', { email, password: newPassword });
  check('login with the new password', newLogin.status === 200 && Boolean(newLogin.json.accessToken), newLogin.json);
  await db.from('users').delete().eq('email', email);
}

// Gói Plus của người dùng + tài khoản chính thức Swipe Nest (nguồn hàng Swipe Nest, quyền lợi của Plus).
async function plus() {
  const officialEmail = 'qa.official@qa.test';
  const hash = await bcrypt.hash(PASSWORD, 10);
  const existing = (await db.from('users').select('id').eq('email', officialEmail).maybeSingle()).data;
  const row = { name: 'QA Swipe Nest', email: officialEmail, password: hash, role: 'AGENT', phone: '0911000009', is_active: true,
    email_verified_at: new Date().toISOString(), trust_score: 50, verification_status: 'UNVERIFIED', is_official: false };
  const officialId = existing ? (await db.from('users').update(row).eq('id', existing.id).select('id').single()).data.id
    : (await db.from('users').insert(row).select('id').single()).data.id;
  await db.from('seller_subscriptions').delete().eq('user_id', officialId);
  const uid = await userId('user');
  await db.from('user_subscriptions').delete().eq('user_id', uid);
  await db.from('user_subscription_audit').delete().eq('user_id', uid);
  ACCOUNTS.official = { email: officialEmail };
  await login('official'); await login('admin'); await login('user'); await login('agent1');

  const before = await call('official', 'POST', '/api/properties', listingPayload('QA Swipe Nest chưa chính thức'));
  check('an unverified agent without a plan cannot publish', before.status === 403, before.json);
  const flag = await call('admin', 'PUT', `/api/admin/agents/${officialId}/official`, { official: true });
  check('admin marks the account as official', flag.status === 200 && flag.json.account?.is_official === true, flag.json);
  const lookup = await call('admin', 'GET', `/api/admin/agents/subscription?email=${encodeURIComponent(officialEmail)}`);
  check('admin agent lookup shows is_official', lookup.json.agent?.is_official === true, lookup.json.agent);
  const created = await call('official', 'POST', '/api/properties', listingPayload('QA Nhà Swipe Nest', { thumbnail: 'https://picsum.photos/400' }));
  check('official account publishes without KYC or plan', created.status === 201, created.json?.error || created.json?.property?.id);
  if (created.status !== 201) return;
  const officialListing = created.json.property.id;
  state.officialListing = officialListing; save();
  const pub = await call('user', 'GET', `/api/properties/${officialListing}`);
  check('free user can see the official listing (badge data present)', pub.status === 200 && pub.json.property?.owner?.is_official === true, pub.json.property?.owner);

  const contact = await call('user', 'GET', `/api/properties/${officialListing}/contact-agent`);
  check('free user cannot open a chat with the official account (PLUS_REQUIRED)', contact.status === 403 && contact.json.code === 'PLUS_REQUIRED', contact.json);
  const msg = await call('user', 'POST', '/api/chat/messages', { receiverId: officialId, propertyId: officialListing, message: 'Xin chào' });
  check('free user cannot message the official account directly', msg.status === 403 && msg.json.code === 'PLUS_REQUIRED', msg.json);
  const sourceLocked = await call('user', 'GET', '/api/plus/official-listings');
  check('"Nguồn hàng Swipe Nest" section is locked for free users', sourceLocked.status === 403 && sourceLocked.json.code === 'PLUS_REQUIRED', sourceLocked.json);

  const catalog = await call('user', 'GET', '/api/plus/catalog');
  check('Plus catalog: 20.000đ / 1 tháng, not active yet', catalog.status === 200 && catalog.json.plans?.[0]?.amount_vnd === 20000
    && catalog.json.plans[0].duration_months === 1 && catalog.json.plus?.active === false, catalog.json);
  const agentPlus = await call('agent1', 'GET', '/api/plus/status');
  check('agents cannot use the user Plus API', agentPlus.status === 403, agentPlus.status);

  const grant = await call('admin', 'POST', `/api/admin/users/${uid}/plus/grant`, { requestId: crypto.randomUUID(), months: 1, reason: 'Tặng Plus cho QA' });
  check('admin grants 1 month of Plus', grant.status === 200 && grant.json.plus?.active === true, grant.json);
  const requestId = crypto.randomUUID();
  const grant2 = await call('admin', 'POST', `/api/admin/users/${uid}/plus/grant`, { requestId, months: 2, reason: 'Gia hạn cho QA' });
  const replay = await call('admin', 'POST', `/api/admin/users/${uid}/plus/grant`, { requestId, months: 2, reason: 'Gia hạn cho QA' });
  const periods = replay.json.plus?.periods || [];
  check('a second grant stacks after the first; a replayed request does not add a period', grant2.status === 200 && periods.length === 2
    && new Date(periods[1].start_date).getTime() === new Date(periods[0].end_date).getTime(), periods);
  const status = await call('user', 'GET', '/api/plus/status');
  check('user sees Plus active with the stacked end date', status.json.plus?.active === true && status.json.plus?.periods?.length === 2, status.json);

  const contact2 = await call('user', 'GET', `/api/properties/${officialListing}/contact-agent`);
  check('Plus user can open the chat with the official account', contact2.status === 200 && contact2.json.agentId === officialId, contact2.json);
  const msg2 = await call('user', 'POST', '/api/chat/messages', { receiverId: officialId, propertyId: officialListing, message: 'QA: căn này còn không ạ?' });
  check('Plus user can message the official account', msg2.status === 201, msg2.json);
  const reply = await call('official', 'POST', '/api/chat/messages', { receiverId: uid, propertyId: officialListing, message: 'QA: còn bạn nhé' });
  check('the official account replies', reply.status === 201, reply.json);

  const source = await call('user', 'GET', '/api/plus/official-listings');
  check('Plus user sees the official listing in "Nguồn hàng Swipe Nest"', source.status === 200
    && (source.json.properties || []).every((i) => i.owner?.is_official === true)
    && (source.json.properties || []).some((i) => i.id === officialListing), source.json);
  // Danh sách công khai trả tối đa 24 tin: lọc theo loại + khu vực của tin QA để tin này nằm trong trang đầu.
  const filters = encodeURIComponent(JSON.stringify({ district: 'Quận 1', minPrice: '11999999', maxPrice: '12000001' }));
  const list = await call(null, 'GET', `/api/properties?limit=24&filters=${filters}`);
  const item = (list.json.properties || []).find((i) => i.id === officialListing);
  check('public list carries is_official for the "Swipe Nest" badge', item?.owner?.is_official === true, item ? { owner: item.owner } : 'not in list');

  const order = await call('user', 'POST', '/api/plus/payments', { planCode: 'USER_PLUS', requestId: crypto.randomUUID(), planVersion: catalog.json.plans[0].version });
  check('Plus checkout: payOS order or a clear "not configured" answer', [200, 503].includes(order.status), order.json);
  if (order.status === 200 && order.json.id) await call('user', 'POST', `/api/plus/payments/${order.json.id}/cancel`, {});

  const remove = await call('admin', 'POST', `/api/admin/users/${uid}/plus/remove`, { requestId: crypto.randomUUID(), reason: 'Kết thúc kịch bản QA' });
  check('admin removes Plus', remove.status === 200 && remove.json.plus?.active === false, remove.json);
  const contact3 = await call('user', 'GET', `/api/properties/${officialListing}/contact-agent`);
  check('after removal the official chat is locked again', contact3.status === 403, contact3.status);
}

// Luồng 5, bước 1: xác minh số điện thoại bằng OTP (mã được in ra terminal ở chế độ dev).
async function phoneOtp() {
  if (!process.env.QA_SERVER_LOG) { check('QA_SERVER_LOG is set (path of the server log)', false); return; }
  await login('agent2');
  const since = serverLogLength();
  const sent = await call('agent2', 'POST', '/api/phone/send-otp', { phone: ACCOUNTS.agent2.phone });
  check('send OTP in dev console mode', sent.status === 200 && /terminal/.test(sent.json.message || ''), sent.json);
  const otp = await waitForServerLog(/\[DEV\] Mã OTP cho \S+: (\d{6})/, since);
  check('OTP code printed to the server terminal', Boolean(otp));
  if (!otp) return;
  const wrong = await call('agent2', 'POST', '/api/phone/verify-otp', { phone: ACCOUNTS.agent2.phone, otp: otp === '000000' ? '111111' : '000000' });
  check('a wrong OTP is refused', wrong.status === 400, wrong.json);
  const verified = await call('agent2', 'POST', '/api/phone/verify-otp', { phone: ACCOUNTS.agent2.phone, otp });
  check('the printed OTP verifies the phone', verified.status === 200 && verified.json.phone_verified === true, verified.json);
}

// Gợi ý cá nhân hóa: khảo sát → thứ tự feed, học từ lượt bỏ qua; badge môi giới đã xác thực.
async function reco() {
  await login('user');
  const options = await call('user', 'GET', '/api/me/preference-options?listingType=RENT');
  const locations = (options.json.options?.locations || []);
  const quan1 = locations.filter((item) => /\|quan_1$/.test(item.key));
  check('survey offers a single "Quận 1" option (no TP./non-TP. duplicates)', quan1.length === 1, quan1);
  // Bắt đầu từ lịch sử sạch: các lần thích / bỏ qua của bước trước cũng là tín hiệu và sẽ làm lệch %.
  const uid = await userId('user');
  await db.from('user_property_events').delete().eq('user_id', uid);
  const saved = await call('user', 'PUT', '/api/me/preferences', {
    listing_type: 'RENT', preferred_property_types: ['CAN_HO'], preferred_location_keys: ['tp_ho_chi_minh|quan_1'],
    min_price: 8000000, max_price: 15000000, min_bedrooms: 2, preferred_features: []
  });
  check('save survey preferences (legacy "tp_" key is normalised)', saved.status === 200
    && JSON.stringify(saved.json.preferences?.preferred_location_keys) === '["ho_chi_minh|quan_1"]', saved.json.preferences?.preferred_location_keys);
  const rec = await call('user', 'GET', '/api/recommendations?limit=24');
  const props = rec.json.properties || [];
  const ids = props.map((p) => p.id);
  const a = props.find((p) => p.id === state.listingA);
  check('feed returns listings and includes QA listing A', props.length > 0 && Boolean(a), ids);
  const unrelated = props.find((p) => !/căn hộ/i.test(p.property_type) && !/quận 1/i.test(p.district || ''));
  check('a listing matching the survey ranks above an unrelated one', !unrelated || ids.indexOf(state.listingA) < ids.indexOf(unrelated.id), ids);
  check('verified agent badge data reaches the card', a?.owner?.verification_status === 'VERIFIED', a?.owner);
  const page2 = await call('user', 'GET', `/api/recommendations?limit=2&offset=2&feedToken=${encodeURIComponent(rec.json.pagination?.feedToken || '')}`);
  check('next feed page loads with the feed token', page2.status === 200, page2.status);

  // Học từ hành vi: bỏ qua căn A thì căn A biến mất khỏi feed (30 ngày).
  const dislike = await call('user', 'POST', '/api/me/property-events', { propertyId: state.listingA, action: 'DISLIKE' });
  check('swipe left on listing A', dislike.status === 201, dislike.json);
  const after = (await call('user', 'GET', '/api/recommendations?limit=24')).json.properties || [];
  check('a disliked listing leaves the feed (30-day cooldown)', !after.some((p) => p.id === state.listingA), after.map((p) => p.id));
  await db.from('user_property_events').delete().eq('user_id', uid);
}

// Luồng 8: admin xử lý báo cáo → tin bị ẩn, môi giới bị trừ điểm → khiếu nại → admin duyệt, khôi phục.
async function moderation() {
  await login('admin'); await login('agent1');
  const A = state.listingA;
  const reports = await call('admin', 'GET', '/api/reports/admin');
  const rows = reports.json.reports || reports.json.items || reports.json || [];
  const report = rows.find((r) => Number(r.property_id ?? r.property?.id) === Number(A) && r.status === 'PENDING');
  check('pending report on listing A is listed for the admin', Boolean(report), reports.status);
  if (!report) return;
  const trust = async () => (await db.from('users').select('trust_score').eq('id', state.agent1Id).single()).data.trust_score;
  const before = await trust();
  const resolved = await call('admin', 'POST', `/api/reports/admin/${report.id}/resolve`, {});
  check('admin resolves the report', resolved.status === 200, resolved.json);
  const hidden = await call(null, 'GET', `/api/properties/${A}`);
  check('reported listing is hidden from the public', hidden.status === 404, hidden.status);
  const penalised = await trust();
  check('owner trust score is penalised', penalised < before, { before, after: penalised });
  const violations = await call('agent1', 'GET', '/api/appeals/my-violations');
  check('agent sees the violation', violations.status === 200 && JSON.stringify(violations.json).includes(`"id":${report.id}`), violations.status);
  const appeal = await call('agent1', 'POST', '/api/appeals', { reportId: report.id, reason: 'Giá trên tin đã được cập nhật đúng thực tế, kèm hợp đồng mới (QA).' });
  check('agent submits an appeal', appeal.status === 201, appeal.json);
  const appeals = await call('admin', 'GET', '/api/appeals/admin');
  const list = appeals.json.appeals || appeals.json.items || appeals.json || [];
  const mine = list.find((item) => Number(item.report_id) === Number(report.id));
  check('admin sees the appeal', Boolean(mine), appeals.status);
  if (!mine) return;
  const approved = await call('admin', 'POST', `/api/appeals/admin/${mine.id}/approve`, { adminNote: 'Đã kiểm tra, khôi phục tin (QA)' });
  check('admin approves the appeal', approved.status === 200, approved.json);
  const restored = await call(null, 'GET', `/api/properties/${A}`);
  check('listing is visible again after the appeal', restored.status === 200, restored.status);
  const refunded = await trust();
  check('trust score is refunded', refunded > penalised, { penalised, refunded });
}

const phases = { setup, register, 'password-reset': passwordReset, plus, 'phone-otp': phoneOtp, 'kyc-name-review': kycNameReview, 'kyc-reject': kycReject, 'admin-kyc': adminKyc, 'kyc-dup': kycDuplicate, listing, plans, user, admin, reco, moderation };
(async () => {
  for (const p of process.argv.slice(2)) { console.log(`\n=== ${p}`); await phases[p](); }
  console.log(`\n${failures ? failures + ' FAILED' : 'all passed'}`);
  process.exitCode = failures ? 1 : 0;
})().catch((e) => { console.error('CRASH', e); process.exitCode = 2; });
