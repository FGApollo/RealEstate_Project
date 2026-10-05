BEGIN;

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS listing_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.properties'::regclass
      AND conname = 'properties_listing_type_check'
  ) THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT properties_listing_type_check
      CHECK (listing_type IS NULL OR listing_type IN ('RENT', 'SALE'));
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id integer PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  listing_type text NOT NULL CHECK (listing_type IN ('RENT', 'SALE')),
  preferred_property_types text[] NOT NULL DEFAULT '{}',
  preferred_location_keys text[] NOT NULL DEFAULT '{}',
  min_price bigint,
  max_price bigint,
  min_bedrooms integer,
  max_bedrooms integer,
  min_area numeric(10, 2),
  max_area numeric(10, 2),
  preferred_features text[] NOT NULL DEFAULT '{}',
  onboarding_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (min_price IS NULL OR max_price IS NULL OR min_price <= max_price),
  CHECK (min_bedrooms IS NULL OR max_bedrooms IS NULL OR min_bedrooms <= max_bedrooms),
  CHECK (min_area IS NULL OR max_area IS NULL OR min_area <= max_area)
);

CREATE TABLE IF NOT EXISTS public.user_property_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  property_id integer NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('LIKE', 'DISLIKE', 'VIEW', 'FAVORITE', 'UNFAVORITE')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS properties_active_recommendation_idx
  ON public.properties (listing_type, id DESC)
  WHERE status = 'AVAILABLE';
CREATE INDEX IF NOT EXISTS property_features_property_id_idx
  ON public.property_features (property_id);
CREATE INDEX IF NOT EXISTS lifestyle_tags_property_id_idx
  ON public.lifestyle_tags (property_id);
CREATE INDEX IF NOT EXISTS user_property_events_user_time_idx
  ON public.user_property_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_property_events_user_property_time_idx
  ON public.user_property_events (user_id, property_id, created_at DESC);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_property_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_preferences FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.user_property_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.user_preferences, public.user_property_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.user_property_events_id_seq TO service_role;

COMMIT;
