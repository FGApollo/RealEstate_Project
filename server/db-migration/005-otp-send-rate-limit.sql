-- Shared, atomic per-phone quota for billable OTP sends.
-- The application stores only an HMAC of the phone number in this table.
CREATE TABLE IF NOT EXISTS public.otp_send_rate_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  phone_hash text NOT NULL CHECK (phone_hash ~ '^[0-9a-f]{64}$'),
  sent_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS otp_send_rate_events_phone_time_idx
  ON public.otp_send_rate_events (phone_hash, sent_at DESC);

CREATE INDEX IF NOT EXISTS otp_send_rate_events_time_idx
  ON public.otp_send_rate_events (sent_at);

ALTER TABLE public.otp_send_rate_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.otp_send_rate_events FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reserve_phone_otp_send(
  p_phone_hash text,
  p_global_hash text,
  p_max_per_hour integer,
  p_max_per_day integer,
  p_max_global_per_day integer,
  p_cooldown_seconds integer DEFAULT 60
)
RETURNS TABLE (allowed boolean, retry_after_seconds integer, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_hour_count integer;
  v_day_count integer;
  v_global_day_count integer;
  v_latest timestamptz;
  v_oldest_hour timestamptz;
  v_oldest_day timestamptz;
  v_oldest_global_day timestamptz;
  v_retry integer;
BEGIN
  IF p_phone_hash IS NULL OR p_phone_hash !~ '^[0-9a-f]{64}$'
    OR p_global_hash IS NULL OR p_global_hash !~ '^[0-9a-f]{64}$'
    OR p_max_per_hour < 1 OR p_max_per_day < 1 OR p_max_global_per_day < 1
    OR p_cooldown_seconds < 0 THEN
    RAISE EXCEPTION 'Invalid OTP quota parameters';
  END IF;

  -- Lock the global quota first, then the phone quota, in a consistent order.
  -- This is a cost guard shared across app instances.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_global_hash, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_phone_hash, 0));

  -- Keep the event ledger bounded to the longest enforced rolling window.
  -- A non-blocking global lock avoids concurrent cleanup deletes racing each other.
  IF pg_try_advisory_xact_lock(hashtextextended('otp_send_rate_events_cleanup', 0)) THEN
    DELETE FROM public.otp_send_rate_events
    WHERE sent_at < v_now - INTERVAL '24 hours';
  END IF;

  SELECT
    count(*) FILTER (WHERE sent_at >= v_now - INTERVAL '1 hour')::integer,
    count(*)::integer,
    max(sent_at),
    min(sent_at) FILTER (WHERE sent_at >= v_now - INTERVAL '1 hour'),
    min(sent_at)
  INTO v_hour_count, v_day_count, v_latest, v_oldest_hour, v_oldest_day
  FROM public.otp_send_rate_events
  WHERE phone_hash = p_phone_hash
    AND sent_at >= v_now - INTERVAL '24 hours';

  SELECT count(*)::integer, min(sent_at)
  INTO v_global_day_count, v_oldest_global_day
  FROM public.otp_send_rate_events
  WHERE phone_hash = p_global_hash
    AND sent_at >= v_now - INTERVAL '24 hours';

  IF v_latest IS NOT NULL AND v_latest > v_now - make_interval(secs => p_cooldown_seconds) THEN
    v_retry := greatest(1, ceil(extract(epoch FROM
      (v_latest + make_interval(secs => p_cooldown_seconds) - v_now)))::integer);
    RETURN QUERY SELECT false, v_retry, 'COOLDOWN'::text;
    RETURN;
  END IF;

  IF v_hour_count >= p_max_per_hour THEN
    v_retry := greatest(1, ceil(extract(epoch FROM
      (v_oldest_hour + INTERVAL '1 hour' - v_now)))::integer);
    RETURN QUERY SELECT false, v_retry, 'HOURLY_LIMIT'::text;
    RETURN;
  END IF;

  IF v_day_count >= p_max_per_day THEN
    v_retry := greatest(1, ceil(extract(epoch FROM
      (v_oldest_day + INTERVAL '24 hours' - v_now)))::integer);
    RETURN QUERY SELECT false, v_retry, 'DAILY_LIMIT'::text;
    RETURN;
  END IF;

  IF v_global_day_count >= p_max_global_per_day THEN
    v_retry := greatest(1, ceil(extract(epoch FROM
      (v_oldest_global_day + INTERVAL '24 hours' - v_now)))::integer);
    RETURN QUERY SELECT false, v_retry, 'GLOBAL_DAILY_LIMIT'::text;
    RETURN;
  END IF;

  INSERT INTO public.otp_send_rate_events (phone_hash, sent_at)
  VALUES (p_phone_hash, v_now);
  INSERT INTO public.otp_send_rate_events (phone_hash, sent_at)
  VALUES (p_global_hash, v_now);

  RETURN QUERY SELECT true, 0, 'RESERVED'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_phone_otp_send(text, text, integer, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_phone_otp_send(text, text, integer, integer, integer, integer)
  TO service_role;
