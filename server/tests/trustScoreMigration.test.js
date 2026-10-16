const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('PostgreSQL trust mutations are atomic, idempotent and inaccessible to browser roles', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE users(id bigint PRIMARY KEY, trust_score integer);
      CREATE TABLE trust_score_logs(id serial PRIMARY KEY,user_id bigint, action text,point_change integer,
        old_score integer,new_score integer,reason text,related_property_id bigint,related_report_id bigint);
      INSERT INTO users VALUES(1,50);
      GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
      GRANT ALL ON users,trust_score_logs TO service_role;
      GRANT USAGE,SELECT ON SEQUENCE trust_score_logs_id_seq TO service_role;
    `);
    const migration = fs.readFileSync(path.join(__dirname, '../db-migration/012-security-trust-score.sql'), 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    await db.exec('SET ROLE anon');
    await assert.rejects(db.query("SELECT security_apply_trust_score(1,'PROFILE_COMPLETED',5,'fixture')"), /permission denied/);
    await db.exec('RESET ROLE; SET ROLE authenticated');
    await assert.rejects(db.query("SELECT security_apply_trust_score(1,'PROFILE_COMPLETED',5,'fixture')"), /permission denied/);
    await db.exec('RESET ROLE; SET ROLE service_role');
    const apply = async (action, delta, report = null) => (await db.query(
      "SELECT security_apply_trust_score(1,$1,$2,'fixture',NULL,$3) AS result", [action, delta, report]
    )).rows[0].result;
    const claims = await Promise.all(Array.from({ length: 20 }, () => apply('PROFILE_COMPLETED', 5)));
    assert.equal(claims.filter((claim) => claim.applied).length, 1);
    assert.equal((await db.query("SELECT count(*)::integer AS n FROM trust_score_logs WHERE action='PROFILE_COMPLETED'")).rows[0].n, 1);
    assert.equal((await apply('KYC_APPROVED', 20)).newScore, 75);
    assert.equal((await apply('KYC_APPROVED', 20)).applied, false);
    assert.equal((await apply('KYC_REVOKED', -20)).newScore, 55);
    assert.equal((await apply('KYC_REVOKED', -20)).applied, false);
    assert.equal((await apply('KYC_APPROVED', 20)).newScore, 75);
    assert.equal((await apply('REPORT_WRONG_PRICE', -5, 10)).newScore, 70);
    assert.equal((await apply('REPORT_WRONG_LOCATION', -10, 10)).applied, false);
    assert.equal((await apply('APPEAL_PENALTY_REFUND', 5, 10)).newScore, 75);
    assert.equal((await apply('APPEAL_PENALTY_REFUND', 5, 10)).applied, false);
    await assert.rejects(apply('INVALID', 101), /Invalid trust-score mutation/);
    assert.equal((await db.query('SELECT trust_score FROM users WHERE id=1')).rows[0].trust_score, 75);
    // A log failure must roll back its score write in the same SQL transaction.
    await db.exec('RESET ROLE; ALTER TABLE trust_score_logs ADD CONSTRAINT reject_fixture_action CHECK(action <> \'FAIL_LOG\'); SET ROLE service_role');
    await assert.rejects(apply('FAIL_LOG', 10), /reject_fixture_action/);
    assert.equal((await db.query('SELECT trust_score FROM users WHERE id=1')).rows[0].trust_score, 75);
  } finally { await db.close(); }
});
