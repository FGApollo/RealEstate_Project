-- Production operations setup: run in the hosted Supabase SQL Editor as postgres.
-- This is deliberately outside the numbered application migrations: dev databases
-- must not start additional jobs against the production backend.
-- The named job is updated on rerun, rather than duplicated.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.schedule(
  'swipe-nest-backend-keep-alive',
  '*/5 * * * *',
  $job$
    SELECT net.http_get(
      url := 'https://realestate-project-2u79.onrender.com/api/health',
      params := jsonb_build_object('source', 'supabase-cron', 'at', now()::text),
      headers := '{"Cache-Control":"no-cache"}'::jsonb,
      timeout_milliseconds := 90000
    );
  $job$
);

COMMIT;
