-- 029: Tối ưu hiệu năng truy vấn & chỉ mục (auth refresh 1 vòng mạng, search_ranked_properties không tính
-- search_features thừa / đẩy bộ lọc official & khu vực xuống SQL, đếm favorites bằng GROUP BY, phân trang
-- Plus analytics trong SQL, và các chỉ mục còn thiếu cho favorites, messages, property_reviews, property_links).
--
-- Chạy lại nhiều lần hoàn toàn an toàn (idempotent). Yêu cầu 026.
-- Mã backend vẫn tương thích ngược hoàn toàn nếu migration 029 chưa được chạy trên môi trường production.
BEGIN;

-- ---------- 1. Chuẩn hóa tên địa danh khớp server/services/locationText.js ----------
CREATE OR REPLACE FUNCTION public.listing_normalized_location(p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_text text;
  v_prefix text;
  v_rest text;
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN
    RETURN '';
  END IF;

  v_text := translate(
    lower(normalize(p_value, NFC)),
    'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ',
    'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
  );
  v_text := btrim(regexp_replace(v_text, '[^a-z0-9]+', ' ', 'g'));
  v_text := regexp_replace(v_text, '^(q|p)([0-9]+)$', '\1 \2');

  v_text := CASE v_text
    WHEN 'hcm' THEN 'ho chi minh'
    WHEN 'tphcm' THEN 'ho chi minh'
    WHEN 'tp hcm' THEN 'ho chi minh'
    WHEN 'sg' THEN 'ho chi minh'
    WHEN 'hn' THEN 'ha noi'
    WHEN 'tphn' THEN 'ha noi'
    WHEN 'dn' THEN 'da nang'
    ELSE v_text
  END;

  IF v_text ~ '^(thanh pho|tp|tinh|thi xa|thi tran|dac khu|quan|q|huyen|phuong|p|xa) .+$' THEN
    v_prefix := substring(v_text FROM '^(thanh pho|tp|tinh|thi xa|thi tran|dac khu|quan|q|huyen|phuong|p|xa) ');
    v_rest := substring(v_text FROM '^(?:thanh pho|tp|tinh|thi xa|thi tran|dac khu|quan|q|huyen|phuong|p|xa) (.+)$');
    IF v_rest ~ '^[0-9]+$' THEN
      v_text := CASE v_prefix
        WHEN 'q' THEN 'quan ' || v_rest
        WHEN 'quan' THEN 'quan ' || v_rest
        WHEN 'p' THEN 'phuong ' || v_rest
        WHEN 'phuong' THEN 'phuong ' || v_rest
        ELSE v_prefix || ' ' || v_rest
      END;
    ELSE
      v_text := v_rest;
    END IF;
  END IF;

  v_text := CASE v_text
    WHEN 'hcm' THEN 'ho chi minh'
    WHEN 'tphcm' THEN 'ho chi minh'
    WHEN 'tp hcm' THEN 'ho chi minh'
    WHEN 'sg' THEN 'ho chi minh'
    WHEN 'hn' THEN 'ha noi'
    WHEN 'tphn' THEN 'ha noi'
    WHEN 'dn' THEN 'da nang'
    ELSE v_text
  END;

  RETURN v_text;
END;
$$;

-- ---------- 2. Xoay vòng refresh token + đọc user + trạng thái onboarding trong 1 vòng mạng ----------
CREATE OR REPLACE FUNCTION public.rotate_auth_session(p_old_hash text, p_new_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET statement_timeout = '8s'
AS $$
DECLARE
  v_session record;
  v_user record;
  v_role text;
  v_onboarding_completed boolean := NULL;
BEGIN
  IF p_old_hash IS NULL OR p_new_hash IS NULL OR length(p_old_hash) <> 64 OR length(p_new_hash) <> 64 THEN
    RETURN NULL;
  END IF;

  SELECT s.id, s.user_id, s.expires_at, s.revoked_at
  INTO v_session
  FROM public.auth_sessions s
  WHERE s.refresh_token_hash = p_old_hash
  FOR UPDATE;

  IF NOT FOUND OR v_session.revoked_at IS NOT NULL OR v_session.expires_at IS NULL OR v_session.expires_at <= now() THEN
    RETURN NULL;
  END IF;

  SELECT
    u.id, u.name, u.email, u.avatar, u.role, u.phone, u.phone_verified,
    u.email_verified_at, u.verification_status, u.trust_score, u.is_active,
    coalesce((to_jsonb(u) ->> 'is_official')::boolean, false) AS is_official
  INTO v_user
  FROM public.users u
  WHERE u.id = v_session.user_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_role := upper(btrim(coalesce(v_user.role, '')));
  IF v_user.is_active IS NOT TRUE OR v_user.email_verified_at IS NULL OR v_role NOT IN ('USER', 'AGENT', 'ADMIN') THEN
    RETURN NULL;
  END IF;

  UPDATE public.auth_sessions
  SET refresh_token_hash = p_new_hash,
      rotated_at = now()
  WHERE id = v_session.id
    AND refresh_token_hash = p_old_hash
    AND revoked_at IS NULL
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_role = 'USER' AND to_regclass('public.user_preferences') IS NOT NULL THEN
    SELECT coalesce(up.onboarding_completed, false)
    INTO v_onboarding_completed
    FROM public.user_preferences up
    WHERE up.user_id = v_user.id;
    IF NOT FOUND THEN
      v_onboarding_completed := false;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'session_id', v_session.id,
    'onboarding_completed', v_onboarding_completed,
    'user', jsonb_build_object(
      'id', v_user.id,
      'name', v_user.name,
      'email', v_user.email,
      'avatar', v_user.avatar,
      'role', v_role,
      'phone', v_user.phone,
      'phone_verified', v_user.phone_verified,
      'email_verified_at', v_user.email_verified_at,
      'verification_status', v_user.verification_status,
      'trust_score', v_user.trust_score,
      'is_active', v_user.is_active,
      'is_official', v_user.is_official
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_auth_session(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_auth_session(text, text) TO service_role;

-- ---------- 3. Tối ưu search_ranked_properties (không tính search_features khi không lọc, đẩy official/khu vực/offset xuống SQL, bỏ 4 correlated subqueries) ----------
DROP FUNCTION IF EXISTS public.search_ranked_properties(jsonb, text, text, integer, integer[]);
DROP FUNCTION IF EXISTS public.search_ranked_properties(jsonb, text, text, integer, integer[], integer);

CREATE OR REPLACE FUNCTION public.search_ranked_properties(
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_listing_type text DEFAULT NULL::text,
  p_category text DEFAULT NULL::text,
  p_limit integer DEFAULT 24,
  p_ids integer[] DEFAULT NULL::integer[],
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
SET statement_timeout TO '8s'
AS $$
DECLARE
  v_items jsonb;
  v_official_only boolean;
  v_sort_by_priority boolean;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000
    OR p_offset IS NULL OR p_offset < 0 OR p_offset > 10000
    OR p_filters IS NULL OR jsonb_typeof(p_filters) <> 'object'
    OR cardinality(p_ids) > 500 THEN
    RAISE EXCEPTION 'Invalid search' USING ERRCODE = '22023';
  END IF;

  v_official_only := coalesce((p_filters ->> 'official')::boolean, false);
  v_sort_by_priority := coalesce((p_filters ->> 'sortByPriority')::boolean, false);

  WITH current_entitlements AS (
    SELECT DISTINCT ON (s.user_id) s.user_id, s.priority_points, s.listing_limit
    FROM public.seller_subscriptions s
    WHERE s.status = 'ACTIVE'
      AND s.start_date <= now() AT TIME ZONE 'UTC'
      AND s.end_date > now() AT TIME ZONE 'UTC'
    ORDER BY s.user_id, s.start_date DESC, s.id DESC
  ),
  eligible AS (
    SELECT
      p.*,
      coalesce(e.priority_points, 0) + coalesce(p.priority_score, 0) AS display_priority,
      public.listing_property_type_key(p.property_type) AS property_type_key,
      u.name AS owner_name,
      u.role AS owner_role,
      u.avatar AS owner_avatar,
      u.trust_score AS owner_trust_score,
      u.verification_status AS owner_verification_status,
      u.created_at AS owner_created_at,
      u.is_official AS owner_is_official
    FROM public.users u
    LEFT JOIN current_entitlements e ON e.user_id = u.id
    CROSS JOIN LATERAL (
      SELECT listing.*
      FROM public.properties listing
      WHERE listing.owner_id = u.id
        AND listing.status = 'AVAILABLE'
        AND listing.is_hidden IS NOT TRUE
        AND listing.is_public IS TRUE
      ORDER BY listing.id DESC
      LIMIT CASE WHEN u.is_official THEN NULL ELSE e.listing_limit END
    ) p
    WHERE u.is_active IS TRUE
      AND u.role = 'AGENT'
      AND (u.verification_status = 'VERIFIED' OR u.is_official IS TRUE)
      AND coalesce(u.trust_score, 50) > 30
      AND (NOT v_official_only OR u.is_official IS TRUE)
  ),
  candidates AS (
    SELECT p.*
    FROM eligible p
    WHERE (p_ids IS NULL OR p.id = ANY(p_ids))
      AND (p_listing_type IS NULL OR p.listing_type = p_listing_type OR p.listing_type IS NULL)
      AND (p_category IS NULL OR p.property_type_key = public.listing_property_type_key(p_category))
      AND (NOT p_filters ? 'categories' OR p_filters -> 'categories' ? p.property_type_key)
      AND (NOT p_filters ? 'wards' OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(p_filters -> 'wards') w
        WHERE public.listing_location_key(w) = public.listing_location_key(p.ward)
      ))
      AND (NOT p_filters ? 'city' OR public.listing_location_key(p.city) = public.listing_location_key(p_filters ->> 'city'))
      AND (NOT p_filters ? 'cities' OR p_filters -> 'cities' ? public.listing_normalized_location(p.city))
      AND (NOT p_filters ? 'district' OR public.listing_location_key(p.district) = public.listing_location_key(p_filters ->> 'district'))
      AND (NOT p_filters ? 'wardFilter' OR (
        public.listing_normalized_location(p.ward) = (p_filters -> 'wardFilter' ->> 'wardKey')
        OR (
          (p_filters -> 'wardFilter' ? 'legacyPairs')
          AND (p_filters -> 'wardFilter' -> 'legacyPairs') ? (
            public.listing_normalized_location(p.ward) || '|' || public.listing_normalized_location(p.district)
          )
        )
        OR (
          coalesce((p_filters -> 'wardFilter' ->> 'allowUnmappedDistrict')::boolean, false) IS TRUE
          AND public.listing_normalized_location(p.district) = (p_filters -> 'wardFilter' ->> 'wardKey')
          AND NOT (
            (p_filters -> 'wardFilter' ? 'excludedDistrictWards')
            AND (p_filters -> 'wardFilter' -> 'excludedDistrictWards') ? public.listing_normalized_location(p.ward)
          )
        )
      ))
      AND (NOT p_filters ? 'listingType' OR p.listing_type = p_filters ->> 'listingType')
      AND (NOT p_filters ? 'minPrice' OR p.price >= (p_filters ->> 'minPrice')::numeric)
      AND (NOT p_filters ? 'maxPrice' OR p.price <= (p_filters ->> 'maxPrice')::numeric)
      AND (NOT p_filters ? 'minArea' OR p.area >= (p_filters ->> 'minArea')::numeric)
      AND (NOT p_filters ? 'maxArea' OR p.area <= (p_filters ->> 'maxArea')::numeric)
      AND (NOT p_filters ? 'bedrooms' OR p_filters -> 'bedrooms' ? p.bedrooms::text OR (p_filters -> 'bedrooms' ? '4+' AND p.bedrooms >= 4))
      AND (NOT p_filters ? 'features' OR NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(p_filters -> 'features') f(val)
        WHERE NOT EXISTS (
          SELECT 1 FROM public.property_features pf
          WHERE pf.property_id = p.id AND lower(pf.feature_name) = lower(f.val)
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.lifestyle_tags lt
          WHERE lt.property_id = p.id AND lower(lt.tag_name) = lower(f.val)
        )
      ))
      AND (NOT p_filters ? 'adminChecked' OR EXISTS (
        SELECT 1 FROM public.property_admin_checks c WHERE c.property_id = p.id
      ))
    ORDER BY
      CASE WHEN p_ids IS NOT NULL AND NOT v_sort_by_priority THEN array_position(p_ids, p.id) END,
      p.display_priority DESC,
      p.id DESC
    LIMIT p_limit
    OFFSET p_offset
  ),
  pf_agg AS (
    SELECT pf.property_id, jsonb_agg(jsonb_build_object('feature_name', pf.feature_name)) AS items
    FROM public.property_features pf
    WHERE pf.property_id IN (SELECT id FROM candidates)
    GROUP BY pf.property_id
  ),
  pi_agg AS (
    SELECT pi.property_id, jsonb_agg(jsonb_build_object('image_url', pi.image_url)) AS items
    FROM public.property_images pi
    WHERE pi.property_id IN (SELECT id FROM candidates)
    GROUP BY pi.property_id
  ),
  lt_agg AS (
    SELECT lt.property_id, jsonb_agg(jsonb_build_object('tag_name', lt.tag_name)) AS items
    FROM public.lifestyle_tags lt
    WHERE lt.property_id IN (SELECT id FROM candidates)
    GROUP BY lt.property_id
  ),
  pac_ids AS (
    SELECT c.property_id
    FROM public.property_admin_checks c
    WHERE c.property_id IN (SELECT id FROM candidates)
  )
  SELECT coalesce(jsonb_agg(item ORDER BY position, display_priority DESC, id DESC), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      p.id,
      p.display_priority,
      CASE WHEN p_ids IS NOT NULL AND NOT v_sort_by_priority THEN array_position(p_ids, p.id) END AS position,
      (to_jsonb(p)
        - 'property_type_key'
        - 'owner_name'
        - 'owner_role'
        - 'owner_avatar'
        - 'owner_trust_score'
        - 'owner_verification_status'
        - 'owner_created_at'
        - 'owner_is_official'
      ) || jsonb_build_object(
        'owner', jsonb_build_object(
          'name', p.owner_name,
          'role', p.owner_role,
          'avatar', p.owner_avatar,
          'trust_score', p.owner_trust_score,
          'verification_status', p.owner_verification_status,
          'created_at', p.owner_created_at,
          'is_official', p.owner_is_official
        ),
        'admin_checked', (pac.property_id IS NOT NULL),
        'property_features', coalesce(pf.items, '[]'::jsonb),
        'property_images', coalesce(pi.items, '[]'::jsonb),
        'lifestyle_tags', coalesce(lt.items, '[]'::jsonb)
      ) AS item
    FROM candidates p
    LEFT JOIN pf_agg pf ON pf.property_id = p.id
    LEFT JOIN pi_agg pi ON pi.property_id = p.id
    LEFT JOIN lt_agg lt ON lt.property_id = p.id
    LEFT JOIN pac_ids pac ON pac.property_id = p.id
  ) rows;

  RETURN v_items;
END;
$$;

REVOKE ALL ON FUNCTION public.search_ranked_properties(jsonb, text, text, integer, integer[], integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_ranked_properties(jsonb, text, text, integer, integer[], integer) TO service_role;

-- ---------- 4. Đếm lượt yêu thích theo nhóm trong SQL (thay vì kéo toàn bộ bảng favorites về Node.js) ----------
CREATE OR REPLACE FUNCTION public.count_property_favorites(p_property_ids integer[])
RETURNS TABLE(property_id integer, favorite_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET statement_timeout = '8s'
AS $$
  SELECT f.property_id, count(*)::bigint AS favorite_count
  FROM public.favorites f
  WHERE f.property_id = ANY(p_property_ids)
  GROUP BY f.property_id;
$$;

REVOKE ALL ON FUNCTION public.count_property_favorites(integer[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_property_favorites(integer[]) TO service_role;

-- ---------- 5. Phân trang khách hàng Plus đang hoạt động ngay trong SQL (thay vì quét 50.000 dòng) ----------
CREATE OR REPLACE FUNCTION public.admin_analytics_active_plus_users(
  p_snapshot_at timestamptz,
  p_page integer DEFAULT 1,
  p_limit integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET statement_timeout = '8s'
AS $$
DECLARE
  v_page integer := greatest(1, coalesce(p_page, 1));
  v_limit integer := least(100, greatest(1, coalesce(p_limit, 10)));
  v_offset integer := (v_page - 1) * v_limit;
  v_total integer;
  v_items jsonb;
BEGIN
  IF p_snapshot_at IS NULL THEN
    RAISE EXCEPTION 'Snapshot timestamp required' USING ERRCODE = '22023';
  END IF;

  WITH eligible AS (
    SELECT
      s.id,
      s.user_id,
      coalesce(nullif(btrim(s.plan_code), ''), 'USER_PLUS') AS plan_code,
      CASE WHEN upper(coalesce(s.source, '')) = 'ADMIN' THEN 'ADMIN' ELSE 'PAYOS' END AS source,
      s.start_date,
      s.end_date,
      s.created_at,
      u.name AS user_name,
      u.email AS user_email,
      u.is_active AS account_active
    FROM public.user_subscriptions s
    JOIN public.users u ON u.id = s.user_id
    WHERE upper(coalesce(u.role, '')) = 'USER'
      AND (u.created_at IS NULL OR u.created_at < p_snapshot_at)
      AND (s.created_at IS NULL OR s.created_at < p_snapshot_at)
      AND upper(coalesce(s.status, '')) = 'ACTIVE'
      AND s.start_date IS NOT NULL
      AND s.end_date IS NOT NULL
      AND s.end_date > p_snapshot_at
  ),
  per_user_agg AS (
    SELECT
      user_id,
      count(*)::integer AS active_periods,
      max(end_date) AS effective_end
    FROM eligible
    GROUP BY user_id
  ),
  current_period AS (
    SELECT DISTINCT ON (user_id)
      user_id,
      plan_code,
      source,
      start_date,
      user_name,
      user_email,
      account_active
    FROM eligible
    WHERE start_date <= p_snapshot_at
    ORDER BY user_id, start_date DESC, created_at DESC NULLS LAST, id DESC
  ),
  combined AS (
    SELECT
      cp.user_id,
      coalesce(nullif(btrim(cp.user_name), ''), 'Khách hàng #' || cp.user_id::text) AS name,
      cp.user_email AS email,
      cp.account_active,
      coalesce(nullif(btrim(bp.name), ''), 'Swipe Nest Plus') AS plan_name,
      cp.source,
      agg.active_periods,
      cp.start_date,
      agg.effective_end
    FROM current_period cp
    JOIN per_user_agg agg ON agg.user_id = cp.user_id
    LEFT JOIN public.user_billing_plans bp ON bp.code = cp.plan_code
  ),
  paged AS (
    SELECT *
    FROM combined
    ORDER BY effective_end ASC, user_id ASC
    LIMIT v_limit
    OFFSET v_offset
  )
  SELECT
    (SELECT count(*)::integer FROM combined),
    coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'userId', p.user_id,
            'name', p.name,
            'email', p.email,
            'accountActive', p.account_active,
            'planName', p.plan_name,
            'source', p.source,
            'activePeriods', p.active_periods,
            'startDate', to_char(p.start_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'endDate', to_char(p.effective_end AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          )
          ORDER BY p.effective_end ASC, p.user_id ASC
        )
        FROM paged p
      ),
      '[]'::jsonb
    )
  INTO v_total, v_items;

  RETURN jsonb_build_object(
    'snapshotAt', to_char(p_snapshot_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'timeZone', 'Asia/Ho_Chi_Minh',
    'total', coalesce(v_total, 0),
    'page', v_page,
    'limit', v_limit,
    'items', coalesce(v_items, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_analytics_active_plus_users(timestamptz, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_active_plus_users(timestamptz, integer, integer) TO service_role;

-- ---------- 6. Chỉ mục còn thiếu cho các truy vấn nóng ----------
DO $$
BEGIN
  IF to_regclass('public.favorites') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS favorites_property_id_idx ON public.favorites (property_id);
    CREATE INDEX IF NOT EXISTS favorites_user_property_idx ON public.favorites (user_id, property_id);
  END IF;

  IF to_regclass('public.messages') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS messages_sender_receiver_created_idx
      ON public.messages (sender_id, receiver_id, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS messages_receiver_sender_created_idx
      ON public.messages (receiver_id, sender_id, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS messages_receiver_unread_idx
      ON public.messages (receiver_id, sender_id) WHERE is_read IS FALSE;
  END IF;

  IF to_regclass('public.property_reviews') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS property_reviews_property_status_created_idx
      ON public.property_reviews (property_id, status, created_at DESC);
  END IF;

  IF to_regclass('public.property_review_images') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS property_review_images_review_idx
      ON public.property_review_images (review_id);
  END IF;

  IF to_regclass('public.property_review_replies') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS property_review_replies_review_idx
      ON public.property_review_replies (review_id);
  END IF;

  IF to_regclass('public.property_review_helpful_votes') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS property_review_helpful_votes_review_user_idx
      ON public.property_review_helpful_votes (review_id, user_id);
  END IF;

  IF to_regclass('public.property_links') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS property_links_property_id_2_idx
      ON public.property_links (property_id_2);
  END IF;

  IF to_regclass('public.properties') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS properties_public_city_idx
      ON public.properties (public.listing_normalized_location(city), id DESC)
      WHERE status = 'AVAILABLE' AND is_hidden IS NOT TRUE AND is_public IS TRUE;
  END IF;

  IF to_regclass('public.users') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS users_official_agents_idx
      ON public.users (id) WHERE is_official IS TRUE AND is_active IS TRUE AND role = 'AGENT';
  END IF;

  IF to_regclass('public.user_subscriptions') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS user_subscriptions_active_end_idx
      ON public.user_subscriptions (status, end_date DESC, user_id) WHERE status = 'ACTIVE';
  END IF;

  IF to_regclass('public.agent_payment_orders') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS agent_payment_orders_audience_created_idx
      ON public.agent_payment_orders (audience, created_at DESC, id ASC);
  END IF;
END $$;

INSERT INTO public.app_schema_migrations (id) VALUES ('029') ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
COMMIT;
