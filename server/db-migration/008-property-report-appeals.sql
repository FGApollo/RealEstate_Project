-- Migration 008: Create property_report_appeals table for Feature 48 (Violation Appeal & Dispute)
CREATE TABLE IF NOT EXISTS public.property_report_appeals (
  id SERIAL PRIMARY KEY,
  report_id integer NOT NULL UNIQUE REFERENCES public.property_reports(id) ON DELETE CASCADE,
  agent_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  evidence_url text,
  status character varying DEFAULT 'PENDING' CHECK (status::text = ANY (ARRAY['PENDING'::character varying, 'APPROVED'::character varying, 'REJECTED'::character varying]::text[])),
  admin_note text,
  handled_by integer REFERENCES public.users(id),
  handled_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_property_report_appeals_agent_id ON public.property_report_appeals(agent_id);
CREATE INDEX IF NOT EXISTS idx_property_report_appeals_report_id ON public.property_report_appeals(report_id);
CREATE INDEX IF NOT EXISTS idx_property_report_appeals_status ON public.property_report_appeals(status);
