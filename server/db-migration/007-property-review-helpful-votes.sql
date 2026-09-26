-- Migration: Add property_review_helpful_votes table
-- Enables persistent helpful voting on property and agent reviews

CREATE TABLE IF NOT EXISTS public.property_review_helpful_votes (
  id SERIAL PRIMARY KEY,
  review_id integer NOT NULL,
  user_id integer NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT property_review_helpful_votes_review_id_fkey FOREIGN KEY (review_id) 
      REFERENCES public.property_reviews(id) ON DELETE CASCADE,
  CONSTRAINT property_review_helpful_votes_user_id_fkey FOREIGN KEY (user_id) 
      REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT property_review_helpful_votes_unique_user_review UNIQUE (review_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_helpful_votes_review_id 
  ON public.property_review_helpful_votes(review_id);

CREATE INDEX IF NOT EXISTS idx_helpful_votes_user_id 
  ON public.property_review_helpful_votes(user_id);
