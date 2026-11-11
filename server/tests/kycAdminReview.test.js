const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { normalizePersonName, isNameMismatch } = require('../services/kycNamePolicy');

const migration = (name) => fs.readFileSync(path.join(__dirname, '../db-migration', name), 'utf8');

async function createDatabase() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE users (
      id integer PRIMARY KEY, name text, email text, phone text, role varchar(20) DEFAULT 'USER',
      verification_status varchar(20) DEFAULT 'UNVERIFIED', trust_score integer DEFAULT 50,
      is_active boolean DEFAULT true, updated_at timestamp
    );
    CREATE TABLE identity_verifications (
      id serial PRIMARY KEY, user_id integer REFERENCES users(id), full_name varchar(100), phone varchar(20),
      id_card_front_url varchar(500), id_card_back_url varchar(500), selfie_url varchar(500),
      status varchar(20) DEFAULT 'PENDING', reject_reason text, reviewed_by integer, reviewed_at timestamp,
      created_at timestamp DEFAULT CURRENT_TIMESTAMP, updated_at timestamp DEFAULT CURRENT_TIMESTAMP,
      ocr_data jsonb, id_number varchar(20), selfie_attempts integer NOT NULL DEFAULT 0
    );
    INSERT INTO users (id, name, role, verification_status) VALUES
      (1, 'Admin', 'ADMIN', 'VERIFIED'), (2, 'Agent A', 'AGENT', 'PENDING'),
      (3, 'Agent B', 'AGENT', 'REJECTED'), (4, 'Agent C', 'AGENT', 'PENDING'), (5, 'Plain user', 'USER', 'UNVERIFIED');
  `);
  await db.exec(migration('020-schema-migration-ledger.sql'));
  await db.exec(migration('022-kyc-name-check-and-admin-review.sql'));
  // Chạy lại lần hai phải an toàn.
  await db.exec(migration('022-kyc-name-check-and-admin-review.sql'));
  await db.exec(`
    INSERT INTO identity_verifications (id, user_id, full_name, declared_name, name_mismatch, status, selfie_url, selfie_attempts, updated_at) VALUES
      (10, 2, 'TO XUAN NAM', 'Agent A', true, 'PENDING', 'kyc/2/selfie.jpg', 1, '2026-11-01 10:00'),
      (11, 3, 'Agent B', 'Agent B', false, 'REJECTED', NULL, 5, '2026-11-02 10:00'),
      (12, 4, 'Agent C', 'Agent C', false, 'REJECTED', NULL, 5, '2026-10-01 10:00'),
      (13, 4, 'Agent C', 'Agent C', false, 'PENDING', NULL, 0, '2026-11-03 10:00');
    SELECT setval('identity_verifications_id_seq', 20);
  `);
  return db;
}

test('name policy ignores accents, case and spacing but flags different names', () => {
  assert.equal(normalizePersonName('  Tô  Xuân Nam '), 'TO XUAN NAM');
  assert.equal(normalizePersonName('Đỗ Thị Đào'), 'DO THI DAO');
  assert.equal(isNameMismatch('TÔ XUÂN NAM', 'to xuan nam'), false);
  assert.equal(isNameMismatch('TO XUAN NAM', 'QA Agent One'), true);
  assert.equal(isNameMismatch('', 'QA Agent One'), false);
  assert.equal(isNameMismatch('TO XUAN NAM', ''), false);
});

test('admin_kyc_list returns the latest record per user for one status, paginated, without image paths', async () => {
  const db = await createDatabase();
  const list = async (status, page = 1, limit = 20) => (await db.query(
    'SELECT public.admin_kyc_list($1,$2,$3) AS data', [status, page, limit])).rows[0].data;

  const pending = await list('PENDING');
  assert.equal(pending.total, 2);
  assert.deepEqual(pending.items.map((item) => item.id), [13, 10]);
  assert.equal(pending.items[1].name_mismatch, true);
  assert.equal(pending.items[1].has_selfie, true);
  assert.equal(pending.items[0].has_selfie, false);
  assert.equal(pending.items[0].selfie_attempts, 0);
  assert.equal(pending.items[1].user.name, 'Agent A');
  for (const item of pending.items) {
    for (const hidden of ['selfie_url', 'id_card_front_url', 'id_card_back_url']) assert.ok(!Object.hasOwn(item, hidden));
  }

  // Agent C's older REJECTED record is superseded by the newer PENDING one.
  const rejected = await list('REJECTED');
  assert.deepEqual(rejected.items.map((item) => item.id), [11]);

  const paged = await list('PENDING', 2, 1);
  assert.equal(paged.total, 2);
  assert.deepEqual(paged.items.map((item) => item.id), [10]);

  await assert.rejects(list('APPROVED'), /Invalid KYC list query/);
  await assert.rejects(list('PENDING', 1, 51), /Invalid KYC list query/);
});

test('admin_approve_kyc updates both tables atomically and rejects non-admins', async () => {
  const db = await createDatabase();
  const approve = async (verificationId, adminId) => (await db.query(
    'SELECT public.admin_approve_kyc($1,$2) AS data', [verificationId, adminId])).rows[0].data;
  const state = async () => (await db.query(`SELECT v.status, v.reviewed_by, u.verification_status
    FROM identity_verifications v JOIN users u ON u.id = v.user_id WHERE v.id = 10`)).rows[0];

  await assert.rejects(approve(10, 2), /Permission denied/);
  await assert.rejects(approve(999, 1), /Verification not found/);

  // A failure while updating the account must roll the verification back too.
  await db.exec(`
    CREATE FUNCTION fail_user_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated failure'; END $$;
    CREATE TRIGGER fail_user_update BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION fail_user_update();
  `);
  await assert.rejects(approve(10, 1), /simulated failure/);
  assert.deepEqual(await state(), { status: 'PENDING', reviewed_by: null, verification_status: 'PENDING' });
  await db.exec('DROP TRIGGER fail_user_update ON users');

  const result = await approve(10, 1);
  assert.equal(result.applied, true);
  assert.deepEqual(await state(), { status: 'APPROVED', reviewed_by: 1, verification_status: 'VERIFIED' });

  const again = await approve(10, 1);
  assert.equal(again.applied, false);
});
