-- Migration: Add property_review_replies table
-- Enables persistent broker/owner replies to property reviews

CREATE TABLE IF NOT EXISTS public.property_review_replies (
  id SERIAL PRIMARY KEY,
  review_id integer NOT NULL,
  user_id integer NOT NULL,
  reply_text text NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT property_review_replies_review_id_fkey FOREIGN KEY (review_id) 
      REFERENCES public.property_reviews(id) ON DELETE CASCADE,
  CONSTRAINT property_review_replies_user_id_fkey FOREIGN KEY (user_id) 
      REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_review_replies_review_id 
  ON public.property_review_replies(review_id);

ALTER TABLE public.property_review_replies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.property_review_replies FROM anon, authenticated;
