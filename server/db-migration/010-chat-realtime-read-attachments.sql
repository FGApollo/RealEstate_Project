-- 010-chat-realtime-read-attachments.sql
-- Combined migration for:
-- 1. Realtime chat read receipts and attachments
-- 2. Property soft-delete status support ('DELETED')

BEGIN;

-- 1. Chat Read Status & Attachments
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS read_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;

-- 2. Support soft-delete status 'DELETED' for agent listings
DO $$
BEGIN
  ALTER TABLE public.properties DROP CONSTRAINT IF EXISTS properties_status_check;
  ALTER TABLE public.properties ADD CONSTRAINT properties_status_check 
    CHECK (status::text = ANY (ARRAY['AVAILABLE'::text, 'SOLD'::text, 'RENTED'::text, 'PENDING'::text, 'DELETED'::text]));
END $$;

COMMIT;
