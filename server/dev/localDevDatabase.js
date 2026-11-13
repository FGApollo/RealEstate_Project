const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { buildFixtures } = require('../data/discoveryFixtures');

async function createDevDatabase() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;

    CREATE TABLE users (
      id serial PRIMARY KEY,
      name text,
      email text UNIQUE,
      password text,
      avatar text,
      role varchar(20) DEFAULT 'USER',
      phone text,
      phone_verified boolean DEFAULT false,
      email_verified_at timestamptz DEFAULT now(),
      verification_status text DEFAULT 'UNVERIFIED',
      trust_score integer DEFAULT 50,
      is_active boolean DEFAULT true,
      is_official boolean DEFAULT false,
      created_at timestamp DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE auth_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id integer REFERENCES users(id) ON DELETE CASCADE,
      refresh_token_hash text,
      expires_at timestamptz,
      revoked_at timestamptz,
      created_at timestamptz DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE properties (
      id serial PRIMARY KEY,
      owner_id integer REFERENCES users(id) ON DELETE CASCADE,
      title text NOT NULL,
      description text,
      price numeric NOT NULL,
      area numeric NOT NULL,
      bedrooms integer DEFAULT 1,
      bathrooms integer DEFAULT 1,
      property_type text NOT NULL,
      listing_type text DEFAULT 'RENT',
      status text DEFAULT 'AVAILABLE',
      city text DEFAULT 'Thành phố Hồ Chí Minh',
      district text,
      ward text,
      address text,
      address_detail text,
      thumbnail text,
      virtual_tour_url text,
      contact_phone text,
      latitude numeric,
      longitude numeric,
      is_public boolean DEFAULT true,
      is_hidden boolean DEFAULT false,
      priority_score integer DEFAULT 0,
      created_at timestamp DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamp DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE property_features (
      id serial PRIMARY KEY,
      property_id integer REFERENCES properties(id) ON DELETE CASCADE,
      feature_name text NOT NULL
    );

    CREATE TABLE property_images (
      id serial PRIMARY KEY,
      property_id integer REFERENCES properties(id) ON DELETE CASCADE,
      image_url text NOT NULL
    );

    CREATE TABLE lifestyle_tags (
      id serial PRIMARY KEY,
      property_id integer REFERENCES properties(id) ON DELETE CASCADE,
      tag_name text NOT NULL
    );

    CREATE TABLE property_admin_checks (
      id serial PRIMARY KEY,
      property_id integer REFERENCES properties(id) ON DELETE CASCADE,
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE seller_subscriptions (
      id serial PRIMARY KEY,
      user_id integer REFERENCES users(id) ON DELETE CASCADE,
      plan_name varchar(50) DEFAULT 'PRO',
      support_tier varchar(50) DEFAULT 'PRO',
      price_vnd numeric DEFAULT 1000000,
      listing_limit integer DEFAULT 50,
      priority_points integer DEFAULT 300,
      source text DEFAULT 'PAYOS',
      start_date timestamptz DEFAULT CURRENT_TIMESTAMP,
      end_date timestamptz DEFAULT (CURRENT_TIMESTAMP + interval '1 month'),
      status varchar(20) DEFAULT 'ACTIVE',
      created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamptz DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE user_subscriptions (
      id serial PRIMARY KEY,
      user_id integer REFERENCES users(id) ON DELETE CASCADE,
      plan_code text DEFAULT 'USER_PLUS',
      source text DEFAULT 'PAYOS',
      start_date timestamptz DEFAULT CURRENT_TIMESTAMP,
      end_date timestamptz DEFAULT (CURRENT_TIMESTAMP + interval '1 month'),
      status varchar(20) DEFAULT 'ACTIVE',
      created_at timestamptz DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE user_billing_plans (
      code text PRIMARY KEY,
      name text NOT NULL,
      amount_vnd numeric NOT NULL,
      duration_months integer DEFAULT 1,
      version integer DEFAULT 1,
      active boolean DEFAULT true
    );

    CREATE TABLE agent_billing_plans (
      code text PRIMARY KEY,
      name text NOT NULL,
      amount_vnd numeric NOT NULL,
      listing_limit integer DEFAULT 10,
      priority_points integer DEFAULT 100,
      support_tier text DEFAULT 'LITE',
      duration_months integer DEFAULT 1,
      version integer DEFAULT 1,
      active boolean DEFAULT true
    );

    CREATE TABLE agent_payment_orders (
      id serial PRIMARY KEY,
      order_code bigint,
      user_id integer REFERENCES users(id) ON DELETE CASCADE,
      plan_code text,
      amount_vnd numeric,
      audience text DEFAULT 'AGENT',
      status text DEFAULT 'PENDING',
      checkout_url text,
      created_at timestamptz DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE messages (
      id serial PRIMARY KEY,
      sender_id integer REFERENCES users(id) ON DELETE CASCADE,
      receiver_id integer REFERENCES users(id) ON DELETE CASCADE,
      property_id integer REFERENCES properties(id) ON DELETE SET NULL,
      content text,
      attachments jsonb DEFAULT '[]'::jsonb,
      is_read boolean DEFAULT false,
      created_at timestamptz DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE favorites (
      id serial PRIMARY KEY,
      user_id integer REFERENCES users(id) ON DELETE CASCADE,
      property_id integer REFERENCES properties(id) ON DELETE CASCADE,
      created_at timestamptz DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE agent_user_funnel (
      id serial PRIMARY KEY,
      agent_id integer REFERENCES users(id) ON DELETE CASCADE,
      user_id integer REFERENCES users(id) ON DELETE CASCADE,
      funnel_stage text DEFAULT 'LEAD',
      created_at timestamptz DEFAULT CURRENT_TIMESTAMP
    );

    CREATE OR REPLACE FUNCTION public.unaccent_fallback(p_str text)
    RETURNS text LANGUAGE sql IMMUTABLE AS $$
      SELECT coalesce(p_str, '');
    $$;

    CREATE OR REPLACE FUNCTION public.listing_property_type_key(p_type text)
    RETURNS text LANGUAGE sql IMMUTABLE AS $$
      SELECT CASE lower(trim(coalesce(p_type, '')))
        WHEN 'phòng trọ' THEN 'PHONG_TRO'
        WHEN 'căn hộ' THEN 'CAN_HO'
        WHEN 'chung cư' THEN 'CHUNG_CU'
        WHEN 'nhà ở' THEN 'NHA_O'
        WHEN 'văn phòng' THEN 'VAN_PHONG'
        WHEN 'mặt bằng' THEN 'MAT_BANG'
        ELSE upper(replace(trim(coalesce(p_type, '')),' ','_'))
      END;
    $$;

    CREATE OR REPLACE FUNCTION public.listing_location_key(p_location text)
    RETURNS text LANGUAGE sql IMMUTABLE AS $$
      SELECT lower(regexp_replace(public.unaccent_fallback(p_location), '[^a-zA-Z0-9]+', ' ', 'g'));
    $$;

    CREATE OR REPLACE VIEW public.ranked_properties AS
    SELECT p.*,
      coalesce(s.priority_points, 0) + coalesce(p.priority_score, 0) AS display_priority,
      public.listing_property_type_key(p.property_type) AS property_type_key,
      ARRAY(SELECT lower(feature_name) FROM public.property_features WHERE property_id=p.id
        UNION SELECT lower(tag_name) FROM public.lifestyle_tags WHERE property_id=p.id) AS search_features
    FROM properties p
    LEFT JOIN (
      SELECT DISTINCT ON (user_id) user_id, priority_points
      FROM seller_subscriptions
      WHERE status='ACTIVE' AND start_date <= now() AND end_date > now()
      ORDER BY user_id, start_date DESC, id DESC
    ) s ON s.user_id = p.owner_id
    WHERE p.status = 'AVAILABLE' AND p.is_hidden IS NOT TRUE AND p.is_public IS TRUE;

    CREATE OR REPLACE FUNCTION public.search_ranked_properties(
      p_filters jsonb DEFAULT '{}'::jsonb,
      p_listing_type text DEFAULT NULL::text,
      p_category text DEFAULT NULL::text,
      p_limit integer DEFAULT 24,
      p_ids integer[] DEFAULT NULL::integer[],
      p_offset integer DEFAULT 0
    )
    RETURNS jsonb LANGUAGE plpgsql AS $$
    DECLARE v_items jsonb;
    BEGIN
      WITH candidates AS (
        SELECT p.* FROM public.ranked_properties p
        WHERE (p_ids IS NULL OR p.id = ANY(p_ids))
          AND (p_listing_type IS NULL OR p.listing_type = p_listing_type)
          AND (p_category IS NULL OR p.property_type_key = public.listing_property_type_key(p_category))
        ORDER BY CASE WHEN p_ids IS NOT NULL THEN array_position(p_ids, p.id) END,
          p.display_priority DESC, p.id DESC
        LIMIT p_limit OFFSET p_offset
      )
      SELECT coalesce(jsonb_agg(item ORDER BY position, display_priority DESC, id DESC), '[]'::jsonb) INTO v_items FROM (
        SELECT p.id, p.display_priority, array_position(p_ids, p.id) AS position,
          (to_jsonb(p) - 'search_features' - 'property_type_key') || jsonb_build_object(
            'owner', jsonb_build_object('name', u.name, 'role', u.role, 'avatar', u.avatar, 'trust_score', u.trust_score,
              'verification_status', u.verification_status, 'created_at', u.created_at, 'is_official', u.is_official),
            'admin_checked', EXISTS (SELECT 1 FROM public.property_admin_checks c WHERE c.property_id=p.id),
            'property_features', coalesce((SELECT jsonb_agg(jsonb_build_object('feature_name', feature_name)) FROM public.property_features WHERE property_id=p.id), '[]'::jsonb),
            'property_images', coalesce((SELECT jsonb_agg(jsonb_build_object('image_url', image_url)) FROM public.property_images WHERE property_id=p.id), '[]'::jsonb),
            'lifestyle_tags', coalesce((SELECT jsonb_agg(jsonb_build_object('tag_name', tag_name)) FROM public.lifestyle_tags WHERE property_id=p.id), '[]'::jsonb)) AS item
        FROM candidates p JOIN public.users u ON u.id = p.owner_id
      ) rows;
      RETURN v_items;
    END; $$;

    INSERT INTO user_billing_plans (code, name, amount_vnd, duration_months, version, active)
    VALUES ('USER_PLUS', 'Swipe Nest Plus', 20000, 1, 1, true);

    INSERT INTO agent_billing_plans (code, name, amount_vnd, listing_limit, priority_points, support_tier, duration_months, version, active)
    VALUES
      ('LITE', 'Gói Khởi Đầu (Lite)', 300000, 10, 100, 'LITE', 1, 1, true),
      ('PLUS', 'Gói Nâng Cao (Plus)', 500000, 20, 200, 'PLUS', 1, 1, true),
      ('PRO', 'Gói Chuyên Nghiệp (Pro)', 1000000, 50, 300, 'PRO', 1, 1, true);

    -- Password for all seeded users is: Password123!
    INSERT INTO users (id, name, email, password, role, phone, phone_verified, verification_status, trust_score, is_active, is_official)
    VALUES
      (1, 'Nguyễn Văn Plus (Đã mua Plus)', 'plus.user@estate.test', '$2b$10$NOQO6hndtIwknCrhmnCxkuvL2h/ZEs5xsa2.1CQH7934UeYvKsqmm', 'USER', '0901111111', true, 'UNVERIFIED', 50, true, false),
      (2, 'Trần Môi Giới Pro (Đã mua gói Pro)', 'pro.agent@estate.test', '$2b$10$NOQO6hndtIwknCrhmnCxkuvL2h/ZEs5xsa2.1CQH7934UeYvKsqmm', 'AGENT', '0902222222', true, 'VERIFIED', 95, true, false),
      (3, 'Swipe Nest Official', 'swipenest.discovery.seed@estate.test', '$2b$10$NOQO6hndtIwknCrhmnCxkuvL2h/ZEs5xsa2.1CQH7934UeYvKsqmm', 'AGENT', '0903333333', true, 'VERIFIED', 100, true, true),
      (4, 'Người Dùng Thường (Chưa mua Plus)', 'free.user@estate.test', '$2b$10$NOQO6hndtIwknCrhmnCxkuvL2h/ZEs5xsa2.1CQH7934UeYvKsqmm', 'USER', '0904444444', true, 'UNVERIFIED', 50, true, false);

    -- User 1 active Plus subscription & order history
    INSERT INTO user_subscriptions (user_id, plan_code, source, start_date, end_date, status)
    VALUES (1, 'USER_PLUS', 'PAYOS', now(), now() + interval '30 days', 'ACTIVE');

    INSERT INTO agent_payment_orders (order_code, user_id, plan_code, amount_vnd, audience, status)
    VALUES (100001, 1, 'USER_PLUS', 20000, 'USER', 'PAID');

    -- Agent 2 active Pro subscription & order history
    INSERT INTO seller_subscriptions (user_id, plan_name, support_tier, price_vnd, listing_limit, priority_points, start_date, end_date, status)
    VALUES (2, 'PRO', 'PRO', 1000000, 50, 300, now(), now() + interval '30 days', 'ACTIVE');

    INSERT INTO agent_payment_orders (order_code, user_id, plan_code, amount_vnd, audience, status)
    VALUES (100002, 2, 'PRO', 1000000, 'AGENT', 'PAID');
  `);

  // Seed fixtures
  const fixtures = buildFixtures();
  for (const item of fixtures) {
    const p = item.property;
    const ownerId = item.key.includes('-1') || item.key.includes('-3') ? 3 : 2;
    const res = await db.query(`
      INSERT INTO properties (owner_id, title, description, price, area, bedrooms, bathrooms, property_type, listing_type, city, district, ward, address, address_detail, thumbnail)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id
    `, [
      ownerId, p.title, p.description, p.price, p.area, p.bedrooms, p.bathrooms,
      p.property_type, p.listing_type, p.city, p.district, p.ward, p.address,
      p.address_detail, p.thumbnail
    ]);
    const propId = res.rows[0].id;
    for (const f of item.features || []) {
      await db.query('INSERT INTO property_features (property_id, feature_name) VALUES ($1, $2)', [propId, f]);
    }
    for (const t of item.tags || []) {
      await db.query('INSERT INTO lifestyle_tags (property_id, tag_name) VALUES ($1, $2)', [propId, t]);
    }
    if (p.thumbnail) {
      await db.query('INSERT INTO property_images (property_id, image_url) VALUES ($1, $2)', [propId, p.thumbnail]);
    }
  }

  return db;
}

module.exports = { createDevDatabase };
