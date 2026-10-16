const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('isolated PostgreSQL: app grants/RLS/storage policies close anonymous access while preserving backend and unrelated objects', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE public.users (id serial PRIMARY KEY, name text);
      INSERT INTO public.users(name) VALUES ('isolated fixture');
      CREATE TABLE public.identity_verifications (id bigint PRIMARY KEY, user_id bigint, status text);
      INSERT INTO public.identity_verifications VALUES (1,42,'PENDING'), (2,43,'PENDING'), (3,42,'APPROVED');
      CREATE TABLE public.unrelated_extension_fixture(id integer);
      CREATE FUNCTION public.unrelated_extension_fixture() RETURNS integer LANGUAGE SQL AS 'SELECT 1';
      CREATE FUNCTION public.admin_analytics_dashboard() RETURNS integer LANGUAGE SQL AS 'SELECT 1';
      CREATE SCHEMA storage;
      CREATE TABLE storage.buckets(id text PRIMARY KEY, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      INSERT INTO storage.buckets VALUES ('kyc-documents',false,NULL,NULL),('evidence-documents',true,NULL,NULL),('property-images',true,NULL,NULL);
      CREATE TABLE storage.objects(id serial PRIMARY KEY, bucket_id text);
      INSERT INTO storage.objects(bucket_id) VALUES ('kyc-documents'),('evidence-documents'),('property-images');
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      CREATE POLICY legacy_open_storage ON storage.objects FOR ALL TO anon,authenticated USING(true) WITH CHECK(true);
      GRANT USAGE ON SCHEMA public,storage TO anon,authenticated,service_role;
      GRANT ALL ON ALL TABLES IN SCHEMA public,storage TO PUBLIC,anon,authenticated,service_role;
      GRANT SELECT(name), UPDATE(name) ON public.users TO anon,authenticated;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public,storage TO PUBLIC,anon,authenticated,service_role;
    `);
    await db.exec(fs.readFileSync(path.join(__dirname, '../db-migration/011-backend-only-data-access.sql'), 'utf8'));
    // Migration is safe to rerun.
    await db.exec(fs.readFileSync(path.join(__dirname, '../db-migration/011-backend-only-data-access.sql'), 'utf8'));
    const { rows: [privileges] } = await db.query(`SELECT
      has_table_privilege('anon','public.users','SELECT') AS anon_read,
      has_column_privilege('anon','public.users','name','SELECT') AS anon_column_read,
      has_table_privilege('authenticated','public.users','UPDATE') AS client_write,
      has_sequence_privilege('anon','public.users_id_seq','USAGE') AS anon_sequence,
      has_table_privilege('service_role','public.users','SELECT,UPDATE') AS backend_access,
      has_function_privilege('anon','public.admin_analytics_dashboard()','EXECUTE') AS anon_rpc,
      has_function_privilege('service_role','public.admin_analytics_dashboard()','EXECUTE') AS backend_rpc,
      has_table_privilege('anon','public.unrelated_extension_fixture','SELECT') AS unrelated_table,
      has_function_privilege('anon','public.unrelated_extension_fixture()','EXECUTE') AS unrelated_rpc`);
    assert.deepEqual(privileges, { anon_read: false, anon_column_read: false, client_write: false, anon_sequence: false, backend_access: true, anon_rpc: false, backend_rpc: true, unrelated_table: true, unrelated_rpc: true });
    await db.exec('SET ROLE anon');
    await assert.rejects(db.query('SELECT * FROM public.users'), /permission denied/);
    assert.deepEqual((await db.query('SELECT bucket_id FROM storage.objects ORDER BY bucket_id')).rows, [{ bucket_id: 'property-images' }]);
    await assert.rejects(db.query("INSERT INTO storage.objects(id,bucket_id) VALUES(99,'property-images')"), /row-level security/);
    assert.equal((await db.query('DELETE FROM storage.objects RETURNING id')).rows.length, 0);
    await assert.rejects(db.query('SELECT public.reserve_kyc_selfie_attempt(1,42)'), /permission denied/);
    await db.exec('RESET ROLE; SET ROLE service_role');
    assert.equal((await db.query('SELECT count(*)::integer AS n FROM public.users')).rows[0].n, 1);
    assert.equal((await db.query('SELECT public.reserve_kyc_selfie_attempt(2,42) AS attempt')).rows[0].attempt, null);
    assert.equal((await db.query('SELECT public.reserve_kyc_selfie_attempt(3,42) AS attempt')).rows[0].attempt, null);
    for (let attempt = 1; attempt <= 5; attempt++) assert.equal((await db.query('SELECT public.reserve_kyc_selfie_attempt(1,42) AS attempt')).rows[0].attempt, attempt);
    assert.equal((await db.query('SELECT public.reserve_kyc_selfie_attempt(1,42) AS attempt')).rows[0].attempt, null);
    await db.exec('RESET ROLE');
    assert.deepEqual((await db.query('SELECT id,public FROM storage.buckets ORDER BY id')).rows, [
      { id: 'evidence-documents', public: false }, { id: 'kyc-documents', public: false }, { id: 'property-images', public: true }
    ]);
  } finally { await db.close(); }
});
