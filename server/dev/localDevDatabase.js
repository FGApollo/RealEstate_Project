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

    CREATE TABLE app_schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now(),
      note text
    );

    CREATE TABLE auth_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id integer REFERENCES users(id) ON DELETE CASCADE,
      refresh_token_hash text,
      expires_at timestamptz,
      rotated_at timestamptz,
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
      amount_vnd integer NOT NULL,
      duration_months integer DEFAULT 1,
      version integer DEFAULT 1,
      active boolean DEFAULT true,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE agent_billing_plans (
      code text PRIMARY KEY,
      name text NOT NULL,
      amount_vnd integer NOT NULL,
      listing_limit integer DEFAULT 10,
      priority_points integer DEFAULT 100,
      support_tier text DEFAULT 'LITE',
      duration_months integer DEFAULT 1,
      version integer DEFAULT 1,
      active boolean DEFAULT true,
      updated_at timestamptz NOT NULL DEFAULT now()
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
      (4, 'Người Dùng Thường (Chưa mua Plus)', 'free.user@estate.test', '$2b$10$NOQO6hndtIwknCrhmnCxkuvL2h/ZEs5xsa2.1CQH7934UeYvKsqmm', 'USER', '0904444444', true, 'UNVERIFIED', 50, true, false),
      (5, 'Admin Swipe Nest', 'admin@estate.test', '$2b$10$NOQO6hndtIwknCrhmnCxkuvL2h/ZEs5xsa2.1CQH7934UeYvKsqmm', 'ADMIN', '0905555555', true, 'VERIFIED', 100, true, false);
    SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT max(id) FROM users));

    CREATE TABLE IF NOT EXISTS public.agent_service_packages (
      code text PRIMARY KEY, name text NOT NULL, description text NOT NULL,
      price_kind text NOT NULL, duration_months integer, sort_order integer NOT NULL
    );
    INSERT INTO public.agent_service_packages(code, name, description, price_kind, duration_months, sort_order) VALUES
      ('LITE', 'Lite', 'Dành cho môi giới có danh mục nhỏ', 'FIXED', 1, 1),
      ('PLUS', 'Plus', 'Mở rộng danh mục và tăng ưu tiên hiển thị', 'FIXED', 1, 2),
      ('PRO', 'Pro', 'Danh mục lớn với ưu tiên hiển thị cao nhất', 'FIXED', 1, 3)
    ON CONFLICT (code) DO NOTHING;

    CREATE TABLE IF NOT EXISTS public.agent_plan_schedules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_code text NOT NULL REFERENCES public.agent_billing_plans(code),
      amount_vnd integer NOT NULL, duration_months integer NOT NULL, active boolean NOT NULL,
      effective_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'SCHEDULED',
      actor_id integer NOT NULL REFERENCES public.users(id), reason text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
    );
    CREATE TABLE IF NOT EXISTS public.agent_plan_audit (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      plan_code text NOT NULL REFERENCES public.agent_billing_plans(code),
      action text NOT NULL, actor_id integer NOT NULL REFERENCES public.users(id), actor_name text NOT NULL,
      request_id uuid, request_payload jsonb, before_config jsonb NOT NULL, after_config jsonb NOT NULL,
      effective_at timestamptz NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (actor_id, request_id)
    );
    CREATE OR REPLACE FUNCTION public.assert_plan_admin(p_actor_id integer)
    RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_actor_id AND upper(role) = 'ADMIN'
        AND is_active IS TRUE AND email_verified_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Admin required' USING ERRCODE = '42501';
      END IF;
    END; $$;
    CREATE OR REPLACE FUNCTION public.apply_due_agent_plan_changes()
    RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
    DECLARE v_plan public.agent_billing_plans%ROWTYPE; v_schedule public.agent_plan_schedules%ROWTYPE;
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM public.agent_plan_schedules WHERE status = 'SCHEDULED' AND effective_at <= now()) THEN RETURN; END IF;
      FOR v_plan IN SELECT * FROM public.agent_billing_plans ORDER BY code FOR UPDATE LOOP
        SELECT * INTO v_schedule FROM public.agent_plan_schedules
          WHERE plan_code = v_plan.code AND status = 'SCHEDULED' AND effective_at <= now() FOR UPDATE;
        IF FOUND THEN
          UPDATE public.agent_billing_plans SET amount_vnd = v_schedule.amount_vnd, duration_months = v_schedule.duration_months,
            active = v_schedule.active, version = version + 1, updated_at = now() WHERE code = v_plan.code;
          UPDATE public.agent_plan_schedules SET status = 'APPLIED', completed_at = now() WHERE id = v_schedule.id;
          INSERT INTO public.agent_plan_audit(plan_code, action, actor_id, actor_name, before_config, after_config, effective_at, reason)
            SELECT v_plan.code, 'APPLIED', v_schedule.actor_id, coalesce(u.name, 'Admin'), to_jsonb(v_plan),
              jsonb_build_object('amount_vnd', v_schedule.amount_vnd, 'duration_months', v_schedule.duration_months, 'active', v_schedule.active),
              v_schedule.effective_at, v_schedule.reason FROM public.users u WHERE u.id = v_schedule.actor_id;
        END IF;
      END LOOP;
    END; $$;
    CREATE OR REPLACE FUNCTION public.agent_service_catalog()
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
    DECLARE v_plans jsonb;
    BEGIN
      PERFORM public.apply_due_agent_plan_changes();
      SELECT coalesce(jsonb_agg(jsonb_build_object('code', b.code, 'name', b.name, 'description', c.description,
        'price_kind', 'FIXED', 'amount_vnd', b.amount_vnd, 'duration_months', b.duration_months, 'active', b.active, 'version', b.version,
        'listing_limit', b.listing_limit, 'priority_points', b.priority_points, 'support_tier', b.support_tier) ORDER BY c.sort_order), '[]'::jsonb)
        INTO v_plans FROM public.agent_billing_plans b JOIN public.agent_service_packages c USING(code) WHERE b.code IN ('LITE', 'PLUS', 'PRO');
      RETURN jsonb_build_object('plans', v_plans, 'snapshotAt', now());
    END; $$;
    CREATE OR REPLACE FUNCTION public.admin_agent_plan_catalog(p_actor_id integer)
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
    DECLARE v_catalog jsonb; v_pending jsonb;
    BEGIN
      PERFORM public.assert_plan_admin(p_actor_id);
      v_catalog := public.agent_service_catalog();
      SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY effective_at), '[]'::jsonb) INTO v_pending
        FROM public.agent_plan_schedules s WHERE status = 'SCHEDULED';
      RETURN v_catalog || jsonb_build_object('pending', v_pending);
    END; $$;
    CREATE OR REPLACE FUNCTION public.admin_change_agent_plan(
      p_actor_id integer, p_request_id uuid, p_expected_version integer, p_amount integer, p_duration integer, p_active boolean,
      p_effective_at timestamptz, p_reason text, p_action text DEFAULT 'SAVE', p_plan_code text DEFAULT NULL)
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
    DECLARE v_plan public.agent_billing_plans%ROWTYPE; v_previous public.agent_plan_audit%ROWTYPE;
      v_schedule public.agent_plan_schedules%ROWTYPE; v_payload jsonb; v_after jsonb; v_action text; v_actor_name text;
    BEGIN
      PERFORM public.assert_plan_admin(p_actor_id);
      IF p_plan_code IS NULL OR p_plan_code NOT IN ('LITE', 'PLUS', 'PRO') THEN RAISE EXCEPTION 'Invalid plan' USING ERRCODE = '22023'; END IF;
      PERFORM public.apply_due_agent_plan_changes();
      SELECT * INTO STRICT v_plan FROM public.agent_billing_plans WHERE code = p_plan_code FOR UPDATE;
      v_payload := jsonb_build_object('planCode', p_plan_code, 'expectedVersion', p_expected_version, 'amount', p_amount,
        'duration', p_duration, 'active', p_active, 'effectiveAt', p_effective_at, 'reason', p_reason, 'action', p_action);
      SELECT * INTO v_previous FROM public.agent_plan_audit WHERE actor_id = p_actor_id AND request_id = p_request_id;
      IF FOUND THEN
        IF v_previous.request_payload IS DISTINCT FROM v_payload THEN RAISE EXCEPTION 'Request reused' USING ERRCODE = '23505'; END IF;
        RETURN public.admin_agent_plan_catalog(p_actor_id);
      END IF;
      IF p_expected_version IS DISTINCT FROM v_plan.version THEN RAISE EXCEPTION 'Stale plan' USING ERRCODE = '40001'; END IF;
      SELECT * INTO v_schedule FROM public.agent_plan_schedules WHERE plan_code = p_plan_code AND status = 'SCHEDULED' FOR UPDATE;
      IF p_action = 'CANCEL' THEN
        IF v_schedule.id IS NULL THEN RAISE EXCEPTION 'No pending schedule' USING ERRCODE = '23505'; END IF;
        UPDATE public.agent_plan_schedules SET status = 'CANCELLED', completed_at = now() WHERE id = v_schedule.id;
        v_action := 'CANCELLED'; v_after := to_jsonb(v_plan);
      ELSE
        IF v_schedule.id IS NOT NULL THEN RAISE EXCEPTION 'Cancel existing schedule first' USING ERRCODE = '23505'; END IF;
        v_after := jsonb_build_object('amount_vnd', p_amount, 'duration_months', p_duration, 'active', p_active);
        IF p_effective_at IS NOT NULL THEN
          INSERT INTO public.agent_plan_schedules(plan_code, amount_vnd, duration_months, active, effective_at, actor_id, reason)
            VALUES(p_plan_code, p_amount, p_duration, p_active, p_effective_at, p_actor_id, btrim(p_reason));
          v_action := 'SCHEDULED';
        ELSE
          UPDATE public.agent_billing_plans SET amount_vnd = p_amount, duration_months = p_duration, active = p_active WHERE code = p_plan_code;
          v_action := 'UPDATED';
        END IF;
      END IF;
      UPDATE public.agent_billing_plans SET version = version + 1, updated_at = now() WHERE code = p_plan_code;
      SELECT coalesce(name, 'Admin') INTO v_actor_name FROM public.users WHERE id = p_actor_id;
      INSERT INTO public.agent_plan_audit(plan_code, action, actor_id, actor_name, request_id, request_payload, before_config, after_config, effective_at, reason)
        VALUES(p_plan_code, v_action, p_actor_id, v_actor_name, p_request_id, v_payload, to_jsonb(v_plan), v_after, coalesce(p_effective_at, now()), btrim(p_reason));
      RETURN public.admin_agent_plan_catalog(p_actor_id);
    END; $$;
    CREATE OR REPLACE FUNCTION public.admin_agent_plan_history(p_actor_id integer, p_page integer DEFAULT 1, p_limit integer DEFAULT 10)
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
    DECLARE v_items jsonb; v_total bigint;
    BEGIN
      PERFORM public.assert_plan_admin(p_actor_id);
      SELECT count(*) INTO v_total FROM public.agent_plan_audit;
      SELECT coalesce(jsonb_agg(to_jsonb(a) - 'request_payload' - 'request_id' ORDER BY created_at DESC, id DESC), '[]'::jsonb) INTO v_items
        FROM (SELECT * FROM public.agent_plan_audit ORDER BY created_at DESC, id DESC LIMIT p_limit OFFSET (p_page - 1) * p_limit) a;
      RETURN jsonb_build_object('items', v_items, 'total', v_total, 'page', p_page, 'limit', p_limit);
    END; $$;

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

  // Áp dụng migration 030 thật để dev server dùng đúng các hàm quản lý giá gói người dùng.
  await db.exec(fs.readFileSync(path.join(__dirname, '../db-migration/030-admin-user-plus-pricing.sql'), 'utf8'));

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
