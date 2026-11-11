-- 027: Dùng thử gói Lite miễn phí 1 tháng cho môi giới.
--
-- - Mỗi tài khoản một lần, chỉ dành cho môi giới CHƯA TỪNG có kỳ gói nào (đã mua, được admin cấp, hay dùng thử
--   FREE_TRIAL cũ đều không được dùng thử nữa).
-- - Môi giới tự bấm kích hoạt, không cần thanh toán. Quyền lợi lấy theo gói Lite hiện hành (số tin, điểm ưu tiên,
--   mức hỗ trợ); nếu admin tạm ngừng bán Lite thì cũng ngừng cho dùng thử.
-- - Kỳ dùng thử là một dòng seller_subscriptions bình thường (plan_name 'FREE_TRIAL', source 'TRIAL', giá 0),
--   nên các quy tắc của 023 vẫn áp dụng: mua Lite thì xếp sau kỳ dùng thử, mua Plus/Pro thì nâng cấp ngay.
-- Yêu cầu 018, 020, 023. Chạy lại nhiều lần vẫn an toàn. Không sửa dữ liệu hiện có.
BEGIN;

ALTER TABLE public.seller_subscriptions DROP CONSTRAINT IF EXISTS seller_subscriptions_source_check;
ALTER TABLE public.seller_subscriptions ADD CONSTRAINT seller_subscriptions_source_check
  CHECK (source IN ('PAYOS', 'ADMIN', 'TRIAL'));

-- Còn được dùng thử không: chưa từng có kỳ nào và gói Lite đang mở bán.
CREATE OR REPLACE FUNCTION public.agent_trial_available(p_user_id integer)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.seller_subscriptions WHERE user_id = p_user_id)
    AND EXISTS (SELECT 1 FROM public.agent_billing_plans WHERE code = 'LITE' AND active);
$$;

-- Thay bản "đã ngừng" của 018.
CREATE OR REPLACE FUNCTION public.start_agent_free_trial(p_user_id integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public SET timezone = 'UTC' SET statement_timeout = '8s' AS $$
DECLARE
  v_now timestamp := now() AT TIME ZONE 'UTC';
  v_plan public.agent_billing_plans%ROWTYPE;
  v_subscription public.seller_subscriptions%ROWTYPE;
BEGIN
  -- Khóa tài khoản: cùng thứ tự khóa với thanh toán / admin cấp gói, hai lần bấm đồng thời không tạo hai kỳ.
  PERFORM 1 FROM public.users WHERE id = p_user_id AND upper(role) = 'AGENT' AND is_active IS TRUE FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agent unavailable' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.seller_subscriptions WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'Trial not available' USING ERRCODE = '23505';
  END IF;
  PERFORM public.apply_due_agent_plan_changes();
  SELECT * INTO v_plan FROM public.agent_billing_plans WHERE code = 'LITE' AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lite plan unavailable' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.seller_subscriptions (user_id, plan_name, price_vnd, start_date, end_date, status, created_at,
      updated_at, listing_limit, priority_points, support_tier, source)
    VALUES (p_user_id, 'FREE_TRIAL', 0, v_now, v_now + interval '1 month', 'ACTIVE', v_now, v_now,
      v_plan.listing_limit, v_plan.priority_points, v_plan.support_tier, 'TRIAL')
    RETURNING * INTO v_subscription;
  RETURN to_jsonb(v_subscription);
END $$;

REVOKE ALL ON FUNCTION public.agent_trial_available(integer), public.start_agent_free_trial(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_trial_available(integer), public.start_agent_free_trial(integer) TO service_role;

INSERT INTO public.app_schema_migrations (id) VALUES ('027') ON CONFLICT (id) DO NOTHING;
NOTIFY pgrst, 'reload schema';
COMMIT;
