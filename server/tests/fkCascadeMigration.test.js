const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('isolated PostgreSQL: 028 migration upgrades CASCADE/SET NULL FKs cleanly while protecting billing orders', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE public.app_schema_migrations (id text PRIMARY KEY, applied_at timestamptz DEFAULT now());
      CREATE TABLE public.users (id serial PRIMARY KEY, name text);
      CREATE TABLE public.properties (id serial PRIMARY KEY, owner_id integer REFERENCES public.users(id), city text, district text, ward text, average_rating numeric DEFAULT 0, review_count integer DEFAULT 0, updated_at timestamp DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE public.property_images (id serial PRIMARY KEY, property_id integer REFERENCES public.properties(id), image_url text);
      CREATE TABLE public.property_reviews (id serial PRIMARY KEY, property_id integer REFERENCES public.properties(id) ON DELETE CASCADE, user_id integer REFERENCES public.users(id), status text DEFAULT 'APPROVED', rating integer DEFAULT 5);
      CREATE TABLE public.property_reports (id serial PRIMARY KEY, property_id integer REFERENCES public.properties(id) ON DELETE CASCADE, reporter_id integer REFERENCES public.users(id) ON DELETE SET NULL, handled_by integer REFERENCES public.users(id));
      CREATE TABLE public.property_report_appeals (id serial PRIMARY KEY, report_id integer NOT NULL REFERENCES public.property_reports(id) ON DELETE CASCADE, agent_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, handled_by integer REFERENCES public.users(id));
      CREATE TABLE public.property_leads (id serial PRIMARY KEY, property_id integer REFERENCES public.properties(id) ON DELETE CASCADE, user_id integer REFERENCES public.users(id) ON DELETE SET NULL);
      CREATE TABLE public.property_view_events (id serial PRIMARY KEY, property_id integer REFERENCES public.properties(id) ON DELETE CASCADE, user_id integer REFERENCES public.users(id) ON DELETE SET NULL);
      CREATE TABLE public.favorites (id serial PRIMARY KEY, property_id integer REFERENCES public.properties(id) ON DELETE CASCADE, user_id integer REFERENCES public.users(id) ON DELETE CASCADE);
      CREATE TABLE public.swipe_actions (id serial PRIMARY KEY, property_id integer REFERENCES public.properties(id) ON DELETE CASCADE, user_id integer REFERENCES public.users(id) ON DELETE CASCADE);
      CREATE TABLE public.identity_verifications (id serial PRIMARY KEY, user_id integer REFERENCES public.users(id) ON DELETE CASCADE, reviewed_by integer REFERENCES public.users(id));
      CREATE TABLE public.phone_otps (id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES public.users(id));
      CREATE TABLE public.trust_score_logs (id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES public.users(id), related_property_id integer REFERENCES public.properties(id), related_report_id integer REFERENCES public.property_reports(id));
      CREATE TABLE public.agent_payment_orders (id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES public.users(id));
      CREATE FUNCTION public.update_property_rating() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;
    `);

    const sql028 = fs.readFileSync(path.join(__dirname, '../db-migration/028-fk-cascade-2025-areas.sql'), 'utf8');
    await db.exec(sql028);
    // Rerun is idempotent.
    await db.exec(sql028);

    await db.exec(`
      INSERT INTO public.users (id, name) VALUES (1, 'Seller'), (2, 'Buyer'), (3, 'Admin'), (4, 'PaidAgent');
      INSERT INTO public.properties (id, owner_id, ward) VALUES (10, 1, 'Phường Thủ Đức');
      INSERT INTO public.property_images (property_id, image_url) VALUES (10, 'https://example.com/1.jpg');
      INSERT INTO public.property_reviews (property_id, user_id) VALUES (10, 2);
      INSERT INTO public.property_reports (id, property_id, reporter_id, handled_by) VALUES (20, 10, 2, 3);
      INSERT INTO public.property_report_appeals (report_id, agent_id, handled_by) VALUES (20, 1, 3);
      INSERT INTO public.property_leads (property_id, user_id) VALUES (10, 2);
      INSERT INTO public.property_view_events (property_id, user_id) VALUES (10, 2), (10, NULL);
      INSERT INTO public.identity_verifications (user_id, reviewed_by) VALUES (1, 3);
      INSERT INTO public.phone_otps (user_id) VALUES (2);
      INSERT INTO public.trust_score_logs (user_id, related_property_id, related_report_id) VALUES (1, 10, 20), (2, NULL, NULL);
      INSERT INTO public.agent_payment_orders (user_id) VALUES (4);
    `);

    // Deleting Buyer cascades their reviews/reports/leads/views/otps/logs; Admin deletion SET NULLs handler columns.
    await db.exec('DELETE FROM public.users WHERE id IN (2, 3)');
    assert.equal((await db.query('SELECT count(*)::int AS c FROM public.property_reviews WHERE user_id = 2')).rows[0].c, 0);
    assert.equal((await db.query('SELECT count(*)::int AS c FROM public.property_reports WHERE reporter_id = 2')).rows[0].c, 0);
    assert.equal((await db.query('SELECT count(*)::int AS c FROM public.property_leads WHERE user_id = 2')).rows[0].c, 0);
    assert.equal((await db.query('SELECT count(*)::int AS c FROM public.phone_otps WHERE user_id = 2')).rows[0].c, 0);
    assert.equal((await db.query('SELECT count(*)::int AS c FROM public.property_view_events WHERE property_id = 10 AND user_id IS NULL')).rows[0].c, 1);
    assert.equal((await db.query('SELECT reviewed_by FROM public.identity_verifications WHERE user_id = 1')).rows[0].reviewed_by, null);

    // Deleting Seller cascades properties -> images & SET NULLs trust_score_logs.related_property_id? Deleting Seller also cascades their own trust_score_logs!
    await db.exec('DELETE FROM public.users WHERE id = 1');
    assert.equal((await db.query('SELECT count(*)::int AS c FROM public.properties')).rows[0].c, 0);
    assert.equal((await db.query('SELECT count(*)::int AS c FROM public.property_images')).rows[0].c, 0);
    assert.equal((await db.query('SELECT count(*)::int AS c FROM public.trust_score_logs')).rows[0].c, 0);

    // PaidAgent still protected by NO ACTION FK on agent_payment_orders.
    await assert.rejects(db.exec('DELETE FROM public.users WHERE id = 4'), /violates foreign key constraint/);

    // Non-nullable owner/reporter/image checks are enforced, while view user_id stays nullable.
    await assert.rejects(db.exec('INSERT INTO public.properties (owner_id) VALUES (NULL)'), /null value in column "owner_id"/);
    await assert.rejects(db.exec('INSERT INTO public.property_reports (property_id, reporter_id) VALUES (10, NULL)'), /null value in column "reporter_id"/);

    const mig = await db.query("SELECT id FROM public.app_schema_migrations WHERE id = '028'");
    assert.equal(mig.rows.length, 1);
  } finally {
    await db.close();
  }
});

